'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { Resend } from 'resend';

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY manquante');
  return new Resend(process.env.RESEND_API_KEY);
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Génère un tag aléatoire de 7 caractères (sans lettres/chiffres ambigus)
function generateWorkshopTag(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 7; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Génère un tag d'atelier garanti unique (max 10 tentatives)
async function generateUniqueWorkshopTag(): Promise<string> {
  const supabase = getSupabaseServerClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateWorkshopTag();
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
  emoji: string | null;
  unique_tag: string | null;
  owner_name: string;
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
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, emoji, unique_tag')
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

    const roleMap: Record<string, 'owner' | 'member'> = {};
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
        emoji: w.emoji,
        unique_tag: w.unique_tag,
        owner_name: ownerNameMap[w.created_by] ?? 'Utilisateur',
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
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, emoji, unique_tag')
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
      currentUserRole: membership.role as 'owner' | 'member',
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
  emoji: string | null;
  ownerName: string;
  memberCount: number;
  isMember: boolean;
} | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;

    const supabase = getSupabaseServerClient();

    const { data: workshop } = await supabase
      .from('workshops')
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, emoji')
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
      emoji: workshop.emoji,
      ownerName,
      memberCount: members.length,
      isMember: members.some((m) => m.user_id === userId),
    };
  } catch (err) {
    console.error('getWorkshopPreview error:', err);
    return null;
  }
}

// ─── Update workshop details (owner only) ─────────────────────────────────────

