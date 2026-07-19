'use server';

import { requireMember } from '@/lib/authz';
import * as examLib from '@/lib/workshops/exam';
import type { ExercisePrompt, ExerciseResult } from '@/lib/workshops/examTypes';

// Côté candidat du parcours pédagogique : lancer un exercice depuis un pot de
// l'onglet Programme tire une question au hasard parmi celles du chapitre.
//
// ⚠️ SÉCURITÉ — Ouvert à tout membre, contrairement à la GESTION des questions
// (app/actions/parcoursQuestions.ts, réservée aux gestionnaires). D'où le refus
// de renvoyer un `Question` complet : `drawExercise` renvoie un `ExercisePrompt`
// qui ne contient ni `answer` ni `correctChoices`, et la correction est calculée
// côté serveur. Détail du modèle dans @/lib/workshops/exam.
//
// Pas de revalidation : ces deux actions ne mutent rien.

export async function drawExercise(
  workshopId: string,
  chapterId: string,
  excludeId?: string
): Promise<{ prompt: ExercisePrompt | null; error?: string }> {
  try {
    if (!(await requireMember(workshopId))) return { prompt: null, error: 'Accès refusé' };
    return { prompt: await examLib.drawParcoursQuestion(workshopId, chapterId, excludeId) };
  } catch (err) {
    console.error('drawExercise error:', err);
    return { prompt: null, error: 'Erreur lors du tirage' };
  }
}

export async function gradeExercise(
  workshopId: string,
  questionId: string,
  selectedChoices: number[]
): Promise<{ result: ExerciseResult | null; error?: string }> {
  try {
    if (!(await requireMember(workshopId))) return { result: null, error: 'Accès refusé' };
    return { result: await examLib.gradeParcoursAnswer(workshopId, questionId, selectedChoices) };
  } catch (err) {
    console.error('gradeExercise error:', err);
    return { result: null, error: 'Erreur lors de la correction' };
  }
}
