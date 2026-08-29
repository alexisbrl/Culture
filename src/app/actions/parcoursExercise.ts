'use server';

import { after } from 'next/server';

import { requireMember } from '@/lib/authz';
import * as examLib from '@/lib/workshops/exam';
import { rewardAnsweredQuestion } from '@/lib/workshops/mastery';
import { looksRandom, sanitizeAnswerMs, PACE_WINDOW } from '@/lib/workshops/answerPace';
import { refillChapter } from '@/lib/ingest/refill';
import { revalidateWorkshop } from '@/lib/revalidate';
import { EXERCISE_BLOOM_BUDGET } from '@/lib/workshops/examTypes';
import type { ExerciseAnswer, ExercisePrompt, ExerciseResult } from '@/lib/workshops/examTypes';

// Côté candidat du parcours pédagogique : lancer un exercice depuis un pot de
// l'onglet Programme enchaîne des questions choisies pour CE membre, jusqu'à
// épuisement du budget de l'exercice (12 niveaux de Bloom).
//
// ⚠️ SÉCURITÉ — Ouvert à tout membre, contrairement à la GESTION des questions
// (app/actions/parcoursQuestions.ts, réservée aux gestionnaires). D'où le refus
// de renvoyer un `Question` complet : `drawExercise` renvoie un `ExercisePrompt`
// qui ne contient ni `answer` ni `correctChoices`, et la correction est calculée
// côté serveur. Détail du modèle dans @/lib/workshops/exam.
//
// L'identité du membre vient de `requireMember`, jamais d'un paramètre : le
// tirage dépend de SA maîtrise et de ce qu'il a déjà répondu, et une server
// action est une URL POST publique.
//
// `drawExercise` ne mute rien. `gradeExercise`, si : une bonne réponse crédite
// les notions reliées à la question (voir @/lib/workshops/mastery), et toute
// réponse — juste ou fausse — retire la question du tirage à venir.

// Type redéclaré localement : un fichier `'use server'` ne peut pas réexporter
// un type importé (piège Turbopack, cf. .claude/rules/server-architecture.md).
export type DrawnExercise = {
  prompt: ExercisePrompt | null;
  /** Ce que la question consomme du budget de l'exercice. */
  cost: number;
  /** `null` quand une question a été tirée ; sinon la raison de l'arrêt —
   *  `budget` (fin normale), `exhausted` (plus rien d'inédit à portée) ou
   *  `empty` (le chapitre n'a aucune question). */
  failure: 'budget' | 'exhausted' | 'empty' | null;
  error?: string;
};

/** `remaining` = niveaux de Bloom qu'il reste à consommer dans l'exercice en
 *  cours ; `excludeIds` = grappes déjà posées dans cet exercice, dont la
 *  correction n'a pas forcément abouti. */
export async function drawExercise(
  workshopId: string,
  chapterId: string,
  remaining: number,
  excludeIds?: string[]
): Promise<DrawnExercise> {
  try {
    const ctx = await requireMember(workshopId);
    if (!ctx) return { prompt: null, cost: 0, failure: null, error: 'Accès refusé' };

    // Ce qui arrive du navigateur n'est jamais tenu pour bien formé : le budget
    // restant est borné ici, sinon un client bricolé s'offrirait un exercice sans
    // fin — et surtout des questions bien au-dessus de son niveau.
    const budget = Math.max(0, Math.min(Math.floor(Number(remaining) || 0), EXERCISE_BLOOM_BUDGET));
    const excludes = (Array.isArray(excludeIds) ? excludeIds : []).filter((id) => typeof id === 'string');

    const drawn = await examLib.drawParcoursQuestion(workshopId, chapterId, ctx.userId, {
      remaining: budget,
      excludeIds: excludes,
    });

    // ─── La recharge automatique part ICI ──────────────────────────────────
    //
    // Au LANCEMENT d'un exercice seulement (budget entier), et après que la
    // question est partie à l'écran :  exécute ce bloc une fois la
    // réponse envoyée, donc le membre n'attend jamais après une génération et
    // celle-ci survit à la fermeture de l'onglet.
    //
    // Rien n'est attendu ni renvoyé : ce que la recharge produit servira au
    // prochain exercice, pas à celui qui commence. Ses garde-fous (plafond,
    // délai de garde, trace) sont dans @/lib/ingest/refill.
    if (budget >= EXERCISE_BLOOM_BUDGET) {
      after(() => refillChapter(workshopId, chapterId, ctx.userId));
    }

    return drawn;
  } catch (err) {
    console.error('drawExercise error:', err);
    return { prompt: null, cost: 0, failure: null, error: 'Erreur lors du tirage' };
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
  answers: ExerciseAnswer[],
  answerMs?: number
): Promise<{ result: ExerciseResult | null; tooFast?: boolean; error?: string }> {
  try {
    const ctx = await requireMember(workshopId);
    if (!ctx) return { result: null, error: 'Accès refusé' };

    const graded = await examLib.gradeParcoursAnswer(workshopId, questionId, answers);
    if (!graded) return { result: null };

    // La grappe est réussie si aucun de ses énoncés n'est faux et qu'au moins un
    // a pu être corrigé automatiquement — même règle que la goutte affichée à
    // l'écran. `null` quand rien n'était corrigeable : ni réussi ni raté.
    const outcomes = [graded.result, ...(graded.result.parts ?? [])];
    const judged = outcomes.some((o) => o.correct !== null);
    const correct = judged ? outcomes.every((o) => o.correct !== false) : null;

    // C'EST ICI que la question sort du tirage, et pas au moment où elle est
    // posée (règle du 29/08/2026) : une question affichée puis abandonnée n'a
    // rien mesuré, elle reste disponible. Répondue, en revanche, elle est
    // consommée — juste ou fausse.
    //
    // Le temps de réponse vient de l'écran : le serveur ne peut pas le mesurer
    // depuis que les questions sont tirées d'avance (voir
    // docs/migrations/2026-08-29-rythme-de-reponse.sql).
    await examLib.markParcoursAsked(workshopId, ctx.userId, questionId, {
      answerMs: sanitizeAnswerMs(answerMs),
      correct,
    });

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

    // Avertissement, jamais sanction : cinq réponses d'affilée en moins de trois
    // secondes avec un résultat proche du hasard vident le chapitre pour rien.
    const tooFast = looksRandom(
      await examLib.recentAnswerPace(workshopId, ctx.userId, PACE_WINDOW)
    );

    return { result: graded.result, tooFast };
  } catch (err) {
    console.error('gradeExercise error:', err);
    return { result: null, error: 'Erreur lors de la correction' };
  }
}
