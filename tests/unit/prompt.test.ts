import { describe, expect, it } from 'vitest';

import {
  bloomInstruction,
  chaptersInstruction,
  DEFAULT_BLOOM_DISTRIBUTION,
  existingContentBlock,
  MAX_QUESTIONS_PER_IMPORT,
  notionsInstruction,
  questionsInstruction,
  questionsPerNotion,
  systemPrompt,
  type BloomDistribution,
  type ExistingContent,
} from '@/lib/ingest/prompt';
import { GENERATED_RESPONSE_TYPES, wireGroupsOutput, wireNotionsOutput } from '@/lib/ingest/wireSchema';

const empty: ExistingContent = { chapters: [], notions: [], questions: [] };

describe('systemPrompt — stabilité (condition du cache)', () => {
  it('est strictement identique d’un appel à l’autre', () => {
    // Le cache de prompt est un préfixe : une date, un identifiant ou un
    // compteur glissé ici le ferait manquer à chaque appel, et on paierait le
    // document en entier une fois par chapitre.
    expect(systemPrompt()).toBe(systemPrompt());
  });

  it('ne contient ni date ni identifiant', () => {
    const s = systemPrompt();
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe('existingContentBlock — compléter, pas dupliquer', () => {
  it('le dit clairement quand l’atelier est vide', () => {
    expect(existingContentBlock(empty, { pass: 'chapters' })).toContain('vide');
    expect(existingContentBlock(empty, { pass: 'notions', chapterId: 'ch1' })).toContain('vide');
    expect(existingContentBlock(empty, { pass: 'questions', notionIds: ['n1'] })).toContain('vide');
  });

  it('transmet les identifiants réels, qui servent de références', () => {
    // C'est ce qui permet à une question de se rattacher à une notion DÉJÀ en
    // base plutôt que d'en créer un doublon.
    const block = existingContentBlock(
      {
        chapters: [{ id: 'ch-uuid', name: 'Les fleuves' }],
        notions: [{ id: 'n-uuid', title: 'La Loire est le plus long fleuve de France', chapterId: 'ch-uuid' }],
        questions: [{ content: 'Quel est le plus long fleuve de France ?', notionIds: ['n-uuid'] }],
      },
      { pass: 'questions', notionIds: ['n-uuid'] },
    );
    expect(block).toContain('Quel est le plus long fleuve de France ?');
    expect(block).toMatch(/complètes|recrées/);
  });
});

describe('existingContentBlock — la portée, poste de coût numéro un (§16.3)', () => {
  const atelier: ExistingContent = {
    chapters: [
      { id: 'ch1', name: 'Les fleuves' },
      { id: 'ch2', name: 'Les montagnes' },
    ],
    notions: [
      { id: 'n1', title: 'La Loire est le plus long fleuve de France', chapterId: 'ch1' },
      { id: 'n2', title: 'La Seine traverse Paris', chapterId: 'ch1' },
      { id: 'n3', title: 'Le mont Blanc culmine à 4 806 m', chapterId: 'ch2' },
      { id: 'n4', title: 'Notion orpheline', chapterId: null },
    ],
    questions: [
      { content: 'Énoncé sur la Loire', notionIds: ['n1'] },
      { content: 'Énoncé sur la Seine', notionIds: ['n2'] },
      { content: 'Énoncé sur le mont Blanc', notionIds: ['n3'] },
      { content: 'Énoncé sans notion', notionIds: [] },
    ],
  };

  it('passe chapitres : les chapitres seuls', () => {
    const block = existingContentBlock(atelier, { pass: 'chapters' });
    expect(block).toContain('Les fleuves');
    expect(block).toContain('Les montagnes');
    expect(block).not.toContain('La Loire');
    expect(block).not.toContain('Énoncé');
  });

  it('passe notions : les notions du chapitre traité, et rien du reste', () => {
    const block = existingContentBlock(atelier, { pass: 'notions', chapterId: 'ch1' });
    expect(block).toContain('La Loire');
    expect(block).toContain('La Seine');
    expect(block).not.toContain('mont Blanc');
    expect(block).not.toContain('orpheline');
    expect(block).not.toContain('Énoncé');
  });

  it('passe questions : les énoncés des notions données, aucun autre', () => {
    // Le critère de T1 : ce qui coûtait ~75 000 tokens par appel à 2 160
    // énoncés n'en pèse plus que quelques milliers.
    const block = existingContentBlock(atelier, { pass: 'questions', notionIds: ['n1'] });
    expect(block).toContain('Énoncé sur la Loire');
    expect(block).not.toContain('Énoncé sur la Seine');
    expect(block).not.toContain('Énoncé sur le mont Blanc');
    // Ni les notions ni les chapitres : la consigne les porte déjà.
    expect(block).not.toContain('ch1');
  });

  it('passe questions : une question sans notion n’est jamais transmise', () => {
    // Conséquence assumée de §16.3 — elle n'est protégée du doublon par rien,
    // et n'est de toute façon tirée par aucun exercice (§11).
    const block = existingContentBlock(atelier, { pass: 'questions', notionIds: ['n1', 'n2', 'n3'] });
    expect(block).not.toContain('Énoncé sans notion');
  });
});

describe('instructions de passe', () => {
  it('la passe notions cible UN chapitre et impose sa référence', () => {
    const instruction = notionsInstruction({ id: 'ch-uuid', name: 'Les fleuves' });
    expect(instruction).toContain('Les fleuves');
    expect(instruction).toContain('ch-uuid');
    expect(instruction).toContain('280');
  });

  it('la passe questions liste les notions à couvrir et rappelle le budget', () => {
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire…' }, { id: 'n2', title: 'La Seine…' }],
      budget: 12,
    });
    expect(instruction).toContain('n1');
    expect(instruction).toContain('n2');
    expect(instruction).toContain('12');
  });

  it('la passe questions donne les notions voisines en contexte, sans les interroger', () => {
    // Elle ne reçoit plus les documents (§16.3) : les voisines du chapitre sont
    // ce qui remplace le cours pour les niveaux 3 et 4 de Bloom (§16.21).
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire est le plus long fleuve de France' }],
      neighbours: [{ id: 'n2', title: 'La Seine traverse Paris' }],
      budget: 12,
    });
    expect(instruction).toContain('La Seine traverse Paris');
    expect(instruction).toMatch(/contexte/i);
    // La voisine est un contexte, pas une cible : sa référence n'est pas donnée,
    // le modèle ne peut donc pas y rattacher une question.
    expect(instruction).not.toContain('n2');
  });

  it('sans voisine, la passe questions ne mentionne aucun contexte', () => {
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire…' }],
      budget: 12,
    });
    expect(instruction).not.toMatch(/Autres notions du même chapitre/);
  });

  it('la passe questions dit ce qu’une question sans notion implique', () => {
    // C'est le seul endroit où le modèle peut l'apprendre : rien côté serveur ne
    // l'y oblige (une question sans notion reste permise).
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'X' },
      notions: [{ id: 'n1', title: 'Y' }],
      budget: 4,
    });
    expect(instruction).toMatch(/jamais posée/);
  });

  it('la passe chapitres ne parle ni de notions ni de questions', () => {
    const instruction = chaptersInstruction();
    expect(instruction).not.toMatch(/notion/i);
    expect(instruction).not.toMatch(/question/i);
  });
});

