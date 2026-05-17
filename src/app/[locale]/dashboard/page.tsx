import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getUserWorkshops } from '@/app/actions/workshops';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const user = await currentUser();
  const locale = await getLocale();

  if (!user) redirect(`/${locale}/sign-in`);

  const { owned, joined } = await getUserWorkshops();

  return (
    <DashboardClient
      locale={locale}
      firstName={user.firstName ?? user.emailAddresses[0]?.emailAddress.split('@')[0] ?? ''}
      ownedWorkshops={owned}
      joinedWorkshops={joined}
    />
  );
}
