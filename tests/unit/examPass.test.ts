import { describe, expect, it } from 'vitest';

import {
  documentsForPass,
  callBudgets,
  planExamCalls,
  sliceProgram,
  splitBudget,
} from '@/lib/ingest/passInput';
import {
  EXAM_GROUP_SIZE,
  EXAM_QUESTIONS_PER_CALL,
  examBloomCounts,
  examGroupedCount,
} from '@/lib/ingest/prompt';

// La passe EXAMEN ne compte pas comme le parcours : un nombre TOTAL de questions
// pour tout le programme, découpé en appels parallèles (24/08/2026). Ce fichier
// tient les deux promesses qui rendent ce découpage sûr :
//
//   1. **rien n'est écrit deux fois** — deux appels ne voient jamais la même
//      partie du programme, alors qu'ils tournent en même temps et qu'aucun ne
//      voit ce que l'autre écrit ;
//   2. **rien n'est perdu** — la somme des budgets fait exactement le total
//      demandé, sinon un utilisateur qui demande 40 questions en obtient 36 sans
//      que rien ne le signale.
//
// Fonctions pures : aucun réseau, aucune base (CLAUDE.md §7).

const notion = (id: string) => ({ id, title: `notion ${id}` });

const program = (...sizes: number[]) =>
  sizes.map((size, i) => ({
    id: `ch${i + 1}`,
    name: `chapitre ${i + 1}`,
    notions: Array.from({ length: size }, (_, k) => notion(`c${i + 1}n${k + 1}`)),
  }));

