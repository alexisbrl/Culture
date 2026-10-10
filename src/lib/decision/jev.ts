// Jev (TypeSafe AI) — le modèle de décision visé depuis le début (§7.4).
// Accès ouvert le 08/10/2026.
//
// Il ne rédige pas : il rend la probabilité que la réponse à une question
// fermée soit « oui » (une « noul », dans son vocabulaire). Une vraie
// probabilité, là où Haiku ne rendait que 0 ou 1 — c'est ce qui permettra un
// jour de séparer le « sûr » de l'« à revoir ».
//
// Ce qu'il faut savoir de lui (documentation TypeSafe, relue le 08/10/2026) :
// • facturé à l'ENTRÉE seule, 0,042 $ le million de jetons ; la sortie est
//   gratuite ;
// • il lit au pied de la lettre : la question doit dire exactement ce qu'un
//   « oui » veut dire, d'où les `criteria` quand la frontière est fine ;
// • l'anglais est sa langue la mieux servie ; le français est « pris en charge,
//   mais pas aussi bien » — d'où l'essai sur nos propres questions avant de lui
//   confier quoi que ce soit ;
// • il ne compte pas, ne compare pas de dates : ces règles-là restent au code.

import type { ClosedQuestion, Decider, Decision } from './index';

const API_URL = 'https://api.typesafe.ai/v1/systemone';

/** Toujours le dernier Jev : la réponse dit lequel a répondu, et c'est lui
 *  qu'on journalise. */
const MODEL = 'jev-latest';

type JevResponse = {
  model?: string;
  answers?: Record<string, { type?: string; noul?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function createJevDecider(apiKey: string | undefined = process.env.JEV_API_KEY): Decider {
  if (!apiKey) throw new Error('JEV_API_KEY manquante');

  return {
    name: 'jev',

    async decide({ state, question, criteria }: ClosedQuestion): Promise<Decision> {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          state,
          questions: {
            answer: { type: 'noul', instructions: question, ...(criteria ? { criteria } : {}) },
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const failure = new Error(`Jev ${response.status} : ${body.slice(0, 400)}`);
        // Le code HTTP posé sur l'erreur, comme chez les deux autres
        // fournisseurs : 429 et 529 se relancent (@/lib/ingest/journal).
        Object.assign(failure, { status: response.status });
        throw failure;
      }

      const payload = (await response.json()) as JevResponse;
      const raw = payload.answers?.answer?.noul;
      return {
        probability: typeof raw === 'number' ? raw : Number.NaN,
        model: payload.model ?? MODEL,
        usage: {
          inputTokens: payload.usage?.input_tokens ?? 0,
          outputTokens: payload.usage?.output_tokens ?? 0,
          cacheCreationTokens: 0,
          cachedTokens: 0,
        },
      };
    },
  };
}
