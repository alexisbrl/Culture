import { currentUser } from '@clerk/nextjs/server';
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
  const user = await currentUser();
  const locale = await getLocale();

  if (!user) redirect(`/${locale}/sign-in`);

  const workshop = await getWorkshop(id);
  if (!workshop) notFound();

  const chapters = await getWorkshopChapters(id);
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) notFound();

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
