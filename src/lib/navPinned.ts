// Mémoire du menu latéral épinglé (ouvert en permanence) ou replié.
//
// Même raison que le dernier atelier visité (voir lastWorkshopCache) : un cookie
// est lu par le layout dès le HTML initial, donc le menu arrive à la bonne
// largeur. Lu dans le navigateur, il naîtrait replié puis s'ouvrirait d'un coup
// après hydratation, en poussant tout le contenu de la page.
//
// Pas d'identité ici : c'est une préférence d'affichage du poste, pas une donnée
// du compte.

export const NAV_PINNED_COOKIE = 'culture.navPinned';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseNavPinned(raw: string | undefined): boolean {
  return raw === '1';
}

/** Écriture côté client uniquement — le serveur ne fait que lire. */
export function saveNavPinned(pinned: boolean): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${NAV_PINNED_COOKIE}=${pinned ? '1' : '0'}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}
