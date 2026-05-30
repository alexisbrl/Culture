'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { Zap, UserCircle, LogOut, ChevronDown, Crown } from 'lucide-react';
import AvatarComposer from '@/components/avatar/AvatarComposer';
import { loadAvatarConfig, type AvatarConfig } from '@/components/avatar/avatarConfig';

export default function DashboardHeader() {
  const locale = useLocale();
  const pathname = usePathname();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);

  useEffect(() => { setAvatarConfig(loadAvatarConfig()); }, []);

  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const pathWithoutLocale = pathname.replace(`/${locale}`, '') || '/dashboard';
  const otherLocalePath = `/${otherLocale}${pathWithoutLocale}`;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">
            Eval<span className="text-violet-600">ia</span>
          </span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Language switcher */}
          <Link
            href={otherLocalePath}
            className="text-sm font-medium text-gray-500 hover:text-violet-600 transition-colors px-2 py-1 rounded-md hover:bg-violet-50"
          >
            {locale.toUpperCase()}
          </Link>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-50 transition-colors"
            >
              <div className="w-7 h-7 rounded-full overflow-hidden bg-[#eef0dd]">
                {avatarConfig && (
                  <AvatarComposer config={avatarConfig} size={28} frame="head" />
                )}
              </div>
              <span className="text-sm font-medium text-gray-700">
                {user?.firstName ?? user?.emailAddresses[0]?.emailAddress.split('@')[0]}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {menuOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-2 z-50">
                  <Link
                    href={`/${locale}/profile`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700"
                  >
                    <UserCircle className="w-4 h-4" />
                    {locale === 'fr' ? 'Mon profil' : 'My profile'}
                  </Link>

                  <Link
                    href={`/${locale}/pricing`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-amber-600 hover:bg-amber-50"
                  >
                    <Crown className="w-4 h-4" />
                    {locale === 'fr' ? 'Passer Premium ✨' : 'Go Premium ✨'}
                  </Link>

                  <div className="border-t border-gray-100 my-1" />

                  <SignOutButton redirectUrl={`/${locale}`}>
                    <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600">
                      <LogOut className="w-4 h-4" />
                      {locale === 'fr' ? 'Se déconnecter' : 'Sign out'}
                    </button>
                  </SignOutButton>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
