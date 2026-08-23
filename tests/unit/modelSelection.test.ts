import { describe, expect, it } from 'vitest';

import Anthropic from '@anthropic-ai/sdk';

import { isContextWindowOverflow, modelForCall, MODELS, OVERSIZE_FALLBACK, PASS_MODELS, selectModel } from '@/lib/ingest/providers/claude';

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

  // Une taille INCONNUE ne passe plus par ici : depuis le 22/08/2026 on essaie
  // le modèle voulu et on ne bascule que sur un refus réel — la mesure était
  // toujours absente, et renoncer d'avance revenait à ne jamais utiliser Haiku.
  // Voir `isContextWindowOverflow` ci-dessous.

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
  it('les quatre passes visent Haiku 4.5', () => {
    expect(PASS_MODELS).toEqual({
      chapters: MODELS.haiku,
      notions: MODELS.haiku,
      assign: MODELS.haiku,
      questions: MODELS.haiku,
    });
  });

  it('le repli est Sonnet 5, pas Opus — même fenêtre, trois fois moins cher', () => {
    expect(OVERSIZE_FALLBACK).toBe(MODELS.sonnet);
  });
});

// Ce classificateur décide, à partir d'un message d'erreur du fournisseur, si on
// dépense un second appel. Se tromper dans un sens fait échouer un import qui
// aurait pu passer ; se tromper dans l'autre fait basculer TOUS les imports sur
// un modèle trois fois plus cher, sans que rien ne le signale. C'est exactement
// le « contrat d'une entrée non fiable » que CLAUDE.md §7 demande de tester.

function apiError(status: number, message: string) {
  return new Anthropic.APIError(status, { type: 'error', error: { type: 'invalid_request_error', message } }, message, undefined);
}

describe('isContextWindowOverflow — le seul refus qui justifie une reprise', () => {
  it('reconnaît le dépassement de fenêtre annoncé par l’API', () => {
    expect(isContextWindowOverflow(apiError(400, 'prompt is too long: 285000 tokens > 200000 maximum'))).toBe(true);
  });

  it('reconnaît la variante « input length and max_tokens exceed context limit »', () => {
    expect(isContextWindowOverflow(apiError(400, 'input length and max_tokens exceed context limit: 199000 + 32000 > 200000'))).toBe(true);
  });

  it('IGNORE les autres 400 — sinon un bug de paramètres passerait pour un corpus trop gros', () => {
    // Le cas réel qu'on ne doit surtout pas masquer : `effort` refusé par Haiku
    // fait échouer TOUS les appels, gros comme petits (cf. `tuningFor`).
    expect(isContextWindowOverflow(apiError(400, 'output_config.effort: unsupported parameter for this model'))).toBe(false);
    expect(isContextWindowOverflow(apiError(400, 'File sources are not supported in the token counting endpoint.'))).toBe(false);
  });

  it('ignore ce qui n’est pas un 400', () => {
    expect(isContextWindowOverflow(apiError(429, 'rate limit exceeded'))).toBe(false);
    expect(isContextWindowOverflow(apiError(500, 'internal error'))).toBe(false);
  });

  it('ignore ce qui n’est pas une erreur de l’API', () => {
    expect(isContextWindowOverflow(new Error('prompt is too long'))).toBe(false);
    expect(isContextWindowOverflow(null)).toBe(false);
    expect(isContextWindowOverflow(undefined)).toBe(false);
  });
});

// `modelForCall` rassemble la décision complète : c'est elle, et non
// `selectModel`, qui tourne à chaque appel réel.

describe('modelForCall — le modèle retenu pour un appel', () => {
  const H = MODELS.haiku;

  it('sans document, garde le modèle voulu quelle que soit la taille du cours', () => {
    // La passe questions ne reçoit AUCUN document (`documentsForPass`) : son
    // entrée est faite de notions déjà extraites, elle tient dans n'importe
    // quelle fenêtre.
    expect(modelForCall(H, 0, 680_000)).toBe(H);
  });

  it('… et le garde MÊME si le corpus a déjà fait refuser ce modèle ailleurs', () => {
    // Le point qui compte : le cours entier ne rentre pas dans Haiku, les passes
    // chapitres et notions sont donc sur Sonnet — la passe questions, elle,
    // reste sur Haiku, parce qu'elle ne lit pas le cours.
    expect(modelForCall(H, 0, undefined, [H])).toBe(H);
    expect(modelForCall(H, 0, 680_000, [H])).toBe(H);
  });

  it('avec documents, un refus déjà constaté envoie droit au repli', () => {
    // Sans mémoire, chaque chapitre de la passe notions repaierait l'aller-retour.
    expect(modelForCall(H, 3, undefined, [H])).toBe(OVERSIZE_FALLBACK);
  });

  it('le refus constaté prime sur une taille qui dirait le contraire', () => {
    // Mesuré > estimé : si l'API a refusé, elle a raison contre notre arithmétique.
    expect(modelForCall(H, 3, 1_000, [H])).toBe(OVERSIZE_FALLBACK);
  });

  it('taille inconnue et aucun refus connu : on ESSAIE le modèle voulu', () => {
    expect(modelForCall(H, 3, undefined, [])).toBe(H);
  });

  it('taille connue : on tranche sans essayer', () => {
    expect(modelForCall(H, 3, 70_648)).toBe(H);
    expect(modelForCall(H, 3, 680_000)).toBe(OVERSIZE_FALLBACK);
  });

  it('ne boucle pas sur le repli lui-même', () => {
    expect(modelForCall(OVERSIZE_FALLBACK, 3, undefined, [OVERSIZE_FALLBACK])).toBe(OVERSIZE_FALLBACK);
  });
});
