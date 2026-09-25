'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Info, X } from 'lucide-react';

import Modal from '@/components/Modal';
import { Tooltip } from '@/components/ui/tooltip';
import { ink, palette, radius } from '@/lib/theme';
import { DEFAULT_EXAM_QUESTIONS } from '@/lib/ingest/prompt';
import { questionCountFromHint } from '@/lib/ingest/resource';
import { getWorkshopFiles } from '@/app/actions/workshopFiles';
import { getWorkshopChapters } from '@/app/actions/workshopChapters';
import type { GenerationOrigin } from '@/lib/ingest/journal';

import { capacityOf, editGeneration, launchGeneration, useGenerations } from './generationStore';

// Le dialogue de génération par IA — **un seul composant pour tous les points
// d'entrée** (Ressources, Chapitre & Notion, et les deux listes de questions).
// Ce qui change d'un bouton à l'autre, ce sont les cases cochées au départ, pas
// le dialogue (§8 du plan d'ingestion).
//
// ─── Le dialogue ne fait que lancer (25/09/2026) ─────────────────────────────
//
// Il se ferme au clic sur « générer » : c'est le serveur qui enchaîne les étapes
// (docs/architecture.md §7.11), et c'est le bouton qui montre l'avancement, à
// partir de l'état partagé de l'onglet (`generationStore`). L'arrêt, l'alerte en
// cas d'échec et le rafraîchissement des listes vivent là-bas.

// ─── Champ de consigne : hauteur suivie, plancher de trois lignes ───────────
// Les mesures sont sorties du style pour que le plancher se CALCULE au lieu
// d'être un nombre choisi à l'œil : changer la taille du texte ou le retrait
// garde automatiquement les trois lignes promises.
const HINT_FONT_SIZE = 13;
const HINT_LINE_HEIGHT = 1.45;
const HINT_PAD_Y = 8;
const HINT_MIN_LINES = 3;
// `box-sizing: border-box` : la hauteur minimale comprend les retraits et le filet.
const HINT_MIN_HEIGHT = Math.round(HINT_MIN_LINES * HINT_FONT_SIZE * HINT_LINE_HEIGHT) + 2 * HINT_PAD_Y + 2;

/** Ce que l'API accepte aujourd'hui (§6). Les autres formats restent visibles
 *  mais non sélectionnables : mieux vaut le dire à la sélection qu'échouer au
 *  milieu d'une génération. */
function isSupported(mimeType: string): boolean {
  return mimeType === 'application/pdf' || mimeType.startsWith('text/');
}

export type DialogFile = { id: string; name: string; mimeType: string; size: number };

/** Le dialogue va chercher lui-même la liste des documents. Chaque écran qui
 *  l'ouvre n'a donc rien à lui fournir d'autre que l'atelier — et les Paramètres
 *  → Chapitre & Notion, qui ne connaissent pas les fichiers, l'ouvrent aussi
 *  simplement que les Ressources.
 *
 *  `refreshOn` : n'importe quelle valeur dont le **changement** relance la
 *  lecture — en pratique, l'état d'ouverture du dialogue. **À passer
 *  systématiquement.** Sans lui, la liste n'était lue qu'au montage du
 *  composant : or les sections des Paramètres sont montées en permanence
 *  (`display: contents/none`, cf. `.claude/rules/server-architecture.md`), donc
 *  ce montage n'a lieu **qu'une fois par visite de page**. Téléverser un
 *  document dans « Ressources » ne touchait pas cette liste — le bouton IA
 *  continuait d'ignorer les nouveaux fichiers et de proposer ceux qu'on venait
 *  de supprimer, jusqu'à ce qu'on recharge la page. Relire à l'ouverture couvre
 *  aussi les modifications faites ailleurs (autre onglet, autre gestionnaire).
 *
 *  La liste précédente reste en place pendant la relecture — on ne repasse
 *  jamais par `null`, et une lecture ratée ne vide pas une liste déjà obtenue :
 *  rouvrir le dialogue ne doit pas faire clignoter « aucun document » le temps
 *  d'un aller-retour serveur. */
