// ⚠️ TEMPORAIRE — phase de test. À retirer d'un bloc.
//
// Ce module n'existe que pour une raison : le 22/08/2026, un import réel a coûté
// ~20 $ **sans produire une seule question**, et personne ne l'a su avant la
// facture (§16.15). Tant que les coûts réels ne sont pas constatés à la nouvelle
// échelle, on annonce l'ordre de grandeur AVANT de dépenser.
//
// Ce n'est pas un plafond de dépense — Alexis en a refusé le principe — et ce
// n'est pas une validation entre deux passes : l'estimation se produit **avant
// que le premier appel parte**, jamais au milieu d'une ingestion (§16.18).
//
// Le jour où on le retire, tout part ensemble : ce fichier, son test,
// `prepareIngestion`, et l'écran de confirmation du dialogue.

import type { ModelId } from './providers/claude';
import { DEFAULT_BLOOM_DISTRIBUTION, MAX_QUESTIONS_PER_IMPORT, questionsPerNotion, type BloomDistribution } from './prompt';

/** Tarifs publics, en dollars par million de tokens (relevés le 22/08/2026).
 *  Les clés sont écrites en littéral : ce module reste pur, il n'importe rien
 *  du fournisseur à l'exécution. */
export const PRICING: Record<ModelId, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
};

/** Écriture de cache : **2× l'entrée en TTL 1 h, 1,25× en TTL 5 minutes**. On
 *  est en TTL 5 minutes depuis T9. Lecture : 0,1×. */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/** Ce qu'une question coûte en sortie, raisonnement compris. Mesuré à ~200
 *  tokens le 20/08/2026 ; c'est ce chiffre qui décide de la passe questions,
 *  dominée par la sortie et non par l'entrée. */
const OUTPUT_TOKENS_PER_QUESTION = 200;

/** Hypothèses de forme du cours. **Ce sont des hypothèses, pas des mesures** :
 *  on ne sait pas combien de chapitres un cours contient avant de l'avoir lu.
 *  Elles sont prises dans le haut de la fourchette plausible — mieux vaut
 *  annoncer trop que trop peu. */
export const COST_ASSUMPTIONS = { chapters: 8, notionsPerChapter: 10 } as const;

export type CostEstimate = {
  /** Total en dollars. */
  usd: number;
  /** Le détail par passe, pour pouvoir expliquer d'où vient le chiffre. */
  chapters: number;
  notions: number;
  questions: number;
  /** Nombre de questions sur lequel l'estimation est faite, plafond appliqué. */
  plannedQuestions: number;
};

export type CostInput = {
  /** Taille mesurée du corpus, en tokens (`countTokens`, gratuit). */
  corpusTokens: number;
  models: { chapters: ModelId; notions: ModelId; questions: ModelId };
  /** Passes réellement demandées : décocher les notions retire aussi les
   *  questions, qui n'auraient rien à quoi se rattacher. */
  withNotions?: boolean;
  withQuestions?: boolean;
  chapters?: number;
  notionsPerChapter?: number;
  distribution?: BloomDistribution;
};

const perMillion = (tokens: number, price: number) => (tokens * price) / 1_000_000;

/** Estime ce que coûtera une ingestion. **Fonction pure**, donc testable — et
 *  c'est la seule raison pour laquelle on peut l'afficher sans l'avoir vérifiée
 *  sur une facture.
 *
 *  Le modèle de coût suit exactement ce que fait le pipeline :
 *  - passe chapitres : un appel qui lit tout le corpus ;
 *  - passe notions : un appel PAR CHAPITRE, chacun relisant le corpus — d'où le
 *    marqueur de cache, qui transforme les relectures en 0,1× (§16.17) ;
 *  - passe questions : aucun document (T3), donc dominée par la sortie. */
export function estimateIngestionCost(input: CostInput): CostEstimate {
  const chapters = input.chapters ?? COST_ASSUMPTIONS.chapters;
  const notionsPerChapter = input.notionsPerChapter ?? COST_ASSUMPTIONS.notionsPerChapter;
  const withNotions = input.withNotions ?? true;
  const withQuestions = (input.withQuestions ?? true) && withNotions;

  const chaptersCost = perMillion(input.corpusTokens, PRICING[input.models.chapters].input);

  // Le premier appel écrit le cache, les suivants le lisent — mais seulement si
  // le marqueur est posé, c'est-à-dire à partir de deux chapitres.
  const notionsInput = PRICING[input.models.notions].input;
  const notionsCost = !withNotions
    ? 0
    : chapters <= 1
      ? perMillion(input.corpusTokens, notionsInput)
      : perMillion(input.corpusTokens, notionsInput * CACHE_WRITE_MULTIPLIER) +
        perMillion(input.corpusTokens * (chapters - 1), notionsInput * CACHE_READ_MULTIPLIER);

  const plannedQuestions = !withQuestions
    ? 0
    : Math.min(
        chapters * notionsPerChapter * questionsPerNotion(input.distribution ?? DEFAULT_BLOOM_DISTRIBUTION),
        MAX_QUESTIONS_PER_IMPORT,
      );
  const questionsCost = perMillion(
    plannedQuestions * OUTPUT_TOKENS_PER_QUESTION,
    PRICING[input.models.questions].output,
  );

  return {
    usd: chaptersCost + notionsCost + questionsCost,
    chapters: chaptersCost,
    notions: notionsCost,
    questions: questionsCost,
    plannedQuestions,
  };
}
