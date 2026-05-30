import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { ensureUniqueId } from '@/app/actions/profile';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const user = await currentUser();
  const locale = await getLocale();

  if (!user) redirect(`/${locale}/sign-in`);

  const uniqueId = await ensureUniqueId();

  return (
    <ProfileClient
      locale={locale}
      uniqueId={uniqueId}
      firstName={user.firstName ?? ''}
      lastName={user.lastName ?? ''}
    />
  );
}
