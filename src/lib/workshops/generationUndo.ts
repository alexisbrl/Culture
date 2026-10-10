// Annuler la dernière génération du programme (docs/architecture.md §7.8).
//
// ─── Le contrat, en trois phrases ───────────────────────────────────────────
//
// Seule la DERNIÈRE génération lancée depuis les paramètres s'annule, pendant
// 48 h, et tant que RIEN n'a bougé dans Chapitre & Notion depuis sa fin — par
// qui que ce soit. Annuler défait exactement ce qu'elle a fait : ce qu'elle a
// créé est supprimé, les notions qu'elle a déplacées reviennent, les chapitres
// qu'elle a écartés sont rétablis, l'ordre du programme est remis. La même
// condition dit quoi marquer à l'écran : « nouveau », « modifié ».
//
// ─── Ce qu'on enregistre : les changements, pas l'état ──────────────────────
//
// La génération note au fil de l'eau ce qu'elle touche, dans le `scope` de son
// lot (jsonb libre) :
//   • `stage1.before` — le chapitre de chaque notion existante avant elle ;
//   • `movedNotions` — celles qu'elle a réellement déplacées ;
//   • `stage1.dropped` et `undoEmptied` — les chapitres qu'elle a écartés ;
//   • `undoOrder` — l'ordre des chapitres avant elle ;
//   • `retitledNotions` — les notions existantes qui ont pris la formulation
//     d'une redite neuve, avec leur titre d'avant ;
//   • `programStamp` — la dernière modification du programme à sa clôture.
// Ce qu'elle a CRÉÉ n'a pas besoin d'être noté : chaque ligne porte son
// étiquette (`import_id`).
//
// ─── « Rien n'a bougé » ─────────────────────────────────────────────────────
//
// Un déclencheur tient `workshops.program_changed_at` à jour à chaque écriture
// sur les chapitres et les notions, suppressions comprises (voir
// docs/migrations/2026-10-05-programme-touche.sql). La génération en relit la
// valeur à sa clôture ; si elle a changé depuis, quelqu'un a touché au
// programme. Les deux valeurs viennent de la base et se comparent telles
// quelles — aucune horloge de serveur n'entre en jeu.
//
// Une génération d'avant ce mécanisme n'a pas de tampon : elle ne s'annule pas.

import { getSupabaseServerClient } from '@/lib/supabase';
import { reorderChapters } from './chapters';
import { assertImportId, deleteImportRows } from './imports';

export const GENERATION_UNDO_WINDOW_HOURS = 48;

/** Les portes qui écrivent le programme : les deux entrées des paramètres. Les
 *  générations de questions ne touchent ni aux chapitres ni aux notions. */
export const PROGRAM_ORIGINS = ['settings-files', 'settings-notions'] as const;

// ─── Modèle pur ──────────────────────────────────────────────────────────────

