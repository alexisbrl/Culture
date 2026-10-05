// Mise au format d'un tag utilisateur saisi à la main.
//
// Module pur, importable côté client : `tag.ts` tire le client Supabase serveur.
// Seuls passent les caractères de l'alphabet des tags, en majuscules : le « # »
// affiché devant un tag, les espaces d'un copier-coller, et les caractères exclus
// pour éviter les confusions (0/O, 1/I) disparaissent à la frappe, sans être
// remplacés — décision du 05/10/2026.
//
// Ne vaut que pour les tags UTILISATEUR : d'anciens tags d'atelier contiennent
// 0 et 1, générés avant cet alphabet.

/** Alphabet des tags générés — ni 0/O, ni 1/I. */
export const TAG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeTag(input: string): string {
  return [...input.toUpperCase()].filter((c) => TAG_ALPHABET.includes(c)).join('');
}
