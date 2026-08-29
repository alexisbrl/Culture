// Repérer un membre qui répond au hasard.
//
// ── Ce qu'on cherche, et ce qu'on ne cherche pas ────────────────────────────
//
// Pas la triche : un parcours d'entraînement montre la réponse dès qu'on valide,
// donc il n'y a rien à voler. Ce qui coûte, c'est le **gâchis de stock** — une
// question répondue est consommée, juste ou fausse, donc quelques minutes de
// clics au hasard vident un chapitre et déclenchent une recharge payante pour
// rien (arbitrage du 29/08/2026).
//
// La conséquence est un **avertissement**, jamais un blocage ni une sanction.
// C'est pourquoi il n'y a aucun problème à ce que le temps vienne de l'écran et
// soit donc falsifiable : quelqu'un qui prend la peine de fausser son chronomètre
// n'est plus quelqu'un qui se disperse, et ce n'est pas lui qu'on vise.
//
// ── La règle ────────────────────────────────────────────────────────────────
//
// Les CINQ dernières réponses, toutes en moins de trois secondes, avec un
// résultat proche du hasard. Les trois nombres comptent ensemble :
//
//   - moins de 3 s : personne ne lit un énoncé, pèse quatre propositions et
//     répond en trois secondes. Sur une seule question c'est une chance ; cinq
//     fois de suite, c'est une habitude ;
//   - cinq : moins, et une série de questions faciles suffirait à déclencher ;
//   - proche du hasard : au plus UNE bonne réponse sur les cinq. Un QCM à quatre
//     propositions rapporte une bonne réponse sur quatre en moyenne — quelqu'un
//     de rapide ET juste connaît son cours, on ne l'embête pas.
//
// Cas particulier assumé : quand aucune des cinq n'a pu être corrigée
// automatiquement (réponses rédigées, dessins), la vitesse suffit. Répondre à
// cinq questions ouvertes en moins de trois secondes chacune ne se fait pas de
// bonne foi.

/** Une réponse récente, telle qu'elle est retenue en base. */
export type AnswerPaceRow = {
  /** Millisecondes entre l'affichage et la validation. `null` = pas mesuré. */
  answerMs: number | null;
  /** Grappe réussie ? `null` = rien n'était corrigeable automatiquement. */
  correct: boolean | null;
};

/** Combien de réponses la règle regarde. */
export const PACE_WINDOW = 5;

/** En dessous de ce temps, une réponse n'a pas été réfléchie. */
export const PACE_MIN_MS = 3000;

/** Au-delà de ce nombre de bonnes réponses dans la fenêtre, ce n'est plus du
 *  hasard — c'est quelqu'un qui sait. */
export const PACE_MAX_CORRECT = 1;

/** Le temps rapporté par l'écran, ramené à quelque chose d'exploitable. Une
 *  valeur absurde (négative, ou plus longue qu'une heure) est traitée comme
 *  « pas mesuré » plutôt que comme une preuve : elle ne doit ni accuser ni
 *  disculper. */
export function sanitizeAnswerMs(value: unknown): number | null {
  const ms = Math.round(Number(value));
  if (!Number.isFinite(ms) || ms < 0 || ms > 3_600_000) return null;
  return ms;
}

/**
 * Ce membre répond-il au hasard ? `rows` porte ses dernières réponses, la plus
 * récente en tête.
 *
 * Renvoie `false` tant qu'on n'a pas la fenêtre entière : on n'avertit personne
 * sur trois réponses, et une réponse dont le temps n'a pas été mesuré (avant
 * cette fonctionnalité) interrompt la série au lieu de compter pour rapide.
 */
export function looksRandom(rows: AnswerPaceRow[]): boolean {
  const window = rows.slice(0, PACE_WINDOW);
  if (window.length < PACE_WINDOW) return false;

  const allFast = window.every((row) => row.answerMs !== null && row.answerMs < PACE_MIN_MS);
  if (!allFast) return false;

  const graded = window.filter((row) => row.correct !== null);
  // Aucune réponse corrigeable : la vitesse seule tranche.
  if (graded.length === 0) return true;

  return graded.filter((row) => row.correct === true).length <= PACE_MAX_CORRECT;
}
