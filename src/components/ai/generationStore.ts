'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { cancelWorkshopImport, startWorkshopGeneration, type PlanIssue } from '@/app/actions/aiIngest';
import type { PipelineSummary } from '@/lib/ingest/pipeline';

// L'état de la génération par IA d'un atelier, PARTAGÉ par tout l'onglet.
//
// ─── Pourquoi un état partagé ────────────────────────────────────────────────
//
// Une génération se voit à plusieurs endroits à la fois : les deux boutons des
// Paramètres (Ressources, Chapitre & Notion), les listes de questions, le
// bandeau des générations terminées, et toutes les listes qui reçoivent ce
// qu'elle écrit. Chacun lisant de son côté, lancer depuis un endroit ne se
// voyait ailleurs qu'au rechargement de la page. Ici, un seul suivi par atelier,
// et tous les écrans s'y abonnent : le bouton bascule à l'instant du lancement,
// partout, et les listes se relisent à mesure que la génération écrit.
//
// Le suivi passe par la route d'avancement (`/api/ingest/status`) et jamais par
// une server action : les actions d'un onglet passent une par une, et une
// lecture toutes les deux secondes ferait patienter tout le reste de l'écran.
//
// ─── Ce qui fait avancer `version` ──────────────────────────────────────────
//
// `version` monte chaque fois que l'atelier a changé de contenu : la génération
// a écrit (au plus une fois toutes les `REFRESH_EVERY_MS`, pour ne pas
// encombrer la file des actions de relectures), elle s'est terminée, elle a été
// arrêtée, ou une génération passée a été annulée. Les écrans qui montrent ce
// contenu se relisent à chaque montée (`useGenerationRefresh`).

/** Rythme de lecture de l'avancement pendant qu'une génération tourne. */
const RUNNING_POLL_MS = 2_500;
/** Rythme de la question « une génération a-t-elle été lancée ailleurs ? »,
 *  quand rien ne tourne. Même cadence que les autres données vivantes du site
 *  (`useLiveData`) : on ne sonde qu'un onglet visible. */
const IDLE_POLL_MS = 30_000;
/** Les listes se relisent au plus une fois par intervalle pendant qu'une
 *  génération écrit : chaque relecture est une server action, qui passe devant
 *  ce que l'utilisateur ferait au même moment. */
const REFRESH_EVERY_MS = 8_000;

/** Ce qui s'est mal passé, dit à côté du bouton. Rien quand tout va bien : les
 *  éléments apparaissent, c'est le seul compte-rendu qu'il faut. */
export type GenerationProblem =
  /** Une génération tournait déjà : le lancement a été refusé. */
  | { kind: 'busy' }
  /** La génération a échoué. `error` : un code de `PIPELINE_ERRORS` ou le
   *  message brut de l'étape. */
  | { kind: 'failed'; error: string | null }
  /** Terminée, mais pas entière : des questions manquent, ou des éléments
   *  proposés par le modèle ont été écartés. */
  | { kind: 'partial'; missing: number; discarded: PlanIssue[] };

export type GenerationState = {
  /** Une génération tourne (ou est en train d'être lancée). */
  running: boolean;
  /** Le lot suivi ; `null` pendant le lancement, avant que le serveur l'ait ouvert. */
  importId: string | null;
  problem: GenerationProblem | null;
  /** Avancement, de 0 à 100 — une unité par étape prévue (`PipelineSummary`). */
  progress: number;
  /** Vrai un court instant après une génération réussie : le bouton le dit
   *  d'une coche avant de redevenir lui-même. */
  done: boolean;
  version: number;
};

const IDLE: GenerationState = { running: false, importId: null, problem: null, progress: 0, done: false, version: 0 };

/** Durée pendant laquelle le bouton montre sa coche une fois la génération réussie. */
const DONE_FLASH_MS = 1_800;

type Entry = {
  state: GenerationState;
  listeners: Set<() => void>;
  /** Jeton du suivi en cours : tout suivi parti sous un autre jeton s'arrête. */
  token: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  lastCounts: string;
  lastBump: number;
};

