// Logique métier « générateur d'examen » (banque de questions, pools, examens
// générés, brouillon), extraite de src/app/actions/examQuestions.ts (audit
// §5.2, même découpage que les autres modules de ce dossier). Types de domaine
// dans @/lib/workshops/examTypes (audit §5.3).
//
// Pas d'authz ici (`assertManager`/`requireManager` restent dans les wrappers
// `'use server'` de examQuestions.ts), pas de `revalidatePath`. Ces fonctions
// lèvent une exception sur erreur Supabase — comportement identique à l'ancien
// examQuestions.ts, conservé pour ne pas changer la gestion d'erreur côté UI
// (appels en fire-and-forget avec `.catch(console.error)`).

import { getSupabaseServerClient } from '@/lib/supabase';
import { createSignedDownloadUrl } from '@/lib/storage';
import type {
  Question,
  QuestionContext,
  QuestionPart,
  ExamConfig,
  ExamPool,
  GeneratedExam,
  ExamDraft,
  ExercisePrompt,
  ExerciseChoice,
  ExerciseResult,
  ResponseType,
} from '@/lib/workshops/examTypes';
import { toBloomLevel, toResponseType, type QuestionTypeOptions } from '@/lib/workshops/examTypes';
// ─── Stockage : un groupe, ses questions ─────────────────────────────────────
//
// `exam_questions` porte le GROUPE — uniquement ce qui est commun : titre,
// image, audio, libellés, chapitre, examens. Chaque question du groupe (la
// principale comprise) est une ligne de `exam_question_items`, ordonnée par
// `sort_order` (0 = principale), avec ses colonnes typées et ses contraintes.
// Les notions couvertes sont reliées à la QUESTION (`exam_question_item_bricks`)
// et non plus au groupe.
//
// La question principale reprend l'identifiant du groupe (`item.id = group.id`
// quand `sort_order = 0`) : les clés de barème (`ExamConfig.weighting`), les
// sections d'examen et les brouillons déjà enregistrés restent donc valides.
//
// Les colonnes historiques de `exam_questions` (`content`, `response_type`,
// `parts`…) ne sont plus ni lues ni écrites ; leur suppression attend le
// déploiement de ce code, voir docs/migrations/EN-ATTENTE-DEPLOIEMENT.md.
//
// Le type `Question` exposé au reste de l'application reste, lui, « question
// principale + questions liées » : c'est la vue qu'édite l'interface. La
// conversion est confinée ici. La vue symétrique destinée à l'IA et à une
// future API est `QuestionGroup` (@/lib/workshops/questionGroup).

type GroupRow = {
  id: string;
  workshop_id: string;
  chapter_id: string | null;
  title: string;
  image_key: string | null;
  audio_key: string | null;
  pools: string[];
  exam_ids: string[];
  created_at: string;
};

type ItemRow = {
  id: string;
  group_id: string;
  sort_order: number;
  content: string;
  response_type: string;
  answer: string;
  choices: string[];
  correct_choices: number[];
  shuffle_choices: boolean;
  text_lines: number;
  type_options: QuestionTypeOptions | null;
  expectations: string | null;
  bloom_level: number;
};

/** Colonnes du groupe, sans les colonnes historiques désormais mortes. */
const GROUP_COLUMNS = 'id, workshop_id, chapter_id, title, image_key, audio_key, pools, exam_ids, created_at';

type NotionLinkMap = Record<string, string[]>;

function itemToPart(row: ItemRow, notionIds: string[]): QuestionPart {
  return {
    id: row.id,
    content: row.content ?? '',
    // `toResponseType` absorbe les types retirés (sondage, ordre, fill_blank,
    // audio) : les lignes anciennes restent lisibles et se réécrivent avec la
    // nouvelle valeur au premier enregistrement.
    responseType: toResponseType(row.response_type),
    answer: row.answer ?? '',
    choices: row.choices ?? [],
    correctChoices: row.correct_choices ?? [],
    shuffleChoices: row.shuffle_choices ?? false,
    textLines: row.text_lines ?? 4,
    typeOptions: row.type_options ?? {},
    expectations: row.expectations ?? '',
    bloomLevel: toBloomLevel(row.bloom_level),
    notionIds,
  };
}

