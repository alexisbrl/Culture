'use server';

import { getSupabaseServerClient } from '@/lib/supabase';
import { assertManager, requireManager } from '@/lib/authz';
import { revalidateWorkshop } from '@/lib/revalidate';
import type { Question, QuestionPart } from '@/app/[locale]/workshops/[id]/tabs/QuestionEditor';
import type { ExamConfig } from '@/app/[locale]/workshops/[id]/tabs/ExamenTab';

// ⚠️ SÉCURITÉ — Le générateur d'examen est réservé aux gestionnaires (CLAUDE.md §14),
// et la banque contient les RÉPONSES : aucune de ces actions ne doit être accessible
// à un candidat ni à un non-membre. Chaque action vérifie donc le rôle côté serveur
// via `requireManager`/`assertManager` (cf. src/lib/authz.ts) — ne jamais se fier au
// fait que l'onglet est masqué côté client.

export type ExamPool = { id: string; name: string; color: string };

export type GeneratedExam = {
  id: string;
  title: string;
  date: string;
  q: number;
  dur: string;
  avg: string;
  status: string;
  taken: number;
  questionIds?: string[];
  config?: ExamConfig;
};

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

function questionToRow(workshopId: string, q: Question) {
  return {
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
  // Lecture réservée aux gestionnaires (la banque contient les réponses).
  if (!(await requireManager(workshopId))) {
    return { questions: [], pools: [], exams: [] };
  }

  const supabase = getSupabaseServerClient();

  const [questionsRes, poolsRes, examsRes] = await Promise.all([
    supabase.from('exam_questions').select('*').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
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

export async function saveQuestion(workshopId: string, question: Question): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questionToRow(workshopId, question));
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questions.map((q) => questionToRow(workshopId, q)));
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function createPool(workshopId: string, pool: ExamPool): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_pools').insert({ id: pool.id, workshop_id: workshopId, name: pool.name, color: pool.color });
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function updatePool(workshopId: string, pool: ExamPool): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_pools').update({ name: pool.name, color: pool.color }).eq('workshop_id', workshopId).eq('id', pool.id);
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function deletePool(workshopId: string, poolId: string, affectedQuestions: Question[]): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();

  if (affectedQuestions.length > 0) {
    const { error: updateError } = await supabase.from('exam_questions').upsert(affectedQuestions.map((q) => questionToRow(workshopId, q)));
    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase.from('exam_pools').delete().eq('workshop_id', workshopId).eq('id', poolId);
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function deleteQuestion(workshopId: string, questionId: string, affectedQuestions: Question[]): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();

  if (affectedQuestions.length > 0) {
    const { error: updateError } = await supabase.from('exam_questions').upsert(affectedQuestions.map((q) => questionToRow(workshopId, q)));
    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase.from('exam_questions').delete().eq('workshop_id', workshopId).eq('id', questionId);
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function saveGeneratedExam(workshopId: string, exam: GeneratedExam): Promise<void> {
  await assertManager(workshopId);
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
  revalidateWorkshop();
}

export type ExamDraft = { draftIds: string[]; config: ExamConfig; editingId: string | null };

export async function getExamDraft(workshopId: string): Promise<ExamDraft | null> {
  if (!(await requireManager(workshopId))) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('exam_draft').select('draft_ids, config, editing_id').eq('workshop_id', workshopId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { draftIds: data.draft_ids ?? [], config: data.config as ExamConfig, editingId: data.editing_id ?? null };
}

export async function deleteGeneratedExam(workshopId: string, examId: string): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_generated').delete().eq('workshop_id', workshopId).eq('id', examId);
  if (error) throw new Error(error.message);
  revalidateWorkshop();
}

export async function saveExamDraft(workshopId: string, draft: ExamDraft): Promise<void> {
  await assertManager(workshopId);
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_draft').upsert({
    workshop_id: workshopId,
    draft_ids: draft.draftIds,
    config: draft.config,
    editing_id: draft.editingId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
