/**
 * Stripe webhook — stub pour intégration future.
 *
 * Quand Stripe sera intégré, ce handler recevra les événements :
 *   - customer.subscription.created   → setUserTier(userId, 'premium' | 'premium_plus')
 *   - customer.subscription.updated   → mise à jour du tier si changement de plan
 *   - customer.subscription.deleted   → setUserTier(userId, 'free')
 *   - invoice.payment_failed          → notification + éventuellement downgrade après grâce
 *
 * Sécurité : vérifier la signature Stripe avec stripe.webhooks.constructEvent()
 * avant tout traitement — sinon n'importe qui peut appeler cette route.
 *
 * Référence : https://stripe.com/docs/webhooks/signatures
 */

import { NextResponse } from 'next/server';

export async function POST() {
  // TODO: implémenter avec Stripe SDK
  // import Stripe from 'stripe'
  // const sig = request.headers.get('stripe-signature')
  // const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  // switch (event.type) { ... }

  return NextResponse.json({ received: true });
}
