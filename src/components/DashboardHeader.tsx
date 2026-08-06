'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { Sprout, ChevronDown, UserCircle, LogOut, Crown, Route, FileText, BookOpen, User } from 'lucide-react';
import AvatarComposer from '@/components/avatar/AvatarComposer';
import { loadAvatarConfig, type AvatarConfig } from '@/components/avatar/avatarConfig';
import { markIntentionalSignOut } from '@/lib/signOutIntent';
import { setUserLocale } from '@/app/actions/profile';
import { getWorkshop } from '@/app/actions/workshops';
import { Badge } from '@/components/ui/badge';
import WorkshopSwitcher from '@/components/WorkshopSwitcher';
import WorkshopActionsMenu from '@/components/WorkshopActionsMenu';
import NotificationBell from '@/components/NotificationBell';
import DropletCounter from '@/components/DropletCounter';

type WorkshopHeaderInfo = { name: string; role: 'owner' | 'manager' | 'member' };

// Énergie (gouttes) : la mécanique n'existe pas encore côté serveur (V2, voir
// docs/product-spec.md « Mécanique de progression »). Le compteur est monté sur
// une valeur fixe, non fonctionnelle — comme la cloche de notifications, dont
// le contenu est un exemple figé. À remplacer par la vraie donnée le jour où
// l'énergie et les notifications existent.
const PLACEHOLDER_DROPLETS = 12;

