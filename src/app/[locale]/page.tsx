import { getLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserWorkshops } from '@/app/actions/workshops';

// Racine du site — elle ne rend rien, elle oriente.
//
// La page vitrine (héros, chiffres, fonctionnalités, témoignages, liste
// d'attente) a été retirée le 09/09/2026 : elle datait d'Evalia, promettait une
// beta qui n'existe plus, et la vitrine est à refaire entièrement. Plutôt que
// de laisser en ligne une promesse fausse, la racine mène à la seule porte qui
// compte aujourd'hui — la connexion.
//
// Quand la nouvelle vitrine s'écrira, c'est ici qu'elle reviendra : remplacer
// la redirection de fin par le rendu de la page.
export default async function HomePage() {
  const { userId } = await auth();
  const locale = await getLocale();

  if (userId) {
    // Pas de page d'accueil connectée (variante V2 · sans accueil) : on entre
    // directement dans le dernier atelier travaillé (owned avant joined,
    // chacun déjà trié par dernière visite — voir getUserWorkshops).
    // Aucun atelier → repli sur /dashboard (état vide + création).
    const { owned, joined } = await getUserWorkshops();
    const lastWorkshop = owned[0] ?? joined[0];
    redirect(lastWorkshop ? `/${locale}/workshops/${lastWorkshop.id}` : `/${locale}/dashboard`);
  }

  redirect(`/${locale}/sign-in`);
}
