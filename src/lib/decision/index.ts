// Répondre à une QUESTION FERMÉE : oui ou non, avec une probabilité.
//
// La cible est un modèle de décision, Jev (TypeSafe AI) : il ne rédige pas, il
// rend la probabilité que la réponse soit « oui » — en une fraction de seconde,
// pour une fraction du prix d'un modèle qui écrit (docs/architecture.md §7.4).
// Branché le 08/10/2026 (@/lib/decision/jev), DeepSeek en relais
// (@/lib/decision/deepseek). Le reste du code ne connaît que `Decider` : le
// choix se fait dans `getDecider`, et nulle part ailleurs.

import type { StepUsage } from '@/lib/ingest/journal';

import { createDeepSeekDecider } from './deepseek';
import { createHaikuDecider } from './haiku';
import { createJevDecider } from './jev';

/** Une question fermée, posée sur une situation décrite en texte. */
export type ClosedQuestion = {
  /** La situation : tout ce qu'il faut savoir pour trancher, et rien d'autre. */
  state: string;
  /** La question, formulée pour qu'un « oui » et un « non » aient chacun un sens
   *  précis. */
  question: string;
  /** Ce que veulent dire « oui » et « non », quand la frontière est fine. Jev
   *  les lit à part ; Haiku les reçoit à la suite de la question. */
  criteria?: { true: string; false: string };
};

export type Decision = {
  /** Probabilité que la réponse soit « oui », entre 0 et 1. Un modèle qui écrit
   *  ne rend que 0 ou 1 ; un modèle de décision rend une vraie probabilité. */
  probability: number;
  /** Ce qui a répondu, tel qu'il se nomme — pour le journal. */
  model: string;
  usage: StepUsage;
  /** Le premier décideur était saturé (429, 529) et le relais a répondu : le
   *  signal qui fait ralentir l'envoi (@/lib/decision/pool). */
  congested?: boolean;
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

/** Deux décideurs en cascade : le second répond quand le premier ne le peut
 *  pas (saturation, panne). Une décision manquée coûte plus cher qu'une
 *  décision un peu moins fine — Jev a refusé pour saturation lors de l'essai
 *  du 08/10/2026, à dix demandes simultanées. */
export function withFallback(primary: Decider, fallback: Decider): Decider {
  return {
    name: primary.name,
    async decide(question) {
      try {
        return await primary.decide(question);
      } catch (error) {
        console.warn(`[decision] ${primary.name} indisponible, repli sur ${fallback.name} :`, error instanceof Error ? error.message : error);
        const status = (error as { status?: unknown } | null)?.status;
        const decision = await fallback.decide(question);
        return status === 429 || status === 529 ? { ...decision, congested: true } : decision;
      }
    },
  };
}

/** Le décideur en service : Jev depuis le 08/10/2026, DeepSeek en relais
 *  (décision d'Alexis : essai du 08/10, 25/25 sur la décision d'écrire et
 *  d'accord avec Jev sur 149 redites sur 150). Haiku ne sert plus que si une
 *  clé manque — développement sans accès. */
export function getDecider(): Decider {
  const fallback = process.env.DEEPSEEK_API_KEY ? createDeepSeekDecider() : createHaikuDecider();
  if (!process.env.JEV_API_KEY) return fallback;
  return withFallback(createJevDecider(), fallback);
}