describe('wireSchema — ce qu’on autorise le modèle à produire', () => {
  it('n’ouvre que les types de réponse complets sans réglages', () => {
    // `tableau` porte ses lignes, colonnes et cases correctes dans type_options :
    // en générer un sans ces réglages donnerait une grille vide (décision du
    // 20/08/2026).
    expect([...GENERATED_RESPONSE_TYPES]).toEqual(['qcs', 'qcm', 'textuelle', 'liste']);
    expect(GENERATED_RESPONSE_TYPES).not.toContain('tableau');
  });

  it('refuse un type de réponse hors de cette liste', () => {
    const result = wireGroupsOutput.safeParse({
      groups: [{ ref: 'g1', questions: [{ content: 'Q', responseType: 'tableau', choices: [], correctChoices: [], answer: '', expectations: '', bloomLevel: 1, notionRefs: ['n1'] }] }],
    });
    expect(result.success).toBe(false);
  });

  it('refuse un niveau de Bloom hors 1–4 dès la contrainte de sortie', () => {
    const question = { content: 'Q', responseType: 'qcm', choices: [], correctChoices: [], answer: '', expectations: '', notionRefs: ['n1'] };
    expect(wireGroupsOutput.safeParse({ groups: [{ ref: 'g1', questions: [{ ...question, bloomLevel: 6 }] }] }).success).toBe(false);
    expect(wireGroupsOutput.safeParse({ groups: [{ ref: 'g1', questions: [{ ...question, bloomLevel: 3 }] }] }).success).toBe(true);
  });

  it('exige la référence de chapitre sur une notion', () => {
    expect(wireNotionsOutput.safeParse({ notions: [{ ref: 'n1', title: 'T' }] }).success).toBe(false);
    expect(wireNotionsOutput.safeParse({ notions: [{ ref: 'n1', title: 'T', chapterRef: 'ch1' }] }).success).toBe(true);
  });
});

describe('volumétrie — répartition de Bloom paramétrable (§16.1)', () => {
  it('le défaut est 8 / 4 / 0 / 0, soit 12 questions par notion', () => {
    expect(DEFAULT_BLOOM_DISTRIBUTION).toEqual({ 1: 8, 2: 4, 3: 0, 4: 0 });
    expect(questionsPerNotion()).toBe(12);
  });

  it('le plafond de débit est à 300 le temps des tests', () => {
    // Garde-fou volontairement bas : c'est la seule barrière contre une boucle
    // qui part en vrille (§16.2).
    expect(MAX_QUESTIONS_PER_IMPORT).toBe(300);
  });

  it('un niveau à zéro n’apparaît pas dans l’instruction', () => {
    const instruction = bloomInstruction();
    expect(instruction).toContain('8 de niveau 1');
    expect(instruction).toContain('4 de niveau 2');
    expect(instruction).not.toMatch(/niveau 3/);
    expect(instruction).not.toMatch(/niveau 4/);
  });

  it('changer la répartition change l’instruction produite', () => {
    const autre: BloomDistribution = { 1: 2, 2: 0, 3: 5, 4: 1 };
    const instruction = bloomInstruction(autre);
    expect(instruction).toContain('2 de niveau 1');
    expect(instruction).toContain('5 de niveau 3');
    expect(instruction).toContain('1 de niveau 4');
    expect(instruction).not.toMatch(/niveau 2/);
    expect(instruction).toContain('8 questions par notion');
    expect(instruction).not.toBe(bloomInstruction());
  });

  it('la passe questions reprend la répartition qu’on lui donne', () => {
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire…' }],
      budget: 300,
      distribution: { 1: 3, 2: 0, 3: 0, 4: 0 },
    });
    expect(instruction).toContain('3 de niveau 1');
    expect(instruction).not.toContain('8 de niveau 1');
  });

  it('une répartition entièrement à zéro ne demande rien', () => {
    expect(bloomInstruction({ 1: 0, 2: 0, 3: 0, 4: 0 })).toMatch(/aucune question/i);
    expect(questionsPerNotion({ 1: 0, 2: 0, 3: 0, 4: 0 })).toBe(0);
  });
});
