// Logique métier « membres d'atelier » (demandes d'adhésion, invitations, rôles,
// exclusion), extraite de src/app/actions/workshops.ts (audit §5.2).
//
// Ce module ne connaît ni Clerk `auth()` ni `revalidatePath` : il prend en entrée
// un userId déjà résolu (et, quand la règle en dépend, le rôle de l'acteur) et
// renvoie un résultat simple. L'autorisation (qui a le droit d'appeler la
// fonction) et les effets de bord liés à Next.js restent dans les wrappers
// `'use server'` de workshops.ts. Objectif : qu'une future route API (§5.2,
// `POST /api/v1/workshops/:id/members`) puisse appeler exactement ces mêmes
// fonctions après avoir résolu l'identité autrement (clé API plutôt que session
// Clerk), sans dupliquer les règles ci-dessous.

import { getSupabaseServerClient } from '@/lib/supabase';
import { ROLE_RANK, type WorkshopRole } from '@/lib/authz';
import type { WorkshopCardData } from '@/app/actions/workshops';

export type PendingInvite = {
  userId: string;
  displayName: string;
  uniqueTag: string;
  createdAt: string;
};

export type JoinRequestStatus = 'requested' | 'already_member' | 'joined';

export type MemberActionResult = { success: boolean; error?: string };

// ─── Demandes d'adhésion ──────────────────────────────────────────────────────

export async function requestToJoin(
  workshopId: string,
  userId: string
): Promise<{ success: boolean; status?: JoinRequestStatus; error?: string }> {
  const supabase = getSupabaseServerClient();

  const { data: workshop } = await supabase
    .from('workshops')
    .select('id')
    .eq('id', workshopId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!workshop) return { success: false, error: 'Atelier introuvable' };

  const { data: existingMember } = await supabase
    .from('workshop_members')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) return { success: true, status: 'already_member' };

  const { data: existingRequest } = await supabase
    .from('workshop_join_requests')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingRequest) return { success: true, status: 'requested' };

  // L'atelier avait déjà invité cette personne : pas besoin d'une demande en plus
  // à faire valider, on l'ajoute directement (résolution symétrique de inviteByTag
  // ci-dessous — évite deux entrées en attente pour le même couple).
  const { data: existingInvite } = await supabase
    .from('workshop_invitations')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingInvite) {
    // On délègue à acceptInvitation plutôt que de dupliquer l'insert : garantit
    // que toute règle future qui y sera ajoutée (facturation Premium — TODO §12,
    // notification…) s'applique aussi à cet ajout direct.
    const result = await acceptInvitation(workshopId, userId);
    if (!result.success) return result;
    return { success: true, status: 'joined' };
  }

  const { error: insertError } = await supabase.from('workshop_join_requests').insert({
    workshop_id: workshopId,
    user_id: userId,
  });

  if (insertError) {
    console.error('requestToJoin insert error:', insertError);
    return { success: false, error: "Erreur lors de l'envoi de la demande" };
  }

  return { success: true, status: 'requested' };
}

export async function listJoinRequests(workshopId: string): Promise<PendingInvite[]> {
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
}

export async function approveJoinRequest(
  workshopId: string,
  targetUserId: string
): Promise<MemberActionResult> {
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
    const { error: insertError } = await supabase.from('workshop_members').insert({
      workshop_id: workshopId,
      user_id: targetUserId,
      role: 'member',
    });

    // Symétrique de acceptInvitation : ignorer uniquement la violation de
    // contrainte unique (course avec acceptInvitation), pas les autres erreurs.
    if (insertError && insertError.code !== '23505') {
      console.error('approveJoinRequest insert error:', insertError);
      return { success: false, error: "Erreur lors de l'ajout du membre" };
    }
  }

  await supabase
    .from('workshop_join_requests')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', targetUserId);

  // La personne est désormais membre : une invitation en attente pour ce même
  // couple (workshop, user) devient sans objet — sinon elle resterait affichée
  // indéfiniment (« Invitations en attente ») alors que la personne est déjà membre.
  await supabase
    .from('workshop_invitations')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', targetUserId);

  return { success: true };
}

