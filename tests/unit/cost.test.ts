import { describe, expect, it } from 'vitest';

import { COST_ASSUMPTIONS, estimateIngestionCost, PRICING } from '@/lib/ingest/cost';
import { MAX_QUESTIONS_PER_IMPORT } from '@/lib/ingest/prompt';
import { MODELS } from '@/lib/ingest/providers/claude';

// ⚠️ TEMPORAIRE — phase de test. Ce fichier part avec `src/lib/ingest/cost.ts`.
//
// Le chiffre affiché avant de lancer une ingestion vient d'ici. Il est montré à
// l'utilisateur et il l'engage à dépenser : c'est la seule raison pour laquelle
// la fonction est pure — pour pouvoir la vérifier sans facture.

const models = { chapters: MODELS.haiku, notions: MODELS.haiku, questions: MODELS.haiku };

describe('estimateIngestionCost — la passe chapitres', () => {
  it('facture le corpus une fois, au prix d’entrée du modèle', () => {
    const { chapters } = estimateIngestionCost({
      corpusTokens: 1_000_000,
      models,
      withNotions: false,
      withQuestions: false,
    });
    expect(chapters).toBeCloseTo(PRICING[MODELS.haiku].input, 6);
  });

  it('coûte plus cher sur un modèle plus cher', () => {
    const haiku = estimateIngestionCost({ corpusTokens: 680_000, models, withNotions: false, withQuestions: false });
    const sonnet = estimateIngestionCost({
      corpusTokens: 680_000,
      models: { ...models, chapters: MODELS.sonnet },
      withNotions: false,
      withQuestions: false,
    });
    expect(sonnet.usd).toBeGreaterThan(haiku.usd);
    expect(sonnet.usd / haiku.usd).toBeCloseTo(3, 5);
  });
});

describe('estimateIngestionCost — la passe notions', () => {
  it('compte une relecture du corpus par chapitre, remisée par le cache', () => {
    // Un chapitre : pas de marqueur de cache (§16.17), donc plein tarif.
    const un = estimateIngestionCost({ corpusTokens: 1_000_000, models, chapters: 1, withQuestions: false });
    expect(un.notions).toBeCloseTo(PRICING[MODELS.haiku].input, 6);

    // Huit chapitres : une écriture à 1,25x puis sept lectures à 0,1x.
    const huit = estimateIngestionCost({ corpusTokens: 1_000_000, models, chapters: 8, withQuestions: false });
    expect(huit.notions).toBeCloseTo(PRICING[MODELS.haiku].input * (1.25 + 7 * 0.1), 6);
  });

  it('disparaît si on ne demande pas les notions', () => {
    const sans = estimateIngestionCost({ corpusTokens: 500_000, models, withNotions: false });
    expect(sans.notions).toBe(0);
    // Et les questions avec, puisqu'elles n'auraient rien à quoi se rattacher.
    expect(sans.questions).toBe(0);
    expect(sans.plannedQuestions).toBe(0);
  });
});

describe('estimateIngestionCost — la passe questions', () => {
  it('est dominée par la SORTIE, pas par le corpus', () => {
    // Le corpus ne lui est plus envoyé (T3) : doubler sa taille ne change rien
    // à ce poste.
    const petit = estimateIngestionCost({ corpusTokens: 70_000, models });
    const gros = estimateIngestionCost({ corpusTokens: 680_000, models });
    expect(gros.questions).toBe(petit.questions);
  });

  it('applique le plafond de questions de l’import', () => {
    // 8 chapitres x 10 notions x 12 questions = 960, plafonné à 300.
    const { plannedQuestions } = estimateIngestionCost({ corpusTokens: 100_000, models });
    expect(plannedQuestions).toBe(MAX_QUESTIONS_PER_IMPORT);
  });

  it('suit la répartition de Bloom quand elle est plus modeste', () => {
    const { plannedQuestions } = estimateIngestionCost({
      corpusTokens: 100_000,
      models,
      chapters: 2,
      notionsPerChapter: 5,
      distribution: { 1: 2, 2: 1, 3: 0, 4: 0 },
    });
    expect(plannedQuestions).toBe(2 * 5 * 3);
  });
});

describe('estimateIngestionCost — le total', () => {
  it('est la somme des trois passes', () => {
    const e = estimateIngestionCost({ corpusTokens: 680_000, models });
    expect(e.usd).toBeCloseTo(e.chapters + e.notions + e.questions, 10);
  });

  it('reste un ordre de grandeur crédible sur le corpus réel du 22/08/2026', () => {
    // 680 000 tokens : l'import qui a coûté ~20 $ pour zéro question doit
    // désormais s'annoncer à quelques dollars.
    const { usd } = estimateIngestionCost({ corpusTokens: 680_000, models });
    expect(usd).toBeGreaterThan(0.5);
    expect(usd).toBeLessThan(10);
  });

  it('un corpus vide ne coûte rien en entrée', () => {
    const e = estimateIngestionCost({ corpusTokens: 0, models, withNotions: false, withQuestions: false });
    expect(e.usd).toBe(0);
  });

  it('les hypothèses de forme sont explicites, pas cachées dans le calcul', () => {
    expect(COST_ASSUMPTIONS).toEqual({ chapters: 8, notionsPerChapter: 10 });
  });
});
