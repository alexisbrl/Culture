// L'enchaînement d'une génération, décidé SANS réseau ni base — module PUR.
//
// La génération ne vit plus dans l'onglet (docs/architecture.md §7.11) : chaque
// appel au modèle est une tâche rangée en base, et chaque tâche qui se termine
// demande « et maintenant ? ». La réponse est ici, et seulement ici : on relit
// toutes les tâches du lot, et on en déduit ce qui manque. Rien n'est retenu
// ailleurs — une fonction serveur peut mourir entre deux tâches, la suivante
// retrouve tout en relisant la table.
//
// ─── Pourquoi « relire tout » plutôt que « passer la main » ──────────────────
//
// Les tâches se terminent en parallèle, et plusieurs relais peuvent demander la
// suite au même instant. Une décision tirée de l'état complet est la même pour
// tous : deux relais qui planifient la même étape écrivent les mêmes clés, et la
// base n'en garde qu'une (`unique (import_id, key)`). C'est ce qui rend
// l'enchaînement sûr sans verrou.
//
// L'ordre des étapes est celui de docs/architecture.md §7 : l'étape 0 si une
// consigne l'appelle, les CHAPITRES, les NOTIONS de chaque chapitre — chacun
// planifiant ses questions dès qu'il a fini —, les redites, la finalisation ;
// puis l'examen s'il y en a un.

import type { PlanIssue } from './planSchema';
import type { ThresholdDecision } from './verdicts';
import type { QuestionDemand } from './demand';
import { MAX_QUESTIONS_PER_IMPORT } from './prompt';

export type TaskKind =
  | 'resource'
  | 'chapters'
  | 'chapters-relaunch'
  | 'notions'
  | 'questions'
  | 'redites'
  | 'finish'
  | 'exam'
  /** Repère de planification : « cette étape a déjà été planifiée ». Jamais
   *  exécuté — il naît terminé. Sans lui, une étape qui n'a produit AUCUNE
   *  tâche (un chapitre sans question à écrire) serait replanifiée à l'infini. */
  | 'mark';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export const TERMINAL: ReadonlySet<TaskStatus> = new Set(['done', 'failed', 'skipped']);

export type ChapterRef = { id: string; name: string };

export type TaskPayload = {
  chapterId?: string;
  chapter?: ChapterRef;
  batchIndex?: number;
  budgetShare?: number;
  startBudget?: number;
  demand?: QuestionDemand[];
  round?: 1 | 2;
  slice?: { index: number; count: number; budget: number; grouped: boolean };
};

export type TaskRow = {
  key: string;
  kind: TaskKind;
  status: TaskStatus;
  payload: TaskPayload;
  result: unknown;
  error: string | null;
};

export type TaskSpec = { key: string; kind: TaskKind; payload: TaskPayload };

/** Ce que l'écran a décidé au lancement, figé dans le lot. */
export type PipelineConfig = {
  /** `refill` : la recharge automatique, dont les tâches sont toutes connues au
   *  départ — il n'y a qu'à attendre qu'elles finissent. */
  kind: 'generation' | 'refill';
  context: 'parcours' | 'exam';
  withResource: boolean;
  needsProgram: boolean;
  /** Documents du lot à l'ouverture — l'étape 0 peut en ajouter un. */
  documents: number;
  /** Notions au programme à l'ouverture. */
  visibleNotions: number;
  /** Le total d'examen demandé au lancement — l'étape 0 peut le corriger. */
  examTarget: number;
  /** Où joindre le serveur qui a ouvert le lot : c'est à lui, et à lui seul, que
   *  les relais s'adressent (le développement local partage la base avec la
   *  production). */
  baseUrl: string;
};

// ─── Ce que rendent les tâches ───────────────────────────────────────────────

export type ResourceResult = { written: boolean; documents: number; examQuestionCount: number | null };
export type ChaptersResult = {
  chapters: ChapterRef[];
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
  decision: ThresholdDecision;
};
export type NotionsResult = { written: number; discarded: PlanIssue[]; adjusted: PlanIssue[]; claimed: string[] };
export type QuestionsResult = { written: number; discarded: PlanIssue[]; adjusted: PlanIssue[] };
export type RedundancyResult = { removed: number; removals: { remove: string; keep: string }[]; adjusted: PlanIssue[] };
export type FinishResult = { adjusted: PlanIssue[] };
export type EndResult = { outcome: 'finished' | 'failed'; error?: string };