export type GenerationTrace = {
  before: Record<string, string | null>;
  movedNotions: string[];
  hiddenChapters: string[];
  order: string[] | null;
  /** Titre d'avant des notions existantes reformulées par une redite. */
  retitled: Record<string, string>;
  /** `undefined` : aucun tampon posé (génération d'avant le mécanisme, ou pas
   *  encore close). */
  stamp: { at: string | null } | undefined;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Relit ce qu'une génération a noté d'elle-même. Tolère tout : le `scope` est
 *  un jsonb libre, et un lot ancien n'a qu'une partie de ces clés. */
export function traceOf(scope: unknown): GenerationTrace {
  const s = (scope && typeof scope === 'object' ? scope : {}) as Record<string, unknown>;
  const stage1 = (s.stage1 && typeof s.stage1 === 'object' ? s.stage1 : {}) as Record<string, unknown>;
  const rawBefore = (stage1.before && typeof stage1.before === 'object' ? stage1.before : {}) as Record<string, unknown>;
  const before: Record<string, string | null> = {};
  for (const [id, chapterId] of Object.entries(rawBefore)) {
    before[id] = typeof chapterId === 'string' ? chapterId : null;
  }
  const rawStamp = s.programStamp as { at?: unknown } | undefined;
  const rawRetitled = (s.retitledNotions && typeof s.retitledNotions === 'object' ? s.retitledNotions : {}) as Record<string, unknown>;
  const retitled: Record<string, string> = {};
  for (const [id, title] of Object.entries(rawRetitled)) {
    if (typeof title === 'string') retitled[id] = title;
  }
  return {
    before,
    movedNotions: strings(s.movedNotions),
    hiddenChapters: [...new Set([...strings(stage1.dropped), ...strings(s.undoEmptied)])],
    order: Array.isArray(s.undoOrder) ? strings(s.undoOrder) : null,
    retitled,
    stamp: rawStamp && typeof rawStamp === 'object'
      ? { at: typeof rawStamp.at === 'string' ? rawStamp.at : null }
      : undefined,
  };
}

export type GenerationUndoState =
  /** Annulable. */
  | 'available'
  /** Pas encore terminée. */
  | 'running'
  /** Arrêtée en route : ce qu'elle avait écrit est déjà retiré. */
  | 'stopped'
  /** Sans tampon de clôture : on ne sait pas dire si l'on y a touché depuis. */
  | 'untraced'
  /** Passé 48 h. */
  | 'expired'
  /** Le programme a bougé depuis sa fin. */
  | 'modified';

export function generationUndoState(input: {
  finishedAt: string | null;
  outcome: string | null;
  stamp: GenerationTrace['stamp'];
  programChangedAt: string | null;
  now?: Date;
}): GenerationUndoState {
  if (!input.finishedAt) return 'running';
  if (input.outcome === 'stopped') return 'stopped';
  if (!input.stamp) return 'untraced';
  const deadline = new Date(input.finishedAt).getTime() + GENERATION_UNDO_WINDOW_HOURS * 3600_000;
  if ((input.now ?? new Date()).getTime() > deadline) return 'expired';
  // Les deux valeurs sortent de la base au même format : l'égalité de chaînes
  // est exacte, à la microseconde — une date JavaScript, elle, s'arrête à la
  // milliseconde.
  if ((input.stamp.at ?? null) !== (input.programChangedAt ?? null)) return 'modified';
  return 'available';
}

export type ProgramChapter = { id: string; importId: string | null; hidden: boolean };
export type ProgramNotion = { id: string; importId: string | null; chapterId: string | null };

/** Les éléments de `current` (ordonnés) qui ont changé de place PAR RAPPORT AUX
 *  AUTRES, d'après `previous`. Un élément simplement décalé par une insertion
 *  n'a pas bougé : on garde la plus longue suite restée dans l'ordre, et tout
 *  le reste a bougé. Les éléments inconnus de `previous` sont ignorés. */
export function relativeMoves(previous: readonly string[], current: readonly string[]): string[] {
  const rank = new Map(previous.map((id, i) => [id, i]));
  const seq = current.filter((id) => rank.has(id));
  const n = seq.length;
  // Plus longue sous-suite croissante, en O(n²) : quelques dizaines de chapitres.
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (rank.get(seq[j])! < rank.get(seq[i])! && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
    }
  }
  let end = -1;
  for (let i = 0; i < n; i++) if (end === -1 || len[i] > len[end]) end = i;
  const kept = new Set<string>();
  for (let i = end; i !== -1; i = prev[i]) kept.add(seq[i]);
  return seq.filter((id) => !kept.has(id));
}

export type GenerationMarks = {
  newChapters: string[];
  newNotions: string[];
  movedNotions: string[];
  /** Écartés par la génération, ou déplacés par rapport aux autres chapitres. */
  changedChapters: string[];
};

/** Ce que l'écran marque « nouveau » et « modifié ». */
export function generationMarks(
  importId: string,
  trace: GenerationTrace,
  chapters: readonly ProgramChapter[],
  notions: readonly ProgramNotion[],
): GenerationMarks {
  const notionById = new Map(notions.map((n) => [n.id, n]));
  const untagged = chapters.filter((c) => c.importId !== importId);
  const untaggedIds = new Set(untagged.map((c) => c.id));

  const moved = trace.movedNotions.filter((id) => {
    const n = notionById.get(id);
    return n && n.importId !== importId && n.chapterId !== (trace.before[id] ?? null);
  });
  // Une notion reformulée par une redite a changé : « modifié », comme déplacée.
  const reworded = Object.keys(trace.retitled).filter((id) => {
    const n = notionById.get(id);
    return n && n.importId !== importId;
  });
  const movedNotions = [...new Set([...moved, ...reworded])];

  const hiddenNow = new Set(chapters.filter((c) => c.hidden).map((c) => c.id));
  const hidden = trace.hiddenChapters.filter((id) => untaggedIds.has(id) && hiddenNow.has(id));
  const reordered = trace.order
    ? relativeMoves(trace.order, untagged.filter((c) => !c.hidden).map((c) => c.id))
    : [];

  return {
    newChapters: chapters.filter((c) => c.importId === importId).map((c) => c.id),
    newNotions: notions.filter((n) => n.importId === importId).map((n) => n.id),
    movedNotions,
    changedChapters: [...new Set([...hidden, ...reordered])],
  };
}

export function hasMarks(m: GenerationMarks): boolean {
  return m.newChapters.length + m.newNotions.length + m.movedNotions.length + m.changedChapters.length > 0;
}

