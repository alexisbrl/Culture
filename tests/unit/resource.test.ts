// La lecture de la réponse de l'étape 0 — le contrat d'une entrée non fiable.
//
// Trois raisons d'être testée, là où le reste de l'étape ne l'est pas :
//   • elle décide d'ÉCRIRE un document qui devient ensuite la source de vérité
//     de tout l'atelier ;
//   • elle lit un champ (`needs`) qui décide de la facture : mal lu, il fait
//     partir un corpus entier pour rien ;
//   • elle doit rendre « ne touche à rien » sur tout ce qu'elle ne comprend pas,
//     et jamais lever — une étape optionnelle n'a pas à faire tomber une
//     génération.

import { describe, expect, it } from 'vitest';

import {
  MAX_GENERATED_LENGTH,
  composeDocument,
  extractBody,
  questionCountFromHint,
  readResourceOutput,
} from '@/lib/ingest/resource';
import { EXAM_QUESTIONS_RANGE, MAX_QUESTIONS_PER_IMPORT } from '@/lib/ingest/prompt';

describe('readResourceOutput', () => {
  it('lit une réponse complète', () => {
    const outcome = readResourceOutput({
      document: { action: 'write', content: '## Titre\n\nDu cours.', summary: 'Cours créé' },
      instruction: 'Insiste sur les dates',
      dropped: false,
      needs: [],
    });
    expect(outcome.body).toBe('## Titre\n\nDu cours.');
    expect(outcome.instruction).toBe('Insiste sur les dates');
    expect(outcome.summary).toBe('Cours créé');
  });

  it('« keep » ne touche à rien, et une action inconnue non plus', () => {
    const keep = readResourceOutput({ document: { action: 'keep', content: 'ignoré' } });
    expect(keep.body).toBeNull();
    // Une valeur inattendue vaut « ne touche à rien » : c'est toujours la
    // conduite la moins dommageable sur un document qui fait foi.
    const unknown = readResourceOutput({ document: { action: 'replace', content: 'du texte' } });
    expect(unknown.body).toBeNull();
  });

  it('ne lève jamais, quoi qu’on lui donne', () => {
    for (const raw of [null, undefined, 'du texte', 42, [], {}]) {
      const outcome = readResourceOutput(raw);
      expect(outcome.body).toBeNull();
      expect(outcome.instruction).toBe('');
      expect(outcome.needs).toEqual([]);
    }
  });

  it('tronque un document trop long au lieu de le jeter', () => {
    const outcome = readResourceOutput({
      document: { action: 'write', content: 'a'.repeat(MAX_GENERATED_LENGTH + 500) },
    });
    // Jeter la réponse ferait perdre un appel cher pour un dépassement sans
    // conséquence : on coupe.
    expect(outcome.body).toHaveLength(MAX_GENERATED_LENGTH);
  });

  it('une consigne réécrite vide est un résultat, pas une absence', () => {
    const outcome = readResourceOutput({ document: { action: 'keep' }, instruction: '   ' });
    expect(outcome.instruction).toBe('');
  });

  describe('les documents demandés', () => {
    it('garde les numéros, dédoublonnés', () => {
      expect(readResourceOutput({ needs: [2, 0, 2] }).needs).toEqual([2, 0]);
    });

    it('écarte tout ce qui n’est pas un numéro de document', () => {
      expect(readResourceOutput({ needs: [1, -1, 1.5, '2', null, NaN] }).needs).toEqual([1]);
    });

    it('ne plafonne pas : « relis tout mon cours » est une demande légitime', () => {
      // Un plafond a existé une demi-journée. Il cassait le cas le plus banal —
      // « relis mon cours et corrige les erreurs » — en n'en relisant qu'une
      // partie, sans le dire. Ce qui borne la dépense, c'est que le contenu ne
      // parte que sur demande, pas un compte arbitraire.
      const many = Array.from({ length: 20 }, (_, i) => i);
      expect(readResourceOutput({ needs: many }).needs).toEqual(many);
    });

    it('un champ absent ou mal formé ne demande rien', () => {
      expect(readResourceOutput({ needs: 'tout' }).needs).toEqual([]);
      expect(readResourceOutput({}).needs).toEqual([]);
    });
  });

  describe('le nombre de questions d’examen', () => {
    // Répare le cas qui a fait tourner une génération d'une seule question
    // aussi longtemps qu'un examen entier de 40 (04/09/2026) : une demande en
    // toutes lettres ne passait par aucune lecture et retombait donc sur le
    // défaut, quel que soit ce qui était réellement demandé.
    it('lit un nombre explicite', () => {
      expect(readResourceOutput({ examQuestionCount: 1 }).examQuestionCount).toBe(1);
      expect(readResourceOutput({ examQuestionCount: 20 }).examQuestionCount).toBe(20);
    });

    it('ramène dans la plage plutôt que de refuser', () => {
      expect(readResourceOutput({ examQuestionCount: 0 }).examQuestionCount).toBeNull();
      expect(readResourceOutput({ examQuestionCount: -3 }).examQuestionCount).toBeNull();
      expect(readResourceOutput({ examQuestionCount: 5000 }).examQuestionCount).toBe(EXAM_QUESTIONS_RANGE.max);
    });

    it('un champ absent, décimal ou mal formé ne fixe rien : le réglage déjà en place s’applique', () => {
      expect(readResourceOutput({}).examQuestionCount).toBeNull();
      expect(readResourceOutput({ examQuestionCount: null }).examQuestionCount).toBeNull();
      expect(readResourceOutput({ examQuestionCount: 4.5 }).examQuestionCount).toBeNull();
      expect(readResourceOutput({ examQuestionCount: '10' }).examQuestionCount).toBeNull();
    });
  });
});

