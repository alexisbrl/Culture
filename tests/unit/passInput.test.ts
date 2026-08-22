import { describe, expect, it } from 'vitest';

import { documentsForPass } from '@/lib/ingest/passInput';
import type { ExistingContent } from '@/lib/ingest/prompt';
import type { IngestScope, PlanProvider, PreparedDocument, ProviderResult } from '@/lib/ingest/providers/types';

// Ce fichier tient la promesse la plus chère du chantier : **la passe questions
// ne reçoit aucun document**. Sans elle, on relit le cours entier (680 000
// tokens sur le corpus du 22/08/2026) pour rédiger une question sur une phrase
// de 280 caractères — ~287 $ de lectures de cache contre ~8,50 $.
//
// Aucun réseau, aucune base : un fournisseur factice capture l'appel, comme
// prévu par `options.provider` (CLAUDE.md §7).

const doc = (ref: string): PreparedDocument => ({
  key: `cours/${ref}.pdf`,
  fileName: `${ref}.pdf`,
  mimeType: 'application/pdf',
  ref,
});

const empty: ExistingContent = { chapters: [], notions: [], questions: [] };

/** Fournisseur factice : il n'appelle rien, il note ce qu'on lui a donné. */
function recordingProvider(): PlanProvider & { calls: { documents: PreparedDocument[]; scope: IngestScope }[] } {
  const calls: { documents: PreparedDocument[]; scope: IngestScope }[] = [];
  return {
    calls,
    name: 'factice',
    async prepare(documents) {
      return documents.map((d) => ({ key: d.key, fileName: d.fileName, mimeType: d.mimeType, ref: d.fileName }));
    },
    async documentToPlan(documents, _existing, scope): Promise<ProviderResult> {
      calls.push({ documents, scope });
      return { plan: {}, usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cachedTokens: 0 } };
    },
  };
}

describe('documentsForPass — ce qui part au modèle', () => {
  const prepared = [doc('a'), doc('b')];

  it('la passe chapitres reçoit tout le corpus', () => {
    // C'est la seule passe qui doit voir l'ensemble : elle découpe le cours.
    expect(documentsForPass('chapters', prepared)).toEqual(prepared);
  });

  it('la passe notions reçoit les documents', () => {
    expect(documentsForPass('notions', prepared)).toEqual(prepared);
  });

  it('la passe questions n’en reçoit AUCUN', () => {
    expect(documentsForPass('questions', prepared)).toHaveLength(0);
  });
});

describe('passe questions — l’appel capturé ne porte aucun document', () => {
  it('documents.length === 0 chez le fournisseur', async () => {
    const provider = recordingProvider();
    const prepared = await provider.prepare([
      { key: 'cours/ch1.pdf', fileName: 'ch1.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1]) },
    ]);

    await provider.documentToPlan(documentsForPass('questions', prepared), empty, {
      pass: 'questions',
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire est le plus long fleuve de France' }],
      neighbours: [{ id: 'n2', title: 'La Seine traverse Paris' }],
      budget: 12,
    });

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].documents).toHaveLength(0);
  });

  it('la passe notions, elle, les reçoit encore', async () => {
    const provider = recordingProvider();
    const prepared = [doc('ch1')];

    await provider.documentToPlan(documentsForPass('notions', prepared), empty, {
      pass: 'notions',
      chapter: { id: 'ch1', name: 'Les fleuves' },
    });

    expect(provider.calls[0].documents).toHaveLength(1);
  });
});
