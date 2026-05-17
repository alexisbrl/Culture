'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

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

    const { data: workshop, error } = await supabase
      .from('workshops')
      .insert({ name: name.trim(), created_by: profile.userId })
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

// ─── Get user's workshops ─────────────────────────────────────────────────────

export async function getUserWorkshops(): Promise<{
  owned: Array<{ id: string; name: string; created_at: string; member_count: number }>;
  joined: Array<{ id: string; name: string; created_at: string; member_count: number }>;
}> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { owned: [], joined: [] };

    const supabase = getSupabaseServerClient();

    const { data: memberships } = await supabase
      .from('workshop_members')
      .select('role, workshop_id')
      .eq('user_id', profile.userId);

    if (!memberships || memberships.length === 0) return { owned: [], joined: [] };

    const workshopIds = memberships.map((m) => m.workshop_id);

    const { data: workshops } = await supabase
      .from('workshops')
      .select('id, name, created_at')
      .in('id', workshopIds);

    const { data: counts } = await supabase
      .from('workshop_members')
      .select('workshop_id')
      .in('workshop_id', workshopIds);

    const countMap: Record<string, number> = {};
    for (const c of counts ?? []) {
      countMap[c.workshop_id] = (countMap[c.workshop_id] ?? 0) + 1;
    }

    const roleMap: Record<string, 'owner' | 'member'> = {};
    for (const m of memberships) roleMap[m.workshop_id] = m.role;

    const owned: Array<{ id: string; name: string; created_at: string; member_count: number }> = [];
    const joined: Array<{ id: string; name: string; created_at: string; member_count: number }> = [];

    for (const w of workshops ?? []) {
      const item = { id: w.id, name: w.name, created_at: w.created_at, member_count: countMap[w.id] ?? 1 };
      if (roleMap[w.id] === 'owner') owned.push(item);
      else joined.push(item);
    }

    return { owned, joined };
  } catch (err) {
    console.error('getUserWorkshops error:', err);
    return { owned: [], joined: [] };
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

    // 2. Récupérer l'atelier
    const { data: workshop } = await supabase
      .from('workshops')
      .select('id, name, created_at, created_by')
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

// ─── Search workshops to join ─────────────────────────────────────────────────

export async function searchWorkshops(query: string) {
  try {
    const { userId } = await auth();
    if (!userId || !query.trim()) return [];

    const supabase = getSupabaseServerClient();

    const { data: memberships } = await supabase
      .from('workshop_members')
      .select('workshop_id')
      .eq('user_id', userId);

    const ownedIds = memberships?.map((m) => m.workshop_id) ?? [];

    let q = supabase
      .from('workshops')
      .select('id, name, created_at')
      .ilike('name', `%${query}%`)
      .limit(8);

    if (ownedIds.length > 0) {
      q = q.not('id', 'in', `(${ownedIds.join(',')})`);
    }

    const { data } = await q;
    return data ?? [];
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
        error: 'Utilisateur introuvable. Vérifiez le tag et assurez-vous que l\'utilisateur s\'est connecté à Evalia.',
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

// ─── Delete workshop (owner only) ─────────────────────────────────────────────

export async function deleteWorkshop(
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

    await supabase.from('workshops').delete().eq('id', workshopId);

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err) {
    console.error('deleteWorkshop error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
