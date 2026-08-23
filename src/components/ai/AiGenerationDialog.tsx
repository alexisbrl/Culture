'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, FileText, AlertTriangle, Check } from 'lucide-react';

import Modal from '@/components/Modal';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { ink, palette, radius } from '@/lib/theme';
import { INGEST_CONCURRENCY, QUESTIONS_CONCURRENCY, mapWithConcurrency } from '@/lib/ingest/concurrency';
import { MAX_QUESTIONS_PER_IMPORT as MAX_QUESTIONS } from '@/lib/ingest/prompt';
import { getWorkshopFiles } from '@/app/actions/workshopFiles';
import { getWorkshopChapters } from '@/app/actions/workshopChapters';
import {
  ingestChapterNotions,
  ingestChapterQuestions,
  prepareWorkshopIngestion,
  releaseWorkshopImportFiles,
  startWorkshopIngestion,
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
// **L'ordre des boucles n'est pas décoratif** : toutes les notions, PUIS toutes
// les questions. Le cache de prompt est propre à chaque schéma de sortie, donc
// alterner chapitre par chapitre le ferait manquer à chaque fois — sur douze
// chapitres, ~3 $ contre ~11 $ (mesuré, §5.2).

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

  const usable = files.filter((f) => isSupported(f.mimeType));
  const [selected, setSelected] = useState<string[]>(usable.map((f) => f.id));
  // ⚠️ TEMPORAIRE — phase de test. Le fournisseur de la passe questions est
  // exposé le temps de comparer Claude et DeepSeek sur un vrai corpus ; il n'a
  // pas vocation à rester un choix d'utilisateur. Seule cette passe est
  // concernée : elle ne reçoit aucun document (voir `providers/deepseek.ts`).
  const [questionsProvider, setQuestionsProvider] = useState<'claude' | 'deepseek'>('claude');
  const [hint, setHint] = useState('');
  const [withChapters, setWithChapters] = useState(true);
  const [withNotions, setWithNotions] = useState(true);
  const [withQuestions, setWithQuestions] = useState(true);
  const [phase, setPhase] = useState<Phase>({ step: 'select' });
  const [counts, setCounts] = useState({ chapters: 0, notions: 0, questions: 0 });
  const [issues, setIssues] = useState<{ discarded: PlanIssue[]; adjusted: PlanIssue[] }>({ discarded: [], adjusted: [] });

  // Le téléversement en cours n'est pas interruptible proprement : on ferme la
  // sortie tant qu'il dure, comme pendant la génération.
  const running = phase.step === 'running' || phase.step === 'preparing';
  const context = forcedContext ?? 'parcours';

  function toggleFile(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  /** Téléverse les documents, puis enchaîne directement sur la génération. */
  async function prepare() {
    setPhase({ step: 'preparing' });
    const prepared = await prepareWorkshopIngestion(workshopId, selected, {
      chapters: withChapters,
      notions: withNotions,
      questions: withQuestions,
      context,
      // Rangée dans le `scope` de l'import : chaque passe la relit depuis la
      // base, y compris celles qui s'exécutent dans des appels ultérieurs.
      hint: hint.trim(),
      questionsProvider,
    });
    if (!prepared.ok) return setPhase({ step: 'error', message: prepared.error });
    await generate(prepared.importId);
  }

  async function generate(importId: string) {
    const discarded: PlanIssue[] = [];
    const adjusted: PlanIssue[] = [];
    const tally = { chapters: 0, notions: 0, questions: 0 };

    // ─── Les trois étages sont indépendants, et chacun se saute tout seul ───
    //
    // Chaque étage naît de celui du dessus. On ne génère QUE ce qui est coché,
    // et un étage coché dont le prédécesseur manque est **sauté** — pas une
    // erreur, pas un blocage : il n'y a simplement rien à quoi se rattacher.
    // Décocher « chapitres » ne veut donc pas dire « atelier vide », ça veut
    // dire « garde ceux qui existent et complète-les ».
    const steps = [
      ...(withChapters ? ['chapters' as const] : []),
      ...(withNotions ? ['notions' as const] : []),
      ...(withQuestions ? ['questions' as const] : []),
    ];
    const totalSteps = steps.length;
    // Le rang d'un étage dans la barre dépend de ce qui est coché : sans les
    // chapitres, les notions occupent le premier cran, pas le deuxième.
    const stepAt = (name: (typeof steps)[number]) => Math.max(0, steps.indexOf(name));

    // ── Étage 1 : les chapitres ──
    // Cochés, on les génère ; décochés, on garde ceux de l'atelier tels quels.
    if (withChapters) {
      setPhase({ step: 'running', label: t('progress.chapters'), done: stepAt('chapters'), total: totalSteps });
      const start = await startWorkshopIngestion(workshopId, importId);
      if (!start.ok) return setPhase({ step: 'error', message: start.error });
      discarded.push(...start.discarded);
      adjusted.push(...start.adjusted);
      // Le compteur affiche ce que CET import a créé, pas le total de l'atelier.
      tally.chapters = start.chapters.length;
      setCounts({ ...tally });
    }

    // ⚠️ **Le socle des deux étages suivants est l'atelier ENTIER**, pas ce que
    // l'exécution vient de créer — et c'est relu en base, après l'insertion des
    // nouveaux chapitres, pour que les deux se retrouvent dans la même liste.
    //
    // C'est ce qui fait qu'ajouter un chapitre à un atelier qui en a déjà un
    // complète les DEUX : le nouveau part de zéro, l'ancien se voit proposer ce
    // qui lui manque (chaque passe reçoit son existant et complète au lieu de
    // dupliquer). Auparavant on ne bouclait que sur `start.chapters`, si bien
    // qu'un chapitre déjà en place n'était jamais enrichi par un nouveau
    // document — et, incohérence révélatrice, décocher « chapitres » donnait le
    // comportement attendu tandis que le cocher restreignait le champ.
    //
    // Le coût en découle et il est assumé : un atelier de douze chapitres
    // déclenche douze appels de la passe notions, même si un seul chapitre est
    // nouveau. C'est le prix de « compléter l'atelier » plutôt que « remplir ce
    // qu'on vient de créer » (arbitrage du 22/08/2026).
    const chapters = (await getWorkshopChapters(workshopId)).map((c) => ({ id: c.id, name: c.name }));

    // ⚠️ Grouper par passe, jamais par chapitre — voir l'en-tête du fichier.
    if (withNotions && chapters.length > 0) {
      let error: string | null = null;

      const runChapter = async (chapter: (typeof chapters)[number]) => {
        const result = await ingestChapterNotions(workshopId, importId, chapter, chapters.length);
        if (!result.ok) { error ??= result.error; return; }
        discarded.push(...result.discarded);
        adjusted.push(...result.adjusted);
        tally.notions += result.written;
        setCounts({ ...tally });
      };
      const showNotions = (done: number) => setPhase({
        step: 'running',
        label: t('progress.notionsCount', { done, n: chapters.length }),
        done: stepAt('notions') + done / chapters.length,
        total: totalSteps,
      });

      showNotions(0);
      // ⚠️ **Le premier chapitre part SEUL, et ce n'est pas un détail de style.**
      // Cette passe porte les documents, et le marqueur de cache est posé sur
      // eux : c'est le premier appel qui écrit le cache, les suivants le lisent
      // à 10 % du prix. Lancer les quatre ensemble ferait rater le cache aux
      // quatre — quatre écritures plein tarif au lieu d'une écriture et trois
      // lectures. On paie donc un appel d'attente pour amorcer, et on
      // parallélise le reste : la seule chose qu'on perd est le temps d'un
      // appel, la seule chose qu'on gagnerait à tout lancer d'un coup.
      await runChapter(chapters[0]);
      showNotions(1);
      if (!error && chapters.length > 1) {
        await mapWithConcurrency(
          chapters.slice(1),
          INGEST_CONCURRENCY,
          runChapter,
          (done) => showNotions(1 + done),
        );
      }
      if (error) return setPhase({ step: 'error', message: error });
    }

    // Les documents ont fini de servir : la passe questions ne les reçoit plus
    // (§16.3), et rien ne s'efface tout seul chez le fournisseur (§16.8). On les
    // rend ici plutôt qu'à la toute fin, pour que ça arrive même si les
    // questions échouent. Volontairement non attendu — c'est du ménage.
    void releaseWorkshopImportFiles(workshopId, importId);

    if (withQuestions && chapters.length > 0) {
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
        // ⚠️ **La part du plafond est calculée ici, pas côté serveur.** Le serveur
        // ne voit qu'un appel à la fois : quatre appels concurrents liraient tous
        // le même compteur de questions écrites et se croiraient chacun seuls,
        // donc écriraient chacun jusqu'au plafond entier. Le client, lui, sait
        // combien il en a en vol — il répartit.
        const remaining = MAX_QUESTIONS - tally.questions;
        if (remaining <= 0) return null;
        const share = Math.max(1, Math.floor(remaining / QUESTIONS_CONCURRENCY));
        const result = await ingestChapterQuestions(workshopId, importId, job.chapter, context, job.batchIndex, share);
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

    setIssues({ discarded, adjusted });
    setPhase({ step: 'done' });
    onDone?.();
  }

  return (
    <Modal onClose={running ? undefined : onClose} width={520} portal>
      <div style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Sparkles size={18} color={palette.green} />
          <h2 style={{ fontSize: 17, fontWeight: 600, color: palette.ink, margin: 0 }}>{t('title')}</h2>
        </div>
        <p style={{ fontSize: 13, color: palette.inkSoft, margin: '0 0 18px' }}>{t('subtitle')}</p>

        {phase.step === 'select' && (
          <>
            <SectionLabel>{t('files')}</SectionLabel>
            {files.length === 0 && <Hint>{t('noFiles')}</Hint>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {files.map((file) => {
                const supported = isSupported(file.mimeType);
                const row = (
                  <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: supported ? 1 : 0.45 }}>
                    <Checkbox
                      checked={selected.includes(file.id)}
                      disabled={!supported}
                      onChange={() => toggleFile(file.id)}
                      label={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: palette.inkMuted }}>
                          <FileText size={14} color={palette.inkFaint} />
                          {file.name}
                        </span>
                      }
                    />
                  </div>
                );
                // Un format non pris en charge se dit à la sélection, pas au
                // milieu d'une génération.
                return supported ? row : (
                  <Tooltip key={file.id} content={t('unsupported')}>
                    <span>{row}</span>
                  </Tooltip>
                );
              })}
            </div>

            <SectionLabel>{t('whatToGenerate')}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {/* Les trois cases sont libres, y compris celle-ci. Décocher les
                  chapitres ne vide pas l'atelier : ça veut dire « garde ceux qui
                  existent et complète-les ». Et une case cochée dont le
                  prédécesseur manque est sautée à l'exécution, pas refusée à la
                  saisie — c'est au moment de générer qu'on sait ce que contient
                  vraiment l'atelier. */}
              <Checkbox checked={withChapters} onChange={() => setWithChapters((v) => !v)} label={<Label>{t('scope.chapters')}</Label>} />
              <Checkbox checked={withNotions} onChange={() => setWithNotions((v) => !v)} label={<Label>{t('scope.notions')}</Label>} />
              {/* **Cochable même sans les notions.** Une case qu'on ne peut pas
                  cocher n'explique rien : elle laisse croire à une panne. Chaque
                  étage naît de celui du dessus — une question se rattache à une
                  notion, une notion à un chapitre — et c'est ça qu'il faut dire.
                  On laisse donc choisir, et on annonce la conséquence. */}
              <Checkbox
                checked={withQuestions}
                onChange={() => setWithQuestions((v) => !v)}
                label={<Label>{t(forcedContext === 'exam' ? 'scope.questionsExam' : 'scope.questionsParcours')}</Label>}
              />
              {/* On annonce la dépendance manquante la plus HAUTE : sans
                  chapitres, parler des notions ne servirait à rien. */}
              {!withChapters && (withNotions || withQuestions) && <Hint>{t('needsChapters')}</Hint>}
              {withChapters && withQuestions && !withNotions && <Hint>{t('questionsNeedNotions')}</Hint>}
            </div>

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
              {/* Rien de coché, rien à faire : sans ça le bouton lançait un
                  import qui ne produisait rien et n'affichait aucune étape. */}
              <Primary onClick={prepare} disabled={selected.length === 0 || !(withChapters || withNotions || withQuestions)}>
                {t('generate')}
              </Primary>
            </Actions>
          </>
        )}

        {/* Téléversement des documents chez le fournisseur. L'étape enchaîne
            désormais seule sur la génération : l'écran de confirmation du coût
            qui s'intercalait ici a été retiré le 22/08/2026. */}
        {phase.step === 'preparing' && (
          <div style={{ padding: '4px 0 8px' }}>
            <ProgressBar animated value={0} max={1} label={t('estimate.preparing')} />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 14 }}>{t('estimate.preparingHint')}</p>
          </div>
        )}

        {phase.step === 'running' && (
          <div style={{ padding: '4px 0 8px' }}>
            <ProgressBar animated value={phase.done} max={phase.total} label={phase.label} />
            <p style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 14 }}>{t('keepOpen')}</p>
            <p style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 6 }}>
              {t('runningCounts', { chapters: counts.chapters, notions: counts.notions, questions: counts.questions })}
            </p>
          </div>
        )}

        {phase.step === 'done' && (
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

        {phase.step === 'error' && (
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

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 13.5, color: palette.inkMuted }}>{children}</span>;
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
