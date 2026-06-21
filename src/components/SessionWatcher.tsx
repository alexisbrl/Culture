'use client';

/**
 * Surveille la session Clerk et redirige vers la page de connexion avec un
 * message dédié quand l'utilisateur est déconnecté involontairement — typiquement
 * parce que son compte vient d'être utilisé sur un autre appareil (le webhook
 * `session.created` a révoqué cette session, cf. src/app/api/webhooks/clerk/route.ts).
 *
 * Mécanisme : le client Clerk rafraîchit périodiquement le token de session ; quand
 * la session est révoquée côté serveur, ce rafraîchissement échoue et `isSignedIn`
 * passe à `false` (généralement en moins d'une minute). On détecte la transition
 * connecté → déconnecté et, si elle n'est PAS volontaire (cf. signOutIntent), on
 * redirige vers /sign-in?reason=session_revoked où une bannière explique la raison.
 *
 * Limite : ne couvre que les onglets ouverts. Si l'onglet de la victime était fermé,
 * elle retombe sur la connexion sans message au prochain accès (déconnexion silencieuse).
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { consumeIntentionalSignOut } from '@/lib/signOutIntent';

export default function SessionWatcher() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;

    // Transition connecté → déconnecté.
    if (wasSignedIn.current && !isSignedIn) {
      const intentional = consumeIntentionalSignOut();
      if (!intentional) {
        router.replace(`/${locale}/sign-in?reason=session_revoked`);
      }
    }

    wasSignedIn.current = !!isSignedIn;
  }, [isLoaded, isSignedIn, locale, router]);

  return null;
}
