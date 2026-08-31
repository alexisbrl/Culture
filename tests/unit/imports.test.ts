import { describe, expect, it } from 'vitest';

import {
  assertImportId,
  IMPORT_CANCEL_WINDOW_HOURS,
  importCancelState,
  type ImportRowDates,
} from '@/lib/workshops/imports';

// `cancelImport` est la seule suppression de masse de l'application : un
// identifiant vide y transformerait « supprime les lignes de ce lot » en
// « supprime toutes les lignes », chapitres et notions saisis à la main
// compris. Les deux gardes qui l'en empêchent sont pures — donc testées ici,
// avant même qu'un appelant existe.

const T0 = new Date('2026-08-20T10:00:00.000Z');
const iso = (d: Date) => d.toISOString();
const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

function row(createdAt: Date, updatedAt: Date = createdAt): ImportRowDates {
  return { createdAt: iso(createdAt), updatedAt: iso(updatedAt) };
}

describe('assertImportId — garde-fou de la suppression de masse', () => {
  it('accepte un uuid et le renvoie', () => {
    const id = '3f1e5d40-6ab6-44d5-9717-6e82da7435ae';
    expect(assertImportId(id)).toBe(id);
  });

  it('accepte un uuid en majuscules', () => {
    const id = '3F1E5D40-6AB6-44D5-9717-6E82DA7435AE';
    expect(assertImportId(id)).toBe(id);
  });

  it('refuse tout ce qui pourrait faire tomber le filtre', () => {
    // Le cœur du sujet : chacune de ces valeurs, laissée passer, viderait des
    // tables entières.
    expect(() => assertImportId(undefined)).toThrow();
    expect(() => assertImportId(null)).toThrow();
    expect(() => assertImportId('')).toThrow();
    expect(() => assertImportId('   ')).toThrow();
    expect(() => assertImportId('null')).toThrow();
    expect(() => assertImportId('undefined')).toThrow();
    expect(() => assertImportId(0)).toThrow();
    expect(() => assertImportId({})).toThrow();
    expect(() => assertImportId([])).toThrow();
  });

  it('refuse un identifiant qui ressemble à un uuid sans en être un', () => {
    expect(() => assertImportId('3f1e5d40-6ab6-44d5-9717')).toThrow();          // tronqué
    expect(() => assertImportId('3f1e5d40_6ab6_44d5_9717_6e82da7435ae')).toThrow(); // mauvais séparateur
    expect(() => assertImportId('zzzzzzzz-6ab6-44d5-9717-6e82da7435ae')).toThrow(); // hors hexadécimal
    expect(() => assertImportId(' 3f1e5d40-6ab6-44d5-9717-6e82da7435ae ')).toThrow(); // espaces
  });

  it('nomme la valeur fautive dans le message', () => {
    expect(() => assertImportId('')).toThrow(/""/);
  });
});

describe('importCancelState', () => {
  it('« empty » quand aucune ligne ne porte l’étiquette', () => {
    // Lot déjà annulé, ou identifiant inconnu. On ne stocke pas de statut : c'est
    // l'absence de lignes qui fait foi.
    expect(importCancelState([], T0)).toBe('empty');
  });

  it('« cancellable » dans le délai, si rien n’a été touché', () => {
    const rows = [row(T0), row(T0), row(T0)];
    expect(importCancelState(rows, plusHours(T0, 1))).toBe('cancellable');
    expect(importCancelState(rows, plusHours(T0, 23.9))).toBe('cancellable');
  });

  it('« expired » passé le délai, compté depuis la ligne la PLUS ANCIENNE', () => {
    // Un import écrit en plusieurs requêtes s'étale sur quelques secondes : c'est
    // son début qui date l'import, pas sa fin.
    const rows = [row(T0), row(plusHours(T0, 2))];
    expect(importCancelState(rows, plusHours(T0, 23))).toBe('cancellable');
    expect(importCancelState(rows, plusHours(T0, 25))).toBe('expired');
  });

  it('« modified » dès qu’UNE seule ligne a bougé', () => {
    const rows = [row(T0), row(T0), row(T0, plusHours(T0, 1))];
    expect(importCancelState(rows, plusHours(T0, 2))).toBe('modified');
  });

  it('ne confond pas « créé » et « modifié » à la milliseconde près', () => {
    // Le piège que tout le mécanisme doit éviter : `now()` étant l'heure de début
    // de transaction, un INSERT qui omet les deux colonnes leur donne une valeur
    // IDENTIQUE. Des dates égales ne valent donc pas « modifié » — sans quoi le
    // bouton d'annulation ne s'afficherait jamais.
    expect(importCancelState([row(T0, T0)], plusHours(T0, 1))).toBe('cancellable');
    // Une milliseconde d'écart, en revanche, est bien une modification.
    const justAfter = new Date(T0.getTime() + 1);
    expect(importCancelState([row(T0, justAfter)], plusHours(T0, 1))).toBe('modified');
  });

  it('ne prend pas l’import lui-même pour une modification humaine', () => {
    // Le bug du 29/08/2026 : depuis que les notions naissent SANS chapitre et que
    // le rangement les place quelques minutes plus tard, une notion porte
    // `updated_at > created_at` du seul fait de l'import qui l'a créée. Avec
    // l'ancienne règle, tout import qui range une notion neuve se déclarait
    // « modifié » et le bandeau d'annulation ne s'affichait plus jamais.
    const minutes = (m: number) => new Date(T0.getTime() + m * 60_000);
    const rows = [
      // la notion, créée au début puis rangée à la troisième minute
      row(T0, minutes(3)),
      // les questions, écrites jusqu'à la cinquième — dernière écriture du lot
      row(minutes(5)),
    ];
    expect(importCancelState(rows, plusHours(T0, 1))).toBe('cancellable');

    // Ce qui bouge APRÈS la dernière écriture, en revanche, est bien une main
    // humaine.
    const touchedAfter = [row(T0, minutes(3)), row(minutes(5), minutes(6))];
    expect(importCancelState(touchedAfter, plusHours(T0, 1))).toBe('modified');
  });

  it('le délai prime sur la modification', () => {
    // Passé 24 h, la question de savoir si on y a touché ne se pose plus.
    const rows = [row(T0, plusHours(T0, 1))];
    expect(importCancelState(rows, plusHours(T0, 30))).toBe('expired');
  });

  it('la fenêtre annoncée est bien celle appliquée', () => {
    const rows = [row(T0)];
    expect(importCancelState(rows, plusHours(T0, IMPORT_CANCEL_WINDOW_HOURS - 0.1))).toBe('cancellable');
    expect(importCancelState(rows, plusHours(T0, IMPORT_CANCEL_WINDOW_HOURS + 0.1))).toBe('expired');
  });
});
