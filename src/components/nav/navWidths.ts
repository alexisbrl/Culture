// Largeurs du menu latéral, replié et ouvert.
//
// Module SANS `'use client'` : le layout (composant serveur) en a besoin pour
// réserver la place du menu avant son arrivée, et une valeur importée d'un
// module client n'arrive pas côté serveur sous sa vraie forme (même piège que
// settings/sections.ts).

export const NAV_W_CLOSED = 68;
export const NAV_W_OPEN = 248;
