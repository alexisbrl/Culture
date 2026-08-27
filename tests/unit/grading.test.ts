// Correction automatique d'un énoncé d'exercice.
//
// Pourquoi ces tests existent, alors qu'on ne teste pas le rendu : le verdict
// décide d'un CRÉDIT DE MAÎTRISE, et il juge une entrée qui vient du navigateur,
// donc d'une URL POST publique. C'est le contrat d'une entrée non fiable, l'un
// des deux critères de la discipline de tests du projet.
//
// Aucun accès réseau ni Supabase ici : `grading.ts` est volontairement pur.

import { describe, expect, it } from 'vitest';

import { normalizeAnswerText, isListCorrect, matchListEntries } from '@/lib/workshops/answerMatch';
import { emptyExerciseAnswer, toExerciseAnswer, toMatchChoice } from '@/lib/workshops/examTypes';
import { gradeStatement, type GradableStatement } from '@/lib/workshops/grading';

const answer = (patch: Partial<ReturnType<typeof emptyExerciseAnswer>> = {}) => ({
  ...emptyExerciseAnswer(),
  ...patch,
});

describe('normalisation d’une réponse écrite', () => {
  it('tolère la casse, les accents, la ponctuation et l’article de tête', () => {
    expect(normalizeAnswerText('La photosynthèse')).toBe('photosynthese');
    expect(normalizeAnswerText('photosynthese !')).toBe('photosynthese');
    expect(normalizeAnswerText("L'eau")).toBe('eau');
  });

  it('ne tolère RIEN d’autre : un mot contenu dans la réponse ne la vaut pas', () => {
    // Accepter l'inclusion rendrait juste la moitié des réponses fausses d'une
    // liste, et le candidat croirait savoir.
    expect(normalizeAnswerText('eau')).not.toBe(normalizeAnswerText('eau douce'));
  });

  it('ne retire pas un article isolé, qui laisserait une réponse vide', () => {
    expect(normalizeAnswerText('Les')).toBe('les');
  });
});

describe('liste — appariement des réponses', () => {
  const expected = ['Le foie', 'Les reins', 'La peau'];

  it('l’ordre de saisie est indifférent', () => {
    expect(isListCorrect(['la peau', 'foie', 'reins'], expected)).toBe(true);
  });

  it('une réponse répétée ne couvre qu’une seule attente', () => {
    expect(matchListEntries(['foie', 'foie'], expected)).toEqual([0, null]);
    expect(isListCorrect(['foie', 'foie', 'peau'], expected)).toBe(false);
  });

  it('une réponse en trop qui tombe à côté rend la liste fausse', () => {
    // Sans cette règle, remplir chaque ligne d'une réponse différente finirait
    // par tomber juste partout.
    expect(isListCorrect(['foie', 'reins', 'peau', 'rate'], expected)).toBe(false);
  });

  it('une attente manquante rend la liste fausse', () => {
    expect(isListCorrect(['foie', 'reins'], expected)).toBe(false);
  });
});

