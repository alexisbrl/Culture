// Les appels au modèle EN VOL — pour qu'un appel coupé ait quand même un coût.
// 08/10/2026.
//
// ─── Le problème ─────────────────────────────────────────────────────────────
//
// Une tâche coupée par la limite de durée du serveur meurt sans rien écrire :
// pas de ligne au journal, donc pas de coût, alors que le fournisseur, lui, a
// facturé ce qu'il a lu et ce qu'il a écrit jusqu'à la coupure. Le 07/10/2026,
// trois chapitres d'un même cours ont disparu ainsi de la facture calculée.
//
// ─── La réponse : noter l'appel PENDANT qu'il tourne ─────────────────────────
//
// Sur la ligne de sa tâche (`ai_import_tasks.call_progress`), chaque appel
// note en partant qui répond et depuis quand, puis ce qu'il a lu dès que le
// fournisseur le dit (Claude l'annonce au premier évènement de sa réponse ;
// DeepSeek ne le dit qu'à la fin, on note alors la taille de la demande), et
// enfin un signe de vie toutes les `BEAT_MS`. L'appel fini, la note est effacée.
//
// Une note qui reste sur une tâche que la veille déclare coupée est donc un
// appel perdu : la veille en tire une ligne de journal au coût ESTIMÉ —
// l'entrée connue, et une sortie au débit du modèle sur le temps qu'il a vécu,
// à `BEAT_MS` près (`logLostCall`).
//
// Deux règles qui expliquent la forme :
// 1. **Rien ici ne doit faire échouer un appel.** Toute écriture avale ses
//    erreurs — au pire, le coût d'un appel perdu manque.
// 2. **Hors d'une tâche, rien ne se passe.** La tâche courante voyage par un
//    contexte asynchrone posé par l'exécuteur (`withTaskContext`) ; sans lui —
//    tests, appels hors file —, chaque fonction ne fait rien.

import { AsyncLocalStorage } from 'node:async_hooks';

import { getSupabaseServerClient } from '@/lib/supabase';

import { logStep, type FailureCause, type StepLog, type StepName, type StepUsage } from './journal';
import { defaultOutputRate, estimateInputTokens, estimateOutputTokens } from './pricing';

/** Le rythme du signe de vie : la précision, en temps, de l'estimation. */
const BEAT_MS = 15_000;

/** Ce qu'on sait d'un appel en vol. Rangé tel quel en base (`call_progress`). */
export type CallProgress = {
  importId: string;
  workshopId: string;
  step: StepName;
  batch?: number;
  provider: string;
  model?: string;
  startedAt: string;
  lastAliveAt: string;
  /** Connue quand le fournisseur l'annonce (Claude, au départ). */
  inputTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  /** À défaut : la taille de la demande, en caractères (DeepSeek). */
  inputChars?: number;
};

/** Un appel abouti, payé, mais pas encore journalisé : sa ligne s'écrit quand
 *  ce qu'il a produit est connu. S'il reste là quand la tâche échoue, c'est un
 *  appel payé pour rien, et il doit apparaître quand même (`flushUnloggedCall`). */
type Unlogged = { entry: Omit<StepLog, 'status' | 'cause' | 'message'>; token: object };

type TaskContext = {
  taskId: string;
  current: CallProgress | null;
  unlogged: Unlogged | null;
};

const storage = new AsyncLocalStorage<TaskContext>();

/** Exécute `fn` comme le corps de la tâche `taskId`. */
export function withTaskContext<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ taskId, current: null, unlogged: null }, fn);
}

async function writeProgress(taskId: string, progress: CallProgress | null): Promise<void> {
  try {
    const { error } = await getSupabaseServerClient()
      .from('ai_import_tasks')
      .update({ call_progress: progress })
      .eq('id', taskId);
    if (error) console.warn('[ingest] appel en vol non noté :', error.message);
  } catch (error) {
    console.warn('[ingest] appel en vol non noté :', error instanceof Error ? error.message : error);
  }
}

/** Note le départ d'un appel, et bat jusqu'à ce que `end` soit appelé. */
export function beginCall(meta: {
  importId: string;
  workshopId: string;
  step: StepName;
  batch?: number;
  provider: string;
}): { end: () => Promise<void> } {
  const ctx = storage.getStore();
  if (!ctx) return { end: async () => {} };

  const now = new Date().toISOString();
  const progress: CallProgress = { ...meta, startedAt: now, lastAliveAt: now };
  ctx.current = progress;
  void writeProgress(ctx.taskId, progress);

  const timer = setInterval(() => {
    if (ctx.current !== progress) return;
    progress.lastAliveAt = new Date().toISOString();
    void writeProgress(ctx.taskId, progress);
  }, BEAT_MS);
  // Le battement ne doit jamais retenir le processus à lui seul.
  timer.unref?.();

  return {
    end: async () => {
      clearInterval(timer);
      if (ctx.current !== progress) return;
      ctx.current = null;
      await writeProgress(ctx.taskId, null);
    },
  };
}

