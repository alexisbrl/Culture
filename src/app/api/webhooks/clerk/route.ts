/**
 * Webhook Clerk — une seule session active par compte (« la dernière connexion gagne »).
 *
 * À chaque événement `session.created` (nouvelle connexion, quel que soit l'appareil
 * ou le navigateur), on révoque toutes les AUTRES sessions actives de l'utilisateur.
 * Conséquence : se connecter quelque part déconnecte automatiquement l'utilisateur
 * partout ailleurs. L'enforcement est fait côté serveur via la Backend API Clerk —
 * impossible à contourner depuis le client.
 *
 * Pourquoi un webhook plutôt que le « single session mode » du dashboard Clerk :
 * le single session mode ne limite qu'à une session PAR NAVIGATEUR ; il n'empêche
 * pas un même compte d'être connecté sur deux appareils différents. Seule la
 * révocation des autres sessions via la Backend API garantit l'unicité globale.
 *
 * Configuration requise :
 *   1. Dashboard Clerk > Webhooks > créer un endpoint pointant vers
 *      https://<domaine>/api/webhooks/clerk, en s'abonnant à l'événement `session.created`.
 *   2. Copier le « Signing Secret » dans la variable d'env CLERK_WEBHOOK_SIGNING_SECRET.
 *
 * Sécurité : `verifyWebhook` valide la signature Svix avec CLERK_WEBHOOK_SIGNING_SECRET
 * avant tout traitement — sinon n'importe qui pourrait appeler cette route.
 *
 * Référence : https://clerk.com/docs/guides/development/webhooks/syncing
 */

import { NextResponse, type NextRequest } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { clerkClient } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error('[clerk webhook] échec de vérification de la signature:', err);
    return new NextResponse('Webhook verification failed', { status: 400 });
  }

  // On ne réagit qu'à la création d'une nouvelle session.
  if (evt.type !== 'session.created') {
    return NextResponse.json({ received: true });
  }

  const newSessionId = evt.data.id;
  const userId = evt.data.user_id;

  try {
    const client = await clerkClient();
    const { data: sessions } = await client.sessions.getSessionList({
      userId,
      status: 'active',
    });

    // Toutes les sessions actives sauf celle qui vient d'être créée.
    const toRevoke = sessions.filter((s) => s.id !== newSessionId);

    await Promise.all(
      toRevoke.map((s) =>
        client.sessions.revokeSession(s.id).catch((err) => {
          console.error(`[clerk webhook] échec de révocation de la session ${s.id}:`, err);
        }),
      ),
    );
  } catch (err) {
    // On répond 200 pour éviter que Clerk ne réessaie en boucle ; l'erreur est loggée.
    console.error('[clerk webhook] échec de l\'application de la session unique:', err);
    return NextResponse.json({ received: true, error: 'enforcement_failed' });
  }

  return NextResponse.json({ received: true });
}