export async function rejectJoinRequest(
  workshopId: string,
  targetUserId: string
): Promise<MemberActionResult> {
  const supabase = getSupabaseServerClient();
  await supabase
    .from('workshop_join_requests')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', targetUserId);

  return { success: true };
}

export async function cancelJoinRequest(
  workshopId: string,
  userId: string
): Promise<MemberActionResult> {
  const supabase = getSupabaseServerClient();
  await supabase
    .from('workshop_join_requests')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', userId);

  return { success: true };
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function inviteByTag(
  workshopId: string,
  actorUserId: string,
  uniqueTag: string
): Promise<{ success: boolean; displayName?: string; userId?: string; autoJoined?: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  // L'invitation est réservée aux ateliers Premium — vérification côté serveur
  // (ne jamais se fier au gating UI, cf. CLAUDE.md « Atelier Premium »).
  const { data: workshop } = await supabase
    .from('workshops')
    .select('is_premium')
    .eq('id', workshopId)
    .single();

  if (!workshop?.is_premium) {
    return { success: false, error: "L'invitation est réservée aux ateliers Premium" };
  }

  const { data: targetUser } = await supabase
    .from('user_profiles')
    .select('user_id, display_name')
    .eq('unique_tag', uniqueTag.toUpperCase())
    .single();

  if (!targetUser) {
    return {
      success: false,
      error: "Utilisateur introuvable. Vérifiez le tag et assurez-vous que l'utilisateur s'est connecté à Culture.",
    };
  }

  if (targetUser.user_id === actorUserId) {
    return { success: false, error: 'Vous ne pouvez pas vous inviter vous-même' };
  }

  const { data: existingMember } = await supabase
    .from('workshop_members')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', targetUser.user_id)
    .single();

  if (existingMember) return { success: false, error: "Cet utilisateur est déjà membre de l'atelier" };

  // Cette personne avait déjà demandé à rejoindre l'atelier : pas besoin de
  // l'inviter en plus, on l'ajoute directement (résolution symétrique de
  // requestToJoin ci-dessus — évite deux entrées en attente pour le même couple).
  const { data: existingRequest } = await supabase
    .from('workshop_join_requests')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', targetUser.user_id)
    .maybeSingle();

  if (existingRequest) {
    // On délègue à approveJoinRequest plutôt que de dupliquer l'insert : garantit
    // que toute règle future qui y sera ajoutée (facturation Premium — TODO §12,
    // notification…) s'applique aussi à cet ajout direct.
    const result = await approveJoinRequest(workshopId, targetUser.user_id);
    if (!result.success) return result;
    return { success: true, displayName: targetUser.display_name, userId: targetUser.user_id, autoJoined: true };
  }

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
    invited_by: actorUserId,
  });

  if (insertError) {
    console.error('inviteByTag insert error:', insertError);
    return { success: false, error: "Erreur lors de l'envoi de l'invitation" };
  }

  return { success: true, displayName: targetUser.display_name, userId: targetUser.user_id };
}

// Construit les cartes WorkshopCardData pour une liste de workshopIds (déjà
// triés par pertinence par l'appelant) — factorisé entre listPendingInvitationsForUser
// et listJoinRequestsForUser, qui ne diffèrent que par la table d'origine des ids.
async function buildWorkshopCards(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  workshopIds: string[]
): Promise<WorkshopCardData[]> {
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

  // Conserver l'ordre d'entrée (déjà trié par le plus récent par l'appelant).
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
}

