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
//   ingestChapterQuestions(×N)→ pour chaque chapitre, écrit ses QUESTIONS
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

/** Ce que le modèle doit connaître de l'atelier à chaque appel (§8). */
async function loadExistingContent(workshopId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  const [chapters, notions, questions] = await Promise.all([
    supabase.from('workshop_chapters').select('id, name').eq('workshop_id', workshopId).order('position'),
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    supabase.from('workshop_bricks').select('id, title, chapter_id').eq('workshop_id', workshopId),
    supabase
      .from('exam_question_items')
      .select('content, exam_questions!inner(workshop_id), exam_question_item_bricks(brick_id)')
      .eq('exam_questions.workshop_id', workshopId),
  ]);
  if (chapters.error) throw new Error(chapters.error.message);
  if (notions.error) throw new Error(notions.error.message);
  if (questions.error) throw new Error(questions.error.message);

  return {
    chapters: (chapters.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
    notions: (notions.data ?? []).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      chapterId: (n.chapter_id as string | null) ?? null,
    })),
    questions: (questions.data ?? []).map((q) => ({
      content: q.content as string,
      notionIds: ((q.exam_question_item_bricks as { brick_id: string }[] | null) ?? []).map((l) => l.brick_id),
    })),
  };
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

  const existing = await loadExistingContent(workshopId);
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
  const existing = await loadExistingContent(workshopId);
  const result = await provider.documentToPlan(prepared, existing, { pass: 'notions', chapter });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlan(result.plan, refs);
  const created = await insertNotions(workshopId, actorId, importId, plan.notions, new Map());

  return { written: created.size, discarded: plan.discarded, adjusted: plan.adjusted };
}

/** Passe 3, pour UN chapitre. Les notions du chapitre lui sont fournies avec
 *  leurs identifiants réels : chaque question naît donc reliée, sans qu'on ait à
 *  l'imposer par une règle. */
export async function ingestChapterQuestions(
  workshopId: string,
  actorId: string,
  importId: string,
  chapter: { id: string; name: string },
  context: IngestContext,
  options: { provider?: PlanProvider } = {},
): Promise<ChapterPassResult> {
  const provider = options.provider ?? createClaudeProvider();
  const supabase = getSupabaseServerClient();

  const { data: notionRows, error } = await supabase
    .from('workshop_bricks')
    .select('id, title')
    .eq('workshop_id', workshopId)
    .eq('chapter_id', chapter.id);
  if (error) throw new Error(error.message);

  const notions = (notionRows ?? []).map((n) => ({ id: n.id as string, title: n.title as string }));
  // Un chapitre sans notion ne produit rien : une question sans notion ne serait
  // tirée par aucun exercice (§11).
  if (notions.length === 0) return { written: 0, discarded: [], adjusted: [] };

  const budget = MAX_QUESTIONS_PER_IMPORT - (await questionsWritten(importId));
  if (budget <= 0) return { written: 0, discarded: [], adjusted: [] };

  const prepared = await preparedOf(importId);
  const existing = await loadExistingContent(workshopId);
  const result = await provider.documentToPlan(prepared, existing, {
    pass: 'questions',
    chapter,
    notions,
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
  return { written, discarded: plan.discarded, adjusted: plan.adjusted };
}
