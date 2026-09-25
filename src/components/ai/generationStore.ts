'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import {
  cancelGenerationRequest,
  cancelWorkshopImport,
  startWorkshopGeneration,
  updateGenerationRequest,
  type GenerationInput,
  type PlanIssue,
} from '@/app/actions/aiIngest';
import type { PipelineSummary } from '@/lib/ingest/pipeline';

// Les générations par IA d'un atelier, PARTAGÉES par tout l'onglet.
//
// ─── Pourquoi un état partagé ────────────────────────────────────────────────
//
// Une génération se voit à plusieurs endroits à la fois : le bouton des
// Paramètres (posé dans Ressources ET dans Chapitre & Notion), les encadrés en
// tête de la banque d'examen, le bandeau des générations terminées, et toutes
// les listes qui reçoivent ce qu'elle écrit. Ici, un seul suivi par atelier, et
// tous les écrans s'y abonnent : ce qu'on lance se voit à l'instant du clic,
// partout, et les listes se relisent à mesure que la génération écrit.
//
// ─── Plusieurs générations, une seule qui tourne (25/09/2026) ────────────────
//
// On peut demander une génération pendant qu'une autre tourne : elle attend son
// tour dans la file du serveur (@/lib/ingest/queue) et part d'elle-même. Chaque
// demande est un ÉLÉMENT de cet état, suivi du clic jusqu'à la fin ; sa PORTE
// (`door`) dit où elle se montre — le bouton des Paramètres, ou un encadré de la
// liste de questions qui l'a lancée. Au plus `MAX_ACTIVE_GENERATIONS` à la fois :
// au-delà, les boutons de génération s'éteignent.
//
// Le suivi passe par la route d'avancement (`/api/ingest/status`) et jamais par
// une server action : les actions d'un onglet passent une par une, et une
// lecture toutes les deux secondes ferait patienter tout le reste de l'écran.
//
// ─── Ce qui fait avancer `version` ──────────────────────────────────────────
//
// `version` monte chaque fois que l'atelier a changé de contenu : une génération
// a écrit (tout de suite la première fois, puis au plus une fois toutes les
// `REFRESH_EVERY_MS`, pour ne pas encombrer la file des actions de relectures),
// elle s'est terminée, elle a été arrêtée, ou une génération passée a été
// annulée. Les écrans qui montrent ce contenu se relisent à chaque montée
// (`useGenerationRefresh`).

/** Rythme de lecture de l'avancement pendant qu'une génération tourne ou attend. */
const RUNNING_POLL_MS = 2_500;
/** Rythme de la question « une génération a-t-elle été lancée ailleurs ? »,
 *  quand rien ne tourne. Même cadence que les autres données vivantes du site
 *  (`useLiveData`) : on ne sonde qu'un onglet visible. */
const IDLE_POLL_MS = 30_000;
/** Pendant qu'une génération écrit, les listes se relisent au plus une fois par
 *  intervalle — sauf la PREMIÈRE écriture, montrée tout de suite : chaque
 *  relecture est une server action, qui passe devant ce que l'utilisateur ferait
 *  au même moment. */
const REFRESH_EVERY_MS = 8_000;
/** Durée pendant laquelle une génération réussie montre sa coche. */
const DONE_FLASH_MS = 1_800;

/** Générations actives (en cours + en attente) au-delà desquelles on ne peut
 *  plus en demander. Le serveur tient la même borne (@/lib/ingest/queue). */
export const MAX_ACTIVE_GENERATIONS = 3;

/** Où une génération se montre : le bouton des Paramètres (ses deux portes n'en
 *  font qu'une), ou la liste de questions qui l'a lancée. */
export type GenerationDoor = 'settings' | 'exam' | 'parcours';

/** Ce qui s'est mal passé, dit sur la génération concernée. Rien quand tout va
 *  bien : les éléments apparaissent, c'est le seul compte-rendu qu'il faut. */
