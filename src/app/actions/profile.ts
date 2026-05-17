'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import type { AvatarConfig } from '@/components/avatar/types';

// Génère un ID unique de 6 caractères (sans lettres/chiffres ambigus)
function generateUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Garantit qu'un uniqueId existe pour l'utilisateur (appelé au premier chargement du profil)
export async function ensureUniqueId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error('Non authentifié');

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  if (user.publicMetadata?.uniqueId) {
    return user.publicMetadata.uniqueId as string;
  }

  const uniqueId = generateUniqueId();
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
