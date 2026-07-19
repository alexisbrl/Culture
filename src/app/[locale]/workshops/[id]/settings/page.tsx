import { currentUser } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getWorkshop, getMemberGroups } from '@/app/actions/workshops';
import { getWorkshopFiles } from '@/app/actions/workshopFiles';
import { getWorkshopBricks } from '@/app/actions/workshopBricks';
import { getWorkshopChapters } from '@/app/actions/workshopChapters';
import SettingsClient from './SettingsClient';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SettingsPage({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  const locale = await getLocale();

  if (!user) redirect(`/${locale}/sign-in`);

  const workshop = await getWorkshop(id);
  if (!workshop) notFound();

  // Paramètres accessibles au propriétaire et au gestionnaire ; un candidat est renvoyé.
  if (workshop.currentUserRole === 'member') redirect(`/${locale}/workshops/${id}`);

  // Requêtes indépendantes → parallèle (règle N+1, cf. server-architecture.md)
  const [files, groups, bricks, chapters] = await Promise.all([
    getWorkshopFiles(id),
    getMemberGroups(id),
    getWorkshopBricks(id),
    getWorkshopChapters(id),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (workshop.workshop_members as any[]).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role as 'owner' | 'manager' | 'member',
    joinedAt: m.joined_at,
    displayName: m.user_profiles?.display_name ?? 'Utilisateur',
    uniqueTag: m.user_profiles?.unique_tag ?? '',
    groupIds: m.groups ?? [],
  }));

  return (
    <SettingsClient
      locale={locale}
      workshopId={workshop.id}
      workshopName={workshop.name}
      description={workshop.description}
      coverGradient={workshop.cover_gradient}
      coverImageUrl={workshop.cover_image_url}
      coverImageActive={workshop.cover_image_active}
      emoji={workshop.emoji}
      createdAt={workshop.created_at}
      uniqueTag={workshop.unique_tag}
      currentUserRole={workshop.currentUserRole}
      isPremium={workshop.is_premium}
      showProgramme={workshop.show_programme}
      members={members}
      groups={groups}
      files={files}
      bricks={bricks}
      chapters={chapters}
    />
  );
}
