import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import GardenClient from './GardenClient';

export default async function GardenPage() {
  const user = await currentUser();
  const locale = await getLocale();

  if (!user) redirect(`/${locale}/sign-in`);

  const firstName =
    user.firstName ?? user.emailAddresses[0]?.emailAddress.split('@')[0] ?? '';

  return <GardenClient locale={locale} firstName={firstName} />;
}
