// Le classement des pannes et la relance — les deux seules parties PURES du
// journal de bord, et les deux qui décident de dépenser.
//
// Pourquoi celles-là et pas le reste (`docs/backlog.md` sur la portée des tests) :
// `classifyFailure` est le contrat d'une entrée **non fiable** — l'erreur que
// rend un fournisseur, dans une forme qui lui appartient — et c'est de son
// verdict que dépend la relance. Une panne définitive prise pour passagère fait
// repayer un appel à coup sûr perdu ; l'inverse fait abandonner une génération
// qu'un délai de trois secondes aurait sauvée.
//
// L'écriture en base, elle, ne se teste pas ici : elle n'a aucune règle: elle
// range ce qu'on lui donne.

import { describe, expect, it, vi } from 'vitest';

import { MAX_ATTEMPTS, classifyFailure, isTransient, withRetry } from '@/lib/ingest/journal';

/** Une erreur de fournisseur telle qu'elle arrive : un message, et le code HTTP
 *  posé sur l'objet (le SDK d'Anthropic le fait, et `deepseek.ts` s'y aligne). */
function providerError(message: string, status?: number): Error {
  const error = new Error(message);
  if (status !== undefined) Object.assign(error, { status });
  return error;
}

describe('classifyFailure', () => {
  it('reconnaît la saturation à son code, pas à son texte', () => {
    expect(classifyFailure(providerError('Overloaded', 529))).toBe('overloaded');
    // Le code d'abord : un fournisseur peut reformuler ses messages du jour au
    // lendemain, il ne renumérote pas ses codes.
    expect(classifyFailure(providerError('quelque chose d’inattendu', 529))).toBe('overloaded');
  });

  it('retombe sur le texte quand aucun code n’accompagne l’erreur', () => {
    expect(classifyFailure(new Error('API is Overloaded'))).toBe('overloaded');
    expect(classifyFailure(new Error('fetch failed'))).toBe('unavailable');
  });

  it('distingue le débit, la panne et la fenêtre', () => {
    expect(classifyFailure(providerError('rate limit', 429))).toBe('rate_limited');
    expect(classifyFailure(providerError('bad gateway', 502))).toBe('unavailable');
    // Le corpus trop gros arrive en 400 : c'est le TEXTE qui le distingue d'une
    // requête mal formée, et sûrement pas le code.
    expect(classifyFailure(providerError('prompt is too long: 285000 tokens', 400))).toBe('oversize');
  });

  it('ne range dans « inconnue » que ce qu’il ne sait vraiment pas nommer', () => {
    expect(classifyFailure(providerError('invalid api key', 401))).toBe('unknown');
    expect(classifyFailure(new Error(''))).toBe('unknown');
  });

  it('une annulation n’est pas une panne', () => {
    expect(classifyFailure(new Error('INGEST_CLOSED'))).toBe('closed');
    expect(classifyFailure(new Error('INGEST_BUSY'))).toBe('closed');
  });
});

describe('isTransient', () => {
  it('n’autorise la relance que sur ce qu’un délai peut effacer', () => {
    expect(isTransient('overloaded')).toBe(true);
    expect(isTransient('unavailable')).toBe(true);
    expect(isTransient('rate_limited')).toBe(true);
  });

  it('refuse tout ce qui échouera à l’identique', () => {
    // Un corpus trop volumineux le sera encore dans trois secondes, une réponse
    // illisible aussi, et une annulation doit rester une annulation.
    for (const cause of ['oversize', 'truncated', 'unreadable', 'closed', 'unknown'] as const) {
      expect(isTransient(cause)).toBe(false);
    }
  });
});

describe('withRetry', () => {
  it('rend le résultat du premier essai sans rien relancer', async () => {
    const call = vi.fn().mockResolvedValue('ok');
    const attempt = await withRetry(call);
    expect(attempt.result).toBe('ok');
    expect(attempt.attempts).toBe(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('relance UNE fois sur une panne passagère, et pas deux', async () => {
    vi.useFakeTimers();
    try {
      const call = vi
        .fn()
        .mockRejectedValueOnce(providerError('Overloaded', 529))
        .mockResolvedValue('ok');
      const running = withRetry(call);
      await vi.runAllTimersAsync();
      const attempt = await running;

      expect(attempt.result).toBe('ok');
      expect(attempt.attempts).toBe(2);
      expect(attempt.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abandonne après la relance plutôt que de s’acharner', async () => {
    vi.useFakeTimers();
    try {
      const call = vi.fn().mockRejectedValue(providerError('Overloaded', 529));
      const running = withRetry(call);
      // Sans cette capture, l'échec attendu remonterait comme un rejet non géré.
      const settled = expect(running).rejects.toThrow('Overloaded');
      await vi.runAllTimersAsync();
      await settled;
      expect(call).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne relance jamais une panne définitive — c’est payer deux fois le même échec', async () => {
    const call = vi.fn().mockRejectedValue(providerError('prompt is too long: 285000 tokens', 400));
    await expect(withRetry(call)).rejects.toThrow('prompt is too long');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
