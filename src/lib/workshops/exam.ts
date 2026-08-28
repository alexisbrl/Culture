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
  ExerciseAnswer,
  ExerciseChoice,
  ExerciseResult,
  ExerciseTypeOptions,
  ResponseType,
  BloomLevel,
} from '@/lib/workshops/examTypes';
import {
  DEFAULT_BLOOM_LEVEL,
  emptyExerciseAnswer,
  matchPairs,
  normalizeTypeOptions,
  toBloomLevel,
  toExerciseAnswer,
  toResponseType,
  type QuestionTypeOptions,
} from '@/lib/workshops/examTypes';
import { gradeStatement } from '@/lib/workshops/grading';
import { assertQuestionIntegrity, assertStatements, notionIdsOf } from '@/lib/workshops/questionIntegrity';
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
};

/** Colonnes du groupe, sans les colonnes historiques désormais mortes. */
// `chapter_id` n'y est plus (19/08/2026) : le chapitre d'une question se déduit
// des notions qu'elle mobilise, des deux côtés — la banque le faisait déjà pour
// son filtre, le parcours le fait maintenant pour son tirage. La colonne est en
// attente de suppression (EN-ATTENTE-DEPLOIEMENT.md).
const GROUP_COLUMNS = 'id, workshop_id, image_key, audio_key, pools, exam_ids, created_at';

// Le groupe, ses questions et leurs notions en UN aller-retour : PostgREST suit
// les clés étrangères (`exam_question_items.group_id`, puis
// `exam_question_item_bricks.item_id`) et renvoie le tout imbriqué. Sans ça il
// faudrait trois étapes séquentielles — les identifiants des questions étant
// nécessaires pour aller chercher leurs notions — soit trois fois la latence
// réseau sur le rendu de l'onglet examen. Ça évite aussi un `in(...)` de plus de
// cent identifiants dans l'URL, qui finirait par buter sur sa limite de
// longueur.
//
// ⚠️ Cette chaîne n'est vérifiée ni par TypeScript ni par le build : elle
// désigne des tables et des colonnes par leur nom. Toute modification doit être
// rejouée contre la base (voir les contrôles de bout en bout du chantier).
const GROUP_WITH_ITEMS = `${GROUP_COLUMNS}, exam_question_items(*, exam_question_item_bricks(brick_id, bloom_level))`;

/** Un lien question ↔ notion, avec le niveau de Bloom **propre à ce couple**
 *  (28/08/2026) — la seule forme du niveau depuis que la question n'en porte
 *  plus. `bloomLevel: null` = colonne pas encore renseignée (tout ce qui a été
 *  écrit avant cette date) ; c'est une lacune de stockage, pas un sens. */
type NotionLink = { notionId: string; bloomLevel: BloomLevel | null };
type NotionLinkMap = Record<string, NotionLink[]>;

/** Le niveau de CHAQUE notion de la question — une clé par lien, sans trou.
 *  C'est ici, et nulle part ailleurs, que le défaut s'applique : les lecteurs
 *  (barème, crédit de maîtrise, éditeur) n'ont ainsi jamais à se demander quoi
 *  faire d'une notion sans niveau. */
function withNotionBloom(links: NotionLink[]): Record<string, BloomLevel> {
  const out: Record<string, BloomLevel> = {};
  for (const link of links) out[link.notionId] = link.bloomLevel ?? DEFAULT_BLOOM_LEVEL;
  return out;
}

type EmbeddedItemRow = ItemRow & {
  exam_question_item_bricks: { brick_id: string; bloom_level: number | null }[] | null;
};
type EmbeddedGroupRow = GroupRow & { exam_question_items: EmbeddedItemRow[] | null };

/** Questions d'un groupe **triées par position**, et leurs notions. Le tri se
 *  fait ici plutôt que dans la requête : l'ordre des ressources imbriquées se
 *  demande par une option qui a changé de nom d'une version à l'autre du client
 *  Supabase, alors qu'une poignée de questions se trie sans coût mesurable. */
