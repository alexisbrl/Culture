import { revalidatePath } from 'next/cache';

// Helpers de revalidation à scope étroit (audit 4.1).
//
// ⚠️ `revalidatePath` travaille sur la STRUCTURE DE FICHIERS de route, pas sur l'URL
// visible (cf. doc Next 16 `revalidatePath`). Comme toutes nos routes vivent sous le
// segment i18n `[locale]`, il faut passer le **pattern** avec `[locale]` (et `[id]`)
// + le `type` — requis dès qu'il y a un segment dynamique. Un chemin concret comme
// `/fr/workshops/<uuid>` ne matcherait pas la bonne entrée de cache.
//
// On évite `revalidatePath('/', 'layout')` (l'ancien défaut) qui invalide TOUTES les
// pages de l'app (jardin, profil, tarifs…) à chaque mutation d'atelier — un marteau-pilon.

/**
 * Invalide la page d'un atelier et ses sous-pages (paramètres, session) — pour tous
 * les locales. À appeler après toute mutation visible sur la page atelier / ses réglages
 * (détails, membres & rôles, invitations, fichiers, banque d'examens…).
 */
export function revalidateWorkshop() {
  revalidatePath('/[locale]/workshops/[id]', 'layout');
}

/**
 * Invalide la liste d'ateliers du dashboard (mes ateliers / rejoints / corbeille, et la
 * page recherche qui y redirige). À appeler quand la composition de la liste ou les
 * cartes changent (création, suppression, restauration, adhésion, nombre de membres,
 * couverture, badge Premium…).
 */
export function revalidateDashboard() {
  revalidatePath('/[locale]/dashboard', 'page');
}
