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
//   ingestDocumentNotions(×D)  → pour chaque DOCUMENT, écrit ses NOTIONS
//   ingestChapters             → écrit les CHAPITRES
//   ingestAssignments(×L)      → RANGE les notions dans les chapitres
//   ingestParcoursQuestions(×M)→ pour chaque LOT DE NOTIONS, ses questions d'entraînement
//
// …et, sur une voie séparée qui ne s'enchaîne à rien :
//
//   ingestExamQuestions(×T)    → pour chaque TRANCHE du programme, ses questions d'examen
//
// Les deux dernières produisent le même objet — des questions — et n'ont rien
// d'autre en commun (24/08/2026). Le parcours compte par NOTION (douze chacune,
// une notion par question) ; l'examen compte par PROGRAMME (un total fixe pour
// tout l'atelier, chaque question croisant plusieurs notions, un tiers en
// groupes qui s'enchaînent). Deux régimes, deux passes.
//
// ⚠️ **Les deux premières ont été inversées le 23/08/2026** (feuille de route
// docs/chantiers/2026-08-23-notions-dabord.md). Les notions sont le cœur d'un
// atelier, les chapitres ne sont que des boîtes : décider les boîtes en premier
// rendait toute mise à jour impossible, le modèle ne pouvant pas reconnaître un
// chapitre existant sous un découpage redécoupé.
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

import { planImportCleanup } from '@/lib/program/operations';

import {
  addImportUsage,
  applyAssignments,
  createImport,
  hideEmptyChapters,
  hideChapters,
  insertChapters,
  insertGroups,
  insertNotions,
  loadExistingRefs,
  reattachQuestions,
  removeOrphans,
} from './ingest';
import { reorderChapters } from '@/lib/workshops/chapters';
import { MAX_NOTIONS_PER_WORKSHOP, countNotions } from '@/lib/workshops/notions';
import { dropRepeatedQuestions, flagSimilar, findExistingMatch } from './duplicates';
import { batchNotions, examSliceCount, sliceProgram, splitBudget, splitUnplaced, withChapterRetry } from './passInput';
import type { BloomLevel } from '@/lib/workshops/examTypes';
import { demandByNotion, demandForChapterStart, type QuestionDemand } from './demand';
import { BUSY_ERROR, assertImportOpen, closeImport, liveImportOf } from './lock';
import { parsePlan, type PlanIssue } from './planSchema';
import { releaseDocuments } from './release';
import {
  DEFAULT_EXAM_QUESTIONS,
  EXAM_QUESTIONS_PER_CALL,
  MAX_QUESTIONS_PER_IMPORT,
  type ExistingContent,
  type WorkshopIdentity,
} from './prompt';
import { MAX_CORPUS_TOKENS, createClaudeProvider, type ModelId } from './providers/claude';
import { createDeepSeekProvider } from './providers/deepseek';
import type { PlanProvider, PreparedDocument } from './providers/types';

export type IngestContext = 'parcours' | 'exam';

export type PrepareResult = {
  importId: string;
  /** Nombre de documents du lot — le client sait ainsi combien d'appels la
   *  passe notions demande, sans avoir à relire la base. */
  documents: number;
  /** Taille du corpus en tokens, `null` si le fournisseur n'a pas su compter. */
  corpusTokens: number | null;
};