function unpackGroup(row: EmbeddedGroupRow): { items: ItemRow[]; notionsByItem: NotionLinkMap } {
  const embedded = row.exam_question_items ?? [];
  const notionsByItem: NotionLinkMap = {};
  for (const item of embedded) {
    notionsByItem[item.id] = (item.exam_question_item_bricks ?? []).map((link) => ({
      notionId: link.brick_id,
      bloomLevel: link.bloom_level === null || link.bloom_level === undefined ? null : toBloomLevel(link.bloom_level),
    }));
  }
  const items = [...embedded].sort((a, b) => a.sort_order - b.sort_order);
  return { items, notionsByItem };
}

/** Un groupe tel qu'il sort de la base → la question telle que l'UI l'attend. */
function embeddedToQuestion(row: EmbeddedGroupRow): Question {
  const { items, notionsByItem } = unpackGroup(row);
  return rowToQuestion(row, items, notionsByItem);
}

function itemToPart(row: ItemRow, links: NotionLink[]): QuestionPart {
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
    typeOptions: normalizeTypeOptions(row.type_options),
    expectations: row.expectations ?? '',
    notionIds: links.map((link) => link.notionId),
    notionBloom: withNotionBloom(links),
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
    : itemToPart({ id: row.id, group_id: row.id, sort_order: 0, content: '', response_type: 'textuelle', answer: '', choices: [], correct_choices: [], shuffle_choices: false, text_lines: 4, type_options: {}, expectations: '' }, []);

  return {
    id: row.id,
    image: row.image_key ? { key: row.image_key } : null,
    audio: row.audio_key ? { key: row.audio_key } : null,
    pools: row.pools ?? [],
    examIds: row.exam_ids ?? [],
    createdAt: row.created_at,

    content: headPart.content,
    responseType: headPart.responseType,
    answer: headPart.answer,
    choices: headPart.choices,
    correctChoices: headPart.correctChoices,
    shuffleChoices: headPart.shuffleChoices,
    textLines: headPart.textLines,
    typeOptions: headPart.typeOptions,
    expectations: headPart.expectations,    notionIds: headPart.notionIds,
    notionBloom: headPart.notionBloom,

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
//
// Seul `saveQuestions` (masse) use de cette omission. `saveQuestion`, qui est le
// chemin de CRÉATION, exige désormais un contexte explicite : sans lui, une
// nouvelle ligne se rangeait selon le `DEFAULT` de la colonne (`'exam'`) sans
// qu'aucune erreur ne le signale.
function questionToRow(workshopId: string, q: Question, context?: QuestionContext) {
  return {
    ...(context ? { context } : {}),
    id: q.id,
    workshop_id: workshopId,
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
      notionIds: q.notionIds ?? [],
      notionBloom: q.notionBloom ?? {},
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
      updated_at: new Date().toISOString(),
    },
    notionIds: item.notionIds ?? [],
    notionBloom: item.notionBloom ?? {},
  }));
}

// ─── Lecture ─────────────────────────────────────────────────────────────────
//
// Toutes les lectures passent par `GROUP_WITH_ITEMS` : un seul aller-retour
// rapporte les groupes, leurs questions et les notions de chacune, quel que
// soit le nombre de groupes (règle N+1).

/** Notions d'un lot de questions. Ne sert plus qu'à l'ÉCRITURE (calcul du
 *  différentiel) : en lecture, elles arrivent imbriquées avec leur question. */
