// Repérer un membre qui répond au hasard, et l'arrêter s'il continue.
//
// ── Ce qu'on cherche, et ce qu'on ne cherche pas ────────────────────────────
//
// Pas la triche : un parcours d'entraînement montre la réponse dès qu'on valide,
// donc il n'y a rien à voler. Ce qui coûte, c'est le **gâchis de stock** — une
// question répondue est consommée, juste ou fausse, donc quelques minutes de
// clics au hasard vident un chapitre et déclenchent une recharge payante pour
// rien (arbitrage du 29/08/2026).
//
// ── La règle : une série de fautes rapides ──────────────────────────────────
//
//   • 3 mauvaises réponses d'affilée, chacune en moins de 3 secondes → un
//     message, affiché avec la correction ;
//   • 2 de plus dans le même état (5 d'affilée) → l'exercice se met en pause
//     5 minutes.
//
// **On compte les fautes, pas le score.** La version précédente demandait un
// « résultat proche du hasard », ce qui ne se calcule que pour un QCM : une
// réponse rédigée, un dessin, un dépôt de fichier n'ont pas de probabilité de
// réussite (révision du 29/08/2026, même jour). Une faute est une faute, quel
// que soit le type de réponse — et c'est aussi plus juste : quelqu'un de rapide
// ET juste n'est jamais inquiété, quel que soit le nombre de propositions.
//
// **Une réponse non corrigée automatiquement (`correct: null`) casse la série.**
// Elle n'est ni juste ni fausse : rien ne permet d'accuser qui que ce soit.
// Conséquence assumée : on ne repère pas un membre qui expédierait uniquement
// des questions ouvertes. Il faut accepter de laisser passer ce cas plutôt que
// de mettre en pause quelqu'un dont on ignore s'il a raison.
//
// ── Le blocage se déduit, il ne se stocke pas ───────────────────────────────
//
// Aucun « bloqué jusqu'à » en base : la pause est simplement la date de la
// dernière réponse plus cinq minutes, relue à chaque tirage. Rien à écrire, rien
// à nettoyer, et rien qui puisse rester coincé si le calcul change.

/** Une réponse récente, telle qu'elle est retenue en base. */
export type AnswerPaceRow = {
  /** Millisecondes entre l'affichage et la validation. `null` = pas mesuré. */
  answerMs: number | null;
  /** Grappe réussie ? `null` = rien n'était corrigeable automatiquement. */
  correct: boolean | null;
  /** Quand la réponse a été enregistrée (millisecondes epoch). */
  answeredAt: number;
};

/** En dessous de ce temps, une réponse n'a pas été réfléchie. */
export const PACE_MIN_MS = 3000;

/** Fautes rapides d'affilée avant l'avertissement. */
export const PACE_WARN_STREAK = 3;

/** Fautes rapides d'affilée avant la mise en pause. */
export const PACE_BLOCK_STREAK = 5;

/** Durée de la pause. */
export const PACE_BLOCK_MS = 5 * 60 * 1000;

/** Combien de réponses il faut relire pour trancher. */
export const PACE_WINDOW = PACE_BLOCK_STREAK;

export type PaceVerdict =
  | { state: 'ok' }
  | { state: 'warn' }
  /** `until` : date (epoch, ms) à laquelle l'exercice redevient possible. */
  | { state: 'blocked'; until: number };

/** Le temps rapporté par l'écran, ramené à quelque chose d'exploitable. Une
 *  valeur absurde (négative, ou plus longue qu'une heure) est traitée comme
 *  « pas mesuré » plutôt que comme une preuve : elle ne doit ni accuser ni
 *  disculper. */
export function sanitizeAnswerMs(value: unknown): number | null {
  const ms = Math.round(Number(value));
  if (!Number.isFinite(ms) || ms < 0 || ms > 3_600_000) return null;
  return ms;
}

/** Une réponse fausse ET expédiée. Le seul motif qui alimente la série. */
function isFastMiss(row: AnswerPaceRow): boolean {
  return row.correct === false && row.answerMs !== null && row.answerMs < PACE_MIN_MS;
}

/** Combien de fautes rapides d'affilée, en partant de la plus récente. */
export function fastMissStreak(rows: AnswerPaceRow[]): number {
  let streak = 0;
  for (const row of rows) {
    if (!isFastMiss(row)) break;
    streak += 1;
  }
  return streak;
}

/**
 * Que faire de ce membre ? `rows` porte ses dernières réponses, la plus récente
 * en tête ; `now` est injectable pour que la pause se teste sans horloge.
 *
 * La pause est calculée depuis la DERNIÈRE réponse : cinq minutes après elle,
 * l'exercice repart. Continuer à cliquer au hasard la repousse d'autant.
 */
export function paceVerdict(rows: AnswerPaceRow[], now: number = Date.now()): PaceVerdict {
  const streak = fastMissStreak(rows);

  if (streak >= PACE_BLOCK_STREAK) {
    const until = rows[0].answeredAt + PACE_BLOCK_MS;
    if (now < until) return { state: 'blocked', until };
    // La pause est passée : on laisse repartir, sans effacer la série. Une
    // nouvelle faute rapide remettra aussitôt en pause, ce qui est l'effet
    // voulu — on ne rouvre pas la porte en grand.
    return { state: 'ok' };
  }

  return streak >= PACE_WARN_STREAK ? { state: 'warn' } : { state: 'ok' };
}