// `items` doit être trié par `sort_order` (l'appelant le garantit) et contenir
// au moins la question principale. Un groupe sans question principale ne peut
// pas exister — l'invariant est posé à l'écriture — mais la lecture reste
// défensive plutôt que de renvoyer un objet incohérent.
function rowToQuestion(row: GroupRow, items: ItemRow[], notionsByItem: NotionLinkMap = {}): Question {
  const [head, ...linked] = items;
  const headPart = head
    ? itemToPart(head, notionsByItem[head.id] ?? [])
    : itemToPart({ id: row.id, group_id: row.id, sort_order: 0, content: '', response_type: 'textuelle', answer: '', choices: [], correct_choices: [], shuffle_choices: false, text_lines: 4, type_options: {}, expectations: '', bloom_level: 1 }, []);

  return {
    id: row.id,
    title: row.title ?? '',
    image: row.image_key ? { key: row.image_key } : null,
    audio: row.audio_key ? { key: row.audio_key } : null,
    pools: row.pools ?? [],
    examIds: row.exam_ids ?? [],
    chapterId: row.chapter_id ?? null,
    createdAt: row.created_at,

    content: headPart.content,
    responseType: headPart.responseType,
    answer: headPart.answer,
    choices: headPart.choices,
    correctChoices: headPart.correctChoices,
    shuffleChoices: headPart.shuffleChoices,
    textLines: headPart.textLines,
    typeOptions: headPart.typeOptions,
    expectations: headPart.expectations,
    bloomLevel: headPart.bloomLevel,
    notionIds: headPart.notionIds,

    parts: linked.map((item) => itemToPart(item, notionsByItem[item.id] ?? [])),

    // Champs hérités, plus édités nulle part et plus stockés : valeurs neutres.
    answerOptional: false,
    difficulty: { enabled: false, value: 3 },
    duration: { enabled: false, minutes: 2, seconds: 0 },
  };
}

// `context` n'est inclus dans la ligne QUE s'il est fourni : sur un `upsert` de
// mise à jour, une colonne absente du payload garde sa valeur — c'est ce qui
// permet aux ré-écritures de masse (nettoyage de libellé, suppression) de ne pas
// requalifier silencieusement une question de parcours en question d'examen.
// `chapter_id` suit la même règle et n'est écrit que dans le contexte
// « parcours » : la banque d'examen ne connaît pas les chapitres.
function questionToRow(workshopId: string, q: Question, context?: QuestionContext) {
  return {
    ...(context ? { context } : {}),
    ...(context === 'parcours' ? { chapter_id: q.chapterId ?? null } : {}),
    id: q.id,
    workshop_id: workshopId,
    title: q.title ?? '',
    image_key: q.image?.key ?? null,
    audio_key: q.audio?.key ?? null,
    pools: q.pools,
    exam_ids: q.examIds,
    updated_at: new Date().toISOString(),
  };
}

/** Les lignes `exam_question_items` d'un groupe, dans l'ordre. La question
 *  principale reprend l'identifiant du groupe ; une question liée sans
 *  identifiant (objet forgé à la main, import) en reçoit un plutôt que d'écraser
 *  la ligne d'une autre. */
