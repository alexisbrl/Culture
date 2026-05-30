/**
 * Subscription system — source de vérité : Clerk publicMetadata (côté serveur uniquement).
 *
 * SÉCURITÉ : publicMetadata n'est modifiable que par le serveur (jamais par le client).
 * → Impossible à falsifier par un utilisateur, même en manipulant les cookies/localStorage.
 *
 * Intégration Stripe (future) :
 *   1. Checkout → créer/mettre à jour l'abonnement Stripe
 *   2. Webhook Stripe → appeler setUserTier() avec le bon tier
 *   3. Annulation/expiration → setUserTier(userId, 'free')
 *   Référence du plan : voir memory/stripe_integration_plan.md
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

// ---- Types ----

export type SubscriptionTier = 'free' | 'premium' | 'premium_plus';

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free:         'Gratuit',
  premium:      'Premium',
  premium_plus: 'Premium+',
};

/** Rang numérique — permet de comparer deux tiers avec >= */
const TIER_RANK: Record<SubscriptionTier, number> = {
  free:         0,
  premium:      1,
  premium_plus: 2,
};

// ---- Helpers ----

/** Retourne true si userTier donne accès à la fonctionnalité requise. */
export function tierHasAccess(
  userTier: SubscriptionTier,
  required: SubscriptionTier,
): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

/**
 * Lit le tier depuis les publicMetadata Clerk (server-side only).
 * Retourne 'free' si aucune valeur n'est définie.
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const raw = user.publicMetadata?.tier;
  if (raw === 'premium' || raw === 'premium_plus') return raw;
  return 'free';
}

/**
 * Met à jour le tier d'un utilisateur (server-side only).
 * Appelé par le webhook Stripe — ne jamais exposer directement à l'UI.
 */
export async function setUserTier(
  userId: string,
  tier: SubscriptionTier,
): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { tier },
  });
}

/**
 * Retourne { userId, tier } pour le User connecté.
 * Redirige vers /sign-in si non authentifié.
 */
export async function getAuthAndTier(
  locale = 'fr',
): Promise<{ userId: string; tier: SubscriptionTier }> {
  const { userId } = await auth();
  if (!userId) redirect(`/${locale}/sign-in`);
  const tier = await getUserTier(userId);
  return { userId, tier };
}

/**
 * Guard pour Server Components et API routes.
 * Redirige vers /pricing si le tier est insuffisant.
 *
 * Usage :
 *   const { userId, tier } = await requireTier('premium');
 */
export async function requireTier(
  required: SubscriptionTier,
  locale = 'fr',
): Promise<{ userId: string; tier: SubscriptionTier }> {
  const result = await getAuthAndTier(locale);
  if (!tierHasAccess(result.tier, required)) {
    redirect(`/${locale}/pricing`);
  }
  return result;
}
