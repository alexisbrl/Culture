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
import type { Question, QuestionContext, QuestionPart, ExamConfig, ExamPool, GeneratedExam, ExamDraft } from '@/lib/workshops/examTypes';

type QuestionRow = {
  id: string;
  workshop_id: string;
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

function rowToQuestion(row: QuestionRow): Question {
  return {
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
  };
}

// `context` distingue les questions de la banque d'examen de celles du parcours
// pédagogique (colonne `exam_questions.context`, 'exam' | 'parcours'). Il n'est
// inclus dans la ligne QUE s'il est fourni : sur un `upsert` de mise à jour,
// une colonne absente du payload garde sa valeur — c'est ce qui permet aux
// ré-écritures de masse (nettoyage de pool, suppression) de ne pas requalifier
// silencieusement une question de parcours en question d'examen.
function questionToRow(workshopId: string, q: Question, context?: QuestionContext) {
  return {
    ...(context ? { context } : {}),
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

export async function getExamBankData(workshopId: string): Promise<{
  questions: Question[];
  pools: ExamPool[];
  exams: GeneratedExam[];
}> {
  const supabase = getSupabaseServerClient();

  const [questionsRes, poolsRes, examsRes] = await Promise.all([
    // Uniquement la banque d'examen : les questions du parcours pédagogique
    // vivent dans la même table, distinguées par `context`.
    supabase.from('exam_questions').select('*').eq('workshop_id', workshopId).eq('context', 'exam').order('created_at', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
    supabase.from('exam_generated').select('id, title, date, q, dur, avg, status, taken, question_ids, config').eq('workshop_id', workshopId).order('created_at', { ascending: false }),
  ]);

  const questions = (questionsRes.data ?? []).map(rowToQuestion);
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
    supabase.from('exam_questions').select('*').eq('workshop_id', workshopId).eq('context', 'parcours').order('created_at', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
  ]);

  return {
    questions: (questionsRes.data ?? []).map(rowToQuestion),
    pools: (poolsRes.data ?? []) as ExamPool[],
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
