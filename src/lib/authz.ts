import { auth } from '@clerk/nextjs/server';
import { getSupabaseServerClient } from '@/lib/supabase';

// ─── Contrôle d'accès aux ateliers ───────────────────────────────────────────
//
// Point d'entrée unique pour vérifier les droits d'un utilisateur sur un atelier.
// À utiliser en tête de CHAQUE server action qui agit sur un atelier.
//
// ⚠️ Pourquoi c'est indispensable : une server action `'use server'` est une URL
// POST publique, appelable directement par n'importe quel utilisateur connecté
// (depuis la console du navigateur) avec n'importe quel `workshopId`. Le garde de
// rôle posé sur la *page* qui affiche l'action NE protège PAS l'action elle-même.
// Le contrôle d'accès doit donc être refait, ici, côté serveur, dans l'action.

// Rôles d'un membre d'atelier, par rang décroissant : owner > manager > member.
// owner = propriétaire, manager = gestionnaire, member = candidat.
export type WorkshopRole = 'owner' | 'manager' | 'member';

export const ROLE_RANK: Record<WorkshopRole, number> = {
  owner: 3,
  manager: 2,
  member: 1,
};

export type AuthorizedContext = {
  userId: string;
  role: WorkshopRole;
};

/**
 * Vérifie que l'utilisateur connecté est membre de l'atelier avec AU MOINS le
 * rôle requis. Retourne le contexte { userId, role } si autorisé, sinon `null`.
 */
export async function requireWorkshopRole(
  workshopId: string,
  minRole: WorkshopRole,
): Promise<AuthorizedContext | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = getSupabaseServerClient();
  const { data: membership } = await supabase
    .from('workshop_members')
    .select('role')
    .eq('workshop_id', workshopId)
    .eq('user_id', userId)
    .single();

  if (!membership) return null;

  const role = membership.role as WorkshopRole;
  if ((ROLE_RANK[role] ?? 0) < ROLE_RANK[minRole]) return null;

  return { userId, role };
}

/** Autorise tout membre de l'atelier (candidat inclus). */
export const requireMember = (workshopId: string) => requireWorkshopRole(workshopId, 'member');

/** Autorise les gestionnaires et le propriétaire. */
export const requireManager = (workshopId: string) => requireWorkshopRole(workshopId, 'manager');

/** Autorise uniquement le propriétaire. */
export const requireOwner = (workshopId: string) => requireWorkshopRole(workshopId, 'owner');

/**
 * Variante « throw » de `requireManager`, pour les server actions qui renvoient
 * `Promise<void>` et signalent déjà leurs erreurs par une exception (l'appelant
 * client les attrape en `.catch`). Lève si l'utilisateur n'est pas au moins
 * gestionnaire de l'atelier.
 */
export async function assertManager(workshopId: string): Promise<AuthorizedContext> {
  const ctx = await requireManager(workshopId);
  if (!ctx) throw new Error('Droits insuffisants');
  return ctx;
}
