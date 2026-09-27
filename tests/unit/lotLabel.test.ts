import { describe, expect, it, vi } from 'vitest';

// Le module lit le client Supabase à l'appel seulement : on le neutralise pour
// que l'import ne touche jamais au réseau (CLAUDE.md §7).
vi.mock('@/lib/supabase', () => ({ getSupabaseServerClient: () => { throw new Error('pas de base en test'); } }));

import { nextLotLabelName } from '@/lib/ingest/lotLabel';

// Le nom du lot suivant : un doublon ferait porter le même libellé à deux
// générations, et supprimer l'une emporterait l'autre.

describe('nextLotLabelName', () => {
  it('commence à 1 sans lot existant', () => {
    expect(nextLotLabelName(['Judo', 'Histoire'])).toBe('Lot IA n°1');
  });

  it('prend le plus grand numéro + 1, trous compris', () => {
    expect(nextLotLabelName(['Lot IA n°1', 'Lot IA n°4', 'Lot IA n°2'])).toBe('Lot IA n°5');
  });

  it('ignore les libellés qui ne sont pas des lots', () => {
    expect(nextLotLabelName(['Lot IA n°3 bis', 'Lot IA n°', 'lot ia n°9', 'Lot IA n°2'])).toBe('Lot IA n°3');
  });
});