/** Ce que l'appel en cours a lu, dès que le fournisseur le dit. Appelée par le
 *  fournisseur lui-même ; ne fait rien hors d'une tâche. */
export function reportCallInput(input: {
  model?: string;
  inputTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  inputChars?: number;
}): void {
  const ctx = storage.getStore();
  const progress = ctx?.current;
  if (!ctx || !progress) return;
  Object.assign(progress, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  progress.lastAliveAt = new Date().toISOString();
  void writeProgress(ctx.taskId, progress);
}

/** Garde un appel abouti en attente de sa ligne de journal. */
export function holdUnloggedCall(entry: Unlogged['entry'], token: object): void {
  const ctx = storage.getStore();
  if (ctx) ctx.unlogged = { entry, token };
}

/** Sa ligne vient d'être écrite : plus rien à rattraper. */
export function releaseUnloggedCall(token: object): void {
  const ctx = storage.getStore();
  if (ctx?.unlogged?.token === token) ctx.unlogged = null;
}

/** La tâche échoue après un appel abouti dont la ligne n'a pas été écrite
 *  (écriture refusée, lot annulé…) : l'appel a été payé, il apparaît. */
export async function flushUnloggedCall(cause: FailureCause, message: string): Promise<void> {
  const ctx = storage.getStore();
  const pending = ctx?.unlogged;
  if (!ctx || !pending) return;
  ctx.unlogged = null;
  await logStep({ ...pending.entry, status: 'failed', cause, message });
}

// ─── La veille : l'appel perdu ───────────────────────────────────────────────

/** Le débit de sortie mesuré du modèle : la médiane des derniers appels aboutis
 *  assez longs pour que l'attente du premier jeton ne fausse pas tout. */
async function measuredOutputRate(provider: string, model: string | undefined): Promise<number> {
  try {
    let query = getSupabaseServerClient()
      .from('ai_import_events')
      .select('output_tokens, duration_ms')
      .eq('status', 'ok')
      .eq('provider', provider)
      .gte('duration_ms', 20_000)
      .order('created_at', { ascending: false })
      .limit(40);
    if (model) query = query.eq('model', model);
    const { data, error } = await query;
    if (error || !data || data.length < 5) return defaultOutputRate(provider);
    const rates = data
      .map((r) => (r.output_tokens as number) / ((r.duration_ms as number) / 1000))
      .filter((r) => Number.isFinite(r) && r > 0)
      .sort((a, b) => a - b);
    return rates.length > 0 ? rates[Math.floor(rates.length / 2)] : defaultOutputRate(provider);
  } catch {
    return defaultOutputRate(provider);
  }
}

/** Ce qu'a coûté un appel perdu, estimé — pur, pour être lisible et testé. */
export function lostCallUsage(progress: CallProgress, tokensPerSecond: number): { usage: StepUsage; livedMs: number } {
  const livedMs = Math.max(0, Date.parse(progress.lastAliveAt) - Date.parse(progress.startedAt));
  return {
    livedMs,
    usage: {
      inputTokens: progress.inputTokens ?? estimateInputTokens(progress.inputChars ?? 0),
      outputTokens: estimateOutputTokens(livedMs, tokensPerSecond),
      cachedTokens: progress.cachedTokens ?? 0,
      cacheCreationTokens: progress.cacheCreationTokens ?? 0,
    },
  };
}

/** Écrit la ligne d'un appel que la veille trouve encore noté sur une tâche
 *  coupée, puis efface la note. **Ne lève jamais.** */
export async function logLostCall(taskId: string, raw: unknown): Promise<void> {
  const progress = raw as CallProgress | null;
  if (!progress || !progress.importId || !progress.startedAt) return;
  try {
    const rate = await measuredOutputRate(progress.provider, progress.model);
    const { usage, livedMs } = lostCallUsage(progress, rate);
    await logStep({
      importId: progress.importId,
      workshopId: progress.workshopId,
      step: progress.step,
      batch: progress.batch,
      provider: progress.provider,
      model: progress.model,
      status: 'failed',
      cause: 'timeout',
      message: `appel coupé sans réponse après ${Math.round(livedMs / 1000)} s ; sortie estimée à ${Math.round(rate)} jetons/s`,
      durationMs: livedMs,
      usage,
      estimated: true,
    });
  } finally {
    await writeProgress(taskId, null);
  }
}
