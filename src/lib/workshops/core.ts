// Logique métier « atelier » (lecture, mise à jour des détails, Premium,
// couverture, recherche), extraite de src/app/actions/workshops.ts (audit §5.2,
// même découpage que @/lib/workshops/members).
//
// Comme pour members.ts : pas de Clerk `auth()`, pas de `revalidatePath` ici.
// Les fonctions prennent un userId déjà résolu quand la règle en dépend. Les
// wrappers `'use server'` de workshops.ts gardent l'authz (`requireManager`/
// `requireOwner`) et la revalidation Next.js.

import { getSupabaseServerClient } from '@/lib/supabase';
import type { WorkshopRole } from '@/lib/authz';
import type { WorkshopCardData } from '@/app/actions/workshops';

export async function getUserWorkshops(userId: string): Promise<{
  owned: WorkshopCardData[];
  joined: WorkshopCardData[];
}> {
  const supabase = getSupabaseServerClient();

  const { data: memberships } = await supabase
    .from('workshop_members')
    .select('role, workshop_id, last_visited_at')
    .eq('user_id', userId);

  if (!memberships || memberships.length === 0) return { owned: [], joined: [] };

  const workshopIds = memberships.map((m) => m.workshop_id);

  // Ateliers (hors corbeille) + nombre de membres : requêtes indépendantes →
  // lancées en parallèle (audit 4.2, chemin chaud appelé à chaque dashboard).
  const [{ data: workshops }, { data: counts }] = await Promise.all([
    supabase
      .from('workshops')
      .select('id, name, created_at, created_by, description, cover_gradient, cover_image_url, cover_image_active, emoji, unique_tag, is_premium')
      .in('id', workshopIds)
      .is('deleted_at', null),
    supabase
      .from('workshop_members')
      .select('workshop_id')
      .in('workshop_id', workshopIds),
  ]);

  const countMap: Record<string, number> = {};
  for (const c of counts ?? []) {
    countMap[c.workshop_id] = (countMap[c.workshop_id] ?? 0) + 1;
  }

  const roleMap: Record<string, WorkshopRole> = {};
  const lastVisitedMap: Record<string, string> = {};
  for (const m of memberships) {
    roleMap[m.workshop_id] = m.role as WorkshopRole;
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
}

export async function getTrashWorkshops(
  userId: string
): Promise<Array<{ id: string; name: string; deleted_at: string; days_remaining: number }>> {
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
}

export async function getWorkshop(workshopId: string, userId: string) {
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
    .select('id, user_id, role, joined_at, groups')
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
}

export async function getWorkshopPreview(
  workshopId: string,
  userId: string
): Promise<{
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
}

export async function updateDetails(
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

  return { success: true };
}

// Active le statut Premium d'un atelier. N'inclut PAS le mode de test (mot de
// passe + allowlist admin) : c'est un garde d'autorisation temporaire, il reste
// dans le wrapper `'use server'` avec `requireOwner`, pas ici.
export async function activatePremium(workshopId: string): Promise<{ success: boolean; error?: string }> {
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

  return { success: true };
}

export async function uploadCover(
  workshopId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = getSupabaseServerClient();

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
    console.error('uploadCover upload error:', uploadError);
    return { success: false, error: 'Erreur lors du téléchargement' };
  }

  const { data: publicUrlData } = supabase.storage.from('workshop-covers').getPublicUrl(path);
  const url = publicUrlData.publicUrl;

  await supabase.from('workshops').update({ cover_image_url: url, cover_image_active: true }).eq('id', workshopId);

  return { success: true, url };
}

export async function search(
  userId: string,
  query: string
): Promise<
  Array<{ id: string; name: string; created_at: string; description: string | null; cover_gradient: string | null; cover_image_url: string | null; cover_image_active: boolean; emoji: string | null; unique_tag: string | null; member_count: number; is_premium: boolean }>
> {
  if (!query.trim()) return [];

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
}
