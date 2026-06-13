import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getUserWorkshops, getTrashWorkshops, syncUserProfile } from '@/app/actions/workshops';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const user = await currentUser();
  const locale = await getLocale();

  if (!user) redirect(`/${locale}/sign-in`);

  const [{ owned, joined }, trashed, profile] = await Promise.all([
    getUserWorkshops(),
    getTrashWorkshops(),
    syncUserProfile(),
  ]);

  return (
    <DashboardClient
      locale={locale}
      firstName={user.firstName ?? user.emailAddresses[0]?.emailAddress.split('@')[0] ?? ''}
      uniqueTag={profile?.uniqueTag ?? ''}
      ownedWorkshops={owned}
      joinedWorkshops={joined}
      trashedWorkshops={trashed}
    />
  );
}
