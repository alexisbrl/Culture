// Règle de déclenchement de la recharge automatique.
//
// Pourquoi ces tests existent : ce seuil décide, seul, d'un appel payant au
// modèle. Se tromper d'un cran dans un sens ne recharge jamais et laisse des
// membres sans question ; se tromper dans l'autre relance une génération à
// chaque exercice. La MESURE, elle, vit en base (`parcours_radar`) et ne se
// teste pas ici — aucun test ne touche à Supabase.

import { describe, expect, it } from 'vitest';

import {
  RADAR_TARGET,
  RADAR_TRIGGER,
  needsRefill,
  shortages,
  type RadarRow,
} from '@/lib/workshops/parcoursRadar';

const couple = (available: number, members = 1): RadarRow => ({
  notionId: `n${available}-${members}`,
  bloomLevel: 2,
  available,
  members,
});

describe('quand recharger', () => {
  it('recharge dès qu’un couple tombe à une seule question disponible', () => {
    expect(needsRefill([couple(4), couple(RADAR_TRIGGER)])).toBe(true);
  });

  it('ne recharge pas tant que tous les couples ont de l’avance', () => {
    expect(needsRefill([couple(2), couple(3), couple(9)])).toBe(false);
  });

  it('un chapitre sans aucun couple à la frontière ne déclenche rien', () => {
    // Tous les membres au niveau maximum sur toutes les notions : plus rien à
    // conquérir, donc rien à réapprovisionner.
    expect(needsRefill([])).toBe(false);
  });
});

describe('ce qu’il faut faire produire', () => {
  it('complète chaque couple en manque jusqu’à la cible', () => {
    const [premier] = shortages([couple(0)]);
    expect(premier.missing).toBe(RADAR_TARGET);
    expect(shortages([couple(1)])[0].missing).toBe(RADAR_TARGET - 1);
  });

  it('ignore les couples qui ont déjà de quoi tenir', () => {
    expect(shortages([couple(2), couple(4)])).toHaveLength(0);
  });

  it('sert le plus démuni d’abord, puis le couple qui concerne le plus de monde', () => {
    const rows = [couple(1, 9), couple(0, 1), couple(1, 2)];
    expect(shortages(rows).map((s) => [s.available, s.members])).toEqual([
      [0, 1],
      [1, 9],
      [1, 2],
    ]);
  });
});