export type GenerationUndoPlan = {
  /** Les notions existantes à remettre dans leur chapitre d'avant (`null` :
   *  sans chapitre, ou chapitre disparu depuis). */
  moves: { notionId: string; chapterId: string | null }[];
  /** Les notions existantes reformulées, avec le titre à leur rendre. */
  retitles: { notionId: string; title: string }[];
  unhide: string[];
  /** L'ordre complet des chapitres qui restent, ou `null` s'il ne change pas. */
  order: string[] | null;
};

/** Ce que l'annulation réécrit, en plus de la suppression de ce que porte
 *  l'étiquette du lot. Ne vise jamais une ligne créée par la génération : elle
 *  part de toute façon. */
export function planGenerationUndo(
  importId: string,
  trace: GenerationTrace,
  chapters: readonly ProgramChapter[],
  notions: readonly ProgramNotion[],
): GenerationUndoPlan {
  const surviving = chapters.filter((c) => c.importId !== importId);
  const survivingIds = new Set(surviving.map((c) => c.id));
  const notionById = new Map(notions.map((n) => [n.id, n]));

  const moves: GenerationUndoPlan['moves'] = [];
  for (const id of new Set(trace.movedNotions)) {
    const n = notionById.get(id);
    if (!n || n.importId === importId || !(id in trace.before)) continue;
    const wanted = trace.before[id];
    const target = wanted && survivingIds.has(wanted) ? wanted : null;
    if (n.chapterId !== target) moves.push({ notionId: id, chapterId: target });
  }

  const retitles = Object.entries(trace.retitled)
    .filter(([id]) => {
      const n = notionById.get(id);
      return n && n.importId !== importId;
    })
    .map(([notionId, title]) => ({ notionId, title }));

  const hiddenNow = new Set(chapters.filter((c) => c.hidden).map((c) => c.id));
  const unhide = trace.hiddenChapters.filter((id) => survivingIds.has(id) && hiddenNow.has(id));

  let order: string[] | null = null;
  if (trace.order) {
    const currentIds = surviving.map((c) => c.id);
    const known = trace.order.filter((id) => survivingIds.has(id));
    const knownSet = new Set(known);
    const next = [...known, ...currentIds.filter((id) => !knownSet.has(id))];
    if (next.some((id, i) => id !== currentIds[i])) order = next;
  }

  return { moves, retitles, unhide, order };
}

// ─── Base ────────────────────────────────────────────────────────────────────

const CHUNK = 100;
function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

type LatestImport = { id: string; finishedAt: string | null; outcome: string | null; scope: unknown };

async function loadLatestProgramImport(workshopId: string): Promise<LatestImport | null> {
  const { data, error } = await getSupabaseServerClient()
    .from('ai_imports')
    .select('id, finished_at, outcome, scope')
    .eq('workshop_id', workshopId)
    .in('origin', [...PROGRAM_ORIGINS])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    finishedAt: (data.finished_at as string | null) ?? null,
    outcome: (data.outcome as string | null) ?? null,
    scope: data.scope,
  };
}

async function loadProgram(workshopId: string): Promise<{
  chapters: ProgramChapter[];
  notions: ProgramNotion[];
  programChangedAt: string | null;
}> {
  const supabase = getSupabaseServerClient();
  const [chapters, notions, workshop] = await Promise.all([
    supabase.from('workshop_chapters').select('id, import_id, hidden').eq('workshop_id', workshopId).order('position').order('id'),
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    supabase.from('workshop_bricks').select('id, import_id, chapter_id').eq('workshop_id', workshopId),
    supabase.from('workshops').select('program_changed_at').eq('id', workshopId).single(),
  ]);
  if (chapters.error) throw new Error(chapters.error.message);
  if (notions.error) throw new Error(notions.error.message);
  if (workshop.error) throw new Error(workshop.error.message);
  return {
    chapters: (chapters.data ?? []).map((c) => ({
      id: c.id as string,
      importId: (c.import_id as string | null) ?? null,
      hidden: c.hidden === true,
    })),
    notions: (notions.data ?? []).map((n) => ({
      id: n.id as string,
      importId: (n.import_id as string | null) ?? null,
      chapterId: (n.chapter_id as string | null) ?? null,
    })),
    programChangedAt: (workshop.data?.program_changed_at as string | null) ?? null,
  };
}

/** Pose le tampon de clôture : la dernière modification du programme au moment
 *  où la génération se termine. Appelée par la clôture du lot (orchestrateur). */
