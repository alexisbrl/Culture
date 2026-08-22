import { describe, expect, it } from 'vitest';

import { batchNotions, documentsForPass, NOTIONS_PER_QUESTION_BATCH } from '@/lib/ingest/passInput';
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

describe('batchNotions — l’unité de travail de la passe questions', () => {
  const notions = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i + 1}`, title: `Notion ${i + 1}` }));

  it('un chapitre de 25 notions donne exactement 3 lots (10, 10, 5)', () => {
    const batches = batchNotions(notions(25));
    expect(batches.map((b) => b.length)).toEqual([10, 10, 5]);
  });

  it('un chapitre de 25 notions produit exactement 3 appels au fournisseur', async () => {
    // Le critère de T4, vérifié bout en bout sur la boucle que fait le client.
    const provider = recordingProvider();
    const all = notions(25);

    for (const batch of batchNotions(all)) {
      const inBatch = new Set(batch.map((n) => n.id));
      await provider.documentToPlan([], empty, {
        pass: 'questions',
        chapter: { id: 'ch1', name: 'Les fleuves' },
        notions: batch,
        neighbours: all.filter((n) => !inBatch.has(n.id)),
        budget: 300,
      });
    }

    expect(provider.calls).toHaveLength(3);
    expect(provider.calls.map((c) => (c.scope.pass === 'questions' ? c.scope.notions.length : -1))).toEqual([10, 10, 5]);
    // Chaque appel voit le reste du chapitre en contexte, jamais deux fois la
    // même notion en cible.
    expect(provider.calls.map((c) => (c.scope.pass === 'questions' ? c.scope.neighbours.length : -1))).toEqual([15, 15, 20]);
    const cibles = provider.calls.flatMap((c) => (c.scope.pass === 'questions' ? c.scope.notions.map((n) => n.id) : []));
    expect(new Set(cibles).size).toBe(25);
  });

  it('aucun lot vide, et le dernier n’est pas complété artificiellement', () => {
    expect(batchNotions(notions(0))).toEqual([]);
    expect(batchNotions(notions(1)).map((b) => b.length)).toEqual([1]);
    expect(batchNotions(notions(NOTIONS_PER_QUESTION_BATCH)).map((b) => b.length)).toEqual([NOTIONS_PER_QUESTION_BATCH]);
  });

  it('refuse une taille de lot qui ferait une boucle infinie', () => {
    expect(() => batchNotions(notions(3), 0)).toThrow();
  });
});
