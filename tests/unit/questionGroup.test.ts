import { describe, expect, it } from 'vitest';

import type { Question } from '@/lib/workshops/examTypes';
import {
  fromGroup,
  itemIdOf,
  normalizeGroupInput,
  toGroup,
} from '@/lib/workshops/questionGroup';

// `questionGroup.ts` est LE contrat exposé à l'extérieur : c'est par lui que
// passera tout ce que produit l'IA (docs/ai-ingestion-plan.md §7). Les tests
// ci-dessous fixent les propriétés dont dépend le reste de l'ingestion — au
// premier rang desquelles : une source extérieure ne choisit jamais ses
// identifiants.

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'g1',
    responseType: 'qcm',
    content: 'Quelle est la capitale de la France ?',
    answer: '',
    choices: ['Paris', 'Lyon'],
    correctChoices: [0],
    shuffleChoices: false,
    pools: ['libelle-1'],
    answerOptional: false,
    difficulty: { enabled: false, value: 3 },
    duration: { enabled: false, minutes: 2, seconds: 0 },
    parts: [],
    examIds: [],
    textLines: 4,
    bloomLevel: 1,
    notionIds: ['n1'],
    ...overrides,
  };
}

describe('itemIdOf', () => {
  it('donne à la question principale l’identifiant du groupe', () => {
    // C'est ce qui garde valides les clés de barème, les sections d'examen et
    // les brouillons déjà enregistrés.
    expect(itemIdOf('g1', 0)).toBe('g1');
    expect(itemIdOf('g1', 0, 'autre-chose')).toBe('g1');
  });

  it('conserve l’identifiant d’une question liée d’une édition à l’autre', () => {
    expect(itemIdOf('g1', 1, 'q-liee-42')).toBe('q-liee-42');
  });

  it('refuse qu’une question liée reprenne l’identifiant du groupe', () => {
    // Sinon la question liée écraserait la ligne de la question principale lors
    // de l'upsert — c'est exactement le genre de collision qu'une sortie de
    // modèle peut provoquer.
    const id = itemIdOf('g1', 1, 'g1');
    expect(id).not.toBe('g1');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('toGroup / fromGroup', () => {
  it('expose une liste symétrique : la principale est une question comme les autres', () => {
    const group = toGroup(question({
      parts: [{
        id: 'q-liee-1',
        content: 'Et celle de l’Espagne ?',
        responseType: 'textuelle',
        answer: 'Madrid',
        choices: [],
        correctChoices: [],
        shuffleChoices: false,
        textLines: 2,
        typeOptions: {},
        expectations: '',
        bloomLevel: 2,
        notionIds: ['n2'],
      }],
    }));

    expect(group.questions).toHaveLength(2);
    expect(group.questions[0].id).toBe('g1');
    expect(group.questions[1].id).toBe('q-liee-1');
    // Les éléments communs vivent sur le groupe, jamais sur une question.
    expect(group.pools).toEqual(['libelle-1']);
  });

  it('fait un aller-retour sans rien perdre', () => {
    const original = question({
      parts: [{
        id: 'q-liee-1',
        content: 'Question liée',
        responseType: 'liste',
        answer: '',
        choices: [],
        correctChoices: [],
        shuffleChoices: true,
        textLines: 3,
        typeOptions: { listNumbered: true },
        expectations: 'Attendus',
        bloomLevel: 3,
        notionIds: ['n2', 'n3'],
      }],
    });

    const round = fromGroup(toGroup(original));

    expect(round.id).toBe(original.id);
    expect(round.content).toBe(original.content);
    expect(round.notionIds).toEqual(original.notionIds);
    expect(round.parts).toEqual(original.parts);
  });

  it('refuse un groupe sans aucune question', () => {
    // L'invariant du fichier : mieux vaut un refus net qu'une question fantôme
    // enregistrée en base.
    expect(() => fromGroup({ id: 'g1', pools: [], examIds: [], questions: [] }))
      .toThrow(/au moins une question/);
  });
});

describe('normalizeGroupInput — entrée non fiable (IA, import, API)', () => {
  it('impose l’identifiant de l’appelant et ignore celui de la source', () => {
    // Propriété de sécurité : une source extérieure ne doit pas pouvoir viser
    // une ligne existante en fournissant son identifiant.
    const group = normalizeGroupInput({ id: 'question-d-un-autre-atelier' }, 'g-impose');
    expect(group.id).toBe('g-impose');
  });

  it('ne renvoie jamais un groupe vide', () => {
    expect(normalizeGroupInput({ questions: [] }, 'g1').questions).toHaveLength(1);
    expect(normalizeGroupInput({}, 'g1').questions).toHaveLength(1);
    expect(normalizeGroupInput(null, 'g1').questions).toHaveLength(1);
    expect(normalizeGroupInput('n’importe quoi', 'g1').questions).toHaveLength(1);
  });

  it('normalise un type de réponse inventé et un niveau de Bloom hors bornes', () => {
    const group = normalizeGroupInput({
      questions: [{ responseType: 'vrai_faux', bloomLevel: 6 }],
    }, 'g1');

    expect(group.questions[0].responseType).toBe('textuelle');
    expect(group.questions[0].bloomLevel).toBe(4);
  });

  it('écarte les valeurs du mauvais type au lieu de les recopier', () => {
    const group = normalizeGroupInput({
      questions: [{
        content: 42,                          // pas une chaîne
        choices: ['Paris', 7, null, 'Lyon'],  // tableau hétérogène
        correctChoices: [0, 'deux', 1.5],     // indices douteux
        notionIds: ['n1', 12],
      }],
    }, 'g1');

    const q = group.questions[0];
    expect(q.content).toBe('');
    expect(q.choices).toEqual(['Paris', 'Lyon']);
    expect(q.correctChoices).toEqual([0, 1.5]);
    expect(q.notionIds).toEqual(['n1']);
  });

  it('n’accepte une pièce jointe que sous forme de clé de stockage', () => {
    // Une IA ne dépose pas de fichier : elle ne peut désigner qu'un objet déjà
    // présent dans le stockage de l'atelier.
    expect(normalizeGroupInput({ image: { url: 'https://exemple.test/x.png' } }, 'g1').image)
      .toBeNull();
    expect(normalizeGroupInput({ image: { key: 'atelier/1-schema.png' } }, 'g1').image)
      .toEqual({ key: 'atelier/1-schema.png' });
  });

  it('ne laisse pas une source rattacher sa question à un examen', () => {
    // `examIds` décrit l'appartenance à une copie déjà composée : ça ne se
    // décide pas à la génération.
    expect(normalizeGroupInput({ examIds: ['examen-existant'] }, 'g1').examIds).toEqual([]);
  });

  it('renumérote les questions liées sans jamais réutiliser l’identifiant du groupe', () => {
    const group = normalizeGroupInput({
      questions: [{ content: 'principale' }, { id: 'g1', content: 'liée' }],
    }, 'g1');

    expect(group.questions[0].id).toBe('g1');
    expect(group.questions[1].id).not.toBe('g1');
  });
});
