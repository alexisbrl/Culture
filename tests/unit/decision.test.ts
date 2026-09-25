// La lecture d'une probabilité rendue par un décideur — le contrat d'une entrée
// non fiable : elle décide d'écrire, ou non, le cours de tout un atelier.

import { describe, expect, it } from 'vitest';

import { isYes, readProbability } from '@/lib/decision';

describe('readProbability', () => {
  it('garde un nombre entre 0 et 1', () => {
    expect(readProbability(0)).toBe(0);
    expect(readProbability(0.73)).toBe(0.73);
    expect(readProbability(1)).toBe(1);
  });

  it('tout le reste vaut « pas de réponse », jamais un oui ou un non', () => {
    // C'est à l'appelant de dire ce que vaut un silence : pour l'étape 0, écrire.
    for (const raw of [Number.NaN, -0.1, 1.2, '0.8', null, undefined, true]) {
      expect(readProbability(raw)).toBeNull();
    }
  });
});

describe('isYes', () => {
  it('tranche au milieu par défaut', () => {
    expect(isYes(0.5)).toBe(true);
    expect(isYes(0.49)).toBe(false);
  });

  it('accepte un seuil propre à l’usage', () => {
    expect(isYes(0.6, 0.8)).toBe(false);
  });
});
