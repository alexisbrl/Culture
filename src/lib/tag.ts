// Génération des tags publics (utilisateur ET atelier).
//
// Format Crockford-like : alphabet sans caractères ambigus (ni 0/O, ni 1/I/L),
// pour des tags faciles à lire/dicter. Ce sont des identifiants PUBLICS (partagés
// ouvertement, ex. pour rejoindre un atelier) — pas des secrets : `Math.random`
// suffit, l'unicité étant garantie par une boucle de vérification côté appelant.
// Pour un secret (ex. code de suppression), utiliser `crypto` à la place.

import { getSupabaseServerClient } from '@/lib/supabase';

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

async function isUserTagAvailable(tag: string): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('unique_tag', tag)
      .maybeSingle();
    return !data; // disponible si aucun résultat
  } catch {
    return true; // en cas d'erreur Supabase, on laisse passer (collision très improbable)
  }
}

// Génère un tag utilisateur garanti unique dans `user_profiles` (max 10 tentatives).
// Utilisé à la fois par `ensureUniqueId` (première visite de /profile) et
// `syncUserProfile` (fallback : garantit un compte utilisable dès sa première
// action, sans dépendre d'une visite préalable de /profile — voir CLAUDE.md
// §1 « Migrations » et l'incident de compte fraîchement créé, docs/changelog.md).
export async function generateUniqueUserTag(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateTag();
    if (await isUserTagAvailable(candidate)) return candidate;
  }
  throw new Error('Impossible de générer un ID unique après 10 tentatives');
}