export type GenerationProblem =
  /** L'atelier avait déjà son compte de générations : la demande a été refusée. */
  | { kind: 'full' }
  /** Une génération de questions est partie sur un atelier sans notion au
   *  programme : il n'y avait rien à faire travailler (@/lib/ingest/queue). */
  | { kind: 'empty' }
  /** La génération a échoué. `error` : un code de `PIPELINE_ERRORS` ou le
   *  message brut de l'étape. */
  | { kind: 'failed'; error: string | null }
  /** Terminée, mais pas entière : des questions manquent, ou des éléments
   *  proposés par le modèle ont été écartés. */
  | { kind: 'partial'; missing: number; discarded: PlanIssue[] };

export type GenerationItem = {
  /** L'identifiant de la demande ; provisoire (`local:…`) le temps que le
   *  serveur l'enregistre. */
  id: string;
  door: GenerationDoor;
  /** `launching` : le clic vient d'avoir lieu, le serveur n'a pas encore
   *  répondu. `queued` : attend son tour. `running` : tourne. `done` : vient de
   *  réussir (le temps de la coche). `problem` : terminée mal, jusqu'à ce qu'on
   *  masque l'alerte. */
  phase: 'launching' | 'queued' | 'running' | 'done' | 'problem';
  /** Avancement, de 0 à 100 — une unité par étape prévue (`PipelineSummary`). */
  progress: number;
  /** Le lot, une fois la génération partie : c'est lui qu'on arrête. */
  importId: string | null;
  /** La consigne donnée, pour distinguer deux générations d'une même liste. */
  hint: string;
  problem: GenerationProblem | null;
};

export type GenerationsState = { items: GenerationItem[]; version: number };

const EMPTY: GenerationsState = { items: [], version: 0 };

const isActive = (item: GenerationItem) => item.phase === 'launching' || item.phase === 'queued' || item.phase === 'running';

/** Une génération dont le clic vient d'avoir lieu attend si une autre la
 *  précède ; sinon elle part, et se montre déjà comme partie. */
export function displayPhase(state: GenerationsState, item: GenerationItem): GenerationItem['phase'] {
  if (item.phase !== 'launching') return item.phase;
  const ahead = state.items.slice(0, state.items.indexOf(item)).some(isActive);
  return ahead ? 'queued' : 'running';
}

/** Le nombre de générations actives, et si l'on peut encore en demander une. */
export function capacityOf(state: GenerationsState): { active: number; full: boolean } {
  const active = state.items.filter(isActive).length;
  return { active, full: active >= MAX_ACTIVE_GENERATIONS };
}

type Entry = {
  state: GenerationsState;
  listeners: Set<() => void>;
  /** Jeton du suivi en cours : tout suivi parti sous un autre jeton s'arrête. */
  token: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Par demande, les derniers comptes lus — pour savoir si elle a écrit. */
  counts: Map<string, string>;
  lastBump: number;
};

const entries = new Map<string, Entry>();
let localSeq = 0;

function entryOf(workshopId: string): Entry {
  let entry = entries.get(workshopId);
  if (!entry) {
    entry = { state: EMPTY, listeners: new Set(), token: 0, timer: undefined, counts: new Map(), lastBump: 0 };
    entries.set(workshopId, entry);
  }
  return entry;
}

function setItems(entry: Entry, items: GenerationItem[], bumpVersion = false) {
  if (bumpVersion) entry.lastBump = Date.now();
  entry.state = { items, version: entry.state.version + (bumpVersion ? 1 : 0) };
  entry.listeners.forEach((l) => l());
}