export function useWorkshopFiles(workshopId: string, refreshOn?: unknown, waitFor = false): DialogFile[] | null {
  const [files, setFiles] = useState<DialogFile[] | null>(null);
  useEffect(() => {
    // ⚠️ **Next met les server actions à la queue leu leu** (07/09/2026) : la
    // liste des documents partait au montage de l'écran, donc DEVANT les données
    // que cet écran affiche — mesuré à 250-500 ms d'attente ajoutés à la liste
    // de questions, pour garnir un dialogue que l'on n'ouvrira peut-être jamais.
    // L'hôte peut donc la faire passer après ; elle reste chargée d'avance, le
    // dialogue s'ouvre toujours déjà rempli.
    if (waitFor) return;
    let cancelled = false;
    getWorkshopFiles(workshopId)
      .then((rows) => { if (!cancelled) setFiles(rows.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }))); })
      // `prev ?? []` et non `[]` : au premier chargement, l'échec doit sortir du
      // `null` (sinon le dialogue attend indéfiniment) ; sur une relecture, il
      // ne doit pas effacer la liste qu'on affichait déjà.
      .catch(() => { if (!cancelled) setFiles((prev) => prev ?? []); });
    return () => { cancelled = true; };
  }, [workshopId, refreshOn, waitFor]);
  return files;
}

type Props = {
  workshopId: string;
  files: DialogFile[];
  /** Contexte imposé quand on entre par une liste de questions ; `null` quand on
   *  entre par les Paramètres, où l'utilisateur choisit. */
  forcedContext?: 'parcours' | 'exam' | null;
  /** Par quelle porte l'utilisateur est entré. Sert au journal de bord et à rien
   *  d'autre : le dialogue se comporte exactement pareil d'un bouton à l'autre. */
  origin: GenerationOrigin;
  onClose: () => void;
  /** Sortie SANS lancer (annuler, croix). Absente, c'est `onClose` qui sert :
   *  seule la modification d'une génération en attente a besoin de distinguer —
   *  abandonner la remet dans la file, enregistrer la met à jour. */
  onCancel?: () => void;
  /** Où le dialogue est posé (07/09/2026).
   *
   *  `modal` (défaut) : la fenêtre flottante habituelle, avec son fond flouté et
   *  son piège à tabulation. `inline` : le MÊME contenu, sans coquille — il est
   *  alors rendu dans l'encadré de création d'une liste de questions, à côté du
   *  formulaire manuel dont une bascule le sépare. Rien d'autre ne change : les
   *  étapes, l'arrêt et les messages sont les mêmes des deux côtés, et c'est bien
   *  le but — il n'y a qu'une génération, pas deux. */
  frame?: 'modal' | 'inline';
  /** La consigne, pilotée de l'extérieur. L'encadré de création s'en sert pour
   *  **partager le texte avec le champ d'énoncé du formulaire manuel** : ce qu'on
   *  a commencé à écrire d'un côté se retrouve de l'autre, tant que rien n'a été
   *  ni enregistré ni lancé. Absents, le dialogue garde sa consigne pour lui. */
  hint?: string;
  onHintChange?: (hint: string) => void;
  /** Rouvre une génération qui attend encore son tour, pour en modifier la
   *  consigne (25/09/2026) : le dialogue part de son texte, et « enregistrer »
   *  la met à jour sans lui faire perdre sa place dans la file. */
  editing?: { requestId: string; prompt: string };
};

