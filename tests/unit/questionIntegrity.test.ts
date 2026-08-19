import { describe, expect, it } from 'vitest';

import type { Question, QuestionPart } from '@/lib/workshops/examTypes';
import { parseResponseType } from '@/lib/workshops/examTypes';
import {
  assertQuestionIntegrity,
  assertStatements,
  missingStatementErrors,
  notionIdsOf,
  questionIntegrityErrors,
} from '@/lib/workshops/questionIntegrity';

// Ce module décide de ce qui a le droit d'entrer en base. Deux propriétés
// comptent, et elles tirent en sens opposé :
//   • il REFUSE ce que personne ne peut vouloir (notion d'un autre atelier,
//     type de réponse inventé) ;
//   • il LAISSE PASSER tout choix pédagogique, même discutable.
// Les tests couvrent les deux, le second autant que le premier : un contrôle
// trop zélé bloquerait l'utilisateur sur ses propres questions.

function part(overrides: Partial<QuestionPart> = {}): QuestionPart {
  return {
    id: 'p1',
    content: '',
    responseType: 'textuelle',
    answer: '',
    choices: [],
    correctChoices: [],
    shuffleChoices: false,
    textLines: 4,
    typeOptions: {},
    expectations: '',
    bloomLevel: 1,
    notionIds: [],
    ...overrides,
  };
}

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'g1',
    responseType: 'qcm',
    content: 'Quelle est la capitale de la France ?',
    answer: '',
    choices: ['Paris', 'Lyon'],
    correctChoices: [0],
    shuffleChoices: false,
    pools: [],
    answerOptional: false,
    difficulty: { enabled: false, value: 3 },
    duration: { enabled: false, minutes: 2, seconds: 0 },
    parts: [],
    examIds: [],
    textLines: 4,
    bloomLevel: 1,
    notionIds: [],
    ...overrides,
  };
}

describe('notionIdsOf', () => {
  it('rassemble les notions de la principale et des questions liées, sans doublon', () => {
    const q = question({
      notionIds: ['n1', 'n2'],
      parts: [part({ notionIds: ['n2', 'n3'] }), part({ id: 'p2', notionIds: ['n4'] })],
    });
    expect(notionIdsOf(q).sort()).toEqual(['n1', 'n2', 'n3', 'n4']);
  });
});

describe('questionIntegrityErrors — ce qui est REFUSÉ', () => {
  it('refuse une notion inexistante', () => {
    const errors = questionIntegrityErrors(question({ notionIds: ['n-fantome'] }), new Set(['n1']));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('n-fantome');
  });

  it('refuse une notion d’un AUTRE atelier', () => {
    // Le cas que la clé étrangère ne voit pas : la notion existe bel et bien en
    // base, elle n'est simplement pas d'ici. C'est la raison d'être du contrôle.
    const errors = questionIntegrityErrors(question({ notionIds: ['n-autre-atelier'] }), new Set(['n1', 'n2']));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('atelier');
  });

  it('refuse une notion fautive portée par une question liée', () => {
    const q = question({ parts: [part({ notionIds: ['n-fantome'] })] });
    expect(questionIntegrityErrors(q, new Set(['n1']))).toHaveLength(1);
  });

  it('refuse un type de réponse inventé, sur la principale comme sur une liée', () => {
    // `vrai_faux` n'a aucun mapping fondé : le replier sur « textuelle »
    // donnerait un vrai/faux en champ de texte libre.
    const forge = { responseType: 'vrai_faux' } as unknown as Partial<Question>;
    expect(questionIntegrityErrors(question(forge), new Set())).toHaveLength(1);

    const forgePart = { responseType: 'vrai_faux' } as unknown as Partial<QuestionPart>;
    const errors = questionIntegrityErrors(question({ parts: [part(forgePart)] }), new Set());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('question liée 1');
  });

  it('liste TOUS les manquements d’un coup', () => {
    // Corriger un problème pour en découvrir un autre au ré-enregistrement est
    // une perte de temps — pour un humain comme pour une boucle d'ingestion.
    const forge = { responseType: 'vrai_faux', notionIds: ['n-fantome'] } as unknown as Partial<Question>;
    expect(questionIntegrityErrors(question(forge), new Set())).toHaveLength(2);
  });

  it('nomme les notions fautives dans le message', () => {
    const q = question({ notionIds: ['n-a', 'n-b'] });
    const [message] = questionIntegrityErrors(q, new Set());
    expect(message).toContain('n-a');
    expect(message).toContain('n-b');
  });
});

