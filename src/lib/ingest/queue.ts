// La file des générations d'un atelier — 25/09/2026.
//
// Une génération tourne à la fois par atelier (./lock, docs/architecture.md
// §7.11). On peut pourtant en DEMANDER d'autres pendant qu'elle tourne : elles
// attendent ici, et partent d'elles-mêmes, dans l'ordre, dès que la place se
// libère. Au plus `MAX_ACTIVE_GENERATIONS` à la fois, celle qui tourne comprise.
//
// ─── Une demande, du clic jusqu'à la fin ────────────────────────────────────
//
// Chaque clic sur « générer » écrit une ligne (`ai_generation_requests`), et
// c'est elle que l'écran suit : en attente tant qu'elle n'a pas de lot, puis
// l'avancement du lot qu'elle a ouvert. Un seul identifiant, donc un seul
// encadré qui passe d'« en attente » à la barre de progression sans sauter.
//
// ─── Qui fait partir la suivante ────────────────────────────────────────────
//
// Personne n'attend devant la porte : la place se libère sur le serveur, onglet
// fermé ou non. Trois passages essaient de la remplir, et un seul y parvient
// (`started_at` posé sous condition) :
//   • la fin d'une génération (la dernière tâche, ou l'arrêt) ;
//   • chaque lecture d'avancement par l'écran ;
//   • la veille planifiée, chaque minute.
//
// ─── Ce qui se recalcule au départ ──────────────────────────────────────────
//
// Une demande peut attendre derrière une mise à jour complète de l'atelier. Ce
// qui dépend de l'état de l'atelier se relit donc AU DÉPART, pas au clic : le
// nombre de notions au programme. **Une liste de questions ne touche jamais au
// programme** (décision d'Alexis du 25/09/2026) : si l'atelier n'a aucune
// notion au programme quand vient son tour, la demande échoue avec
// `EMPTY_WORKSHOP`, et l'écran renvoie vers les Ressources.
//
// Aucun `'use server'`, aucun `auth()` : les droits sont contrôlés à la demande,
// par l'action qui l'écrit (CLAUDE.md §5).

import { getSupabaseServerClient } from '@/lib/supabase';
import { listChapters } from '@/lib/workshops/chapters';

import { dispatchTasks } from './dispatch';
import { errorMessage } from './failure';
import { BUSY_ERROR, liveImportOf } from './lock';
import {
  generationStatus,
  liveGenerationOf,
  startGeneration,
  type Dispatch,
  type GenerationStatus,
  type StartInput,
} from './orchestrator';

/** Générations actives en même temps sur un atelier : une qui tourne, deux qui
 *  attendent (décision d'Alexis du 25/09/2026). Au-delà, les boutons de
 *  génération s'éteignent. */
export const MAX_ACTIVE_GENERATIONS = 3;

/** Une demande « en train de partir » depuis plus longtemps a perdu son serveur
 *  en route (le démarrage téléverse les documents : quelques dizaines de
 *  secondes au plus). Elle redevient une demande en attente. */
const STARTING_TIMEOUT_MS = 3 * 60 * 1000;

// ─── Modifier une demande qui attend (26/09/2026, décision d'Alexis) ────────
//
// Rouvrir sa consigne la RETIRE de la file (`takeBack`) — c'est tout. Tant
// qu'elle n'est pas renvoyée, elle n'existe plus : l'oublier, c'est la perdre.
// Renvoyée, elle reprend son rang d'origine (`rankAt`, sa date d'entrée dans la
// file) : première si elle l'était, et devant celles arrivées après elle.

/** L'écran ne suit que les demandes récentes : au-delà, une génération est
 *  finie depuis longtemps, et le bandeau des imports prend le relais. */
const RECENT_MS = 24 * 60 * 60 * 1000;

/** Par quelle porte la génération est entrée, telle que l'écran la range :
 *  les deux portes des Paramètres n'en font qu'une (un seul bouton, vu à deux
 *  endroits), chaque liste de questions a la sienne. */
export type GenerationDoor = 'settings' | 'exam' | 'parcours';

export function doorOf(origin: string | null | undefined): GenerationDoor {
  if (origin === 'questions-exam') return 'exam';
  if (origin === 'questions-parcours') return 'parcours';
  return 'settings';
}

/** Ce que l'écran a demandé. `prompt` : le texte tel que l'utilisateur l'a
 *  tapé — la consigne, ou un nombre seul, qui n'en est pas une. C'est lui que
 *  l'écran affiche, et qu'il rouvre pour modifier une demande en attente. */
