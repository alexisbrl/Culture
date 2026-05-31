'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useUser, SignOutButton } from '@clerk/nextjs';
import LinkButton from '@/components/LinkButton';
import AvatarSVG from '@/components/avatar/AvatarSVG';
import type { AvatarConfig } from '@/components/avatar/types';
import { DEFAULT_AVATAR } from '@/components/avatar/types';
import { Menu, X, LogIn, LogOut, LayoutDashboard, ChevronDown, UserCircle } from 'lucide-react';

export default function Navbar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { isSignedIn, user, isLoaded } = useUser();

  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const pathWithoutLocale = pathname.replace(`/${locale}`, '') || '/';

  // Liens publics uniquement (sans "Créer un atelier")
  const publicLinks = [
    { href: `/${locale}`, label: t('home') },
    { href: `/${locale}/pricing`, label: t('pricing') },
    { href: `/${locale}/about`, label: t('about') },
    { href: `/${locale}/contact`, label: t('contact') },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-violet-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href={`/${locale}`} className="flex items-center gap-2 group">
            <svg viewBox="0 0 22 22" className="w-7 h-7 group-hover:scale-105 transition-transform" aria-hidden>
              <path d="M 11 20 L 11 11" stroke="#5a6b3e" strokeWidth="1.7" strokeLinecap="round" fill="none" />
              <ellipse cx="11" cy="8.5" rx="6.5" ry="6" fill="#7a9968" />
              <ellipse cx="8.8" cy="6.6" rx="3" ry="2.4" fill="#fff" opacity="0.28" />
              <path d="M 11 14 q -4 -1 -5 -4" stroke="#5a6b3e" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6" />
            </svg>
            <span className="text-xl font-bold text-gray-900">Culture</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname === link.href
                    ? 'text-violet-700 bg-violet-50'
                    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {/* Lien Mes ateliers visible seulement si connecté */}
            {isSignedIn && (
              <Link
                href={`/${locale}/create`}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  pathname.includes('/create')
                    ? 'text-violet-700 bg-violet-50'
                    : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'
                }`}
              >
                {t('create')}
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {/* Language switcher */}
            <Link
              href={`/${otherLocale}${pathWithoutLocale}`}
              className="text-sm font-medium text-gray-500 hover:text-violet-600 transition-colors px-2 py-1 rounded-md hover:bg-violet-50"
            >
              {locale.toUpperCase()}
            </Link>

            {/* Auth state */}
            {!isLoaded ? null : isSignedIn ? (
              /* User menu */
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-50 transition-colors"
                >
                  {/* Mini avatar SVG */}
                  <div className="w-7 h-7 rounded-full overflow-hidden">
                    <AvatarSVG
                      config={(user.publicMetadata?.avatarConfig as AvatarConfig) ?? DEFAULT_AVATAR}
                      size={28}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {user.firstName ?? user.emailAddresses[0]?.emailAddress.split('@')[0]}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50">
                    <Link
                      href={`/${locale}/profile`}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <UserCircle className="w-4 h-4" />
                      {locale === 'fr' ? 'Mon profil' : 'My profile'}
                    </Link>
                    <Link
                      href={`/${locale}/create`}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      {t('create')}
                    </Link>
                    <div className="border-t border-gray-100 my-1" />
                    <SignOutButton redirectUrl={`/${locale}`}>
                      <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600">
                        <LogOut className="w-4 h-4" />
                        {locale === 'fr' ? 'Se déconnecter' : 'Sign out'}
                      </button>
                    </SignOutButton>
                  </div>
                )}
              </div>
            ) : (
              /* Login + CTA */
              <div className="flex items-center gap-2">
                <Link
                  href={`/${locale}/sign-in`}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  {t('login')}
                </Link>
                <LinkButton
                  href={`/${locale}#waitlist`}
                  className="gradient-primary text-white border-0 hover:opacity-90 shadow-sm h-8 px-3 text-sm rounded-lg font-medium"
                >
                  {t('cta')}
                </LinkButton>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-violet-50"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-violet-100 bg-white px-4 py-4 space-y-1">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname === link.href
                  ? 'text-violet-700 bg-violet-50'
                  : 'text-gray-600 hover:text-violet-700 hover:bg-violet-50'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {isSignedIn && (
            <Link
              href={`/${locale}/create`}
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 text-sm font-medium rounded-lg text-gray-600 hover:text-violet-700 hover:bg-violet-50"
            >
              {t('create')}
            </Link>
          )}

          <div className="pt-3 border-t border-gray-100 space-y-2">
            <Link
              href={`/${otherLocale}${pathWithoutLocale}`}
              className="block text-sm font-medium text-gray-500 px-3 py-2"
            >
              Passer en {otherLocale.toUpperCase()}
            </Link>

            {isSignedIn ? (
              <SignOutButton redirectUrl={`/${locale}`}>
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
                  <LogOut className="w-4 h-4" />
                  {locale === 'fr' ? 'Se déconnecter' : 'Sign out'}
                </button>
              </SignOutButton>
            ) : (
              <div className="flex gap-2">
                <Link
                  href={`/${locale}/sign-in`}
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  <LogIn className="w-4 h-4" />
                  {t('login')}
                </Link>
                <LinkButton
                  href={`/${locale}#waitlist`}
                  className="flex-1 gradient-primary text-white border-0 h-9 rounded-lg text-sm font-medium flex items-center justify-center"
                >
                  {t('cta')}
                </LinkButton>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
