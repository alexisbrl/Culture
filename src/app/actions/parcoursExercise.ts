'use server';

import { requireMember } from '@/lib/authz';
import * as examLib from '@/lib/workshops/exam';
import { rewardAnsweredQuestion } from '@/lib/workshops/mastery';
import { revalidateWorkshop } from '@/lib/revalidate';
import type { ExerciseAnswer, ExercisePrompt, ExerciseResult } from '@/lib/workshops/examTypes';

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

// `answers[0]` = la réponse donnée à la question principale, `answers[i+1]` =
// celle de la question liée `i` (même ordre que `ExercisePrompt.parts`). Chaque
// énoncé est corrigé et crédite ses propres notions : une question liée juste
// fait progresser les siennes même si la principale est ratée.
//
// Une réponse ne se limite plus aux cases cochées depuis le 25/08/2026 : elle
// porte aussi les lignes d'une liste, les cases d'une grille et les paires
// reliées, qui sont désormais corrigées (voir `gradeOne` dans
// @/lib/workshops/exam).
export async function gradeExercise(
  workshopId: string,
  questionId: string,
  answers: ExerciseAnswer[]
): Promise<{ result: ExerciseResult | null; error?: string }> {
  try {
    const ctx = await requireMember(workshopId);
    if (!ctx) return { result: null, error: 'Accès refusé' };

    const graded = await examLib.gradeParcoursAnswer(workshopId, questionId, answers);
    if (!graded) return { result: null };

    // Seule une bonne réponse vérifiée par le serveur fait progresser. Les
    // types sans correction automatique (réponse rédigée, dessin, dépôt de
    // fichier) ont `correct: null` : rien ne prouve la maîtrise, le score reste
    // inchangé.
    // `rewards` ne contient que les énoncés justes, avec leurs notions et leur
    // niveau de Bloom lus en base — jamais ce que le client prétend.
    const changes = await Promise.all(
      graded.rewards.map((target) => rewardAnsweredQuestion(workshopId, ctx.userId, target)),
    );
    if (changes.some(Boolean)) revalidateWorkshop();

    return { result: graded.result };
  } catch (err) {
    console.error('gradeExercise error:', err);
    return { result: null, error: 'Erreur lors de la correction' };
  }
}
