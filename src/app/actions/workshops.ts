'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { randomInt } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase';
import { requireMember, requireManager, requireOwner, ROLE_RANK } from '@/lib/authz';
import { generateTag } from '@/lib/tag';
import { EMAIL_FROM, deletionCodeEmail, workshopTrashedEmail } from '@/lib/emails';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';

// Rangs d'atelier : la valeur ROLE_RANK vient de la source unique `@/lib/authz`.
// Le type est redéclaré ici en union littérale (un fichier `'use server'` ne peut
// pas réexporter un type), identique à celui d'authz.
export type WorkshopRole = 'owner' | 'manager' | 'member';

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY manquante');
  return new Resend(process.env.RESEND_API_KEY);
}

// Code à 6 chiffres généré avec un générateur cryptographiquement sûr
// (randomInt — pas de biais de modulo, non prédictible, contrairement à Math.random).
function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

// Génère un tag d'atelier garanti unique (max 10 tentatives).
// Le générateur de base est partagé avec les tags utilisateur (cf. @/lib/tag).
async function generateUniqueWorkshopTag(): Promise<string> {
  const supabase = getSupabaseServerClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateTag();
    const { data } = await supabase
      .from('workshops')
      .select('id')
      .eq('unique_tag', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error('Impossible de générer un tag unique après 10 tentatives');
}

// ─── Sync user profile to Supabase ───────────────────────────────────────────

export async function syncUserProfile(): Promise<{
  userId: string;
  uniqueTag: string;
  displayName: string;
} | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const uniqueTag = user.publicMetadata?.uniqueId as string | undefined;
  if (!uniqueTag) return null;

  const displayName =
    `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
    user.emailAddresses[0]?.emailAddress.split('@')[0] ||
    'Utilisateur';

  const supabase = getSupabaseServerClient();
  await supabase.from('user_profiles').upsert(
    { user_id: userId, unique_tag: uniqueTag, display_name: displayName, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );

  return { userId, uniqueTag, displayName };
}

// ─── Create a workshop ────────────────────────────────────────────────────────

export async function createWorkshop(
  name: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();
    const uniqueTag = await generateUniqueWorkshopTag();

    const { data: workshop, error } = await supabase
      .from('workshops')
      .insert({ name: name.trim(), created_by: profile.userId, unique_tag: uniqueTag })
      .select('id')
      .single();

    if (error || !workshop) {
      console.error('createWorkshop error:', error);
      return { success: false, error: 'Erreur lors de la création' };
    }

    await supabase.from('workshop_members').insert({
      workshop_id: workshop.id,
      user_id: profile.userId,
      role: 'owner',
    });

    revalidatePath('/', 'layout');
    return { success: true, id: workshop.id };
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Cleanup expired trashed workshops ───────────────────────────────────────

async function cleanupExpiredWorkshops() {
  try {
    const supabase = getSupabaseServerClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('workshops')
      .delete()
      .not('deleted_at', 'is', null)
      .lt('deleted_at', sevenDaysAgo);
  } catch (err) {
    console.error('cleanupExpiredWorkshops error:', err);
  }
}

// ─── Get user's workshops ─────────────────────────────────────────────────────

export type WorkshopCardData = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  description: string | null;
  cover_gradient: string | null;
  cover_image_url: string | null;
  cover_image_active: boolean;
  emoji: string | null;
  unique_tag: string | null;
  owner_name: string;
  is_premium: boolean;
  role?: WorkshopRole;
};

export async function getUserWorkshops(): Promise<{
  owned: WorkshopCardData[];
  joined: WorkshopCardData[];
}> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { owned: [], joined: [] };

    await cleanupExpiredWorkshops();

    const supabase = getSupabaseServerClient();

    const { data: memberships } = await supabase
      .from('workshop_members')
      .select('role, workshop_id, last_visited_at')
      .eq('user_id', profile.userId);

    if (!memberships || memberships.length === 0) return { owned: [], joined: [] };

    const workshopIds = memberships.map((m) => m.workshop_id);

    // Exclure les ateliers en corbeille
    const { data: workshops } = await supabase
      .from('workshops')
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, cover_image_active, emoji, unique_tag, is_premium')
      .in('id', workshopIds)
      .is('deleted_at', null);

    const { data: counts } = await supabase
      .from('workshop_members')
      .select('workshop_id')
      .in('workshop_id', workshopIds);

    const countMap: Record<string, number> = {};
    for (const c of counts ?? []) {
      countMap[c.workshop_id] = (countMap[c.workshop_id] ?? 0) + 1;
    }

    const roleMap: Record<string, WorkshopRole> = {};
    const lastVisitedMap: Record<string, string> = {};
    for (const m of memberships) {
      roleMap[m.workshop_id] = m.role;
      lastVisitedMap[m.workshop_id] = m.last_visited_at;
    }

    // Profils des propriétaires (pour le nom affiché dans la Preview)
    const ownerIds = [...new Set((workshops ?? []).map((w) => w.created_by))];
    let ownerProfiles: Array<{ user_id: string; display_name: string }> = [];
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', ownerIds);
      ownerProfiles = profiles ?? [];
    }
    const ownerNameMap = Object.fromEntries(ownerProfiles.map((p) => [p.user_id, p.display_name]));

    const owned: WorkshopCardData[] = [];
    const joined: WorkshopCardData[] = [];

    for (const w of workshops ?? []) {
      const item: WorkshopCardData = {
        id: w.id,
        name: w.name,
        created_at: w.created_at,
        member_count: countMap[w.id] ?? 1,
        description: w.description,
        cover_gradient: w.cover_gradient,
        cover_image_url: w.cover_image_url,
        cover_image_active: w.cover_image_active,
        emoji: w.emoji,
        unique_tag: w.unique_tag,
        owner_name: ownerNameMap[w.created_by] ?? 'Utilisateur',
        is_premium: w.is_premium,
        role: roleMap[w.id],
      };
      if (roleMap[w.id] === 'owner') owned.push(item);
      else joined.push(item);
    }

    const byLastVisited = (a: WorkshopCardData, b: WorkshopCardData) =>
      new Date(lastVisitedMap[b.id]).getTime() - new Date(lastVisitedMap[a.id]).getTime();

    owned.sort(byLastVisited);
    joined.sort(byLastVisited);

    return { owned, joined };
  } catch (err) {
    console.error('getUserWorkshops error:', err);
    return { owned: [], joined: [] };
  }
}

// ─── Get trashed workshops (owner only) ──────────────────────────────────────

export async function getTrashWorkshops(): Promise<
  Array<{ id: string; name: string; deleted_at: string; days_remaining: number }>
> {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    const supabase = getSupabaseServerClient();

    const { data: workshops } = await supabase
      .from('workshops')
      .select('id, name, deleted_at')
      .eq('created_by', userId)
      .not('deleted_at', 'is', null);

    return (workshops ?? []).map((w) => {
      const deletedAt = new Date(w.deleted_at).getTime();
      const expiresAt = deletedAt + 7 * 24 * 60 * 60 * 1000;
      const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
      return { id: w.id, name: w.name, deleted_at: w.deleted_at, days_remaining: daysRemaining };
    });
  } catch (err) {
    console.error('getTrashWorkshops error:', err);
    return [];
  }
}

// ─── Get workshop detail ──────────────────────────────────────────────────────

export async function getWorkshop(workshopId: string) {
  try {
    const { userId } = await auth();
    if (!userId) return null;

    const supabase = getSupabaseServerClient();

    // 1. Vérifier que l'utilisateur est membre
    const { data: membership } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!membership) return null;

    // Enregistrer la visite pour le tri du Dashboard (dernier atelier visité en premier)
    await supabase
      .from('workshop_members')
      .update({ last_visited_at: new Date().toISOString() })
      .eq('workshop_id', workshopId)
      .eq('user_id', userId);

    // 2. Récupérer l'atelier
    const { data: workshop } = await supabase
      .from('workshops')
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, cover_image_active, emoji, unique_tag, is_premium, show_programme')
      .eq('id', workshopId)
      .single();

    if (!workshop) return null;

    // 3. Récupérer les membres
    const { data: workshopMembers } = await supabase
      .from('workshop_members')
      .select('id, user_id, role, joined_at')
      .eq('workshop_id', workshopId);

    // 4. Récupérer les profils des membres
    const memberUserIds = (workshopMembers ?? []).map((m) => m.user_id);
    let userProfiles: Array<{ user_id: string; unique_tag: string; display_name: string }> = [];

    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, unique_tag, display_name')
        .in('user_id', memberUserIds);
      userProfiles = profiles ?? [];
    }

    const profileMap = Object.fromEntries(userProfiles.map((p) => [p.user_id, p]));

    const membersWithProfiles = (workshopMembers ?? []).map((m) => ({
      ...m,
      user_profiles: profileMap[m.user_id] ?? null,
    }));

    return {
      ...workshop,
      workshop_members: membersWithProfiles,
      currentUserRole: membership.role as WorkshopRole,
    };
  } catch (err) {
    console.error('getWorkshop error:', err);
    return null;
  }
}

// ─── Get workshop preview (public join page) ─────────────────────────────────

export async function getWorkshopPreview(workshopId: string): Promise<{
  id: string;
  name: string;
  createdAt: string;
  description: string | null;
  coverGradient: string | null;
  coverImageUrl: string | null;
  coverImageActive: boolean;
  emoji: string | null;
  ownerName: string;
  memberCount: number;
  isMember: boolean;
  hasRequested: boolean;
  isPremium: boolean;
} | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;

    const supabase = getSupabaseServerClient();

    const { data: workshop } = await supabase
      .from('workshops')
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, cover_image_active, emoji, is_premium')
      .eq('id', workshopId)
      .is('deleted_at', null)
      .single();

    if (!workshop) return null;

    const { data: workshopMembers } = await supabase
      .from('workshop_members')
      .select('user_id, role')
      .eq('workshop_id', workshopId);

    const members = workshopMembers ?? [];
    const owner = members.find((m) => m.role === 'owner');
    const isMember = members.some((m) => m.user_id === userId);

    // Demande d'adhésion déjà en attente pour l'utilisateur courant (non-membre) ?
    let hasRequested = false;
    if (!isMember) {
      const { data: request } = await supabase
        .from('workshop_join_requests')
        .select('id')
        .eq('workshop_id', workshopId)
        .eq('user_id', userId)
        .maybeSingle();
      hasRequested = !!request;
    }

    let ownerName = 'Utilisateur';
    if (owner) {
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('user_id', owner.user_id)
        .single();
      ownerName = ownerProfile?.display_name ?? ownerName;
    }

    return {
      id: workshop.id,
      name: workshop.name,
      createdAt: workshop.created_at,
      description: workshop.description,
      coverGradient: workshop.cover_gradient,
      coverImageUrl: workshop.cover_image_url,
      coverImageActive: workshop.cover_image_active,
      emoji: workshop.emoji,
      ownerName,
      memberCount: members.length,
      isMember,
      hasRequested,
      isPremium: workshop.is_premium,
    };
  } catch (err) {
    console.error('getWorkshopPreview error:', err);
    return null;
  }
}

// ─── Update workshop details (owner only) ─────────────────────────────────────

export async function updateWorkshopDetails(
  workshopId: string,
  details: {
    name?: string;
    description?: string;
    coverGradient?: string;
    coverImageUrl?: string | null;
    coverImageActive?: boolean;
    emoji?: string;
    showProgramme?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Réglages généraux : propriétaire ou gestionnaire.
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const supabase = getSupabaseServerClient();

    const update: Record<string, string | boolean | number | null> = {};
    if (details.name !== undefined) update.name = details.name;
    if (details.description !== undefined) update.description = details.description;
    if (details.coverGradient !== undefined) update.cover_gradient = details.coverGradient;
    if (details.coverImageUrl !== undefined) update.cover_image_url = details.coverImageUrl;
    if (details.coverImageActive !== undefined) update.cover_image_active = details.coverImageActive;
    if (details.emoji !== undefined) update.emoji = details.emoji;
    if (details.showProgramme !== undefined) update.show_programme = details.showProgramme;

    await supabase.from('workshops').update(update).eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('updateWorkshopDetails error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Activer le statut Premium d'un atelier (propriétaire uniquement) ─────────
//
// [TEST TEMPORAIRE — 13/06/2026, MAJ 21/06/2026] En attendant l'intégration Stripe
// (voir mémoire "Plan Stripe"), l'activation réelle ne devrait jamais avoir lieu sans
// paiement vérifié. Cette action est un mode de test protégé par un mot de passe en dur
// ET réservé aux comptes administrateurs (allowlist par email).
//
// L'allowlist est par EMAIL (et non par user_id Clerk) volontairement : l'instance
// Clerk de production est distincte de celle de dev, donc un même compte y a un user_id
// différent — l'email, lui, est stable entre les deux. Le mécanisme fonctionne ainsi
// à l'identique en local et en ligne (pas de "marche en dev, pas en prod").
//
// À RETIRER une fois le paiement Stripe branché sur cette action (mot de passe,
// allowlist email, et paramètre `password`).
const PREMIUM_TEST_ACTIVATION_PASSWORD = 'CultureMDP';
const PREMIUM_TEST_ADMIN_EMAILS = ['alex.bourillon@gmail.com'];

export async function activateWorkshopPremium(
  workshopId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    // Réservé aux comptes administrateurs (par email, stable entre instances Clerk dev/prod).
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = (
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      ''
    ).toLowerCase();

    if (!PREMIUM_TEST_ADMIN_EMAILS.includes(email)) {
      return { success: false, error: 'Activation réservée aux comptes administrateurs' };
    }

    if (password !== PREMIUM_TEST_ACTIVATION_PASSWORD) {
      return { success: false, error: 'Mot de passe incorrect' };
    }

    // Activation Premium : propriétaire uniquement.
    if (!(await requireOwner(workshopId))) {
      return { success: false, error: 'Droits insuffisants' };
    }

    const supabase = getSupabaseServerClient();

    const { data: workshop } = await supabase
      .from('workshops')
      .select('is_premium')
      .eq('id', workshopId)
      .single();

    if (!workshop) return { success: false, error: 'Atelier introuvable' };

    if (workshop.is_premium) {
      return { success: true };
    }

    await supabase
      .from('workshops')
      .update({ is_premium: true, premium_activated_at: new Date().toISOString() })
      .eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('activateWorkshopPremium error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Upload a custom cover image (owner only) ─────────────────────────────────

export async function uploadWorkshopCover(
  workshopId: string,
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    // Couverture personnalisée : propriétaire uniquement.
    if (!(await requireOwner(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const supabase = getSupabaseServerClient();

    const file = formData.get('file');
    if (!(file instanceof File)) return { success: false, error: 'Fichier manquant' };

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Format non supporté (jpg, png ou webp uniquement)' };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'Image trop lourde (5 Mo maximum)' };
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${workshopId}/cover-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('workshop-covers')
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error('uploadWorkshopCover upload error:', uploadError);
      return { success: false, error: 'Erreur lors du téléchargement' };
    }

    const { data: publicUrlData } = supabase.storage.from('workshop-covers').getPublicUrl(path);
    const url = publicUrlData.publicUrl;

    await supabase.from('workshops').update({ cover_image_url: url, cover_image_active: true }).eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true, url };
  } catch (err) {
    console.error('uploadWorkshopCover error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Search workshops to join ─────────────────────────────────────────────────

export async function searchWorkshops(query: string): Promise<
  Array<{ id: string; name: string; created_at: string; description: string | null; cover_gradient: string | null; cover_image_url: string | null; cover_image_active: boolean; emoji: string | null; unique_tag: string | null; member_count: number; is_premium: boolean }>
> {
  try {
    const { userId } = await auth();
    if (!userId || !query.trim()) return [];

    const supabase = getSupabaseServerClient();

    const { data: memberships } = await supabase
      .from('workshop_members')
      .select('workshop_id')
      .eq('user_id', userId);

    const ownedIds = memberships?.map((m) => m.workshop_id) ?? [];

    // Échappe les caractères qui ont un sens dans la syntaxe .or() de PostgREST
    const safeQuery = query.replace(/[,()%*]/g, '');

    let q = supabase
      .from('workshops')
      .select('id, name, created_at, description, cover_gradient, cover_image_url, cover_image_active, emoji, unique_tag, is_premium')
      .or(`name.ilike.%${safeQuery}%,unique_tag.ilike.${safeQuery}`)
      .is('deleted_at', null)
      .limit(8);

    if (ownedIds.length > 0) {
      q = q.not('id', 'in', `(${ownedIds.join(',')})`);
    }

    const { data: workshops } = await q;
    if (!workshops || workshops.length === 0) return [];

    const { data: counts } = await supabase
      .from('workshop_members')
      .select('workshop_id')
      .in('workshop_id', workshops.map((w) => w.id));

    const countMap: Record<string, number> = {};
    for (const c of counts ?? []) countMap[c.workshop_id] = (countMap[c.workshop_id] ?? 0) + 1;

    return workshops.map((w) => ({ ...w, member_count: countMap[w.id] ?? 0 }));
  } catch (err) {
    console.error('searchWorkshops error:', err);
    return [];
  }
}

// ─── Demandes d'adhésion (tous les ateliers sont privés) ──────────────────────
//
// Tous les ateliers sont privés : rejoindre un atelier ne crée jamais directement
// une adhésion, mais une DEMANDE en attente, qu'un gestionnaire ou le propriétaire
// doit valider (`approveJoinRequest`). C'est le miroir des invitations. À terme,
// une API publique pourra approuver automatiquement (équivalent d'un atelier public).

export type JoinRequestStatus = 'requested' | 'already_member';

export async function requestToJoinWorkshop(
  workshopId: string
): Promise<{ success: boolean; status?: JoinRequestStatus; error?: string }> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    // L'atelier doit exister et ne pas être en corbeille.
    const { data: workshop } = await supabase
      .from('workshops')
      .select('id')
      .eq('id', workshopId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!workshop) return { success: false, error: 'Atelier introuvable' };

    // Déjà membre → rien à faire.
    const { data: existingMember } = await supabase
      .from('workshop_members')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', profile.userId)
      .maybeSingle();

    if (existingMember) return { success: true, status: 'already_member' };

    // Demande déjà en attente → idempotent.
    const { data: existingRequest } = await supabase
      .from('workshop_join_requests')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', profile.userId)
      .maybeSingle();

    if (existingRequest) return { success: true, status: 'requested' };

    const { error: insertError } = await supabase.from('workshop_join_requests').insert({
      workshop_id: workshopId,
      user_id: profile.userId,
    });

    if (insertError) {
      console.error('requestToJoinWorkshop insert error:', insertError);
      return { success: false, error: 'Erreur lors de l\'envoi de la demande' };
    }

    revalidatePath('/', 'layout');
    return { success: true, status: 'requested' };
  } catch (err) {
    console.error('requestToJoinWorkshop error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Demandes d'adhésion en attente d'un atelier (gestionnaire/propriétaire) — page Paramètres.
// Réutilise le type PendingInvite (même forme : userId / displayName / uniqueTag / createdAt).
export async function getJoinRequests(workshopId: string): Promise<PendingInvite[]> {
  try {
    if (!(await requireManager(workshopId))) return [];

    const supabase = getSupabaseServerClient();

    const { data: requests } = await supabase
      .from('workshop_join_requests')
      .select('user_id, created_at')
      .eq('workshop_id', workshopId)
      .order('created_at', { ascending: false });

    if (!requests || requests.length === 0) return [];

    const requesterIds = requests.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, unique_tag')
      .in('user_id', requesterIds);
    const profMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));

    return requests.map((r) => ({
      userId: r.user_id,
      displayName: profMap[r.user_id]?.display_name ?? 'Utilisateur',
      uniqueTag: profMap[r.user_id]?.unique_tag ?? '',
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error('getJoinRequests error:', err);
    return [];
  }
}

// Approuver une demande d'adhésion : ajoute le membre puis supprime la demande.
export async function approveJoinRequest(
  workshopId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const supabase = getSupabaseServerClient();

    const { data: request } = await supabase
      .from('workshop_join_requests')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!request) return { success: false, error: 'Demande introuvable' };

    // TODO (§12) : facturer le propriétaire si l'atelier est Premium (~3,5 €/membre).

    const { data: existing } = await supabase
      .from('workshop_members')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('workshop_members').insert({
        workshop_id: workshopId,
        user_id: targetUserId,
        role: 'member',
      });
    }

    await supabase
      .from('workshop_join_requests')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('approveJoinRequest error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Refuser une demande d'adhésion : supprime la demande (l'utilisateur peut redemander).
export async function rejectJoinRequest(
  workshopId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const supabase = getSupabaseServerClient();
    await supabase
      .from('workshop_join_requests')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('rejectJoinRequest error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Annuler sa propre demande d'adhésion (depuis le dashboard du demandeur).
export async function cancelJoinRequest(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();
    await supabase
      .from('workshop_join_requests')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', userId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('cancelJoinRequest error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Invitations d'atelier ────────────────────────────────────────────────────

export type PendingInvite = {
  userId: string;
  displayName: string;
  uniqueTag: string;
  createdAt: string;
};

// Inviter un utilisateur par tag (propriétaire d'un atelier Premium uniquement).
// Crée une invitation en attente plutôt que d'ajouter directement le membre :
// l'utilisateur invité doit l'accepter depuis son dashboard.
export async function inviteMemberByTag(
  workshopId: string,
  uniqueTag: string
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    // Inviter : propriétaire ou gestionnaire.
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };
    const userId = ctx.userId;

    const supabase = getSupabaseServerClient();

    // L'invitation est réservée aux ateliers Premium — vérification côté serveur
    // (ne jamais se fier au gating UI, cf. CLAUDE.md « Atelier Premium »).
    const { data: workshop } = await supabase
      .from('workshops')
      .select('is_premium')
      .eq('id', workshopId)
      .single();

    if (!workshop?.is_premium) {
      return { success: false, error: 'L\'invitation est réservée aux ateliers Premium' };
    }

    const { data: targetUser } = await supabase
      .from('user_profiles')
      .select('user_id, display_name')
      .eq('unique_tag', uniqueTag.toUpperCase())
      .single();

    if (!targetUser) {
      return {
        success: false,
        error: 'Utilisateur introuvable. Vérifiez le tag et assurez-vous que l\'utilisateur s\'est connecté à Culture.',
      };
    }

    if (targetUser.user_id === userId) {
      return { success: false, error: 'Vous ne pouvez pas vous inviter vous-même' };
    }

    const { data: existingMember } = await supabase
      .from('workshop_members')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUser.user_id)
      .single();

    if (existingMember) return { success: false, error: 'Cet utilisateur est déjà membre de l\'atelier' };

    const { data: existingInvite } = await supabase
      .from('workshop_invitations')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUser.user_id)
      .single();

    if (existingInvite) return { success: false, error: 'Cet utilisateur a déjà été invité' };

    const { error: insertError } = await supabase.from('workshop_invitations').insert({
      workshop_id: workshopId,
      user_id: targetUser.user_id,
      invited_by: userId,
    });

    if (insertError) {
      console.error('inviteMemberByTag insert error:', insertError);
      return { success: false, error: 'Erreur lors de l\'envoi de l\'invitation' };
    }

    revalidatePath('/', 'layout');
    return { success: true, displayName: targetUser.display_name };
  } catch (err) {
    console.error('inviteMemberByTag error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Invitations en attente reçues par l'utilisateur courant (pour son dashboard).
// Réutilise le format WorkshopCardData pour s'afficher comme une carte d'atelier.
export async function getPendingInvitations(): Promise<WorkshopCardData[]> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return [];

    const supabase = getSupabaseServerClient();

    const { data: invitations } = await supabase
      .from('workshop_invitations')
      .select('workshop_id, created_at')
      .eq('user_id', profile.userId)
      .order('created_at', { ascending: false });

    if (!invitations || invitations.length === 0) return [];

    const workshopIds = invitations.map((i) => i.workshop_id);

    const { data: workshops } = await supabase
      .from('workshops')
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, cover_image_active, emoji, unique_tag, is_premium')
      .in('id', workshopIds)
      .is('deleted_at', null);

    if (!workshops || workshops.length === 0) return [];

    const { data: counts } = await supabase
      .from('workshop_members')
      .select('workshop_id')
      .in('workshop_id', workshopIds);

    const countMap: Record<string, number> = {};
    for (const c of counts ?? []) countMap[c.workshop_id] = (countMap[c.workshop_id] ?? 0) + 1;

    const ownerIds = [...new Set(workshops.map((w) => w.created_by))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', ownerIds);
    const ownerNameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.display_name]));

    const workshopMap = Object.fromEntries(workshops.map((w) => [w.id, w]));

    // Conserver l'ordre des invitations (les plus récentes en premier).
    return workshopIds
      .filter((id) => workshopMap[id])
      .map((id) => {
        const w = workshopMap[id];
        return {
          id: w.id,
          name: w.name,
          created_at: w.created_at,
          member_count: countMap[w.id] ?? 1,
          description: w.description,
          cover_gradient: w.cover_gradient,
          cover_image_url: w.cover_image_url,
          cover_image_active: w.cover_image_active,
          emoji: w.emoji,
          unique_tag: w.unique_tag,
          owner_name: ownerNameMap[w.created_by] ?? 'Utilisateur',
          is_premium: w.is_premium,
        };
      });
  } catch (err) {
    console.error('getPendingInvitations error:', err);
    return [];
  }
}

// Accepter une invitation : devient membre de l'atelier puis supprime l'invitation.
export async function acceptInvitation(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: invite } = await supabase
      .from('workshop_invitations')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', profile.userId)
      .single();

    if (!invite) return { success: false, error: 'Invitation introuvable' };

    const { data: existing } = await supabase
      .from('workshop_members')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', profile.userId)
      .single();

    if (!existing) {
      await supabase.from('workshop_members').insert({
        workshop_id: workshopId,
        user_id: profile.userId,
        role: 'member',
      });
    }

    await supabase
      .from('workshop_invitations')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', profile.userId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('acceptInvitation error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Refuser une invitation : supprime simplement l'invitation (le propriétaire peut réinviter).
export async function declineInvitation(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();
    await supabase
      .from('workshop_invitations')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', userId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('declineInvitation error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Invitations en attente d'un atelier (propriétaire uniquement) — pour la page Paramètres.
export async function getWorkshopInvitations(workshopId: string): Promise<PendingInvite[]> {
  try {
    if (!(await requireManager(workshopId))) return [];

    const supabase = getSupabaseServerClient();

    const { data: invitations } = await supabase
      .from('workshop_invitations')
      .select('user_id, created_at')
      .eq('workshop_id', workshopId)
      .order('created_at', { ascending: false });

    if (!invitations || invitations.length === 0) return [];

    const invitedIds = invitations.map((i) => i.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, unique_tag')
      .in('user_id', invitedIds);
    const profMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));

    return invitations.map((i) => ({
      userId: i.user_id,
      displayName: profMap[i.user_id]?.display_name ?? 'Utilisateur',
      uniqueTag: profMap[i.user_id]?.unique_tag ?? '',
      createdAt: i.created_at,
    }));
  } catch (err) {
    console.error('getWorkshopInvitations error:', err);
    return [];
  }
}

// Annuler une invitation en attente (propriétaire uniquement).
export async function cancelInvitation(
  workshopId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const supabase = getSupabaseServerClient();

    await supabase
      .from('workshop_invitations')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('cancelInvitation error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Changer le rôle d'un membre (propriétaire / gestionnaire, règles de rang) ──
//
// Règles (cf. CLAUDE.md §14) : on ne peut agir que sur un membre de rang
// strictement inférieur au sien, jamais sur le propriétaire, et on ne peut pas
// promouvoir au-dessus de son propre rang. `setMemberRole` ne gère que les rôles
// gestionnaire/membre (le transfert de propriété est une opération distincte,
// réservée au propriétaire, non couverte ici).
export async function setMemberRole(
  workshopId: string,
  targetUserId: string,
  newRole: 'manager' | 'member'
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireMember(workshopId);
    if (!actor) return { success: false, error: 'Droits insuffisants' };
    if (targetUserId === actor.userId) return { success: false, error: 'Vous ne pouvez pas changer votre propre rôle' };

    const supabase = getSupabaseServerClient();

    const { data: target } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId)
      .single();

    if (!target) return { success: false, error: 'Membre introuvable' };

    const actorRank = ROLE_RANK[actor.role] ?? 0;
    const targetRank = ROLE_RANK[target.role as WorkshopRole] ?? 0;

    // Jamais le propriétaire ; uniquement un rang strictement inférieur au sien.
    if (target.role === 'owner' || actorRank <= targetRank) {
      return { success: false, error: 'Droits insuffisants' };
    }
    // On ne peut pas promouvoir au-dessus de son propre rang.
    if (ROLE_RANK[newRole] > actorRank) {
      return { success: false, error: 'Droits insuffisants' };
    }

    await supabase
      .from('workshop_members')
      .update({ role: newRole })
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('setMemberRole error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Exclure un membre (propriétaire / gestionnaire, règles de rang) ───────────

export async function removeMember(
  workshopId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireMember(workshopId);
    if (!actor) return { success: false, error: 'Droits insuffisants' };
    if (targetUserId === actor.userId) return { success: false, error: 'Vous ne pouvez pas vous retirer vous-même' };

    const supabase = getSupabaseServerClient();

    const { data: target } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId)
      .single();

    if (!target) return { success: false, error: 'Membre introuvable' };

    const actorRank = ROLE_RANK[actor.role] ?? 0;
    const targetRank = ROLE_RANK[target.role as WorkshopRole] ?? 0;

    // Jamais le propriétaire ; uniquement un rang strictement inférieur au sien.
    if (target.role === 'owner' || actorRank <= targetRank) {
      return { success: false, error: 'Droits insuffisants' };
    }

    await supabase
      .from('workshop_members')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUserId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('removeMember error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Request deletion code (send email) ──────────────────────────────────────

export async function requestDeletionCode(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Suppression = propriétaire uniquement (rôle, pas created_by — gère le futur
    // transfert de propriété).
    const ctx = await requireOwner(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };
    const userId = ctx.userId;

    const supabase = getSupabaseServerClient();

    const { data: workshop } = await supabase
      .from('workshops')
      .select('name')
      .eq('id', workshopId)
      .single();

    if (!workshop) return { success: false, error: 'Atelier introuvable' };

    // Supprimer les anciens codes pour cet atelier (compteur d'essais remis à zéro)
    await supabase
      .from('deletion_codes')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', userId);

    // Générer et stocker le nouveau code (valable 15 min)
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase.from('deletion_codes').insert({
      workshop_id: workshopId,
      user_id: userId,
      code,
      expires_at: expiresAt,
    });

    // Récupérer l'email du propriétaire via Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const ownerEmail = user.emailAddresses[0]?.emailAddress;
    if (!ownerEmail) return { success: false, error: 'Email introuvable' };

    const ownerName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || ownerEmail;

    // Envoyer le code par email
    const resend = getResend();
    const mail = deletionCodeEmail({ ownerName, workshopName: workshop.name, code });
    await resend.emails.send({ from: EMAIL_FROM, to: ownerEmail, subject: mail.subject, html: mail.html });

    return { success: true };
  } catch (err) {
    console.error('requestDeletionCode error:', err);
    return { success: false, error: 'Erreur lors de l\'envoi de l\'email' };
  }
}

// ─── Confirm deletion with code → soft delete ────────────────────────────────

export async function confirmDeletion(
  workshopId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Suppression = propriétaire uniquement (rôle, pas created_by — gère le futur
    // transfert de propriété).
    const ctx = await requireOwner(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };
    const userId = ctx.userId;

    const supabase = getSupabaseServerClient();

    // Charger le code et son suivi anti-brute-force.
    const { data: codeRecord } = await supabase
      .from('deletion_codes')
      .select('code, expires_at, attempts, last_attempt_at')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!codeRecord) return { success: false, error: 'Code introuvable. Renvoyez un nouveau code.' };
    if (new Date(codeRecord.expires_at) < new Date()) return { success: false, error: 'Code expiré. Renvoyez un nouveau code.' };

    // Plafond de 25 essais : au-delà, le code est invalidé et l'utilisateur doit
    // renvoyer un nouveau code (jamais bloqué durablement).
    if (codeRecord.attempts >= 25) {
      await supabase.from('deletion_codes').delete().eq('workshop_id', workshopId).eq('user_id', userId);
      return { success: false, error: 'Trop de tentatives. Renvoyez un nouveau code.' };
    }

    // Délai minimal de 5 s entre deux essais (anti-brute-force).
    if (codeRecord.last_attempt_at && Date.now() - new Date(codeRecord.last_attempt_at).getTime() < 5000) {
      return { success: false, error: 'Veuillez patienter quelques secondes avant de réessayer.' };
    }

    // Enregistrer l'essai (compteur + horodatage) AVANT de comparer le code.
    await supabase
      .from('deletion_codes')
      .update({ attempts: codeRecord.attempts + 1, last_attempt_at: new Date().toISOString() })
      .eq('workshop_id', workshopId)
      .eq('user_id', userId);

    if (codeRecord.code !== code) return { success: false, error: 'Code incorrect.' };

    // Récupérer le nom de l'atelier (pour l'email de notification).
    const { data: workshop } = await supabase
      .from('workshops')
      .select('name')
      .eq('id', workshopId)
      .single();

    if (!workshop) return { success: false, error: 'Atelier introuvable' };

    const { data: owners } = await supabase
      .from('workshop_members')
      .select('user_id')
      .eq('workshop_id', workshopId)
      .eq('role', 'owner');

    // Soft delete
    await supabase
      .from('workshops')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', workshopId);

    // Supprimer le code utilisé
    await supabase
      .from('deletion_codes')
      .delete()
      .eq('workshop_id', workshopId)
      .eq('user_id', userId);

    // Envoyer email de notification à tous les propriétaires
    try {
      const resend = getResend();
      const client = await clerkClient();

      const currentUser = await client.users.getUser(userId);
      const actionBy = `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() ||
        currentUser.emailAddresses[0]?.emailAddress || 'Un propriétaire';

      for (const owner of owners ?? []) {
        const ownerUser = await client.users.getUser(owner.user_id);
        const ownerEmail = ownerUser.emailAddresses[0]?.emailAddress;
        if (!ownerEmail) continue;
        const ownerName = `${ownerUser.firstName ?? ''} ${ownerUser.lastName ?? ''}`.trim() || ownerEmail;

        const mail = workshopTrashedEmail({ ownerName, workshopName: workshop.name, actionBy });
        await resend.emails.send({ from: EMAIL_FROM, to: ownerEmail, subject: mail.subject, html: mail.html });
      }
    } catch (emailErr) {
      console.error('Email notification error (non-blocking):', emailErr);
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('confirmDeletion error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Restore workshop from trash ──────────────────────────────────────────────

export async function restoreWorkshop(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Restauration = propriétaire uniquement (rôle, cohérent avec la suppression).
    if (!(await requireOwner(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const supabase = getSupabaseServerClient();

    await supabase
      .from('workshops')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('restoreWorkshop error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
