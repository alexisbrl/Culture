import { describe, expect, it } from 'vitest';

import {
  discardTrash,
  restoreFromTrash,
  trashChapter,
  trashHiddenChapter,
  trashNotion,
  trashUnassignedNotions,
} from '@/lib/workshops/trash';

// Copie des suppressions des paramètres : opération destructrice par lot, et
// restauration d'identifiants (CLAUDE.md §7). Le client est un double qui
// enregistre chaque requête — aucun appel ne part vers Supabase.

type Op = 'select' | 'insert' | 'delete' | 'update';
type Call = { table: string; op: Op; filters: [string, string, unknown][]; values?: unknown };
type Reply = { data?: unknown; error?: { message: string } | null };
type Script = (call: Call) => Reply | undefined;

function fakeClient(script: Script = () => undefined) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      let recorded = false;
      const record = (op: Op, values?: unknown) => {
        // `insert(...).select()` reste une insertion : seul le premier verbe compte.
        if (!recorded) { call.op = op; call.values = values; calls.push(call); recorded = true; }
        return builder;
      };
      const reply = () => script(call) ?? { data: null, error: null };
      const builder = {
        select: () => record('select'),
        insert: (values: unknown) => record('insert', values),
        delete: () => record('delete'),
        update: (values: unknown) => record('update', values),
        eq(column: string, value: unknown) { call.filters.push(['eq', column, value]); return builder; },
        in(column: string, value: unknown) { call.filters.push(['in', column, value]); return builder; },
        is(column: string, value: unknown) { call.filters.push(['is', column, value]); return builder; },
        lt(column: string, value: unknown) { call.filters.push(['lt', column, value]); return builder; },
        maybeSingle: () => Promise.resolve(reply()),
        single: () => Promise.resolve(reply()),
        then(resolve: (r: Reply) => void) { resolve(reply()); },
      };
      return builder;
    },
  };
  return { client: client as never, calls };
}

const notionRow = { id: 'n1', workshop_id: 'w1', chapter_id: 'c1', title: 'Une notion' };
const mastery = [{ brick_id: 'n1', user_id: 'u1', bloom_level: 3 }];
const links = [{ brick_id: 'n1', item_id: 'i1' }];

/** Une notion qui existe, avec sa progression et un lien à une question. */
function notionWorld(overrides: Script = () => undefined): Script {
  return (call) => overrides(call) ?? (
    call.table === 'workshop_bricks' && call.op === 'select' ? { data: notionRow } :
    call.table === 'brick_mastery' && call.op === 'select' ? { data: mastery } :
    call.table === 'exam_question_item_bricks' && call.op === 'select' ? { data: links } :
    call.table === 'settings_trash' && call.op === 'insert' ? { data: { id: 't1' } } :
    undefined
  );
}

const stashOf = (calls: Call[]) => calls.find((c) => c.table === 'settings_trash' && c.op === 'insert')!;