export default function AiGenerationDialog({ workshopId, files, forcedContext = null, origin, onClose, onCancel, frame = 'modal', hint: hintProp, onHintChange, editing }: Props) {
  const t = useTranslations('ai');

  // ─── Les documents ne se choisissent plus, et ne s'affichent plus ────────
  //
  // La sélection a disparu le 25/08/2026, pour la même raison que les cases
  // d'étapes la veille : un atelier se construit sur TOUT ce qu'on lui a donné.
  // En laisser un de côté produisait un programme incomplet sans que rien ne le
  // dise — et personne n'ouvre ce dialogue pour ne lire qu'une partie de son
  // cours. La liste elle-même est partie dans la foulée : puisqu'on prend tout,
  // l'énumérer n'apprend rien à personne et allonge un dialogue qu'on veut court.
  const usable = files.filter((f) => isSupported(f.mimeType));
  // Le programme déjà en place, lu à l'ouverture. `null` = on ne sait pas
  // encore : le dialogue ne peut pas décider de ce qu'il va faire avant de
  // l'avoir, donc il attend plutôt que de supposer.
  const [visibleNotions, setVisibleNotions] = useState<number | null>(null);
  // ⚠️ Le nombre de questions ne se saisit plus à part (04/09/2026) : un prompt
  // fait UNIQUEMENT de chiffres EST ce nombre. Deux champs disaient la même
  // chose, et un seul des deux était visible selon le bouton d’entrée.
  // `null` = la consigne est une vraie consigne, ou il n’y en a pas.
  const [ownHint, setOwnHint] = useState(editing?.prompt ?? '');
  const hintRef = useRef<HTMLTextAreaElement>(null);
  // Consigne pilotée par l'appelant quand il en fournit une (voir `hint`).
  const hint = hintProp ?? ownHint;
  const setHint = onHintChange ?? setOwnHint;
  // Un prompt fait uniquement de chiffres n'est pas une consigne : c'est un
  // nombre de questions. Il court-circuite l'étape 0 — il n'y a rien à
  // interpréter, rien à écrire — et va droit au reste de la génération.
  const askedCount = questionCountFromHint(hint);

  // Hauteur du champ de consigne : recalculée à chaque frappe. `field-sizing:
  // content` ferait ça tout seul mais n'est pas encore partout, d'où la mesure
  // explicite — la même qu'`AutoTextarea` côté examen.
  useLayoutEffect(() => {
    const el = hintRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [hint, frame]);

  const context = forcedContext ?? 'parcours';
  const { full } = capacityOf(useGenerations(workshopId));

  // ─── Ce que ce lancement va faire, et qui n'est plus une case à cocher ────
  //
  // Les trois cases ont disparu le 24/08/2026 : personne n'a à décider quelles
  // étapes lancer, c'est le point d'entrée qui le dit.
  //
  //   • Paramètres           → tout, à chaque fois. Un atelier se construit d'un
  //                            trait, et les étapes déjà faites se complètent au
  //                            lieu de se refaire.
  //   • Liste de questions   → seulement des questions, DANS CETTE LISTE.
  //
  // …avec deux rattrapages, un dans chaque sens :
  //
  //   • ⚠️ **une liste de questions ne construit JAMAIS le programme**
  //     (décision d'Alexis du 25/09/2026). Elle le faisait sur un atelier vide
  //     depuis le 24/08 ; c'est désormais le rôle des seuls Paramètres. Un
  //     atelier sans notion au programme quand vient son tour fait échouer la
  //     génération, et son encadré renvoie vers les Ressources
  //     (@/lib/ingest/queue) — vérifié au départ et non au clic, puisqu'une
  //     mise à jour lancée juste avant peut encore le remplir ;
  //   • **sans document lisible, on ne construit rien** (25/08/2026). Un atelier
  //     qui a déjà ses chapitres et ses notions n'a pas besoin qu'on relise un
  //     cours pour lui écrire des questions de plus : on saute les trois premiers
  //     étages et on rédige. Avant, le bouton restait simplement éteint, sans un
  //     mot — un atelier dont on avait retiré les PDF devenait ingénérable.
  //   • ⚠️ **…et depuis le 04/09/2026, une CONSIGNE est elle-même de la matière.**
  //     « Fais-moi un cours d'histoire pour des 4e » sur un atelier vide n'avait
  //     rien à lire, donc le bouton restait éteint — alors que c'est exactement
  //     le cas pour lequel l'étape 0 existe : elle écrit le cours, et les étages
  //     suivants travaillent dessus. Un nombre seul ne compte pas : il ne
  //     demande que des questions, et n'écrit rien.
  const hasFiles = usable.length > 0;
  const hasHint = askedCount === null && hint.trim().length > 0;
  const needsProgram = forcedContext === null && (hasFiles || hasHint);
  // On ne téléverse que ce qui existe : une consigne seule n'a aucun fichier à
  // remettre au fournisseur.
  const needsFiles = needsProgram && hasFiles;
  // Ni document, ni programme, ni consigne : il n'y a rien à lire, rien à faire
  // travailler, et rien à écrire. C'est le seul vrai blocage qui reste.
  const nothingToDo = forcedContext === null && !hasFiles && visibleNotions === 0 && !hasHint;
  /** Ce que ce lancement va faire, dit d'une phrase. Affichée telle quelle en
   *  fenêtre ; repliée derrière le point d'information de la consigne quand le
   *  dialogue est posé dans une liste, où la place est comptée. */
  const planText = nothingToDo
    ? t('plan.nothing')
    : forcedContext !== null
      ? t(forcedContext === 'exam' ? 'plan.examQuestions' : 'plan.parcoursQuestions')
      : !hasFiles && hasHint
        ? t('plan.fromHint')
        : needsProgram
          ? t('plan.program')
          : t('plan.questionsOnly');

  // La liste des chapitres porte déjà le compte de notions et l'état écarté :
  // pas besoin d'une lecture dédiée. Montée à l'ouverture — le dialogue n'est
  // rendu que lorsqu'il est ouvert.
  useEffect(() => {
    let cancelled = false;
    getWorkshopChapters(workshopId)
      .then((chapters) => {
        if (cancelled) return;
        setVisibleNotions(chapters.filter((c) => !c.hidden).reduce((sum, c) => sum + c.notionCount, 0));
      })
      // Compte inconnu → on retombe sur le chemin complet, qui produit un
      // résultat correct dans tous les cas. L'inverse (supposer un programme
      // qui n'existe pas) ne produirait rien du tout.
      .catch(() => { if (!cancelled) setVisibleNotions(0); });
    return () => { cancelled = true; };
  }, [workshopId]);


  /** Lance la génération et ferme la fenêtre dans le même geste : la suite —
   *  avancement, arrêt, échec — se lit sur le bouton (`generationStore`). */
  function start() {
    const input = {
      fileIds: needsFiles ? usable.map((f) => f.id) : [],
      context,
      // L'étape 0 ne dépend pas du point d'entrée mais de la CONSIGNE : sans
      // elle, il n'y a rien à interpréter. Un nombre seul n'en est pas une.
      withResource: hint.trim().length > 0 && askedCount === null,
      needsProgram,
      visibleNotions: visibleNotions ?? 0,
      examTarget: askedCount ?? DEFAULT_EXAM_QUESTIONS,
      // Un nombre seul n'est pas une consigne : le transmettre en ferait une, et
      // chaque étape lirait « 40 » comme une instruction de rédaction.
      hint: askedCount === null ? hint.trim() : '',
      // Le texte tel qu'il a été tapé : c'est lui que l'encadré affiche, et
      // qu'on rouvre pour modifier une génération en attente.
      prompt: hint.trim(),
      // Le bouton par lequel on est entré — journal de bord, rien d'autre.
      origin,
    };
    void (editing ? editGeneration(workshopId, editing.requestId, input) : launchGeneration(workshopId, input));
    onClose();
  }

  const requestClose = onCancel ?? onClose;

  // Le corps est écrit une seule fois : seule la coquille change (voir `frame`).
  // `position: relative` en ligne — la croix se pose en absolu, et sans repère
  // elle irait se caler sur le premier ancêtre positionné de la page.
  const body = (
      <div style={{ textAlign: 'left', position: frame === 'inline' ? 'relative' : undefined }}>
        {/* La croix : une sortie visible, au même endroit à chaque étape. Sans
            elle, la seule façon de quitter une génération était de fermer
            l'onglet — et l'étape « en cours » n'a pas d'autre sortie que celle-ci.
            En fenêtre elle se pose dans le coin ; en ligne elle rejoint la ligne
            de titre, à côté de la bascule, faute de coin où se poser. */}
        {frame === 'modal' && (
          <button
            type="button"
            onClick={requestClose}
            aria-label={t('close')}
            style={{
              position: 'absolute', top: 12, right: 12, display: 'flex',
              padding: 6, borderRadius: radius.md, border: 'none',
              background: 'transparent', color: palette.inkFaint, cursor: 'pointer',
            }}
          >
            <X size={17} />
          </button>
        )}
        {/* ⚠️ **En ligne, ni titre, ni sous-titre, ni croix** (07/09/2026).
            L'encadré de création porte déjà sa ligne de titre — « NOUVELLE
            QUESTION » et la bascule —, et le côté IA n'a aucune raison de
            s'annoncer autrement que le côté manuel : c'est la même chose qu'on
            crée, par deux chemins. La sortie passe par « annuler », comme en
            face ; l'étape « en cours », qui n'a pas de bouton d'annulation,
            reçoit le sien plus bas. */}
        {frame === 'modal' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Sparkles size={18} color={palette.green} />
              <h2 style={{ fontSize: 17, fontWeight: 600, color: palette.ink, margin: 0 }}>{t('title')}</h2>
            </div>
            <p style={{ fontSize: 13, color: palette.inkSoft, margin: '0 0 18px' }}>{t('subtitle')}</p>
          </>
        )}

        {(
          <>
            {/* Ce que ce lancement va faire, dit d'une phrase. Il n'y a plus rien
                à cocher, donc il faut le dire — sans quoi le même bouton ferait
                deux choses différentes sans jamais l'annoncer. */}
            {/* ⚠️ **Ce que la génération va faire n'est plus étalé sur trois
                lignes** (07/09/2026, demandé par Alexis) : la phrase est
                toujours là, mot pour mot, mais repliée derrière un point
                d'information. Elle explique, elle ne commande pas — et un
                encadré posé dans une liste ne peut pas se permettre le même
                bavardage qu'une fenêtre qui occupe l'écran. Même traitement
                pour l'aide du modèle et celle de la consigne, plus bas.
                En fenêtre, la phrase reste affichée : la place ne manque pas. */}
            {frame === 'modal' && <div style={{ marginBottom: 18 }}><Hint>{planText}</Hint></div>}

            {/* ⚠️ **Le champ « nombre de questions » a été retiré le 04/09/2026.**
                Il disait la même chose que la consigne, et n’apparaissait que sur
                un des deux boutons d’entrée. Un prompt fait UNIQUEMENT de
                chiffres EST ce nombre — « 40 » demande quarante questions, sans
                passer par l’IA de lecture ni coûter un appel de plus. */}

            {frame === 'inline' && <div style={{ marginBottom: 16 }} />}

            {/* En encadré, tout le texte d'aide passe dans l'infobulle (25/09/2026,
                demandé par Alexis — même sobriété que dans la banque d'examen) :
                ce que la génération va faire, puis ce qu'on peut lui demander. */}
            <SectionLabel
              info={frame === 'inline' ? (forcedContext === null ? planText : t('hint.info')) : undefined}
              infoMore={frame === 'inline' ? (forcedContext === null ? t('hint.help') : t('hint.infoIdeas')) : undefined}
            >
              {t('hint.label')}
            </SectionLabel>
            {/* Champ libre, facultatif, posé APRÈS les cases : il précise ce
                qu'on vient de demander, il ne le remplace pas. L'exemple n'est
                pas décoratif — sans lui, personne ne devine que c'est ici qu'on
                dit « découpe par thèmes » ou « les parties s'appellent
                Séquences dans le document », qui sont justement les deux choses
                que le modèle ne peut pas inventer. */}
            <textarea
              ref={hintRef}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={3}
              maxLength={600}
              // ⚠️ **Le texte grisé dit ce qui se passe si l'on n'écrit rien**
              // (07/09/2026, demandé par Alexis) : c'est exactement l'appel que
              // le champ vide déclenche, nombre par défaut compris — il est
              // interpolé depuis `DEFAULT_EXAM_QUESTIONS` et non recopié, pour
              // qu'il ne puisse pas mentir le jour où la constante bouge.
              // En fenêtre, le champ sert aussi à construire un programme : son
              // exemple d'origine y reste plus juste.
              placeholder={forcedContext === 'exam' ? t('hint.placeholderExam', { count: DEFAULT_EXAM_QUESTIONS }) : t('hint.placeholder')}
              style={{
                // ⚠️ **Plus de poignée de redimensionnement** (07/09/2026,
                // demandé par Alexis) : la hauteur suit le texte saisi, comme le
                // champ de réponse d'une question à réponse textuelle. Régler à
                // la main la hauteur d'un champ qui sait la trouver seul n'est
                // pas un réglage, c'est une corvée — et une poignée dans le coin
                // d'un encadré posé au milieu d'une liste attire l'œil pour rien.
                width: '100%', boxSizing: 'border-box', resize: 'none', overflow: 'hidden',
                // Plancher de trois lignes : `height: auto` retombe dessus, donc
                // `scrollHeight` est déjà borné et la mesure n'a pas à s'en
                // occuper (même mécanique qu'`AutoTextarea`, côté examen).
                minHeight: HINT_MIN_HEIGHT,
                fontFamily: 'inherit', fontSize: HINT_FONT_SIZE, lineHeight: HINT_LINE_HEIGHT,
                padding: `${HINT_PAD_Y}px 10px`, borderRadius: radius.md,
                border: `1px solid ${ink(0.12)}`, background: palette.surfaceInput,
                color: palette.ink, outline: 'none',
              }}
            />
            {frame === 'modal'
              ? <div style={{ marginTop: 6, marginBottom: 20 }}><Hint>{t('hint.help')}</Hint></div>
              : <div style={{ marginBottom: 4 }} />}

            <Actions>
              <Ghost onClick={requestClose}>{t('cancel')}</Ghost>
              {/* Deux blocages : tant que le programme n'est pas lu, on ne sait
                  pas encore quoi lancer — mieux vaut attendre une fraction de
                  seconde que partir sur la mauvaise voie ; et un atelier sans
                  document ET sans notion n'offre rien à quoi se raccrocher. */}
              {/* Trois générations déjà actives sur l'atelier : on ne peut pas en
                  demander une quatrième, et le bouton dit pourquoi au survol. Un
                  bouton désactivé n'émet aucun événement de souris : l'infobulle
                  se pose sur un conteneur. */}
              {full && !editing ? (
                <Tooltip content={t('queue.full')}>
                  <span style={{ display: 'inline-flex' }}>
                    <Primary onClick={() => {}} disabled>{t('generate')}</Primary>
                  </span>
                </Tooltip>
              ) : (
                <Primary
                  onClick={() => { void start(); }}
                  disabled={visibleNotions === null || nothingToDo}
                >
                  {editing ? t('queue.save') : t('generate')}
                </Primary>
              )}
            </Actions>
          </>
        )}
      </div>
  );

  if (frame === 'inline') return body;
  return <Modal onClose={requestClose} width={520} portal>{body}</Modal>;
}
function SectionLabel({ children, info, infoMore }: { children: React.ReactNode; info?: string; infoMore?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: palette.inkFaint, marginBottom: 8 }}>
      {children}
      {info && <InfoDot text={info} more={infoMore} />}
    </div>
  );
}

