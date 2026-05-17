import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { frFR, enUS } from '@clerk/localizations';
import { routing } from '@/i18n/routing';
import '../globals.css';
import Navbar from '@/components/Navbar';
import DashboardHeader from '@/components/DashboardHeader';
import Footer from '@/components/Footer';

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "Evalia — L'apprentissage réinventé",
  description:
    'Transformez vos formations en parcours adaptatifs et gamifiés. Vos apprenants progressent plus vite, restent motivés.',
  keywords: ['formation', 'e-learning', 'gamification', 'IA', 'apprentissage adaptatif'],
  openGraph: {
    title: "Evalia — L'apprentissage réinventé",
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

  return (
    <ClerkProvider localization={clerkLocalization}>
      <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full`}>
        <body className="min-h-full flex flex-col bg-white">
          <NextIntlClientProvider messages={messages}>
            {isLoggedIn ? <DashboardHeader /> : <Navbar />}
            <main className="flex-1">{children}</main>
            {!isLoggedIn && <Footer />}
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
