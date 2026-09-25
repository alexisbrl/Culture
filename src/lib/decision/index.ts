// Répondre à une QUESTION FERMÉE : oui ou non, avec une probabilité.
//
// La cible est un modèle de décision, Jev (TypeSafe AI) : il ne rédige pas, il
// rend la probabilité que la réponse soit « oui » — en une fraction de seconde,
// pour une fraction du prix d'un modèle qui écrit (docs/architecture.md §7.4).
// Son accès n'est pas encore ouvert : Claude Haiku tient sa place, avec un mot à
// écrire (@/lib/decision/haiku). Le reste du code ne connaît que `Decider` —
// la bascule se fera dans `getDecider`, et nulle part ailleurs.

import type { StepUsage } from '@/lib/ingest/journal';

import { createHaikuDecider } from './haiku';

/** Une question fermée, posée sur une situation décrite en texte. */
export type ClosedQuestion = {
  /** La situation : tout ce qu'il faut savoir pour trancher, et rien d'autre. */
  state: string;
  /** La question, formulée pour qu'un « oui » et un « non » aient chacun un sens
   *  précis. */
  question: string;
};

export type Decision = {
  /** Probabilité que la réponse soit « oui », entre 0 et 1. Un modèle qui écrit
   *  ne rend que 0 ou 1 ; un modèle de décision rend une vraie probabilité. */
  probability: number;
  /** Ce qui a répondu, tel qu'il se nomme — pour le journal. */
  model: string;
  usage: StepUsage;
};

export type Decider = {
  /** Nom court, pour le journal et le suivi de coût. */
  readonly name: string;
  decide(question: ClosedQuestion): Promise<Decision>;
};

/** Le seuil du « oui ». Au milieu tant qu'aucune décision ne justifie de pencher
 *  d'un côté : chaque usage peut passer le sien à `isYes`. */
export const YES_THRESHOLD = 0.5;

/** Relit une probabilité venue d'un modèle. **Fonction pure**, et méfiante : ce
 *  qui n'est pas un nombre entre 0 et 1 vaut `null` — « pas de réponse » —, et
 *  c'est à l'appelant de dire ce que vaut une absence de réponse chez lui. */
export function readProbability(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0 || raw > 1) return null;
  return raw;
}

export function isYes(probability: number, threshold: number = YES_THRESHOLD): boolean {
  return probability >= threshold;
}

/** Le décideur en service. Haiku en attendant Jev. */
export function getDecider(): Decider {
  return createHaikuDecider();
}