function itemRowsOf(q: Question) {
  const parts: QuestionPart[] = q.parts ?? [];
  const all = [
    {
      id: q.id,
      content: q.content,
      responseType: q.responseType,
      answer: q.answer,
      choices: q.choices,
      correctChoices: q.correctChoices,
      shuffleChoices: q.shuffleChoices,
      textLines: q.textLines ?? 4,
      typeOptions: q.typeOptions ?? {},
      expectations: q.expectations ?? '',
      bloomLevel: q.bloomLevel,
      notionIds: q.notionIds ?? [],
    },
    ...parts.map((part) => ({ ...part, id: part.id || crypto.randomUUID() })),
  ];

  return all.map((item, index) => ({
    row: {
      id: item.id,
      group_id: q.id,
      sort_order: index,
      content: item.content ?? '',
      response_type: item.responseType,
      answer: item.answer ?? '',
      choices: item.choices ?? [],
      correct_choices: item.correctChoices ?? [],
      shuffle_choices: item.shuffleChoices ?? false,
      text_lines: item.textLines ?? 4,
      type_options: item.typeOptions ?? {},
      expectations: item.expectations ?? '',
      bloom_level: toBloomLevel(item.bloomLevel),
      updated_at: new Date().toISOString(),
    },
    notionIds: item.notionIds ?? [],
  }));
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Charge les questions de plusieurs groupes et les notions de chacune : deux
 *  requêtes au total quel que soit le nombre de groupes affichés (règle N+1). */
async function loadItems(groupIds: string[]): Promise<{ byGroup: Record<string, ItemRow[]>; notionsByItem: NotionLinkMap }> {
  if (groupIds.length === 0) return { byGroup: {}, notionsByItem: {} };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_items')
    .select('*')
    .in('group_id', groupIds)
    .order('group_id', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  const items = (data ?? []) as ItemRow[];
  const byGroup: Record<string, ItemRow[]> = {};
  for (const item of items) (byGroup[item.group_id] ??= []).push(item);

  return { byGroup, notionsByItem: await loadNotionLinks(items.map((i) => i.id)) };
}

/** Un seul groupe, avec ses questions — pour le tirage et la correction. */
async function loadQuestion(row: GroupRow): Promise<Question> {
  const { byGroup, notionsByItem } = await loadItems([row.id]);
  return rowToQuestion(row, byGroup[row.id] ?? [], notionsByItem);
}

async function loadNotionLinks(itemIds: string[]): Promise<NotionLinkMap> {
  if (itemIds.length === 0) return {};

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_item_bricks')
    .select('item_id, brick_id')
    .in('item_id', itemIds);
  if (error) throw new Error(error.message);

  const map: NotionLinkMap = {};
  for (const row of data ?? []) (map[row.item_id] ??= []).push(row.brick_id);
  return map;
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/** Aligne les lignes `exam_question_items` d'un groupe sur ce que porte la
 *  question, puis leurs notions. Différentiel plutôt que « tout effacer, tout
 *  réinsérer » : une question liée conserve sa ligne (et ses liens) d'une
 *  édition à l'autre, et un échec en cours de route ne laisse jamais le groupe
 *  sans question. Le groupe doit déjà exister (clé étrangère). */
async function syncQuestionItems(q: Question): Promise<void> {
  const supabase = getSupabaseServerClient();
  const wanted = itemRowsOf(q);

  // ⚠️ Ordre imposé par la contrainte d'unicité `(group_id, sort_order)` : les
  // lignes retirées libèrent d'abord leur position, sinon une question liée qui
  // en remplace une autre entre en collision avec elle. Supprimer d'abord ne
  // met rien en danger — seules partent les lignes qui disparaissaient de toute
  // façon, celles qu'on garde ne sont pas touchées.
  const { data: existing, error: readError } = await supabase
    .from('exam_question_items')
    .select('id')
    .eq('group_id', q.id);
  if (readError) throw new Error(readError.message);

  const keep = new Set(wanted.map((w) => w.row.id));
  const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    // Les liens de notions des lignes retirées partent avec elles (ON DELETE CASCADE).
    const { error } = await supabase.from('exam_question_items').delete().in('id', stale);
    if (error) throw new Error(error.message);
  }

  // Un seul appel pour toutes les lignes : la contrainte d'unicité est
  // `deferrable initially deferred`, donc vérifiée à la fin de la transaction.
  // C'est ce qui permet à deux questions liées d'échanger leur position sans
  // passer par une position intermédiaire libre.
  const { error: upsertError } = await supabase
    .from('exam_question_items')
    .upsert(wanted.map((w) => w.row));
  if (upsertError) throw new Error(upsertError.message);

  await syncItemNotions(wanted.map((w) => ({ itemId: w.row.id, notionIds: w.notionIds })));
}

/** Remplace les liens notion↔question de tout un groupe. Une seule insertion
 *  pour l'ensemble ; les retraits sont rares et se font par question (un groupe
 *  en compte une poignée — ce n'est pas un chemin de lecture). */
async function syncItemNotions(items: { itemId: string; notionIds: string[] }[]): Promise<void> {
  if (items.length === 0) return;
  const supabase = getSupabaseServerClient();

  const existing = await loadNotionLinks(items.map((i) => i.itemId));

  const toAdd: { item_id: string; brick_id: string }[] = [];
  for (const item of items) {
    const before = new Set(existing[item.itemId] ?? []);
    const after = new Set(item.notionIds);
    for (const notionId of after) if (!before.has(notionId)) toAdd.push({ item_id: item.itemId, brick_id: notionId });

    const toRemove = [...before].filter((id) => !after.has(id));
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('exam_question_item_bricks')
        .delete()
        .eq('item_id', item.itemId)
        .in('brick_id', toRemove);
      if (error) throw new Error(error.message);
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('exam_question_item_bricks').insert(toAdd);
    if (error) throw new Error(error.message);
  }
}

export async function getExamBankData(workshopId: string): Promise<{
  questions: Question[];
  pools: ExamPool[];
  exams: GeneratedExam[];
}> {
  const supabase = getSupabaseServerClient();

  const [questionsRes, poolsRes, examsRes] = await Promise.all([
    // Uniquement la banque d'examen : les questions du parcours pédagogique
    // vivent dans la même table, distinguées par `context`.
    // `.order('id')` en second critère : voir getParcoursData (ex æquo sur
    // `created_at` → ordre arbitraire, la banque se réordonnait toute seule).
    supabase.from('exam_questions').select(GROUP_COLUMNS).eq('workshop_id', workshopId).eq('context', 'exam').order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
    supabase.from('exam_generated').select('id, title, date, q, dur, avg, status, taken, question_ids, config').eq('workshop_id', workshopId).order('created_at', { ascending: false }),
  ]);

  const bankRows = (questionsRes.data ?? []) as unknown as GroupRow[];
  const { byGroup, notionsByItem } = await loadItems(bankRows.map((r) => r.id));
  const questions = bankRows.map((row) => rowToQuestion(row, byGroup[row.id] ?? [], notionsByItem));
  const pools = (poolsRes.data ?? []) as ExamPool[];
  const exams = (examsRes.data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    date: e.date,
    q: e.q,
    dur: e.dur,
    avg: e.avg,
    status: e.status,
    taken: e.taken,
    questionIds: e.question_ids ?? [],
    config: e.config ?? undefined,
  })) as GeneratedExam[];

  return { questions, pools, exams };
}