describe('trashNotion', () => {
  it('met la notion et ce qu’elle emporte de côté AVANT de la supprimer, dans l’atelier', async () => {
    const { client, calls } = fakeClient(notionWorld());
    expect(await trashNotion(client, 'w1', 'n1')).toEqual({ success: true, trashId: 't1' });

    const stash = stashOf(calls);
    expect(stash.values).toEqual({
      workshop_id: 'w1',
      kind: 'bundle',
      payload: { chapters: [], notions: [notionRow], mastery, links, reattach: [] },
    });
    const removal = calls.find((c) => c.table === 'workshop_bricks' && c.op === 'delete')!;
    expect(calls.indexOf(stash)).toBeLessThan(calls.indexOf(removal));
    expect(removal.filters).toEqual([['eq', 'workshop_id', 'w1'], ['in', 'id', ['n1']]]);
  });

  it('ne supprime rien si la copie n’a pas pu être faite', async () => {
    const { client, calls } = fakeClient(notionWorld((c) =>
      c.table === 'settings_trash' && c.op === 'insert' ? { data: null, error: { message: 'boom' } } : undefined));
    expect((await trashNotion(client, 'w1', 'n1')).success).toBe(false);
    expect(calls.some((c) => c.table === 'workshop_bricks' && c.op === 'delete')).toBe(false);
  });

  it('ne supprime rien si la progression n’a pas pu être lue', async () => {
    const { client, calls } = fakeClient(notionWorld((c) =>
      c.table === 'brick_mastery' ? { data: null, error: { message: 'boom' } } : undefined));
    expect((await trashNotion(client, 'w1', 'n1')).success).toBe(false);
    expect(calls.some((c) => c.op === 'insert' || c.op === 'delete')).toBe(false);
  });

  it('notion d’un autre atelier : introuvable, rien n’est écrit', async () => {
    const { client, calls } = fakeClient((c) => (c.table === 'workshop_bricks' ? { data: null } : undefined));
    expect((await trashNotion(client, 'w1', 'n1')).success).toBe(false);
    expect(calls.filter((c) => c.op !== 'select')).toEqual([]);
  });
});

describe('trashChapter', () => {
  it('retient ses notions pour les y remettre, puis le supprime dans l’atelier', async () => {
    const chapter = { id: 'c1', workshop_id: 'w1', name: 'Chapitre', position: 2 };
    const { client, calls } = fakeClient((c) =>
      c.table === 'workshop_chapters' && c.op === 'select' ? { data: chapter } :
      c.table === 'workshop_bricks' && c.op === 'select' ? { data: [{ id: 'n1' }, { id: 'n2' }] } :
      c.table === 'settings_trash' && c.op === 'insert' ? { data: { id: 't2' } } : undefined);
    expect(await trashChapter(client, 'w1', 'c1')).toEqual({ success: true, trashId: 't2' });

    expect(stashOf(calls).values).toMatchObject({
      payload: { chapters: [chapter], notions: [], reattach: [{ chapterId: 'c1', notionIds: ['n1', 'n2'] }] },
    });
    // Les notions restent : seule la ligne du chapitre est supprimée.
    expect(calls.some((c) => c.table === 'workshop_bricks' && c.op === 'delete')).toBe(false);
    const removal = calls.find((c) => c.table === 'workshop_chapters' && c.op === 'delete')!;
    expect(removal.filters).toEqual([['eq', 'workshop_id', 'w1'], ['in', 'id', ['c1']]]);
  });
});

describe('trashHiddenChapter', () => {
  it('supprime le chapitre écarté AVEC ses notions — les notions d’abord', async () => {
    const hidden = { id: 'c1', workshop_id: 'w1', hidden: true };
    const notions = [{ ...notionRow }, { ...notionRow, id: 'n2' }];
    const { client, calls } = fakeClient((c) =>
      c.table === 'workshop_chapters' && c.op === 'select' ? { data: hidden } :
      c.table === 'workshop_bricks' && c.op === 'select' ? { data: notions } :
      c.table === 'settings_trash' && c.op === 'insert' ? { data: { id: 't3' } } : undefined);
    expect(await trashHiddenChapter(client, 'w1', 'c1')).toEqual({ success: true, trashId: 't3' });

    // Seulement s’il est bien écarté, et dans l’atelier.
    expect(calls[0]).toMatchObject({ table: 'workshop_chapters', filters: [['eq', 'id', 'c1'], ['eq', 'workshop_id', 'w1'], ['eq', 'hidden', true]] });
    expect(stashOf(calls).values).toMatchObject({ payload: { chapters: [hidden], notions } });
    const deletes = calls.filter((c) => c.op === 'delete' && c.table !== 'settings_trash');
    expect(deletes).toEqual([
      { table: 'workshop_bricks', op: 'delete', filters: [['eq', 'workshop_id', 'w1'], ['in', 'id', ['n1', 'n2']]], values: undefined },
      { table: 'workshop_chapters', op: 'delete', filters: [['eq', 'workshop_id', 'w1'], ['in', 'id', ['c1']]], values: undefined },
    ]);
  });

  it('chapitre visible (ou inconnu) : introuvable, rien n’est écrit', async () => {
    const { client, calls } = fakeClient((c) => (c.table === 'workshop_chapters' ? { data: null } : undefined));
    expect((await trashHiddenChapter(client, 'w1', 'c1')).success).toBe(false);
    expect(calls.filter((c) => c.op !== 'select')).toEqual([]);
  });
});