const entries = new Map<string, Entry>();

function entryOf(workshopId: string): Entry {
  let entry = entries.get(workshopId);
  if (!entry) {
    entry = { state: IDLE, listeners: new Set(), token: 0, timer: undefined, lastCounts: '', lastBump: 0 };
    entries.set(workshopId, entry);
  }
  return entry;
}

function set(entry: Entry, patch: Partial<GenerationState>) {
  entry.state = { ...entry.state, ...patch };
  entry.listeners.forEach((l) => l());
}

function bump(entry: Entry) {
  entry.lastBump = Date.now();
  set(entry, { version: entry.state.version + 1 });
}

type StatusBody =
  | ({ ok: true; importId: string } & PipelineSummary)
  | { ok: true; importId: null }
  | { ok: false };

/** `null` : lecture ratée — on réessaiera au tour suivant. */
async function readStatus(workshopId: string, importId: string | null): Promise<StatusBody | null> {
  try {
    const params = new URLSearchParams({ workshopId });
    if (importId) params.set('importId', importId);
    const res = await fetch(`/api/ingest/status?${params}`, { cache: 'no-store' });
    if (res.status === 403) return { ok: false };
    if (!res.ok) return null;
    return (await res.json()) as StatusBody;
  } catch {
    return null;
  }
}

/** Relance le suivi de zéro : tout suivi précédent s'arrête au prochain tour. */
function restart(workshopId: string, entry: Entry, first: () => void) {
  entry.token += 1;
  clearTimeout(entry.timer);
  entry.timer = undefined;
  first();
}

function schedule(workshopId: string, entry: Entry, token: number, delay: number) {
  if (token !== entry.token || entry.listeners.size === 0) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => { void tick(workshopId, entry, token); }, delay);
}

async function tick(workshopId: string, entry: Entry, token: number) {
  if (token !== entry.token) return;
  const followed = entry.state.importId;
  // Rien ne tourne et l'onglet est caché : on attendra le retour sur l'onglet.
  if (!entry.state.running && typeof document !== 'undefined' && document.hidden) return;

  const status = await readStatus(workshopId, followed);
  if (token !== entry.token) return;
  // Pas les droits (un simple membre) : il n'y a rien à suivre, et rien à
  // redemander.
  if (status && !status.ok) return;
  if (!status) return schedule(workshopId, entry, token, entry.state.running ? RUNNING_POLL_MS : IDLE_POLL_MS);

  if (status.importId === null) {
    if (entry.state.running) set(entry, { running: false, importId: null });
    return schedule(workshopId, entry, token, IDLE_POLL_MS);
  }

  if (status.state === 'running') {
    const progress = status.progressMax > 0 ? Math.round((100 * status.progress) / status.progressMax) : 0;
    if (!entry.state.running || entry.state.importId !== status.importId || entry.state.progress !== progress) {
      set(entry, { running: true, importId: status.importId, problem: null, done: false, progress });
    }
    const counts = JSON.stringify(status.counts);
    if (counts !== entry.lastCounts) {
      entry.lastCounts = counts;
      if (Date.now() - entry.lastBump >= REFRESH_EVERY_MS) bump(entry);
    }
    return schedule(workshopId, entry, token, RUNNING_POLL_MS);
  }

  // Terminée — ou arrêtée, ou en échec. Une génération trouvée déjà finie en
  // arrivant n'existe pas ici : sans `importId`, la route ne rend que celle qui
  // tourne.
  const problem: GenerationProblem | null =
    status.state === 'failed'
      ? { kind: 'failed', error: status.error }
      : status.state === 'done' && (status.missingQuestions > 0 || status.discarded.length > 0)
        ? { kind: 'partial', missing: status.missingQuestions, discarded: status.discarded }
        : null;
  entry.lastCounts = '';
  const done = status.state === 'done' && problem === null;
  set(entry, { running: false, importId: null, problem, progress: 0, done });
  if (done) setTimeout(() => set(entry, { done: false }), DONE_FLASH_MS);
  bump(entry);
  schedule(workshopId, entry, token, IDLE_POLL_MS);
}

