// Les chapitres posés par le site à partir des parties du document de l'IA, et
// l'ordre du programme quand deux rangs sont égaux. C'est ce code qui décide
// quels chapitres existants SORTENT du programme : testé seul.

import { describe, expect, it } from 'vitest';

import { coursePositions, partsProgram, rankedByCourse } from '@/lib/ingest/partsProgram';

const header = '# Notes IA — Algèbre\n\n> Ce document a été rédigé par l’IA…\n\n<!-- culture:corps -->';
const pages = [header, '## Les matrices\n\nUne matrice…', '## Les déterminants\n\nLe déterminant…', '## Les  polynômes \n\nUn polynôme…'];

describe('partsProgram', () => {
  it('fait une partie = un chapitre, dans l’ordre, sans l’en-tête', () => {
    const p = partsProgram('doc', pages, [])!;
    expect(p.fresh.map((c) => c.name)).toEqual(['Les matrices', 'Les déterminants', 'Les polynômes']);
    expect(p.chapterOrder.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(p.chapterBounds[0].spans).toEqual([{ document: 'doc', from: 2, to: 2 }]);
    expect(p.dropped).toEqual([]);
  });

  it('garde un chapitre existant au même titre, et fait sortir les autres', () => {
    const p = partsProgram('doc', pages, [
      { id: 'c-det', name: 'Les déterminants' },
      { id: 'c-old', name: 'Les groupes' },
    ])!;
    expect(p.kept).toBe(1);
    expect(p.fresh.map((c) => c.name)).toEqual(['Les matrices', 'Les polynômes']);
    expect(p.chapterOrder.find((c) => c.ref === 'c-det')?.rank).toBe(2);
    expect(p.dropped).toEqual(['c-old']);
    expect(p.chapterOrder.find((c) => c.ref === 'c-old')?.rank).toBe(0);
  });

  it('ne compare que le texte du titre, espaces mis à part', () => {
    expect(partsProgram('doc', pages, [{ id: 'c', name: 'Les polynômes' }])!.kept).toBe(1);
    expect(partsProgram('doc', pages, [{ id: 'c', name: 'les polynômes' }])!.kept).toBe(0);
  });

  it('ne découpe pas un document sans parties titrées', () => {
    expect(partsProgram('doc', ['Un texte sans titre.'], [])).toBeNull();
  });
});

describe('rankedByCourse', () => {
  it('départage deux rangs égaux par leur place dans le cours', () => {
    const position = coursePositions(
      [
        { ref: 'b', spans: [{ document: 'd1', from: 9 }] },
        { ref: 'a', spans: [{ document: 'd1', from: 2 }] },
        { ref: 'c', spans: [{ document: 'd2', from: 1 }] },
      ],
      ['d1', 'd2'],
    );
    const order = [{ ref: 'c', rank: 1 }, { ref: 'b', rank: 1 }, { ref: 'a', rank: 1 }, { ref: 'z', rank: 0 }];
    expect(rankedByCourse(order, position).map((c) => c.ref)).toEqual(['a', 'b', 'c']);
  });

  it('laisse le rang décider quand il n’y a pas d’égalité', () => {
    const order = [{ ref: 'a', rank: 2 }, { ref: 'b', rank: 1 }];
    expect(rankedByCourse(order, () => 0).map((c) => c.ref)).toEqual(['b', 'a']);
  });
});