describe('trashUnassignedNotions', () => {
  it('ne supprime que les notions sans chapitre lues, par identifiants et par paquets', async () => {
    const notions = Array.from({ length: 150 }, (_, i) => ({ ...notionRow, id: `n${i}`, chapter_id: null }));
    const { client, calls } = fakeClient((c) =>
      c.table === 'workshop_bricks' && c.op === 'select' ? { data: notions } :
      c.table === 'settings_trash' && c.op === 'insert' ? { data: { id: 't4' } } :
      c.op === 'select' ? { data: [] } : undefined);
    expect(await trashUnassignedNotions(client, 'w1')).toEqual({ success: true, trashId: 't4' });

    expect(calls[0].filters).toEqual([['eq', 'workshop_id', 'w1'], ['is', 'chapter_id', null]]);
    const deletes = calls.filter((c) => c.table === 'workshop_bricks' && c.op === 'delete');
    // Jamais « toutes celles sans chapitre » : une notion arrivée entre-temps
    // n'est pas dans la copie, elle ne doit pas partir.
    expect(deletes.map((d) => (d.filters[1][2] as string[]).length)).toEqual([100, 50]);
  });
});

describe('restoreFromTrash', () => {
  it('cherche la copie dans l’atelier ; absente, n’écrit rien', async () => {
    const { client, calls } = fakeClient();
    expect((await restoreFromTrash(client, 'w1', 't1')).success).toBe(false);
    expect(calls[0]).toMatchObject({ table: 'settings_trash', op: 'select', filters: [['eq', 'id', 't1'], ['eq', 'workshop_id', 'w1']] });
    expect(calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('refuse une copie dont le contenu appartient à un autre atelier', async () => {
    const payload = { chapters: [], notions: [{ ...notionRow, workshop_id: 'w2' }], mastery: [], links: [], reattach: [] };
    const { client, calls } = fakeClient((c) =>
      c.table === 'settings_trash' && c.op === 'select' ? { data: { id: 't1', kind: 'bundle', payload } } : undefined);
    expect((await restoreFromTrash(client, 'w1', 't1')).success).toBe(false);
    expect(calls.filter((c) => c.op !== 'select')).toEqual([]);
  });

  it('notion : revient sans chapitre si le sien a disparu, et seulement avec les liens encore valides', async () => {
    const payload = {
      chapters: [], notions: [notionRow], mastery,
      links: [...links, { brick_id: 'n1', item_id: 'gone' }], reattach: [],
    };
    const { client, calls } = fakeClient((c) =>
      c.table === 'settings_trash' && c.op === 'select' ? { data: { id: 't1', kind: 'bundle', payload } } :
      c.table === 'workshop_chapters' ? { data: [] } :
      c.table === 'exam_question_items' ? { data: [{ id: 'i1' }] } : undefined);
    expect(await restoreFromTrash(client, 'w1', 't1')).toEqual({ success: true, restored: { chapterIds: [], notionIds: ['n1'] } });

    expect(calls.find((c) => c.table === 'workshop_bricks' && c.op === 'insert')!.values).toEqual([{ ...notionRow, chapter_id: null }]);
    expect(calls.find((c) => c.table === 'brick_mastery' && c.op === 'insert')!.values).toEqual(mastery);
    expect(calls.find((c) => c.table === 'exam_question_item_bricks' && c.op === 'insert')!.values).toEqual(links);
    expect(calls.at(-1)).toMatchObject({ table: 'settings_trash', op: 'delete', filters: [['eq', 'id', 't1']] });
  });

  it('chapitres écartés : les chapitres reviennent avant leurs notions, qui y retrouvent leur place', async () => {
    const chapter = { id: 'c1', workshop_id: 'w1', hidden: true };
    const payload = { chapters: [chapter], notions: [notionRow], mastery: [], links: [], reattach: [] };
    const { client, calls } = fakeClient((c) =>
      c.table === 'settings_trash' && c.op === 'select' ? { data: { id: 't3', kind: 'bundle', payload } } :
      c.table === 'workshop_chapters' && c.op === 'select' ? { data: [{ id: 'c1' }] } : undefined);
    expect((await restoreFromTrash(client, 'w1', 't3')).success).toBe(true);

    const chapterInsert = calls.find((c) => c.table === 'workshop_chapters' && c.op === 'insert')!;
    const notionInsert = calls.find((c) => c.table === 'workshop_bricks' && c.op === 'insert')!;
    expect(calls.indexOf(chapterInsert)).toBeLessThan(calls.indexOf(notionInsert));
    expect(notionInsert.values).toEqual([notionRow]);
  });

  it('si la remise échoue, la copie reste', async () => {
    const payload = { chapters: [], notions: [notionRow], mastery: [], links: [], reattach: [] };
    const { client, calls } = fakeClient((c) =>
      c.table === 'settings_trash' && c.op === 'select' ? { data: { id: 't1', kind: 'bundle', payload } } :
      c.table === 'workshop_bricks' && c.op === 'insert' ? { error: { message: 'boom' } } : undefined);
    expect((await restoreFromTrash(client, 'w1', 't1')).success).toBe(false);
    expect(calls.some((c) => c.table === 'settings_trash' && c.op === 'delete')).toBe(false);
  });

  it('chapitre : ne reprend que ses notions restées sans chapitre, dans l’atelier', async () => {
    const chapter = { id: 'c1', workshop_id: 'w1', name: 'Chapitre', position: 2 };
    const payload = { chapters: [chapter], notions: [], mastery: [], links: [], reattach: [{ chapterId: 'c1', notionIds: ['n1', 'n2'] }] };
    const { client, calls } = fakeClient((c) =>
      c.table === 'settings_trash' && c.op === 'select' ? { data: { id: 't2', kind: 'bundle', payload } } : undefined);
    expect(await restoreFromTrash(client, 'w1', 't2')).toEqual({ success: true, restored: { chapterIds: ['c1'], notionIds: [] } });

    const reassign = calls.find((c) => c.table === 'workshop_bricks' && c.op === 'update')!;
    expect(reassign.values).toEqual({ chapter_id: 'c1' });
    expect(reassign.filters).toEqual([['eq', 'workshop_id', 'w1'], ['in', 'id', ['n1', 'n2']], ['is', 'chapter_id', null]]);
  });
});

describe('discardTrash', () => {
  it('n’efface que les copies données, dans l’atelier, par paquets', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const { client, calls } = fakeClient();
    await discardTrash(client, 'w1', [...ids, 't0', '']);

    expect(calls.every((c) => c.table === 'settings_trash' && c.op === 'delete')).toBe(true);
    expect(calls.map((c) => c.filters[0])).toEqual([['eq', 'workshop_id', 'w1'], ['eq', 'workshop_id', 'w1']]);
    expect(calls.map((c) => (c.filters[1][2] as string[]).length)).toEqual([100, 20]);
  });

  it('sans copie, n’écrit rien', async () => {
    const { client, calls } = fakeClient();
    await discardTrash(client, 'w1', []);
    expect(calls).toEqual([]);
  });
});
