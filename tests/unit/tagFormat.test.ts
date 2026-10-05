// Mise au format d'un tag saisi dans le champ d'invitation.
//
// Pourquoi ces tests existent : le tag arrive d'une saisie libre et part tel
// quel au serveur — c'est le contrat d'une entrée non fiable.

import { describe, expect, it } from 'vitest';
import { normalizeTag } from '@/lib/tagFormat';

describe('normalizeTag', () => {
  it('retire le « # » et passe en majuscules', () => {
    expect(normalizeTag('#86qtxd')).toBe('86QTXD');
  });

  it('retire espaces et ponctuation d’un copier-coller', () => {
    expect(normalizeTag(' 86 QT-XD ')).toBe('86QTXD');
  });

  it('bloque les caractères exclus de l’alphabet sans les remplacer', () => {
    expect(normalizeTag('A0O1IB')).toBe('AB');
    expect(normalizeTag('aoib')).toBe('AB');
  });

  it('garde le L, qui fait partie de l’alphabet', () => {
    expect(normalizeTag('l2')).toBe('L2');
  });
});
