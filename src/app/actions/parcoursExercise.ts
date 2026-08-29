'use server';

import { requireMember } from '@/lib/authz';
import * as examLib from '@/lib/workshops/exam';
import { rewardAnsweredQuestion } from '@/lib/workshops/mastery';
import { paceVerdict, sanitizeAnswerMs, PACE_WINDOW } from '@/lib/workshops/answerPace';
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
   *  `budget` (fin normale), `exhausted` (plus rien d'inédit à portée),
   *  `empty` (le chapitre n'a aucune question) ou `blocked` (l'exercice est
   *  en pause après une série de fautes expédiées). */
  failure: 'budget' | 'exhausted' | 'empty' | 'blocked' | null;
  /** Pour `blocked` : date à laquelle l'exercice repart (epoch, ms). */
  blockedUntil?: number;
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

    // ─── La pause, avant tout le reste ─────────────────────────────────────
    //
    // Cinq fautes expédiées d'affilée mettent l'exercice en pause : on refuse
    // la question suivante plutôt que de la brûler. La pause ne se stocke pas,
    // elle se déduit de la date de la dernière réponse (voir
    // @/lib/workshops/answerPace) — rien à écrire, rien à nettoyer.
    const verdict = paceVerdict(await examLib.recentAnswerPace(workshopId, ctx.userId, PACE_WINDOW));
    if (verdict.state === 'blocked') {
      return { prompt: null, cost: 0, failure: 'blocked', blockedUntil: verdict.until };
    }

    const drawn = await examLib.drawParcoursQuestion(workshopId, chapterId, ctx.userId, {
      remaining: budget,
      excludeIds: excludes,
    });

    return drawn;
  } catch (err) {
    console.error('drawExercise error:', err);
    return { prompt: null, cost: 0, failure: null, error: 'Erreur lors du tirage' };
  }
}

/** La recharge automatique du chapitre — **appelée par l'écran, sans être
 *  attendue**, une fois la première question affichée.
 *
 *  ⚠️ **Elle était accrochée au tirage (`after`), et c'était une erreur**
 *  (29/08/2026). L'intention était bonne : lancer la génération une fois la
 *  réponse envoyée, pour que personne n'attende. Mais `after` ne détache la
 *  tâche que là où l'hébergeur sait le faire ; en développement, la réponse du
 *  tirage attendait la fin de la recharge — **deux minutes de « tirage d'une
 *  question… » avant la première question**, mesuré sur un chapitre qui avait un
 *  vrai manque à combler. Et même là où `after` détache, une génération de deux
 *  minutes reste comptée dans la durée de la fonction serveur.
 *
 *  Un appel à part règle les deux : le tirage répond en quelques dizaines de
 *  millisecondes, la recharge vit dans sa propre requête, et l'écran ne
 *  l'attend jamais.
 *
 *  Ne renvoie rien : ce qu'elle produit servira au PROCHAIN exercice, pas à
 *  celui qui commence. Ses garde-fous — plafond de 60 questions, délai de garde
 *  de 10 minutes par chapitre, lot tracé et annulable — sont dans
 *  @/lib/ingest/refill, et c'est là qu'ils doivent rester : l'écran n'est qu'un
 *  déclencheur, pas une autorité.
 *
 *  Contrepartie assumée, la même que pour l'import interactif : si l'onglet se
 *  ferme pendant, la recharge s'arrête là où elle en est. Ce qu'elle a écrit
 *  reste, et le prochain lancement d'exercice reprendra le manque. */
export async function refillExerciseChapter(workshopId: string, chapterId: string): Promise<void> {
  const ctx = await requireMember(workshopId);
  if (!ctx) return;
  await refillChapter(workshopId, chapterId, ctx.userId);
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

    // Trois fautes expédiées d'affilée : on le dit, avec la correction. Deux de
    // plus et c'est le TIRAGE qui refusera (voir `drawExercise`) — la mise en
    // pause n'a pas à interrompre une correction déjà calculée.
    const verdict = paceVerdict(await examLib.recentAnswerPace(workshopId, ctx.userId, PACE_WINDOW));

    return { result: graded.result, tooFast: verdict.state === 'warn' };
  } catch (err) {
    console.error('gradeExercise error:', err);
    return { result: null, error: 'Erreur lors de la correction' };
  }
}
