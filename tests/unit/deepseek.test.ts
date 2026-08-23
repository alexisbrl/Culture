import { describe, expect, it, vi } from 'vitest';

import { createDeepSeekProvider } from '@/lib/ingest/providers/deepseek';
import type { ExistingContent } from '@/lib/ingest/prompt';

// Ce fournisseur ne sait faire qu'UNE passe. Le vérifier compte : accepter en
// silence une passe qu'il ne sait pas faire produirait un import amputé — des
// chapitres manquants sans erreur pour le dire. Aucun réseau ici : `fetch` est
// remplacé, la clé est fournie en dur.

const empty: ExistingContent = { chapters: [], notions: [], questions: [] };
const provider = () => createDeepSeekProvider({ apiKey: 'test-key' });

const questionsScope = {
  pass: 'questions' as const,
  chapter: { id: 'ch1', name: 'Chapitre' },
  notions: [{ id: 'n1', title: 'Une notion' }],
  neighbours: [],
  budget: 12,
};

describe('createDeepSeekProvider — passe questions uniquement', () => {
  it('exige une clé plutôt que d’échouer au premier appel', () => {
    const saved = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    expect(() => createDeepSeekProvider()).toThrow('DEEPSEEK_API_KEY manquante');
    if (saved !== undefined) process.env.DEEPSEEK_API_KEY = saved;
  });

  it('REFUSE la passe chapitres au lieu de la servir dégradée', async () => {
    await expect(provider().documentToPlan([], empty, { pass: 'chapters' })).rejects.toThrow(/passe chapters/);
  });

  it('REFUSE la passe notions', async () => {
    await expect(
      provider().documentToPlan([], empty, { pass: 'notions', chapter: { id: 'ch1', name: 'C' } }),
    ).rejects.toThrow(/passe notions/);
  });

  it('refuse un appel qui porterait des documents', async () => {
    const doc = { key: 'k', fileName: 'f.pdf', mimeType: 'application/pdf', ref: 'r' };
    await expect(provider().documentToPlan([doc], empty, questionsScope)).rejects.toThrow(/documents/);
  });

  it('ne prétend pas savoir téléverser', async () => {
    await expect(provider().prepare([])).rejects.toThrow(/téléversement/);
  });

  it('rend le plan et l’usage sur une réponse normale', async () => {
    // Signature typée pour pouvoir relire le corps envoyé plus bas.
    const fetchMock = vi.fn((url: unknown, init?: { body?: unknown }) => { void url; void init; return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: '{"groups":[{"ref":"g1","questions":[]}]}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 340, prompt_cache_hit_tokens: 64 },
    }), { status: 200 })); });
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider().documentToPlan([], empty, questionsScope);
    expect(result.plan).toEqual({ groups: [{ ref: 'g1', questions: [] }] });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 340, cacheCreationTokens: 0, cachedTokens: 64 });

    // Le mode JSON de DeepSeek exige le mot « json » dans le prompt : sans lui
    // l'API refuse la requête. La forme envoyée doit aussi venir du schéma Zod.
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[1].content.toLowerCase()).toContain('json');
    expect(body.messages[1].content).toContain('"groups"');
    vi.unstubAllGlobals();
  });

  it('remonte le motif réel d’une erreur HTTP, pas un code nu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"Insufficient Balance"}}', { status: 402 })));
    // Le code SEUL ne dit pas quoi faire ; le corps, si — ici « solde
    // insuffisant », qui n'est ni un bug ni un quota de débit.
    const failing = provider().documentToPlan([], empty, questionsScope);
    await expect(failing).rejects.toThrow('402');
    await expect(failing).rejects.toThrow('Insufficient Balance');
    vi.unstubAllGlobals();
  });

  it('une réponse illisible ne fait pas échouer le lot : parsePlan tranchera', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'désolé, voici les questions…' } }],
    }), { status: 200 })));
    const result = await provider().documentToPlan([], empty, questionsScope);
    expect(result.plan).toEqual({});
    vi.unstubAllGlobals();
  });
});
