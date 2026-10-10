import { describe, expect, it } from 'vitest';

import { writeWorkshopDetails } from '@/lib/workshops/details';

// Réglages généraux d'un atelier : une écriture qui peut effacer ce qu'un autre
// gestionnaire vient de saisir (CLAUDE.md §7). Le client est un double qui
// enregistre la requête — aucun appel ne part vers Supabase.

type Recorded = { update?: Record<string, unknown>; filters: [string, string, unknown][] };

function fakeClient(rowsMatched: number) {
  const rec: Recorded = { filters: [] };
  const builder = {
    update(row: Record<string, unknown>) { rec.update = row; return builder; },
    eq(column: string, value: unknown) { rec.filters.push(['eq', column, value]); return builder; },
    is(column: string, value: unknown) { rec.filters.push(['is', column, value]); return builder; },
    select() {
      return Promise.resolve({ data: Array.from({ length: rowsMatched }, () => ({ id: 'w' })), error: null });
    },
  };
  const client = { from: () => builder };
  return { client: client as never, rec };
}

describe('writeWorkshopDetails', () => {
  it("n'écrit que les champs fournis", async () => {
    const { client, rec } = fakeClient(1);
    await writeWorkshopDetails(client, 'w', { emoji: '🎵' });
    expect(rec.update).toEqual({ emoji: '🎵' });
    expect(rec.filters).toEqual([['eq', 'id', 'w']]);
  });

  it("n'appelle pas la base quand rien ne change", async () => {
    const { client, rec } = fakeClient(1);
    expect(await writeWorkshopDetails(client, 'w', {})).toEqual({ success: true });
    expect(rec.update).toBeUndefined();
  });

  it("une annulation n'écrit que si la base contient encore ce qu'elle défait", async () => {
    const { client, rec } = fakeClient(1);
    const res = await writeWorkshopDetails(client, 'w', { name: 'Atelier' }, { name: 'Atelier math' });
    expect(res).toEqual({ success: true });
    expect(rec.filters).toEqual([['eq', 'id', 'w'], ['eq', 'name', 'Atelier math']]);
  });

  it('signale un conflit quand un autre gestionnaire a changé la valeur entre-temps', async () => {
    const { client } = fakeClient(0);
    const res = await writeWorkshopDetails(client, 'w', { name: 'Atelier' }, { name: 'Atelier math' });
    expect(res).toEqual({ success: false, conflict: true });
  });

  it('compare une valeur vide par « is null »', async () => {
    const { client, rec } = fakeClient(1);
    await writeWorkshopDetails(client, 'w', { coverImageUrl: 'x' }, { coverImageUrl: null });
    expect(rec.filters).toContainEqual(['is', 'cover_image_url', null]);
  });
});
