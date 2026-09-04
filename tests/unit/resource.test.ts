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
  MAX_REQUESTED_DOCUMENTS,
  composeDocument,
  extractBody,
  readResourceOutput,
} from '@/lib/ingest/resource';

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

    it('plafonne : « donne-moi tout » ne doit pas passer par ce champ', () => {
      const many = Array.from({ length: 20 }, (_, i) => i);
      expect(readResourceOutput({ needs: many })).toMatchObject({
        needs: many.slice(0, MAX_REQUESTED_DOCUMENTS),
      });
    });

    it('un champ absent ou mal formé ne demande rien', () => {
      expect(readResourceOutput({ needs: 'tout' }).needs).toEqual([]);
      expect(readResourceOutput({}).needs).toEqual([]);
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
