// Règles du tirage d'un exercice du parcours.
//
// Pourquoi ces tests existent, alors qu'on ne teste pas le rendu : ces règles
// décident de ce qu'un membre a le droit de voir, à partir d'un budget et d'un
// niveau restant que le navigateur transmet — c'est le contrat d'une entrée non
// fiable, l'un des deux critères de la discipline de tests du projet. Et parce
// que « deux niveaux au-dessus » et « la somme des énoncés » sont exactement le
// genre de règle qu'une relecture croit vérifier et se trompe.
//
// Aucun accès réseau ni Supabase : `parcoursDraw.ts` est volontairement pur.

import { describe, expect, it } from 'vitest';

import { EXERCISE_BLOOM_BUDGET } from '@/lib/workshops/examTypes';
import {
  candidateCost,
  isReachable,
  selectCandidate,
  statementCost,
  type DrawCandidate,
} from '@/lib/workshops/parcoursDraw';

/** Une grappe : un tableau d'énoncés, chacun donné comme « notion → niveau ». */
const grappe = (groupId: string, ...statements: Record<string, number>[]): DrawCandidate => ({
  groupId,
  statements: statements.map((notionBloom) => ({ notionBloom: notionBloom as never })),
});

describe('ce qu’une question coûte dans les 12 niveaux', () => {
  it('un énoncé coûte le plus haut niveau qu’il demande', () => {
    expect(statementCost({ notionBloom: { a: 1, b: 3 } as never })).toBe(3);
  });

  it('un énoncé sans notion coûte quand même : il occupe le membre', () => {
    expect(statementCost({ notionBloom: {} })).toBe(1);
  });

  it('une grappe coûte la somme de ses énoncés, pas leur maximum', () => {
    // Trois énoncés « mémoriser » posés d'un bloc, c'est bien trois fois le
    // travail d'un seul.
    expect(candidateCost(grappe('g', { a: 1 }, { b: 1 }, { c: 1 }))).toBe(3);
    expect(candidateCost(grappe('g', { a: 4 }, { b: 3 }))).toBe(7);
  });

  it('douze énoncés « mémoriser » remplissent exactement un exercice', () => {
    const douze = grappe('g', ...Array.from({ length: 12 }, () => ({ a: 1 })));
    expect(candidateCost(douze)).toBe(EXERCISE_BLOOM_BUDGET);
  });
});

describe('ce qu’un membre a le droit de recevoir', () => {
  // Score de maîtrise : 10 points par niveau atteint. 0 → niveau 0, 15 →
  // niveau 1, 30 → niveau 3.
  it('accepte jusqu’à deux niveaux au-dessus du niveau atteint', () => {
    const scores = { a: 15 }; // niveau 1 atteint → 1, 2 et 3 acceptés
    expect(isReachable(grappe('g', { a: 1 }), scores)).toBe(true);
    expect(isReachable(grappe('g', { a: 2 }), scores)).toBe(true);
    expect(isReachable(grappe('g', { a: 3 }), scores)).toBe(true);
    expect(isReachable(grappe('g', { a: 4 }), scores)).toBe(false);
  });

  it('une notion jamais travaillée plafonne à « comprendre »', () => {
    expect(isReachable(grappe('g', { a: 2 }), {})).toBe(true);
    expect(isReachable(grappe('g', { a: 3 }), {})).toBe(false);
  });

  it('une seule notion hors de portée écarte toute la grappe', () => {
    // Elle se pose d'un bloc : sa question liée compte autant que la principale.
    expect(isReachable(grappe('g', { a: 1, b: 4 }), { a: 40 })).toBe(false);
    expect(isReachable(grappe('g', { a: 1 }, { b: 4 }), { a: 40 })).toBe(false);
  });
});

describe('le choix de la prochaine question', () => {
  const ctx = (patch: Partial<Parameters<typeof selectCandidate>[1]> = {}) => ({
    scores: {},
    seen: new Set<string>(),
    remaining: EXERCISE_BLOOM_BUDGET,
    ...patch,
  });

  it('sert d’abord la notion la moins maîtrisée', () => {
    const faible = grappe('faible', { a: 1 });
    const avancee = grappe('avancee', { b: 1 });
    const out = selectCandidate([avancee, faible], ctx({ scores: { a: 0, b: 20 } }));
    expect(out.candidate?.groupId).toBe('faible');
  });

  it('ne repropose jamais une question déjà répondue', () => {
    const out = selectCandidate([grappe('vue', { a: 1 })], ctx({ seen: new Set(['vue']) }));
    expect(out.candidate).toBeNull();
    expect(out.failure).toBe('exhausted');
  });

  it('écarte ce qui dépasse le niveau du membre, sans crier au stock épuisé à tort', () => {
    // Rien à portée = rien à poser : c'est bien la même impasse qu'un stock
    // vide, et c'est à la recharge de la combler.
    const out = selectCandidate([grappe('dure', { a: 4 })], ctx());
    expect(out.failure).toBe('exhausted');
  });

  it('arrête l’exercice quand plus rien n’entre dans ce qui reste du budget', () => {
    const out = selectCandidate([grappe('grosse', { a: 2 }, { a: 2 })], ctx({ remaining: 1, scores: { a: 40 } }));
    expect(out.candidate).toBeNull();
    // « budget » et non « exhausted » : il reste des questions, c'est
    // l'exercice qui touche à sa fin. Rien à signaler.
    expect(out.failure).toBe('budget');
  });

  it('rend le coût de la question tirée, pour que l’exercice sache où il en est', () => {
    const out = selectCandidate([grappe('g', { a: 3 }, { a: 1 })], ctx({ scores: { a: 40 } }));
    expect(out.cost).toBe(4);
  });

  it('départage les ex æquo au hasard, sans quoi le même exercice reviendrait', () => {
    const candidates = [grappe('un', { a: 1 }), grappe('deux', { a: 1 }), grappe('trois', { a: 1 })];
    expect(selectCandidate(candidates, ctx(), () => 0).candidate?.groupId).toBe('un');
    expect(selectCandidate(candidates, ctx(), () => 0.99).candidate?.groupId).toBe('trois');
  });
});
