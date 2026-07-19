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
} from '@/lib/workshops/examTypes';
import { toBloomLevel } from '@/lib/workshops/examTypes';

type QuestionRow = {
  id: string;
  workshop_id: string;
  chapter_id: string | null;
  bloom_level: number;
  title: string;
  question_type: string;
  response_type: string;
  content: string;
  answer: string;
  choices: string[];
  correct_choices: number[];
  shuffle_choices: boolean;
  pools: string[];
  answer_optional: boolean;
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number; seconds: number };
  parts: QuestionPart[];
  exam_ids: string[];
  text_lines: number;
  created_at: string;
};

function normalizePart(part: Partial<QuestionPart>): QuestionPart {
  return {
    content: part.content ?? '',
    responseType: part.responseType ?? 'sans_reponse',
    answer: part.answer ?? '',
    choices: part.choices ?? [],
    correctChoices: part.correctChoices ?? [],
    shuffleChoices: part.shuffleChoices ?? false,
    textLines: part.textLines ?? 4,
    answerOptional: part.answerOptional ?? false,
    difficulty: part.difficulty ?? { enabled: false, value: 3 },
    duration: part.duration ?? { enabled: false, minutes: 2, seconds: 0 },
  };
}

// `brickIds` ne vient pas de la ligne (table de jonction séparée) : les
// appelants qui en ont besoin passent la map pré-chargée par `loadBrickLinks`.
// Par défaut la question est renvoyée sans briques, ce qui est correct pour les
// chemins qui ne s'en servent pas (tirage d'exercice, correction).
function rowToQuestion(row: QuestionRow, brickIds: string[] = []): Question {
  return {
    bloomLevel: toBloomLevel(row.bloom_level),
    brickIds,
    id: row.id,
    title: row.title ?? '',
    questionType: row.question_type as Question['questionType'],
    responseType: row.response_type as Question['responseType'],
    content: row.content,
    answer: row.answer,
    choices: row.choices ?? [],
    correctChoices: row.correct_choices ?? [],
    shuffleChoices: row.shuffle_choices ?? false,
    pools: row.pools ?? [],
    answerOptional: row.answer_optional ?? false,
    difficulty: row.difficulty ?? { enabled: false, value: 3 },
    duration: row.duration ?? { enabled: false, minutes: 2, seconds: 0 },
    parts: (row.parts ?? []).map(normalizePart),
    examIds: row.exam_ids ?? [],
    textLines: row.text_lines ?? 4,
    createdAt: row.created_at,
    chapterId: row.chapter_id ?? null,
  };
}

// `context` distingue les questions de la banque d'examen de celles du parcours
// pédagogique (colonne `exam_questions.context`, 'exam' | 'parcours'). Il n'est
// inclus dans la ligne QUE s'il est fourni : sur un `upsert` de mise à jour,
// une colonne absente du payload garde sa valeur — c'est ce qui permet aux
// ré-écritures de masse (nettoyage de pool, suppression) de ne pas requalifier
// silencieusement une question de parcours en question d'examen.
// `chapter_id` suit exactement la même règle, et n'est écrit que dans le
// contexte « parcours » : la banque d'examen ne connaît pas les chapitres, et
// une ré-écriture de masse ne doit pas détacher une question de son pot.
// `bloom_level` est en revanche toujours écrit : contrairement à `context` et
// `chapter_id`, il a une valeur dans tous les contextes et `rowToQuestion` la
// restitue systématiquement — une ré-écriture de masse ne peut donc pas le
// perdre. `brickIds` n'est pas ici : il vit dans `exam_question_bricks`, écrit
// séparément par `syncQuestionBricks`.
function questionToRow(workshopId: string, q: Question, context?: QuestionContext) {
  return {
    ...(context ? { context } : {}),
    ...(context === 'parcours' ? { chapter_id: q.chapterId ?? null } : {}),
    bloom_level: toBloomLevel(q.bloomLevel),
    id: q.id,
    workshop_id: workshopId,
    title: q.title ?? '',
    question_type: q.questionType,
    response_type: q.responseType,
    content: q.content,
    answer: q.answer,
    choices: q.choices,
    correct_choices: q.correctChoices,
    shuffle_choices: q.shuffleChoices,
    pools: q.pools,
    answer_optional: q.answerOptional,
    difficulty: q.difficulty,
    duration: q.duration,
    parts: q.parts ?? [],
    exam_ids: q.examIds,
    text_lines: q.textLines ?? 4,
    updated_at: new Date().toISOString(),
  };
}

