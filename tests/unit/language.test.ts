// La langue reconnue par le site : elle dit à l'étape notions dans quelle
// langue écrire, et signale un chapitre écrit dans une autre. Une erreur ici
// fait écrire tout un cours dans la mauvaise langue.

import { describe, expect, it } from 'vitest';

import { confidentLanguage, detectLanguage } from '@/lib/ingest/language';

const fr = 'Un groupe est un ensemble muni d’une loi de composition interne qui est associative, qui possède un élément neutre et dans lequel chaque élément a un symétrique. Les entiers relatifs avec l’addition forment un groupe commutatif. '.repeat(3);
const en = 'A group is a set together with an operation that is associative, has an identity element, and in which every element has an inverse. The integers with addition form a commutative group. '.repeat(3);

describe('detectLanguage', () => {
  it('reconnaît un cours français et un cours anglais', () => {
    expect(detectLanguage(fr).language).toBe('fr');
    expect(detectLanguage(en).language).toBe('en');
  });

  it('ne conclut rien sur trop peu de texte, ni sur des formules', () => {
    expect(detectLanguage('Le groupe.').language).toBeNull();
    expect(detectLanguage('det(AB) = det(A)·det(B) ; (a+b)² = a²+2ab+b²').language).toBeNull();
  });

  it('garde la langue d’enseignement d’un cours de langue', () => {
    const lesson = 'Le mot espagnol « la casa » signifie « la maison » en français. En espagnol, on dit « buenos días » pour souhaiter le bonjour le matin. Le verbe « ser » est employé pour décrire une caractéristique permanente, comme dans « Ella es alta ». '.repeat(3);
    expect(confidentLanguage(lesson)).toBe('fr');
  });
});
