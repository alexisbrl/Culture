import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gray-950 text-gray-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div className="col-span-1">
            <Link href={`/${locale}`} className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 22 22" className="w-7 h-7" aria-hidden>
                <path d="M 11 20 L 11 11" stroke="#9ec47e" strokeWidth="1.7" strokeLinecap="round" fill="none" />
                <ellipse cx="11" cy="8.5" rx="6.5" ry="6" fill="#7a9968" />
                <ellipse cx="8.8" cy="6.6" rx="3" ry="2.4" fill="#fff" opacity="0.3" />
                <path d="M 11 14 q -4 -1 -5 -4" stroke="#9ec47e" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7" />
              </svg>
              <span className="text-xl font-bold text-white">Culture</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">{t('tagline')}</p>
            <p className="text-xs text-gray-600 mt-4">{t('madeWith')}</p>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              {t('company')}
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href={`/${locale}/pricing`} className="text-sm hover:text-violet-400 transition-colors">
                  {t('pricing')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/about`} className="text-sm hover:text-violet-400 transition-colors">
                  {t('about')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/contact`} className="text-sm hover:text-violet-400 transition-colors">
                  {t('contact')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              {t('legal')}
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href={`/${locale}/legal`} className="text-sm hover:text-violet-400 transition-colors">
                  {t('terms')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/legal`} className="text-sm hover:text-violet-400 transition-colors">
                  {t('privacy')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">
            {t('copyright', { year })}
          </p>
        </div>
      </div>
    </footer>
  );
}
