// Génération des tags publics (utilisateur ET atelier).
//
// Format Crockford-like : alphabet sans caractères ambigus (ni 0/O, ni 1/I/L),
// pour des tags faciles à lire/dicter. Ce sont des identifiants PUBLICS (partagés
// ouvertement, ex. pour rejoindre un atelier) — pas des secrets : `Math.random`
// suffit, l'unicité étant garantie par une boucle de vérification côté appelant.
// Pour un secret (ex. code de suppression), utiliser `crypto` à la place.

const TAG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Longueur des tags utilisateur et atelier. */
export const TAG_LENGTH = 8;

export function generateTag(length: number = TAG_LENGTH): string {
  let tag = '';
  for (let i = 0; i < length; i++) {
    tag += TAG_ALPHABET[Math.floor(Math.random() * TAG_ALPHABET.length)];
  }
  return tag;
}