function patchItem(entry: Entry, id: string, patch: Partial<GenerationItem>) {
  setItems(entry, entry.state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

function removeItem(entry: Entry, id: string, bumpVersion = false) {
  entry.counts.delete(id);
  setItems(entry, entry.state.items.filter((i) => i.id !== id), bumpVersion);
}

function bump(entry: Entry) {
  setItems(entry, entry.state.items, true);
}

type RequestView = {
  id: string;
  door: GenerationDoor;
  state: 'queued' | 'starting' | PipelineSummary['state'];
  importId: string | null;
  hint: string;
  status: PipelineSummary | null;
  error: string | null;
};

type StatusBody = { ok: true; requests: RequestView[] } | { ok: false };

/** `null` : lecture ratée — on réessaiera au tour suivant. */
async function readStatus(workshopId: string, follow: string[]): Promise<StatusBody | null> {
  try {
    const params = new URLSearchParams({ workshopId });
    if (follow.length > 0) params.set('follow', follow.join(','));
    const res = await fetch(`/api/ingest/status?${params}`, { cache: 'no-store' });
    if (res.status === 403) return { ok: false };
    if (!res.ok) return null;
    return (await res.json()) as StatusBody;
  } catch {
    return null;
  }
}

function schedule(workshopId: string, entry: Entry, token: number, delay: number) {
  if (token !== entry.token || entry.listeners.size === 0) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => { void tick(workshopId, entry, token); }, delay);
}

/** Relance le suivi de zéro, tout de suite : tout suivi précédent s'arrête. */
function restart(workshopId: string, entry: Entry) {
  entry.token += 1;
  clearTimeout(entry.timer);
  entry.timer = undefined;
  void tick(workshopId, entry, entry.token);
}

/** Comment une génération finie se termine à l'écran. */
/** Le code du refus « atelier vide » (`EMPTY_WORKSHOP`, @/lib/ingest/queue) :
 *  recopié, un module client ne pouvant pas importer la file du serveur. */
const EMPTY_WORKSHOP = 'INGEST_EMPTY_WORKSHOP';

function problemOf(view: RequestView): GenerationProblem | null {
  if (view.state === 'failed' && view.error === EMPTY_WORKSHOP) return { kind: 'empty' };
  if (view.state === 'failed') return { kind: 'failed', error: view.status?.error ?? view.error };
  const s = view.status;
  if (view.state === 'done' && s && (s.missingQuestions > 0 || s.discarded.length > 0)) {
    return { kind: 'partial', missing: s.missingQuestions, discarded: s.discarded };
  }
  return null;
}

async function tick(workshopId: string, entry: Entry, token: number) {
  if (token !== entry.token) return;
  const busy = entry.state.items.some(isActive);
  // Rien ne tourne et l'onglet est caché : on attendra le retour sur l'onglet.
  if (!busy && typeof document !== 'undefined' && document.hidden) return;

  const follow = entry.state.items.filter((i) => isActive(i) && !i.id.startsWith('local:')).map((i) => i.id);
  const status = await readStatus(workshopId, follow);
  if (token !== entry.token) return;
  // Pas les droits (un simple membre) : il n'y a rien à suivre, et rien à
  // redemander.
  if (status && !status.ok) return;
  if (!status) return schedule(workshopId, entry, token, busy ? RUNNING_POLL_MS : IDLE_POLL_MS);

  const views = new Map(status.requests.map((r) => [r.id, r]));
  let wrote = false;
  let finished = false;
  const doneIds: string[] = [];
  const next: GenerationItem[] = [];

  for (const item of entry.state.items) {
    // Le clic vient d'avoir lieu : c'est la réponse de l'action qui décidera.
    // Une génération finie garde sa coche ou son alerte, hors du suivi.
    if (item.phase === 'launching' || item.phase === 'done' || item.phase === 'problem') {
      next.push(item);
      continue;
    }
    const view = views.get(item.id);
    views.delete(item.id);
    // Disparue du serveur : retirée ailleurs (autre onglet, autre gestionnaire).
    if (!view) {
      entry.counts.delete(item.id);
      finished = true;
      continue;
    }
    next.push(itemFrom(entry, view, item));
  }
  // Celles qu'on ne suivait pas : lancées ailleurs. Pas pendant qu'un clic
  // attend sa réponse — la demande qu'il vient d'écrire serait comptée deux fois.
  const launching = entry.state.items.some((i) => i.phase === 'launching');
  if (!launching) for (const view of views.values()) {
    if (view.state === 'queued' || view.state === 'starting' || view.state === 'running') next.push(itemFrom(entry, view, null));
  }

  // Ce qui a changé de contenu, et ce qui vient de finir.
  const settled: GenerationItem[] = [];
  for (const item of next) {
    const view = status.requests.find((r) => r.id === item.id);
    if (!view || item.phase === 'launching' || item.phase === 'done' || item.phase === 'problem') {
      settled.push(item);
      continue;
    }
    if (view.state === 'running' && view.status) {
      const counts = JSON.stringify(view.status.counts);
      const seen = entry.counts.get(item.id);
      if (counts !== seen) {
        entry.counts.set(item.id, counts);
        // Première écriture : tout de suite. Ensuite, pas plus d'une relecture
        // par intervalle.
        const first = seen === undefined || seen === JSON.stringify({ chapters: 0, notions: 0, questions: 0 });
        if (first || Date.now() - entry.lastBump >= REFRESH_EVERY_MS) wrote = true;
      }
    }
    if (view.state === 'done' || view.state === 'failed' || view.state === 'stopped') {
      finished = true;
      entry.counts.delete(item.id);
      const problem = problemOf(view);
      // Arrêtée : rien à dire de plus, l'encadré s'en va.
      if (view.state === 'stopped') continue;
      if (problem) settled.push({ ...item, phase: 'problem', problem, progress: 0 });
      else {
        settled.push({ ...item, phase: 'done', progress: 100 });
        doneIds.push(item.id);
      }
      continue;
    }
    settled.push(item);
  }

  setItems(entry, settled, wrote || finished);
  for (const id of doneIds) setTimeout(() => removeItem(entry, id), DONE_FLASH_MS);
  schedule(workshopId, entry, token, settled.some(isActive) ? RUNNING_POLL_MS : IDLE_POLL_MS);
}

function itemFrom(entry: Entry, view: RequestView, prev: GenerationItem | null): GenerationItem {
  const s = view.status;
  const progress = s && s.progressMax > 0 ? Math.round((100 * s.progress) / s.progressMax) : 0;
  return {
    id: view.id,
    door: view.door,
    // « starting » : c'est son tour, le lot s'ouvre — elle se montre déjà partie.
    phase: view.state === 'queued' ? 'queued' : 'running',
    progress: view.state === 'running' ? progress : 0,
    importId: view.importId,
    hint: view.hint || prev?.hint || '',
    problem: null,
  };
}

function subscribe(workshopId: string, listener: () => void): () => void {
  const entry = entryOf(workshopId);
  entry.listeners.add(listener);
  if (entry.listeners.size === 1) {
    // Premier abonné : on regarde tout de suite ce qui tourne.
    restart(workshopId, entry);
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
    if (entry.listeners.size > 0) restart(workshopId, entry);
  });
}