/** Les échecs que l'écran sait dire dans sa langue — le serveur ne rend que
 *  le mot-clé. Tout autre échec voyage avec le message brut de l'étape. */
export const PIPELINE_ERRORS = {
  writtenNotRead: 'PIPELINE_WRITTEN_NOT_READ',
  nothingWritten: 'PIPELINE_NOTHING_WRITTEN',
  cancelledForgotten: 'PIPELINE_CANCELLED_FORGOTTEN',
  timeout: 'PIPELINE_TIMEOUT',
} as const;

export const MARK = {
  notions: 'mark:notions',
  questionsAll: 'mark:questions:all',
  questions: (chapterId: string) => `mark:questions:${chapterId}`,
  exam: (round: 1 | 2) => `mark:exam:${round}`,
  /** Le verdict final, posé à la fermeture — c'est lui que l'écran lit. */
  end: 'mark:end',
} as const;

/** Ce que la suite demande. Les planifications ont besoin de la base (chapitres
 *  au programme, stock de questions) : elles sont DÉCIDÉES ici et EXÉCUTÉES par
 *  l'orchestrateur, qui pose leur repère en même temps que leurs tâches. */
export type Intent =
  | { type: 'enqueue'; tasks: TaskSpec[] }
  | { type: 'plan-notions' }
  | { type: 'plan-questions'; chapterIds: string[] | 'all' }
  | { type: 'plan-exam'; round: 1 | 2; total: number }
  | { type: 'close'; outcome: 'finished' | 'failed'; error?: string };

const one = (kind: TaskKind): TaskSpec => ({ key: kind, kind, payload: {} });
const isTerminal = (task: TaskRow | undefined) => Boolean(task && TERMINAL.has(task.status));
const writtenOf = (task: TaskRow) => (task.status === 'done' ? ((task.result as QuestionsResult | null)?.written ?? 0) : 0);

/** La suite d'une génération. Une liste vide veut dire : attendre.
 *
 *  ⚠️ **On ne ferme jamais un lot qui a encore des tâches en vol**, même en
 *  échec : ce qui est parti est payé et écrit ce qu'il produit, et le
 *  compte-rendu doit le compter. */
