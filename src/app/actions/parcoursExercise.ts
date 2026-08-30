'use server';

import { requireMember } from '@/lib/authz';
import * as examLib from '@/lib/workshops/exam';
import { rewardAnsweredQuestion } from '@/lib/workshops/mastery';
import { paceVerdict, sanitizeAnswerMs, PACE_WINDOW } from '@/lib/workshops/answerPace';
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
  /** Ce que la GRAPPE consomme du budget de l'exercice — réservé d'un bloc au
   *  tirage, pour ne pas dépasser en cours de route. */
  cost: number;
  /** Ce que coûte chaque énoncé, dans l'ordre. La barre avance question par
   *  question, chacune comptant pour elle-même. */
  costs: number[];
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
    if (!ctx) return { prompt: null, cost: 0, costs: [], failure: null, error: 'Accès refusé' };

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
      return { prompt: null, cost: 0, costs: [], failure: 'blocked', blockedUntil: verdict.until };
    }

    const drawn = await examLib.drawParcoursQuestion(workshopId, chapterId, ctx.userId, {
      remaining: budget,
      excludeIds: excludes,
    });

    return drawn;
  } catch (err) {
    console.error('drawExercise error:', err);
    return { prompt: null, cost: 0, costs: [], failure: null, error: 'Erreur lors du tirage' };
  }
}

// ─── Une grappe se corrige énoncé par énoncé (30/08/2026) ───────────────────
//
// `index` est l'énoncé qu'on vient de valider (0 = la question principale,
// `i + 1` = la question liée `i`), et c'est le SEUL corrigé : les suivants ne
// sont pas encore posés.
//
// **Une question liée est une question entière.** Les questions d'une grappe
// sont inséparables — elles se tirent et se posent ensemble —, mais chacune
// compte pour elle-même : sa maîtrise, sa goutte, sa part du budget de Bloom,
// son XP le jour où il existera, et sa propre mesure de rythme (trois fautes
// expédiées, ce sont trois QUESTIONS bâclées, pas trois grappes). Tout ce qui
// suit se fait donc à chaque énoncé.
//
// La seule chose qui reste à l'échelle de la grappe est la **trace en base** :
// elle dit « cette grappe a été posée » et le tirage l'exclut en entier, ses
// questions étant inséparables. Elle s'écrit dès le PREMIER énoncé validé — sa
// réponse est dévoilée, la grappe est consommée, même si le membre s'arrête là.
//
// Une réponse ne se limite plus aux cases cochées depuis le 25/08/2026 : elle
// porte aussi les lignes d'une liste, les cases d'une grille et les paires
// reliées, qui sont désormais corrigées (voir `gradeStatement`).
export async function gradeExercise(
  workshopId: string,
  questionId: string,
  answers: ExerciseAnswer[],
  index: number,
  answerMs?: number
): Promise<{ result: ExerciseResult | null; isLast?: boolean; tooFast?: boolean; error?: string }> {
  try {
    const ctx = await requireMember(workshopId);
    if (!ctx) return { result: null, error: 'Accès refusé' };

    const graded = await examLib.gradeParcoursAnswer(workshopId, questionId, answers, index);
    if (!graded) return { result: null };

    // Seule une bonne réponse vérifiée par le serveur fait progresser. Les
    // types sans correction automatique (réponse rédigée, dessin, dépôt de
    // fichier) ont `correct: null` : rien ne prouve la maîtrise, le score reste
    // inchangé.
    // `rewards` ne porte que les notions de l'énoncé corrigé, avec leur niveau
    // de Bloom lu en base — jamais ce que le client prétend.
    const changes = await Promise.all(
      graded.rewards.map((target) => rewardAnsweredQuestion(workshopId, ctx.userId, target)),
    );
    if (changes.some(Boolean)) revalidateWorkshop();

    // C'EST ICI que la question sort du tirage, et pas au moment où elle est
    // posée (règle du 29/08/2026) : une question affichée puis abandonnée n'a
    // rien mesuré, elle reste disponible. Répondue, en revanche, elle est
    // consommée — juste ou fausse.
    //
    // Le temps de réponse vient de l'écran : le serveur ne peut pas le mesurer
    // depuis que les questions sont tirées d'avance (voir
    // docs/migrations/2026-08-29-rythme-de-reponse.sql). Il est mesuré depuis
    // l'affichage de CETTE question, remis à zéro à chaque énoncé découvert.
    await examLib.markParcoursAsked(workshopId, ctx.userId, questionId, {
      answerMs: sanitizeAnswerMs(answerMs),
      correct: graded.result.correct,
    });

    // Trois fautes expédiées d'affilée : on le dit, avec la correction. Deux de
    // plus et c'est le TIRAGE qui refusera (voir `drawExercise`) — la mise en
    // pause n'a pas à interrompre une correction déjà calculée.
    const verdict = paceVerdict(await examLib.recentAnswerPace(workshopId, ctx.userId, PACE_WINDOW));

    return { result: graded.result, isLast: graded.isLast, tooFast: verdict.state === 'warn' };
  } catch (err) {
    console.error('gradeExercise error:', err);
    return { result: null, error: 'Erreur lors de la correction' };
  }
}
