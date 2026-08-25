import { describe, expect, it } from 'vitest';

import {
  documentsForPass,
  examSliceCount,
  sliceProgram,
  splitBudget,
} from '@/lib/ingest/passInput';
import {
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

describe('examSliceCount — combien d’appels', () => {
  it('un appel par tranche de dix questions', () => {
    expect(examSliceCount(40, EXAM_QUESTIONS_PER_CALL)).toBe(4);
    expect(examSliceCount(41, EXAM_QUESTIONS_PER_CALL)).toBe(5);
  });

  it('toujours au moins un appel, même pour un budget nul', () => {
    expect(examSliceCount(0, EXAM_QUESTIONS_PER_CALL)).toBe(1);
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

describe('examGroupedCount — un tiers des questions s’enchaîne', () => {
  it('un tiers, arrondi', () => {
    expect(examGroupedCount(40)).toBe(13);
    expect(examGroupedCount(10)).toBe(3);
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
