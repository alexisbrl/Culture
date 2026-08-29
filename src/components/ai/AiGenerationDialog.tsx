'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, AlertTriangle, Check, ExternalLink, X } from 'lucide-react';

import Modal from '@/components/Modal';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ink, palette, radius } from '@/lib/theme';
import { INGEST_CONCURRENCY, QUESTIONS_CONCURRENCY, mapWithConcurrency } from '@/lib/ingest/concurrency';
import {
  DEFAULT_EXAM_QUESTIONS,
  EXAM_QUESTIONS_PER_CALL,
  EXAM_QUESTIONS_RANGE,
  MAX_QUESTIONS_PER_IMPORT as MAX_QUESTIONS,
} from '@/lib/ingest/prompt';
import { getWorkshopFiles } from '@/app/actions/workshopFiles';
import { getWorkshopChapters } from '@/app/actions/workshopChapters';
import {
  beatWorkshopImport,
  cancelWorkshopImport,
  closeWorkshopImport,
  finishWorkshopIngestion,
  ingestDocumentNotions,
  ingestParcoursQuestions,
  ingestWorkshopAssignments,
  ingestWorkshopChapters,
  ingestWorkshopExamQuestions,
  prepareWorkshopIngestion,
  releaseWorkshopImportFiles,
  type PlanIssue,
} from '@/app/actions/aiIngest';

// Le dialogue de génération par IA — **un seul composant pour tous les points
// d'entrée** (Ressources, Chapitre & Notion, et les deux listes de questions).
// Ce qui change d'un bouton à l'autre, ce sont les cases cochées au départ, pas
// le dialogue (§8 du plan d'ingestion).
//
// ─── C'est ICI que vit l'enchaînement des passes ─────────────────────────────
//
// Chaque server action ne fait qu'UN appel au modèle (§5.4) : c'est donc le
// client qui boucle. Deux conséquences visibles :
//   • la progression est réelle, pas simulée — on sait exactement où on en est ;
//   • un onglet fermé interrompt l'ingestion. Ce qui a déjà été écrit reste, et
//     reste annulable ; c'est le prix assumé de l'approche, à revoir le jour où
//     une vraie tâche de fond existera.
//
// **L'ordre des étages a été inversé le 23/08/2026** : les NOTIONS d'abord
// (document par document), les CHAPITRES ensuite (qui les rangent), les
// questions enfin. Les notions sont le cœur d'un atelier, les chapitres ne
// sont que des boîtes — décider les boîtes en premier rendait toute mise à
// jour impossible (docs/chantiers/2026-08-23-notions-dabord.md).
//
// **Grouper par étage reste impératif** : le cache de prompt est propre à
// chaque schéma de sortie, donc alterner les étages le ferait manquer à chaque
// fois — sur douze chapitres, ~3 $ contre ~11 $ (mesuré, §5.2).

/** Rythme du signe de vie envoyé pendant une génération.
 *
 *  ⚠️ **À tenir sous `LIVE_TIMEOUT_MS` (@/lib/ingest/lock), avec de la marge** :
 *  le serveur oublie un lot qui n'a plus battu depuis deux minutes. Trente
 *  secondes laissent passer trois battements manqués — le temps qu'un réseau
 *  hésitant se reprenne — avant que le verrou ne se relâche pour de bon. La
 *  constante est redéclarée ici plutôt qu'importée : `lock.ts` ouvre un client
 *  Supabase de service, qui n'a rien à faire dans un composant client. */
const LIVE_BEAT_MS = 30_000;

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
export function useWorkshopFiles(workshopId: string, refreshOn?: unknown): DialogFile[] | null {
  const [files, setFiles] = useState<DialogFile[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getWorkshopFiles(workshopId)
      .then((rows) => { if (!cancelled) setFiles(rows.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }))); })
      // `prev ?? []` et non `[]` : au premier chargement, l'échec doit sortir du
      // `null` (sinon le dialogue attend indéfiniment) ; sur une relecture, il
      // ne doit pas effacer la liste qu'on affichait déjà.
      .catch(() => { if (!cancelled) setFiles((prev) => prev ?? []); });
    return () => { cancelled = true; };
  }, [workshopId, refreshOn]);
  return files;
}

type Phase =
  | { step: 'select' }
  // Le téléversement des documents chez le fournisseur, avant le premier appel
  // au modèle. L'écran de confirmation du coût qui suivait cette étape a été
  // retiré le 22/08/2026 (l'estimation ne pouvait pas être calculée) ; l'étape
  // reste, elle garantit qu'on ne téléverse jamais deux fois.
  | { step: 'preparing' }
  | { step: 'running'; label: string; done: number; total: number }
  | { step: 'done' }
  | { step: 'error'; message: string };

type Props = {
  workshopId: string;
  files: DialogFile[];
  /** Contexte imposé quand on entre par une liste de questions ; `null` quand on
   *  entre par les Paramètres, où l'utilisateur choisit. */
  forcedContext?: 'parcours' | 'exam' | null;
  onClose: () => void;
  onDone?: () => void;
};

