// Une question ne s'écrit que sur des notions qui existent. Contrat d'une
// entrée non fiable : la sortie du modèle, croisée avec l'état de la base au
// moment d'écrire — une notion a pu être supprimée pendant l'appel.

import { describe, expect, it } from 'vitest';

import { groupsWithLiveNotions } from '@/lib/ingest/liveNotions';

const q = (...refs: string[]) => ({ notions: refs.map((ref) => ({ ref })) });
const group = (name: string, ...questions: ReturnType<typeof q>[]) => ({ name, questions });
const same = (ref: string) => ref;

describe('groupsWithLiveNotions', () => {
  it('garde ce qui ne vise que des notions vivantes', () => {
    const { kept, dropped } = groupsWithLiveNotions([group('a', q('n1')), group('b', q('n1', 'n2'))], same, new Set(['n1', 'n2']));
    expect(kept.map((g) => g.name)).toEqual(['a', 'b']);
    expect(dropped).toBe(0);
  });

  it('n’écrit pas une question rattachée à une notion supprimée', () => {
    const { kept, dropped } = groupsWithLiveNotions([group('a', q('n1')), group('b', q('n1', 'gone'))], same, new Set(['n1']));
    expect(kept.map((g) => g.name)).toEqual(['a']);
    expect(dropped).toBe(1);
  });

  it('n’écrit pas une question sans notion', () => {
    expect(groupsWithLiveNotions([group('a', q())], same, new Set(['n1'])).kept).toEqual([]);
  });

  it('garde ou retire un groupe entier, jamais à moitié', () => {
    const { kept } = groupsWithLiveNotions([group('a', q('n1'), q('gone'))], same, new Set(['n1']));
    expect(kept).toEqual([]);
  });

  it('résout les références des notions créées par le même lot', () => {
    const created = new Map([['new-1', 'uuid-1']]);
    const resolve = (ref: string) => created.get(ref) ?? ref;
    expect(groupsWithLiveNotions([group('a', q('new-1'))], resolve, new Set(['uuid-1'])).kept).toHaveLength(1);
  });
});
