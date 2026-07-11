import type { Metadata } from 'next';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ensureUniqueId } from '@/app/actions/profile';
import ProfileClient from './ProfileClient';

// Pattern composant SERVEUR : dans une fonction async (ici la génération de métadonnées),
// on utilise `getTranslations` (et non le hook `useTranslations`). Cf. routine i18n CLAUDE.md §5.1.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile');
  return { title: t('metaTitle') };
}

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
