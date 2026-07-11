'use server';

import { assertManager, requireManager } from '@/lib/authz';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as examLib from '@/lib/workshops/exam';
// Types de domaine (audit §5.3) : voir @/lib/workshops/examTypes — plus de
// dépendance vers des composants UI (QuestionEditor.tsx/ExamenTab.tsx).
// Redéclarés en alias locaux (un fichier `'use server'` ne peut pas réexporter
// un type importé, cf. @/app/actions/workshops pour le détail du piège Turbopack).
import type {
  Question, ExamPool as ExamPoolType, GeneratedExam as GeneratedExamType, ExamDraft as ExamDraftType,
} from '@/lib/workshops/examTypes';

export type ExamPool = ExamPoolType;
export type GeneratedExam = GeneratedExamType;
export type ExamDraft = ExamDraftType;

// ⚠️ SÉCURITÉ — Le générateur d'examen est réservé aux gestionnaires (CLAUDE.md §14),
// et la banque contient les RÉPONSES : aucune de ces actions ne doit être accessible
// à un candidat ni à un non-membre. Chaque action vérifie donc le rôle côté serveur
// via `requireManager`/`assertManager` (cf. src/lib/authz.ts) — ne jamais se fier au
// fait que l'onglet est masqué côté client. Logique métier : voir @/lib/workshops/exam.

export async function getExamBankData(workshopId: string): Promise<{
  questions: Question[];
  pools: ExamPool[];
  exams: GeneratedExam[];
}> {
  // Lecture réservée aux gestionnaires (la banque contient les réponses).
  if (!(await requireManager(workshopId))) {
    return { questions: [], pools: [], exams: [] };
  }
  return await examLib.getExamBankData(workshopId);
}

export async function saveQuestion(workshopId: string, question: Question): Promise<void> {
  await assertManager(workshopId);
  await examLib.saveQuestion(workshopId, question);
  revalidateWorkshop();
}

export async function saveQuestions(workshopId: string, questions: Question[]): Promise<void> {
  if (questions.length === 0) return;
  await assertManager(workshopId);
  await examLib.saveQuestions(workshopId, questions);
  revalidateWorkshop();
}

export async function createPool(workshopId: string, pool: ExamPool): Promise<void> {
  await assertManager(workshopId);
  await examLib.createPool(workshopId, pool);
  revalidateWorkshop();
}

export async function updatePool(workshopId: string, pool: ExamPool): Promise<void> {
  await assertManager(workshopId);
  await examLib.updatePool(workshopId, pool);
  revalidateWorkshop();
}

export async function deletePool(workshopId: string, poolId: string, affectedQuestions: Question[]): Promise<void> {
  await assertManager(workshopId);
  await examLib.deletePool(workshopId, poolId, affectedQuestions);
  revalidateWorkshop();
}

export async function deleteQuestion(workshopId: string, questionId: string, affectedQuestions: Question[]): Promise<void> {
  await assertManager(workshopId);
  await examLib.deleteQuestion(workshopId, questionId, affectedQuestions);
  revalidateWorkshop();
}

export async function saveGeneratedExam(workshopId: string, exam: GeneratedExam): Promise<void> {
  await assertManager(workshopId);
  await examLib.saveGeneratedExam(workshopId, exam);
  revalidateWorkshop();
}

export async function getExamDraft(workshopId: string): Promise<ExamDraft | null> {
  if (!(await requireManager(workshopId))) return null;
  return await examLib.getExamDraft(workshopId);
}

export async function deleteGeneratedExam(workshopId: string, examId: string): Promise<void> {
  await assertManager(workshopId);
  await examLib.deleteGeneratedExam(workshopId, examId);
  revalidateWorkshop();
}

export async function saveExamDraft(workshopId: string, draft: ExamDraft): Promise<void> {
  await assertManager(workshopId);
  await examLib.saveExamDraft(workshopId, draft);
}
