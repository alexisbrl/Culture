'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { requireMember, requireManager, requireOwner } from '@/lib/authz';
import * as membersLib from '@/lib/workshops/members';
import * as coreLib from '@/lib/workshops/core';
import * as lifecycleLib from '@/lib/workshops/lifecycle';
import { revalidateWorkshop, revalidateDashboard } from '@/lib/revalidate';

// Logique métier (règles, requêtes Supabase) des fonctions ci-dessous : voir
// @/lib/workshops/members, core et lifecycle (audit §5.2). Les wrappers
// `'use server'` ici ne portent plus que l'authz Clerk et la revalidation Next.js.
//
// Types redéclarés ici (un fichier `'use server'` ne peut ni réexporter ni
// importer-puis-réexporter un type — Turbopack traite `export type { X }`
// comme un export de valeur et échoue au build), identiques à ceux d'
// `@/lib/workshops/members` / `@/lib/authz`.
export type PendingInvite = {
  userId: string;
  displayName: string;
  uniqueTag: string;
  createdAt: string;
};

export type JoinRequestStatus = 'requested' | 'already_member' | 'joined';

export type WorkshopRole = 'owner' | 'manager' | 'member';

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

    const result = await lifecycleLib.createWorkshop(name, profile.userId);
    if (result.success) revalidateDashboard();
    return result;
  } catch (err) {
    console.error(err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Cleanup expired trashed workshops ───────────────────────────────────────
//
// Audit 4.3 : le nettoyage (suppression définitive des ateliers en corbeille
// depuis > 7 jours) ne tourne plus à chaque lecture du dashboard. Il est
// désormais une tâche planifiée pg_cron côté base (job `cleanup-expired-trashed-
// workshops`, tous les jours à 03:00 UTC, migration `schedule_trash_cleanup_cron`).

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
    return await coreLib.getUserWorkshops(profile.userId);
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
    return await coreLib.getTrashWorkshops(userId);
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
    return await coreLib.getWorkshop(workshopId, userId);
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
    return await coreLib.getWorkshopPreview(workshopId, userId);
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

    const result = await coreLib.updateDetails(workshopId, details);
    // Détails affichés à la fois sur la page atelier et sur la carte du dashboard.
    if (result.success) {
      revalidateWorkshop();
      revalidateDashboard();
    }
    return result;
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

    const result = await coreLib.activatePremium(workshopId);
    if (result.success) {
      // Badge Premium visible sur la page atelier ET sur la carte du dashboard.
      revalidateWorkshop();
      revalidateDashboard();
    }
    return result;
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

    const file = formData.get('file');
    if (!(file instanceof File)) return { success: false, error: 'Fichier manquant' };

    const result = await coreLib.uploadCover(workshopId, file);
    if (result.success) {
      // Couverture visible sur la page atelier ET sur la carte du dashboard.
      revalidateWorkshop();
      revalidateDashboard();
    }
    return result;
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
    if (!userId) return [];
    return await coreLib.search(userId, query);
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

export async function requestToJoinWorkshop(
  workshopId: string
): Promise<{ success: boolean; status?: JoinRequestStatus; error?: string }> {
  try {
    const profile = await syncUserProfile();
    if (!profile) return { success: false, error: 'Non authentifié' };

    const result = await membersLib.requestToJoin(workshopId, profile.userId);
    if (result.success) {
      // L'état « demande envoyée » s'affiche sur le dashboard du demandeur.
      revalidateDashboard();
      // Ajout direct (invitation déjà en attente) : nouveau membre visible sur
      // la page atelier / Membres & rôles également.
      if (result.status === 'joined') revalidateWorkshop();
    }
    return result;
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
    return await membersLib.listJoinRequests(workshopId);
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

    const result = await membersLib.approveJoinRequest(workshopId, targetUserId);
    if (result.success) {
      // Nouveau membre : liste des membres (paramètres) + nombre de membres (cartes dashboard).
      revalidateWorkshop();
      revalidateDashboard();
    }
    return result;
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

    const result = await membersLib.rejectJoinRequest(workshopId, targetUserId);
    // Liste des demandes d'adhésion (page Paramètres → Membres & rôles).
    if (result.success) revalidateWorkshop();
    return result;
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

    const result = await membersLib.cancelJoinRequest(workshopId, userId);
    // L'état « demande envoyée » disparaît du dashboard du demandeur.
    if (result.success) revalidateDashboard();
    return result;
  } catch (err) {
    console.error('cancelJoinRequest error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Invitations d'atelier ────────────────────────────────────────────────────

// Inviter un utilisateur par tag (propriétaire d'un atelier Premium uniquement).
// Crée une invitation en attente plutôt que d'ajouter directement le membre :
// l'utilisateur invité doit l'accepter depuis son dashboard. Exception : si
// cette personne avait déjà une demande d'adhésion en attente, elle est ajoutée
// directement (voir membersLib.inviteByTag, `autoJoined`).
export async function inviteMemberByTag(
  workshopId: string,
  uniqueTag: string
): Promise<{ success: boolean; displayName?: string; userId?: string; autoJoined?: boolean; error?: string }> {
  try {
    // Inviter : propriétaire ou gestionnaire.
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };

    const result = await membersLib.inviteByTag(workshopId, ctx.userId, uniqueTag);
    if (result.success) {
      // Liste des invitations en attente (page Paramètres → Membres & rôles).
      revalidateWorkshop();
      // Ajout direct : nouveau membre visible sur le dashboard de la personne.
      if (result.autoJoined) revalidateDashboard();
    }
    return result;
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
    return await membersLib.listPendingInvitationsForUser(profile.userId);
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

    const result = await membersLib.acceptInvitation(workshopId, profile.userId);
    if (result.success) {
      // Le demandeur devient membre : nouvel atelier dans sa liste + accès à sa page.
      revalidateDashboard();
      revalidateWorkshop();
    }
    return result;
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

    const result = await membersLib.declineInvitation(workshopId, userId);
    // L'invitation disparaît de la liste des invitations reçues (dashboard de l'invité).
    if (result.success) revalidateDashboard();
    return result;
  } catch (err) {
    console.error('declineInvitation error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Invitations en attente d'un atelier (propriétaire uniquement) — pour la page Paramètres.
export async function getWorkshopInvitations(workshopId: string): Promise<PendingInvite[]> {
  try {
    if (!(await requireManager(workshopId))) return [];
    return await membersLib.listWorkshopInvitations(workshopId);
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

    const result = await membersLib.cancelInvitation(workshopId, targetUserId);
    // Liste des invitations en attente (page Paramètres → Membres & rôles).
    if (result.success) revalidateWorkshop();
    return result;
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

    const result = await membersLib.setMemberRole(workshopId, actor, targetUserId, newRole);
    // Rôle affiché dans la liste des membres + pastilles de rôle (page atelier / paramètres).
    if (result.success) revalidateWorkshop();
    return result;
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

    const result = await membersLib.removeMember(workshopId, actor, targetUserId);
    if (result.success) {
      // Membre retiré : liste des membres (paramètres) + nombre de membres (cartes dashboard).
      revalidateWorkshop();
      revalidateDashboard();
    }
    return result;
  } catch (err) {
    console.error('removeMember error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Quitter l'atelier (membre / gestionnaire — jamais le propriétaire) ────────

export async function leaveWorkshop(
  workshopId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireMember(workshopId);
    if (!actor) return { success: false, error: 'Droits insuffisants' };

    const result = await membersLib.leaveWorkshop(workshopId, actor);
    if (result.success) {
      // Atelier quitté : liste des membres (paramètres) + nombre de membres (cartes dashboard).
      revalidateWorkshop();
      revalidateDashboard();
    }
    return result;
  } catch (err) {
    console.error('leaveWorkshop error:', err);
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

    return await lifecycleLib.requestDeletionCode(workshopId, ctx.userId);
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

    const result = await lifecycleLib.confirmDeletion(workshopId, ctx.userId, code);
    // L'atelier quitte « mes ateliers » et apparaît dans la corbeille (dashboard).
    if (result.success) revalidateDashboard();
    return result;
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

    const result = await lifecycleLib.restoreWorkshop(workshopId);
    // L'atelier réapparaît dans « mes ateliers » et quitte la corbeille (dashboard).
    if (result.success) revalidateDashboard();
    return result;
  } catch (err) {
    console.error('restoreWorkshop error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