describe('le document et son en-tête', () => {
  it('rend au modèle exactement ce qu’il avait écrit', () => {
    const body = '## Chapitre 1\n\nLe contenu.';
    expect(extractBody(composeDocument(body))).toBe(body);
  });

  it('porte une en-tête qui le dit écrit par l’IA', () => {
    const document = composeDocument('Du contenu.');
    expect(document).toContain('écrit par l’IA');
    // L'en-tête est posée par NOUS à chaque écriture : c'est ce qui garantit
    // qu'elle est là, même si le modèle ne l'a pas reproduite.
    expect(document.indexOf('Du contenu.')).toBeGreaterThan(document.indexOf('écrit par l’IA'));
  });

  it('un document sans marque est rendu tel quel plutôt que perdu', () => {
    // Cas d'un document écrit par une version antérieure du format : deux lignes
    // d'en-tête en trop valent mieux qu'un cours effacé.
    expect(extractBody('Un vieux document sans marque.')).toBe('Un vieux document sans marque.');
  });
});

describe('questionCountFromHint', () => {
  it('un prompt fait de chiffres seuls est un nombre de questions', () => {
    expect(questionCountFromHint('40')).toBe(40);
    // Les espaces autour viennent de la frappe, pas d'une intention.
    expect(questionCountFromHint('  12  ')).toBe(12);
  });

  it('tout ce qui n’est pas QUE des chiffres reste une consigne', () => {
    // « 40 questions » porte une intention que le seul nombre ne porte pas :
    // des questions, et non des notions. Ça se lit, ça ne se devine pas.
    for (const hint of ['40 questions', '40,50', '4 0', 'quarante', '40 !', '']) {
      expect(questionCountFromHint(hint)).toBeNull();
    }
  });

  it('ramène au plafond plutôt que de refuser', () => {
    // Quelqu'un qui tape 5000 veut « beaucoup », pas un message d'erreur.
    expect(questionCountFromHint('5000')).toBe(MAX_QUESTIONS_PER_IMPORT);
  });

  it('zéro n’est pas une demande', () => {
    expect(questionCountFromHint('0')).toBeNull();
  });
});
