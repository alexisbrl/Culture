'use server';

import { getSupabaseServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import type { Question } from '@/app/[locale]/workshops/[id]/tabs/QuestionEditor';

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
};

type QuestionRow = {
  id: string;
  workshop_id: string;
  question_type: string;
  response_type: string;
  content: string;
  answer: string;
  choices: string[];
  correct_choices: number[];
  pools: string[];
  difficulty: { enabled: boolean; value: number };
  duration: { enabled: boolean; minutes: number };
  linked_question_ids: string[];
  exam_ids: string[];
};

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    questionType: row.question_type as Question['questionType'],
    responseType: row.response_type as Question['responseType'],
    content: row.content,
    answer: row.answer,
    choices: row.choices ?? [],
    correctChoices: row.correct_choices ?? [],
    pools: row.pools ?? [],
    difficulty: row.difficulty ?? { enabled: false, value: 5 },
    duration: row.duration ?? { enabled: false, minutes: 2 },
    linkedQuestionIds: row.linked_question_ids ?? [],
    examIds: row.exam_ids ?? [],
  };
}

function questionToRow(workshopId: string, q: Question) {
  return {
    id: q.id,
    workshop_id: workshopId,
    question_type: q.questionType,
    response_type: q.responseType,
    content: q.content,
    answer: q.answer,
    choices: q.choices,
    correct_choices: q.correctChoices,
    pools: q.pools,
    difficulty: q.difficulty,
    duration: q.duration,
    linked_question_ids: q.linkedQuestionIds,
    exam_ids: q.examIds,
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
    supabase.from('exam_questions').select('*').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
    supabase.from('exam_pools').select('id, name, color').eq('workshop_id', workshopId).order('created_at', { ascending: true }),
    supabase.from('exam_generated').select('id, title, date, q, dur, avg, status, taken, question_ids').eq('workshop_id', workshopId).order('created_at', { ascending: false }),
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
  })) as GeneratedExam[];

  return { questions, pools, exams };
}

export async function saveQuestion(workshopId: string, question: Question): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questionToRow(workshopId, question));
  if (error) throw new Error(error.message);
  revalidatePath(`/workshops/${workshopId}`, 'page');
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_questions').upsert(questions.map((q) => questionToRow(workshopId, q)));
  if (error) throw new Error(error.message);
  revalidatePath(`/workshops/${workshopId}`, 'page');
}

export async function createPool(workshopId: string, pool: ExamPool): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('exam_pools').insert({ id: pool.id, workshop_id: workshopId, name: pool.name, color: pool.color });
  if (error) throw new Error(error.message);
  revalidatePath(`/workshops/${workshopId}`, 'page');
}

export async function deletePool(workshopId: string, poolId: string, affectedQuestions: Question[]): Promise<void> {
  const supabase = getSupabaseServerClient();

  if (affectedQuestions.length > 0) {
    const { error: updateError } = await supabase.from('exam_questions').upsert(affectedQuestions.map((q) => questionToRow(workshopId, q)));
    if (updateError) throw new Error(updateError.message);
  }

  const { error } = await supabase.from('exam_pools').delete().eq('workshop_id', workshopId).eq('id', poolId);
  if (error) throw new Error(error.message);
  revalidatePath(`/workshops/${workshopId}`, 'page');
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
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/workshops/${workshopId}`, 'page');
}