export default function DashboardHeader() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopHeaderInfo | null>(null);

  // Avatar synchronisé au compte (publicMetadata.avatarParts), repli localStorage
  // pour les configs non encore migrées. Se met à jour quand `user` change.
  useEffect(() => {
    const fromAccount = user?.publicMetadata?.avatarParts as AvatarConfig | undefined;
    setAvatarConfig(fromAccount ?? loadAvatarConfig());
  }, [user]);

  // Synchronise la langue préférée du compte (publicMetadata.locale) avec la
  // locale de l'URL — capture le choix initial ET chaque changement de langue,
  // pour tout utilisateur connecté (ce header est monté sur toutes les pages
  // connectées). Source de vérité pour la langue des emails transactionnels.
  // Le ref évite d'ré-écrire tant que le token Clerk n'a pas rafraîchi
  // `publicMetadata` (la condition resterait vraie sur un churn de `user`).
  const syncedLocaleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (user.publicMetadata?.locale === locale) return;
    if (syncedLocaleRef.current === locale) return;
    syncedLocaleRef.current = locale;
    void setUserLocale(locale as 'fr' | 'en');
  }, [user, locale]);

  const workshopMatch = pathname.match(/^\/[a-z]{2}\/workshops\/([^/]+)/);
  const workshopId = workshopMatch && workshopMatch[1] !== 'new' ? workshopMatch[1] : null;

  // Nom + rôle de l'atelier courant, pour la barre du haut. Appel client à la
  // server action existante (pas de nouvelle route) : coût d'une requête en plus
  // par navigation d'atelier, accepté pour ce socle de navigation (T12).
  useEffect(() => {
    if (!workshopId) {
      setWorkshop(null);
      return;
    }
    let cancelled = false;
    getWorkshop(workshopId).then((w) => {
      if (!cancelled) setWorkshop(w ? { name: w.name, role: w.currentUserRole } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  const canManage = workshop?.role === 'owner' || workshop?.role === 'manager';
  const activeTab = searchParams.get('tab') ?? 'programme';
  const isJardin = pathname.includes('/garden');
  const isProfil = pathname.includes('/profile');

  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const pathWithoutLocale = pathname.replace(`/${locale}`, '') || '/dashboard';
  const otherLocalePath = `/${otherLocale}${pathWithoutLocale}`;

  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-soft)] focus-visible:shadow-[var(--shadow-focus)] ${
      active ? 'font-extrabold text-[var(--green)]' : 'font-semibold text-[var(--ink-muted)] hover:text-[var(--ink)]'
    }`;

  const isExercise = pathname.includes('/exercise/');
  const mobileItemClass = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-[3px] py-1.5 text-[10.5px] leading-none font-semibold outline-none ${
      active ? 'text-[var(--green)]' : 'text-[var(--ink-muted)]'
    }`;

  return (
    <>
      {!isExercise && (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 border-t border-[var(--line)] bg-[var(--surface-raised)] px-3 pt-2 pb-3.5 md:hidden">
          <Link href={`/${locale}/garden`} className={mobileItemClass(isJardin)}>
            <Sprout size={22} strokeWidth={1.75} />
            {t('tabJardin')}
          </Link>
          {workshopId && (
            <div className="flex flex-[3] items-stretch gap-1 rounded-2xl border border-[var(--line-strong)]">
              <Link
                href={`/${locale}/workshops/${workshopId}?tab=programme`}
                className={mobileItemClass(!isJardin && !isProfil && activeTab === 'programme')}
              >
                <Route size={22} strokeWidth={1.75} />
                {t('tabParcours')}
              </Link>
              {canManage && (
                <Link href={`/${locale}/workshops/${workshopId}?tab=examen`} className={mobileItemClass(activeTab === 'examen')}>
                  <FileText size={22} strokeWidth={1.75} />
                  {t('tabExamens')}
                </Link>
              )}
              <div aria-disabled="true" className={mobileItemClass(false)} style={{ pointerEvents: 'none' }}>
                <BookOpen size={22} strokeWidth={1.75} />
                {t('tabCours')}
              </div>
            </div>
          )}
          <Link href={`/${locale}/profile`} className={mobileItemClass(isProfil)}>
            <User size={22} strokeWidth={1.75} />
            {t('tabProfil')}
          </Link>
        </nav>
      )}
      {!isExercise && (
      <header
        className="hidden items-center gap-6 px-6 md:flex"
        style={{ height: 60, borderBottom: '1px solid var(--line)', background: 'var(--surface-raised)' }}
      >
      <div className="flex min-w-0 flex-1 items-center gap-6">
        <Link href={`/${locale}/dashboard`} className="flex shrink-0 items-center gap-2">
          <Sprout size={20} strokeWidth={1.75} className="text-[var(--green)]" />
          <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 19, color: 'var(--ink)' }}>Culture</span>
        </Link>
        {workshopId && workshop && (
          <div className="relative flex min-w-0 items-center gap-2 text-[13px] text-[var(--ink-muted)]">
            <span className="truncate font-semibold text-[var(--ink)]">{workshop.name}</span>
            <button
              type="button"
              title={t('changeWorkshop')}
              onClick={() => setSwitcherOpen((v) => !v)}
              className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-page)] text-[var(--ink-muted)] outline-none focus-visible:shadow-[var(--shadow-focus)]"
            >
              <ChevronDown size={12} strokeWidth={2} />
            </button>
            <WorkshopSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} currentWorkshopId={workshopId} />
          </div>
        )}
      </div>

      <nav className="flex flex-none items-center justify-center gap-1.5">
        <Link href={`/${locale}/garden`} className={tabClass(isJardin)}>
          {t('tabJardin')}
        </Link>
        {workshopId && (
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--line-strong)] px-1.5 py-[5px]">
            <Link
              href={`/${locale}/workshops/${workshopId}?tab=programme`}
              className={tabClass(!isJardin && !isProfil && activeTab === 'programme')}
            >
              {t('tabParcours')}
            </Link>
            {/* `canManage` vient d'un appel client (`getWorkshop`) : tant qu'il
                n'a pas répondu, on réserve la largeur de l'onglet au lieu de le
                faire surgir après coup en décalant tout le groupe (T50). Le
                libellé est rendu invisible plutôt que remplacé par un gabarit,
                pour que la largeur réservée soit exactement la bonne. */}
            {workshop === null ? (
              <span aria-hidden className={`${tabClass(false)} invisible`}>{t('tabExamens')}</span>
            ) : canManage ? (
              <Link href={`/${locale}/workshops/${workshopId}?tab=examen`} className={tabClass(activeTab === 'examen')}>
                {t('tabExamens')}
              </Link>
            ) : null}
            <span
              aria-disabled="true"
              title={t('tabCours')}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink-faint)]"
              style={{ pointerEvents: 'none' }}
            >
              {t('tabCours')}
              <Badge tone="version">V2</Badge>
            </span>
          </div>
        )}
        <Link href={`/${locale}/profile`} className={tabClass(isProfil)}>
          {t('tabProfil')}
        </Link>
      </nav>

      <div className="flex flex-1 items-center justify-end gap-3">
        {workshopId && workshop && (
          <WorkshopActionsMenu workshopId={workshopId} workshopName={workshop.name} role={workshop.role} />
        )}

        <NotificationBell />
        <DropletCounter count={PLACEHOLDER_DROPLETS} />

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-full outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
            <div className="size-[30px] overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              {avatarConfig && <AvatarComposer config={avatarConfig} size={30} frame="head" />}
            </div>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] py-2 shadow-[var(--shadow-lg)]">
                <div className="px-4 py-1.5 text-sm font-medium text-[var(--ink)]">
                  {user?.firstName ?? user?.emailAddresses[0]?.emailAddress.split('@')[0]}
                </div>
                <Link
                  href={`/${locale}/profile`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--ink-body)] hover:bg-[var(--surface-sunken)]"
                >
                  <UserCircle size={16} strokeWidth={1.75} />
                  {t('profile')}
                </Link>
                <Link
                  href={`/${locale}/pricing`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--gold-600)] hover:bg-[var(--surface-sunken)]"
                >
                  <Crown size={16} strokeWidth={1.75} />
                  {t('goPremium')}
                </Link>
                <Link
                  href={otherLocalePath}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--ink-body)] hover:bg-[var(--surface-sunken)]"
                >
                  {t('switchTo', { locale: otherLocale.toUpperCase() })}
                </Link>
                <div className="my-1 border-t border-[var(--line)]" />
                <SignOutButton redirectUrl={`/${locale}`}>
                  <button
                    onClick={markIntentionalSignOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--ink-body)] hover:bg-[var(--danger-tint)] hover:text-[var(--danger-strong)]"
                  >
                    <LogOut size={16} strokeWidth={1.75} />
                    {t('signOut')}
                  </button>
                </SignOutButton>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
    )}
    </>
  );
}
