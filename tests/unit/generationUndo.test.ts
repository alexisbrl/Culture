import { describe, expect, it } from 'vitest';

import {
  GENERATION_UNDO_WINDOW_HOURS,
  generationMarks,
  generationUndoState,
  planGenerationUndo,
  relativeMoves,
  traceOf,
  type GenerationTrace,
  type ProgramChapter,
  type ProgramNotion,
} from '@/lib/workshops/generationUndo';

// L'annulation de la dernière génération réécrit des notions SAISIES À LA MAIN
// (elle les remet dans leur chapitre) et supprime ce que la génération a créé.
// Ce qui est vérifié ici : elle ne vise jamais rien d'autre, et elle ne
// s'offre que lorsque personne n'a touché au programme depuis.

const LOT = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAMP = '2026-10-05T16:14:07.754913+00:00';

const trace = (patch: Partial<GenerationTrace> = {}): GenerationTrace => ({
  before: {},
  movedNotions: [],
  hiddenChapters: [],
  order: null,
  stamp: { at: STAMP },
  ...patch,
});
const ch = (id: string, importId: string | null = null, hidden = false): ProgramChapter => ({ id, importId, hidden });
const no = (id: string, chapterId: string | null, importId: string | null = null): ProgramNotion => ({ id, importId, chapterId });

describe('generationUndoState — quand l\'annulation s\'offre', () => {
  const finishedAt = '2026-10-05T16:20:00.000Z';
  const base = { finishedAt, outcome: 'success', stamp: { at: STAMP }, programChangedAt: STAMP, now: new Date('2026-10-05T18:00:00Z') };

  it('offerte quand rien n\'a bougé depuis la clôture', () => {
    expect(generationUndoState(base)).toBe('available');
  });

  it('retirée dès que le programme a bougé — à la microseconde près', () => {
    expect(generationUndoState({ ...base, programChangedAt: '2026-10-05T16:14:07.754914+00:00' })).toBe('modified');
  });

  it('jamais pendant que la génération tourne', () => {
    expect(generationUndoState({ ...base, finishedAt: null })).toBe('running');
  });

  it('jamais pour une génération arrêtée : son contenu est déjà retiré', () => {
    expect(generationUndoState({ ...base, outcome: 'stopped' })).toBe('stopped');
  });

  it('jamais sans tampon de clôture (génération d\'avant le mécanisme)', () => {
    expect(generationUndoState({ ...base, stamp: undefined })).toBe('untraced');
  });

  it('un tampon nul vaut « programme jamais touché », et se compare comme tel', () => {
    expect(generationUndoState({ ...base, stamp: { at: null }, programChangedAt: null })).toBe('available');
    expect(generationUndoState({ ...base, stamp: { at: null }, programChangedAt: STAMP })).toBe('modified');
  });

  it(`expire après ${GENERATION_UNDO_WINDOW_HOURS} h`, () => {
    const end = new Date(new Date(finishedAt).getTime() + GENERATION_UNDO_WINDOW_HOURS * 3600_000);
    expect(generationUndoState({ ...base, now: end })).toBe('available');
    expect(generationUndoState({ ...base, now: new Date(end.getTime() + 1) })).toBe('expired');
  });
});

describe('traceOf — relire un scope jsonb libre', () => {
  it('tolère un scope vide ou absent', () => {
    expect(traceOf(null)).toEqual({ before: {}, movedNotions: [], hiddenChapters: [], order: null, stamp: undefined });
    expect(traceOf({})).toEqual({ before: {}, movedNotions: [], hiddenChapters: [], order: null, stamp: undefined });
  });

  it('réunit les chapitres écartés par décision et ceux vidés en route', () => {
    const t = traceOf({ stage1: { dropped: ['c1'], before: { n1: 'c1', n2: null } }, undoEmptied: ['c1', 'c2'], undoOrder: ['c1', 'c2'], programStamp: { at: STAMP } });
    expect(t.hiddenChapters).toEqual(['c1', 'c2']);
    expect(t.before).toEqual({ n1: 'c1', n2: null });
    expect(t.order).toEqual(['c1', 'c2']);
    expect(t.stamp).toEqual({ at: STAMP });
  });

  it('ignore les valeurs qui ne sont pas des identifiants', () => {
    const t = traceOf({ movedNotions: ['n1', 3, null, { id: 'x' }] });
    expect(t.movedNotions).toEqual(['n1']);
  });
});

