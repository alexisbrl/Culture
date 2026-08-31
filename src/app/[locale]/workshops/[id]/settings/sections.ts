// Les onglets des Paramètres, dans l'ordre de la barre latérale.
//
// Module volontairement SANS `'use client'` : la page (composant serveur) doit
// pouvoir lire cette liste pour valider l'onglet demandé dans l'URL, et une
// valeur importée d'un module client n'arrive pas côté serveur sous sa vraie
// forme — on y reçoit une référence, pas un tableau (erreur constatée le
// 30/08/2026 : « NAV_ITEMS.some is not a function »). Les icônes, elles,
// restent avec le reste de l'habillage dans `settingsShared`.

export type NavSection = 'general' | 'members' | 'notions' | 'files' | 'premium';

export const NAV_SECTIONS = ['general', 'members', 'files', 'notions', 'premium'] as const satisfies readonly NavSection[];

export function isNavSection(value: string | undefined): value is NavSection {
  return !!value && (NAV_SECTIONS as readonly string[]).includes(value);
}
