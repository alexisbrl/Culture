// Détection d'un membre qui répond au hasard.
//
// Pourquoi ces tests existent : le temps de réponse vient de l'ÉCRAN, donc d'une
// URL POST publique — c'est le contrat d'une entrée non fiable, l'un des deux
// critères de la discipline de tests du projet. Et la règle a trois seuils qui
// se lisent vite de travers.
//
// Aucun accès réseau ni Supabase : `answerPace.ts` est volontairement pur.

import { describe, expect, it } from 'vitest';

import {
  PACE_MIN_MS,
  PACE_WINDOW,
  looksRandom,
  sanitizeAnswerMs,
  type AnswerPaceRow,
} from '@/lib/workshops/answerPace';

const fast = (correct: boolean | null = false): AnswerPaceRow => ({ answerMs: 900, correct });
const slow = (correct: boolean | null = false): AnswerPaceRow => ({ answerMs: 12_000, correct });
const five = (row: AnswerPaceRow) => Array.from({ length: PACE_WINDOW }, () => row);

describe('le temps rapporté par l’écran', () => {
  it('accepte une durée plausible', () => {
    expect(sanitizeAnswerMs(2500)).toBe(2500);
  });

  it('traite l’absurde comme « pas mesuré », jamais comme une preuve', () => {
    // Ni à charge (une valeur négative ne doit pas passer pour instantanée) ni
    // à décharge (une heure de « réflexion » ne doit pas blanchir).
    expect(sanitizeAnswerMs(-1)).toBeNull();
    expect(sanitizeAnswerMs(99_999_999)).toBeNull();
    expect(sanitizeAnswerMs('vite')).toBeNull();
    expect(sanitizeAnswerMs(undefined)).toBeNull();
  });
});

describe('quand on avertit', () => {
  it('avertit après cinq réponses rapides et fausses', () => {
    expect(looksRandom(five(fast(false)))).toBe(true);
  });

  it('n’avertit pas sur une série trop courte', () => {
    expect(looksRandom(five(fast(false)).slice(0, PACE_WINDOW - 1))).toBe(false);
  });

  it('n’avertit pas quelqu’un de rapide ET juste : il connaît son cours', () => {
    const rows = [fast(true), fast(true), fast(true), fast(false), fast(false)];
    expect(looksRandom(rows)).toBe(false);
  });

  it('tolère une bonne réponse dans le lot — c’est ce que donne le hasard', () => {
    const rows = [fast(true), fast(false), fast(false), fast(false), fast(false)];
    expect(looksRandom(rows)).toBe(true);
  });

  it('une seule réponse posée suffit à casser la série', () => {
    const rows = [fast(false), fast(false), slow(false), fast(false), fast(false)];
    expect(looksRandom(rows)).toBe(false);
  });

  it('une réponse dont le temps n’a pas été mesuré casse la série aussi', () => {
    // Les réponses d'avant cette fonctionnalité ne doivent accuser personne.
    const rows = [fast(false), { answerMs: null, correct: false }, fast(false), fast(false), fast(false)];
    expect(looksRandom(rows)).toBe(false);
  });

  it('quand rien n’était corrigeable, la vitesse seule tranche', () => {
    // Cinq questions ouvertes traitées en moins de trois secondes chacune ne se
    // font pas de bonne foi.
    expect(looksRandom(five(fast(null)))).toBe(true);
  });

  it('le seuil est bien au-dessous de trois secondes, pas à trois secondes', () => {
    expect(looksRandom(five({ answerMs: PACE_MIN_MS, correct: false }))).toBe(false);
    expect(looksRandom(five({ answerMs: PACE_MIN_MS - 1, correct: false }))).toBe(true);
  });
});
