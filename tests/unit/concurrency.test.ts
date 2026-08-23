import { describe, expect, it, vi } from 'vitest';

import { INGEST_CONCURRENCY, mapWithConcurrency } from '@/lib/ingest/concurrency';

// Cet ordonnanceur décide quels appels au modèle partent, et combien à la fois.
// Un élément traité deux fois, c'est une facture doublée ; un élément sauté,
// c'est un chapitre sans questions et personne pour s'en apercevoir. Il est pur
// (aucun réseau, aucune base) — donc vérifiable sans dépenser un centime.

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('traite chaque élément exactement une fois', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { seen.push(n); });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rend les résultats dans l’ordre de l’ENTRÉE, pas des réponses', async () => {
    // Le premier élément est le plus lent : sans garantie d'ordre, il finirait
    // dernier et tout ce qu'on compte ensuite deviendrait irreproductible.
    const results = await mapWithConcurrency([30, 20, 10, 0], 4, async (delay, i) => {
      await tick(delay);
      return i;
    });
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it('ne dépasse jamais la limite d’appels simultanés', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight -= 1;
    });
    expect(peak).toBe(4);
  });

  it('ne lance pas plus de fils que d’éléments', async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2], 8, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight -= 1;
    });
    expect(peak).toBe(2);
  });

  it('reprend du travail dès qu’un fil se libère', async () => {
    // Un élément lent ne doit pas bloquer la file derrière lui : avec 2 fils et
    // 4 éléments dont le premier est long, les trois autres passent quand même.
    const order: number[] = [];
    await mapWithConcurrency([50, 1, 1, 1], 2, async (delay, i) => {
      await tick(delay);
      order.push(i);
    });
    expect(order[order.length - 1]).toBe(0);
  });

  it('rapporte l’avancement après chaque élément terminé', async () => {
    const onSettled = vi.fn();
    await mapWithConcurrency([1, 2, 3], 2, async () => {}, onSettled);
    expect(onSettled).toHaveBeenCalledTimes(3);
    expect(onSettled.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3]);
    expect(onSettled.mock.calls.every((c) => c[1] === 3)).toBe(true);
  });

  it('accepte une liste vide sans rien lancer', async () => {
    const task = vi.fn();
    await expect(mapWithConcurrency([], 4, task)).resolves.toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });

  it('remonte la première erreur', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('échec du lot 2');
        return n;
      }),
    ).rejects.toThrow('échec du lot 2');
  });

  it('refuse une limite absurde plutôt que de tout sérialiser en silence', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow('Concurrence invalide');
  });

  it('la limite retenue reste raisonnable face aux quotas du fournisseur', () => {
    expect(INGEST_CONCURRENCY).toBeGreaterThan(1);
    expect(INGEST_CONCURRENCY).toBeLessThanOrEqual(8);
  });
});
