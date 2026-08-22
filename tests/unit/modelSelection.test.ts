import { describe, expect, it } from 'vitest';

import { MODELS, OVERSIZE_FALLBACK, PASS_MODELS, selectModel } from '@/lib/ingest/providers/claude';

// La fenêtre de contexte est une contrainte DURE : au-delà, l'appel n'est pas
// mauvais, il est **refusé**, et aucun réglage ne le contourne (§16.20). Cette
// sélection est donc la différence entre une ingestion qui tourne et une
// ingestion qui échoue au premier appel.
//
// Importer ce module n'ouvre aucune connexion : `createClaudeProvider` n'est pas
// appelé, seule la fonction pure l'est.

describe('selectModel — (modèle voulu, taille du corpus) → modèle retenu', () => {
  it('garde Haiku quand le corpus tient dans sa fenêtre', () => {
    // Le cours de SVT, 70 648 tokens : Haiku convient.
    expect(selectModel(MODELS.haiku, 70_648)).toBe(MODELS.haiku);
  });

  it('bascule sur Sonnet 5 à 300 000 tokens avec Haiku demandé', () => {
    expect(selectModel(MODELS.haiku, 300_000)).toBe(MODELS.sonnet);
  });

  it('bascule aussi sur le corpus réel du 22/08/2026 (680 000 tokens)', () => {
    expect(selectModel(MODELS.haiku, 680_000)).toBe(MODELS.sonnet);
  });

  it('réserve la place de la réponse dans la fenêtre', () => {
    // 200 000 de fenêtre moins 32 000 de sortie : un corpus de 190 000 tokens
    // ne « tient » pas, même s'il est sous la fenêtre nominale.
    expect(selectModel(MODELS.haiku, 168_000)).toBe(MODELS.haiku);
    expect(selectModel(MODELS.haiku, 190_000)).toBe(MODELS.sonnet);
  });

  it('une taille inconnue bascule par prudence', () => {
    expect(selectModel(MODELS.haiku, Number.POSITIVE_INFINITY)).toBe(OVERSIZE_FALLBACK);
  });

  it('n’escalade jamais au-delà du repli', () => {
    // Un corpus qui ne tient pas dans un million de tokens est hors normes : le
    // découpage séquentiel est un autre sujet, pas une montée en gamme.
    expect(selectModel(MODELS.sonnet, 2_000_000)).toBe(MODELS.sonnet);
    expect(selectModel(MODELS.opus, 2_000_000)).toBe(MODELS.sonnet);
  });

  it('Sonnet garde sa place tant que le corpus tient', () => {
    expect(selectModel(MODELS.sonnet, 680_000)).toBe(MODELS.sonnet);
  });
});

describe('PASS_MODELS — Haiku d’abord, partout (§16.20)', () => {
  it('les trois passes visent Haiku 4.5', () => {
    expect(PASS_MODELS).toEqual({
      chapters: MODELS.haiku,
      notions: MODELS.haiku,
      questions: MODELS.haiku,
    });
  });

  it('le repli est Sonnet 5, pas Opus — même fenêtre, trois fois moins cher', () => {
    expect(OVERSIZE_FALLBACK).toBe(MODELS.sonnet);
  });
});
