// L'orchestration : enchaîner les passes, une **unité bornée** à la fois.
//
// ─── Pourquoi trois fonctions et non une ─────────────────────────────────────
//
// Une ingestion complète, c'est 1 + N + N appels au modèle, soit plusieurs
// minutes. Aucune fonction serveur ne tient ça. Plutôt que de rallonger le
// délai, on rend la question sans objet (§5.4) : chaque fonction ci-dessous
// fait **un seul appel au modèle et écrit sa part**, et c'est le client qui
// enchaîne. La barre de progression est gratuite, et un chapitre en échec se
// rejoue seul.
//
// ─── L'ordre d'appel n'est pas libre ─────────────────────────────────────────
//
//   startIngestion            → crée le lot, écrit les CHAPITRES
//   ingestChapterNotions(×N)  → pour chaque chapitre, écrit ses NOTIONS
//   ingestChapterQuestions(×M)→ pour chaque LOT DE NOTIONS, écrit ses QUESTIONS
//
// L'unité de la passe 3 est le **lot de ~10 notions**, pas le chapitre : à la
// volumétrie cible, un chapitre entier dépasserait `MAX_TOKENS` et la réponse
// serait tronquée, donc perdue (§16.2). Le nombre de lots n'étant connu qu'une
// fois les notions écrites, chaque appel le renvoie (`batches`) et le client
// boucle jusque-là.
//
// **Grouper les appels par passe**, comme ci-dessus, et non chapitre par
// chapitre : le cache de prompt est propre à chaque schéma de sortie (mesuré le
// 20/08/2026, §5.2), donc alterner notions/questions le ferait manquer à chaque
// fois. Sur douze chapitres, c'est la différence entre ~3 $ et ~11 $.
//
// ─── Ce qui circule entre les appels ─────────────────────────────────────────
//
// Rien, ou presque : l'état vit en base. `ai_imports.file_ids` porte les
// poignées de documents déjà remises au fournisseur — sans quoi chaque appel
// re-téléverserait le cours entier —, et les chapitres écrits portent déjà leur
// identifiant réel, qui sert de référence aux passes suivantes.

import { readObject } from '@/lib/storage';
import { getSupabaseServerClient } from '@/lib/supabase';

import {
  addImportUsage,
  createImport,
  insertChapters,
  insertGroups,
  insertNotions,
  loadExistingRefs,
} from './ingest';
import { batchNotions } from './passInput';
import { parsePlan, type PlanIssue } from './planSchema';
import { MAX_QUESTIONS_PER_IMPORT, type ExistingContent } from './prompt';
import { createClaudeProvider } from './providers/claude';
import type { PlanProvider, PreparedDocument } from './providers/types';

export type IngestContext = 'parcours' | 'exam';

export type StartResult = {
  importId: string;
  chapters: { id: string; name: string }[];
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type ChapterPassResult = {
  written: number;
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type QuestionPassResult = ChapterPassResult & {
  /** Nombre total de lots de notions pour ce chapitre. Le client rappelle
   *  l'action pour les indices 1..batches-1. `0` = chapitre sans notion. */
  batches: number;
};

// ─── Trois chargeurs, un par passe ───────────────────────────────────────────
//
// Il n'y en avait qu'un, qui lisait l'atelier entier pour les trois passes. Ce
// n'était pas seulement du gaspillage de requête : tout ce qu'il rapportait
// partait au modèle, facturé plein tarif, à chaque appel (§16.3). Chaque
// chargeur ci-dessous est donc **borné par un filtre**, et rend un
// `ExistingContent` volontairement partiel — la portée du bloc (`ExistingScope`)
// jetterait de toute façon le reste.

const EMPTY: ExistingContent = { chapters: [], notions: [], questions: [] };

/** Passe 1 — les chapitres existants. Seul chargeur sans filtre plus étroit que
 *  l'atelier : la passe raisonne justement sur l'ensemble du programme. */
async function loadExistingChapters(workshopId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('workshop_chapters')
    .select('id, name')
    .eq('workshop_id', workshopId)
    .order('position');
  if (error) throw new Error(error.message);

  return { ...EMPTY, chapters: (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })) };
}

