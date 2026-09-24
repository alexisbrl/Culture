import { describe, expect, it } from 'vitest';

import {
  MARK,
  PIPELINE_ERRORS,
  decide,
  summarize,
  type PipelineConfig,
  type TaskKind,
  type TaskPayload,
  type TaskRow,
  type TaskStatus,
} from '@/lib/ingest/pipeline';

// L'enchaînement d'une génération. Testé parce qu'il décide, sans personne pour
// relire, de ce qui s'écrit et de ce qui s'efface : un « fermer » trop tôt laisse
// un programme à moitié rangé, une finalisation lancée sans un chapitre sort du
// programme des notions qu'il aurait gardées (CLAUDE.md §7).

const cfg = (over: Partial<PipelineConfig> = {}): PipelineConfig => ({
  kind: 'generation',
  context: 'parcours',
  withResource: false,
  needsProgram: true,
  documents: 1,
  visibleNotions: 0,
  examTarget: 40,
  baseUrl: 'http://localhost:3000',
  ...over,
});

const task = (
  key: string,
  kind: TaskKind,
  status: TaskStatus = 'done',
  result: unknown = {},
  payload: TaskPayload = {},
  error: string | null = null,
): TaskRow => ({ key, kind, status, result, payload, error });

const structure = (decision: 'continue' | 'relaunch' | 'cancel' = 'continue') =>
  task('chapters', 'chapters', 'done', { chapters: [{ id: 'c1', name: 'Un' }], discarded: [], adjusted: [], decision });

const notions = (chapterId: string, status: TaskStatus = 'done', claimed: string[] = []) =>
  task(`notions:${chapterId}`, 'notions', status, { written: 3, discarded: [], adjusted: [], claimed }, {
    chapterId,
    chapter: { id: chapterId, name: chapterId },
    startBudget: 24,
  }, status === 'failed' ? 'panne' : null);

const mark = (key: string) => task(key, 'mark');

describe('decide — le programme', () => {
  it('commence par les chapitres, et attend leur réponse', () => {
    expect(decide(cfg(), [])).toEqual([{ type: 'enqueue', tasks: [{ key: 'chapters', kind: 'chapters', payload: {} }] }]);
    expect(decide(cfg(), [task('chapters', 'chapters', 'running')])).toEqual([]);
  });

  it("passe par l'étape 0 quand il y a une consigne", () => {
    expect(decide(cfg({ withResource: true }), [])).toEqual([
      { type: 'enqueue', tasks: [{ key: 'resource', kind: 'resource', payload: {} }] },
    ]);
  });

  it("n'essaie pas de découper un cours qui n'existe pas", () => {
    const resource = task('resource', 'resource', 'done', { written: true, documents: 0, examQuestionCount: null });
    expect(decide(cfg({ withResource: true, documents: 0 }), [resource])).toEqual([
      { type: 'close', outcome: 'failed', error: PIPELINE_ERRORS.writtenNotRead },
    ]);
  });

  it('relance les chapitres quand le seuil le demande, et annule quand il le dit', () => {
    expect(decide(cfg(), [structure('relaunch')])).toEqual([
      { type: 'enqueue', tasks: [{ key: 'chapters-relaunch', kind: 'chapters-relaunch', payload: {} }] },
    ]);
    expect(decide(cfg(), [structure('cancel')])).toEqual([
      { type: 'close', outcome: 'failed', error: PIPELINE_ERRORS.cancelledForgotten },
    ]);
  });

  it('planifie les questions d\'un chapitre dès que ses notions sont écrites, sans attendre les autres', () => {
    const tasks = [structure(), mark(MARK.notions), notions('c1'), notions('c2', 'running')];
    expect(decide(cfg(), tasks)).toEqual([{ type: 'plan-questions', chapterIds: ['c1'] }]);
  });

  it('juge les redites une fois toutes les notions écrites, et ne finalise qu\'après les questions', () => {
    const base = [structure(), mark(MARK.notions), notions('c1'), mark(MARK.questions('c1'))];
    expect(decide(cfg(), base)).toEqual([{ type: 'enqueue', tasks: [{ key: 'redites', kind: 'redites', payload: {} }] }]);

    const inFlight = [...base, task('redites', 'redites'), task('questions:c1:0', 'questions', 'running')];
    expect(decide(cfg(), inFlight)).toEqual([]);

    const written = [...base, task('redites', 'redites'), task('questions:c1:0', 'questions')];
    expect(decide(cfg(), written)).toEqual([{ type: 'enqueue', tasks: [{ key: 'finish', kind: 'finish', payload: {} }] }]);
  });

  it('finalise même si des appels de questions ont échoué', () => {
    const tasks = [
      structure(), mark(MARK.notions), notions('c1'), mark(MARK.questions('c1')),
      task('redites', 'redites'), task('questions:c1:0', 'questions', 'failed'),
    ];
    expect(decide(cfg(), tasks)).toEqual([{ type: 'enqueue', tasks: [{ key: 'finish', kind: 'finish', payload: {} }] }]);
  });

  it("n'est jamais finalisé quand les notions d'un chapitre ont échoué — et attend ce qui est en vol", () => {
    const failed = [
      structure(), mark(MARK.notions), notions('c1'), mark(MARK.questions('c1')), notions('c2', 'failed'),
    ];
    const withQuestions = [...failed, task('questions:c1:0', 'questions', 'running')];
    expect(decide(cfg(), withQuestions)).toEqual([]);
    expect(decide(cfg(), failed)).toEqual([{ type: 'close', outcome: 'failed', error: 'panne' }]);
  });

  it('se ferme une fois la finalisation faite', () => {
    const tasks = [
      structure(), mark(MARK.notions), notions('c1'), mark(MARK.questions('c1')),
      task('redites', 'redites'), task('finish', 'finish'),
    ];
    expect(decide(cfg(), tasks)).toEqual([{ type: 'close', outcome: 'finished' }]);
  });
});