export type RequestInput = Omit<StartInput, 'baseUrl' | 'requestId'> & { prompt?: string };

/** Le refus d'une demande venue d'une liste de questions, sur un atelier qui
 *  n'a encore aucune notion au programme. Reconnu et traduit par l'écran. */
export const EMPTY_WORKSHOP = 'INGEST_EMPTY_WORKSHOP';

/** Une demande, telle que l'écran la montre. */
export type RequestView = {
  id: string;
  door: GenerationDoor;
  /** `queued` : attend son tour. `starting` : c'est son tour, le lot s'ouvre. */
  state: 'queued' | 'starting' | GenerationStatus['state'];
  importId: string | null;
  /** La consigne donnée, pour distinguer deux générations d'une même liste. */
  hint: string;
  /** Son entrée dans la file : le rang qu'elle reprend si on la modifie. */
  createdAt: string;
  /** L'avancement du lot, une fois ouvert. */
  status: GenerationStatus | null;
  /** Le démarrage a échoué : la raison. */
  error: string | null;
};

type RequestRow = {
  id: string;
  workshop_id: string;
  created_by: string;
  input: RequestInput;
  base_url: string;
  import_id: string | null;
  started_at: string | null;
  error: string | null;
  created_at: string;
};

const COLUMNS = 'id, workshop_id, created_by, input, base_url, import_id, started_at, error, created_at';

async function recentRequests(workshopId: string): Promise<RequestRow[]> {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const { data, error } = await supabase
    .from('ai_generation_requests')
    .select(COLUMNS)
    .eq('workshop_id', workshopId)
    .gte('created_at', since)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RequestRow[];
}

const isWaiting = (r: RequestRow) => r.import_id === null && r.error === null;
const isStarting = (r: RequestRow, now: number) =>
  isWaiting(r) && r.started_at !== null && now - Date.parse(r.started_at) < STARTING_TIMEOUT_MS;

/** Générations actives sur l'atelier : celle qui tourne, et celles qui
 *  attendent. C'est ce nombre que borne `MAX_ACTIVE_GENERATIONS`. */
export async function activeCount(workshopId: string): Promise<number> {
  const [rows, live] = await Promise.all([recentRequests(workshopId), liveImportOf(workshopId)]);
  const now = Date.now();
  const waiting = rows.filter(isWaiting).length;
  // Une demande en train de partir est déjà comptée parmi celles qui
  // attendent : le lot vivant qu'elle vient peut-être d'ouvrir est le sien.
  const starting = rows.some((r) => isStarting(r, now));
  return waiting + (live && !starting ? 1 : 0);
}

/** Écrit une demande. Lève `QUEUE_FULL` quand l'atelier en a déjà assez. */
export const QUEUE_FULL = 'INGEST_QUEUE_FULL';

/** `rankAt` : le rang d'une demande retirée pour modification et renvoyée —
 *  sa date d'entrée d'origine. Ignoré s'il n'est pas une date des dernières
 *  vingt-quatre heures : il ne sert qu'à reprendre une place, pas à en voler. */
export async function enqueue(
  workshopId: string,
  userId: string,
  input: RequestInput,
  baseUrl: string,
  rankAt?: string | null,
): Promise<string> {
  if ((await activeCount(workshopId)) >= MAX_ACTIVE_GENERATIONS) throw new Error(QUEUE_FULL);
  const rank = rankAt ? Date.parse(rankAt) : NaN;
  const createdAt = Number.isFinite(rank) && rank <= Date.now() && Date.now() - rank < RECENT_MS
    ? new Date(rank).toISOString()
    : undefined;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_generation_requests')
    .insert({ workshop_id: workshopId, created_by: userId, input, base_url: baseUrl, created_at: createdAt })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'demande non enregistrée');
  return data.id as string;
}

/** Retire une demande qui attend encore. `false` : elle est déjà partie (c'est
 *  alors l'arrêt de la génération qui s'applique), ou n'existe plus. */
export async function cancelRequest(workshopId: string, requestId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_generation_requests')
    .delete()
    .eq('id', requestId)
    .eq('workshop_id', workshopId)
    .is('import_id', null)
    .is('started_at', null)
    .select('id');
  if (error) {
    console.error('cancelRequest error:', error);
    return false;
  }
  return (data ?? []).length > 0;
}

/** Retire une demande qui attend, pour en modifier la consigne : rend ce qu'il
 *  faut pour la renvoyer — son texte, et son rang. `null` : elle est déjà
 *  partie, il n'y a plus rien à modifier. */