export type ChapterStructureResult = {
  chapters: { id: string; name: string }[];
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type AssignPassResult = {
  /** Combien de notions ce lot a rangées. */
  assigned: number;
  /** Combien de questions en sommeil ont été rattachées à la notion qui
   *  remplace celle dont elles dépendaient. */
  recycled: number;
  /** Nombre total de lots — le client boucle jusque-là. */
  batches: number;
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type ChapterPassResult = {
  written: number;
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type NotionPassResult = ChapterPassResult & {
  /** Nombre total de documents de ce lot — le client boucle jusque-là. Rendu
   *  par chaque appel plutôt que supposé : lui seul relit la base. */
  documents: number;
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

/** TOUTES les notions de l'atelier — servent à deux passes, pour deux raisons.
 *
 *  • Passe notions : ne pas recréer ce qui existe déjà. Le filtre par chapitre
 *    d'avant l'inversion n'a plus de sens — la passe travaille document par
 *    document, elle n'a aucun chapitre de référence, et une notion peut très
 *    bien exister ailleurs dans l'atelier.
 *  • Passe chapitres : c'est la liste de ce qu'elle range. Son entrée
 *    principale, pas un supplément.
 *
 *  L'ordre est **stable** (création puis identifiant) : sans ça, deux appels
 *  successifs verraient la même liste dans deux ordres, ce qui suffit à faire
 *  varier une réponse et à faire manquer un cache. */
async function loadAllNotions(workshopId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .select('id, title, chapter_id')
    .eq('workshop_id', workshopId)
    .order('created_at')
    .order('id');
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

/** Passe questions du PARCOURS — les énoncés portant sur **les seules notions
 *  traitées**. On part de la table de liens, pas des questions : c'est elle qui
 *  porte le filtre.
 *
 *  ⚠️ **Filtré sur la liste d'entraînement, et c'est indispensable** (24/08/2026).
 *  Sans ce filtre, la passe recevait aussi les questions d'examen — deux listes
 *  qui n'ont ni la même volumétrie ni le même régime, et dont la ressemblance
 *  n'est pas un défaut. Pire, à la volumétrie cible, verser une liste dans
 *  l'autre était le retour exact du poste de coût de §16.3. */
async function loadNotionQuestions(notionIds: string[]): Promise<ExistingContent> {
  if (notionIds.length === 0) return EMPTY;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_item_bricks')
    .select('item_id, brick_id, exam_question_items!inner(content, exam_questions!inner(context))')
    .eq('exam_question_items.exam_questions.context', 'parcours')
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

/** Passe EXAMEN — la liste d'examen **en entier**, et non les seules questions
 *  des notions traitées.
 *
 *  Le filtre par notion n'aurait ici aucun sens : une question d'examen croise
 *  plusieurs notions et la tranche suivante piochera dans les mêmes chapitres.
 *  Ce qu'il faut éviter, c'est de reposer une question déjà présente DANS CETTE
 *  LISTE, quelle que soit la notion. La liste est bornée par nature — quelques
 *  dizaines de questions — et le plafond n'est là que pour un atelier qui aurait
 *  accumulé des années d'examens. */
const EXAM_CONTEXT_CAP = 400;

async function loadExamQuestions(workshopId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_questions')
    .select('id, exam_question_items(content)')
    .eq('workshop_id', workshopId)
    .eq('context', 'exam')
    .order('created_at', { ascending: false })
    .limit(EXAM_CONTEXT_CAP);
  if (error) throw new Error(error.message);

  const questions = (data ?? []).flatMap((group) => {
    const items = (group.exam_question_items ?? []) as unknown as { content: string }[];
    return items
      .map((item) => (item.content ?? '').trim())
      .filter((content) => content.length > 0)
      // Aucune notion : la portée `exam` ne filtre pas (voir `ExistingScope`),
      // et prétendre le contraire ferait croire à un filtre qui n'existe pas.
      .map((content) => ({ content, notionIds: [] as string[] }));
  });

  return { ...EMPTY, questions };
}

/** Les énoncés d'ENTRAÎNEMENT de l'atelier, pour vérifier qu'un examen n'en
 *  recopie aucun (25/08/2026).
 *
 *  Rien à voir avec le bloc « existant » : ces énoncés ne partent JAMAIS au
 *  modèle — les verser dans la passe examen, c'est le poste de coût de §16.3 qui
 *  revient. Ils ne servent qu'à une comparaison locale, après coup.
 *
 *  Le plafond est un garde-fou de requête, pas une règle produit : au-delà, la
 *  vérification devient partielle, ce qui reste très supérieur à rien. */
const PARCOURS_CONTEXT_CAP = 3000;

async function loadParcoursContents(workshopId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_questions')
    .select('id, exam_question_items(content)')
    .eq('workshop_id', workshopId)
    .eq('context', 'parcours')
    .order('created_at', { ascending: false })
    .limit(PARCOURS_CONTEXT_CAP);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .flatMap((group) => ((group.exam_question_items ?? []) as unknown as { content: string }[]))
    .map((item) => (item.content ?? '').trim())
    .filter((content) => content.length > 0);
}


/** Le nom et la description de l'atelier — le seul indice de NIVEAU dont le
 *  modèle dispose au moment de rédiger (voir `workshopBlock`). */
/** Combien de questions de parcours existent DÉJÀ par notion et par niveau.
 *
 *  `parcoursQuestionCounts` compte toutes notions confondues ; la demande d'un
 *  chapitre neuf, elle, se formule niveau par niveau — 25 de niveau 1 et rien
 *  d'autre. Sans ce détail, un chapitre déjà pourvu au niveau 2 passerait pour
 *  pourvu au niveau 1. */
async function parcoursQuestionCountsByLevel(
  notionIds: string[],
): Promise<Map<string, Map<number, number>>> {
  const counts = new Map<string, Map<number, number>>();
  if (notionIds.length === 0) return counts;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_item_bricks')
    .select('brick_id, bloom_level')
    .in('brick_id', notionIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const notionId = row.brick_id as string;
    const level = (row.bloom_level as number | null) ?? 1;
    const byLevel = counts.get(notionId) ?? new Map<number, number>();
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
    counts.set(notionId, byLevel);
  }
  return counts;
}

async function loadWorkshopIdentity(workshopId: string): Promise<WorkshopIdentity | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('workshops').select('name, description').eq('id', workshopId).maybeSingle();
  if (!data) return null;
  return { name: (data.name as string) ?? '', description: (data.description as string | null) ?? null };
}

/** Le programme tel qu'un candidat le voit : les chapitres VISIBLES, dans
 *  l'ordre du cours, avec leurs notions.
 *
 *  Les chapitres écartés et les notions sans chapitre en sont absents — ils ne
 *  font pas partie du programme, donc rien ne les évalue. C'est la même règle
 *  que la passe questions du parcours, énoncée une seule fois ici. */
async function loadVisibleProgram(
  workshopId: string,
): Promise<{ id: string; name: string; notions: { id: string; title: string }[] }[]> {
  const supabase = getSupabaseServerClient();
  const [{ data: chapterRows, error: chapterError }, { data: notionRows, error: notionError }] = await Promise.all([
    supabase
      .from('workshop_chapters')
      .select('id, name, hidden')
      .eq('workshop_id', workshopId)
      .order('position')
      .order('id'),
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    supabase
      .from('workshop_bricks')
      .select('id, title, chapter_id')
      .eq('workshop_id', workshopId)
      .order('created_at')
      .order('id'),
  ]);
  if (chapterError) throw new Error(chapterError.message);
  if (notionError) throw new Error(notionError.message);

  const byChapter = new Map<string, { id: string; title: string }[]>();
  for (const n of notionRows ?? []) {
    const chapterId = n.chapter_id as string | null;
    if (!chapterId) continue;
    const bucket = byChapter.get(chapterId) ?? [];
    bucket.push({ id: n.id as string, title: n.title as string });
    byChapter.set(chapterId, bucket);
  }

  return (chapterRows ?? [])
    .filter((c) => c.hidden !== true)
    .map((c) => ({ id: c.id as string, name: c.name as string, notions: byChapter.get(c.id as string) ?? [] }))
    .filter((c) => c.notions.length > 0);
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

/** La taille du corpus mesurée à la préparation. Elle décide du modèle (§16.20)
 *  et vit dans `ai_imports.scope`, du jsonb libre — aucune colonne à ajouter. */
async function corpusTokensOf(importId: string): Promise<number | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  if (error || !data) return null;
  const value = (data.scope as { corpusTokens?: unknown } | null)?.corpusTokens;
  return typeof value === 'number' ? value : null;
}

/** Les modèles dont la fenêtre s'est révélée trop petite pour CE corpus.
 *
 *  Un refus coûte un aller-retour ; le mémoriser fait qu'on ne le paie qu'une
 *  fois pour tout le lot. C'est nécessaire parce que **chaque appel est une
 *  server action distincte** — la passe notions en fait une par chapitre — donc
 *  un fournisseur neuf à chaque fois, sans mémoire de ce que le précédent a
 *  appris. Vit dans `ai_imports.scope`, du jsonb libre : aucune migration.
 *
 *  On enregistre le MODÈLE écarté, pas un booléen « corpus trop gros » : trop
 *  gros pour qui ? La fenêtre est une propriété du modèle, et le jour où
 *  `PASS_MODELS` change, un booléen mentirait tandis que cette liste reste vraie. */
/** La consigne libre de l'utilisateur, saisie au lancement et rangée dans le
 *  `scope` de l'import — donc relue par CHAQUE passe, y compris celles qui
 *  s'exécutent dans des server actions ultérieures. */
async function userHintOf(importId: string): Promise<string | undefined> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  if (error || !data) return undefined;
  const value = (data.scope as { hint?: unknown } | null)?.hint;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Le fournisseur choisi au lancement pour la passe QUESTIONS.
 *
 *  Seule cette passe est concernée : elle ne reçoit aucun document, donc rien
 *  n'y dépend de la lecture des PDF, que DeepSeek ne sait pas faire (voir
 *  `providers/deepseek.ts`). Les passes chapitres et notions restent sur Claude
 *  quoi qu'il arrive — le choix ne leur est même pas proposé.
 *
 *  Repli sur Claude à la moindre valeur inattendue : une chaîne inconnue rangée
 *  dans le `scope` ne doit pas faire échouer un import. */
async function questionsProviderOf(importId: string): Promise<'claude' | 'deepseek'> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  return (data?.scope as { questionsProvider?: unknown } | null)?.questionsProvider === 'deepseek'
    ? 'deepseek'
    : 'claude';
}

async function oversizeModelsOf(importId: string): Promise<ModelId[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  if (error || !data) return [];
  const value = (data.scope as { oversizeModels?: unknown } | null)?.oversizeModels;
  return Array.isArray(value) ? value.filter((m): m is ModelId => typeof m === 'string') : [];
}

/** Ajoute un modèle à cette liste, sans écraser le reste du `scope`.
 *
 *  Lecture-modification-écriture : deux appels concurrents pourraient se
 *  chevaucher, mais le client enchaîne les passes une par une, et le pire cas
 *  (une écriture perdue) ne coûte qu'un aller-retour de plus. */
async function recordOversizeModel(importId: string, model: ModelId): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  const current = Array.isArray(scope.oversizeModels) ? (scope.oversizeModels as string[]) : [];
  if (current.includes(model)) return;
  await supabase
    .from('ai_imports')
    .update({ scope: { ...scope, oversizeModels: [...current, model] } })
    .eq('id', importId);
}

/** `parsePlan`, mais qui **dit ce qu'il jette**.
 *
 *  Les rejets étaient jusqu'ici renvoyés au client et nulle part ailleurs : une
 *  passe qui écarte tout produisait « 0 question » sans laisser la moindre trace
 *  côté serveur, donc rien à examiner après coup (constaté le 22/08/2026 sur un
 *  import qui a rendu 4 chapitres, 76 notions et zéro question). Le motif exact
 *  existe pourtant — `planSchema` le formule — il ne sortait simplement pas.
 *
 *  On journalise les cinq premiers : assez pour reconnaître un motif répété,
 *  pas assez pour noyer la sortie sur un plan entièrement invalide. */
/** `truncated` : la réponse du modèle a été coupée au plafond de sortie. Elle
 *  devient un écart à part entière — sans ça, l'appel disparaît sans un mot et
 *  le compte-rendu annonce simplement moins de questions que demandé (perte
 *  constatée le 28/08/2026). */
function parsePlanLogged(
  pass: string,
  raw: unknown,
  refs: Parameters<typeof parsePlan>[1],
  truncated = false,
) {
  const plan = parsePlan(raw, refs);
  if (truncated) {
    plan.discarded.push({
      kind: 'question',
      reason:
        'réponse du modèle coupée avant la fin : ce qu’elle contenait est illisible et n’a pas pu être écrit. Relancer récupère ce qui manque.',
    });
  }
  if (plan.discarded.length > 0) {
    const apercu = plan.discarded.slice(0, 5).map((i) => `${i.kind}${i.ref ? ` (${i.ref})` : ''} : ${i.reason}`);
    console.warn(`[ingest] passe ${pass} : ${plan.discarded.length} élément(s) écarté(s) — ${apercu.join(' | ')}`);
  }
  if (plan.adjusted.length > 0) {
    console.info(`[ingest] passe ${pass} : ${plan.adjusted.length} élément(s) corrigé(s)`);
  }
  return plan;
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

/** Ouvre le lot : téléverse les documents **une fois pour toutes**, compte le
 *  corpus, et s'arrête là.
 *
 *  ⚠️ **L'ordre compte, et c'est le piège de cette découpe.** Pour estimer avant
 *  de lancer, les documents doivent déjà être chez le fournisseur — un
 *  téléversement est gratuit, un appel au modèle ne l'est pas. D'où deux
 *  fonctions au lieu d'une : celle-ci prépare et mesure, `startIngestion`
 *  **réutilise** les poignées. On ne téléverse jamais deux fois.
 *
 *  Le comptage est ⚠️ TEMPORAIRE — phase de test (voir `cost.ts`) ; le reste,
 *  non : le téléversement et la création du lot ont toujours eu lieu ici. */
export async function prepareIngestion(
  workshopId: string,
  actorId: string,
  fileIds: string[],
  options: { provider?: PlanProvider; scope?: Record<string, unknown> } = {},
): Promise<PrepareResult> {
  // ─── Une génération à la fois sur un atelier (29/08/2026) ────────────────
  //
  // AVANT le moindre téléversement : deux enchaînements sur le même atelier
  // écrivent les mêmes chapitres et les mêmes notions, et le ménage de fin de
  // l'un peut cacher ce que l'autre vient de remplir. Le refus se reconnaît à
  // son mot-clé, que le dialogue traduit (voir `./lock`).
  if (await liveImportOf(workshopId)) throw new Error(BUSY_ERROR);

  // ⚠️ **Le lot naît AVANT le téléversement, et c'est tout l'intérêt.** C'est lui
  // qui porte le verrou : le créer à la fin, comme avant, laissait grande ouverte
  // la seule fenêtre où deux lancements peuvent réellement se croiser — celle du
  // téléversement, qui dure des dizaines de secondes. Les poignées de fichiers et
  // la taille du corpus le rejoignent ensuite, quand elles sont connues.
  const importId = await createImport(workshopId, actorId, { scope: options.scope ?? {}, live: true });

  try {
    return await openCorpus(workshopId, importId, fileIds, options);
  } catch (error) {
    // Le lot n'a pas pu s'ouvrir (fichier illisible, corpus trop volumineux,
    // fournisseur en panne) : le verrou tombe tout de suite. Sans ça, l'atelier
    // resterait bloqué deux minutes après une erreur que l'utilisateur vient de
    // lire, et sa première réaction — réessayer — se ferait refuser.
    await closeImport(importId);
    throw error;
  }
}

/** Le corps du téléversement, une fois le lot ouvert et le verrou tenu. Séparé
 *  pour que **toute** sortie en erreur relâche le verrou, sans avoir à énumérer
 *  les six endroits où celle-ci peut se produire. */
async function openCorpus(
  workshopId: string,
  importId: string,
  fileIds: string[],
  options: { provider?: PlanProvider; scope?: Record<string, unknown> },
): Promise<PrepareResult> {
  const supabase = getSupabaseServerClient();

  // ─── Un lot SANS document est légitime ──────────────────────────────────
  //
  // Depuis le 24/08/2026, ajouter des questions à une liste ne relit pas le
  // cours : la passe travaille sur les notions déjà extraites (§16.3). Ce
  // lancement-là n'a donc aucun document à téléverser, et exiger un fichier
  // reviendrait à faire payer un corpus dont personne ne se sert.
  //
  // La distinction n'est pas « zéro fichier demandé » mais « des fichiers
  // demandés, aucun trouvé » : la seconde est une vraie panne — fichier
  // supprimé entre-temps, identifiant erroné — et doit continuer d'échouer.
  const { data: files, error } = fileIds.length === 0
    ? { data: [], error: null }
    : await supabase
        .from('workshop_files')
        .select('id, name, mime_type, storage_path')
        .eq('workshop_id', workshopId)
        .in('id', fileIds);
  if (error) throw new Error(error.message);
  if (fileIds.length > 0 && (!files || files.length === 0)) {
    throw new Error('Aucun fichier exploitable pour la génération');
  }

  const documents = await Promise.all(
    files.map(async (f) => {
      const bytes = await readObject(f.storage_path as string);
      if (!bytes) throw new Error(`Fichier illisible : ${f.name}`);
      return {
        fileId: f.id as string,
        key: f.storage_path as string,
        fileName: f.name as string,
        mimeType: f.mime_type as string,
        bytes,
      };
    }),
  );

  // ⚠️ **Le fournisseur n'est créé que s'il y a quelque chose à lui donner.**
  //
  // Un lancement « questions seules » n'a aucun document. Le créer quand même
  // réclamait la clé Claude, et faisait donc échouer dès l'ouverture du lot un
  // import qui devait tourner **entièrement sur DeepSeek** (28/08/2026). Sans
  // document, il n'y a ni téléversement ni corpus à mesurer : zéro token.
  const provider = documents.length === 0 ? null : (options.provider ?? createClaudeProvider());
  const prepared = provider ? await provider.prepare(documents) : [];
  const corpusTokens = provider ? await provider.countCorpus(prepared) : 0;

  // ─── Le mur de la fenêtre ─────────────────────────────────────────────────
  //
  // On refuse ICI, avant le premier appel payant : au-delà de la plus grande fenêtre
  // dont on dispose, la passe chapitres — la seule à recevoir tout le corpus —
  // ne peut PAS être appelée, et le lancement échouerait de toute façon, mais
  // après avoir téléversé et facturé. Un refus mesuré vaut mieux qu'un refus
  // subi.
  //
  // Taille inconnue → on laisse passer : le fournisseur reprend sur le repli
  // quand l'appel est refusé (`isContextWindowOverflow`), ce qui reste le bon
  // filet. On ne bloque jamais sur une mesure qu'on n'a pas.
  if (provider && corpusTokens !== null && corpusTokens > MAX_CORPUS_TOKENS) {
    await releaseDocuments(provider, prepared);
    throw new Error(
      `Ce cours est trop volumineux pour être lu en une fois (${Math.round(corpusTokens / 1000)} k contre ${Math.round(MAX_CORPUS_TOKENS / 1000)} k au maximum). Retire un document ou découpe le cours en deux ateliers.`,
    );
  }

  // Les poignées sont enregistrées AVANT le premier appel au modèle : si celui-ci
  // échoue, on ne perd pas le téléversement. La taille du corpus voyage dans
  // `scope` — c'est du jsonb libre, aucune migration nécessaire — parce que la
  // passe chapitres en a besoin pour choisir son modèle (§16.20).
  const { error: attachError } = await supabase
    .from('ai_imports')
    .update({
      scope: { ...(options.scope ?? {}), corpusTokens },
      file_ids: prepared as unknown as string[],
    })
    .eq('id', importId);
  if (attachError) throw new Error(attachError.message);

  return { importId, documents: prepared.length, corpusTokens };
}

/** Passe 2 — écrit les CHAPITRES **et y range les notions**.
 *
 *  Anciennement `startIngestion`, et anciennement première : depuis le
 *  23/08/2026 elle passe après l'extraction des notions (feuille de route
 *  « notions d'abord », §3). Ce n'est pas un détail d'ordonnancement — c'est ce
 *  qui rend une mise à jour possible. Au niveau du chapitre, le modèle ne peut
 *  pas reconnaître qu'un « athlétisme 1950-2000 » et un « athlétisme 1940-1990 »
 *  sont la même boîte redécoupée, et il en créerait quatre.
 *
 *  Un seul appel, et il porte les documents : sans le cours, le modèle invente
 *  des intitulés au lieu de reprendre ceux du document, et ne sait pas d'où
 *  viennent les notions qu'on lui demande de répartir.
 *
 *  C'est aussi le seul moment du pipeline qui voit **toutes** les notions d'un
 *  coup — donc le seul où les redites entre deux documents peuvent se repérer.
 *  La réponse reste dans le contrat : on en range une, l'autre reste sans
 *  chapitre, et le ménage de fin d'import s'en occupe si personne ne l'a créée
 *  avant cet import. */
export async function ingestChapters(
  workshopId: string,
  actorId: string,
  importId: string,
  options: { provider?: PlanProvider } = {},
): Promise<ChapterStructureResult> {
  const [corpusTokens, oversizeModels, userHint] = await Promise.all([
    corpusTokensOf(importId), oversizeModelsOf(importId), userHintOf(importId),
  ]);
  const provider = options.provider ?? createClaudeProvider({
    corpusTokens: corpusTokens ?? undefined,
    oversizeModels,
    userHint,
    onOversize: (model) => recordOversizeModel(importId, model),
  });
  const prepared = await preparedOf(importId);

  const [chaptersOnly, notionsOnly, refs] = await Promise.all([
    loadExistingChapters(workshopId),
    loadAllNotions(workshopId),
    loadExistingRefs(workshopId),
  ]);
  const existing: ExistingContent = { ...chaptersOnly, notions: notionsOnly.notions };
  const toArrange = notionsOnly.notions.map((n) => ({ id: n.id, title: n.title }));

  // Un découpage trop fin est le multiplicateur de tout ce qui suit (§16.15) :
  // au-delà du seuil, on relance UNE fois — une VÉRIFICATION, pas une
  // correction imposée. Si la seconde réponse dépasse encore, on écrit ce
  // qu'elle donne : jamais de blocage, jamais de troisième appel, et surtout
  // aucune validation humaine (§16.18).
  const { result: plan } = await withChapterRetry(
    async (retry) => {
      const attempt = await provider.documentToPlan(prepared, existing, {
        pass: 'chapters',
        notions: toArrange,
        retry,
      });
      // Les deux essais sont facturés : les deux sont comptés.
      await addImportUsage(importId, attempt.usage);
      return parsePlanLogged('chapitres', attempt.plan, refs, attempt.truncated);
    },
    (parsed) => parsed.chapters.length,
    (parsed) => parsed.chapters.map((c) => c.name),
  );

  // ⚠️ **Un chapitre proposé en double est REDIRIGÉ, jamais écarté.**
  //
  // `insertChapters` écrivait tout ce que le modèle rendait, sans rien comparer
  // à l'existant : la consigne était le seul rempart (fragilité repérée le
  // 22/08/2026). Le même outil de ressemblance que pour les notions ferme le
  // trou — mais la conduite à tenir n'est pas la même. Écarter une notion en
  // double ne coûte rien, rien n'en dépend encore ; écarter un CHAPITRE
  // orphelinerait toutes les notions qu'on venait de lui affecter. On ne le crée
  // donc pas, et sa référence pointe vers le chapitre existant : les
  // affectations atterrissent au bon endroit sans le savoir.
  const reused = new Map<string, string>();
  const fresh = plan.chapters.filter((c) => {
    const found = findExistingMatch(c.name, chaptersOnly.chapters, (ch) => ch.name);
    if (!found) return true;
    reused.set(c.ref, found.match.id);
    // Jamais silencieux : l'utilisateur doit pouvoir constater la fusion.
    plan.adjusted.push({
      kind: 'chapter',
      ref: c.ref,
      reason: `chapitre déjà présent (« ${found.match.name} ») — notions rangées dedans plutôt que dans un doublon`,
    });
    return false;
  });

  // ─── Ce que le cours ne couvre plus ───────────────────────────────────────
  //
  // Décidé ICI et nulle part ailleurs (25/08/2026) : cette passe est la SEULE à
  // recevoir les documents. L'étape de rangement, elle, ne voit que des noms de
  // chapitres — elle n'a aucun moyen de savoir laquelle est la bonne version du
  // cours, et trouverait légitimes deux chapitres qui se recouvrent.
  //
  // C'est une déclaration POSITIVE : ce que le modèle ne nomme pas reste au
  // programme. L'omission — sa panne la plus banale sur une longue liste — est
  // donc sans effet, là où « voici l'architecture complète, le reste dégage »
  // aurait fait d'un oubli une amputation.
  //
  // Appliqué AVANT le rangement, donc les notions ne seront jamais proposées à
  // un chapitre qu'on vient d'écarter ; celles qui n'ont plus leur place
  // ailleurs y resteront, hors programme, ce qui rend le changement lisible.
  const byId = new Map(chaptersOnly.chapters.map((c) => [c.id, c.name]));
  const outOfProgram = plan.chapterOrder.filter((c) => c.rank === 0).map((c) => c.ref);

  // ⚠️ **Le garde-fou du tout-ou-rien.** Écarter CHAQUE chapitre existant en un
  // import n'est presque jamais une décision : c'est un modèle qui a mal lu sa
  // consigne, ou un document sans rapport déposé par erreur. Le cas légitime —
  // remplacer intégralement le cours d'un atelier — existe, mais il se fait en
  // deux fois, et il vaut mieux le demander deux fois que vider un programme
  // sur un malentendu. On n'applique rien, et on le DIT.
  const wipesEverything =
    chaptersOnly.chapters.length > 0 && outOfProgram.length >= chaptersOnly.chapters.length;
  if (wipesEverything) {
    plan.adjusted.push({
      kind: 'chapter',
      reason: `l'IA proposait d'écarter les ${outOfProgram.length} chapitres de l'atelier — rien n'a été écarté, un programme ne se vide pas d'un seul import`,
    });
  }

  const discardedChapters = wipesEverything ? [] : await hideChapters(workshopId, outOfProgram);
  for (const id of discardedChapters) {
    const reason = plan.chapterOrder.find((c) => c.ref === id)?.reason?.trim();
    plan.adjusted.push({
      kind: 'chapter',
      ref: id,
      reason: `« ${byId.get(id) ?? id} » écarté du programme${reason ? ` : ${reason}` : ' — plus couvert par les documents'}`,
    });
  }

  const created = new Map([...(await insertChapters(workshopId, actorId, importId, fresh)), ...reused]);

  // ─── L'ordre du programme ─────────────────────────────────────────────────
  //
  // Les rangs sont RELATIFS : on ne lit que leur ordre, jamais leur valeur — un
  // modèle qui numérote 10, 20, 30 dit la même chose que 1, 2, 3. Les chapitres
  // que le modèle n'a pas rangés suivent, dans l'ordre où ils étaient : ne rien
  // dire d'un chapitre, c'est le laisser où il est.
  //
  // `reorderChapters` exige la liste COMPLÈTE — chapitres écartés compris, ils
  // ont eux aussi une position — et réécrit toutes les places d'un coup, ce qui
  // interdit les trous et les doublons. Un classement incomplet ne réordonne
  // rien du tout, et on le dit : sans ça, l'ordre resterait mystérieusement le
  // même alors que l'IA a bien répondu quelque chose.
  const reordering = await applyChapterOrder(workshopId, plan.chapterOrder, created);
  if (reordering.missing > 0) {
    plan.adjusted.push({
      kind: 'chapter',
      reason: `ordre du programme inchangé : l'IA n'a pas classé ${reordering.missing} chapitre${reordering.missing > 1 ? 's' : ''} sur les ${reordering.missing + plan.chapterOrder.filter((c) => c.rank > 0).length}`,
    });
  }

  return {
    // Seuls les chapitres RÉELLEMENT créés sont comptés : un doublon redirigé
    // vers un chapitre existant n'est pas une création, et l'annoncer comme
    // telle ferait croire à un programme qui a doublé de taille.
    chapters: fresh.map((c) => ({ id: created.get(c.ref) ?? c.ref, name: c.name })),
    discarded: plan.discarded,
    adjusted: plan.adjusted,
  };
}

/** Écrit l'ordre du programme d'après les rangs rendus par le modèle.
 *
 *  ⚠️ **TOUT OU RIEN** (25/08/2026). On ne réordonne que si CHAQUE chapitre
 *  encore au programme a reçu un rang. Un classement partiel est une consigne
 *  ambiguë : les chapitres oubliés devraient aller… où ? Les pousser à la fin
 *  détruit l'ordre que l'utilisateur avait choisi pour eux, et les laisser à
 *  leur ancienne place n'a pas de sens puisque les places sont réécrites en
 *  bloc. Or l'ordre est cosmétique (`operations.ts`) : ne rien changer est
 *  toujours moins grave que remuer un programme sur une réponse incomplète.
 *
 *  Il n'y a donc **jamais deux chapitres à la même place** : `reorderChapters`
 *  reçoit la liste complète et réécrit toutes les positions d'un coup, ou on
 *  n'écrit rien du tout.
 *
 *  Les chapitres écartés ne sont pas exigés — ils ne sont plus au programme —
 *  et suivent en queue, dans l'ordre où ils étaient.
 *
 *  Ne lève jamais : un import réussi ne doit pas être annoncé en échec parce
 *  qu'un chapitre est resté à sa place. */
async function applyChapterOrder(
  workshopId: string,
  order: readonly { ref: string; rank: number }[],
  created: ReadonlyMap<string, string>,
): Promise<{ reordered: boolean; missing: number }> {
  const ranked = order.filter((c) => c.rank > 0);
  if (ranked.length === 0) return { reordered: false, missing: 0 };

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('workshop_chapters')
      .select('id, hidden')
      .eq('workshop_id', workshopId)
      .order('position')
      .order('id');
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((c) => ({ id: c.id as string, hidden: c.hidden === true }));
    const known = new Set(rows.map((c) => c.id));
    const wanted: string[] = [];
    const placed = new Set<string>();

    for (const entry of [...ranked].sort((a, b) => a.rank - b.rank)) {
      // Une référence de cette réponse devient l'identifiant réellement créé ;
      // une référence existante est déjà un identifiant.
      const id = created.get(entry.ref) ?? entry.ref;
      if (!known.has(id) || placed.has(id)) continue;
      placed.add(id);
      wanted.push(id);
    }

    const missing = rows.filter((c) => !c.hidden && !placed.has(c.id)).length;
    if (missing > 0 || wanted.length === 0) return { reordered: false, missing };

    await reorderChapters(workshopId, [...wanted, ...rows.map((c) => c.id).filter((id) => !placed.has(id))]);
    return { reordered: true, missing: 0 };
  } catch (error) {
    console.warn('[ingest] ordre des chapitres inchangé :', error instanceof Error ? error.message : error);
    return { reordered: false, missing: 0 };
  }
}

/** Rend au fournisseur les documents d'un lot. Appelée à **deux** moments : à
 *  l'annulation d'un import, et en fin d'import réussi — une fois la passe
 *  notions terminée, plus aucune passe n'a besoin des documents (conséquence
 *  directe de T3). Ne lève jamais. */
export async function releaseImportDocuments(
  importId: string,
  options: { provider?: PlanProvider } = {},
): Promise<boolean> {
  try {
    const prepared = await preparedOf(importId);
    const provider = options.provider ?? createClaudeProvider();
    return await releaseDocuments(provider, prepared);
  } catch (error) {
    // Même un import introuvable ou une clé API manquante ne doit pas remonter :
    // on ne fait ici que du ménage.
    console.warn('[ingest] documents non rendus :', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Combien de notions par appel de rangement.
 *
 *  Bien plus que pour les questions (10), parce que la sortie est minuscule :
 *  une affectation, c'est deux identifiants, là où une question porte un énoncé,
 *  ses propositions et ses critères de correction. Cinquante affectations
 *  tiennent très largement sous le plafond de sortie. */
export const NOTIONS_PER_ASSIGN_BATCH = 50;

/** Les chapitres VISIBLES du programme, avec leur plage de pages.
 *
 *  Les chapitres cachés sont exclus : on ne range pas dans une boîte qu'on a
 *  mise de côté. Un chapitre caché qui redevient pertinent se restaure d'abord. */
async function loadVisibleChapters(workshopId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('workshop_chapters')
    .select('id, name, source_document, page_start, page_end')
    .eq('workshop_id', workshopId)
    .eq('hidden', false)
    .order('position');
  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    sourceDocument: c.source_document as string | null,
    pageStart: c.page_start as number | null,
    pageEnd: c.page_end as number | null,
  }));
}

/** Toutes les notions de l'atelier avec leur provenance, dans un ordre STABLE.
 *
 *  Stable est impératif : le client rappelle cette passe une fois par lot, et un
 *  ordre flottant ferait se recouvrir deux lots — certaines notions traitées
 *  deux fois, d'autres jamais.
 *
 *  ⚠️ **Une page périmée est retirée, pas transmise.** Un numéro de page ne veut
 *  rien dire seul : il ne vaut que RELATIVEMENT à un document. Si le document
 *  d'origine n'est plus dans l'atelier — supprimé, remplacé par une nouvelle
 *  version du cours —, la page pointe vers quelque chose qui n'existe plus. La
 *  transmettre quand même serait pire que de ne rien transmettre : le modèle
 *  rangerait sur une indication fausse, en la croyant précise. */
async function loadNotionsToArrange(workshopId: string) {
  const supabase = getSupabaseServerClient();
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .select('id, title, chapter_id, import_id, source_document, source_page')
    .eq('workshop_id', workshopId)
    .order('created_at')
    .order('id');
  if (error) throw new Error(error.message);

  const { data: files } = await supabase
    .from('workshop_files')
    .select('id, name')
    .eq('workshop_id', workshopId);
  // Identifiant → nom. La provenance stocke l'identifiant (seul stable) et
  // l'affichage veut le nom : la table de correspondance se fait ici, au moment
  // de s'en servir, jamais figée à l'écriture.
  const names = new Map((files ?? []).map((f) => [f.id as string, f.name as string]));

  return (data ?? []).map((n) => {
    const source = n.source_document as string | null;
    const name = source ? names.get(source) : undefined;
    return {
      id: n.id as string,
      title: n.title as string,
      chapterId: (n.chapter_id as string | null) ?? null,
      importId: (n.import_id as string | null) ?? null,
      // Document disparu ou remplacé → provenance retirée, pas devinée.
      sourceDocument: name ?? null,
      page: name ? (n.source_page as number | null) : null,
    };
  });
}

/** Mémorise ce que ce lot de rangement a décidé.
 *
 *  Deux listes, cumulées d'un lot à l'autre dans `ai_imports.scope` (jsonb
 *  libre, aucune migration) :
 *    • `movedNotions` — les notions RÉELLEMENT déplacées, que l'écran marquera.
 *      Annoncer comme « déplacée » une notion restée dans son chapitre ferait
 *      douter de tout le reste de l'affichage.
 *    • `setAsideNotions` — celles que le modèle a explicitement laissées sans
 *      chapitre. C'est la seule chose que le ménage de fin pourra effacer.
 *
 *  ⚠️ **Lecture-modification-écriture, et les lots tournent en parallèle** :
 *  deux lots qui aboutissent en même temps peuvent s'écraser l'un l'autre. La
 *  conséquence est bénigne pour `movedNotions` (un marquage manquant) mais pas
 *  pour `setAsideNotions` : une perte y fait seulement *moins* effacer, jamais
 *  plus — l'erreur va donc du bon côté. À reprendre par une écriture atomique
 *  côté base le jour où ça compte (voir docs/backlog.md). */
async function recordProgress(
  importId: string,
  entries: {
    movedNotions: readonly string[];
    setAsideNotions: readonly string[];
    /** Les notions que le modèle n'a rangées nulle part et qui GARDENT leur
     *  chapitre. Elles ne sont pas écartées — on ne les efface jamais — mais
     *  elles ne suffisent plus à faire vivre un chapitre (voir
     *  `hideEmptiedChapters`). */
    strandedNotions: readonly string[];
  },
): Promise<void> {
  if (
    entries.movedNotions.length === 0
    && entries.setAsideNotions.length === 0
    && entries.strandedNotions.length === 0
  ) return;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  const merge = (key: string, added: readonly string[]) => {
    const previous = Array.isArray(scope[key]) ? (scope[key] as string[]) : [];
    return [...new Set([...previous, ...added])];
  };
  await supabase
    .from('ai_imports')
    .update({
      scope: {
        ...scope,
        movedNotions: merge('movedNotions', entries.movedNotions),
        setAsideNotions: merge('setAsideNotions', entries.setAsideNotions),
        strandedNotions: merge('strandedNotions', entries.strandedNotions),
      },
    })
    .eq('id', importId);
}

async function setAsideOf(importId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  return Array.isArray(scope.setAsideNotions) ? (scope.setAsideNotions as string[]) : [];
}

async function strandedOf(importId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  return Array.isArray(scope.strandedNotions) ? (scope.strandedNotions as string[]) : [];
}

/** Passe 3 — le RANGEMENT d'UN LOT de notions.
 *
 *  Séparée de la passe chapitres le 24/08/2026, pour une raison de volume :
 *  ranger 500 notions, c'est produire 500 lignes dans une seule réponse, bien
 *  au-delà du plafond de sortie — la réponse serait tronquée, donc perdue. On ne
 *  peut pas découper en lots un appel qui doit AUSSI décider de la structure,
 *  puisque la structure ne se décide qu'une fois : la séparation n'est donc pas
 *  une alternative aux appels multiples, c'est ce qui les autorise.
 *
 *  Elle ne reçoit **aucun document**, et c'est là que la provenance paie : deux
 *  nombres par élément remplacent 680 000 tokens de corpus. */
export async function ingestAssignments(
  workshopId: string,
  actorId: string,
  importId: string,
  batchIndex = 0,
  options: { provider?: PlanProvider } = {},
): Promise<AssignPassResult> {
  const userHint = await userHintOf(importId);
  const provider = options.provider ?? createClaudeProvider({ userHint });

  const [all, chapters] = await Promise.all([
    loadNotionsToArrange(workshopId),
    loadVisibleChapters(workshopId),
  ]);
  const batches = batchNotions(all, NOTIONS_PER_ASSIGN_BATCH);
  const batch = batches[batchIndex];
  if (!batch || chapters.length === 0) {
    return { assigned: 0, recycled: 0, batches: batches.length, discarded: [], adjusted: [] };
  }

  // ⚠️ Les ressemblances sont calculées sur l'atelier ENTIER, pas sur le lot :
  // deux notions proches peuvent tomber dans deux lots différents, et le lot qui
  // porte la candidate doit voir la paire. Ne sont soumises au jugement que les
  // notions **créées par cet import** — deux anciennes qui se ressemblent sont
  // une décision déjà prise, pas notre affaire.
  const fresh = batch.filter((n) => n.importId === importId);
  const freshIds = new Set(fresh.map((n) => n.id));
  const others = all.filter((n) => !freshIds.has(n.id));
  const pairs = flagSimilar(fresh, others, (n) => n.title, (n) => n.title);
  const similar = pairs.map((f) => ({
    notionId: f.candidate.id,
    other: f.other.title,
    proximity: f.proximity,
  }));

  // « Actuellement dans » ne nomme que des chapitres que le modèle a sous les
  // yeux. Une notion logée dans un chapitre écarté verrait sinon citer une
  // référence absente de sa liste — au mieux du bruit, au pire une invitation à
  // la recopier et à ranger dans une boîte mise de côté.
  const visibleIds = new Set(chapters.map((c) => c.id));
  const result = await provider.documentToPlan([], EMPTY, {
    pass: 'assign',
    notions: batch.map((n) => ({
      id: n.id,
      title: n.title,
      sourceDocument: n.sourceDocument,
      page: n.page,
      currentChapterId: n.chapterId && visibleIds.has(n.chapterId) ? n.chapterId : null,
    })),
    chapters,
    similar,
  });
  await addImportUsage(importId, result.usage);

  // ⚠️ Les références de chapitre acceptables sont les VISIBLES, pas toutes
  // celles de l'atelier. `loadExistingRefs` rend aussi les chapitres cachés :
  // un modèle qui en nommerait un — il ne les a pas vus, mais rien ne
  // l'empêche de recopier un identifiant croisé ailleurs — y rangerait des
  // notions, qui disparaîtraient du programme sans que personne ne l'ait voulu.
  const plan = parsePlanLogged('rangement', result.plan, {
    chapterIds: chapters.map((c) => c.id),
    notionIds: all.map((n) => n.id),
  }, result.truncated);

  // Les chapitres sont déjà en base : leurs références SONT leurs identifiants,
  // il n'y a rien à traduire. En revanche on passe l'état AVANT : une notion
  // reconduite dans son propre chapitre n'est pas un déplacement, et ne doit ni
  // être réécrite ni apparaître comme un changement.
  const before = new Map(all.map((n) => [n.id, n.chapterId]));

  // ─── « Aucun chapitre » ne veut pas dire la même chose pour tout le monde ──
  //
  // Décision du 25/08/2026. Le modèle n'a qu'une façon de dire « nulle part » :
  // un chapitre vide. Mais cette réponse recouvre deux situations qui n'ont rien
  // à voir, et c'est NOUS qui les distinguons — jamais lui :
  //
  //   • une REDITE — on lui a soumis la paire, il a tranché en faveur de l'autre.
  //     Elle sort du programme, sans chapitre. Il le faut : c'est le seul état
  //     d'où le bouton « restaurer » ne peut pas la ramener par surprise.
  //   • tout le reste — il n'a rien trouvé de mieux. Elle RESTE où elle était.
  //     Une notion neuve n'était nulle part, elle n'y bouge pas ; une ancienne
  //     garde son chapitre, qui sera écarté avec elle s'il ne reste que ça.
  //
  // Ce que ça évite : offrir les chapitres écartés au modèle comme troisième
  // choix. Ce serait la réponse confortable pour tout ce qu'il ne veut pas
  // trancher, et le hors-programme grossirait tout seul sous une étiquette qui a
  // l'air propre. Il ne voit toujours que les chapitres visibles.
  //
  // Les redites sont connues sans rien lui redemander : ce sont exactement les
  // notions dont on lui a soumis la ressemblance quelques lignes plus haut.
  const redites = new Set(pairs.flatMap((p) => [p.candidate.id, p.other.id]));
  // Le partage lui-même vit dans `passInput` : il décide d'écritures en base,
  // donc il se teste sans base (`setAside` borne la seule suppression du
  // système, une erreur ici efface du travail saisi à la main).
  const { setAside, stranded, effective } = splitUnplaced(plan.assignments, redites, before);

  // Le garde est POSÉ ICI et non dans `applyAssignments`, qui ne reçoit pas de
  // lot : elle déplace des notions existantes, elle n'en étiquette aucune. Un
  // rangement arrivé après une annulation serait pourtant le pire des
  // retardataires — il modifie des lignes que l'annulation ne peut plus retirer,
  // et le seul fait de les toucher rend l'import non annulable.
  await assertImportOpen(importId);
  const movedIds = await applyAssignments(workshopId, effective, new Map(), before);
  await recordProgress(importId, {
    movedNotions: movedIds,
    setAsideNotions: setAside,
    strandedNotions: stranded,
  });

  // ⚠️ **Soumis vs répondu — la seule façon de distinguer un oubli d'un refus.**
  // La consigne dit « réponds pour CHAQUE notion » ; quand une notion ressort
  // pourtant sans chapitre, rien ne permet de savoir si le modèle l'a jugée sans
  // place ou s'il l'a simplement sautée. La différence compte : la première est
  // une décision, la seconde une panne silencieuse qui se répète à chaque
  // génération (constaté le 29/08/2026 sur une notion restée « sans chapitre »
  // deux imports d'affilée).
  const answered = new Set(plan.assignments.map((a) => a.notionRef));
  const omitted = batch.filter((n) => !answered.has(n.id));
  console.info('[ingest] rangement', {
    lot: batchIndex,
    soumises: batch.length,
    repondues: answered.size,
    omisesParLeModele: omitted.length,
    // Les oubliées qui n'ont AUCUN chapitre sont les seules qui se voient : les
    // autres restent simplement là où elles étaient.
    omisesEtSansChapitre: omitted.filter((n) => !n.chapterId).length,
    deplacees: movedIds.length,
    sansPlaceSelonLeModele: setAside.length,
    laisseesSurPlace: stranded.length,
  });

  // ─── Récupérer les questions en sommeil ───────────────────────────────────
  //
  // Quand le modèle tranche une ressemblance en faveur de la NOUVELLE notion,
  // l'ancienne sort du programme — et ses questions avec elle. Elles dorment :
  // elles existent encore, mais plus rien ne les tire. Or elles portent
  // exactement le fait que la nouvelle notion énonce.
  //
  // On les rattache donc à celle qui reste, AVANT que la passe questions ne se
  // mette à rédiger. Récupérer coûte une écriture ; faire réécrire coûte un
  // appel au modèle et produit un doublon de plus.
  //
  // ⚠️ La paire est connue sans rien redemander au modèle : c'est celle qu'on
  // lui a soumise. Sa décision se lit dans l'état final des deux notions —
  // celle qui a un chapitre a gagné.
  const touched = [...new Set(pairs.flatMap((f) => [f.candidate.id, f.other.id]))];
  const settled = touched.length > 0 ? await loadNotionsToArrange(workshopId) : [];
  const chapterOf = new Map(settled.map((n) => [n.id, n.chapterId]));

  let recycled = 0;
  for (const pair of pairs) {
    const winner = chapterOf.get(pair.candidate.id);
    const loser = chapterOf.get(pair.other.id);
    // La nouvelle est rangée, l'ancienne ne l'est plus : les questions de
    // l'ancienne suivent. L'inverse (l'ancienne garde sa place) n'appelle rien —
    // ses questions n'ont jamais cessé de servir.
    if (winner && loser === null) {
      recycled += await reattachQuestions(pair.other.id, pair.candidate.id);
    }
  }

  return {
    assigned: movedIds.length,
    recycled,
    batches: batches.length,
    discarded: plan.discarded,
    adjusted: plan.adjusted,
  };
}

/** La fin de l'import : ce qui se déduit sans modèle, une fois tout rangé.
 *
 *  À n'appeler qu'une seule fois, **après le dernier lot de rangement**. Les
 *  deux gestes qu'elle porte seraient destructeurs plus tôt : à mi-parcours,
 *  toutes les notions sont encore sans chapitre.
 *
 *  ⚠️ Ne lève jamais. C'est du ménage : un import réussi ne doit pas être
 *  annoncé en échec parce qu'un chapitre n'a pas pu être caché. */
export async function finishIngestion(
  workshopId: string,
  importId: string,
): Promise<{ hidden: string[]; removedChapters: number; removedNotions: number }> {
  try {
    // Les notions restées faute de mieux ne font plus vivre leur chapitre : il
    // est écarté avec elles dedans, ce qui rend le changement lisible d'un
    // coup d'œil au lieu de les disperser dans « sans chapitre ».
    const hidden = await hideEmptyChapters(workshopId, await strandedOf(importId));

    const supabase = getSupabaseServerClient();
    const [notions, chapterRows] = await Promise.all([
      loadNotionsToArrange(workshopId),
      supabase.from('workshop_chapters').select('id, import_id').eq('workshop_id', workshopId),
    ]);

    const cleanup = planImportCleanup(
      {
        chapters: (chapterRows.data ?? []).map((c) => ({
          id: c.id as string,
          importId: (c.import_id as string | null) ?? null,
        })),
        notions: notions.map((n) => ({ id: n.id, chapterId: n.chapterId, importId: n.importId })),
      },
      importId,
      // Seules les notions que le modèle a explicitement écartées. Une notion
      // qu'il n'a jamais examinée reste, quoi qu'il arrive.
      await setAsideOf(importId),
    );
    await removeOrphans(workshopId, cleanup);

    return {
      hidden,
      removedChapters: cleanup.chapterIds.length,
      removedNotions: cleanup.notionIds.length,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn('[ingest] menage de fin incomplet :', detail);
    return { hidden: [], removedChapters: 0, removedNotions: 0 };
  }
}

/** Passe 1, pour UN document. Les notions naissent **sans chapitre** : à ce
 *  stade il n'en existe aucun, et c'est la passe suivante qui les range.
 *
 *  Le document est l'unité de travail parce qu'elle ne demande aucun jugement au
 *  modèle, qu'elle est stable d'un import à l'autre, et qu'elle parallélise sans
 *  amorçage — il n'y a plus de cache à amorcer, chaque appel ne portant que son
 *  propre document.
 *
 *  ⚠️ Limite connue et acceptée : un document unique et énorme retombe sur un
 *  seul appel. À traiter le jour où le cas se présente, pas avant. */
export async function ingestDocumentNotions(
  workshopId: string,
  actorId: string,
  importId: string,
  documentIndex: number,
  options: { provider?: PlanProvider } = {},
): Promise<NotionPassResult> {
  // Ni `corpusTokens` ni `oversizeModels` ici, et c'est délibéré : cet appel ne
  // porte qu'UN document, pas le corpus. Hériter du refus mesuré sur l'ensemble
  // ferait basculer sur un modèle plus cher une charge qui tient largement dans
  // la fenêtre du modèle économique. Un document réellement trop gros sera
  // refusé pour ce qu'il est, à son propre appel.
  const userHint = await userHintOf(importId);
  const provider = options.provider ?? createClaudeProvider({ userHint });

  const prepared = await preparedOf(importId);
  const document = prepared[documentIndex];
  if (!document) {
    return { written: 0, discarded: [], adjusted: [], documents: prepared.length };
  }

  // TOUTES les notions de l'atelier, pas celles d'un chapitre : c'est le
  // mécanisme anti-doublon, et c'est le point critique du dispositif. Un modèle
  // qui recrée sous d'autres mots ce qui existe déjà fait gonfler l'atelier à
  // chaque import.
  const existing = await loadAllNotions(workshopId);
  const result = await provider.documentToPlan(prepared, existing, {
    pass: 'notions',
    document: { index: documentIndex, fileName: document.fileName },
  });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlanLogged('notions', result.plan, refs, result.truncated);

  // ⚠️ **On écrit TOUT ce que le modèle rend, y compris les redites** — décision
  // du 24/08/2026. La version précédente écartait ici les notions trop proches
  // d'une existante : c'était le seul endroit du dispositif où du contenu
  // disparaissait sans que personne n'ait jugé, et ça obligeait à régler un
  // seuil au millimètre puisqu'un faux positif y coûtait du contenu réel.
  //
  // Le doute est désormais reporté sur la passe RANGEMENT, qui le soumet au
  // modèle : lui seul sait dire si deux phrases proches portent le même fait ou
  // un fait de plus. Le perdant n'est pas détruit, il reste sans chapitre — et
  // s'il vient de cet import, le ménage de fin le ramassera.
  //
  // ─── Le plafond de l'atelier ──────────────────────────────────────────────
  //
  // Limite PHYSIQUE (25/08/2026) : c'est le nombre de notions qui commande tout
  // le volume en aval — douze questions de parcours chacune —, donc c'est là
  // qu'une boucle emballée se paie. Ce qui dépasse est écarté et DIT : une
  // notion qui disparaîtrait en silence passerait pour une notion que le modèle
  // n'a pas su lire.
  //
  // Les appels sont parallèles (un par document) et lisent donc chacun un
  // compte qui peut vieillir d'une fraction de seconde : le plafond peut être
  // franchi de quelques unités. C'est un garde-fou, pas un invariant — le
  // dépassement possible est de l'ordre du lot, jamais de l'emballement.
  const room = MAX_NOTIONS_PER_WORKSHOP - (await countNotions(workshopId));
  const admitted = room > 0 ? plan.notions.slice(0, room) : [];
  for (const refused of plan.notions.slice(admitted.length)) {
    plan.discarded.push({
      kind: 'notion',
      ref: refused.ref,
      reason: `l'atelier a atteint sa limite de ${MAX_NOTIONS_PER_WORKSHOP} notions`,
    });
  }

  // `new Map()` : aucun chapitre à résoudre, et le schéma n'en propose plus.
  const created = await insertNotions(
    workshopId,
    actorId,
    importId,
    // La provenance est posée ICI et non par le modèle : c'est l'appelant qui
    // sait quel document il traite, lui ne fait que rendre la page.
    // L'IDENTIFIANT, pas le nom : un « cours.pdf » remis à jour porte le même
    // nom et n'est plus le même document. Le nom est relu à l'affichage.
    admitted.map((n) => ({ ...n, sourceDocument: document.fileId })),
    new Map(),
  );

  return {
    written: created.size,
    discarded: plan.discarded,
    adjusted: plan.adjusted,
    documents: prepared.length,
  };
}

/** Passe 3, pour UN LOT de notions d'un chapitre. Les notions du lot lui sont
 *  fournies avec leurs identifiants réels : chaque question naît donc reliée,
 *  sans qu'on ait à l'imposer par une règle. */
export async function ingestParcoursQuestions(
  workshopId: string,
  actorId: string,
  importId: string,
  chapter: { id: string; name: string },
  batchIndex = 0,
  options: { provider?: PlanProvider; budgetShare?: number; demand?: QuestionDemand[] } = {},
): Promise<QuestionPassResult> {
  const context: IngestContext = 'parcours';
  const [userHint, choice] = await Promise.all([userHintOf(importId), questionsProviderOf(importId)]);
  const provider = options.provider
    ?? (choice === 'deepseek' ? createDeepSeekProvider({ userHint }) : createClaudeProvider({ userHint }));
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

  const chapterNotions = (notionRows ?? []).map((n) => ({ id: n.id as string, title: n.title as string }));
  // Un chapitre sans notion ne produit rien : une question sans notion ne serait
  // tirée par aucun exercice (§11).
  if (chapterNotions.length === 0) return { written: 0, discarded: [], adjusted: [], batches: 0 };

  // ─── Ce qu'on cible : une DEMANDE, en couples (notion × niveau) ──────────
  //
  // Il n'y a qu'une façon de demander des questions — une liste de couples avec
  // un nombre pour chacun (29/08/2026). Ce qui change, c'est qui la remplit :
  //
  //   • l'appelant, quand il sait — c'est la RECHARGE automatique, qui reçoit
  //     du radar les couples en manque et leur compte ;
  //   • ce module, pour un chapitre neuf : 25 questions de niveau 1 réparties
  //     sur ses notions, de quoi tenir deux exercices. On retranche l'existant,
  //     pour qu'un second passage ne rajoute pas 25 questions par-dessus ;
  //   • personne, quand une CONSIGNE LIBRE est donnée : « fais des questions sur
  //     la Révolution » ne dit rien du stock de chaque notion, et un ciblage
  //     écarterait silencieusement ce que l'utilisateur demande. On envoie large
  //     et le modèle choisit (arbitrage du 24/08/2026).
  const hint = (userHint ?? '').trim();

  let demand = options.demand ?? null;
  if (!demand && !hint) {
    const perLevel = await parcoursQuestionCountsByLevel(chapterNotions.map((n) => n.id));
    demand = demandForChapterStart(chapterNotions.map((n) => n.id))
      .map((item) => ({
        ...item,
        count: Math.max(0, item.count - (perLevel.get(item.notionId)?.get(item.bloomLevel) ?? 0)),
      }))
      .filter((item) => item.count > 0);
  }

  // Le prompt reçoit la demande notion par notion ; `missing` ne sert plus que
  // le cas de la consigne libre, où il n'y a pas de demande à formuler.
  const wanted: Map<string, { bloomLevel: BloomLevel; count: number }[]> = demand
    ? demandByNotion(demand)
    : new Map();
  const all = demand
    ? chapterNotions.filter((n) => (wanted.get(n.id)?.length ?? 0) > 0)
    : chapterNotions;

  // Rien à produire : surtout pas d'appel au modèle à payer pour s'entendre
  // répondre qu'il n'y a rien à ajouter.
  if (all.length === 0) return { written: 0, discarded: [], adjusted: [], batches: 0 };

  const batches = batchNotions(all);
  const notions = batches[batchIndex];
  if (!notions) return { written: 0, discarded: [], adjusted: [], batches: batches.length };

  // ⚠️ **Le plafond ne tient plus tout seul dès que les appels sont parallèles.**
  // Il se calcule à partir de ce qui est DÉJÀ écrit : quatre appels lancés
  // ensemble lisent le même compteur, se croient chacun seuls, et peuvent donc
  // écrire quatre fois le plafond. D'où la part que l'appelant impose — lui seul
  // sait combien d'appels il a en vol. On garde le minimum des deux : le serveur
  // reste l'autorité (un client qui demanderait 10 000 ne les obtiendrait pas),
  // la part n'est qu'une restriction supplémentaire.
  const alreadyWritten = await questionsWritten(importId);
  // Une demande explicite est aussi un plafond : on ne paie jamais pour plus
  // que ce qui a été demandé sur les notions de CE lot.
  const asked = demand
    ? notions.reduce(
        (sum, n) => sum + (wanted.get(n.id) ?? []).reduce((s, w) => s + w.count, 0),
        0,
      )
    : Number.POSITIVE_INFINITY;
  const budget = Math.min(
    MAX_QUESTIONS_PER_IMPORT - alreadyWritten,
    options.budgetShare ?? Number.POSITIVE_INFINITY,
    asked,
  );
  if (budget <= 0) return { written: 0, discarded: [], adjusted: [], batches: batches.length };

  // Les autres notions du chapitre, en contexte seulement (§16.21) : c'est ce
  // qui remplace le cours pour les niveaux supérieurs de Bloom.
  const inBatch = new Set(notions.map((n) => n.id));
  const neighbours = all.filter((n) => !inBatch.has(n.id));

  // Aucun document : la passe travaille sur les notions, pas sur le cours
  // (§16.3). C'est le poste d'économie principal de tout le chantier — on ne
  // téléverse rien, on ne relit rien, on ne paie donc rien pour le corpus.
  const [existing, workshop] = await Promise.all([
    loadNotionQuestions(notions.map((n) => n.id)),
    loadWorkshopIdentity(workshopId),
  ]);
  const result = await provider.documentToPlan([], existing, {
    pass: 'questions',
    chapter,
    workshop,
    notions: notions.map((n) => ({ ...n, want: wanted.get(n.id) })),
    neighbours,
    budget,
  });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlanLogged('questions', result.plan, refs, result.truncated);

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

  // ⚠️ **Demandé vs rendu vs écrit — la seule façon de savoir qui sous-produit.**
  // Un import qui rend moitié moins de questions que demandé peut l'être pour
  // trois raisons qui ne se distinguent pas de l'extérieur : le modèle en a
  // écrit moins qu'on ne lui demandait, la lecture de sa réponse en a écarté, ou
  // le plafond de débit a coupé. Sans cette ligne, on ne peut que supposer
  // (constaté le 29/08/2026 sur un import qui a rendu 43 questions pour ~71
  // demandées, sans qu'aucune trace ne permette de trancher).
  console.info('[ingest] questions parcours', {
    chapitre: chapter.name,
    lot: batchIndex,
    notionsDuLot: notions.length,
    demandees: Number.isFinite(asked) ? asked : null,
    plafondDeCetAppel: budget,
    renduesParLeModele: plan.groups.reduce((sum, g) => sum + g.questions.length, 0),
    ecarteesALaLecture: plan.discarded.length,
    ecrites: written,
  });

  return { written, discarded: plan.discarded, adjusted: plan.adjusted, batches: batches.length };
}

/** Le nombre de questions d'examen demandé au lancement, rangé dans le `scope`
 *  de l'import comme la consigne libre — donc relu par chaque tranche, y compris
 *  celles qui s'exécutent dans des appels ultérieurs. */
async function examTargetOf(importId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  const value = (data?.scope as { examQuestions?: unknown } | null)?.examQuestions;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_EXAM_QUESTIONS;
}

/** Passe EXAMEN — une TRANCHE du programme, pour une part du budget.
 *
 *  ─── Pourquoi elle ne ressemble pas à la passe parcours ────────────────────
 *
 *  Le parcours compte par notion : douze questions chacune, et on boucle sur les
 *  notions. L'examen compte par PROGRAMME : quarante questions pour tout
 *  l'atelier, qu'il ait trois chapitres ou trente, et chacune croise plusieurs
 *  notions. Ce sont deux régimes, pas deux réglages du même — d'où deux passes
 *  (arbitrage du 24/08/2026).
 *
 *  ─── Ce que découpe le découpage ───────────────────────────────────────────
 *
 *  Le BUDGET d'abord (dix questions par appel, pour ne pas tronquer la réponse),
 *  et la matière suit : chaque appel reçoit une tranche contiguë du cours. Deux
 *  appels ne voient donc jamais la même partie du programme et ne peuvent pas
 *  écrire deux fois la même question — ce qui compte d'autant plus qu'ils
 *  tournent en parallèle et qu'aucun ne voit ce que l'autre vient d'écrire.
 *
 *  Ne reçoit **aucun document** : comme la passe parcours, elle lit le
 *  programme, jamais le cours (§16.3). */
export async function ingestExamQuestions(
  workshopId: string,
  actorId: string,
  importId: string,
  sliceIndex = 0,
  options: { provider?: PlanProvider; budgetShare?: number; target?: number } = {},
): Promise<QuestionPassResult> {
  const [userHint, choice, scopeTarget] = await Promise.all([
    userHintOf(importId),
    questionsProviderOf(importId),
    examTargetOf(importId),
  ]);
  const provider = options.provider
    ?? (choice === 'deepseek' ? createDeepSeekProvider({ userHint }) : createClaudeProvider({ userHint }));

  const target = options.target ?? scopeTarget;
  const program = await loadVisibleProgram(workshopId);
  // Aucun programme visible : rien à évaluer. C'est le cas que le dialogue
  // intercepte en amont — il construit l'atelier d'abord — mais la passe doit
  // savoir se taire plutôt que d'appeler le modèle pour rien.
  if (program.length === 0) return { written: 0, discarded: [], adjusted: [], batches: 0 };

  // `sliceProgram` peut rendre MOINS de tranches que demandé quand le programme
  // compte moins de notions que d'appels prévus. C'est sa découpe qui fait foi
  // pour la répartition du budget : la calculer sur le nombre demandé laisserait
  // des questions dans une tranche qui n'existe pas.
  const slices = sliceProgram(program, examSliceCount(target, EXAM_QUESTIONS_PER_CALL));
  const budgets = splitBudget(target, slices.length);

  const chapters = slices[sliceIndex];
  if (!chapters) return { written: 0, discarded: [], adjusted: [], batches: slices.length };

  // Même garde que la passe parcours : le plafond de l'import est l'autorité, la
  // part du budget n'est qu'une restriction de plus. Des appels parallèles qui
  // liraient tous le même compteur se croiraient chacun seuls.
  const alreadyWritten = await questionsWritten(importId);
  const budget = Math.min(
    MAX_QUESTIONS_PER_IMPORT - alreadyWritten,
    budgets[sliceIndex] ?? 0,
    options.budgetShare ?? Number.POSITIVE_INFINITY,
  );
  if (budget <= 0) return { written: 0, discarded: [], adjusted: [], batches: slices.length };

  const [existing, workshop] = await Promise.all([
    loadExamQuestions(workshopId),
    loadWorkshopIdentity(workshopId),
  ]);

  const result = await provider.documentToPlan([], existing, {
    pass: 'exam',
    chapters,
    budget,
    workshop,
  });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlanLogged('examen', result.plan, refs, result.truncated);

  // Le contexte vient du bouton, jamais du modèle (§8) — ici, la banque
  // d'examen.
  const groups = plan.groups.map((g) => ({ ...g, context: 'exam' as const }));

  // ─── Un examen ne recopie pas l'entraînement ──────────────────────────────
  //
  // La vérification est LOCALE : les énoncés du parcours ne sont jamais partis
  // au modèle, et n'ont pas à l'être. Ce qu'on écarte est dit dans le
  // compte-rendu — une question retirée en silence passerait pour une question
  // que le modèle n'a pas su écrire.
  const { kept, removed } = dropRepeatedQuestions(groups, await loadParcoursContents(workshopId));
  for (const repeat of removed) {
    plan.discarded.push({
      kind: 'question',
      reason: `déjà posée à l'entraînement (« ${repeat.other.slice(0, 80)} ») — une question d'examen qui reprend une révision n'évalue rien`,
    });
  }

  const capped: typeof kept = [];
  let remaining = budget;
  for (const group of kept) {
    if (remaining <= 0) break;
    // On coupe à la question près, jamais au groupe : un groupe amputé de sa
    // dernière question reste cohérent, puisque c'est la PREMIÈRE qui porte le
    // contexte dont les autres dépendent.
    const questions = group.questions.slice(0, remaining);
    remaining -= questions.length;
    capped.push({ ...group, questions });
  }

  const written = await insertGroups(workshopId, importId, capped, new Map());
  return { written, discarded: plan.discarded, adjusted: plan.adjusted, batches: slices.length };
}