describe('decide — sans programme, et l\'examen', () => {
  it('écrit les questions de chaque chapitre existant quand il n\'y a rien à relire', () => {
    expect(decide(cfg({ needsProgram: false }), [])).toEqual([{ type: 'plan-questions', chapterIds: 'all' }]);
    expect(decide(cfg({ needsProgram: false }), [mark(MARK.questionsAll)])).toEqual([{ type: 'close', outcome: 'finished' }]);
  });

  it("planifie l'examen sur le total corrigé par l'étape 0", () => {
    const resource = task('resource', 'resource', 'done', { written: false, documents: 0, examQuestionCount: 1 });
    expect(decide(cfg({ context: 'exam', needsProgram: false, withResource: true, visibleNotions: 10 }), [resource]))
      .toEqual([{ type: 'plan-exam', round: 1, total: 1 }]);
  });

  const exam = (i: number, written: number, status: TaskStatus = 'done') =>
    task(`exam:1:${i}`, 'exam', status, { written, discarded: [], adjusted: [] }, { round: 1, slice: { index: i, count: 2, budget: 6, grouped: false } });
  const examCfg = cfg({ context: 'exam', needsProgram: false, examTarget: 12 });

  it('rattrape le manque une fois', () => {
    const tasks = [mark(MARK.exam(1)), exam(0, 6), exam(1, 3)];
    expect(decide(examCfg, tasks)).toEqual([{ type: 'plan-exam', round: 2, total: 3 }]);
    expect(decide(examCfg, [...tasks, mark(MARK.exam(2))])).toEqual([{ type: 'close', outcome: 'finished' }]);
  });

  it('ne rattrape pas après deux appels à vide, ni après une panne', () => {
    expect(decide(examCfg, [mark(MARK.exam(1)), exam(0, 0), exam(1, 0)])).toEqual([{ type: 'close', outcome: 'finished' }]);
    expect(decide(examCfg, [mark(MARK.exam(1)), exam(0, 6), exam(1, 0, 'failed')])).toEqual([{ type: 'close', outcome: 'finished' }]);
  });
});

describe('decide — la recharge', () => {
  it('attend ses tâches, puis se ferme', () => {
    const refill = cfg({ kind: 'refill', needsProgram: false });
    expect(decide(refill, [task('questions:c1:0', 'questions', 'running')])).toEqual([]);
    expect(decide(refill, [task('questions:c1:0', 'questions')])).toEqual([{ type: 'close', outcome: 'finished' }]);
  });
});

describe('summarize', () => {
  it('compte ce qui est écrit, retire les redites, et dit les questions manquantes', () => {
    const tasks = [
      structure(), mark(MARK.notions), notions('c1'), notions('c2'),
      task('redites', 'redites', 'done', { removed: 1, removals: [], adjusted: [] }),
      task('questions:c1:0', 'questions', 'done', { written: 8, discarded: [], adjusted: [] }, { budgetShare: 8 }),
      task('questions:c2:0', 'questions', 'failed', null, { budgetShare: 8 }),
    ];
    const summary = summarize(cfg(), tasks, null);
    expect(summary.counts).toEqual({ chapters: 1, notions: 5, questions: 8 });
    expect(summary.missingQuestions).toBe(8);
    expect(summary.state).toBe('running');
  });

  it('lit le verdict final, et l\'arrêt au journal', () => {
    const end = task(MARK.end, 'mark', 'done', { outcome: 'failed', error: 'panne' });
    expect(summarize(cfg(), [end], null)).toMatchObject({ state: 'failed', error: 'panne' });
    expect(summarize(cfg(), [], 'stopped').state).toBe('stopped');
  });
});
