'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import type { AvatarConfig } from '@/components/avatar/types';
// Config de l'avatar « composer » (PNG : face/hair/brow/eyes/nose/mouth/top),
// distincte du type legacy ci-dessus (numérique, AvatarSVG / Navbar visiteur).
import type { AvatarConfig as AvatarParts } from '@/components/avatar/avatarConfig';
import { generateUniqueUserTag } from '@/lib/tag';

// Garantit qu'un uniqueId existe pour l'utilisateur (appelé au premier chargement du profil).
// Fallback équivalent, pour les actions qui ne passent pas par /profile : `syncUserProfile`
// (`@/app/actions/workshops.ts`).
export async function ensureUniqueId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error('Non authentifié');

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  // ID déjà attribué → on le retourne directement
  if (user.publicMetadata?.uniqueId) {
    return user.publicMetadata.uniqueId as string;
  }

  const uniqueId = await generateUniqueUserTag();

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...user.publicMetadata,
      uniqueId,
    },
  });

  return uniqueId;
}

export type ProfileData = {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  profession: string;
  company: string;
  avatarConfig: AvatarConfig;
};

// Met à jour le profil complet
export async function updateProfile(data: ProfileData): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error('Non authentifié');

    const client = await clerkClient();

    // Mise à jour des champs natifs Clerk
    await client.users.updateUser(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
    });

    // Mise à jour des métadonnées
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        avatarConfig: data.avatarConfig,
        // profession et company sont en privé — non exposés côté client
      },
      privateMetadata: {
        phone: data.phone,
        dateOfBirth: data.dateOfBirth,
        address: data.address,
        profession: data.profession,
        company: data.company,
      },
    });

    return { success: true };
  } catch (err) {
    console.error('updateProfile error:', err);
    return { success: false, error: 'Erreur lors de la sauvegarde.' };
  }
}

// Persiste la config de l'avatar « composer » (PNG) dans Clerk publicMetadata,
// sous la clé `avatarParts` — source de vérité synchronisée à travers tous les
// appareils (remplace l'ancien stockage localStorage, propre à chaque appareil).
export async function updateAvatarParts(
  config: AvatarParts
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        avatarParts: config,
      },
    });

    return { success: true };
  } catch (err) {
    console.error('updateAvatarParts error:', err);
    return { success: false, error: 'Erreur lors de la sauvegarde de l\'avatar' };
  }
}

// Persiste la langue préférée de l'utilisateur (publicMetadata.locale) — source
// de vérité pour la langue de ses emails transactionnels. Synchronisée depuis
// l'URL par DashboardHeader (auto-sync au chargement et au changement de langue).
export async function setUserLocale(locale: 'fr' | 'en'): Promise<{ success: boolean }> {
  try {
    if (locale !== 'fr' && locale !== 'en') return { success: false };

    const { userId } = await auth();
    if (!userId) return { success: false };

    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // No-op si déjà à jour (évite une écriture Clerk inutile).
    if (user.publicMetadata?.locale === locale) return { success: true };

    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        locale,
      },
    });

    return { success: true };
  } catch (err) {
    console.error('setUserLocale error:', err);
    return { success: false };
  }
}

// Charge les données privées du profil (serveur uniquement)
export async function getPrivateProfileData(): Promise<{
  phone: string;
  dateOfBirth: string;
  address: string;
  profession: string;
  company: string;
}> {
  const { userId } = await auth();
  if (!userId) throw new Error('Non authentifié');

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = user.privateMetadata as Record<string, string>;
  return {
    phone:       meta?.phone       ?? '',
    dateOfBirth: meta?.dateOfBirth ?? '',
    address:     meta?.address     ?? '',
    profession:  meta?.profession  ?? '',
    company:     meta?.company     ?? '',
  };
}