export default function AiGenerationDialog({ workshopId, files, forcedContext = null, onClose, onDone }: Props) {
  const t = useTranslations('ai');
  const locale = useLocale();

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
  const [examCount, setExamCount] = useState(DEFAULT_EXAM_QUESTIONS);
  // ⚠️ TEMPORAIRE — phase de test. Le fournisseur de la passe questions est
  // exposé le temps de comparer Claude et DeepSeek sur un vrai corpus ; il n'a
  // pas vocation à rester un choix d'utilisateur. Seule cette passe est
  // concernée : elle ne reçoit aucun document (voir `providers/deepseek.ts`).
  const [questionsProvider, setQuestionsProvider] = useState<'claude' | 'deepseek'>('claude');
  const [hint, setHint] = useState('');
  const [phase, setPhase] = useState<Phase>({ step: 'select' });
  // ─── L'arrêt, et pourquoi il tient dans des refs ────────────────────────
  //
  // L'enchaînement des passes vit dans une fonction async : elle ne relèverait
  // jamais un changement d'état, qu'elle a capturé à son premier tour. Le drapeau
  // d'arrêt et le numéro de lot passent donc par des refs, lues à chaque étage.
  const stopped = useRef(false);
  const importIdRef = useRef<string | null>(null);
  const runRef = useRef<Promise<void> | null>(null);
  const [stopAsk, setStopAsk] = useState(false);
  const [counts, setCounts] = useState({ chapters: 0, notions: 0, questions: 0 });
  const [issues, setIssues] = useState<{ discarded: PlanIssue[]; adjusted: PlanIssue[] }>({ discarded: [], adjusted: [] });

  // Le téléversement en cours n'est pas interruptible proprement : on ferme la
  // sortie tant qu'il dure, comme pendant la génération.
  const running = phase.step === 'running' || phase.step === 'preparing';
  const context = forcedContext ?? 'parcours';

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
  //   • demander des questions à un atelier qui n'a aucune notion AU PROGRAMME
  //     ne produirait rien — il n'y a rien à faire travailler. On construit
  //     donc le programme d'abord, puis on écrit les questions. Les notions sans
  //     chapitre et celles des chapitres écartés ne comptent pas : elles sont
  //     hors programme, c'est la définition de leur état ;
  //   • **sans document lisible, on ne construit rien** (25/08/2026). Un atelier
  //     qui a déjà ses chapitres et ses notions n'a pas besoin qu'on relise un
  //     cours pour lui écrire des questions de plus : on saute les trois premiers
  //     étages et on rédige. Avant, le bouton restait simplement éteint, sans un
  //     mot — un atelier dont on avait retiré les PDF devenait ingénérable.
  const hasFiles = usable.length > 0;
  const needsProgram = hasFiles && (forcedContext === null || visibleNotions === 0);
  const needsFiles = needsProgram;
  // Ni document ni programme : il n'y a rien à lire et rien à faire travailler.
  // C'est le seul vrai blocage qui reste.
  const nothingToDo = !hasFiles && visibleNotions === 0;

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

  /** Téléverse les documents, puis enchaîne directement sur la génération. */
  async function prepare() {
    setPhase({ step: 'preparing' });
    const prepared = await prepareWorkshopIngestion(workshopId, needsFiles ? usable.map((f) => f.id) : [], {
      // Le périmètre n'est plus un choix : il se déduit du point d'entrée. On le
      // range quand même dans le lot, c'est lui qu'on relira pour comprendre ce
      // qu'un import a voulu faire.
      program: needsProgram,
      context,
      examQuestions: context === 'exam' ? examCount : undefined,
      // Rangée dans le `scope` de l'import : chaque passe la relit depuis la
      // base, y compris celles qui s'exécutent dans des appels ultérieurs.
      hint: hint.trim(),
      questionsProvider,
    });
    // Une génération tourne déjà sur cet atelier, dans un autre onglet : le
    // serveur a refusé avant le moindre téléversement. Le message affiché est le
    // nôtre — le refus, lui, ne voyage que sous forme de mot-clé.
    if (!prepared.ok) {
      return setPhase({ step: 'error', message: prepared.reason === 'busy' ? t('busy') : prepared.error });
    }
    // Retenu tout de suite : c'est ce numéro que l'arrêt devra défaire, même si
    // l'utilisateur ferme au tout premier étage.
    importIdRef.current = prepared.importId;
    if (stopped.current) return;
    await generate(prepared.importId, prepared.documents);
  }

  async function generate(importId: string, documents: number) {
    const discarded: PlanIssue[] = [];
    const adjusted: PlanIssue[] = [];
    const tally = { chapters: 0, notions: 0, questions: 0 };

    // ─── Les étages, et ce qui décide de leur présence ──────────────────────
    //
    // Plus aucun choix d'étage : le point d'entrée décide (voir `needsProgram`).
    // Ce qui existe déjà n'est jamais refait — chaque étage COMPLÈTE : les
    // chapitres en place sont réutilisés, les notions déjà rangées le restent,
    // et les notions déjà pourvues de questions ne sont pas repassées au modèle.
    //
    // ⚠️ **L'ordre a été inversé le 23/08/2026** : les notions d'abord, les
    // chapitres ensuite. Les notions sont le cœur d'un atelier, les chapitres
    // ne sont que des boîtes — décider les boîtes en premier rendait toute mise
    // à jour impossible (feuille de route « notions d'abord »).
    // Le RANGEMENT est un étage à part entière, pas une conséquence : il tourne
    // dès qu'il y a quelque chose à placer — des notions neuves, ou une
    // structure qui vient de changer.
    const withNotions = needsProgram;
    const withChapters = needsProgram;
    const withAssign = needsProgram;
    const steps = [
      ...(withNotions ? ['notions' as const] : []),
      ...(withChapters ? ['chapters' as const] : []),
      ...(withAssign ? ['assign' as const] : []),
      'questions' as const,
    ];
    const totalSteps = steps.length;
    // Le rang d'un étage dans la barre dépend de ce qui est coché : sans les
    // chapitres, les notions occupent le premier cran, pas le deuxième.
    const stepAt = (name: (typeof steps)[number]) => Math.max(0, steps.indexOf(name));

    // ── Étage 1 : les notions, document par document ──
    //
    // Elles naissent SANS chapitre — à ce stade il n'en existe pas. Le document
    // est l'unité de travail : elle ne demande aucun jugement au modèle, elle
    // est stable d'un import à l'autre, et chaque appel ne porte que son propre
    // document.
    //
    // ⚠️ **Plus d'appel d'amorçage, et ce n'est pas un oubli.** L'ancienne passe
    // envoyait TOUS les documents à CHAQUE appel : il fallait qu'un premier
    // appel parte seul pour écrire le cache que les suivants liraient. Ici deux
    // appels ne partagent aucun préfixe — le corpus part une seule fois au
    // total, ce qui est moins cher que l'écriture de cache qu'on remplace. Tout
    // peut donc partir ensemble.
    // Chaque étage se demande d'abord s'il a encore lieu d'être : l'arrêt ne
    // coupe pas un appel en vol, il empêche le suivant de partir.
    if (stopped.current) return;
    if (withNotions && documents > 0) {
      let error: string | null = null;
      const showNotions = (done: number) => setPhase({
        step: 'running',
        label: t('progress.notionsDocuments', { done, n: documents }),
        done: stepAt('notions') + done / documents,
        total: totalSteps,
      });

      showNotions(0);
      await mapWithConcurrency(
        Array.from({ length: documents }, (_, i) => i),
        INGEST_CONCURRENCY,
        async (index) => {
          if (stopped.current) return;
          const result = await ingestDocumentNotions(workshopId, importId, index);
          if (!result.ok) { error ??= result.error; return; }
          discarded.push(...result.discarded);
          adjusted.push(...result.adjusted);
          tally.notions += result.written;
          setCounts({ ...tally });
        },
        (done) => showNotions(done),
      );
      if (error) return setPhase({ step: 'error', message: error });
    }

    // ── Étage 2 : les chapitres, ET le rangement des notions ──
    //
    // Un seul appel pour les deux : le modèle ne peut pas ranger dans des
    // chapitres qu'il n'a pas encore nommés. C'est aussi le seul moment du
    // pipeline qui voit toutes les notions d'un coup, donc le seul où une redite
    // entre deux documents peut se repérer.
    //
    // Décoché, on garde le programme tel quel : les notions qui viennent d'être
    // créées restent sans chapitre, consultables, et un import ultérieur pourra
    // les ranger.
    if (stopped.current) return;
    if (withChapters) {
      setPhase({ step: 'running', label: t('progress.chapters'), done: stepAt('chapters'), total: totalSteps });
      const structure = await ingestWorkshopChapters(workshopId, importId);
      if (!structure.ok) return setPhase({ step: 'error', message: structure.error });
      discarded.push(...structure.discarded);
      adjusted.push(...structure.adjusted);
      // Le compteur affiche ce que CET import a créé, pas le total de l'atelier.
      tally.chapters = structure.chapters.length;
      setCounts({ ...tally });
    }

    // ── Étage 3 : le rangement, par lots ──
    //
    // Il ne reçoit aucun document : ce qui remplace le cours, c'est la page d'où
    // vient chaque notion et les pages que couvre chaque chapitre. C'est aussi
    // ici que les ressemblances repérées mécaniquement sont soumises au
    // jugement du modèle — le calcul signale, le modèle tranche.
    if (stopped.current) return;
    if (withAssign) {
      let error: string | null = null;
      const showAssign = (done: number, total: number) => setPhase({
        step: 'running',
        label: t('progress.assign', { done, n: total }),
        done: stepAt('assign') + (total > 0 ? done / total : 0),
        total: totalSteps,
      });

      showAssign(0, 1);
      // Le nombre de lots n'est connu qu'à la réponse du premier : on le fait
      // seul, puis on lance tout le reste en parallèle.
      const first = await ingestWorkshopAssignments(workshopId, importId, 0);
      if (!first.ok) return setPhase({ step: 'error', message: first.error });
      discarded.push(...first.discarded);
      adjusted.push(...first.adjusted);
      showAssign(1, first.batches || 1);

      if (first.batches > 1) {
        const rest = Array.from({ length: first.batches - 1 }, (_, i) => i + 1);
        let done = 1;
        await mapWithConcurrency(rest, INGEST_CONCURRENCY, async (index) => {
          if (stopped.current) return;
          const result = await ingestWorkshopAssignments(workshopId, importId, index);
          if (!result.ok) { error ??= result.error; return; }
          discarded.push(...result.discarded);
          adjusted.push(...result.adjusted);
          showAssign(++done, first.batches);
        });
      }
      if (error) return setPhase({ step: 'error', message: error });

      // ⚠️ **Ici et pas avant.** Cacher les chapitres que l'import a vidés et
      // effacer ce qu'il a créé sans jamais le ranger n'a de sens qu'une fois
      // TOUT rangé : à mi-parcours, chaque notion est encore sans chapitre.
      await finishWorkshopIngestion(workshopId, importId);
    }

    // Les documents ont fini de servir : les deux premiers étages les portaient,
    // la passe questions ne les reçoit plus (§16.3), et rien ne s'efface tout
    // seul chez le fournisseur (§16.8). On les rend ici plutôt qu'à la toute
    // fin, pour que ça arrive même si les questions échouent. Volontairement non
    // attendu — c'est du ménage.
    void releaseWorkshopImportFiles(workshopId, importId);

    // ─── Étage 4 : les questions, et deux régimes qui n'ont rien en commun ───
    //
    // • EXAMEN   — un nombre TOTAL de questions pour tout le programme (40 par
    //              défaut, réglable ci-dessus), chacune croisant plusieurs
    //              notions, un tiers en groupes qui s'enchaînent. Le découpage
    //              porte sur le budget, et la matière suit : chaque appel reçoit
    //              une tranche contiguë du cours.
    // • PARCOURS — douze questions PAR NOTION, une notion par question. Le
    //              découpage porte sur la matière, chapitre par chapitre.
    //
    // Deux régimes, deux passes serveur (24/08/2026). Les fondre reviendrait à
    // fabriquer deux listes qui se ressemblent, alors que leur intérêt est
    // justement d'être complémentaires.
    if (context === 'exam') {
      let error: string | null = null;
      let doneCalls = 0;
      let totalCalls = 1;

      const showExam = () => setPhase({
        step: 'running',
        label: t('progress.questionsCount', { done: doneCalls, n: totalCalls }),
        done: stepAt('questions') + doneCalls / Math.max(1, totalCalls),
        total: totalSteps,
      });

      const runSlice = async (sliceIndex: number, target?: number, budget?: number) => {
        if (stopped.current) return null;
        // Même raison que pour le parcours : le serveur ne voit qu'un appel à la
        // fois, seul le client sait combien il en a en vol.
        const remaining = MAX_QUESTIONS - tally.questions;
        if (remaining <= 0) return null;
        const share = budget ?? target ?? Math.max(1, Math.floor(remaining / QUESTIONS_CONCURRENCY));
        const result = await ingestWorkshopExamQuestions(workshopId, importId, sliceIndex, share, target);
        doneCalls += 1;
        if (!result.ok) { error ??= result.error; showExam(); return null; }
        discarded.push(...result.discarded);
        adjusted.push(...result.adjusted);
        tally.questions += result.written;
        setCounts({ ...tally });
        showExam();
        return result;
      };

      showExam();
      // Le nombre de tranches n'est connu qu'à la réponse de la première : elle
      // part seule, les suivantes ensemble.
      const first = await runSlice(0);
      if (error) return setPhase({ step: 'error', message: error });

      const slices = first?.batches ?? 0;
      if (slices > 1) {
        totalCalls = slices;
        showExam();
        await mapWithConcurrency(
          Array.from({ length: slices - 1 }, (_, i) => i + 1),
          QUESTIONS_CONCURRENCY,
          runSlice,
        );
      }
      if (error) return setPhase({ step: 'error', message: error });

      // ─── Le rattrapage ────────────────────────────────────────────────────
      //
      // Une question écartée — parce qu'elle redisait une question
      // d'entraînement, parce que le modèle en a rendu moins que demandé, ou
      // parce que sa réponse a été coupée — laisserait l'examen court sans que
      // personne ne l'ait voulu. On redemande le MANQUE : chaque passage relit
      // la banque, donc il ne réécrit pas ce qui vient d'être écrit.
      //
      // ⚠️ **Autant d'appels que le manque en exige**, et non un seul
      // (28/08/2026). Un appel n'écrit qu'une part du total — dix questions, la
      // taille d'un appel — si bien qu'un rattrapage unique plafonnait à un
      // dixième : sur quarante demandées dont vingt manquantes, il n'en rendait
      // jamais plus de dix.
      //
      // Deux tours au maximum : un atelier dont le programme ne porte pas
      // quarante questions ne les portera pas davantage au troisième, et chaque
      // tour coûte des appels.
      for (let round = 0; round < 2; round += 1) {
        const short = Math.min(examCount, MAX_QUESTIONS) - tally.questions;
        if (short <= 0) break;

        const calls = Math.max(1, Math.ceil(short / EXAM_QUESTIONS_PER_CALL));
        totalCalls += calls;
        showExam();
        await mapWithConcurrency(
          Array.from({ length: calls }, (_, i) => i),
          QUESTIONS_CONCURRENCY,
          (sliceIndex) => runSlice(sliceIndex, short, Math.ceil(short / calls)),
        );
        if (error) return setPhase({ step: 'error', message: error });
      }

      setIssues({ discarded, adjusted });
      setPhase({ step: 'done' });
      onDone?.();
      return;
    }

    // ⚠️ **Le socle de la passe parcours est l'atelier ENTIER**, pas ce que
    // l'exécution vient de créer — et il est relu en base APRÈS le rangement,
    // pour que les chapitres nouveaux et anciens se retrouvent dans la même
    // liste. C'est ce qui fait qu'un import complète les DEUX : le nouveau part
    // de zéro, l'ancien se voit proposer ce qui lui manque.
    //
    // Le coût en découle et il est assumé : un atelier de douze chapitres
    // déclenche douze séries d'appels, même si un seul chapitre est nouveau
    // (arbitrage du 22/08/2026). Le serveur y répond en n'envoyant au modèle que
    // les notions dont le stock n'est pas au complet.
    // Les chapitres écartés sont hors programme : on ne leur écrit pas de
    // questions. Ils n'ont de toute façon plus de notions, mais la règle doit
    // être explicite — un chapitre restauré plus tard les recevra.
    const chapters = (await getWorkshopChapters(workshopId))
      .filter((c) => !c.hidden)
      .map((c) => ({ id: c.id, name: c.name }));

    if (chapters.length > 0) {
      let error: string | null = null;

      // Le nombre de lots d'un chapitre n'est connu qu'à la réponse du premier
      // appel (`result.batches`) : on ne peut donc pas tout lancer d'emblée. On
      // fait donc **le premier lot de chaque chapitre en parallèle** — ce qui
      // révèle les nombres de lots — puis **tous les lots restants en parallèle**,
      // sans distinction de chapitre. Deux vagues au lieu d'une file : sur ton
      // import (4 chapitres, ~8 lots), c'est 2 attentes au lieu de 8.
      const firstBatch = chapters.map((chapter) => ({ chapter, batchIndex: 0 }));
      let doneCalls = 0;
      let totalCalls = firstBatch.length;

      const showQuestions = () => setPhase({
        step: 'running',
        // Avec des appels concurrents, « le lot en cours » n'existe plus : le
        // nombre de lots terminés est la seule chose qu'on puisse afficher
        // honnêtement.
        label: t('progress.questionsCount', { done: doneCalls, n: totalCalls }),
        done: stepAt('questions') + (totalCalls === 0 ? 1 : doneCalls / totalCalls),
        total: totalSteps,
      });

      const runBatch = async (job: { chapter: (typeof chapters)[number]; batchIndex: number }) => {
        if (stopped.current) return null;
        // ⚠️ **La part du plafond est calculée ici, pas côté serveur.** Le serveur
        // ne voit qu'un appel à la fois : quatre appels concurrents liraient tous
        // le même compteur de questions écrites et se croiraient chacun seuls,
        // donc écriraient chacun jusqu'au plafond entier. Le client, lui, sait
        // combien il en a en vol — il répartit.
        const remaining = MAX_QUESTIONS - tally.questions;
        if (remaining <= 0) return null;
        const share = Math.max(1, Math.floor(remaining / QUESTIONS_CONCURRENCY));
        const result = await ingestParcoursQuestions(workshopId, importId, job.chapter, job.batchIndex, share);
        doneCalls += 1;
        if (!result.ok) { error ??= result.error; showQuestions(); return null; }
        discarded.push(...result.discarded);
        adjusted.push(...result.adjusted);
        tally.questions += result.written;
        setCounts({ ...tally });
        showQuestions();
        return result;
      };

      showQuestions();
      const firstResults = await mapWithConcurrency(firstBatch, QUESTIONS_CONCURRENCY, runBatch);

      // Deuxième vague : tous les lots au-delà du premier, tous chapitres
      // confondus. Rien ne les distingue — ils ne partagent aucun contexte, la
      // passe questions ne portant pas les documents.
      const rest = firstResults.flatMap((result, i) => {
        const count = result?.batches ?? 1;
        return Array.from({ length: Math.max(0, count - 1) }, (_, k) => ({ chapter: chapters[i], batchIndex: k + 1 }));
      });
      if (!error && rest.length > 0) {
        totalCalls += rest.length;
        showQuestions();
        await mapWithConcurrency(rest, QUESTIONS_CONCURRENCY, runBatch);
      }
      if (error) return setPhase({ step: 'error', message: error });
    }

    // Un arrêt n'est pas une fin : le compte-rendu décrirait un travail que
    // l'utilisateur vient justement de faire défaire.
    if (stopped.current) return;
    setIssues({ discarded, adjusted });
    setPhase({ step: 'done' });
    onDone?.();
  }

  // ─── Le signe de vie, et ce qu'il tient ──────────────────────────────────
  //
  // Tant que cet onglet enchaîne les passes, il le dit au serveur toutes les
  // 30 s. C'est ce battement qui interdit une seconde génération sur le MÊME
  // atelier — deux enchaînements y réécrivent les mêmes chapitres et les mêmes
  // notions (voir @/lib/ingest/lock). Sur deux ateliers différents, rien n'est
  // bloqué : il n'y a là aucune écriture partagée.
  //
  // Le verrou s'oublie de lui-même s'il cesse de battre : un onglet fermé
  // brutalement ne condamne pas l'atelier, il le libère au bout de deux minutes.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const importId = importIdRef.current;
      if (importId) void beatWorkshopImport(workshopId, importId);
    }, LIVE_BEAT_MS);
    return () => clearInterval(id);
  }, [running, workshopId]);

  // Fin de partie — terminé ou en panne : le lot se referme tout de suite, sans
  // attendre l'expiration du battement. Un seul endroit pour toutes les sorties,
  // l'enchaînement pouvant s'arrêter en erreur à n'importe lequel de ses étages.
  // (L'arrêt volontaire, lui, passe par l'annulation, qui referme aussi.)
  useEffect(() => {
    if (phase.step !== 'done' && phase.step !== 'error') return;
    const importId = importIdRef.current;
    if (importId) void closeWorkshopImport(workshopId, importId);
  }, [phase.step, workshopId]);

  // ─── Quitter la PAGE pendant une génération ──────────────────────────────
  //
  // La croix et la touche Échap passent par 'requestClose', qui demande
  // confirmation. Restaient les sorties que la fenêtre ne voit pas : rafraîchir,
  // fermer l'onglet, revenir en arrière. Un appui distrait sur F5 interrompait
  // l'enchaînement sans un mot.
  //
  // ⚠️ **Le navigateur n'affiche pas notre texte.** Les navigateurs ignorent
  // depuis longtemps le message fourni par le site — ils montrent leur propre
  // formulation (« Quitter le site ? ») avec leurs propres boutons, et on ne
  // peut ni la choisir ni y ajouter le nôtre. C'est une protection contre les
  // pages qui retenaient leurs visiteurs de force. Tout ce qu'on peut faire,
  // c'est déclencher cette demande — ce que fait 'preventDefault', et ce que
  // fait n'importe quel site à notre place.
  //
  // Limite connue : un retour arrière traité par le routeur sans recharger la
  // page ne déclenche pas cet événement. Rien de dramatique — les questions sont
  // écrites au fur et à mesure et le lot reste annulable par le bandeau.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Exigé par les navigateurs anciens, ignoré par les autres : la chaîne
      // elle-même n'est jamais affichée.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  // ─── La sortie, et ce qu'elle coûte selon le moment ──────────────────────
  //
  // Hors génération, la croix ferme, point. Pendant, elle DEMANDE d'abord : une
  // génération interrompue laisse un atelier à moitié rempli, ce que personne
  // ne veut déclencher d'un appui distrait (28/08/2026).
  function requestClose() {
    if (!running) return onClose();
    setStopAsk(true);
  }

  /** Arrête l'enchaînement, **rend la main tout de suite**, et défait le reste
   *  en arrière-plan.
   *
   *  ⚠️ **Le ménage attend la fin de l'enchaînement, l'utilisateur non.**
   *  L'arrêt empêche les appels suivants de partir, jamais ceux déjà en vol :
   *  annuler avant qu'ils ne retombent laisserait derrière lui ce qu'un
   *  retardataire écrit après coup. Cette attente-là dure le temps d'un appel au
   *  modèle — jusqu'à une minute — et rien ne justifie d'y retenir quelqu'un
   *  devant une fenêtre fermée (28/08/2026).
   *
   *  Les questions sont écrites **au fur et à mesure**, un lot par appel : quitter
   *  la page n'annule donc rien. Si le ménage n'a pas pu se faire — onglet
   *  fermé entre-temps, annulation refusée — le lot reste, et le bandeau
   *  d'annulation le propose comme n'importe quel autre. */
  function confirmStop() {
    stopped.current = true;
    const importId = importIdRef.current;
    onClose();

    void (async () => {
      await runRef.current?.catch(() => {});
      if (!importId) return;
      await cancelWorkshopImport(workshopId, importId).catch(() => {});
      // L'écran se rafraîchit une fois le ménage fait : ce qui a clignoté pendant
      // la génération disparaît, sans que personne ait attendu devant.
      onDone?.();
    })();
  }

  return (
    <Modal onClose={requestClose} width={520} portal>
      <div style={{ textAlign: 'left' }}>
        {/* La croix : une sortie visible, au même endroit à chaque étape. Sans
            elle, la seule façon de quitter une génération était de fermer
            l'onglet. */}
        <button
          type="button"
          onClick={requestClose}
          aria-label={t(running ? 'stop.aria' : 'close')}
          style={{
            position: 'absolute', top: 12, right: 12, display: 'flex',
            padding: 6, borderRadius: radius.md, border: 'none',
            background: 'transparent', color: palette.inkFaint, cursor: 'pointer',
          }}
        >
          <X size={17} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={18} color={palette.green} />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: palette.ink, margin: 0 }}>{t('title')}</h2>
        </div>
        <p style={{ fontSize: 13, color: palette.inkSoft, margin: '0 0 18px' }}>{t('subtitle')}</p>

        {/* La demande d'arrêt prend toute la place : on ne fait pas cohabiter une
            question grave avec une barre de progression qui continue d'avancer. */}
        {stopAsk && (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={17} color={palette.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong style={{ fontSize: 14, color: palette.ink }}>{t('stop.title')}</strong>
                <p style={{ fontSize: 13, color: palette.inkMuted, margin: '6px 0 0' }}>{t('stop.body')}</p>
              </div>
            </div>
            {/* ⚠️ **Les couleurs disent laquelle des deux est sans retour.**
                Le vert allait à « arrêter et défaire » — la seule action de tout
                le dialogue qui détruise quelque chose — et le gris à « continuer ».
                Le rouge va donc à l'arrêt, le vert à la poursuite, et l'arrêt
                passe à gauche : le geste par défaut (dernier bouton, celui qu'on
                vise sans lire) est celui qui ne coûte rien (29/08/2026). */}
            <Actions>
              <Danger onClick={confirmStop}>{t('stop.confirm')}</Danger>
              <Primary onClick={() => setStopAsk(false)}>{t('stop.keep')}</Primary>
            </Actions>
          </div>
        )}

        {!stopAsk && phase.step === 'select' && (
          <>
            {/* Ce que ce lancement va faire, dit d'une phrase. Il n'y a plus rien
                à cocher, donc il faut le dire — sans quoi le même bouton ferait
                deux choses différentes sans jamais l'annoncer. */}
            <div style={{ marginBottom: 18 }}>
              <Hint>
                {nothingToDo
                  ? t('plan.nothing')
                  : forcedContext === null
                    ? needsProgram
                      ? t('plan.program')
                      : t('plan.questionsOnly')
                    : needsProgram
                      ? t('plan.programThenQuestions')
                      : t(forcedContext === 'exam' ? 'plan.examQuestions' : 'plan.parcoursQuestions')}
              </Hint>
            </div>

            {/* Le nombre de questions d'examen — le seul réglage qui reste, et
                le seul qui n'a pas de bonne valeur par défaut universelle : un
                contrôle de dix questions et un examen blanc de soixante sortent
                du même bouton. Le parcours, lui, n'en a pas besoin : son volume
                se déduit du nombre de notions. */}
            {context === 'exam' && (
              <>
                <SectionLabel>{t('examCount.label')}</SectionLabel>
                <input
                  type="number"
                  value={examCount}
                  min={EXAM_QUESTIONS_RANGE.min}
                  max={EXAM_QUESTIONS_RANGE.max}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    // Champ vide ou saisie en cours : on ne corrige rien tant
                    // que la valeur n'est pas un nombre, sinon on empêche
                    // d'effacer pour retaper.
                    if (Number.isNaN(value)) return;
                    setExamCount(value);
                  }}
                  onBlur={() => setExamCount((v) =>
                    Math.min(EXAM_QUESTIONS_RANGE.max, Math.max(EXAM_QUESTIONS_RANGE.min, Math.round(v) || DEFAULT_EXAM_QUESTIONS)),
                  )}
                  style={{
                    width: 90, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13,
                    padding: '8px 10px', borderRadius: radius.md,
                    border: `1px solid ${ink(0.12)}`, background: palette.surfaceInput,
                    color: palette.ink, outline: 'none',
                  }}
                />
                <div style={{ marginTop: 6, marginBottom: 20 }}>
                  <Hint>{t('examCount.help')}</Hint>
                </div>
              </>
            )}

            {/* ⚠️ TEMPORAIRE — phase de test : comparer les deux fournisseurs sur
                un vrai corpus. Seule la passe questions est concernée, et c'est
                dit — elle ne reçoit aucun document, donc rien ne s'y perd à
                changer de modèle ; les chapitres et les notions restent sur
                Claude, qui seul lit les PDF. */}
            <SectionLabel>{t('provider.label')}</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              {(['claude', 'deepseek'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setQuestionsProvider(id)}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: radius.md, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5,
                    border: `1px solid ${questionsProvider === id ? palette.ink : ink(0.12)}`,
                    boxShadow: questionsProvider === id ? `0 0 0 2px ${ink(0.18)}` : 'none',
                    background: palette.surfaceInput,
                    color: questionsProvider === id ? palette.ink : palette.inkMuted,
                    fontWeight: questionsProvider === id ? 600 : 400,
                  }}
                >
                  {t(`provider.${id}`)}
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <Hint>{t('provider.help')}</Hint>
            </div>

            <SectionLabel>{t('hint.label')}</SectionLabel>
            {/* Champ libre, facultatif, posé APRÈS les cases : il précise ce
                qu'on vient de demander, il ne le remplace pas. L'exemple n'est
                pas décoratif — sans lui, personne ne devine que c'est ici qu'on
                dit « découpe par thèmes » ou « les parties s'appellent
                Séquences dans le document », qui sont justement les deux choses
                que le modèle ne peut pas inventer. */}
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder={t('hint.placeholder')}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                fontFamily: 'inherit', fontSize: 13, lineHeight: 1.45,
                padding: '8px 10px', borderRadius: radius.md,
                border: `1px solid ${ink(0.12)}`, background: palette.surfaceInput,
                color: palette.ink, outline: 'none',
              }}
            />
            <div style={{ marginTop: 6, marginBottom: 20 }}>
              <Hint>{t('hint.help')}</Hint>
            </div>

            <Actions>
              <Ghost onClick={onClose}>{t('cancel')}</Ghost>
              {/* Deux blocages : tant que le programme n'est pas lu, on ne sait
                  pas encore quoi lancer — mieux vaut attendre une fraction de
                  seconde que partir sur la mauvaise voie ; et un atelier sans
                  document ET sans notion n'offre rien à quoi se raccrocher. */}
              <Primary
                onClick={() => { runRef.current = prepare(); }}
                disabled={visibleNotions === null || nothingToDo}
              >
                {t('generate')}
              </Primary>
            </Actions>
          </>
        )}

        {/* Téléversement des documents chez le fournisseur. L'étape enchaîne
            désormais seule sur la génération : l'écran de confirmation du coût
            qui s'intercalait ici a été retiré le 22/08/2026. */}
        {!stopAsk && phase.step === 'preparing' && (
          <div style={{ padding: '4px 0 8px' }}>
            <ProgressBar animated value={0} max={1} label={t('estimate.preparing')} />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 14 }}>{t('estimate.preparingHint')}</p>
            <SecondTab href={`/${locale}/dashboard`} label={t('newTab')} />
          </div>
        )}

        {!stopAsk && phase.step === 'running' && (
          <div style={{ padding: '4px 0 8px' }}>
            <ProgressBar animated value={phase.done} max={phase.total} label={phase.label} />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 14 }}>{t('keepOpen')}</p>
            <p style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 6 }}>
              {t('runningCounts', { chapters: counts.chapters, notions: counts.notions, questions: counts.questions })}
            </p>
            <SecondTab href={`/${locale}/dashboard`} label={t('newTab')} />
          </div>
        )}

        {!stopAsk && phase.step === 'done' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Check size={17} color={palette.green} />
              <strong style={{ fontSize: 14.5, color: palette.ink }}>
                {t('doneCounts', { chapters: counts.chapters, notions: counts.notions, questions: counts.questions })}
              </strong>
            </div>
            <IssueList heading={t('discarded')} issues={issues.discarded} tone="warn" />
            <IssueList heading={t('adjusted')} issues={issues.adjusted} tone="soft" />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 12 }}>{t('cancellable')}</p>
            <Actions>
              <Primary onClick={onClose}>{t('close')}</Primary>
            </Actions>
          </div>
        )}

        {!stopAsk && phase.step === 'error' && (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={17} color={palette.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13.5, color: palette.inkMuted, margin: 0 }}>{phase.message}</p>
            </div>
            <Actions>
              <Ghost onClick={() => setPhase({ step: 'select' })}>{t('retry')}</Ghost>
              <Primary onClick={onClose}>{t('close')}</Primary>
            </Actions>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: palette.inkFaint, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12.5, color: palette.inkFaint, margin: '2px 0 0' }}>{children}</p>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>{children}</div>;
}