const noop = () => () => {};

/** Les générations de l'atelier. `null` : ne rien suivre (écran d'un simple
 *  membre, qui n'a pas le droit de lire l'avancement). */
export function useGenerations(workshopId: string | null): GenerationsState {
  // ⚠️ **L'abonnement doit être STABLE.** Une fonction neuve à chaque rendu fait
  // se désabonner puis se réabonner React à chaque rendu ; quand le dernier
  // abonné part, le suivi repart de zéro et relit le serveur — et c'est ce qui
  // rendait le bouton à son état d'avant pendant les quelques secondes où la
  // génération n'était pas encore ouverte côté serveur (25/09/2026).
  const sub = useCallback((l: () => void) => (workshopId ? subscribe(workshopId, l) : noop()), [workshopId]);
  const get = useCallback(() => (workshopId ? entryOf(workshopId).state : EMPTY), [workshopId]);
  return useSyncExternalStore(sub, get, () => EMPTY);
}

/** Rappelle `onChange` chaque fois que l'atelier a changé de contenu à cause
 *  d'une génération — jamais au montage : l'écran vient déjà de se charger. */
export function useGenerationRefresh(workshopId: string | null, onChange: () => void): void {
  const { version } = useGenerations(workshopId);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; });
  const seen = useRef(version);
  useEffect(() => {
    if (version === seen.current) return;
    seen.current = version;
    callback.current();
  }, [version]);
}

