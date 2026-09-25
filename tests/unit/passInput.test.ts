import { describe, expect, it } from 'vitest';

import {
  contextNotions,
  createBudgetLedger,
  documentsForPass,
  pickExistingQuestions,
  type ExistingQuestion,
  MAX_PLAUSIBLE_CHAPTERS,
  MIN_PLAUSIBLE_CHAPTERS,
  needsChapterRetry,
  packDemand,
  planFreeParcoursCalls,
  QUESTIONS_PER_PARCOURS_CALL,
  withChapterRetry,
} from '@/lib/ingest/passInput';
import { chapterStartBudgets, type QuestionDemand } from '@/lib/ingest/demand';
import { MAX_QUESTIONS_PER_IMPORT } from '@/lib/ingest/prompt';
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

  it('la passe chapitres reçoit ce qu’on lui a préparé', () => {
    // Ses seules pages pauvres en texte (`composeChaptersInput`).
    expect(documentsForPass('chapters', prepared)).toEqual(prepared);
  });

  it('la passe questions n’en reçoit AUCUN', () => {
    expect(documentsForPass('questions', prepared)).toHaveLength(0);
  });

  it('l’étape 0 reçoit tout le corpus quand l’écriture est décidée, rien sinon', () => {
    // Le corpus est le plus gros poste de la facture : il ne part que pour écrire.
    expect(documentsForPass('resource', prepared, true)).toEqual(prepared);
    expect(documentsForPass('resource', prepared, false)).toHaveLength(0);
    expect(documentsForPass('resource', prepared)).toHaveLength(0);
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

  it('les redites n’en reçoivent aucun', () => {
    const prepared = [doc('a'), doc('b')];
    expect(documentsForPass('redites', prepared)).toHaveLength(0);
  });

  it('l’étape notions d’un chapitre reçoit ses extraits, et rien d’autre', () => {
    // Les extraits sont composés en amont (`composeChapterSlices`) : ils ne
    // contiennent déjà que les pages du chapitre.
    expect(documentsForPass('notions', [doc('a'), doc('b')])).toEqual([doc('a'), doc('b')]);
  });
});

describe('packDemand — des appels de huit questions pour le parcours', () => {
  const d = (notionId: string, bloomLevel: 1 | 2 | 3 | 4, count: number): QuestionDemand => ({ notionId, bloomLevel, count });
  const total = (call: QuestionDemand[]) => call.reduce((sum, item) => sum + item.count, 0);

  it('des appels pleins, et le dernier s’ajuste', () => {
    const calls = packDemand([d('a', 1, 13), d('b', 1, 11)], ['a', 'b']);
    expect(calls.map(total)).toEqual([8, 8, 8]);
  });

  it('les questions d’une notion restent ensemble quand la place le permet', () => {
    const calls = packDemand([d('a', 1, 3), d('b', 1, 3), d('c', 1, 2)], ['a', 'b', 'c']);
    expect(calls).toHaveLength(1);
    expect(calls[0].map((i) => i.notionId)).toEqual(['a', 'b', 'c']);
  });

  it('une notion qui déborde est coupée ENTRE ses niveaux, rangés dans l’ordre', () => {
    // L'exemple d'Alexis (22/09/2026) : N1 demande 10 questions sur trois niveaux.
    const calls = packDemand(
      [d('n1', 3, 2), d('n1', 1, 4), d('n1', 2, 4), d('n2', 1, 4), d('n3', 1, 3)],
      ['n1', 'n2', 'n3'],
    );
    expect(calls.map(total)).toEqual([8, 8, 1]);
    // Premier appel : les niveaux 1 et 2 de N1 ; le niveau 3 part avec N2.
    expect(calls[0]).toEqual([d('n1', 1, 4), d('n1', 2, 4)]);
    expect(calls[1]).toEqual([d('n1', 3, 2), d('n2', 1, 4), d('n3', 1, 2)]);
  });

  it('suit l’ordre du chapitre, jamais celui de la demande', () => {
    const calls = packDemand([d('b', 1, 2), d('a', 1, 2)], ['a', 'b']);
    expect(calls[0].map((i) => i.notionId)).toEqual(['a', 'b']);
  });

  it('additionne deux entrées du même couple, ignore le vide et l’inconnu', () => {
    const calls = packDemand([d('a', 1, 2), d('a', 1, 3), d('b', 1, 0), d('x', 1, 4)], ['a', 'b']);
    expect(calls).toEqual([[d('a', 1, 5)]]);
  });

  it('ne perd ni n’invente aucune question', () => {
    const demand = [d('a', 1, 17), d('a', 2, 5), d('b', 3, 9), d('c', 1, 1), d('d', 4, 30)];
    const calls = packDemand(demand, ['a', 'b', 'c', 'd']);
    expect(calls.reduce((sum, c) => sum + total(c), 0)).toBe(62);
    expect(calls.every((c) => total(c) <= QUESTIONS_PER_PARCOURS_CALL)).toBe(true);
    expect(calls.slice(0, -1).every((c) => total(c) === QUESTIONS_PER_PARCOURS_CALL)).toBe(true);
  });

  it('une demande vide ne coûte aucun appel, une taille nulle est refusée', () => {
    expect(packDemand([], ['a'])).toEqual([]);
    expect(() => packDemand([d('a', 1, 2)], ['a'], 0)).toThrow();
  });
});

