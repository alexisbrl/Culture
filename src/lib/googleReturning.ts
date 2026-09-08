/**
 * Marqueur « cette personne s'est déjà connectée avec Google sur ce navigateur ».
 *
 * Sert à n'afficher la bannière Google One Tap (cf. src/components/GoogleOneTapGate.tsx)
 * qu'aux visiteurs de retour dont on sait qu'ils passent par Google — jamais à un
 * nouveau visiteur, à qui une invite de connexion dès l'arrivée serait intrusive et
 * pourrait créer un compte sans qu'il l'ait demandé.
 *
 * Stocké en localStorage (persiste après la déconnexion et l'expiration de session,
 * contrairement au sessionStorage utilisé par signOutIntent.ts) : c'est justement
 * après la disparition de la session qu'on en a besoin. Marqueur purement local,
 * sans donnée personnelle — au pire il est absent (navigation privée, cookies
 * effacés) et la bannière ne s'affiche pas.
 */

const KEY = 'culture.googleReturning';

/** À appeler quand on constate que la personne connectée a un compte Google lié. */
export function markGoogleReturning() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // localStorage indisponible (mode privé strict) — sans effet.
  }
}

/** `true` = quelqu'un s'est déjà connecté via Google depuis ce navigateur. */
export function isGoogleReturning(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
