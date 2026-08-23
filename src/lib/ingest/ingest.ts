// Écriture d'un plan en base : le moteur d'ingestion.
//
// Il ne sait rien de l'IA — il reçoit un plan (docs/ai-ingestion-plan.md §7) et
// l'écrit. C'est délibéré : tout ce module se teste avec un plan **écrit à la
// main**, et le jour où le modèle arrive, il ne reste que « document → plan ».
//
// ─── Trois règles qui expliquent la forme du code ────────────────────────────
//
// 1. **Omettre `updated_at`, jamais l'écrire.** C'est la condition de
//    l'annulation : elle n'est offerte que si rien du lot n'a bougé, ce qui se
//    lit `updated_at > created_at`. Comme `now()` est l'heure de début de
//    transaction en Postgres et que les deux colonnes ont `default now()`, un
//    INSERT qui les omet toutes les deux leur donne une valeur strictement
//    identique — mesuré le 20/08/2026 sur les trois tables. C'est pourquoi on
//    n'appelle PAS `saveQuestion` ici : `questionToRow` écrit `updated_at`, et
//    tout import naîtrait « déjà modifié ».
//
// 2. **Une écriture par table, jamais une par élément.** Un plan porte des
//    centaines de lignes ; une insertion par notion ferait autant d'allers-retours
//    (règle N+1, .claude/rules/server-architecture.md).
//
// 3. **Pas d'atomicité, mais pas d'orphelins non plus.** Le client Supabase ne
//    sait pas faire de transaction multi-requêtes. Un échec en cours laisserait
//    donc un atelier à moitié rempli — sauf que chaque ligne écrite porte déjà
//    son `import_id` : on annule le lot et on remonte l'erreur. C'est
//    exactement ce pour quoi l'étiquette a été conçue.

import { cancelImport } from '@/lib/workshops/imports';
import { getSupabaseServerClient } from '@/lib/supabase';

import { parsePlan, type ExistingRefs, type PlanIssue } from './planSchema';

export type IngestMeta = {
  /** Ce qui a été demandé — repris tel quel dans `ai_imports.scope`. */
  scope?: Record<string, unknown>;
  /** Clés de stockage des fichiers soumis au modèle. */
  fileIds?: string[];
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
};

export type IngestResult = {
  importId: string;
  chapters: number;
  notions: number;
  groups: number;
  questions: number;
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

// Dans tout ce module, `actorId` est l'identifiant Clerk **déjà résolu** par le
// wrapper `'use server'` : rien ici ne fait d'authz, comme tout `lib/`
// (.claude/rules/server-architecture.md). L'appelant a vérifié les droits.

/** Ouvre un lot d'import. Séparé de l'écriture parce que l'ingestion réelle
 *  s'étale sur plusieurs appels serveur bornés (§5.4) : l'étiquette doit exister
 *  avant la première passe, et survivre entre les appels. */
export async function createImport(
  workshopId: string,
  actorId: string,
  meta: IngestMeta = {},
): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_imports')
    .insert({
      workshop_id: workshopId,
      created_by: actorId,
      scope: meta.scope ?? {},
      file_ids: meta.fileIds ?? [],
      input_tokens: meta.inputTokens ?? 0,
      output_tokens: meta.outputTokens ?? 0,
      cached_tokens: meta.cachedTokens ?? 0,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'import non créé');
  return data.id as string;
}

/** Ajoute la consommation d'un appel au total du lot. Un import s'étalant sur
 *  25 appels, le coût ne se connaît qu'en cumulant — et c'est ce cumul qui
 *  servira de base aux quotas (§9). */
export async function addImportUsage(
  importId: string,
  usage: { inputTokens: number; outputTokens: number; cacheCreationTokens: number; cachedTokens: number },
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_imports')
    .select('input_tokens, output_tokens, cached_tokens')
    .eq('id', importId)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'import introuvable');

  // Les tokens écrits dans le cache comptent comme de l'entrée : ils sont
  // facturés plus cher qu'elle (1,25× en TTL 5 minutes, 2× en TTL 1 h), et les
  // ignorer donnerait un coût largement sous-évalué.
  await supabase
    .from('ai_imports')
    .update({
      input_tokens: (data.input_tokens as number) + usage.inputTokens + usage.cacheCreationTokens,
      output_tokens: (data.output_tokens as number) + usage.outputTokens,
      cached_tokens: (data.cached_tokens as number) + usage.cachedTokens,
    })
    .eq('id', importId);
}