async function loadNotionLinks(itemIds: string[]): Promise<NotionLinkMap> {
  if (itemIds.length === 0) return {};

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_item_bricks')
    .select('item_id, brick_id, bloom_level')
    .in('item_id', itemIds);
  if (error) throw new Error(error.message);

  const map: NotionLinkMap = {};
  for (const row of data ?? []) {
    (map[row.item_id] ??= []).push({
      notionId: row.brick_id,
      bloomLevel: row.bloom_level === null ? null : toBloomLevel(row.bloom_level),
    });
  }
  return map;
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/** Contrôle d'intégrité de tout un lot avant écriture — **une seule** lecture
 *  des notions de l'atelier, quel que soit le nombre de questions (règle N+1 :
 *  l'ingestion IA en enverra des centaines d'un coup).
 *
 *  Ce qui est vérifié, et pourquoi si peu : voir `questionIntegrity.ts`. En deux
 *  mots — on refuse ce que personne ne peut vouloir (notion inexistante ou d'un
 *  autre atelier, type de réponse inventé), jamais un choix pédagogique.
 *
 *  Le contrôle du rattachement inter-ateliers ne peut pas être délégué à la base :
 *  la clé étrangère de `exam_question_item_bricks` vérifie que la notion existe,
 *  pas qu'elle appartient à CET atelier. Et une server action étant une URL POST
 *  publique, on ne peut pas s'en remettre à l'interface, qui ne propose pourtant
 *  que les notions de l'atelier. */
async function assertQuestionsIntegrity(workshopId: string, questions: Question[]): Promise<void> {
  const wanted = [...new Set(questions.flatMap(notionIdsOf))];

  // Aucune notion référencée : rien à lire, seuls les types restent à vérifier.
  let allowed = new Set<string>();
  if (wanted.length > 0) {
    const supabase = getSupabaseServerClient();
    // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
    const { data, error } = await supabase
      .from('workshop_bricks')
      .select('id')
      .eq('workshop_id', workshopId)
      .in('id', wanted);
    if (error) throw new Error(error.message);
    allowed = new Set((data ?? []).map((row) => row.id as string));
  }

  for (const question of questions) assertQuestionIntegrity(question, allowed);
}

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

  await syncItemNotions(
    wanted.map((w) => ({ itemId: w.row.id, notionIds: w.notionIds, notionBloom: w.notionBloom })),
  );
}

/** Remplace les liens notion↔question de tout un groupe. Une seule insertion
 *  pour l'ensemble ; les retraits sont rares et se font par question (un groupe
 *  en compte une poignée — ce n'est pas un chemin de lecture). */
async function syncItemNotions(
  items: { itemId: string; notionIds: string[]; notionBloom: Record<string, BloomLevel> }[],
): Promise<void> {
  if (items.length === 0) return;
  const supabase = getSupabaseServerClient();

  const existing = await loadNotionLinks(items.map((i) => i.itemId));

  const toAdd: { item_id: string; brick_id: string; bloom_level: number }[] = [];
  for (const item of items) {
    const before = new Map((existing[item.itemId] ?? []).map((link) => [link.notionId, link.bloomLevel]));
    const after = new Set(item.notionIds);
    // Toujours une valeur : depuis que la question n'a plus de niveau à elle, un
    // lien sans niveau n'aurait plus rien à suivre.
    const wanted = (notionId: string) => item.notionBloom[notionId] ?? DEFAULT_BLOOM_LEVEL;

    for (const notionId of after) {
      if (!before.has(notionId)) {
        toAdd.push({ item_id: item.itemId, brick_id: notionId, bloom_level: wanted(notionId) });
        continue;
      }
      // Le lien existe : seul son niveau peut avoir changé. Réécrire ceux qui
      // n'ont pas bougé ferait passer la question pour modifiée (`updated_at`),
      // et un import annulable cesserait de l'être à la première sauvegarde. Un
      // niveau encore vide en base vaut le défaut, comme à la lecture : une
      // ré-écriture de masse n'a pas à les remplir un par un.
      if ((before.get(notionId) ?? DEFAULT_BLOOM_LEVEL) === wanted(notionId)) continue;
      const { error } = await supabase
        .from('exam_question_item_bricks')
        .update({ bloom_level: wanted(notionId) })
        .eq('item_id', item.itemId)
        .eq('brick_id', notionId);
      if (error) throw new Error(error.message);
    }

    const toRemove = [...before.keys()].filter((id) => !after.has(id));
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
    supabase.from('exam_questions').select(GROUP_WITH_ITEMS).eq('workshop_id', workshopId).eq('context', 'exam').order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
    supabase.from('exam_generated').select('id, title, date, q, dur, avg, status, taken, question_ids, config').eq('workshop_id', workshopId).order('created_at', { ascending: false }),
  ]);

  if (questionsRes.error) throw new Error(questionsRes.error.message);
  const questions = ((questionsRes.data ?? []) as unknown as EmbeddedGroupRow[]).map(embeddedToQuestion);
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

