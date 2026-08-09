'use server';

import { requireMember } from '@/lib/authz';
import * as examLib from '@/lib/workshops/exam';
import { rewardCorrectAnswer } from '@/lib/workshops/mastery';
import { revalidateWorkshop } from '@/lib/revalidate';
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
// `drawExercise` ne mute rien. `gradeExercise`, si, depuis le 06/08/2026 : une
// bonne réponse crédite les notions reliées à la question (voir
// @/lib/workshops/mastery), donc revalide l'atelier pour rafraîchir les barres
// de progression de l'onglet parcours.

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
    const ctx = await requireMember(workshopId);
    if (!ctx) return { result: null, error: 'Accès refusé' };

    const result = await examLib.gradeParcoursAnswer(workshopId, questionId, selectedChoices);

    // Seule une bonne réponse vérifiée par le serveur fait progresser. Les
    // types sans correction automatique (texte libre, dessin, audio…) ont
    // `correct: null` : rien ne prouve la maîtrise, le score reste inchangé.
    if (result?.correct === true) {
      const changed = await rewardCorrectAnswer(workshopId, ctx.userId, questionId);
      if (changed) revalidateWorkshop();
    }

    return { result };
  } catch (err) {
    console.error('gradeExercise error:', err);
    return { result: null, error: 'Erreur lors de la correction' };
  }
}
