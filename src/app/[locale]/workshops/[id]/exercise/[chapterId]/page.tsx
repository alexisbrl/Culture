import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getWorkshop } from '@/app/actions/workshops';
import { getWorkshopChapters } from '@/app/actions/workshopChapters';
import ExerciseClient from './ExerciseClient';

// Page d'exercice du parcours, ouverte depuis le bouton d'un pot de l'onglet
// Programme. Accessible à tout membre de l'atelier — c'est la surface candidat
// du parcours, par opposition à la gestion des questions (gestionnaires).
//
// Aucune question n'est chargée ici : le tirage se fait à l'ouverture via
// `drawExercise`, qui ne renvoie jamais la réponse (voir
// app/actions/parcoursExercise.ts).

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
};

export default async function ExercisePage({ params }: Props) {
  const { id, chapterId } = await params;
  // `auth()` (le jeton de session, déjà présent dans la requête) plutôt que
  // `currentUser()`, qui irait chercher tout le profil auprès de Clerk sur le
  // réseau pour une simple vérification de connexion.
  const [{ userId }, locale] = await Promise.all([auth(), getLocale()]);

  if (!userId) redirect(`/${locale}/sign-in`);

  const workshop = await getWorkshop(id);
  if (!workshop) notFound();

  const chapters = await getWorkshopChapters(id);
  const chapter = chapters.find((c) => c.id === chapterId);
  // Un chapitre caché est sorti du parcours : il n'a plus de pot dans l'onglet
  // Programme, et son exercice n'existe donc plus non plus. Même traitement
  // qu'un chapitre inconnu — un lien gardé en signet ne doit pas le rouvrir.
  if (!chapter || chapter.hidden) notFound();

  return (
    <ExerciseClient
      locale={locale}
      workshopId={id}
      workshopName={workshop.name}
      chapterId={chapter.id}
      chapterName={chapter.name}
    />
  );
}