export async function ingestWorkshopPlan(
  workshopId: string,
  actorId: string,
  raw: unknown,
  meta: IngestMeta = {},
): Promise<IngestResult> {
  // L'existant sert deux fois : au modèle pour ne pas dupliquer (§8), et ici
  // pour qu'une référence vers une notion déjà en base ne soit pas prise pour
  // une référence pendante.
  const existing = await loadExistingRefs(workshopId);
  const plan = parsePlan(raw, existing);

  const importId = await createImport(workshopId, actorId, meta);

  try {
    const chapterIds = await insertChapters(workshopId, actorId, importId, plan.chapters);
    const notionIds = await insertNotions(workshopId, actorId, importId, plan.notions, chapterIds);
    const questions = await insertGroups(workshopId, importId, plan.groups, notionIds);

    return {
      importId,
      chapters: plan.chapters.length,
      notions: plan.notions.length,
      groups: plan.groups.length,
      questions,
      discarded: plan.discarded,
      adjusted: plan.adjusted,
    };
  } catch (error) {
    // Rattrapage : le lot est étiqueté, donc il se retire d'un bloc. Sans ça,
    // un échec au milieu des questions laisserait chapitres et notions derrière
    // lui, sans que personne sache qu'ils viennent d'un import raté.
    const cleanup = await cancelImport(workshopId, importId)
      .then((r) => (r.cancelled ? 'lot retiré' : `lot NON retiré (${r.reason})`))
      .catch((e) => `échec du retrait (${e instanceof Error ? e.message : String(e)})`);
    throw new Error(`Ingestion interrompue — ${cleanup}. Cause : ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Chapitres et notions déjà en base, pour que le plan puisse les référencer. */
export async function loadExistingRefs(workshopId: string): Promise<ExistingRefs> {
  const supabase = getSupabaseServerClient();
  const [chapters, notions] = await Promise.all([
    supabase.from('workshop_chapters').select('id').eq('workshop_id', workshopId),
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    supabase.from('workshop_bricks').select('id').eq('workshop_id', workshopId),
  ]);
  if (chapters.error) throw new Error(chapters.error.message);
  if (notions.error) throw new Error(notions.error.message);

  return {
    chapterIds: (chapters.data ?? []).map((r) => r.id as string),
    notionIds: (notions.data ?? []).map((r) => r.id as string),
  };
}

/** Résout une référence de plan en identifiant réel : soit un élément créé par
 *  ce lot, soit — la référence étant alors l'identifiant lui-même — un élément
 *  déjà en base. */
function resolve(ref: string | undefined, created: Map<string, string>): string | null {
  if (!ref) return null;
  return created.get(ref) ?? ref;
}

/** Range des notions existantes dans leurs chapitres — l'opération `assign_notion`
 *  du catalogue (`src/lib/program/operations.ts`), appliquée en base.
 *
 *  ⚠️ C'est la SEULE écriture de l'ingestion qui touche à des lignes qui
 *  existaient avant elle, et c'est pour ça qu'elle ne touche qu'à **une seule
 *  colonne** : `chapter_id`. Le titre d'une notion, ses questions et la
 *  progression acquise ne sont jamais atteints — un `update` plus large ici
 *  romprait le contrat (« l'IA crée et attribue, elle ne réécrit pas »).
 *
 *  Le filtre sur `workshop_id` n'est pas décoratif : les références viennent du
 *  modèle, donc d'une source non fiable. Sans lui, un identifiant recopié depuis
 *  un autre atelier y déplacerait une notion.
 *
 *  Une écriture par chapitre visé plutôt qu'une par notion : le nombre de
 *  requêtes suit le nombre de chapitres (quelques unités), pas le nombre de
 *  notions (plusieurs centaines).
 *
 *  ⚠️ **Une affectation qui ne change rien n'est PAS un déplacement.** Le modèle
 *  répond pour chaque notion du lot, y compris celles qu'il laisse où elles
 *  sont — c'est même le cas le plus fréquent sur un atelier déjà organisé. Les
 *  écrire quand même ferait deux dégâts : `updated_at` bougerait sur des lignes
 *  intactes (ce qui, seul, rendrait l'import non annulable), et l'écran
 *  annoncerait comme « déplacée » une notion qui n'a pas bougé.
 *
 *  Rend donc les identifiants **réellement** déplacés, jamais un compte. */
export async function applyAssignments(
  workshopId: string,
  assignments: { notionRef: string; chapterRef?: string }[],
  chapterIds: Map<string, string>,
  /** Où chaque notion se trouve AVANT — c'est ce qui distingue un déplacement
   *  d'une reconduction. Une notion absente de cette table est traitée comme
   *  inconnue, donc écrite. */
  current: Map<string, string | null> = new Map(),
): Promise<string[]> {
  if (assignments.length === 0) return [];

  const supabase = getSupabaseServerClient();
  const byChapter = new Map<string | null, string[]>();
  for (const a of assignments) {
    const chapterId = resolve(a.chapterRef, chapterIds);
    if (current.has(a.notionRef) && current.get(a.notionRef) === chapterId) continue;
    const bucket = byChapter.get(chapterId);
    if (bucket) bucket.push(a.notionRef);
    else byChapter.set(chapterId, [a.notionRef]);
  }

  const moved: string[] = [];
  for (const [chapterId, notionIds] of byChapter) {
    const { data, error } = await supabase
      .from('workshop_bricks')
      .update({ chapter_id: chapterId, updated_at: new Date().toISOString() })
      .eq('workshop_id', workshopId)
      .in('id', notionIds)
      .select('id');
    if (error) throw new Error(error.message);
    for (const row of data ?? []) moved.push(row.id as string);
  }
  return moved;
}

/** Rattache les questions d'une notion écartée à celle qui la remplace.
 *
 *  ⚠️ **Récupérer, puis seulement rédiger.** Une question accrochée à une notion
 *  sortie du programme DORT : elle existe encore, mais plus rien ne la tire. Si
 *  une notion active dit la même chose, la rattacher coûte une écriture — la
 *  faire réécrire coûte un appel au modèle ET produit un doublon de plus. C'est
 *  pour ça que ça se fait AVANT la passe questions, jamais après.
 *
 *  L'énoncé n'est JAMAIS réécrit, et le lien vers l'ancienne notion n'est pas
 *  retiré : on ajoute, on ne défait pas. Si l'ancienne notion est restaurée un
 *  jour, sa question est toujours là.
 *
 *  Rend le nombre de questions effectivement récupérées. */
export async function reattachQuestions(from: string, to: string): Promise<number> {
  if (from === to) return 0;
  const supabase = getSupabaseServerClient();

  const [{ data: source, error }, { data: already }] = await Promise.all([
    supabase.from('exam_question_item_bricks').select('item_id').eq('brick_id', from),
    supabase.from('exam_question_item_bricks').select('item_id').eq('brick_id', to),
  ]);
  if (error) throw new Error(error.message);

  const linked = new Set((already ?? []).map((r) => r.item_id as string));
  const toLink = (source ?? [])
    .map((r) => r.item_id as string)
    .filter((itemId) => !linked.has(itemId));
  if (toLink.length === 0) return 0;

  const { error: insertError } = await supabase
    .from('exam_question_item_bricks')
    .insert(toLink.map((itemId) => ({ item_id: itemId, brick_id: to })));
  if (insertError) throw new Error(insertError.message);

  return toLink.length;
}

/** Efface ce que cet import a créé et que personne n'a jamais rangé.
 *
 *  ⚠️ **C'est la seule suppression du système, et elle est bornée par le plan
 *  qu'on lui passe** — jamais par un filtre écrit ici. Le calcul de ce qui est
 *  effaçable vit dans `planImportCleanup` (`src/lib/program/operations.ts`),
 *  module pur et testé, précisément pour que la règle « créé par cet import ET
 *  jamais rattaché » soit vérifiable sans base. Cette fonction ne fait
 *  qu'exécuter.
 *
 *  Le filtre sur `workshop_id` est une ceinture de plus : les identifiants
 *  viennent d'un calcul local, mais une suppression ne se protège jamais trop. */
export async function removeOrphans(
  workshopId: string,
  cleanup: { chapterIds: string[]; notionIds: string[] },
): Promise<void> {
  const supabase = getSupabaseServerClient();

  // Les notions d'abord : un chapitre ne peut être effacé qu'une fois vide.
  if (cleanup.notionIds.length > 0) {
    const { error } = await supabase
      .from('workshop_bricks')
      .delete()
      .eq('workshop_id', workshopId)
      .in('id', cleanup.notionIds);
    if (error) throw new Error(error.message);
  }

  if (cleanup.chapterIds.length > 0) {
    const { error } = await supabase
      .from('workshop_chapters')
      .delete()
      .eq('workshop_id', workshopId)
      .in('id', cleanup.chapterIds);
    if (error) throw new Error(error.message);
  }
}

/** Cache les chapitres que CET import vient de vider.
 *
 *  ⚠️ « Vider » se mesure, il ne se devine pas. Un chapitre vide à l'arrivée
 *  n'est pas forcément un chapitre vidé : il pouvait l'être déjà avant (le
 *  document ne le couvrait pas), et le cacher serait alors une décision qu'on
 *  n'a pas prise. D'où `populatedBefore` — la liste des chapitres qui portaient
 *  des notions AVANT le rangement, relevée au début de celui-ci.
 *
 *  Trois cas, et un seul mène ici (feuille de route §5) :
 *    • il existait, il portait des notions, l'import les a toutes déplacées
 *      → **caché**, et c'est automatique parce que c'est réversible d'un clic ;
 *    • il a été créé par cet import et n'a rien reçu → effacé par le ménage,
 *      personne ne l'a jamais vu (`planImportCleanup`) ;
 *    • l'utilisateur l'avait vidé lui-même → on n'y touche pas. */
export async function hideEmptiedChapters(
  workshopId: string,
  populatedBefore: readonly string[],
): Promise<string[]> {
  if (populatedBefore.length === 0) return [];

  const supabase = getSupabaseServerClient();
  const { data: remaining, error } = await supabase
    .from('workshop_bricks')
    .select('chapter_id')
    .eq('workshop_id', workshopId)
    .in('chapter_id', [...populatedBefore]);
  if (error) throw new Error(error.message);

  const stillPopulated = new Set((remaining ?? []).map((r) => r.chapter_id as string));
  const emptied = populatedBefore.filter((id) => !stillPopulated.has(id));
  if (emptied.length === 0) return [];

  const { error: hideError } = await supabase
    .from('workshop_chapters')
    .update({ hidden: true, updated_at: new Date().toISOString() })
    .eq('workshop_id', workshopId)
    .in('id', emptied);
  if (hideError) throw new Error(hideError.message);

  return emptied;
}

export async function insertChapters(
  workshopId: string,
  actorId: string,
  importId: string,
  chapters: {
    ref: string;
    name: string;
    position?: number;
    sourceDocument?: string;
    pageStart?: number;
    pageEnd?: number;
  }[],
): Promise<Map<string, string>> {
  const created = new Map<string, string>();
  if (chapters.length === 0) return created;

  const supabase = getSupabaseServerClient();

  // Les nouveaux chapitres se rangent APRÈS les existants : l'ordre du programme
  // appartient à l'utilisateur, un import ne le réorganise pas.
  const { data: last, error: lastError } = await supabase
    .from('workshop_chapters')
    .select('position')
    .eq('workshop_id', workshopId)
    .order('position', { ascending: false })
    .limit(1);
  if (lastError) throw new Error(lastError.message);
  const base = (last?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('workshop_chapters')
    .insert(
      chapters.map((c, i) => ({
        workshop_id: workshopId,
        created_by: actorId,
        import_id: importId,
        name: c.name,
        position: base + (c.position ?? i),
        // Provenance : sur quelles pages court ce chapitre. C'est ce qui permet
        // à la passe rangement de se passer du cours. `|| null` et non `?? null`
        // : le modèle rend 0 quand il ne sait pas, et un 0 stocké se lirait
        // comme « page zéro » alors qu'il veut dire « je ne sais pas ».
        source_document: c.sourceDocument || null,
        page_start: c.pageStart || null,
        page_end: c.pageEnd || null,
        // `created_at`/`updated_at` volontairement absents — voir l'en-tête.
      })),
    )
    .select('id');
  if (error) throw new Error(error.message);

  (data ?? []).forEach((row, i) => created.set(chapters[i].ref, row.id as string));
  return created;
}

export async function insertNotions(
  workshopId: string,
  actorId: string,
  importId: string,
  notions: { ref: string; title: string; chapterRef?: string; sourceDocument?: string; page?: number }[],
  chapterIds: Map<string, string>,
): Promise<Map<string, string>> {
  const created = new Map<string, string>();
  if (notions.length === 0) return created;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('workshop_bricks')
    .insert(
      notions.map((n) => ({
        workshop_id: workshopId,
        created_by: actorId,
        import_id: importId,
        title: n.title,
        chapter_id: resolve(n.chapterRef, chapterIds),
        // Même réserve que pour les chapitres : 0 veut dire « je ne sais pas ».
        source_document: n.sourceDocument || null,
        source_page: n.page || null,
      })),
    )
    .select('id');
  if (error) throw new Error(error.message);

  (data ?? []).forEach((row, i) => created.set(notions[i].ref, row.id as string));
  return created;
}

type PlanGroupInput = {
  ref: string;
  context: 'parcours' | 'exam';
  questions: {
    content: string;
    responseType: string;
    answer: string;
    choices: string[];
    correctChoices: number[];
    shuffleChoices: boolean;
    textLines: number;
    expectations: string;
    bloomLevel: number;
    notionRefs: string[];
  }[];
};

/** Écrit les groupes, leurs questions et les liens de notions. Renvoie le nombre
 *  de QUESTIONS écrites (et non de groupes) : c'est ce volume-là qui compte pour
 *  l'utilisateur comme pour les quotas. */
export async function insertGroups(
  workshopId: string,
  importId: string,
  groups: PlanGroupInput[],
  notionIds: Map<string, string>,
): Promise<number> {
  if (groups.length === 0) return 0;

  const supabase = getSupabaseServerClient();

  // La question principale reprend l'identifiant de son groupe (`sort_order` 0) —
  // invariant du stockage, voir .claude/rules/server-architecture.md.
  const groupIds = groups.map(() => crypto.randomUUID());

  const { error: groupError } = await supabase.from('exam_questions').insert(
    groups.map((g, i) => ({
      id: groupIds[i],
      workshop_id: workshopId,
      import_id: importId,
      context: g.context,
      pools: [],
      exam_ids: [],
    })),
  );
  if (groupError) throw new Error(groupError.message);

  const itemRows: Record<string, unknown>[] = [];
  const linkRows: { item_id: string; brick_id: string }[] = [];

  groups.forEach((group, gi) => {
    group.questions.forEach((question, qi) => {
      const itemId = qi === 0 ? groupIds[gi] : crypto.randomUUID();
      itemRows.push({
        id: itemId,
        group_id: groupIds[gi],
        sort_order: qi,
        content: question.content,
        response_type: question.responseType,
        answer: question.answer,
        choices: question.choices,
        correct_choices: question.correctChoices,
        shuffle_choices: question.shuffleChoices,
        text_lines: question.textLines,
        type_options: {},
        expectations: question.expectations,
        bloom_level: question.bloomLevel,
      });

      for (const ref of question.notionRefs) {
        const brickId = resolve(ref, notionIds);
        if (brickId) linkRows.push({ item_id: itemId, brick_id: brickId });
      }
    });
  });

  const { error: itemError } = await supabase.from('exam_question_items').insert(itemRows);
  if (itemError) throw new Error(itemError.message);

  if (linkRows.length > 0) {
    const { error: linkError } = await supabase.from('exam_question_item_bricks').insert(linkRows);
    if (linkError) throw new Error(linkError.message);
  }

  return itemRows.length;
}