// `context` est OBLIGATOIRE : l'enregistrement d'une question isolée est le seul
// chemin de création, et laisser le `DEFAULT` de la colonne trancher rangeait la
// question du mauvais côté sans la moindre erreur (ni au build, ni à
// l'exécution — `'exam'` est une valeur légale du CHECK). Chaque appelant
// déclare donc son côté, et le compilateur signale tout oubli.
//
// La ré-écriture de masse (`saveQuestions`), elle, n'en prend toujours pas : son
// rôle est justement de ne PAS requalifier les lignes existantes (voir
// `questionToRow`).
export async function saveQuestion(workshopId: string, question: Question, context: QuestionContext): Promise<void> {
  // AVANT toute écriture : un refus doit laisser la base intacte. Écrire le
  // groupe puis échouer sur ses notions laisserait une question à moitié
  // enregistrée — c'est exactement ce qui se produisait jusqu'ici, la clé
  // étrangère ne levant qu'au moment des liens.
  //
  // L'énoncé n'est exigé que sur ce chemin (création/modification), jamais sur
  // `saveQuestions` — voir `questionIntegrity.ts`.
  assertStatements(question);
  await assertQuestionsIntegrity(workshopId, [question]);

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
    supabase.from('exam_questions').select(GROUP_WITH_ITEMS).eq('workshop_id', workshopId).eq('context', 'parcours').order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
  ]);

  if (questionsRes.error) throw new Error(questionsRes.error.message);

  return {
    questions: ((questionsRes.data ?? []) as unknown as EmbeddedGroupRow[]).map(embeddedToQuestion),
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

// Les paires d'un « matching » sont stockées « gauche :: droite » dans UNE
// entrée de `choices` (voir l'éditeur, tabs/examen/questionFields.tsx). Les
// transmettre telles quelles livrerait la correction avec l'énoncé : le
// candidat n'a plus qu'à lire. On ne garde donc que la colonne de gauche dans
// `choices`, la droite partant mélangée et détachée dans `matchRight`.
function matchSides(choices: string[]): { left: string[]; right: string[] } {
  const pairs = matchPairs(choices);
  return { left: pairs.map((p) => p.left), right: pairs.map((p) => p.right) };
}

type ChoiceSource = { choices?: string[]; shuffleChoices?: boolean; responseType: ResponseType };

/** Ce que le candidat voit à cocher ou à relier.
 *
 *  ⚠️ **`choices` ne sort que pour les types qui en font des propositions.** La
 *  LISTE y range ses réponses ATTENDUES (voir `resolveQuestion`, côté
 *  ingestion) : les envoyer revenait à livrer la correction avec l'énoncé, à
 *  deux lignes de la précaution prise pour les paires. Rien ne l'affichait, mais
 *  la charge partait bel et bien au navigateur — corrigé le 25/08/2026, en même
 *  temps que la correction automatique de la liste. */
function toChoices(source: ChoiceSource): ExerciseChoice[] {
  const type = source.responseType;
  if (type !== 'qcs' && type !== 'qcm' && type !== 'matching') return [];

  const raw = source.choices ?? [];
  const labels = type === 'matching' ? matchSides(raw).left : raw;
  const choices: ExerciseChoice[] = labels.map((text, index) => ({ index, text }));
  return source.shuffleChoices ? shuffled(choices) : choices;
}

// Réglages de type envoyés au candidat. LISTE BLANCHE volontaire : on énumère
// ce qui sort, on ne retire pas ce qui doit rester. `tableChecked` (cases
// justes de la grille) est une correction et n'a rien à faire ici — l'oublier
// reviendrait à livrer la réponse avec l'énoncé. Tout nouveau réglage est donc
// invisible du candidat tant qu'il n'est pas ajouté ici sciemment.
function toExerciseTypeOptions(source: ChoiceSource & { typeOptions?: QuestionTypeOptions }): ExerciseTypeOptions {
  const options = source.typeOptions ?? {};
  return {
    // Mélangée : à rangs égaux, la droite se lirait en face de sa gauche.
    matchRight:
      source.responseType === 'matching'
        ? shuffled(matchSides(source.choices ?? []).right)
        : undefined,
    listNumbered: options.listNumbered,
    listExpected: options.listExpected,
    tableRows: options.tableRows,
    tableCols: options.tableCols,
    tableUnique: options.tableUnique,
    matchSplit: options.matchSplit,
    fileTypes: options.fileTypes,
    fileUrl: options.fileUrl,
    // Les deux modes de réponse voyagent jusqu'au candidat, mais RIEN ne les
    // exploite encore : l'exercice affiche toujours une saisie écrite. Le
    // branchement (enregistrement vocal, annotation de l'image) est au backlog.
    answerOnImage: options.answerOnImage,
    oralAnswer: options.oralAnswer,
  };
}

async function toPrompt(q: Question): Promise<ExercisePrompt> {
  const [imageUrl, audioUrl] = await Promise.all([
    q.image?.key ? createSignedDownloadUrl(q.image.key, undefined, MEDIA_URL_TTL_SECONDS) : Promise.resolve(null),
    q.audio?.key ? createSignedDownloadUrl(q.audio.key, undefined, MEDIA_URL_TTL_SECONDS) : Promise.resolve(null),
  ]);
  return {
    id: q.id,
    content: q.content,
    imageUrl,
    audioUrl,
    responseType: q.responseType,
    choices: toChoices(q),
    textLines: q.textLines ?? 4,
    typeOptions: toExerciseTypeOptions(q),
    // Les questions liées suivent la principale dans le même écran : l'image et
    // l'audio ne sont pas répétés (éléments communs), le reste leur est propre.
    parts: (q.parts ?? []).map((part) => ({
      content: part.content,
      responseType: part.responseType,
      choices: toChoices(part),
      textLines: part.textLines ?? 4,
      typeOptions: toExerciseTypeOptions(part),
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

/** Identifiants des questions de parcours qui couvrent un chapitre.
 *
 *  Une question n'est pas rattachée à un chapitre : elle **hérite de celui de
 *  ses notions** (19/08/2026, en remplacement de `exam_questions.chapter_id` et
 *  de son sélecteur dans la liste). C'est déjà la règle du filtre « chapitre »
 *  de la banque d'examen (`chaptersOfQuestion`), et c'est ce qui fait qu'une
 *  question posée sur des notions de deux chapitres est tirable dans les deux.
 *  Corollaire assumé : une question sans notion — ou dont aucune notion n'est
 *  rangée — n'est jamais tirée.
 *
 *  Trois sauts, faute de jointure côté PostgREST : notions du chapitre →
 *  questions (`exam_question_item_bricks`) → groupes (`exam_question_items`),
 *  puis on ne garde que les groupes de CET atelier en contexte parcours. */
async function parcoursQuestionIdsOfChapter(workshopId: string, chapterId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notions, error: notionsError } = await supabase
    .from('workshop_bricks')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('chapter_id', chapterId);
  if (notionsError) throw new Error(notionsError.message);

  const notionIds = (notions ?? []).map((n) => n.id as string);
  if (notionIds.length === 0) return [];

  const { data: links, error: linksError } = await supabase
    .from('exam_question_item_bricks')
    .select('item_id')
    .in('brick_id', notionIds);
  if (linksError) throw new Error(linksError.message);

  const itemIds = [...new Set((links ?? []).map((l) => l.item_id as string))];
  if (itemIds.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from('exam_question_items')
    .select('group_id')
    .in('id', itemIds);
  if (itemsError) throw new Error(itemsError.message);

  const groupIds = [...new Set((items ?? []).map((i) => i.group_id as string))];
  if (groupIds.length === 0) return [];

  const { data: groups, error: groupsError } = await supabase
    .from('exam_questions')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('context', 'parcours')
    .in('id', groupIds);
  if (groupsError) throw new Error(groupsError.message);

  return (groups ?? []).map((g) => g.id as string);
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

  let pool = await parcoursQuestionIdsOfChapter(workshopId, chapterId);
  if (pool.length === 0) return null;
  if (excludeId && pool.length > 1) pool = pool.filter((id) => id !== excludeId);

  const picked = pool[Math.floor(Math.random() * pool.length)];

  const { data: row, error: rowError } = await supabase
    .from('exam_questions')
    .select(GROUP_WITH_ITEMS)
    .eq('workshop_id', workshopId)
    .eq('id', picked)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) return null;

  return await toPrompt(embeddedToQuestion(row as unknown as EmbeddedGroupRow));
}

/** Notions à créditer après une bonne réponse, telles que le SERVEUR les
 *  connaît (jamais ce que le client prétend) — voir `rewardCorrectAnswer`. */
export type RewardTarget = { notionIds: string[]; bloomLevel: number };


// `answers[0]` porte la réponse de la question principale, `answers[i+1]` celle
// de la question liée `i` — même ordre que `ExercisePrompt.parts`. Un index
// absent vaut « rien de répondu ».
//
// `rewards` n'est PAS destiné au client : il ne sort pas de l'action serveur,
// qui s'en sert pour créditer la maîtrise des notions de chaque énoncé
// correctement traité (la question principale et chaque question liée ont les
// leurs, voir `QuestionPart`).
export async function gradeParcoursAnswer(
  workshopId: string,
  questionId: string,
  answers: ExerciseAnswer[]
): Promise<{ result: ExerciseResult; rewards: RewardTarget[] } | null> {
  const supabase = getSupabaseServerClient();

  const { data: row, error } = await supabase
    .from('exam_questions')
    .select(GROUP_WITH_ITEMS)
    .eq('workshop_id', workshopId)
    .eq('context', 'parcours')
    .eq('id', questionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;

  const q = embeddedToQuestion(row as unknown as EmbeddedGroupRow);
  const parts = q.parts ?? [];

  // Ce qui arrive du navigateur n'est jamais tenu pour bien formé : une server
  // action est une URL POST publique (voir `toExerciseAnswer`).
  const given = (Array.isArray(answers) ? answers : []).map(toExerciseAnswer);
  const main = gradeStatement(q, given[0] ?? emptyExerciseAnswer());
  const partResults = parts.map((part, i) => gradeStatement(part, given[i + 1] ?? emptyExerciseAnswer()));

  // Chaque énoncé crédite SES notions, chacune à SON niveau : une question liée
  // juste fait progresser les siennes même si la principale est ratée. Notions
  // et niveaux sont relus de la base ici, jamais reçus du client.
  const rewards: RewardTarget[] = [
    { correct: main.correct, notionIds: q.notionIds ?? [], notionBloom: q.notionBloom },
    ...parts.map((part, i) => ({
      correct: partResults[i]?.correct ?? null,
      notionIds: part.notionIds ?? [],
      notionBloom: part.notionBloom,
    })),
  ]
    .filter((target) => target.correct === true && target.notionIds.length > 0)
    // Une notion est créditée à SON niveau, pas à celui de l'énoncé : une même
    // question peut en faire restituer une et en faire analyser une autre. On
    // regroupe donc par niveau — la maîtrise se calcule par palier, un appel par
    // palier suffit.
    .flatMap(({ notionIds, notionBloom }) => {
      const byLevel = new Map<BloomLevel, string[]>();
      for (const notionId of notionIds) {
        const level = notionBloom[notionId] ?? DEFAULT_BLOOM_LEVEL;
        byLevel.set(level, [...(byLevel.get(level) ?? []), notionId]);
      }
      return [...byLevel].map(([level, ids]) => ({ notionIds: ids, bloomLevel: level }));
    });

  return { result: { ...main, parts: partResults }, rewards };
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  await assertQuestionsIntegrity(workshopId, questions);

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