export async function updateWorkshopDetails(
  workshopId: string,
  details: { description?: string; coverGradient?: string; coverImageUrl?: string | null; emoji?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: membership } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!membership || membership.role !== 'owner') {
      return { success: false, error: 'Droits insuffisants' };
    }

    const update: Record<string, string | null> = {};
    if (details.description !== undefined) update.description = details.description;
    if (details.coverGradient !== undefined) update.cover_gradient = details.coverGradient;
    if (details.coverImageUrl !== undefined) update.cover_image_url = details.coverImageUrl;
    if (details.emoji !== undefined) update.emoji = details.emoji;

    await supabase.from('workshops').update(update).eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('updateWorkshopDetails error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Upload a custom cover image (owner only) ─────────────────────────────────

export async function uploadWorkshopCover(
  workshopId: string,
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: membership } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!membership || membership.role !== 'owner') {
      return { success: false, error: 'Droits insuffisants' };
    }

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

    await supabase.from('workshops').update({ cover_image_url: url }).eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true, url };
  } catch (err) {
    console.error('uploadWorkshopCover error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Search workshops to join ─────────────────────────────────────────────────

export async function searchWorkshops(query: string): Promise<
  Array<{ id: string; name: string; created_at: string; description: string | null; cover_gradient: string | null; cover_image_url: string | null; emoji: string | null; unique_tag: string | null; member_count: number }>
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
      .select('id, name, created_at, description, cover_gradient, cover_image_url, emoji, unique_tag')
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

// ─── Join a workshop ──────────────────────────────────────────────────────────

export async function joinWorkshop(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: existing } = await supabase
      .from('workshop_members')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', profile.userId)
      .single();

    if (existing) return { success: false, error: 'Déjà membre' };

    await supabase.from('workshop_members').insert({
      workshop_id: workshopId,
      user_id: profile.userId,
      role: 'member',
    });

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('joinWorkshop error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Add member by unique tag (owner only) ────────────────────────────────────

export async function addMemberByTag(
  workshopId: string,
  uniqueTag: string,
  role: 'owner' | 'member'
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: currentMembership } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!currentMembership || currentMembership.role !== 'owner') {
      return { success: false, error: 'Droits insuffisants' };
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

    const { data: existing } = await supabase
      .from('workshop_members')
      .select('id')
      .eq('workshop_id', workshopId)
      .eq('user_id', targetUser.user_id)
      .single();

    if (existing) return { success: false, error: 'Cet utilisateur est déjà dans l\'atelier' };

    await supabase.from('workshop_members').insert({
      workshop_id: workshopId,
      user_id: targetUser.user_id,
      role,
    });

    revalidatePath('/', 'layout');
    return { success: true, displayName: targetUser.display_name };
  } catch (err) {
    console.error('addMemberByTag error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Remove member (owner only) ───────────────────────────────────────────────

export async function removeMember(
  workshopId: string,
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: currentMembership } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!currentMembership || currentMembership.role !== 'owner') {
      return { success: false, error: 'Droits insuffisants' };
    }

    if (targetUserId === userId) {
      return { success: false, error: 'Vous ne pouvez pas vous retirer vous-même' };
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
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    // Vérifier que l'utilisateur est propriétaire
    const { data: workshop } = await supabase
      .from('workshops')
      .select('name, created_by')
      .eq('id', workshopId)
      .single();

    if (!workshop || workshop.created_by !== userId) {
      return { success: false, error: 'Droits insuffisants' };
    }

    // Supprimer les anciens codes pour cet atelier
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
    await resend.emails.send({
      from: 'Culture <onboarding@resend.dev>',
      to: ownerEmail,
      subject: `🗑️ Code de suppression : ${code}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px;">🪴</span>
            <h1 style="color: #5f8a3f; font-size: 24px; margin: 8px 0;">Culture</h1>
          </div>
          <h2 style="color: #111827; font-size: 18px;">Confirmation de suppression</h2>
          <p style="color: #6b7280;">Bonjour ${ownerName},</p>
          <p style="color: #6b7280;">Vous avez demandé la suppression de l'atelier <strong style="color: #111827;">"${workshop.name}"</strong>.</p>
          <p style="color: #6b7280;">Voici votre code de confirmation :</p>
          <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #5f8a3f;">${code}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px;">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #d1d5db; font-size: 12px; text-align: center;">© Culture · scellow.com</p>
        </div>
      `,
    });

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
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    // Valider le code
    const { data: codeRecord } = await supabase
      .from('deletion_codes')
      .select('code, expires_at')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .single();

    if (!codeRecord) return { success: false, error: 'Code introuvable. Renvoyez un nouveau code.' };
    if (new Date(codeRecord.expires_at) < new Date()) return { success: false, error: 'Code expiré. Renvoyez un nouveau code.' };
    if (codeRecord.code !== code) return { success: false, error: 'Code incorrect.' };

    // Récupérer l'atelier et ses propriétaires
    const { data: workshop } = await supabase
      .from('workshops')
      .select('name, created_by')
      .eq('id', workshopId)
      .single();

    if (!workshop || workshop.created_by !== userId) {
      return { success: false, error: 'Droits insuffisants' };
    }

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

        await resend.emails.send({
          from: 'Culture <onboarding@resend.dev>',
          to: ownerEmail,
          subject: `🗑️ Atelier "${workshop.name}" mis en corbeille`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px;">🪴</span>
                <h1 style="color: #5f8a3f; font-size: 24px; margin: 8px 0;">Culture</h1>
              </div>
              <h2 style="color: #111827; font-size: 18px;">Atelier mis en corbeille</h2>
              <p style="color: #6b7280;">Bonjour ${ownerName},</p>
              <p style="color: #6b7280;">L'atelier <strong style="color: #111827;">"${workshop.name}"</strong> a été mis en corbeille par <strong>${actionBy}</strong>.</p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">⏳ Cet atelier sera <strong>définitivement supprimé dans 7 jours</strong> si aucune restauration n'est effectuée.</p>
              </div>
              <p style="color: #6b7280;">Si c'est une erreur, connectez-vous sur <a href="https://scellow.com" style="color: #5f8a3f;">scellow.com</a> et restaurez l'atelier depuis votre corbeille.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="color: #d1d5db; font-size: 12px; text-align: center;">© Culture · scellow.com</p>
            </div>
          `,
        });
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
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Non authentifié' };

    const supabase = getSupabaseServerClient();

    const { data: workshop } = await supabase
      .from('workshops')
      .select('created_by')
      .eq('id', workshopId)
      .single();

    if (!workshop || workshop.created_by !== userId) {
      return { success: false, error: 'Droits insuffisants' };
    }

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
