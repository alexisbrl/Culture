/**
 * Marqueur de déconnexion volontaire.
 *
 * Permet à <SessionWatcher> de distinguer un clic explicite « se déconnecter »
 * (où l'on ne veut PAS afficher de message) d'une révocation de session forcée
 * — c'est-à-dire quand le compte vient d'être connecté ailleurs et que le webhook
 * Clerk a révoqué cette session (cf. src/app/api/webhooks/clerk/route.ts).
 *
 * Stocké en sessionStorage (volatile, propre à l'onglet) : on pose le marqueur
 * juste avant un sign-out volontaire, et le watcher le « consomme » à la
 * transition connecté → déconnecté.
 */

const KEY = 'culture.intentionalSignOut';

/** À appeler juste avant une déconnexion volontaire (clic « se déconnecter »). */
export function markIntentionalSignOut() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage indisponible (SSR / mode privé strict) — sans effet.
  }
}

/** Lit puis efface le marqueur. `true` = la déconnexion était volontaire. */
export function consumeIntentionalSignOut(): boolean {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v === '1';
  } catch {
    return false;
  }
}
