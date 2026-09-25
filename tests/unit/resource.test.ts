// La lecture de la réponse de l'étape 0 — le contrat d'une entrée non fiable.
//
// Trois raisons d'être testée, là où le reste de l'étape ne l'est pas :
//   • elle ÉCRIT un document qui devient ensuite la source de vérité de tout
//     l'atelier ;
//   • la question posée au décideur décide de la facture et du délai : un « oui »
//     de trop réécrit tout le cours, un « non » de trop perd la demande ;
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
  writingQuestion,
} from '@/lib/ingest/resource';
import { EXAM_QUESTIONS_RANGE, MAX_QUESTIONS_PER_IMPORT } from '@/lib/ingest/prompt';

describe('readResourceOutput', () => {
  it('lit une réponse complète', () => {
    const outcome = readResourceOutput({
      document: { content: '## Titre\n\nDu cours.', summary: 'Cours créé' },
      instruction: 'Insiste sur les dates',
      dropped: false,
    });
    expect(outcome.body).toBe('## Titre\n\nDu cours.');
    expect(outcome.instruction).toBe('Insiste sur les dates');
    expect(outcome.summary).toBe('Cours créé');
  });

  it('sans champ document, ou avec un corps vide, ne touche à rien', () => {
    // Sans décision d'écrire, le schéma n'offre même pas le champ : son absence
    // est le cas normal, pas une panne.
    expect(readResourceOutput({ instruction: 'En anglais' }).body).toBeNull();
    expect(readResourceOutput({ document: { content: '   ' } }).body).toBeNull();
    expect(readResourceOutput({ document: { content: 42 } }).body).toBeNull();
  });

  it('ne lève jamais, quoi qu’on lui donne', () => {
    for (const raw of [null, undefined, 'du texte', 42, [], {}]) {
      const outcome = readResourceOutput(raw);
      expect(outcome.body).toBeNull();
      expect(outcome.instruction).toBe('');
    }
  });

  it('tronque un document trop long au lieu de le jeter', () => {
    const outcome = readResourceOutput({
      document: { content: 'a'.repeat(MAX_GENERATED_LENGTH + 500) },
    });
    // Jeter la réponse ferait perdre un appel cher pour un dépassement sans
    // conséquence : on coupe.
    expect(outcome.body).toHaveLength(MAX_GENERATED_LENGTH);
  });

  it('une consigne réécrite vide est un résultat, pas une absence', () => {
    const outcome = readResourceOutput({ instruction: '   ' });
    expect(outcome.instruction).toBe('');
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

describe('writingQuestion — ce que voit le décideur', () => {
  const base = { hint: 'Fais-moi un cours sur les volcans', chapters: [], fileNames: [] };

  it('porte la demande, telle quelle', () => {
    expect(writingQuestion(base).state).toContain('« Fais-moi un cours sur les volcans »');
  });

  it('ne montre du cours de l’IA que ses titres, jamais son corps', () => {
    // Le corps peut peser des dizaines de milliers de caractères : le décideur doit rester rapide.
    const current = '## Les volcans\n\nUn volcan est une ouverture de la croûte.\n\n### Le magma\n\nRoche en fusion.';
    const { state } = writingQuestion({ ...base, current });
    expect(state).toContain('## Les volcans');
    expect(state).toContain('### Le magma');
    expect(state).not.toContain('Roche en fusion');
  });

  it('dit quand il n’y a ni document déposé ni cours de l’IA', () => {
    const { state } = writingQuestion(base);
    expect(state).toContain("Les documents déposés par l'utilisateur : aucun.");
    expect(state).toContain("aucun pour l'instant");
  });

  it('nomme les documents déposés, sans leur contenu', () => {
    const { state } = writingQuestion({ ...base, fileNames: ['Cours.pdf', 'Annexe.pdf'] });
    expect(state).toContain('- Cours.pdf');
    expect(state).toContain('- Annexe.pdf');
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