describe('planFreeParcoursCalls — la consigne libre, même taille d’appel', () => {
  const notions = (n: number) => Array.from({ length: n }, (_, i) => `n${i + 1}`);

  it('24 questions sur 30 notions : trois appels de 8, notions en tranches contiguës', () => {
    const calls = planFreeParcoursCalls(notions(30), 24);
    expect(calls.map((c) => c.budget)).toEqual([8, 8, 8]);
    expect(calls.map((c) => c.notions.length)).toEqual([10, 10, 10]);
    expect(calls.flatMap((c) => c.notions)).toEqual(notions(30));
  });

  it('jamais plus d’appels que de notions', () => {
    const calls = planFreeParcoursCalls(notions(2), 24);
    expect(calls.map((c) => c.budget)).toEqual([12, 12]);
  });

  it('rien à faire sans budget ou sans notion', () => {
    expect(planFreeParcoursCalls(notions(3), 0)).toEqual([]);
    expect(planFreeParcoursCalls([], 24)).toEqual([]);
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
      (retry) => provider.documentToPlan([], empty, { pass: 'chapters', corpusText: '', fileNames: [], retry }),
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

  it('un découpage trop GROSSIER relance aussi, à chaque import', () => {
    // Un cours entier en deux chapitres entasse tout dans deux boîtes : le
    // rangement n'a plus rien à distinguer. Et on ne sait jamais d'avance si un
    // cours a été changé de fond en comble (01/09/2026).
    expect(needsChapterRetry(MIN_PLAUSIBLE_CHAPTERS)).toBe(false);
    expect(needsChapterRetry(MIN_PLAUSIBLE_CHAPTERS - 1)).toBe(true);
    expect(needsChapterRetry(0)).toBe(true);
  });
});

function chapterCount(result: { plan: unknown }): number {
  return (result.plan as { chapters: unknown[] }).chapters.length;
}

describe('contextNotions', () => {
  const chapter = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  it('montre tout le chapitre hors du lot, pas seulement les notions visées', () => {
    expect(contextNotions(chapter, new Set(['a']), new Set(['a', 'b'])).map((n) => n.id)).toEqual(['b', 'c', 'd', 'e']);
  });

  it("au-delà du plafond, garde les notions visées d'abord, dans l'ordre du chapitre", () => {
    const kept = contextNotions(chapter, new Set(['a']), new Set(['e']), 3);
    expect(kept.map((n) => n.id)).toEqual(['b', 'e']);
  });
});

describe('pickExistingQuestions', () => {
  const q = (content: string, levels: Record<string, number | null>, createdAt: string): ExistingQuestion => ({
    content,
    notionIds: Object.keys(levels),
    levels,
    createdAt,
  });

  it('prend le niveau demandé, puis les voisins, puis le plus éloigné', () => {
    const stock = [q('n4', { a: 4 }, '1'), q('n1', { a: 1 }, '1'), q('n2', { a: 2 }, '1'), q('n3', { a: 3 }, '2')];
    const picked = pickExistingQuestions(stock, new Map([['a', [2]]]), 3);
    expect(picked.map((x) => x.content)).toEqual(['n2', 'n3', 'n1']);
  });

  it("à niveau égal, les plus récentes d'abord ; sans niveau demandé, la date seule décide", () => {
    const stock = [q('vieille', { a: 1 }, '2026-01-01'), q('récente', { a: 1 }, '2026-09-01')];
    expect(pickExistingQuestions(stock, new Map([['a', []]]), 1).map((x) => x.content)).toEqual(['récente']);
  });

  it("répartit le plafond entre les notions, et la part d'une notion pauvre revient aux autres", () => {
    const stock = [
      q('a1', { a: 1 }, '3'), q('a2', { a: 1 }, '2'), q('a3', { a: 1 }, '1'),
      q('b1', { b: 1 }, '1'),
    ];
    const picked = pickExistingQuestions(stock, new Map([['a', [1]], ['b', [1]]]), 3);
    expect(picked.map((x) => x.content).sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it("ne compte qu'une fois une question reliée à deux notions du lot", () => {
    const both = q('commune', { a: 1, b: 1 }, '1');
    expect(pickExistingQuestions([both], new Map([['a', [1]], ['b', [1]]]))).toEqual([both]);
  });
});

describe('createBudgetLedger — la part du plafond, chapitre par chapitre (§7.2)', () => {
  // Les chapitres démarrent leurs questions dans l'ordre où leur étape notions
  // finit : aucun ordre ne doit permettre de dépasser le plafond, ni priver un
  // chapitre de sa part.
  const chapters = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, position: i }));
  const shares = chapterStartBudgets(chapters);

  function shuffled<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let s = seed;
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  it.each([1, 2, 3, 4, 5])('ordre de départ quelconque (%i) : jamais au-delà du plafond, chacun sa part', (seed) => {
    const ledger = createBudgetLedger(shares);
    const granted = new Map<string, number>();
    // Chaque chapitre demande par appels de 8, et en redemande trop.
    for (const chapter of shuffled(chapters, seed)) {
      for (let call = 0; call < 5; call++) {
        const got = ledger.reserve(chapter.id, QUESTIONS_PER_PARCOURS_CALL);
        granted.set(chapter.id, (granted.get(chapter.id) ?? 0) + got);
      }
    }
    expect(ledger.total).toBeLessThanOrEqual(MAX_QUESTIONS_PER_IMPORT);
    for (const chapter of chapters) expect(granted.get(chapter.id)).toBe(shares.get(chapter.id));
  });

  it('un chapitre ne puise jamais dans la part d’un autre', () => {
    const ledger = createBudgetLedger(new Map([['a', 10], ['b', 10]]));
    expect(ledger.reserve('a', 25)).toBe(10);
    expect(ledger.reserve('a', 1)).toBe(0);
    expect(ledger.reserve('b', 8)).toBe(8);
    expect(ledger.reserve('inconnu', 8)).toBe(0);
  });

  it('ce qui n’a pas été écrit revient au chapitre', () => {
    const ledger = createBudgetLedger(new Map([['a', 10]]));
    ledger.reserve('a', 8);
    ledger.release('a', 3);
    expect(ledger.total).toBe(5);
    expect(ledger.reserve('a', 8)).toBe(5);
    ledger.release('a', 999);
    expect(ledger.total).toBe(0);
  });

  it('le plafond global tient même si les parts le dépassent', () => {
    const ledger = createBudgetLedger(new Map([['a', 400], ['b', 400]]), 500);
    expect(ledger.reserve('a', 400)).toBe(400);
    expect(ledger.reserve('b', 400)).toBe(100);
  });
});
