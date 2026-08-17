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
import DashboardHeader from '@/components/DashboardHeader';
import Footer from '@/components/Footer';
import SessionWatcher from '@/components/SessionWatcher';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LAST_WORKSHOP_COOKIE, parseLastWorkshop } from '@/lib/lastWorkshopCache';

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
  const lastWorkshop = isLoggedIn
    ? parseLastWorkshop((await cookies()).get(LAST_WORKSHOP_COOKIE)?.value, userId)
    : null;

  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang={locale} className={`${hankenGrotesk.variable} ${geistMono.variable} h-full`}>
        <body className="min-h-full flex flex-col bg-white">
          {/* `TooltipProvider` : délai d'ouverture partagé par toutes les
              infobulles de l'app (voir `components/ui/tooltip.tsx`). Monté une
              fois ici, comme le provider next-intl. */}
          <NextIntlClientProvider messages={messages}>
            <TooltipProvider>
            <SessionWatcher />
            {isLoggedIn ? (
              <Suspense fallback={<div style={{ height: 60, borderBottom: '1px solid var(--line)', background: 'var(--surface-raised)' }} className="hidden md:block" />}>
                {/* Contexte d'atelier passé dès le HTML : `userId` vient de
                    l'`auth()` déjà fait plus haut et le dernier atelier d'un
                    cookie déjà présent dans la requête — aucune requête base en
                    plus, et le groupe d'onglets ne « pope » plus après coup. */}
                <DashboardHeader userId={userId} initialWorkshop={lastWorkshop} />
              </Suspense>
            ) : (
              <Navbar />
            )}
            <main className={`flex-1 ${isLoggedIn ? 'pb-[78px] md:pb-0' : ''}`}>{children}</main>
            {!isLoggedIn && <Footer />}
            </TooltipProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
