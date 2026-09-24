// La génération côté serveur : ranger les tâches, les exécuter, lancer la suite.
//
// L'onglet ne pilote plus rien (docs/architecture.md §7.11). Il demande une
// génération, puis lit son avancement ; le fermer ne change rien. Trois gestes,
// et tout le reste en découle :
//
//   • `advance`  — relit les tâches du lot, demande la suite à `decide`
//                  (./pipeline, module pur), l'écrit en base, et rend les tâches
//                  à lancer ;
//   • `runTask`  — prend UNE tâche, l'exécute (un appel au modèle au plus), range
//                  son résultat, puis appelle `advance` ;
//   • `watch`    — la veille : reprend UNE fois une tâche coupée par la limite
//                  de durée de l'hébergeur, et relance ce qu'aucun relais n'a pris.
//
// Aucun `'use server'`, aucun `auth()` : les routes et les actions qui appellent
// ce module font le contrôle d'accès en amont (CLAUDE.md §5).

import { getSupabaseServerClient } from '@/lib/supabase';
import { chapterStartBudgets } from './demand';
import { passFailed } from './failure';
import { markOutcome } from './journal';
import { CLOSED_ERROR, beatImport, closeImport } from './lock';
import { planExamCalls } from './passInput';
import {
  MARK,
  PIPELINE_ERRORS,
  decide,
  summarize,
  type ChapterRef,
  type Intent,
  type NotionsResult,
  type PipelineConfig,
  type PipelineSummary,
  type RedundancyResult,
  type TaskKind,
  type TaskPayload,
  type TaskRow,
  type TaskSpec,
  type TaskStatus,
} from './pipeline';
import * as run from './run';

/** Tâches en vol en même temps, par génération. Assez pour lancer d'un coup les
 *  notions de tous les chapitres d'un gros cours, ou toutes les questions d'un
 *  examen de 200 ; le plafond ne borne qu'une boucle emballée. Au-delà, les
 *  tâches attendent qu'une place se libère — chaque fin de tâche en relance. */
export const MAX_TASKS_IN_FLIGHT = 50;

/** Une tâche « en cours » depuis plus longtemps est tenue pour coupée : la
 *  limite de l'hébergeur est de 300 s, et une fonction coupée n'écrit rien. */
export const STALE_TASK_MS = 8 * 60 * 1000;

/** Une tâche coupée est reprise UNE fois ; coupée de nouveau, elle est
 *  abandonnée (décision d'Alexis du 24/09/2026). */
export const MAX_TASK_ATTEMPTS = 2;

/** Une tâche en attente depuis plus longtemps n'a été prise par aucun relais. */
const ORPHAN_TASK_MS = 30 * 1000;

type StoredTask = TaskRow & { id: string; attempts: number; startedAt: string | null; createdAt: string };

type Pipeline = {
  importId: string;
  workshopId: string;
  userId: string;
  closed: boolean;
  outcome: string | null;
  cfg: PipelineConfig;
};

/** Ce qu'il reste à lancer après un geste, et où. */
export type Dispatch = { baseUrl: string; taskIds: string[] };

const NOTHING: Dispatch = { baseUrl: '', taskIds: [] };

// ─── Lecture ─────────────────────────────────────────────────────────────────

async function readPipeline(importId: string): Promise<Pipeline | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_imports')
    .select('id, workshop_id, created_by, closed_at, outcome, scope')
    .eq('id', importId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const cfg = (data?.scope as { pipeline?: PipelineConfig } | null)?.pipeline;
  if (!data || !cfg) return null;
  return {
    importId,
    workshopId: data.workshop_id as string,
    userId: data.created_by as string,
    closed: Boolean(data.closed_at),
    outcome: (data.outcome as string | null) ?? null,
    cfg,
  };
}

async function listTasks(importId: string): Promise<StoredTask[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_import_tasks')
    .select('id, key, kind, status, payload, result, error, attempts, started_at, created_at')
    .eq('import_id', importId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id as string,
    key: t.key as string,
    kind: t.kind as TaskKind,
    status: t.status as TaskStatus,
    payload: (t.payload as TaskPayload | null) ?? {},
    result: t.result,
    error: (t.error as string | null) ?? null,
    attempts: t.attempts as number,
    startedAt: (t.started_at as string | null) ?? null,
    createdAt: t.created_at as string,
  }));
}