export async function stampProgram(workshopId: string, importId: string): Promise<void> {
  // Lu et écrit dans la même instruction, par la base (08/10/2026) : ni une
  // autre écriture du `scope` ni plusieurs clôtures simultanées ne peuvent plus
  // l'effacer. `workshopId` reste dans la signature : la base le retrouve
  // elle-même depuis le lot.
  void workshopId;
  const { error } = await getSupabaseServerClient().rpc('stamp_ai_import_program', { p_import_id: importId });
  if (error) throw new Error(error.message);
}

export type GenerationUndoView = {
  importId: string;
  /** Fin de la fenêtre d'annulation. */
  expiresAt: string;
  marks: GenerationMarks;
};

/** La dernière génération du programme, si elle s'annule encore et qu'elle a
 *  changé quelque chose dans Chapitre & Notion. */
export async function getGenerationUndo(workshopId: string): Promise<GenerationUndoView | null> {
  const latest = await loadLatestProgramImport(workshopId);
  if (!latest) return null;
  const trace = traceOf(latest.scope);
  // Rien à lire tant que le tampon dit non : on s'épargne la lecture du programme.
  if (!trace.stamp || !latest.finishedAt || latest.outcome === 'stopped') return null;

  const program = await loadProgram(workshopId);
  const state = generationUndoState({
    finishedAt: latest.finishedAt,
    outcome: latest.outcome,
    stamp: trace.stamp,
    programChangedAt: program.programChangedAt,
  });
  if (state !== 'available') return null;

  const marks = generationMarks(latest.id, trace, program.chapters, program.notions);
  if (!hasMarks(marks)) return null;
  return {
    importId: latest.id,
    expiresAt: new Date(new Date(latest.finishedAt).getTime() + GENERATION_UNDO_WINDOW_HOURS * 3600_000).toISOString(),
    marks,
  };
}

export type UndoGenerationResult =
  | { ok: true }
  | { ok: false; reason: Exclude<GenerationUndoState, 'available'> | 'superseded' };

/** Annule la dernière génération du programme. Revérifie tout : l'écran a pu
 *  rester ouvert pendant qu'un autre gestionnaire modifiait le programme. */
export async function undoGeneration(workshopId: string, importId: string): Promise<UndoGenerationResult> {
  assertImportId(importId);
  const latest = await loadLatestProgramImport(workshopId);
  if (!latest || latest.id !== importId) return { ok: false, reason: 'superseded' };

  const trace = traceOf(latest.scope);
  const program = await loadProgram(workshopId);
  const state = generationUndoState({
    finishedAt: latest.finishedAt,
    outcome: latest.outcome,
    stamp: trace.stamp,
    programChangedAt: program.programChangedAt,
  });
  if (state !== 'available') return { ok: false, reason: state };

  const plan = planGenerationUndo(importId, trace, program.chapters, program.notions);
  const supabase = getSupabaseServerClient();
  const now = new Date().toISOString();

  // 1. Les notions existantes reviennent dans leur chapitre — avant la
  // suppression, pour qu'aucune ne transite par un chapitre qui va partir.
  const byTarget = new Map<string | null, string[]>();
  for (const m of plan.moves) byTarget.set(m.chapterId, [...(byTarget.get(m.chapterId) ?? []), m.notionId]);
  for (const [chapterId, ids] of byTarget) {
    for (const part of chunks(ids)) {
      // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
      const { error } = await supabase
        .from('workshop_bricks')
        .update({ chapter_id: chapterId, updated_at: now })
        .eq('workshop_id', workshopId)
        .in('id', part);
      if (error) throw new Error(error.message);
    }
  }

  // 1 bis. Les notions reformulées par une redite reprennent leur titre.
  for (const r of plan.retitles) {
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    const { error } = await supabase
      .from('workshop_bricks')
      .update({ title: r.title, updated_at: now })
      .eq('workshop_id', workshopId)
      .eq('id', r.notionId);
    if (error) throw new Error(error.message);
  }

  // 2. Les chapitres écartés reviennent au programme.
  for (const part of chunks(plan.unhide)) {
    const { error } = await supabase
      .from('workshop_chapters')
      .update({ hidden: false, updated_at: now })
      .eq('workshop_id', workshopId)
      .in('id', part);
    if (error) throw new Error(error.message);
  }

  // 3. Ce qu'elle a créé part — questions, notions, chapitres.
  await deleteImportRows(workshopId, importId);

  // 4. L'ordre d'avant, sur les chapitres qui restent. Cosmétique : un échec ne
  // fait pas échouer l'annulation.
  if (plan.order) {
    const reordered = await reorderChapters(workshopId, plan.order);
    if (!reordered.success) console.warn('[generationUndo] ordre des chapitres non rétabli :', reordered.error);
  }

  return { ok: true };
}