export async function listPendingInvitationsForUser(userId: string): Promise<WorkshopCardData[]> {
  const supabase = getSupabaseServerClient();

  const { data: invitations } = await supabase
    .from('workshop_invitations')
    .select('workshop_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!invitations || invitations.length === 0) return [];

  return buildWorkshopCards(supabase, invitations.map((i) => i.workshop_id));
}

// Demandes d'adhésion envoyées par l'utilisateur courant, encore en attente
// (pour l'affichage/annulation depuis son dashboard — miroir de
// listPendingInvitationsForUser).
export async function listJoinRequestsForUser(userId: string): Promise<WorkshopCardData[]> {
  const supabase = getSupabaseServerClient();

  const { data: requests } = await supabase
    .from('workshop_join_requests')
    .select('workshop_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!requests || requests.length === 0) return [];

  return buildWorkshopCards(supabase, requests.map((r) => r.workshop_id));
}

export async function acceptInvitation(
  workshopId: string,
  userId: string
): Promise<MemberActionResult> {
  const supabase = getSupabaseServerClient();

  const { data: invite } = await supabase
    .from('workshop_invitations')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', userId)
    .single();

  if (!invite) return { success: false, error: 'Invitation introuvable' };

  const { data: existing } = await supabase
    .from('workshop_members')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    const { error: insertError } = await supabase.from('workshop_members').insert({
      workshop_id: workshopId,
      user_id: userId,
      role: 'member',
    });

    // Code 23505 = violation de contrainte unique (workshop_id, user_id) : une
    // requête concurrente (ex. approveJoinRequest) a déjà créé le membre entre
    // notre lecture et notre insert — état recherché atteint, on continue.
    // Toute autre erreur est réelle : ne pas supprimer l'invitation ni annoncer
    // un succès si la personne n'a en fait pas été ajoutée.
    if (insertError && insertError.code !== '23505') {
      console.error('acceptInvitation insert error:', insertError);
      return { success: false, error: "Erreur lors de l'ajout du membre" };
    }
  }

  await supabase
    .from('workshop_invitations')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', userId);

  // Symétrique de approveJoinRequest : une demande d'adhésion en attente pour ce
  // même couple devient sans objet une fois l'invitation acceptée.
  await supabase
    .from('workshop_join_requests')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', userId);

  return { success: true };
}

export async function declineInvitation(
  workshopId: string,
  userId: string
): Promise<MemberActionResult> {
  const supabase = getSupabaseServerClient();
  await supabase
    .from('workshop_invitations')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', userId);

  return { success: true };
}

export async function listWorkshopInvitations(workshopId: string): Promise<PendingInvite[]> {
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
}

export async function cancelInvitation(
  workshopId: string,
  targetUserId: string
): Promise<MemberActionResult> {
  const supabase = getSupabaseServerClient();

  await supabase
    .from('workshop_invitations')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', targetUserId);

  return { success: true };
}

// ─── Rôles & exclusion ─────────────────────────────────────────────────────────
//
// Règles (cf. CLAUDE.md §14) : on ne peut agir que sur un membre de rang
// strictement inférieur au sien, jamais sur le propriétaire, et on ne peut pas
// promouvoir au-dessus de son propre rang. `setMemberRole` ne gère que les rôles
// gestionnaire/membre (le transfert de propriété est une opération distincte).

export async function setMemberRole(
  workshopId: string,
  actor: { userId: string; role: WorkshopRole },
  targetUserId: string,
  newRole: 'manager' | 'member'
): Promise<MemberActionResult> {
  if (targetUserId === actor.userId) {
    return { success: false, error: 'Vous ne pouvez pas changer votre propre rôle' };
  }

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

  return { success: true };
}

// un membre ou un gestionnaire peut quitter l'atelier de son propre chef ; le
// propriétaire ne le peut pas (il doit d'abord transférer la propriété ou
// supprimer l'atelier — opérations distinctes, non couvertes ici)
export async function leaveWorkshop(
  workshopId: string,
  actor: { userId: string; role: WorkshopRole }
): Promise<MemberActionResult> {
  if (actor.role === 'owner') {
    return { success: false, error: "Le propriétaire ne peut pas quitter l'atelier" };
  }

  const supabase = getSupabaseServerClient();

  await supabase
    .from('workshop_members')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', actor.userId);

  return { success: true };
}

export async function removeMember(
  workshopId: string,
  actor: { userId: string; role: WorkshopRole },
  targetUserId: string
): Promise<MemberActionResult> {
  if (targetUserId === actor.userId) {
    return { success: false, error: 'Vous ne pouvez pas vous retirer vous-même' };
  }

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

  return { success: true };
}