/** Passe 2 — les notions **du chapitre traité**. */
async function loadChapterNotions(workshopId: string, chapterId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .select('id, title, chapter_id')
    .eq('workshop_id', workshopId)
    .eq('chapter_id', chapterId);
  if (error) throw new Error(error.message);

  return {
    ...EMPTY,
    notions: (data ?? []).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      chapterId: (n.chapter_id as string | null) ?? null,
    })),
  };
}

/** Passe 3 — les énoncés portant sur **les seules notions traitées**. On part de
 *  la table de liens, pas des questions : c'est elle qui porte le filtre. */
async function loadNotionQuestions(notionIds: string[]): Promise<ExistingContent> {
  if (notionIds.length === 0) return EMPTY;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_item_bricks')
    .select('item_id, brick_id, exam_question_items!inner(content)')
    .in('brick_id', notionIds);
  if (error) throw new Error(error.message);

  // Une question reliée à deux des notions demandées ne doit apparaître qu'une
  // fois : on regroupe par question, pas par lien.
  const byItem = new Map<string, { content: string; notionIds: string[] }>();
  for (const row of data ?? []) {
    const itemId = row.item_id as string;
    const item = row.exam_question_items as unknown as { content: string } | null;
    const entry = byItem.get(itemId) ?? { content: item?.content ?? '', notionIds: [] };
    entry.notionIds.push(row.brick_id as string);
    byItem.set(itemId, entry);
  }

  return { ...EMPTY, questions: [...byItem.values()] };
}

/** Les documents déjà remis au fournisseur pour ce lot. Les poignées sont
 *  conservées dans `ai_imports.file_ids` précisément pour que les 24 appels
 *  suivants ne re-téléversent rien. */
async function preparedOf(importId: string): Promise<PreparedDocument[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('file_ids').eq('id', importId).single();
  if (error || !data) throw new Error(error?.message ?? 'import introuvable');
  return (data.file_ids as PreparedDocument[]) ?? [];
}

/** Combien de questions ce lot a-t-il déjà produites ? Le plafond porte sur
 *  l'import entier, pas sur un chapitre (§9). */
async function questionsWritten(importId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('exam_questions').select('id').eq('import_id', importId);
  if (error) throw new Error(error.message);
  const groupIds = (data ?? []).map((r) => r.id as string);
  if (groupIds.length === 0) return 0;

  const { count, error: countError } = await supabase
    .from('exam_question_items')
    .select('id', { count: 'exact', head: true })
    .in('group_id', groupIds);
  if (countError) throw new Error(countError.message);
  return count ?? 0;
}

/** Ouvre l'ingestion : téléverse les documents une fois pour toutes, puis écrit
 *  les chapitres. C'est le seul appel qui remet les fichiers au fournisseur. */
export async function startIngestion(
  workshopId: string,
  actorId: string,
  fileIds: string[],
  options: { provider?: PlanProvider; scope?: Record<string, unknown> } = {},
): Promise<StartResult> {
  const provider = options.provider ?? createClaudeProvider();
  const supabase = getSupabaseServerClient();

  const { data: files, error } = await supabase
    .from('workshop_files')
    .select('id, name, mime_type, storage_path')
    .eq('workshop_id', workshopId)
    .in('id', fileIds);
  if (error) throw new Error(error.message);
  if (!files || files.length === 0) throw new Error('Aucun fichier exploitable pour la génération');

  const documents = await Promise.all(
    files.map(async (f) => {
      const bytes = await readObject(f.storage_path as string);
      if (!bytes) throw new Error(`Fichier illisible : ${f.name}`);
      return {
        key: f.storage_path as string,
        fileName: f.name as string,
        mimeType: f.mime_type as string,
        bytes,
      };
    }),
  );

  const prepared = await provider.prepare(documents);

  // Les poignées sont enregistrées AVANT le premier appel au modèle : si celui-ci
  // échoue, on ne perd pas le téléversement.
  const importId = await createImport(workshopId, actorId, {
    scope: options.scope,
    fileIds: prepared as unknown as string[],
  });

  const existing = await loadExistingChapters(workshopId);
  const result = await provider.documentToPlan(prepared, existing, { pass: 'chapters' });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlan(result.plan, refs);
  const created = await insertChapters(workshopId, actorId, importId, plan.chapters);

  return {
    importId,
    chapters: plan.chapters.map((c) => ({ id: created.get(c.ref) ?? c.ref, name: c.name })),
    discarded: plan.discarded,
    adjusted: plan.adjusted,
  };
}

