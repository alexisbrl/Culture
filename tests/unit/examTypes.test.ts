import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BLOOM_LEVEL,
  normalizeTypeOptions,
  toBloomLevel,
  toResponseType,
} from '@/lib/workshops/examTypes';

// Les trois normaliseurs qui gardent la porte d'entrée du modèle de question.
// Ils sont déjà appelés à la lecture de la base ; l'ingestion IA en fera le
// premier rempart contre une sortie inventée (docs/ai-ingestion-plan.md §11).

describe('toResponseType', () => {
  it('laisse passer les 9 types réels', () => {
    for (const type of [
      'sans_reponse', 'qcs', 'qcm', 'textuelle', 'liste', 'tableau', 'matching', 'dessin', 'fichier',
    ]) {
      expect(toResponseType(type)).toBe(type);
    }
  });

  it('ramène les types retirés sur leur remplaçant', () => {
    // Types supprimés le 09/08/2026 — aucune migration, la normalisation se fait
    // à la lecture (docs/changelog.md).
    expect(toResponseType('sondage')).toBe('qcm');
    expect(toResponseType('ordre')).toBe('liste');
    expect(toResponseType('fill_blank')).toBe('textuelle');
    // Type de réponse « audio » retiré le 11/08/2026.
    expect(toResponseType('audio')).toBe('fichier');
    // Noms internes de la maquette.
    expect(toResponseType('grille')).toBe('tableau');
    expect(toResponseType('texte')).toBe('textuelle');
    expect(toResponseType('vide')).toBe('sans_reponse');
    expect(toResponseType('match')).toBe('matching');
  });

  it('ramène une valeur inventée sur « textuelle » plutôt que de la laisser passer', () => {
    // ⚠️ Comportement volontaire EN LECTURE, et seulement là : une question déjà
    // en base a été écrite par un humain, la faire disparaître parce que son type
    // a été retiré détruirait son travail.
    //
    // L'ingestion IA, elle, ne doit PAS s'appuyer là-dessus : un type inventé n'a
    // aucun mapping fondé, et le replier sur « textuelle » produirait une question
    // silencieusement fausse (un vrai/faux rendu en texte libre). Côté ingestion,
    // le schéma Zod rejette la question et compte l'écart — voir la règle
    // « réparer ou rejeter » dans docs/ai-ingestion-plan.md §7.
    expect(toResponseType('vrai_faux')).toBe('textuelle');
    expect(toResponseType('QCM')).toBe('textuelle'); // la casse compte
    expect(toResponseType(null)).toBe('textuelle');
    expect(toResponseType(undefined)).toBe('textuelle');
    expect(toResponseType(42)).toBe('textuelle');
    expect(toResponseType({ type: 'qcm' })).toBe('textuelle');
  });
});

describe('toBloomLevel', () => {
  it('laisse passer les 4 niveaux réels', () => {
    expect(toBloomLevel(1)).toBe(1);
    expect(toBloomLevel(2)).toBe(2);
    expect(toBloomLevel(3)).toBe(3);
    expect(toBloomLevel(4)).toBe(4);
  });

  it('ramène les anciens niveaux 5 et 6 sur 4', () => {
    // Bloom est passé de 6 à 4 niveaux le 10/08/2026 : « créer » reste le plus
    // exigeant de l'échelle réduite, on ne le rétrograde pas au niveau 1.
    expect(toBloomLevel(5)).toBe(4);
    expect(toBloomLevel(6)).toBe(4);
    expect(toBloomLevel(99)).toBe(4);
  });

  it('ramène tout le reste sur le niveau par défaut', () => {
    expect(toBloomLevel(0)).toBe(DEFAULT_BLOOM_LEVEL);
    expect(toBloomLevel(-3)).toBe(DEFAULT_BLOOM_LEVEL);
    expect(toBloomLevel(null)).toBe(DEFAULT_BLOOM_LEVEL);
    expect(toBloomLevel(undefined)).toBe(DEFAULT_BLOOM_LEVEL);
    expect(toBloomLevel('difficile')).toBe(DEFAULT_BLOOM_LEVEL);
  });

  it('accepte un nombre écrit en texte ou décimal', () => {
    // Une sortie de modèle peut typer un entier en chaîne.
    expect(toBloomLevel('3')).toBe(3);
    expect(toBloomLevel(2.4)).toBe(2);
  });
});

describe('normalizeTypeOptions', () => {
  it('renvoie un objet vide pour une entrée qui n’en est pas un', () => {
    expect(normalizeTypeOptions(null)).toEqual({});
    expect(normalizeTypeOptions('liste')).toEqual({});
    expect(normalizeTypeOptions(undefined)).toEqual({});
  });

  it('migre l’ancien drawOnImage vers answerOnImage sans écraser la valeur récente', () => {
    expect(normalizeTypeOptions({ drawOnImage: true })).toEqual({ answerOnImage: true });
    // La valeur explicite l'emporte sur celle qu'on migre.
    expect(normalizeTypeOptions({ drawOnImage: true, answerOnImage: false }))
      .toEqual({ answerOnImage: false });
  });

  it('conserve les réglages qu’il ne connaît pas', () => {
    expect(normalizeTypeOptions({ tableShuffleRows: true })).toEqual({ tableShuffleRows: true });
  });
});