/** Les chapitres au programme, dans l'ordre. */
async function visibleChapters(workshopId: string): Promise<(ChapterRef & { position: number })[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('workshop_chapters')
    .select('id, name, position, hidden')
    .eq('workshop_id', workshopId)
    .order('position');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((c) => c.hidden !== true)
    .map((c) => ({ id: c.id as string, name: c.name as string, position: c.position as number }));
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/** Range des tâches — **une clé déjà présente est ignorée** : deux relais qui
 *  planifient la même étape au même instant n'en créent qu'une. Les repères
 *  naissent terminés. Un seul ordre d'écriture pour les tâches ET leur repère :
 *  soit tout est là, soit rien, et la planification recommence à l'identique. */
async function insertTasks(p: Pipeline, specs: readonly TaskSpec[]): Promise<void> {
  if (specs.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('ai_import_tasks').upsert(
    specs.map((s) => ({
      import_id: p.importId,
      workshop_id: p.workshopId,
      key: s.key,
      kind: s.kind,
      payload: s.payload,
      status: s.kind === 'mark' ? 'done' : 'pending',
      finished_at: s.kind === 'mark' ? new Date().toISOString() : null,
    })),
    { onConflict: 'import_id,key', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

const mark = (key: string, payload: TaskPayload = {}): TaskSpec => ({ key, kind: 'mark', payload });

/** Termine une tâche — seulement si c'est toujours CET essai qui la tient : une
 *  tâche reprise par la veille ne se laisse pas écraser par l'essai d'avant. */
async function settleTask(
  task: StoredTask,
  status: 'done' | 'failed' | 'skipped',
  fields: { result?: unknown; error?: string },
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('ai_import_tasks')
    .update({ status, result: fields.result ?? null, error: fields.error ?? null, finished_at: new Date().toISOString() })
    .eq('id', task.id)
    .eq('status', 'running')
    .eq('attempts', task.attempts);
  if (error) console.error('[ingest] tâche non refermée :', task.key, error.message);
}

// ─── La suite ────────────────────────────────────────────────────────────────

async function apply(p: Pipeline, intent: Intent, tasks: readonly StoredTask[]): Promise<void> {
  switch (intent.type) {
    case 'enqueue':
      return insertTasks(p, intent.tasks);

    case 'plan-notions': {
      // Le programme tel qu'il est désormais : chapitres nouveaux et anciens,
      // dans l'ordre. Le budget de démarrage de chacun se calcule ici, sur
      // l'atelier ENTIER, et voyage avec sa tâche (§7.2).
      const chapters = await visibleChapters(p.workshopId);
      const budgets = chapterStartBudgets(chapters);
      return insertTasks(p, [
        ...chapters.map((c): TaskSpec => ({
          key: `notions:${c.id}`,
          kind: 'notions',
          payload: { chapterId: c.id, chapter: { id: c.id, name: c.name }, startBudget: budgets.get(c.id) },
        })),
        mark(MARK.notions),
      ]);
    }

    case 'plan-questions': {
      let chapters: { chapter: ChapterRef; startBudget?: number }[];
      if (intent.chapterIds === 'all') {
        const visible = await visibleChapters(p.workshopId);
        const budgets = chapterStartBudgets(visible);
        chapters = visible.map((c) => ({ chapter: { id: c.id, name: c.name }, startBudget: budgets.get(c.id) }));
      } else {
        const wanted = new Set(intent.chapterIds);
        chapters = tasks
          .filter((t) => t.kind === 'notions' && t.payload.chapterId && wanted.has(t.payload.chapterId))
          .map((t) => ({ chapter: t.payload.chapter as ChapterRef, startBudget: t.payload.startBudget }));
      }
      // Le plan d'un chapitre se calcule sans le modèle, sur l'existant arrêté à
      // l'ouverture du lot : tous ses appels partent ensemble, et chacun puise
      // dans la part du chapitre — jamais dans celle d'un autre.
      const calls = await run.countParcoursCalls(
        p.workshopId,
        p.importId,
        chapters.map((c) => ({ id: c.chapter.id, startBudget: c.startBudget })),
      );
      const specs: TaskSpec[] = [];
      for (const { chapter, startBudget } of chapters) {
        let left = startBudget ?? Number.POSITIVE_INFINITY;
        (calls[chapter.id] ?? []).forEach((asked, batchIndex) => {
          const budgetShare = Math.min(asked, left);
          if (budgetShare <= 0) return;
          left -= budgetShare;
          specs.push({
            key: `questions:${chapter.id}:${batchIndex}`,
            kind: 'questions',
            payload: { chapter, batchIndex, budgetShare, startBudget },
          });
        });
        if (intent.chapterIds !== 'all') specs.push(mark(MARK.questions(chapter.id)));
      }
      if (intent.chapterIds === 'all') specs.push(mark(MARK.questionsAll));
      return insertTasks(p, specs);
    }

    case 'plan-exam': {
      // Chaque appel reçoit le nombre TOTAL d'appels du plan : c'est lui qui
      // découpe le programme, et deux appels du même plan doivent en voir
      // exactement la même découpe pour ne pas se recouvrir.
      const plan = planExamCalls(intent.total);
      return insertTasks(p, [
        ...plan.map((call, index): TaskSpec => ({
          key: `exam:${intent.round}:${index}`,
          kind: 'exam',
          payload: { round: intent.round, slice: { index, count: plan.length, budget: call.budget, grouped: call.grouped } },
        })),
        mark(MARK.exam(intent.round)),
      ]);
    }

    case 'close': {
      // Le verdict d'abord : c'est lui que l'écran lit. Puis le verrou, le
      // journal, et les documents, qui n'ont plus rien à faire chez le
      // fournisseur.
      await insertTasks(p, [{ key: MARK.end, kind: 'mark', payload: {} }]);
      const supabase = getSupabaseServerClient();
      await supabase
        .from('ai_import_tasks')
        .update({ result: { outcome: intent.outcome, error: intent.error } })
        .eq('import_id', p.importId)
        .eq('key', MARK.end);
      await closeImport(p.importId);
      await markOutcome(p.importId, intent.outcome);
      await run.releaseImportDocuments(p.importId);
      return;
    }
  }
}

/** Écrit la suite d'une génération, et rend les tâches à lancer.
 *
 *  Sûr à appeler n'importe quand, par n'importe qui, autant de fois qu'on veut :
 *  tout se déduit de l'état en base. Un lot refermé — terminé ou annulé — ne
 *  planifie plus rien. */
export async function advance(importId: string): Promise<Dispatch> {
  const p = await readPipeline(importId);
  if (!p || p.closed) return NOTHING;

  // Quelques tours au plus : une étape planifiée peut en débloquer une autre
  // aussitôt (un chapitre sans question à écrire, un examen déjà complet).
  for (let round = 0; round < 6; round += 1) {
    const tasks = await listTasks(importId);
    const intents = decide(p.cfg, tasks);
    if (intents.length === 0) break;
    for (const intent of intents) await apply(p, intent, tasks);
    if (intents.some((i) => i.type === 'close')) return NOTHING;
  }

  const tasks = await listTasks(importId);
  const running = tasks.filter((t) => t.status === 'running').length;
  const room = Math.max(0, MAX_TASKS_IN_FLIGHT - running);
  const taskIds = tasks.filter((t) => t.status === 'pending').slice(0, room).map((t) => t.id);
  return { baseUrl: p.cfg.baseUrl, taskIds };
}

// ─── L'exécution d'une tâche ─────────────────────────────────────────────────

async function execute(p: Pipeline, task: StoredTask): Promise<unknown> {
  const { workshopId, userId, importId } = p;
  const payload = task.payload;
  switch (task.kind) {
    case 'resource':
      return run.ingestResource(workshopId, userId, importId);
    case 'chapters':
      return run.ingestChapters(workshopId, userId, importId);
    case 'chapters-relaunch':
      return run.ingestChaptersRelaunch(workshopId, userId, importId);
    case 'notions':
      return run.ingestChapterNotions(workshopId, userId, importId, payload.chapterId as string);
    case 'questions':
      return run.ingestParcoursQuestions(workshopId, userId, importId, payload.chapter as ChapterRef, payload.batchIndex ?? 0, {
        budgetShare: payload.budgetShare,
        startBudget: payload.startBudget,
        demand: payload.demand,
      });
    case 'redites':
      return run.ingestRedites(workshopId, importId);
    case 'finish': {
      // Les réclamations de chaque chapitre et les redites jugées : relues ici,
      // dans les résultats des tâches, et revalidées par la finalisation.
      const tasks = await listTasks(importId);
      const claims = tasks
        .filter((t) => t.kind === 'notions' && t.status === 'done')
        .map((t) => ({ chapterId: t.payload.chapterId as string, notionIds: (t.result as NotionsResult).claimed ?? [] }))
        .filter((c) => c.notionIds.length > 0);
      const redites = tasks.find((t) => t.key === 'redites' && t.status === 'done');
      const removals = (redites?.result as RedundancyResult | undefined)?.removals ?? [];
      const result = await run.finishIngestion(workshopId, importId, claims, removals);
      return { adjusted: result.adjusted };
    }
    case 'exam':
      return run.ingestExamQuestions(workshopId, userId, importId, payload.slice as NonNullable<TaskPayload['slice']>);
    case 'mark':
      return {};
  }
}

/** Prend la tâche si elle est toujours en attente. Deux relais peuvent viser la
 *  même tâche : un seul l'obtient. */
async function claim(taskId: string): Promise<(StoredTask & { importId: string }) | null> {
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase
    .from('ai_import_tasks')
    .select('id, import_id, attempts')
    .eq('id', taskId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error || !row) return null;
  const { data, error: updateError } = await supabase
    .from('ai_import_tasks')
    .update({ status: 'running', attempts: (row.attempts as number) + 1, started_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('status', 'pending')
    .eq('attempts', row.attempts)
    .select('id, import_id, key, kind, status, payload, result, error, attempts, started_at, created_at')
    .maybeSingle();
  if (updateError || !data) return null;
  return {
    id: data.id as string,
    importId: data.import_id as string,
    key: data.key as string,
    kind: data.kind as TaskKind,
    status: data.status as TaskStatus,
    payload: (data.payload as TaskPayload | null) ?? {},
    result: data.result,
    error: null,
    attempts: data.attempts as number,
    startedAt: data.started_at as string,
    createdAt: data.created_at as string,
  };
}

/** Exécute une tâche, range son issue, et rend la suite à lancer. **Ne lève
 *  jamais** : une tâche en échec est une ligne de plus, pas une exception. */
export async function runTask(taskId: string): Promise<Dispatch> {
  const task = await claim(taskId);
  if (!task) return NOTHING;

  try {
    const p = await readPipeline(task.importId);
    if (!p || p.closed) {
      await settleTask(task, 'skipped', {});
      return NOTHING;
    }
    // Le signe de vie du lot : c'est lui qui interdit une seconde génération sur
    // le même atelier. La recharge automatique n'en émet jamais (@/lib/ingest/lock).
    const live = p.cfg.kind !== 'refill';
    if (live) await beatImport(p.importId);

    try {
      const result = await execute(p, task);
      await settleTask(task, 'done', { result });
    } catch (error) {
      const detail = passFailed(task.key, error, { workshopId: p.workshopId, importId: p.importId, task: task.key });
      await settleTask(task, detail === CLOSED_ERROR ? 'skipped' : 'failed', { error: detail });
    }

    if (live) await beatImport(p.importId);
    return await advance(p.importId);
  } catch (error) {
    // La base elle-même a flanché : la tâche reste « en cours », la veille la
    // reprendra une fois — c'est exactement son rôle.
    console.error('[ingest] tâche interrompue :', task.key, error instanceof Error ? error.message : error);
    return NOTHING;
  }
}

// ─── La veille ───────────────────────────────────────────────────────────────

/** Reprend ce qui s'est perdu en route, et rend la suite à lancer.
 *
 *  - une tâche coupée (« en cours » depuis plus de `STALE_TASK_MS`) repart une
 *    fois ; coupée de nouveau, elle est abandonnée ;
 *  - une tâche en attente qu'aucun relais n'a prise est relancée.
 *
 *  `importId` : la veille d'UN lot, faite à chaque lecture d'avancement par
 *  l'écran. Sans lui : tous les lots ouverts par ce serveur (`baseUrl`) — la
 *  veille planifiée. Un lot ouvert par un autre serveur (le développement local
 *  partage la base) ne se touche jamais : c'est à son serveur de le mener. */
export async function watch(options: { importId?: string; baseUrl?: string }): Promise<Dispatch[]> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from('ai_import_tasks')
    .select('id, import_id, status, attempts, started_at, created_at')
    .in('status', ['pending', 'running']);
  if (options.importId) query = query.eq('import_id', options.importId);
  const { data, error } = await query;
  if (error) {
    console.error('[ingest] veille impossible :', error.message);
    return [];
  }

  const now = Date.now();
  const touched = new Set<string>();
  for (const t of data ?? []) {
    const importId = t.import_id as string;
    if (t.status === 'running') {
      const started = t.started_at ? Date.parse(t.started_at as string) : now;
      if (now - started < STALE_TASK_MS) continue;
      const retry = (t.attempts as number) < MAX_TASK_ATTEMPTS;
      await supabase
        .from('ai_import_tasks')
        .update(retry
          ? { status: 'pending' }
          : { status: 'failed', error: PIPELINE_ERRORS.timeout, finished_at: new Date().toISOString() })
        .eq('id', t.id)
        .eq('status', 'running')
        .eq('attempts', t.attempts);
      touched.add(importId);
    } else if (now - Date.parse(t.created_at as string) > ORPHAN_TASK_MS) {
      touched.add(importId);
    }
  }
  if (options.importId) touched.add(options.importId);

  const dispatches: Dispatch[] = [];
  for (const importId of touched) {
    const p = await readPipeline(importId).catch(() => null);
    if (!p || p.closed) continue;
    if (options.baseUrl && p.cfg.baseUrl !== options.baseUrl) continue;
    dispatches.push(await advance(importId));
  }
  return dispatches;
}

// ─── Le lancement, et ce que l'écran lit ─────────────────────────────────────

export type StartInput = {
  fileIds: string[];
  context: 'parcours' | 'exam';
  withResource: boolean;
  needsProgram: boolean;
  visibleNotions: number;
  examTarget: number;
  hint: string;
  origin: string | null;
  baseUrl: string;
};

/** Ouvre le lot, téléverse les documents, et range la première tâche.
 *  Lève `BUSY_ERROR` si une génération tourne déjà sur l'atelier. */
export async function startGeneration(
  workshopId: string,
  userId: string,
  input: StartInput,
): Promise<{ importId: string; dispatch: Dispatch }> {
  const cfg: PipelineConfig = {
    kind: 'generation',
    context: input.context,
    withResource: input.withResource,
    needsProgram: input.needsProgram,
    documents: 0,
    visibleNotions: input.visibleNotions,
    examTarget: input.examTarget,
    baseUrl: input.baseUrl,
  };
  const prepared = await run.prepareIngestion(workshopId, userId, input.fileIds, {
    scope: {
      program: input.needsProgram,
      context: input.context,
      examQuestions: input.context === 'exam' ? input.examTarget : undefined,
      hint: input.hint,
      origin: input.origin,
      pipeline: cfg,
    },
  });

  // Le nombre de documents n'est connu qu'une fois le corpus ouvert. Aucune
  // tâche ne tourne encore : personne d'autre n'écrit le `scope` à cet instant.
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', prepared.importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  await supabase
    .from('ai_imports')
    .update({ scope: { ...scope, pipeline: { ...cfg, documents: prepared.documents } } })
    .eq('id', prepared.importId);

  return { importId: prepared.importId, dispatch: await advance(prepared.importId) };
}

/** La recharge automatique : ses tâches sont toutes connues au départ. */
export async function startRefill(
  workshopId: string,
  importId: string,
  chapter: ChapterRef,
  calls: readonly { batchIndex: number }[],
  demand: TaskPayload['demand'],
  baseUrl: string,
): Promise<Dispatch> {
  const cfg: PipelineConfig = {
    kind: 'refill', context: 'parcours', withResource: false, needsProgram: false,
    documents: 0, visibleNotions: 0, examTarget: 0, baseUrl,
  };
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope, created_by').eq('id', importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  await supabase.from('ai_imports').update({ scope: { ...scope, pipeline: cfg } }).eq('id', importId);

  const p: Pipeline = { importId, workshopId, userId: data?.created_by as string, closed: false, outcome: null, cfg };
  await insertTasks(p, calls.map(({ batchIndex }) => ({
    key: `questions:${chapter.id}:${batchIndex}`,
    kind: 'questions' as const,
    payload: { chapter, batchIndex, demand },
  })));
  return advance(importId);
}

export type GenerationStatus = PipelineSummary & { importId: string };

/** L'avancement d'une génération, tel que l'écran le montre. `null` : ce lot
 *  n'est pas une génération pilotée par le serveur. */
export async function generationStatus(importId: string): Promise<GenerationStatus | null> {
  const p = await readPipeline(importId);
  if (!p) return null;
  const tasks = await listTasks(importId);
  const summary = summarize(p.cfg, tasks, p.outcome);
  // Un lot refermé sans verdict a été annulé par quelqu'un.
  if (summary.state === 'running' && p.closed) return { ...summary, importId, state: 'stopped' };
  return { ...summary, importId };
}

/** La génération en cours sur cet atelier, s'il y en a une — hors recharges. */
export async function liveGenerationOf(workshopId: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_imports')
    .select('id, scope')
    .eq('workshop_id', workshopId)
    .is('closed_at', null)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return null;
  for (const row of data ?? []) {
    const cfg = (row.scope as { pipeline?: PipelineConfig } | null)?.pipeline;
    if (!cfg || cfg.kind !== 'generation') continue;
    const { data: active } = await supabase
      .from('ai_import_tasks')
      .select('id')
      .eq('import_id', row.id)
      .in('status', ['pending', 'running'])
      .limit(1);
    if ((active ?? []).length > 0) return row.id as string;
  }
  return null;
}

