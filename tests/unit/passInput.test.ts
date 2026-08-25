import { describe, expect, it } from 'vitest';

import {
  batchNotions,
  documentsForPass,
  MAX_PLAUSIBLE_CHAPTERS,
  needsChapterRetry,
  shouldCacheDocuments,
  NOTIONS_PER_QUESTION_BATCH,
  splitUnplaced,
  withChapterRetry,
} from '@/lib/ingest/passInput';
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
  fileId: `file-${ref}`,
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
      return documents.map((d) => ({ fileId: d.fileId, key: d.key, fileName: d.fileName, mimeType: d.mimeType, ref: d.fileName }));
    },
    async release() {
      // Rien à faire : ce fichier ne teste pas le ménage (voir release.test.ts).
    },
    async countCorpus(documents) {
      // Un compteur factice : 1 000 tokens par document, de quoi vérifier les
      // enchaînements sans rien mesurer de réel.
      return documents.length * 1_000;
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

  it('la passe notions ne reçoit que le document de son index', () => {
    expect(documentsForPass('notions', prepared, 0)).toEqual([prepared[0]]);
  });

  it('la passe questions n’en reçoit AUCUN', () => {
    expect(documentsForPass('questions', prepared)).toHaveLength(0);
  });
});

describe('passe questions — l’appel capturé ne porte aucun document', () => {
  it('documents.length === 0 chez le fournisseur', async () => {
    const provider = recordingProvider();
    const prepared = await provider.prepare([
      { fileId: 'file-ch1', key: 'cours/ch1.pdf', fileName: 'ch1.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1]) },
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

  it('la passe notions ne reçoit QUE son document, pas le corpus', async () => {
    // C'est ce qui remplace le cache : le corpus part une seule fois au total,
    // au lieu d'une fois par chapitre dont on relisait les 90 %.
    const provider = recordingProvider();
    const prepared = [doc('a'), doc('b'), doc('c')];

    await provider.documentToPlan(documentsForPass('notions', prepared, 1), empty, {
      pass: 'notions',
      document: { index: 1, fileName: 'b' },
    });

    expect(provider.calls[0].documents).toHaveLength(1);
    expect(provider.calls[0].documents[0].fileName).toBe('b.pdf');
  });

  it('la passe chapitres, elle, les reçoit TOUS', () => {
    // Sans le cours, le modèle invente des intitulés au lieu de reprendre ceux
    // du document, et ne sait pas d'où viennent les notions à répartir.
    const prepared = [doc('a'), doc('b')];
    expect(documentsForPass('chapters', prepared)).toHaveLength(2);
  });

  it('un index de document hors bornes ne rend rien, il ne lève pas', () => {
    expect(documentsForPass('notions', [doc('a')], 7)).toEqual([]);
  });

  it('la passe notions SANS index est une erreur de programmation, pas un défaut', () => {
    // Retomber silencieusement sur « tous les documents » rouvrirait le poste
    // de coût que l'inversion vient de fermer.
    expect(() => documentsForPass('notions', [doc('a')])).toThrow(/index/);
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

describe('withChapterRetry — une relance, jamais deux (§16.18)', () => {
  /** Fournisseur factice qui rend les découpages demandés, dans l'ordre. */
  function chapterProvider(counts: number[]) {
    const provider = recordingProvider();
    let call = 0;
    const original = provider.documentToPlan;
    provider.documentToPlan = async (documents, existing, scope) => {
      const n = counts[Math.min(call, counts.length - 1)];
      call += 1;
      const result = await original(documents, existing, scope);
      return { ...result, plan: { chapters: Array.from({ length: n }, (_, i) => ({ ref: `ch${i + 1}`, name: `Chapitre ${i + 1}` })) } };
    };
    return provider;
  }

  /** Ce que fait `ingestChapters`, sans la base : appeler, compter, relancer. */
  async function pass(provider: ReturnType<typeof chapterProvider>) {
    return withChapterRetry(
      (retry) => provider.documentToPlan([], empty, { pass: 'chapters', notions: [], retry }),
      (result) => (result.plan as { chapters: unknown[] }).chapters.length,
      (result) => (result.plan as { chapters: { name: string }[] }).chapters.map((c) => c.name),
    );
  }

  it('28 puis 6 → on garde 6, en 2 appels', async () => {
    expect(needsChapterRetry(28)).toBe(true);
    const provider = chapterProvider([28, 6]);
    const { result, attempts } = await pass(provider);
    expect(attempts).toBe(2);
    expect(provider.calls).toHaveLength(2);
    expect(chapterCount(result)).toBe(6);
  });

  it('28 deux fois → on écrit 28, en 2 appels, sans exception', async () => {
    // Jamais de blocage : la seconde réponse fait foi quelle qu'elle soit.
    const provider = chapterProvider([28, 28]);
    const { result, attempts } = await pass(provider);
    expect(attempts).toBe(2);
    expect(provider.calls).toHaveLength(2);
    expect(chapterCount(result)).toBe(28);
  });

  it('6 d’emblée → un seul appel, aucune relance', async () => {
    const provider = chapterProvider([6]);
    const { attempts } = await pass(provider);
    expect(attempts).toBe(1);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].scope.pass === 'chapters' && provider.calls[0].scope.retry).toBeUndefined();
  });

  it('la relance rend au modèle SES PROPRES chapitres, pas seulement leur nombre', async () => {
    // Sans les noms, le modèle ne peut pas juger si « 28 » recouvre 28
    // sous-parties d'un même thème ou 28 sujets distincts : il ne saurait
    // qu'obéir, et raboterait un découpage parfois justifié.
    const provider = chapterProvider([28, 6]);
    await pass(provider);
    const second = provider.calls[1].scope;
    const previous = second.pass === 'chapters' ? second.retry?.previous : undefined;
    expect(previous).toHaveLength(28);
    expect(previous?.[0]).toBe('Chapitre 1');
  });

  it('un découpage reconduit à l’identique est accepté, pas re-relancé', async () => {
    // La relance est une vérification : si le modèle confirme son découpage,
    // c'est une réponse valide — jamais un troisième appel.
    const provider = chapterProvider([28, 28]);
    const { attempts } = await pass(provider);
    expect(attempts).toBe(2);
    expect(provider.calls).toHaveLength(2);
  });

  it('le seuil de relance ne se déclenche qu’au-delà du plausible', () => {
    expect(needsChapterRetry(MAX_PLAUSIBLE_CHAPTERS)).toBe(false);
    expect(needsChapterRetry(MAX_PLAUSIBLE_CHAPTERS + 1)).toBe(true);
  });
});

function chapterCount(result: { plan: unknown }): number {
  return (result.plan as { chapters: unknown[] }).chapters.length;
}

describe('shouldCacheDocuments — le marqueur n’est pas gratuit (§16.17)', () => {
  it('un document utilisé une seule fois ne reçoit pas de marqueur', () => {
    // Le poser coûterait 1,25× au lieu de 1× : une perte sèche de 25 %.
    expect(shouldCacheDocuments(1)).toBe(false);
  });

  it('aucun document du tout : rien à mettre en cache', () => {
    expect(shouldCacheDocuments(0)).toBe(false);
  });

  it('deux lectures ou plus : le cache paie', () => {
    // Seuil de rentabilité en TTL 5 minutes : 1,25× + 0,1× contre 2×.
    expect(shouldCacheDocuments(2)).toBe(true);
    expect(shouldCacheDocuments(12)).toBe(true);
  });
});

// ─── « Aucun chapitre » : une décision, ou un oubli ? ────────────────────────
//
// Deux raisons de tester ça ici plutôt que de le regarder dans l'app :
//   • `setAside` borne la SEULE suppression du système (`planImportCleanup`) —
//     y laisser entrer une notion que le modèle n'a jamais jugée efface du
//     travail saisi à la main ;
//   • `effective` décide d'un `update` par lot : une ligne de trop et une notion
//     perd son chapitre sans que personne ne l'ait demandé.
describe('splitUnplaced', () => {
  const nowhere = new Map<string, string | null>();

  it('écarte une redite, et elle seule', () => {
    const split = splitUnplaced(
      [{ notionRef: 'n1' }, { notionRef: 'n2' }],
      new Set(['n1']),
      new Map([['n1', 'c1'], ['n2', 'c1']]),
    );
    expect(split.setAside).toEqual(['n1']);
    expect(split.stranded).toEqual(['n2']);
  });

  it('laisse en place une notion que le modèle n’a pas su ranger', () => {
    const split = splitUnplaced([{ notionRef: 'n1' }], new Set(), new Map([['n1', 'c1']]));
    // Ni écartée ni réécrite : sa ligne ne part pas en base du tout.
    expect(split.setAside).toEqual([]);
    expect(split.stranded).toEqual(['n1']);
    expect(split.effective).toEqual([]);
  });

  it('ne préserve rien pour une notion qui n’était nulle part', () => {
    const split = splitUnplaced([{ notionRef: 'n1' }], new Set(), nowhere);
    expect(split.stranded).toEqual([]);
    // Elle reste dans les écritures : sans chapitre avant, sans chapitre après.
    expect(split.effective).toEqual([{ notionRef: 'n1' }]);
  });

  it('ne touche jamais à un rangement qui nomme un chapitre', () => {
    const assignments = [{ notionRef: 'n1', chapterRef: 'c2' }];
    const split = splitUnplaced(assignments, new Set(['n1']), new Map([['n1', 'c1']]));
    expect(split.setAside).toEqual([]);
    expect(split.stranded).toEqual([]);
    expect(split.effective).toEqual(assignments);
  });

  it('une redite sortie de nulle part reste une redite', () => {
    // Le cas de la notion NEUVE jugée redondante : elle n'a pas de chapitre à
    // conserver, et le ménage de fin doit pouvoir l'effacer.
    const split = splitUnplaced([{ notionRef: 'n1' }], new Set(['n1']), nowhere);
    expect(split.setAside).toEqual(['n1']);
    expect(split.stranded).toEqual([]);
  });
});