describe('relativeMoves — un chapitre poussé par une insertion n\'a pas bougé', () => {
  it('rien quand l\'ordre relatif est conservé, insertions comprises', () => {
    expect(relativeMoves(['a', 'b', 'c'], ['a', 'NEW', 'b', 'c'])).toEqual([]);
  });

  it('désigne le chapitre déplacé, pas ceux qu\'il a décalés', () => {
    expect(relativeMoves(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a'])).toEqual(['a']);
    expect(relativeMoves(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'])).toEqual(['d']);
  });

  it('ignore les chapitres inconnus de l\'ordre d\'avant', () => {
    expect(relativeMoves(['a', 'b'], ['x', 'b', 'a'])).toHaveLength(1);
  });
});

describe('generationMarks — « nouveau » et « modifié »', () => {
  it('marque ce qui porte l\'étiquette, les notions déplacées et les chapitres écartés', () => {
    const marks = generationMarks(
      LOT,
      trace({ before: { n1: 'c1' }, movedNotions: ['n1'], hiddenChapters: ['c2'] }),
      [ch('c1'), ch('c2', null, true), ch('c3', LOT)],
      [no('n1', 'c3'), no('n2', 'c3', LOT), no('n3', 'c1')],
    );
    expect(marks.newChapters).toEqual(['c3']);
    expect(marks.newNotions).toEqual(['n2']);
    expect(marks.movedNotions).toEqual(['n1']);
    expect(marks.changedChapters).toEqual(['c2']);
  });

  it('ne marque pas une notion revenue dans son chapitre d\'avant', () => {
    const marks = generationMarks(LOT, trace({ before: { n1: 'c1' }, movedNotions: ['n1'] }), [ch('c1')], [no('n1', 'c1')]);
    expect(marks.movedNotions).toEqual([]);
  });

  it('marque un chapitre réordonné, pas ceux décalés par un chapitre neuf', () => {
    const marks = generationMarks(
      LOT,
      trace({ order: ['a', 'b', 'c'] }),
      [ch('c'), ch('NEW', LOT), ch('a'), ch('b')],
      [],
    );
    expect(marks.changedChapters).toEqual(['c']);
  });
});

describe('planGenerationUndo — ce qui est réécrit, et rien d\'autre', () => {
  it('remet une notion déplacée dans son chapitre d\'avant', () => {
    const plan = planGenerationUndo(LOT, trace({ before: { n1: 'c1' }, movedNotions: ['n1'] }), [ch('c1'), ch('c2')], [no('n1', 'c2')]);
    expect(plan.moves).toEqual([{ notionId: 'n1', chapterId: 'c1' }]);
  });

  it('la remet sans chapitre si elle n\'en avait pas', () => {
    const plan = planGenerationUndo(LOT, trace({ before: { n1: null }, movedNotions: ['n1'] }), [ch('c1')], [no('n1', 'c1')]);
    expect(plan.moves).toEqual([{ notionId: 'n1', chapterId: null }]);
  });

  it('ne touche jamais une notion que la génération n\'a pas déplacée', () => {
    const plan = planGenerationUndo(LOT, trace({ before: { n1: 'c1', n2: 'c1' }, movedNotions: ['n1'] }), [ch('c1'), ch('c2')], [no('n1', 'c2'), no('n2', 'c2')]);
    expect(plan.moves.map((m) => m.notionId)).toEqual(['n1']);
  });

  it('ne réécrit pas une notion créée par la génération : elle part avec le lot', () => {
    const plan = planGenerationUndo(LOT, trace({ before: { n1: 'c1' }, movedNotions: ['n1'] }), [ch('c1'), ch('c2')], [no('n1', 'c2', LOT)]);
    expect(plan.moves).toEqual([]);
  });

  it('ignore une notion déplacée dont on ignore la place d\'avant', () => {
    const plan = planGenerationUndo(LOT, trace({ movedNotions: ['n1'] }), [ch('c1')], [no('n1', 'c1')]);
    expect(plan.moves).toEqual([]);
  });

  it('ne vise jamais un chapitre créé par la génération comme destination', () => {
    const plan = planGenerationUndo(LOT, trace({ before: { n1: 'cNew' }, movedNotions: ['n1'] }), [ch('c1'), ch('cNew', LOT)], [no('n1', 'c1')]);
    expect(plan.moves).toEqual([{ notionId: 'n1', chapterId: null }]);
  });

  it('rétablit les chapitres écartés, mais pas un chapitre du lot', () => {
    const plan = planGenerationUndo(LOT, trace({ hiddenChapters: ['c1', 'cNew', 'gone'] }), [ch('c1', null, true), ch('cNew', LOT, true)], []);
    expect(plan.unhide).toEqual(['c1']);
  });

  it('ne rétablit pas un chapitre déjà visible', () => {
    const plan = planGenerationUndo(LOT, trace({ hiddenChapters: ['c1'] }), [ch('c1')], []);
    expect(plan.unhide).toEqual([]);
  });

  it('rend l\'ordre d\'avant, complet, sur les chapitres qui restent', () => {
    const plan = planGenerationUndo(LOT, trace({ order: ['a', 'b', 'c'] }), [ch('c'), ch('NEW', LOT), ch('a'), ch('b')], []);
    expect(plan.order).toEqual(['a', 'b', 'c']);
  });

  it('range en fin les chapitres inconnus de l\'ordre d\'avant', () => {
    const plan = planGenerationUndo(LOT, trace({ order: ['a', 'b'] }), [ch('b'), ch('x'), ch('a')], []);
    expect(plan.order).toEqual(['a', 'b', 'x']);
  });

  it('ne réordonne rien quand l\'ordre n\'a pas changé', () => {
    const plan = planGenerationUndo(LOT, trace({ order: ['a', 'b'] }), [ch('a'), ch('NEW', LOT), ch('b')], []);
    expect(plan.order).toBeNull();
  });
});