export async function saveQuestion(workshopId: string, question: Question, context?: QuestionContext): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questionToRow(workshopId, question, context));
  if (error) throw new Error(error.message);

  // Après l'upsert du groupe seulement : la clé étrangère de
  // `exam_question_items` exige qu'il existe déjà pour une création.
  await syncQuestionItems(question);
}

// ─── Parcours pédagogique ────────────────────────────────────────────────────
//
// Même table que la banque d'examen, filtrée sur `context = 'parcours'`. Les
// pools sont partagés entre les deux contextes (ce sont les étiquettes de
// l'atelier), d'où leur présence ici.
export async function getParcoursData(workshopId: string): Promise<{
  questions: Question[];
  pools: ExamPool[];
}> {
  const supabase = getSupabaseServerClient();

  const [questionsRes, poolsRes] = await Promise.all([
    // Départage sur `id` : les questions insérées en lot partagent le même
    // `created_at` à la microseconde près, et sans second critère Postgres rend
    // les ex æquo dans un ordre arbitraire — la liste se réordonnait sous les
    // yeux de l'utilisateur à chaque enregistrement.
    supabase.from('exam_questions').select(GROUP_COLUMNS).eq('workshop_id', workshopId).eq('context', 'parcours').order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
  ]);

  const rows = (questionsRes.data ?? []) as unknown as GroupRow[];
  const { byGroup, notionsByItem } = await loadItems(rows.map((r) => r.id));

  return {
    questions: rows.map((row) => rowToQuestion(row, byGroup[row.id] ?? [], notionsByItem)),
    pools: (poolsRes.data ?? []) as ExamPool[],
  };
}

// ─── Exercice : tirage et correction ─────────────────────────────────────────
//
// ⚠️ SÉCURITÉ — Ces deux fonctions sont les seules du module appelées pour le
// compte d'un simple membre. Elles ne renvoient jamais un `Question` complet :
// `drawParcoursQuestion` produit un `ExercisePrompt` sans réponse, et
// `gradeParcoursAnswer` ne révèle la réponse attendue qu'en réponse à une
// tentative. Un membre déterminé peut donc obtenir la réponse en soumettant
// n'importe quoi — c'est assumé pour un parcours d'entraînement individuel,
// contrairement à un examen noté.

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// URLs signées de longue durée (1h) : un candidat reste sur l'écran d'exercice
// le temps de répondre, contrairement à un téléchargement ponctuel.
const MEDIA_URL_TTL_SECONDS = 3600;