export function decide(cfg: PipelineConfig, tasks: readonly TaskRow[]): Intent[] {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const active = tasks.some((t) => !TERMINAL.has(t.status));
  const fail = (error: string): Intent[] => (active ? [] : [{ type: 'close', outcome: 'failed', error }]);
  const finished = (): Intent[] => (active ? [] : [{ type: 'close', outcome: 'finished' }]);

  // La recharge part avec toutes ses tâches : il n'y a qu'à les attendre.
  if (cfg.kind === 'refill') return finished();

  // ── Étape 0 : la consigne, et la matière qui manque ──
  let documents = cfg.documents;
  let examTarget = cfg.examTarget;
  if (cfg.withResource) {
    const resource = byKey.get('resource');
    if (!resource) return [{ type: 'enqueue', tasks: [one('resource')] }];
    if (!isTerminal(resource)) return [];
    if (resource.status !== 'done') return fail(resource.error ?? 'resource');
    const r = resource.result as ResourceResult;
    documents = r.documents;
    if (r.examQuestionCount !== null) examTarget = r.examQuestionCount;
    // Deux échecs à ne pas confondre : « elle a écrit, mais son document n'a pas
    // pu être relu » et « elle n'a rien écrit, et il n'y a rien d'autre ».
    if (r.written && documents === 0) return fail(PIPELINE_ERRORS.writtenNotRead);
    if (!r.written && cfg.visibleNotions === 0) return fail(PIPELINE_ERRORS.nothingWritten);
  }

  // Pas de document, pas de découpage : des chapitres sans cours seraient inventés.
  if (cfg.needsProgram && documents > 0) {
    // ── Étape 1 : les chapitres, et la relance si trop de notions sont oubliées ──
    const chapters = byKey.get('chapters');
    if (!chapters) return [{ type: 'enqueue', tasks: [one('chapters')] }];
    if (!isTerminal(chapters)) return [];
    if (chapters.status !== 'done') return fail(chapters.error ?? 'chapters');
    let decision = (chapters.result as ChaptersResult).decision;
    if (decision === 'relaunch') {
      const relaunch = byKey.get('chapters-relaunch');
      if (!relaunch) return [{ type: 'enqueue', tasks: [one('chapters-relaunch')] }];
      if (!isTerminal(relaunch)) return [];
      if (relaunch.status !== 'done') return fail(relaunch.error ?? 'chapters-relaunch');
      decision = (relaunch.result as ChaptersResult).decision;
    }
    if (decision === 'cancel') return fail(PIPELINE_ERRORS.cancelledForgotten);

    // ── Étape 2 : les notions, un chapitre par tâche ──
    if (!byKey.has(MARK.notions)) return [{ type: 'plan-notions' }];
    const notions = tasks.filter((t) => t.kind === 'notions');

    // Un chapitre qui a fini ses notions planifie ses questions tout de suite,
    // sans attendre les autres (§7.2).
    const intents: Intent[] = [];
    if (cfg.context === 'parcours') {
      const ready = notions
        .filter((t) => t.status === 'done' && t.payload.chapterId && !byKey.has(MARK.questions(t.payload.chapterId)))
        .map((t) => t.payload.chapterId as string);
      if (ready.length > 0) intents.push({ type: 'plan-questions', chapterIds: ready });
    }
    if (notions.some((t) => !TERMINAL.has(t.status))) return intents;

    // ⚠️ **Un chapitre dont les notions ont échoué arrête tout, sans ménage.** Il
    // n'a pas pu réclamer les notions de la seconde vérification : finaliser
    // sans lui sortirait du programme des notions qu'il aurait gardées.
    const failedNotions = notions.find((t) => t.status !== 'done');
    if (failedNotions) return intents.length > 0 ? intents : fail(failedNotions.error ?? 'notions');

    // ── Les redites, en même temps que les questions encore en vol ──
    const redites = byKey.get('redites');
    if (!redites) return [...intents, { type: 'enqueue', tasks: [one('redites')] }];
    if (intents.length > 0) return intents;

    // ── La finalisation, une fois TOUTES les questions écrites ──
    // Elle a lieu même si des appels de questions ont échoué : quelques
    // questions manquantes ne justifient pas de laisser le programme à moitié
    // rangé. L'écran dit combien manquent.
    const questionsInFlight = tasks.some((t) => t.kind === 'questions' && !TERMINAL.has(t.status));
    if (!isTerminal(redites) || questionsInFlight) return [];
    const finish = byKey.get('finish');
    if (!finish) return [{ type: 'enqueue', tasks: [one('finish')] }];
    if (!isTerminal(finish)) return [];
  } else if (cfg.context === 'parcours') {
    // Pas de programme à construire : les questions qui manquent à chaque
    // chapitre existant.
    if (!byKey.has(MARK.questionsAll)) return [{ type: 'plan-questions', chapterIds: 'all' }];
  }

  // ── L'examen : une vague, puis un seul rattrapage ──
  if (cfg.context === 'exam') {
    const total = Math.min(examTarget, MAX_QUESTIONS_PER_IMPORT);
    if (!byKey.has(MARK.exam(1))) return [{ type: 'plan-exam', round: 1, total }];
    const first = tasks.filter((t) => t.kind === 'exam' && t.payload.round === 1);
    if (first.some((t) => !TERMINAL.has(t.status))) return [];
    // Le rattrapage redemande le MANQUE, une fois. Pas après deux appels à vide
    // (décision du 05/09/2026 : insister n'a jamais rien changé), ni après une
    // panne — le manque n'y vient pas d'un programme trop pauvre.
    const written = first.reduce((sum, t) => sum + writtenOf(t), 0);
    const empties = first.filter((t) => t.status === 'done' && writtenOf(t) === 0).length;
    const failed = first.some((t) => t.status !== 'done');
    const short = total - written;
    if (short > 0 && empties < 2 && !failed && !byKey.has(MARK.exam(2))) {
      return [{ type: 'plan-exam', round: 2, total: short }];
    }
  }

  return finished();
}

// ─── Ce que l'écran affiche ──────────────────────────────────────────────────

export type PipelineStep = 'resource' | 'chapters' | 'chaptersRelaunch' | 'notions' | 'questions';