/** La sortie de secours pendant une génération : un SECOND onglet.
 *
 *  L'enchaînement des passes vit dans cette page (voir l'en-tête du fichier) :
 *  la quitter interrompt la génération, et c'est pour ça que le dialogue retient
 *  celui qui la lance. Plutôt que de le laisser attendre devant une barre,
 *  on lui ouvre l'app ailleurs — l'onglet qui travaille reste intact derrière,
 *  et il fait ce qu'il veut du nouveau (29/08/2026).
 *
 *  Un vrai lien, pas un `window.open` : il survit aux bloqueurs de fenêtres,
 *  s'ouvre au clic du milieu, et se copie. `noopener` est indispensable — sans
 *  lui, la page ouverte peut atteindre l'onglet qui l'a ouverte, c'est-à-dire
 *  précisément celui qu'on protège. */
function SecondTab({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
        padding: '7px 12px', borderRadius: radius.md, border: `1px solid ${ink(0.12)}`,
        fontSize: 12.5, fontWeight: 600, color: palette.inkMuted, textDecoration: 'none',
      }}
    >
      <ExternalLink size={13} />
      {label}
    </a>
  );
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

/** L'action qui détruit — cerclée de rouge, pas remplie : deux aplats côte à
 *  côte se disputeraient le regard, alors qu'un seul des deux boutons doit
 *  attirer le clic distrait, et ce n'est pas celui-ci. */
function Danger({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: radius.md, border: `1px solid ${palette.danger}`,
        background: 'transparent', fontSize: 13.5, fontWeight: 600, color: palette.danger, cursor: 'pointer',
      }}
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

/** Les écarts sont montrés, jamais tus : une correction silencieuse serait pire
 *  que le problème qu'elle règle (§7 du plan). */
function IssueList({ heading, issues, tone }: { heading: string; issues: PlanIssue[]; tone: 'warn' | 'soft' }) {
  if (issues.length === 0) return null;
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: radius.md, background: tone === 'warn' ? 'rgba(156,124,77,.08)' : ink(0.03) }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: tone === 'warn' ? palette.amber : palette.inkSoft, marginBottom: 4 }}>
        {heading} ({issues.length})
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: palette.inkSoft }}>
        {issues.slice(0, 6).map((issue, i) => (
          <li key={i}>{issue.reason}</li>
        ))}
      </ul>
    </div>
  );
}