function doorOfOrigin(origin: string): GenerationDoor {
  if (origin === 'questions-exam') return 'exam';
  if (origin === 'questions-parcours') return 'parcours';
  return 'settings';
}

/** Demande une génération. Elle se montre À L'INSTANT du clic — partie, ou en
 *  attente derrière celle qui tourne —, avant même la réponse du serveur. */
export async function launchGeneration(workshopId: string, input: GenerationInput): Promise<void> {
  const entry = entryOf(workshopId);
  localSeq += 1;
  const localId = `local:${localSeq}`;
  setItems(entry, [...entry.state.items, {
    id: localId,
    door: doorOfOrigin(input.origin),
    phase: 'launching',
    progress: 0,
    importId: null,
    hint: input.prompt,
    problem: null,
  }]);

  const started = await startWorkshopGeneration(workshopId, input).catch(
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
  );
  if (!started.ok) {
    const full = 'reason' in started && started.reason === 'full';
    patchItem(entry, localId, { phase: 'problem', problem: full ? { kind: 'full' } : { kind: 'failed', error: started.error } });
  } else {
    // La demande est enregistrée : l'élément prend son vrai nom, à sa place, et
    // le suivi reprend tout de suite pour lire où elle en est.
    const ahead = entry.state.items.slice(0, entry.state.items.findIndex((i) => i.id === localId)).some(isActive);
    if (entry.state.items.some((i) => i.id === started.requestId)) removeItem(entry, localId);
    else patchItem(entry, localId, { id: started.requestId, phase: ahead ? 'queued' : 'running' });
  }
  restart(workshopId, entry);
}

/** Modifie une génération qui attend encore son tour : elle garde sa place.
 *  Partie entre-temps, elle n'est plus modifiable — le suivi la montre alors
 *  telle qu'elle tourne. */
export async function editGeneration(workshopId: string, id: string, input: GenerationInput): Promise<void> {
  const entry = entryOf(workshopId);
  if (id.startsWith('local:')) return;
  patchItem(entry, id, { hint: input.prompt });
  await updateGenerationRequest(workshopId, id, input).catch(() => false);
  restart(workshopId, entry);
}

/** Arrête une génération qui tourne — et défait ce qu'elle a écrit —, ou retire
 *  de la file une génération qui attend encore. Le lot est refermé côté serveur
 *  d'abord, donc les étapes encore en vol se refusent d'elles-mêmes
 *  (`assertImportOpen`, @/lib/ingest/lock). */
export async function cancelGeneration(workshopId: string, id: string): Promise<void> {
  const entry = entryOf(workshopId);
  const item = entry.state.items.find((i) => i.id === id);
  if (!item || id.startsWith('local:')) return;
  entry.token += 1;
  clearTimeout(entry.timer);
  removeItem(entry, id);
  if (item.importId) {
    await cancelWorkshopImport(workshopId, item.importId).catch(() => {});
  } else {
    const removed = await cancelGenerationRequest(workshopId, id).catch(() => false);
    // Elle est partie entre-temps : le suivi la retrouvera avec son lot, et
    // c'est l'arrêt qui s'appliquera.
    if (!removed) { restart(workshopId, entry); return; }
  }
  bump(entry);
  restart(workshopId, entry);
}

/** Le contenu de l'atelier vient de changer hors génération (une génération
 *  passée annulée depuis le bandeau) : les écrans abonnés se relisent. */
export function notifyWorkshopChanged(workshopId: string): void {
  bump(entryOf(workshopId));
}

/** Efface l'alerte d'une génération terminée, une fois lue. */
export function dismissGeneration(workshopId: string, id: string): void {
  removeItem(entryOf(workshopId), id);
}
