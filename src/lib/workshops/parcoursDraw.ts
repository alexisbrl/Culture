// Choix de la prochaine question d'un exercice du parcours — règles pures, sans
// base ni réseau. Le module qui va chercher les données et pose la question est
// `exam.ts` (`drawParcoursQuestion`) ; ici, on ne fait que trancher entre des
// candidats déjà chargés. Lexique : notion (produit, code) = brick (base), voir
// CLAUDE.md §1.
//
// ── Les trois règles du tirage (arrêtées avec le produit le 29/08/2026) ──────
//
// 1. **Un exercice vaut 12 niveaux de Bloom**, pas 12 questions. Un énoncé coûte
//    ce qu'il demande de plus exigeant (le plus haut niveau parmi SES notions) ;
//    une grappe coûte la SOMME de ses énoncés, parce que c'est bien tout ça que
//    le membre a à traiter. D'où : douze énoncés « mémoriser », ou un « analyser »
//    + deux « appliquer » + deux « mémoriser », etc.
//
// 2. **On ne propose jamais plus de deux niveaux au-dessus de ce qui est
//    atteint.** Un membre qui a atteint le niveau N sur une notion travaille le
//    niveau N+1 ; on accepte donc jusqu'à N+2 — un cran d'avance, pas deux. La
//    règle vaut pour CHAQUE notion de CHAQUE énoncé de la grappe : une seule
//    notion hors de portée écarte toute la grappe, qui se pose d'un bloc.
//
// 3. **Priorité à la notion la moins maîtrisée.** À portée égale, on pose ce qui
//    fait travailler le point le plus faible du chapitre ; on tire au hasard
//    entre les candidats ex æquo, sans quoi le même enchaînement reviendrait à
//    chaque exercice.
//
// Une question déjà RÉPONDUE par ce membre n'est plus tirée. Une question vue
// puis abandonnée, en revanche, reste disponible (règle révisée le 29/08/2026,
// voir docs/migrations/2026-08-28-questions-deja-posees.sql).

import { DEFAULT_BLOOM_LEVEL, EXERCISE_BLOOM_BUDGET, type BloomLevel } from './examTypes';
import { masteryLevel, MASTERY_MAX } from './mastery';

export { EXERCISE_BLOOM_BUDGET };

/** Combien de niveaux au-dessus du niveau atteint une question peut demander. */
export const BLOOM_REACH = 2;

/** Un énoncé, réduit à ce dont le tirage a besoin : ce qu'il demande de chacune
 *  de ses notions. Un énoncé sans notion garde un coût (il se traite quand
 *  même) mais ne restreint la portée d'aucune. */
export type DrawStatement = { notionBloom: Record<string, BloomLevel> };

/** Une grappe candidate : sa question principale et ses questions liées. */
export type DrawCandidate = { groupId: string; statements: DrawStatement[] };

export type DrawContext = {
  /** Score de maîtrise (0 à 40) par notion. Une notion absente vaut 0. */
  scores: Record<string, number>;
  /** Grappes déjà répondues par ce membre, ou déjà posées dans cet exercice. */
  seen: ReadonlySet<string>;
  /** Niveaux de Bloom qu'il reste à consommer dans l'exercice en cours. */
  remaining: number;
};

/** Pourquoi le tirage n'a rien rendu :
 *  - `budget` : il reste des questions, mais aucune n'entre dans ce qui reste de
 *    l'exercice. Fin normale.
 *  - `exhausted` : plus aucune question inédite et à portée dans le chapitre.
 *    Anomalie — la recharge automatique est censée l'empêcher. */
export type DrawFailure = 'budget' | 'exhausted';

export type DrawOutcome =
  | { candidate: DrawCandidate; cost: number; failure: null }
  | { candidate: null; cost: 0; failure: DrawFailure };

/** Ce qu'un énoncé coûte : le plus haut niveau qu'il demande. Sans notion, il
 *  vaut le niveau par défaut — il occupe le membre, il ne peut pas être gratuit. */
export function statementCost(statement: DrawStatement): number {
  const levels = Object.values(statement.notionBloom);
  return levels.length === 0 ? DEFAULT_BLOOM_LEVEL : Math.max(...levels);
}

/** Ce qu'une grappe coûte dans les 12 niveaux : la somme de ses énoncés. */
export function candidateCost(candidate: DrawCandidate): number {
  return candidate.statements.reduce((sum, statement) => sum + statementCost(statement), 0);
}

/** Le niveau le plus élevé qu'on accepte de demander d'une notion, au vu du
 *  score atteint dessus. */
export function reachableBloom(score: number): number {
  return masteryLevel(score) + BLOOM_REACH;
}

/** Toutes les notions de tous les énoncés sont-elles à portée ? */
export function isReachable(candidate: DrawCandidate, scores: Record<string, number>): boolean {
  return candidate.statements.every((statement) =>
    Object.entries(statement.notionBloom).every(
      ([notionId, level]) => level <= reachableBloom(scores[notionId] ?? 0)
    )
  );
}

/** Score de la notion la MOINS maîtrisée que la grappe fait travailler — c'est
 *  lui qui décide de la priorité. Une grappe sans aucune notion passe en
 *  dernier : elle ne fait progresser personne. */
function weakestScore(candidate: DrawCandidate, scores: Record<string, number>): number {
  const all = candidate.statements.flatMap((statement) => Object.keys(statement.notionBloom));
  if (all.length === 0) return MASTERY_MAX;
  return Math.min(...all.map((notionId) => scores[notionId] ?? 0));
}

/**
 * La prochaine question de l'exercice, ou la raison qui fait qu'il n'y en a pas.
 *
 * `random` est injectable pour que les règles se testent sans hasard — le tirage
 * réel garde `Math.random`.
 */
export function selectCandidate(
  candidates: DrawCandidate[],
  ctx: DrawContext,
  random: () => number = Math.random
): DrawOutcome {
  const fresh = candidates.filter((c) => !ctx.seen.has(c.groupId) && isReachable(c, ctx.scores));
  if (fresh.length === 0) return { candidate: null, cost: 0, failure: 'exhausted' };

  const affordable = fresh.filter((c) => candidateCost(c) <= ctx.remaining);
  if (affordable.length === 0) return { candidate: null, cost: 0, failure: 'budget' };

  const weakest = Math.min(...affordable.map((c) => weakestScore(c, ctx.scores)));
  const tier = affordable.filter((c) => weakestScore(c, ctx.scores) === weakest);
  const picked = tier[Math.min(tier.length - 1, Math.floor(random() * tier.length))];

  return { candidate: picked, cost: candidateCost(picked), failure: null };
}
