import { describe, expect, it } from 'vitest';

import { deletePoolWithQuestions, questionsCarryingLabel } from '@/lib/workshops/labelDeletion';

// Suppression d'un libellé et de ses questions : opération destructrice par
// lot (CLAUDE.md §7). Le client est un double qui enregistre chaque requête —
// aucun appel ne part vers Supabase.

type Call = { table: string; filters: [string, string, unknown][] };

function fakeClient(failOn?: string) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      const builder = {
        delete() { calls.push(call); return builder; },
        eq(column: string, value: unknown) { call.filters.push(['eq', column, value]); return builder; },
        in(column: string, value: unknown) { call.filters.push(['in', column, value]); return builder; },
        then(resolve: (r: { error: { message: string } | null }) => void) {
          resolve({ error: table === failOn ? { message: 'boom' } : null });
        },
      };
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe('questionsCarryingLabel', () => {
  it('retient toute question qui porte le libellé, même avec d’autres', () => {
    const questions = [
      { id: 'a', pools: ['p1'] },
      { id: 'b', pools: ['p2', 'p1'] },
      { id: 'c', pools: ['p2'] },
      { id: 'd', pools: [] },
    ];
    expect(questionsCarryingLabel(questions, 'p1')).toEqual(['a', 'b']);
  });
});

describe('deletePoolWithQuestions', () => {
  it('supprime exactement les questions données, dans l’atelier, puis le libellé', async () => {
    const { client, calls } = fakeClient();
    await deletePoolWithQuestions(client, 'w1', 'p1', ['a', 'b', 'a']);
    expect(calls).toEqual([
      { table: 'exam_questions', filters: [['eq', 'workshop_id', 'w1'], ['in', 'id', ['a', 'b']]] },
      { table: 'exam_pools', filters: [['eq', 'workshop_id', 'w1'], ['eq', 'id', 'p1']] },
    ]);
  });

  it('sans question à supprimer, ne touche qu’au libellé', async () => {
    const { client, calls } = fakeClient();
    await deletePoolWithQuestions(client, 'w1', 'p1', ['']);
    expect(calls.map((c) => c.table)).toEqual(['exam_pools']);
  });

  it('si la suppression des questions échoue, le libellé reste', async () => {
    const { client, calls } = fakeClient('exam_questions');
    await expect(deletePoolWithQuestions(client, 'w1', 'p1', ['a'])).rejects.toThrow('boom');
    expect(calls.map((c) => c.table)).toEqual(['exam_questions']);
  });
});
