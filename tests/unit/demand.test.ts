// La demande de questions : ce qu'on fait produire, et combien.
//
// Pourquoi ces tests existent : cette liste décide, seule, du VOLUME d'un appel
// payant au modèle — et la recharge n'est déclenchée par personne. Se tromper de
// répartition, c'est payer 25 questions par notion là où on en voulait 25 par
// chapitre. Module pur, aucun accès réseau ni Supabase.

import { describe, expect, it } from 'vitest';

import {
  CHAPTER_START_QUESTIONS,
  capDemand,
  chapterStartBudgets,
  demandByNotion,
  demandForChapterStart,
  demandFromShortages,
  demandNotionIds,
  demandTotal,
} from '@/lib/ingest/demand';

describe('les questions d’un chapitre neuf', () => {
  it('en produit 25 en tout, pas 25 par notion', () => {
    const demand = demandForChapterStart(['a', 'b', 'c', 'd', 'e']);
    expect(demandTotal(demand)).toBe(CHAPTER_START_QUESTIONS);
    expect(demand.every((d) => d.bloomLevel === 1)).toBe(true);
  });

  it('répartit au plus juste, le reste aux premières notions', () => {
    const demand = demandForChapterStart(['a', 'b', 'c'], 7);
    expect(demand.map((d) => d.count)).toEqual([3, 2, 2]);
  });

  it('avec plus de notions que de questions, les dernières n’en reçoivent aucune', () => {
    // Assumé : la recharge les pourvoira quand un membre les atteindra. Payer
    // pour un chapitre que personne n'a ouvert est exactement ce qu'on évite.
    const demand = demandForChapterStart(['a', 'b', 'c'], 2);
    expect(demandNotionIds(demand)).toEqual(['a', 'b']);
    expect(demandTotal(demand)).toBe(2);
  });

  it('ne demande rien sans notion', () => {
    expect(demandForChapterStart([])).toEqual([]);
  });
});

describe('le budget de démarrage réparti sur l’atelier entier', () => {
  it('donne 25 au chapitre n°1, réparti également ensuite', () => {
    // Cas de l'énoncé : 3 chapitres, aucun n'a besoin du plafond.
    const budgets = chapterStartBudgets(
      [{ id: 'c1', position: 1 }, { id: 'c2', position: 2 }, { id: 'c3', position: 3 }],
      250,
    );
    expect(budgets.get('c1')).toBe(25);
    expect(budgets.get('c2')).toBe(25);
    expect(budgets.get('c3')).toBe(25);
  });

  it('se fie à la POSITION, jamais à l’ordre du tableau reçu', () => {
    const budgets = chapterStartBudgets(
      [{ id: 'c3', position: 3 }, { id: 'c1', position: 1 }, { id: 'c2', position: 2 }],
      250,
    );
    expect(budgets.get('c1')).toBe(25);
  });

  it('répartit le reste avec un plafond de 25, sans redistribuer ce qui déborde', () => {
    // 19 chapitres, budget 250 : 25 pour le n°1, 225 pour les 18 autres —
    // 12 ou 13 chacun, jamais 25 (aucun ne l'atteint, le plafond ne joue pas ici).
    const chapters = Array.from({ length: 19 }, (_, i) => ({ id: `c${i + 1}`, position: i + 1 }));
    const budgets = chapterStartBudgets(chapters, 250);
    expect(budgets.get('c1')).toBe(25);
    const others = chapters.slice(1).map((c) => budgets.get(c.id));
    expect(others.every((n) => n === 12 || n === 13)).toBe(true);
    expect(others.reduce((sum: number, n) => sum + (n ?? 0), 0)).toBe(225);
  });

  it('plafonne chaque chapitre à 25, même si le budget permettrait plus', () => {
    // Avec le vrai fusible (500) et peu de chapitres, le plafond par chapitre
    // mord avant le partage — jusqu'à une vingtaine, chacun garde ses 25 pleins.
    const chapters = Array.from({ length: 5 }, (_, i) => ({ id: `c${i + 1}`, position: i + 1 }));
    const budgets = chapterStartBudgets(chapters, 500);
    for (const c of chapters) expect(budgets.get(c.id)).toBe(CHAPTER_START_QUESTIONS);
  });

  it('un seul chapitre reçoit tout, plafonné', () => {
    const budgets = chapterStartBudgets([{ id: 'c1', position: 1 }], 500);
    expect(budgets.get('c1')).toBe(25);
  });

  it('ne rend rien sans chapitre', () => {
    expect(chapterStartBudgets([]).size).toBe(0);
  });
});

describe('la demande issue du radar', () => {
  it('reprend le manque de chaque couple', () => {
    const demand = demandFromShortages([
      { notionId: 'a', bloomLevel: 2, missing: 4 },
      { notionId: 'b', bloomLevel: 3, missing: 3 },
    ]);
    expect(demandTotal(demand)).toBe(7);
  });

  it('ignore les couples qui ne manquent de rien', () => {
    expect(demandFromShortages([{ notionId: 'a', bloomLevel: 1, missing: 0 }])).toEqual([]);
  });
});

describe('le plafond de dépense', () => {
  it('sert les premiers couples et tronque le dernier', () => {
    const demand = capDemand(
      [
        { notionId: 'a', bloomLevel: 1, count: 4 },
        { notionId: 'b', bloomLevel: 2, count: 4 },
      ],
      6,
    );
    expect(demand.map((d) => d.count)).toEqual([4, 2]);
    expect(demandTotal(demand)).toBe(6);
  });

  it('ne rend rien quand il ne reste rien', () => {
    expect(capDemand([{ notionId: 'a', bloomLevel: 1, count: 4 }], 0)).toEqual([]);
  });
});

describe('la demande telle que le modèle la lit', () => {
  it('regroupe les niveaux d’une même notion, dans l’ordre des niveaux', () => {
    const byNotion = demandByNotion([
      { notionId: 'a', bloomLevel: 3, count: 1 },
      { notionId: 'a', bloomLevel: 1, count: 2 },
      { notionId: 'a', bloomLevel: 1, count: 1 },
    ]);
    expect(byNotion.get('a')).toEqual([
      { bloomLevel: 1, count: 3 },
      { bloomLevel: 3, count: 1 },
    ]);
  });

  it('laisse de côté une notion dont rien n’est demandé', () => {
    const byNotion = demandByNotion([{ notionId: 'a', bloomLevel: 1, count: 0 }]);
    expect(byNotion.size).toBe(0);
  });
});