/** Passe 2, pour UN chapitre. Le chapitre est déjà en base : son identifiant
 *  réel sert de référence au modèle, qui n'a donc aucune clé locale à inventer. */
export async function ingestChapterNotions(
  workshopId: string,
  actorId: string,
  importId: string,
  chapter: { id: string; name: string },
  options: { provider?: PlanProvider } = {},
): Promise<ChapterPassResult> {
  const provider = options.provider ?? createClaudeProvider();

  const prepared = await preparedOf(importId);
  const existing = await loadChapterNotions(workshopId, chapter.id);
  const result = await provider.documentToPlan(prepared, existing, { pass: 'notions', chapter });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlan(result.plan, refs);
  const created = await insertNotions(workshopId, actorId, importId, plan.notions, new Map());

  return { written: created.size, discarded: plan.discarded, adjusted: plan.adjusted };
}

/** Passe 3, pour UN LOT de notions d'un chapitre. Les notions du lot lui sont
 *  fournies avec leurs identifiants réels : chaque question naît donc reliée,
 *  sans qu'on ait à l'imposer par une règle. */
export async function ingestChapterQuestions(
  workshopId: string,
  actorId: string,
  importId: string,
  chapter: { id: string; name: string },
  context: IngestContext,
  batchIndex = 0,
  options: { provider?: PlanProvider } = {},
): Promise<QuestionPassResult> {
  const provider = options.provider ?? createClaudeProvider();
  const supabase = getSupabaseServerClient();

  // L'ordre doit être **stable d'un appel à l'autre** : le client rappelle cette
  // action une fois par lot, et un ordre flottant ferait se recouvrir deux lots.
  const { data: notionRows, error } = await supabase
    .from('workshop_bricks')
    .select('id, title')
    .eq('workshop_id', workshopId)
    .eq('chapter_id', chapter.id)
    .order('created_at')
    .order('id');
  if (error) throw new Error(error.message);

  const all = (notionRows ?? []).map((n) => ({ id: n.id as string, title: n.title as string }));
  // Un chapitre sans notion ne produit rien : une question sans notion ne serait
  // tirée par aucun exercice (§11).
  if (all.length === 0) return { written: 0, discarded: [], adjusted: [], batches: 0 };

  const batches = batchNotions(all);
  const notions = batches[batchIndex];
  if (!notions) return { written: 0, discarded: [], adjusted: [], batches: batches.length };

  const budget = MAX_QUESTIONS_PER_IMPORT - (await questionsWritten(importId));
  if (budget <= 0) return { written: 0, discarded: [], adjusted: [], batches: batches.length };

  // Les autres notions du chapitre, en contexte seulement (§16.21) : c'est ce
  // qui remplace le cours pour les niveaux supérieurs de Bloom.
  const inBatch = new Set(notions.map((n) => n.id));
  const neighbours = all.filter((n) => !inBatch.has(n.id));

  // Aucun document : la passe travaille sur les notions, pas sur le cours
  // (§16.3). C'est le poste d'économie principal de tout le chantier — on ne
  // téléverse rien, on ne relit rien, on ne paie donc rien pour le corpus.
  const existing = await loadNotionQuestions(notions.map((n) => n.id));
  const result = await provider.documentToPlan([], existing, {
    pass: 'questions',
    chapter,
    notions,
    neighbours,
    budget,
  });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlan(result.plan, refs);

  // Le contexte n'est pas demandé au modèle : il est imposé par le bouton par
  // lequel l'utilisateur est entré (liste du parcours ou banque d'examen, §8).
  const groups = plan.groups.map((g) => ({ ...g, context }));

  // Le plafond est appliqué ICI et pas seulement suggéré au modèle : la
  // volumétrie relève du prompt, mais le plafond de débit est une garantie.
  const capped: typeof groups = [];
  let remaining = budget;
  for (const group of groups) {
    if (remaining <= 0) break;
    const questions = group.questions.slice(0, remaining);
    remaining -= questions.length;
    capped.push({ ...group, questions });
  }

  const written = await insertGroups(workshopId, importId, capped, new Map());
  return { written, discarded: plan.discarded, adjusted: plan.adjusted, batches: batches.length };
}
