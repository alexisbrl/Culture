// Détection d'un membre qui répond au hasard, et mise en pause.
//
// Pourquoi ces tests existent : le temps de réponse vient de l'ÉCRAN, donc d'une
// URL POST publique — c'est le contrat d'une entrée non fiable, l'un des deux
// critères de la discipline de tests du projet. Et depuis que la série de fautes
// mène à une vraie pause, un faux positif a un coût pour un membre honnête.
//
// Aucun accès réseau ni Supabase : `answerPace.ts` est volontairement pur.

import { describe, expect, it } from 'vitest';

import {
  PACE_BLOCK_MS,
  PACE_BLOCK_STREAK,
  PACE_MIN_MS,
  PACE_WARN_STREAK,
  fastMissStreak,
  paceVerdict,
  sanitizeAnswerMs,
  type AnswerPaceRow,
} from '@/lib/workshops/answerPace';

const NOW = 1_800_000_000_000;

/** Une réponse, décrite par ce qui compte : juste ou fausse, vite ou non. */
const row = (
  patch: Partial<AnswerPaceRow> = {},
): AnswerPaceRow => ({ answerMs: 900, correct: false, answeredAt: NOW, ...patch });

const miss = () => row();
const hit = () => row({ correct: true });
const slow = () => row({ answerMs: 12_000 });
const series = (n: number, make: () => AnswerPaceRow) => Array.from({ length: n }, make);

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

describe('la série de fautes expédiées', () => {
  it('ne compte que les fautes, et seulement les rapides', () => {
    expect(fastMissStreak(series(3, miss))).toBe(3);
    expect(fastMissStreak([miss(), slow(), miss()])).toBe(1);
    expect(fastMissStreak([hit(), miss(), miss()])).toBe(0);
  });

  it('une réponse non corrigée automatiquement casse la série', () => {
    // Ni juste ni fausse : rien ne permet d'accuser. On préfère laisser passer
    // un cas plutôt que mettre en pause quelqu'un dont on ignore s'il a raison.
    expect(fastMissStreak([miss(), row({ correct: null }), miss()])).toBe(1);
  });

  it('une réponse dont le temps n’a pas été mesuré casse la série aussi', () => {
    expect(fastMissStreak([miss(), row({ answerMs: null }), miss()])).toBe(1);
  });

  it('le seuil est bien AU-DESSOUS de trois secondes', () => {
    expect(fastMissStreak(series(3, () => row({ answerMs: PACE_MIN_MS })))).toBe(0);
    expect(fastMissStreak(series(3, () => row({ answerMs: PACE_MIN_MS - 1 })))).toBe(3);
  });
});

describe('ce qu’on fait de la série', () => {
  it('laisse tranquille en dessous de trois fautes rapides', () => {
    expect(paceVerdict(series(PACE_WARN_STREAK - 1, miss), NOW).state).toBe('ok');
  });

  it('avertit à trois', () => {
    expect(paceVerdict(series(PACE_WARN_STREAK, miss), NOW).state).toBe('warn');
  });

  it('met en pause à cinq, cinq minutes après la dernière réponse', () => {
    const verdict = paceVerdict(series(PACE_BLOCK_STREAK, miss), NOW);
    expect(verdict).toEqual({ state: 'blocked', until: NOW + PACE_BLOCK_MS });
  });

  it('laisse repartir une fois la pause passée', () => {
    const verdict = paceVerdict(series(PACE_BLOCK_STREAK, miss), NOW + PACE_BLOCK_MS + 1);
    expect(verdict.state).toBe('ok');
  });

  it('n’inquiète jamais quelqu’un de rapide ET juste', () => {
    // Quel que soit le nombre de propositions : on compte les fautes, pas un
    // score comparé au hasard, qui ne voudrait rien dire sur une réponse écrite.
    expect(paceVerdict(series(PACE_BLOCK_STREAK, hit), NOW).state).toBe('ok');
  });

  it('une seule bonne réponse remet le compteur à zéro', () => {
    const rows = [hit(), ...series(PACE_BLOCK_STREAK, miss)];
    expect(paceVerdict(rows, NOW).state).toBe('ok');
  });

  it('ne tranche rien sans aucune réponse', () => {
    expect(paceVerdict([], NOW).state).toBe('ok');
  });
});