function toChoices(source: { choices?: string[]; shuffleChoices?: boolean }): ExerciseChoice[] {
  const choices: ExerciseChoice[] = (source.choices ?? []).map((text, index) => ({ index, text }));
  return source.shuffleChoices ? shuffled(choices) : choices;
}

async function toPrompt(q: Question): Promise<ExercisePrompt> {
  const [imageUrl, audioUrl] = await Promise.all([
    q.image?.key ? createSignedDownloadUrl(q.image.key, undefined, MEDIA_URL_TTL_SECONDS) : Promise.resolve(null),
    q.audio?.key ? createSignedDownloadUrl(q.audio.key, undefined, MEDIA_URL_TTL_SECONDS) : Promise.resolve(null),
  ]);
  return {
    id: q.id,
    title: q.title,
    content: q.content,
    imageUrl,
    audioUrl,
    responseType: q.responseType,
    choices: toChoices(q),
    textLines: q.textLines ?? 4,
    // Les questions liées suivent la principale dans le même écran : l'image et
    // l'audio ne sont pas répétés (éléments communs), le reste leur est propre.
    parts: (q.parts ?? []).map((part) => ({
      content: part.content,
      responseType: part.responseType,
      choices: toChoices(part),
      textLines: part.textLines ?? 4,
    })),
  };
}

// Résout un lot de clés de stockage en URLs signées, pour l'éditeur/la banque
// gestionnaire (règle N+1 : un seul appel pour toutes les questions affichées,
// plutôt qu'une résolution par question). Les clés introuvables (fichier
// supprimé, erreur du provider) sont simplement absentes du résultat.
export async function resolveMediaUrls(keys: string[]): Promise<Record<string, string>> {
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return {};

  const entries = await Promise.all(
    uniqueKeys.map(async (key) => [key, await createSignedDownloadUrl(key, undefined, MEDIA_URL_TTL_SECONDS)] as const)
  );

  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

// Tirage uniforme parmi les questions du chapitre. `excludeId` évite de
// retomber sur la question qu'on vient de faire quand il y a de quoi varier —
// avec une seule question dans le chapitre, on la retire logiquement.
export async function drawParcoursQuestion(
  workshopId: string,
  chapterId: string,
  excludeId?: string
): Promise<ExercisePrompt | null> {
  const supabase = getSupabaseServerClient();

  const { data: ids, error } = await supabase
    .from('exam_questions')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('context', 'parcours')
    .eq('chapter_id', chapterId);

  if (error) throw new Error(error.message);

  let pool = (ids ?? []).map((r) => r.id as string);
  if (pool.length === 0) return null;
  if (excludeId && pool.length > 1) pool = pool.filter((id) => id !== excludeId);

  const picked = pool[Math.floor(Math.random() * pool.length)];

  const { data: row, error: rowError } = await supabase
    .from('exam_questions')
    .select(GROUP_COLUMNS)
    .eq('workshop_id', workshopId)
    .eq('id', picked)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) return null;

  return await toPrompt(await loadQuestion(row as unknown as GroupRow));
}

function sameChoiceSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/** Notions à créditer après une bonne réponse, telles que le SERVEUR les
 *  connaît (jamais ce que le client prétend) — voir `rewardCorrectAnswer`. */
export type RewardTarget = { notionIds: string[]; bloomLevel: number };

function gradeOne(
  source: { responseType: ResponseType; answer?: string; correctChoices?: number[] },
  selectedChoices: number[]
): ExerciseResult {
  const autoGradable = source.responseType === 'qcs' || source.responseType === 'qcm';
  return {
    // Réponse libre, dessin, fichier… : pas de correction automatique possible,
    // on affiche seulement la réponse attendue (`correct: null`).
    correct: autoGradable ? sameChoiceSet(selectedChoices, source.correctChoices ?? []) : null,
    answer: source.answer ?? '',
    correctChoices: source.correctChoices ?? [],
  };
}