describe('gradeStatement — les quatre types jugés', () => {
  it('QCM : l’ordre des cases ne compte pas, l’ensemble si', () => {
    const q: GradableStatement = { responseType: 'qcm', correctChoices: [0, 2] };
    expect(gradeStatement(q, answer({ choices: [2, 0] })).correct).toBe(true);
    expect(gradeStatement(q, answer({ choices: [0] })).correct).toBe(false);
  });

  it('liste : jugée sur les réponses attendues, qui repartent avec la correction', () => {
    const q: GradableStatement = { responseType: 'liste', choices: ['Bleu', 'Rouge'] };
    const result = gradeStatement(q, answer({ list: ['rouge', 'BLEU'] }));
    expect(result.correct).toBe(true);
    expect(result.correctList).toEqual(['Bleu', 'Rouge']);
  });

  it('tableau : toutes les cases justes, et aucune de trop', () => {
    const q: GradableStatement = { responseType: 'tableau', typeOptions: { tableChecked: ['0-0', '1-1'] } };
    expect(gradeStatement(q, answer({ table: ['1-1', '0-0'] })).correct).toBe(true);
    expect(gradeStatement(q, answer({ table: ['0-0'] })).correct).toBe(false);
    expect(gradeStatement(q, answer({ table: ['0-0', '1-1', '0-1'] })).correct).toBe(false);
  });

  it('sans réponse de référence, pas de verdict — jamais « faux »', () => {
    // Sanctionner reviendrait à punir le candidat d'un énoncé mal saisi. Le cas
    // existe pour de bon : des listes écrites à la main portent leurs attendus
    // dans le texte libre au lieu des lignes de réponse.
    expect(gradeStatement({ responseType: 'tableau', typeOptions: { tableChecked: [] } }, answer()).correct).toBeNull();
    expect(gradeStatement({ responseType: 'liste', choices: [], answer: 'Loire, Seine' }, answer({ list: ['Loire'] })).correct).toBeNull();
    expect(gradeStatement({ responseType: 'matching', choices: [] }, answer()).correct).toBeNull();
  });

  it('paires : jugées sur le TEXTE relié, jamais sur un rang', () => {
    // La colonne de droite est parvenue au candidat mélangée et sans index
    // d'origine : un rang ne voudrait rien dire ici.
    const q: GradableStatement = {
      responseType: 'matching',
      choices: [toMatchChoice('Paris', 'France'), toMatchChoice('Rome', 'Italie')],
    };
    expect(gradeStatement(q, answer({ match: { 0: 'France', 1: 'Italie' } })).correct).toBe(true);
    expect(gradeStatement(q, answer({ match: { 0: 'Italie', 1: 'France' } })).correct).toBe(false);
    // Un appariement manquant ne passe pas : la correction est tout ou rien.
    expect(gradeStatement(q, answer({ match: { 0: 'France' } })).correct).toBe(false);
  });

  it('paires : comparaison EXACTE — le candidat n’écrit rien, il désigne un encadré', () => {
    // La tolérance de forme (`sameAnswerText`) n'a rien à rattraper ici : le
    // libellé revient tel qu'on l'a envoyé. L'appliquer ferait accepter un
    // encadré DIFFÉRENT au libellé voisin, c'est-à-dire valider une erreur.
    const q: GradableStatement = {
      responseType: 'matching',
      choices: [toMatchChoice('Fleuve', 'le Rhône'), toMatchChoice('Ville', 'Rhône')],
    };
    expect(gradeStatement(q, answer({ match: { 0: 'le Rhône', 1: 'Rhône' } })).correct).toBe(true);
    expect(gradeStatement(q, answer({ match: { 0: 'Rhône', 1: 'le Rhône' } })).correct).toBe(false);
  });

  it('les paires attendues repartent avec la correction, remises côte à côte', () => {
    const q: GradableStatement = { responseType: 'matching', choices: [toMatchChoice('Paris', 'France')] };
    expect(gradeStatement(q, answer()).correctPairs).toEqual([{ left: 'Paris', right: 'France' }]);
  });
});

describe('gradeStatement — la réponse rédigée se confirme, ne se réfute pas', () => {
  const q = { responseType: 'textuelle', answer: 'La photosynthèse' } as const;

  it('une réponse identique à la référence est déclarée juste, à la forme près', () => {
    // C'est ce qui permet enfin aux réponses courtes et factuelles de créditer
    // la notion : jusqu'au 25/08/2026 elles ressortaient toutes sans verdict.
    expect(gradeStatement(q, answer({ text: 'photosynthese' })).correct).toBe(true);
  });

  it('une réponse différente ne rend PAS « faux », elle rend « on ne sait pas »', () => {
    // Une bonne réponse formulée autrement ne ressemble pas à la référence : la
    // machine ne peut pas les départager. Ce sont ces réponses-là qui iront un
    // jour à la relecture par IA.
    expect(gradeStatement(q, answer({ text: 'le processus qui nourrit la plante' })).correct).toBeNull();
    expect(gradeStatement(q, answer({ text: '' })).correct).toBeNull();
  });

  it('sans réponse attendue, aucun verdict', () => {
    expect(gradeStatement({ responseType: 'textuelle', answer: '' }, answer({ text: 'quelque chose' })).correct).toBeNull();
  });
});

describe('gradeStatement — les types que rien ne sait juger', () => {
  it.each(['dessin', 'fichier', 'sans_reponse'] as const)('%s reste sans verdict', (responseType) => {
    // `correct: null` — et c'est ce qui les empêche de créditer la maîtrise,
    // d'où la consigne donnée au modèle de ne pas en faire une majorité.
    expect(gradeStatement({ responseType, answer: 'attendu' }, answer()).correct).toBeNull();
  });
});

describe('réponse reçue du navigateur — ce qui n’est pas lisible devient vide', () => {
  it('ne lève jamais, quoi qu’on lui donne', () => {
    expect(toExerciseAnswer(null)).toEqual(emptyExerciseAnswer());
    expect(toExerciseAnswer('bonjour')).toEqual(emptyExerciseAnswer());
    expect(toExerciseAnswer({ choices: 'nope', text: 42, list: [1, 'a'], table: null })).toEqual({
      choices: [], text: '', list: ['a'], table: [], match: {},
    });
  });

  it('écarte les index de choix qui n’en sont pas', () => {
    expect(toExerciseAnswer({ choices: [0, -1, 1.5, '2', 3] }).choices).toEqual([0, 3]);
  });

  it('ne garde d’un appariement que ce qui est lisible', () => {
    expect(toExerciseAnswer({ match: { 0: 'France', abc: 'Italie', 2: 7 } }).match).toEqual({ 0: 'France' });
  });
});