export async function takeBack(workshopId: string, requestId: string): Promise<{ prompt: string; rankAt: string } | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_generation_requests')
    .delete()
    .eq('id', requestId)
    .eq('workshop_id', workshopId)
    .is('import_id', null)
    .is('started_at', null)
    .select('input, created_at');
  if (error) {
    console.error('takeBack error:', error);
    return null;
  }
  const row = (data ?? [])[0] as { input: RequestInput; created_at: string } | undefined;
  if (!row) return null;
  return { prompt: row.input?.prompt ?? row.input?.hint ?? '', rankAt: row.created_at };
}

/** Le nombre de notions au programme — celles des chapitres qui n'ont pas été
 *  écartés —, relu au départ. */
async function visibleNotionsOf(workshopId: string): Promise<number> {
  const chapters = await listChapters(workshopId);
  return chapters.filter((c) => !c.hidden).reduce((sum, c) => sum + c.notionCount, 0);
}

/** Ce que la demande fera en partant, décidé sur l'atelier tel qu'il est
 *  MAINTENANT. Seuls les Paramètres construisent le programme ; une liste de
 *  questions n'écrit que des questions, et refuse de partir sur un atelier
 *  sans notion au programme. */
async function resolveInput(workshopId: string, input: RequestInput): Promise<Omit<StartInput, 'baseUrl'>> {
  const visibleNotions = await visibleNotionsOf(workshopId);
  const fromList = doorOf(input.origin) !== 'settings';
  if (fromList && visibleNotions === 0) throw new Error(EMPTY_WORKSHOP);
  const needsProgram = fromList ? false : input.needsProgram;
  return {
    fileIds: needsProgram ? input.fileIds : [],
    context: input.context,
    withResource: input.withResource,
    needsProgram,
    visibleNotions,
    examTarget: input.examTarget,
    hint: input.hint,
    origin: input.origin,
  };
}

/** Fait partir la demande suivante, si la place est libre. Sûr à appeler
 *  n'importe quand, par n'importe qui, autant de fois qu'on veut : un seul
 *  appel démarre une demande donnée. **Ne lève jamais.**
 *
 *  `baseUrl` : ce serveur. Il ne démarre que les demandes qu'il a reçues — le
 *  développement local partage la base avec la production, et une génération
 *  n'est menée que par le serveur qui l'a ouverte. */
export async function promoteNext(workshopId: string, baseUrl: string): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    // Quelques tours au plus : une demande dont le démarrage échoue laisse la
    // place à la suivante.
    for (let round = 0; round < 3; round += 1) {
      if (await liveImportOf(workshopId)) return;
      const rows = await recentRequests(workshopId);
      const now = Date.now();
      if (rows.some((r) => isStarting(r, now))) return;
      const next = rows.find((r) => isWaiting(r) && r.base_url === baseUrl);
      if (!next) return;

      const staleBefore = new Date(now - STARTING_TIMEOUT_MS).toISOString();
      const { data: claimed } = await supabase
        .from('ai_generation_requests')
        .update({ started_at: new Date(now).toISOString() })
        .eq('id', next.id)
        .is('import_id', null)
        .is('error', null)
        .or(`started_at.is.null,started_at.lt.${staleBefore}`)
        .select('id');
      if ((claimed ?? []).length === 0) return;

      try {
        const input = await resolveInput(workshopId, next.input);
        const { importId, dispatch } = await startGeneration(workshopId, next.created_by, {
          ...input,
          baseUrl: next.base_url,
          requestId: next.id,
        });
        await supabase.from('ai_generation_requests').update({ import_id: importId }).eq('id', next.id);
        await dispatchTasks(dispatch.baseUrl, dispatch.taskIds);
        return;
      } catch (error) {
        const detail = errorMessage(error);
        if (detail === BUSY_ERROR) {
          // Une génération a pris la place entre-temps (lancée par un serveur
          // qui ne connaît pas la file) : la demande reprend son rang.
          await supabase.from('ai_generation_requests').update({ started_at: null }).eq('id', next.id);
          return;
        }
        // Un atelier vide n'est pas une panne : l'écran le dit, et renvoie aux Ressources.
        if (detail !== EMPTY_WORKSHOP) console.error('[ingest] demande non démarrée :', next.id, detail);
        await supabase.from('ai_generation_requests').update({ error: detail }).eq('id', next.id);
      }
    }
  } catch (error) {
    console.error('[ingest] file des générations :', errorMessage(error));
  }
}