/** Point d'information : l'explication longue, repliée (07/09/2026).
 *
 *  ⚠️ **Il s'ouvre au survol ET au clic.** Les infobulles du projet sont
 *  desktop seulement — Base UI n'écoute que la souris — et une explication qu'on
 *  ne peut pas atteindre au doigt n'existe pas sur téléphone. Le clic pilote donc
 *  l'ouverture (voir `open`/`onOpenChange` de `Tooltip`), et le délai de survol
 *  est court : on ne frôle pas un point d'information par hasard, on le vise. */
function InfoDot({ text, more }: { text: string; more?: string }) {
  // ⚠️ **Un repère, pas une commande** (07/09/2026) : il informe au survol, et
  // rien d'autre — d'où un `<span>` et non un `<button>`. Un bouton qui ne fait
  // rien au clic promet une action qui n'existe pas, prend le focus au clavier
  // et s'enfonce sous le doigt pour ne rien produire. Même choix que
  // `ShuffleNoticeIcon` sur la copie d'examen, et même curseur : celui du
  // document, qui n'annonce aucune interaction.
  //
  // Le texte reste porté pour les lecteurs d'écran (`role="img"` + `aria-label`),
  // que l'infobulle de Base UI — desktop et souris seulement — n'atteint pas.
  // Deux paragraphes, séparés : ce que fait la fonctionnalité, puis ce qu'on
  // peut lui demander. D'où deux clés et non une seule chaîne à couper — un
  // retour à la ligne se traduit mal, et la bulle rend du texte, pas du HTML.
  const content = more
    ? <><span>{text}</span><span style={{ display: 'block', marginTop: 7 }}>{more}</span></>
    : text;
  return (
    <Tooltip content={content} delay={120} side="top">
      <span
        role="img"
        aria-label={more ? `${text} ${more}` : text}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, color: palette.inkFaint, flexShrink: 0 }}
      >
        <Info size={13} strokeWidth={2} />
      </span>
    </Tooltip>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12.5, color: palette.inkFaint, margin: '2px 0 0' }}>{children}</p>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>{children}</div>;
}

function Ghost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ padding: '8px 14px', borderRadius: radius.md, border: `1px solid ${ink(0.12)}`, background: 'transparent', fontSize: 13.5, color: palette.inkMuted, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px', borderRadius: radius.md, border: 'none',
        background: disabled ? ink(0.12) : palette.green,
        color: disabled ? palette.inkFaint : palette.parchment,
        fontSize: 13.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
