// Le réglage adaptatif des questions fermées envoyées à Jev : il ne doit rien
// perdre, rendre les réponses dans l'ordre, reculer sur une saturation et
// remonter quand tout passe.

import { describe, expect, it } from 'vitest';

import { adaptiveMap } from '@/lib/decision/pool';

const fast = { start: 4, max: 20, ratePerSecond: 1_000_000 };

describe('adaptiveMap', () => {
  it('traite tout, et rend les résultats dans l’ordre', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const { results } = await adaptiveMap(items, async (i) => {
      await new Promise((r) => setTimeout(r, Math.random() * 3));
      return { value: i * 2, congested: false };
    }, fast);
    expect(results).toEqual(items.map((i) => i * 2));
  });

  it('ne dépasse jamais le plafond en vol', async () => {
    let inFlight = 0;
    let peak = 0;
    await adaptiveMap(Array.from({ length: 40 }, (_, i) => i), async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return { value: null, congested: false };
    }, { start: 3, max: 3, ratePerSecond: 1_000_000 });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('monte quand tout passe', async () => {
    const { finalLimit } = await adaptiveMap(Array.from({ length: 100 }, (_, i) => i), async () => ({ value: null, congested: false }), fast);
    expect(finalLimit).toBeGreaterThan(4);
  });

  it('recule franchement sur une saturation', async () => {
    const { finalLimit, congestions } = await adaptiveMap(Array.from({ length: 20 }, (_, i) => i), async () => ({ value: null, congested: true }), { start: 16, max: 20, ratePerSecond: 1_000_000 });
    expect(congestions).toBe(20);
    expect(finalLimit).toBe(1);
  });

  it('respecte le débit plafond', async () => {
    const started = Date.now();
    await adaptiveMap(Array.from({ length: 6 }, (_, i) => i), async () => ({ value: null, congested: false }), { start: 6, max: 6, ratePerSecond: 50 });
    // Six départs à 20 ms d'écart : au moins 100 ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(95);
  });

  it('rend tout de suite une liste vide', async () => {
    expect((await adaptiveMap([], async () => ({ value: 1, congested: false }), fast)).results).toEqual([]);
  });
});
