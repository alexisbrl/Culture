'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { AvatarConfig } from '@/components/avatar/types';
// Config de l'avatar « composer » (PNG : face/hair/brow/eyes/nose/mouth/top),
// distincte du type legacy ci-dessus (numérique, AvatarSVG / Navbar visiteur).
import type { AvatarConfig as AvatarParts } from '@/components/avatar/avatarConfig';

// Génère un tag aléatoire de 7 caractères (sans lettres/chiffres ambigus)
function generateUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Vérifie dans Supabase qu'un tag n'est pas déjà utilisé
async function isTagAvailable(tag: string): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('unique_tag', tag)
      .maybeSingle();
    return !data; // disponible si aucun résultat
  } catch {
    return true; // en cas d'erreur Supabase, on laisse passer (collision très improbable)
  }
}

// Garantit qu'un uniqueId existe pour l'utilisateur (appelé au premier chargement du profil)
export async function ensureUniqueId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error('Non authentifié');

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  // ID déjà attribué → on le retourne directement
  if (user.publicMetadata?.uniqueId) {
    return user.publicMetadata.uniqueId as string;
  }

  // Générer un ID véritablement unique (max 10 tentatives)
  let uniqueId = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateUniqueId();
    if (await isTagAvailable(candidate)) {
      uniqueId = candidate;
      break;
    }
  }
  if (!uniqueId) throw new Error('Impossible de générer un ID unique après 10 tentatives');

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
