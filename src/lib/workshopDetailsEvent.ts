// Annonce, dans l'onglet courant, qu'un atelier vient de changer de nom ou
// d'emoji. La navigation (nav/AppNav) garde ces deux valeurs en mémoire pour ne
// pas les redemander au serveur à chaque page : sans cette annonce, elle
// affichait l'ancien nom jusqu'au changement d'atelier.
//
// Un événement du navigateur plutôt qu'un contexte React : la page des
// paramètres et le menu ne partagent aucun parent commun hors du layout.

export type WorkshopDetails = { id: string; name: string; emoji: string | null };

const EVENT = 'culture:workshop-details';

export function announceWorkshopDetails(details: WorkshopDetails): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkshopDetails>(EVENT, { detail: details }));
}

/** S'abonne aux annonces ; renvoie de quoi se désabonner (pour un effet). */
export function onWorkshopDetails(listener: (details: WorkshopDetails) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<WorkshopDetails>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
