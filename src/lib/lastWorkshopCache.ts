// Mémoire du dernier atelier visité, pour le contexte de la barre de navigation
// (nom dans le sélecteur + groupe d'onglets, voir DashboardHeader).
//
// Pourquoi un cookie et pas une requête serveur : le header vit dans le layout,
// donc interroger la base pour cette information ajouterait une requête
// bloquante au rendu de TOUTES les pages. Le cookie, lui, est déjà dans la
// requête — le layout le lit gratuitement et le header a son contexte dès le
// HTML initial, sans « pop » après hydratation.
//
// Pourquoi pas localStorage : il n'est lisible qu'après hydratation, donc le
// groupe d'onglets apparaîtrait quand même avec un temps de retard sur un
// chargement à froid.
//
// Le `userId` est mémorisé avec la valeur et vérifié à la lecture : sur un poste
// partagé, la mémoire d'un compte ne doit pas fuiter sur la session du suivant.

export type CachedWorkshop = {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'member';
};

type Stored = CachedWorkshop & { userId: string };

export const LAST_WORKSHOP_COOKIE = 'culture.lastWorkshop';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Lecture commune au serveur (valeur du cookie) et au client. */
export function parseLastWorkshop(raw: string | undefined, userId: string): CachedWorkshop | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(decodeURIComponent(raw)) as Stored;
    if (stored.userId !== userId || !stored.id || !stored.name || !stored.role) return null;
    return { id: stored.id, name: stored.name, role: stored.role };
  } catch {
    return null;
  }
}

/** Écriture côté client uniquement — le serveur ne fait que lire. */
export function saveLastWorkshop(userId: string, workshop: CachedWorkshop): void {
  if (typeof document === 'undefined' || !userId) return;
  const value = encodeURIComponent(JSON.stringify({ userId, ...workshop } satisfies Stored));
  document.cookie = `${LAST_WORKSHOP_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearLastWorkshop(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LAST_WORKSHOP_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