// ─── Briques associées aux questions (exam_question_bricks) ──────────────────

type BrickLinkMap = Record<string, string[]>;

// Un seul aller-retour pour toutes les questions de la page (règle N+1) : on
// charge les liens des ids fournis, puis on les distribue à `rowToQuestion`.
async function loadBrickLinks(questionIds: string[]): Promise<BrickLinkMap> {
  if (questionIds.length === 0) return {};

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_bricks')
    .select('question_id, brick_id')
    .in('question_id', questionIds);

  if (error) throw new Error(error.message);

  const map: BrickLinkMap = {};
  for (const row of data ?? []) {
    (map[row.question_id] ??= []).push(row.brick_id);
  }
  return map;
}

// Remplace l'ensemble des liens d'une question par ceux fournis. On calcule le
// différentiel plutôt que « tout supprimer puis tout réinsérer » : ça évite de
// laisser la question sans brique si l'insertion échoue après la suppression.
async function syncQuestionBricks(questionId: string, brickIds: string[]): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { data: existingRows, error: readError } = await supabase
    .from('exam_question_bricks')
    .select('brick_id')
    .eq('question_id', questionId);
  if (readError) throw new Error(readError.message);

  const existing = new Set((existingRows ?? []).map((r) => r.brick_id as string));
  const wanted = new Set(brickIds);

  const toAdd = [...wanted].filter((id) => !existing.has(id));
  const toRemove = [...existing].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('exam_question_bricks')
      .insert(toAdd.map((brickId) => ({ question_id: questionId, brick_id: brickId })));
    if (error) throw new Error(error.message);
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('exam_question_bricks')
      .delete()
      .eq('question_id', questionId)
      .in('brick_id', toRemove);
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
    supabase.from('exam_questions').select('*').eq('workshop_id', workshopId).eq('context', 'exam').order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
    supabase.from('exam_generated').select('id, title, date, q, dur, avg, status, taken, question_ids, config').eq('workshop_id', workshopId).order('created_at', { ascending: false }),
  ]);

  const bankRows = (questionsRes.data ?? []) as QuestionRow[];
  const bankLinks = await loadBrickLinks(bankRows.map((r) => r.id));
  const questions = bankRows.map((row) => rowToQuestion(row, bankLinks[row.id] ?? []));
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

  // Après l'upsert seulement : la FK de `exam_question_bricks` exige que la
  // question existe déjà pour une création.
  await syncQuestionBricks(question.id, question.brickIds ?? []);
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
    supabase.from('exam_questions').select('*').eq('workshop_id', workshopId).eq('context', 'parcours').order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
  ]);

  const rows = (questionsRes.data ?? []) as QuestionRow[];
  const links = await loadBrickLinks(rows.map((r) => r.id));

  return {
    questions: rows.map((row) => rowToQuestion(row, links[row.id] ?? [])),
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

function toPrompt(q: Question): ExercisePrompt {
  const choices: ExerciseChoice[] = (q.choices ?? []).map((text, index) => ({ index, text }));
  return {
    id: q.id,
    title: q.title,
    content: q.content,
    questionType: q.questionType,
    responseType: q.responseType,
    choices: q.shuffleChoices ? shuffled(choices) : choices,
    textLines: q.textLines ?? 4,
  };
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
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('id', picked)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) return null;

  return toPrompt(rowToQuestion(row as QuestionRow));
}

function sameChoiceSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

export async function gradeParcoursAnswer(
  workshopId: string,
  questionId: string,
  selectedChoices: number[]
): Promise<ExerciseResult | null> {
  const supabase = getSupabaseServerClient();

  const { data: row, error } = await supabase
    .from('exam_questions')
    .select('*')
    .eq('workshop_id', workshopId)
    .eq('context', 'parcours')
    .eq('id', questionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;

  const q = rowToQuestion(row as QuestionRow);
  const autoGradable = q.responseType === 'qcs' || q.responseType === 'qcm';

  return {
    // Réponse libre, dessin, audio… : pas de correction automatique possible,
    // on affiche seulement la réponse attendue (`correct: null`).
    correct: autoGradable ? sameChoiceSet(selectedChoices, q.correctChoices ?? []) : null,
    answer: q.answer ?? '',
    correctChoices: q.correctChoices ?? [],
  };
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questions.map((q) => questionToRow(workshopId, q)));
  if (error) throw new Error(error.message);
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