export type PipelineSummary = {
  state: 'running' | 'done' | 'failed' | 'stopped';
  /** L'étape en cours, et son avancement quand elle se compte en tâches. */
  step: PipelineStep;
  stepDone: number;
  stepTotal: number;
  /** La barre : une unité par étape prévue. */
  progress: number;
  progressMax: number;
  counts: { chapters: number; notions: number; questions: number };
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
  /** Questions demandées à des appels qui ont échoué — dit à l'écran, jamais tu. */
  missingQuestions: number;
  error: string | null;
};

const issuesOf = (task: TaskRow | undefined, field: 'discarded' | 'adjusted'): PlanIssue[] => {
  if (!task || task.status !== 'done') return [];
  const list = (task.result as Record<string, unknown> | null)?.[field];
  return Array.isArray(list) ? (list as PlanIssue[]) : [];
};

/** L'état d'une génération, tel que l'écran le montre. `outcome` est l'issue
 *  enregistrée au journal — c'est elle qui dit « arrêtée ». */
export function summarize(cfg: PipelineConfig, tasks: readonly TaskRow[], outcome: string | null): PipelineSummary {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const of = (kind: TaskKind) => tasks.filter((t) => t.kind === kind);
  const doneCount = (list: TaskRow[]) => list.filter((t) => TERMINAL.has(t.status)).length;

  const chapters = byKey.get('chapters');
  const relaunch = byKey.get('chapters-relaunch');
  // La relance rend les écarts des deux appels : elle remplace ceux du premier.
  const structure = relaunch?.status === 'done' ? relaunch : chapters;
  const structureResult = structure?.status === 'done' ? (structure.result as ChaptersResult) : null;
  const notions = of('notions');
  const questions = [...of('questions'), ...of('exam')];
  const redites = byKey.get('redites');
  const redundancy = redites?.status === 'done' ? (redites.result as RedundancyResult) : null;

  const counts = {
    chapters: structureResult?.decision === 'continue' ? structureResult.chapters.length : 0,
    notions: notions.reduce((sum, t) => sum + writtenOf(t), 0) - (redundancy?.removed ?? 0),
    questions: questions.reduce((sum, t) => sum + writtenOf(t), 0),
  };

  const discarded = [structure, ...notions, ...questions].flatMap((t) => issuesOf(t, 'discarded'));
  const adjusted = [structure, ...notions, ...questions, redites, byKey.get('finish')].flatMap((t) => issuesOf(t, 'adjusted'));
  const missingQuestions = questions
    .filter((t) => t.status === 'failed')
    .reduce((sum, t) => sum + (t.payload.budgetShare ?? t.payload.slice?.budget ?? 0), 0);

  // L'étape en cours : la première qui n'est pas terminée.
  const steps: PipelineStep[] = [];
  if (cfg.withResource) steps.push('resource');
  if (cfg.needsProgram) steps.push('chapters', 'notions');
  steps.push('questions');
  const stepValue = (step: PipelineStep): number => {
    switch (step) {
      case 'resource': return isTerminal(byKey.get('resource')) ? 1 : 0;
      case 'chapters':
      case 'chaptersRelaunch':
        return isTerminal(chapters) && (!relaunch || isTerminal(relaunch)) ? 1 : 0;
      case 'notions':
        if (!byKey.has(MARK.notions)) return 0;
        return notions.length === 0 ? 1 : doneCount(notions) / notions.length;
      case 'questions':
        return questions.length === 0 ? 0 : doneCount(questions) / questions.length;
    }
  };
  const current = steps.find((s) => stepValue(s) < 1) ?? 'questions';
  const step: PipelineStep = current === 'chapters' && relaunch ? 'chaptersRelaunch' : current;
  const stepTasks = current === 'notions' ? notions : current === 'questions' ? questions : [];

  const end = byKey.get(MARK.end);
  const endResult = (end?.result as EndResult | null) ?? null;
  const state: PipelineSummary['state'] = outcome === 'stopped'
    ? 'stopped'
    : endResult
      ? (endResult.outcome === 'finished' ? 'done' : 'failed')
      : 'running';

  return {
    state,
    step,
    stepDone: doneCount(stepTasks),
    stepTotal: stepTasks.length,
    progress: steps.reduce((sum, s) => sum + stepValue(s), 0),
    progressMax: steps.length,
    counts,
    discarded,
    adjusted,
    missingQuestions,
    error: endResult?.error ?? null,
  };
}
