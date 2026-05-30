import { currentUser } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getWorkshop } from '@/app/actions/workshops';
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

  if (workshop.currentUserRole !== 'owner') redirect(`/${locale}/workshops/${id}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (workshop.workshop_members as any[]).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role as 'owner' | 'member',
    joinedAt: m.joined_at,
    displayName: m.user_profiles?.display_name ?? 'Utilisateur',
    uniqueTag: m.user_profiles?.unique_tag ?? '',
  }));

  return (
    <SettingsClient
      locale={locale}
      workshopId={workshop.id}
      workshopName={workshop.name}
      currentUserRole={workshop.currentUserRole}
      members={members}
    />
  );
}