/** Lance les tâches rendues par l'orchestrateur, puis fait partir la suivante
 *  de la file pour chaque atelier où une génération vient de finir. */
export async function followUp(dispatches: readonly Dispatch[]): Promise<void> {
  await Promise.all(dispatches.map((d) => dispatchTasks(d.baseUrl, d.taskIds)));
  const finished = new Map<string, string>();
  for (const d of dispatches) if (d.finished) finished.set(d.finished, d.baseUrl);
  for (const [workshopId, baseUrl] of finished) await promoteNext(workshopId, baseUrl);
}

/** La veille de la file : chaque atelier où une demande reçue par ce serveur
 *  attend encore tente de la faire partir. Rattrape une fin de génération dont
 *  le relais s'est perdu, et une demande dont le démarrage a été coupé. */
export async function promoteAll(baseUrl: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const { data, error } = await supabase
    .from('ai_generation_requests')
    .select('workshop_id')
    .eq('base_url', baseUrl)
    .is('import_id', null)
    .is('error', null)
    .gte('created_at', since);
  if (error) {
    console.error('[ingest] veille de la file impossible :', error.message);
    return;
  }
  const workshops = new Set((data ?? []).map((r) => r.workshop_id as string));
  for (const workshopId of workshops) await promoteNext(workshopId, baseUrl);
}

/** Ce que l'écran suit sur l'atelier : les demandes qui attendent ou tournent,
 *  et celles qu'il suivait déjà (`followed`), même finies — c'est ainsi qu'il
 *  apprend comment elles se sont terminées.
 *
 *  Une génération lancée sans passer par la file (par un serveur qui ne la
 *  connaît pas encore) apparaît aussi, sous l'identifiant de son lot. */
export async function listRequests(workshopId: string, followed: readonly string[]): Promise<RequestView[]> {
  const rows = await recentRequests(workshopId);
  const wanted = new Set(followed);
  const now = Date.now();
  const views: RequestView[] = [];

  // La première demande qui attend part dès que la place est libre : elle est
  // « en train de partir », les suivantes attendent.
  const live = await liveGenerationOf(workshopId);
  let placeTaken = rows.some((r) => r.import_id !== null && r.import_id === live) || rows.some((r) => isStarting(r, now));

  for (const r of rows) {
    const door = doorOf(r.input?.origin);
    if (r.error) {
      if (wanted.has(r.id)) views.push({ id: r.id, door, state: 'failed', importId: null, hint: r.input?.prompt ?? r.input?.hint ?? '', createdAt: r.created_at, status: null, error: r.error });
      continue;
    }
    if (r.import_id === null) {
      const starting = isStarting(r, now) || !placeTaken;
      if (starting) placeTaken = true;
      views.push({ id: r.id, door, state: starting ? 'starting' : 'queued', importId: null, hint: r.input?.prompt ?? r.input?.hint ?? '', createdAt: r.created_at, status: null, error: null });
      continue;
    }
    const status = await generationStatus(r.import_id);
    if (!status) continue;
    if (status.state === 'running' || wanted.has(r.id)) {
      views.push({ id: r.id, door, state: status.state, importId: r.import_id, hint: r.input?.prompt ?? r.input?.hint ?? '', createdAt: r.created_at, status, error: null });
    }
  }

  // Une génération hors file : celle qui tourne, ou une qu'on suivait déjà.
  const known = new Set(rows.map((r) => r.import_id).filter(Boolean));
  const orphans = new Set([...(live ? [live] : []), ...followed].filter((id) => !known.has(id) && !rows.some((r) => r.id === id)));
  if (orphans.size > 0) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('ai_imports')
      .select('id, origin, scope, created_at')
      .eq('workshop_id', workshopId)
      .in('id', [...orphans]);
    for (const row of data ?? []) {
      // Le lot d'une demande dont la ligne n'a pas encore reçu son identifiant :
      // l'encadré de la demande le montre déjà.
      const requestId = (row.scope as { requestId?: string } | null)?.requestId;
      if (requestId && rows.some((r) => r.id === requestId)) continue;
      const status = await generationStatus(row.id as string);
      if (!status) continue;
      views.unshift({ id: row.id as string, door: doorOf(row.origin as string | null), state: status.state, importId: row.id as string, hint: (row.scope as { hint?: string } | null)?.hint ?? '', createdAt: row.created_at as string, status, error: null });
    }
  }
  return views;
}
