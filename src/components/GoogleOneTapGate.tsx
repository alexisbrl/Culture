'use client';

/**
 * Bannière Google One Tap, réservée aux visiteurs de retour.
 *
 * Google affiche en haut à droite une invite « Se connecter en tant que … » ; un
 * clic reconnecte, sans mot de passe ni formulaire. Le composant Clerk ne s'affiche
 * jamais à quelqu'un de déjà connecté, mais il s'afficherait par défaut à TOUT
 * visiteur possédant un compte Google, y compris quelqu'un qui découvre le site —
 * et une acceptation créerait un compte au passage. On le conditionne donc à un
 * marqueur local posé lors d'une précédente connexion Google (cf. lib/googleReturning.ts).
 *
 * Limite assumée : l'invite est fournie par Google, elle ne connaît donc que les
 * comptes Google. Quelqu'un qui se connecte habituellement par Apple ou par e-mail
 * ne verra jamais cette bannière — il n'existe pas d'équivalent web chez Apple.
 *
 * Prérequis côté Clerk : la connexion Google doit utiliser des identifiants Google
 * personnalisés (« Use custom credentials »), One Tap ne fonctionne pas avec les
 * identifiants partagés de développement.
 */

import { useEffect, useState } from 'react';
import { GoogleOneTap, useUser } from '@clerk/nextjs';
import { useLocale } from 'next-intl';
import { isGoogleReturning, markGoogleReturning } from '@/lib/googleReturning';

export default function GoogleOneTapGate() {
  const { isLoaded, isSignedIn, user } = useUser();
  const locale = useLocale();
  // Lu en effet et non au rendu : le serveur n'a pas accès au localStorage, une
  // lecture directe provoquerait un écart d'hydratation.
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      // Session en cours : on mémorise le mode de connexion pour les fois suivantes.
      if (user.externalAccounts.some((account) => account.provider === 'google')) {
        markGoogleReturning();
      }
      setEligible(false);
      return;
    }

    setEligible(isGoogleReturning());
  }, [isLoaded, isSignedIn, user]);

  if (!eligible) return null;

  return (
    <GoogleOneTap
      signInForceRedirectUrl={`/${locale}/dashboard`}
      signUpForceRedirectUrl={`/${locale}/dashboard`}
    />
  );
}