function subscribe(workshopId: string, listener: () => void): () => void {
  const entry = entryOf(workshopId);
  entry.listeners.add(listener);
  if (entry.listeners.size === 1) {
    // Premier abonné : on regarde tout de suite si une génération tourne.
    restart(workshopId, entry, () => { void tick(workshopId, entry, entry.token); });
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      entry.token += 1;
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    if (![...entries.values()].some((e) => e.listeners.size > 0)) {
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

/** Retour sur l'onglet : relecture immédiate de chaque atelier suivi. */
function onVisible() {
  if (document.hidden) return;
  entries.forEach((entry, workshopId) => {
    if (entry.listeners.size === 0) return;
    restart(workshopId, entry, () => { void tick(workshopId, entry, entry.token); });
  });
}

const noop = () => () => {};

/** L'état de la génération de l'atelier. `null` : ne rien suivre (écran d'un
 *  simple membre, qui n'a pas le droit de lire l'avancement). */
export function useGeneration(workshopId: string | null): GenerationState {
  return useSyncExternalStore(
    workshopId ? (l) => subscribe(workshopId, l) : noop,
    () => (workshopId ? entryOf(workshopId).state : IDLE),
    () => IDLE,
  );
}

/** Rappelle `onChange` chaque fois que l'atelier a changé de contenu à cause
 *  d'une génération — jamais au montage : l'écran vient déjà de se charger. */
export function useGenerationRefresh(workshopId: string | null, onChange: () => void): void {
  const { version } = useGeneration(workshopId);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; });
  const seen = useRef(version);
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    callback.current();
  }, [version]);
}

/** Lance une génération. L'état passe à « en cours » tout de suite, avant la
 *  réponse du serveur : la fenêtre se ferme au clic, et le bouton bascule
 *  aussitôt partout. */
export async function launchGeneration(
  workshopId: string,
  input: Parameters<typeof startWorkshopGeneration>[1],
): Promise<void> {
  const entry = entryOf(workshopId);
  // Le suivi en attente s'efface : c'est ce lancement qui décide de la suite.
  entry.token += 1;
  clearTimeout(entry.timer);
  set(entry, { running: true, importId: null, problem: null, progress: 0, done: false });

  const started = await startWorkshopGeneration(workshopId, input).catch(
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
  if (!started.ok) {
    const busy = 'reason' in started && started.reason === 'busy';
    set(entry, { running: false, problem: busy ? { kind: 'busy' } : { kind: 'failed', error: started.error } });
  } else {
    set(entry, { importId: started.importId });
  }
  // Dans tous les cas, on repart du serveur : la génération lancée, ou celle
  // qui tournait déjà et a fait refuser ce lancement.
  restart(workshopId, entry, () => { void tick(workshopId, entry, entry.token); });
}

/** Arrête la génération en cours et défait ce qu'elle a écrit. Le lot est
 *  refermé côté serveur d'abord, donc les étapes encore en vol se refusent
 *  d'elles-mêmes (`assertImportOpen`, @/lib/ingest/lock). */
export async function stopGeneration(workshopId: string): Promise<void> {
  const entry = entryOf(workshopId);
  const importId = entry.state.importId;
  if (!importId) return;
  entry.token += 1;
  clearTimeout(entry.timer);
  set(entry, { running: false, importId: null, problem: null, progress: 0 });
  await cancelWorkshopImport(workshopId, importId).catch(() => {});
  bump(entry);
  restart(workshopId, entry, () => schedule(workshopId, entry, entry.token, IDLE_POLL_MS));
}

/** Le contenu de l'atelier vient de changer hors génération (une génération
 *  passée annulée depuis le bandeau) : les écrans abonnés se relisent. */
export function notifyWorkshopChanged(workshopId: string): void {
  bump(entryOf(workshopId));
}

/** Efface l'alerte affichée à côté du bouton, une fois lue. */
export function dismissGenerationProblem(workshopId: string): void {
  set(entryOf(workshopId), { problem: null });
}
