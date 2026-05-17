import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import WorkshopNewClient from './WorkshopNewClient';

export default async function NewWorkshopPage() {
  const user = await currentUser();
  const locale = await getLocale();
  if (!user) redirect(`/${locale}/sign-in`);
  return <WorkshopNewClient locale={locale} />;
}
