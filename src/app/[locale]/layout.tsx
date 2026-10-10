import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Hanken_Grotesk, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { frFR, enUS } from '@clerk/localizations';
import { routing } from '@/i18n/routing';
import '../globals.css';
import Navbar from '@/components/Navbar';
import AppNav from '@/components/nav/AppNav';
import { NAV_W_CLOSED } from '@/components/nav/navWidths';
import Footer from '@/components/Footer';
import SessionWatcher from '@/components/SessionWatcher';
import GoogleOneTapGate from '@/components/GoogleOneTapGate';
import { LAST_WORKSHOP_COOKIE, parseLastWorkshop } from '@/lib/lastWorkshopCache';
import { NAV_PINNED_COOKIE, parseNavPinned } from '@/lib/navPinned';

const hankenGrotesk = Hanken_Grotesk({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "Culture — L'apprentissage réinventé",
  description:
    'Transformez vos formations en parcours adaptatifs et gamifiés. Vos apprenants progressent plus vite, restent motivés.',
  keywords: ['formation', 'e-learning', 'gamification', 'IA', 'apprentissage adaptatif'],
  openGraph: {
    title: "Culture — L'apprentissage réinventé",
    description: 'Transformez vos formations en parcours adaptatifs et gamifiés.',
    type: 'website',
  },
};

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'fr' | 'en')) {
    notFound();
  }

  const messages = await getMessages();
  const clerkLocalization = locale === 'fr' ? frFR : enUS;
  const { userId } = await auth();
  const isLoggedIn = !!userId;
  const cookieStore = await cookies();
  const lastWorkshop = isLoggedIn
    ? parseLastWorkshop(cookieStore.get(LAST_WORKSHOP_COOKIE)?.value, userId)
    : null;
  const navPinned = parseNavPinned(cookieStore.get(NAV_PINNED_COOKIE)?.value);

  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang={locale} className={`${hankenGrotesk.variable} ${geistMono.variable} h-full`}>
        <body className="min-h-full flex flex-col bg-white">
          <NextIntlClientProvider messages={messages}>
            <SessionWatcher />
            <GoogleOneTapGate />
            {isLoggedIn ? (
              // Ordinateur : menu latéral à gauche, contenu à droite. Téléphone :
              // le contenu seul, la barre du bas étant fixe. `app-main` est le
              // conteneur sur lequel se lisent les paliers de largeur du contenu
              // (feuille d'examen, globals.css) — la fenêtre n'en dit plus rien
              // depuis que le menu en prend une partie.
              <div className="flex flex-1 flex-col md:flex-row">
                <Suspense fallback={<div className="hidden flex-none md:block" style={{ width: NAV_W_CLOSED }} />}>
                  {/* Contexte d'atelier et état du menu passés dès le HTML :
                      `userId` vient de l'`auth()` déjà fait plus haut, le reste
                      de cookies déjà présents dans la requête — aucune requête
                      base en plus, et rien ne « pope » après coup. */}
                  <AppNav userId={userId} initialWorkshop={lastWorkshop} initialPinned={navPinned} />
                </Suspense>
                <main data-app-main className="min-w-0 flex-1 pb-[78px] [container-name:app-main] [container-type:inline-size] md:pb-0">{children}</main>
              </div>
            ) : (
              <>
                <Navbar />
                <main className="flex-1">{children}</main>
              </>
            )}
            {!isLoggedIn && <Footer />}
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
