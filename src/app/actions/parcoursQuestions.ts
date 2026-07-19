'use server';

import { assertManager, requireManager } from '@/lib/authz';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as examLib from '@/lib/workshops/exam';
import type { Question, ExamPool } from '@/lib/workshops/examTypes';

// ⚠️ SÉCURITÉ — Comme la banque d'examen, les questions du parcours contiennent
// les RÉPONSES : la gestion est réservée aux gestionnaires. Les candidats n'y
// accèdent que via l'écran de session, qui ne sert pas les réponses.
//
// Les questions du parcours partagent la table `exam_questions` avec la banque
// d'examen, distinguées par la colonne `context`. Logique métier :
// @/lib/workshops/exam.

export async function getParcoursQuestions(workshopId: string): Promise<{
  questions: Question[];
  pools: ExamPool[];
}> {
  if (!(await requireManager(workshopId))) return { questions: [], pools: [] };
  return await examLib.getParcoursData(workshopId);
}

export async function saveParcoursQuestion(workshopId: string, question: Question): Promise<{ success: boolean; error?: string }> {
  try {
    await assertManager(workshopId);
    // Contexte explicite : c'est lui qui range la question du bon côté.
    await examLib.saveQuestion(workshopId, question, 'parcours');
    revalidateWorkshop();
    return { success: true };
  } catch (err) {
    console.error('saveParcoursQuestion error:', err);
    return { success: false, error: 'Erreur lors de l\'enregistrement' };
  }
}

export async function deleteParcoursQuestion(workshopId: string, questionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await assertManager(workshopId);
    // Pas de questions affectées à réécrire : contrairement à la banque
    // d'examen, une question de parcours n'appartient à aucun examen généré.
    await examLib.deleteQuestion(workshopId, questionId, []);
    revalidateWorkshop();
    return { success: true };
  } catch (err) {
    console.error('deleteParcoursQuestion error:', err);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}

export async function createParcoursPool(workshopId: string, pool: ExamPool): Promise<{ success: boolean; error?: string }> {
  try {
    await assertManager(workshopId);
    await examLib.createPool(workshopId, pool);
    revalidateWorkshop();
    return { success: true };
  } catch (err) {
    console.error('createParcoursPool error:', err);
    return { success: false, error: 'Erreur lors de la création' };
  }
}