describe('questionIntegrityErrors — ce qui est LAISSÉ PASSER', () => {
  it('accepte un QCM à une seule bonne réponse', () => {
    // Choix légitime de l'utilisateur, explicitement pas une erreur.
    expect(questionIntegrityErrors(question({ correctChoices: [0] }), new Set())).toEqual([]);
  });

  it('accepte un QCM sans aucune bonne réponse et sans propositions', () => {
    expect(questionIntegrityErrors(question({ choices: [], correctChoices: [] }), new Set())).toEqual([]);
  });

  it('accepte une réponse vide', () => {
    // Une question sans réponse attendue est un choix légitime (correction
    // manuelle, question ouverte).
    expect(questionIntegrityErrors(question({ answer: '' }), new Set())).toEqual([]);
  });

  it('accepte une question sans aucune notion', () => {
    // Permis (docs/ai-ingestion-plan.md §11) — le filtre « sans chapitre » de la
    // liste sert à les retrouver, ce n'est pas au serveur de refuser.
    expect(questionIntegrityErrors(question({ notionIds: [] }), new Set())).toEqual([]);
  });

  it('accepte un ancien nom de type, qui a un mapping fondé', () => {
    // `sondage` → `qcm` : le sens est préservé, on répare au lieu de rejeter.
    const legacy = { responseType: 'sondage' } as unknown as Partial<Question>;
    expect(questionIntegrityErrors(question(legacy), new Set())).toEqual([]);
    expect(parseResponseType('sondage')).toBe('qcm');
  });
});

describe('missingStatementErrors — énoncé obligatoire', () => {
  it('refuse un énoncé vide, ou fait d’espaces', () => {
    expect(missingStatementErrors(question({ content: '' }))).toHaveLength(1);
    expect(missingStatementErrors(question({ content: '   ' }))).toHaveLength(1);
  });

  it('accepte un énoncé d’un seul caractère', () => {
    // Le minimum demandé est UN caractère, pas une phrase : ce n'est pas un
    // contrôle de qualité.
    expect(missingStatementErrors(question({ content: '?' }))).toEqual([]);
  });

  it('exige aussi un énoncé sur chaque question liée, et les nomme', () => {
    const q = question({ parts: [part({ content: 'ok' }), part({ id: 'p2', content: '' })] });
    const errors = missingStatementErrors(q);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('question liée 2');
  });

  it('ne dit rien des notions ni des types — ce n’est pas son rôle', () => {
    const q = question({ content: 'ok', notionIds: ['n-fantome'] });
    expect(missingStatementErrors(q)).toEqual([]);
  });
});

describe('assertStatements', () => {
  it('refuse TOUT le groupe, pas seulement l’énoncé fautif', () => {
    // Conserver l'ancien énoncé et enregistrer le reste serait une réparation
    // silencieuse : l'utilisateur verrait un texte qu'il n'a pas écrit.
    expect(() => assertStatements(question({ content: '' }))).toThrow(/énoncé/);
  });

  it('ne lève pas quand tous les énoncés sont remplis', () => {
    const q = question({ content: 'Énoncé', parts: [part({ content: 'Liée' })] });
    expect(() => assertStatements(q)).not.toThrow();
  });
});

describe('assertQuestionIntegrity', () => {
  it('ne lève pas sur une question intègre', () => {
    expect(() => assertQuestionIntegrity(question({ notionIds: ['n1'] }), new Set(['n1']))).not.toThrow();
  });

  it('lève un message qui identifie la question fautive', () => {
    expect(() => assertQuestionIntegrity(question({ notionIds: ['n-fantome'] }), new Set()))
      .toThrow(/Question g1/);
  });
});