// `selections[0]` porte les choix de la question principale, `selections[i+1]`
// ceux de la question liée `i` — même ordre que `ExercisePrompt.parts`. Un index
// absent vaut « aucun choix coché ».
//
// `rewards` n'est PAS destiné au client : il ne sort pas de l'action serveur,
// qui s'en sert pour créditer la maîtrise des notions de chaque énoncé
// correctement traité (la question principale et chaque question liée ont les
// leurs, voir `QuestionPart`).
export async function gradeParcoursAnswer(
  workshopId: string,
  questionId: string,
  selections: number[][]
): Promise<{ result: ExerciseResult; rewards: RewardTarget[] } | null> {
  const supabase = getSupabaseServerClient();

  const { data: row, error } = await supabase
    .from('exam_questions')
    .select(GROUP_COLUMNS)
    .eq('workshop_id', workshopId)
    .eq('context', 'parcours')
    .eq('id', questionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;

  const q = await loadQuestion(row as unknown as GroupRow);
  const parts = q.parts ?? [];

  const main = gradeOne(q, selections[0] ?? []);
  const partResults = parts.map((part, i) => gradeOne(part, selections[i + 1] ?? []));

  // Chaque énoncé crédite SES notions avec SON niveau de Bloom : une question
  // liée juste fait progresser les siennes même si la principale est ratée.
  // Notions et niveau sont relus de la base ici, jamais reçus du client.
  const rewards: RewardTarget[] = [
    { correct: main.correct, notionIds: q.notionIds ?? [], bloomLevel: q.bloomLevel },
    ...parts.map((part, i) => ({
      correct: partResults[i]?.correct ?? null,
      notionIds: part.notionIds ?? [],
      bloomLevel: part.bloomLevel,
    })),
  ]
    .filter((target) => target.correct === true && target.notionIds.length > 0)
    .map(({ notionIds, bloomLevel }) => ({ notionIds, bloomLevel }));

  return { result: { ...main, parts: partResults }, rewards };
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questions.map((q) => questionToRow(workshopId, q)));
  if (error) throw new Error(error.message);

  // Les groupes d'abord (clé étrangère), leurs questions ensuite — en parallèle,
  // chaque groupe étant indépendant des autres.
  await Promise.all(questions.map((q) => syncQuestionItems(q)));
}

export async function createPool(workshopId: string, pool: ExamPool): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_pools').insert({ id: pool.id, workshop_id: workshopId, name: pool.name, color: pool.color });
  if (error) throw new Error(error.message);
}

export async function updatePool(workshopId: string, pool: ExamPool): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_pools').update({ name: pool.name, color: pool.color }).eq('workshop_id', workshopId).eq('id', pool.id);
  if (error) throw new Error(error.message);
}

export async function deletePool(workshopId: string, poolId: string, affectedQuestions: Question[]): Promise<void> {
  const supabase = getSupabaseServerClient();

  if (affectedQuestions.length > 0) {
    const { error: updateError } = await supabase.from('exam_questions').upsert(affectedQuestions.map((q) => questionToRow(workshopId, q)));
    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase.from('exam_pools').delete().eq('workshop_id', workshopId).eq('id', poolId);
  if (error) throw new Error(error.message);
}

export async function deleteQuestion(workshopId: string, questionId: string, affectedQuestions: Question[]): Promise<void> {
  const supabase = getSupabaseServerClient();

  if (affectedQuestions.length > 0) {
    const { error: updateError } = await supabase.from('exam_questions').upsert(affectedQuestions.map((q) => questionToRow(workshopId, q)));
    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase.from('exam_questions').delete().eq('workshop_id', workshopId).eq('id', questionId);
  if (error) throw new Error(error.message);
}

export async function saveGeneratedExam(workshopId: string, exam: GeneratedExam): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_generated').upsert({
    id: exam.id,
    workshop_id: workshopId,
    title: exam.title,
    date: exam.date,
    q: exam.q,
    dur: exam.dur,
    avg: exam.avg,
    status: exam.status,
    taken: exam.taken,
    question_ids: exam.questionIds ?? [],
    config: exam.config ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function getExamDraft(workshopId: string, userId: string): Promise<ExamDraft | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('exam_draft').select('draft_ids, config, editing_id').eq('workshop_id', workshopId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { draftIds: data.draft_ids ?? [], config: data.config as ExamConfig, editingId: data.editing_id ?? null };
}

export async function deleteGeneratedExam(workshopId: string, examId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_generated').delete().eq('workshop_id', workshopId).eq('id', examId);
  if (error) throw new Error(error.message);
}

export async function saveExamDraft(workshopId: string, userId: string, draft: ExamDraft): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_draft').upsert({
    workshop_id: workshopId,
    user_id: userId,
    draft_ids: draft.draftIds,
    config: draft.config,
    editing_id: draft.editingId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'workshop_id,user_id' });
  if (error) throw new Error(error.message);
}