describe('splitBudget — le total demandé est le total écrit', () => {
  it('répartit sans rien perdre quand ça ne tombe pas juste', () => {
    const parts = splitBudget(40, 3);
    expect(parts).toEqual([14, 13, 13]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(40);
  });

  it('donne le reste aux PREMIÈRES tranches — le début du cours', () => {
    expect(splitBudget(10, 4)).toEqual([3, 3, 2, 2]);
  });

  it('ne rend jamais zéro tranche', () => {
    expect(splitBudget(5, 0)).toEqual([5]);
  });
});

describe('sliceProgram — deux appels ne voient jamais la même notion', () => {
  it('découpe en tranches contiguës et n’oublie personne', () => {
    const slices = sliceProgram(program(5, 5), 2);
    const seen = slices.flatMap((s) => s.flatMap((c) => c.notions.map((n) => n.id)));

    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
    // L'ordre du cours est conservé : c'est ce qui permet à une question de
    // croiser des notions voisines.
    expect(seen).toEqual([
      'c1n1', 'c1n2', 'c1n3', 'c1n4', 'c1n5',
      'c2n1', 'c2n2', 'c2n3', 'c2n4', 'c2n5',
    ]);
  });

  it('coupe un gros chapitre en deux plutôt que d’équilibrer par chapitre', () => {
    // Un chapitre de 9 notions et un de 1 ne méritent pas le même budget : le
    // poids se mesure en notions, jamais en chapitres.
    const slices = sliceProgram(program(9, 1), 2);
    expect(slices[0].map((c) => c.id)).toEqual(['ch1']);
    expect(slices[0][0].notions).toHaveLength(5);
    // La seconde tranche voit la fin du premier chapitre ET le second : chaque
    // notion reste rattachée au chapitre dont elle vient.
    expect(slices[1].map((c) => c.id)).toEqual(['ch1', 'ch2']);
  });

  it('ne fabrique pas de tranche vide quand il y a moins de notions que d’appels', () => {
    const slices = sliceProgram(program(2), 4);
    expect(slices).toHaveLength(2);
    expect(slices.every((s) => s.flatMap((c) => c.notions).length > 0)).toBe(true);
  });

  it('un programme vide ne produit aucun appel', () => {
    expect(sliceProgram([], 4)).toEqual([]);
    expect(sliceProgram(program(0, 0), 4)).toEqual([]);
  });
});

describe('examBloomCounts — la répartition ne perd pas de question', () => {
  it('somme exactement le budget', () => {
    for (const budget of [1, 7, 10, 13, 40]) {
      const counts = examBloomCounts(budget);
      expect(counts[2] + counts[3] + counts[4]).toBe(budget);
    }
  });

  it('ne demande jamais de simple restitution : le niveau 1 n’existe pas ici', () => {
    expect(Object.keys(examBloomCounts(40))).toEqual(['2', '3', '4']);
  });

  it('« appliquer » domine', () => {
    const counts = examBloomCounts(40);
    expect(counts[3]).toBeGreaterThan(counts[2]);
    expect(counts[3]).toBeGreaterThan(counts[4]);
  });
});

describe('examGroupedCount — 60 % des questions s’enchaînent', () => {
  it('trois questions sur cinq, arrondi', () => {
    // Sur un examen entier de 40 questions : 24 en groupes et 16 seules.
    expect(examGroupedCount(40)).toBe(24);
    expect(examGroupedCount(10)).toBe(6);
  });
});

// ─── Le plan d'un examen (06/09/2026) ──────────────────────────────────────
//
// La proportion 60/40 se calcule désormais sur l'examen ENTIER, et chaque appel
// reçoit une forme homogène — que des groupes, ou que des questions isolées.
// Trois promesses à tenir, et ce sont elles qui remplacent la consigne
// « environ 60 % » laissée au modèle :
//
//   1. le total demandé est le total planifié (rien ne se perd dans la découpe) ;
//   2. un appel ne mélange jamais groupes et questions isolées ;
//   3. un appel groupé a toujours de quoi faire un groupe.
//
// Ce qu'on ne teste PAS, parce que ce n'est plus du ressort du plan : la taille
// des groupes. Elle est laissée au modèle (arbitrage d'Alexis — un groupe de six
// doit rester possible quand l'utilisateur le demande), et le découpage se
// contente d'appels pleins avec un dernier qui s'ajuste.

describe('callBudgets — des appels pleins, et le dernier s’ajuste', () => {
  it('remplit les appels, le reste au dernier', () => {
    expect(callBudgets(24, 6)).toEqual([6, 6, 6, 6]);
    expect(callBudgets(16, 6)).toEqual([6, 6, 4]);
    expect(callBudgets(4, 6)).toEqual([4]);
  });

  it('ne rend jamais un dernier appel trop court : il prend au précédent', () => {
    // 25 questions en groupes, ce serait 6+6+6+6+1 — et un « groupe » d'une
    // question n'existe pas. Le dernier appel prend donc au précédent.
    expect(callBudgets(25, 6, EXAM_GROUP_SIZE.min)).toEqual([6, 6, 6, 5, 2]);
    expect(callBudgets(7, 6, EXAM_GROUP_SIZE.min)).toEqual([5, 2]);
  });

  it('somme toujours le total demandé, sans dépasser la taille d’un appel', () => {
    for (const n of [1, 2, 3, 5, 7, 13, 24, 25, 41, 137]) {
      for (const min of [1, EXAM_GROUP_SIZE.min]) {
        const budgets = callBudgets(n, EXAM_QUESTIONS_PER_CALL, min);
        if (n < min) { expect(budgets).toEqual([]); continue; }
        expect(budgets.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.min(...budgets)).toBeGreaterThanOrEqual(min);
        expect(Math.max(...budgets)).toBeLessThanOrEqual(EXAM_QUESTIONS_PER_CALL);
      }
    }
  });

  it('un budget trop court pour un seul groupe ne produit aucun appel groupé', () => {
    expect(callBudgets(1, 6, EXAM_GROUP_SIZE.min)).toEqual([]);
    expect(callBudgets(0, 6)).toEqual([]);
  });
});

describe('planExamCalls — la forme de l’examen, décidée avant le premier appel', () => {
  const total = (plan: { budget: number }[]) => plan.reduce((sum, c) => sum + c.budget, 0);

  it('planifie exactement le nombre de questions demandé', () => {
    for (const n of [1, 4, 10, 13, 40, 60, 137]) {
      expect(total(planExamCalls(n))).toBe(n);
    }
  });

  it('aucun appel ne dépasse la taille d’un appel', () => {
    for (const call of planExamCalls(40)) {
      expect(call.budget).toBeLessThanOrEqual(EXAM_QUESTIONS_PER_CALL);
    }
  });

  it('un appel groupé a toujours de quoi faire un groupe', () => {
    for (const call of planExamCalls(40)) {
      if (call.grouped) expect(call.budget).toBeGreaterThanOrEqual(EXAM_GROUP_SIZE.min);
    }
  });

  it('tient la part de 60 % sur l’examen ENTIER', () => {
    const plan = planExamCalls(40);
    const grouped = plan.filter(c => c.grouped).reduce((sum, c) => sum + c.budget, 0);
    expect(grouped).toBe(examGroupedCount(40));
  });

  it('mêle les appels isolés aux appels groupés, plutôt que de les mettre à la suite', () => {
    // L'ordre du plan est celui du COURS : tous les groupes d'abord donnerait un
    // début d'examen en enchaînements et une fin en questions seules.
    const kinds = planExamCalls(40).map(c => (c.grouped ? 'g' : 's'));
    expect(kinds.join('')).not.toMatch(/^g+s+$/);
  });

  it('un examen trop court pour un seul groupe ne demande que des questions seules', () => {
    // 60 % de deux questions = 1 : un « groupe d'une question » n'existe pas.
    expect(planExamCalls(2)).toEqual([{ budget: 2, grouped: false }]);
    expect(planExamCalls(1)).toEqual([{ budget: 1, grouped: false }]);
  });

  it('dix questions : un appel groupé, un appel isolé', () => {
    // Le cas cité par Alexis le 06/09/2026 — six questions en groupes, quatre
    // seules.
    const plan = planExamCalls(10);
    expect(plan).toHaveLength(2);
    expect(plan.filter(c => c.grouped)).toHaveLength(1);
    expect(total(plan.filter(c => c.grouped))).toBe(6);
    expect(total(plan.filter(c => !c.grouped))).toBe(4);
  });

  it('ne planifie aucun appel pour un examen vide', () => {
    expect(planExamCalls(0)).toEqual([]);
  });
});

describe('la passe examen ne reçoit aucun document', () => {
  it('comme la passe questions : elle lit le programme, pas le cours', () => {
    const prepared = [
      { fileId: 'f1', key: 'cours/a.pdf', fileName: 'a.pdf', mimeType: 'application/pdf', ref: 'a' },
    ];
    expect(documentsForPass('exam', prepared)).toHaveLength(0);
  });
});
