'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import { Sprout, Route, FileText, BookOpen, User } from 'lucide-react';
import { setUserLocale } from '@/app/actions/profile';
import { getWorkshop, getLastVisitedWorkshop } from '@/app/actions/workshops';
import { clearLastWorkshop, saveLastWorkshop, type CachedWorkshop } from '@/lib/lastWorkshopCache';
import WarmLink from '@/components/WarmLink';
import { emojiFor } from '@/lib/workshopCover';
import { onWorkshopDetails } from '@/lib/workshopDetailsEvent';
import AppSidebar from './AppSidebar';

// Navigation de l'espace connecté, montée par le layout sur toutes ses pages
// sauf l'exercice (plein écran) : le menu latéral sur ordinateur (AppSidebar),
// la barre du bas sur téléphone. Les deux partagent ici le contexte d'atelier.

type WorkshopInfo = { name: string; role: 'owner' | 'manager' | 'member'; emoji: string | null };

type Props = {
  userId: string;
  /** Dernier atelier visité, lu du cookie par le layout — voir lastWorkshopCache. */
  initialWorkshop: CachedWorkshop | null;
  /** Menu latéral épinglé, lu du cookie par le layout — voir navPinned. */
  initialPinned: boolean;
};

export default function AppNav({ userId, initialWorkshop, initialPinned }: Props) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const [workshop, setWorkshop] = useState<WorkshopInfo | null>(null);
  const [lastWorkshop, setLastWorkshop] = useState<CachedWorkshop | null>(initialWorkshop);

  // Synchronise la langue préférée du compte (publicMetadata.locale) avec la
  // locale de l'URL — capture le choix initial ET chaque changement de langue,
  // pour tout utilisateur connecté (cette navigation est montée sur toutes les
  // pages connectées). Source de vérité pour la langue des emails
  // transactionnels. Le ref évite de ré-écrire tant que le token Clerk n'a pas
  // rafraîchi `publicMetadata` (la condition resterait vraie sur un churn de
  // `user`).
  const syncedLocaleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (user.publicMetadata?.locale === locale) return;
    if (syncedLocaleRef.current === locale) return;
    syncedLocaleRef.current = locale;
    void setUserLocale(locale as 'fr' | 'en');
  }, [user, locale]);

  const workshopMatch = pathname.match(/^\/[a-z]{2}\/workshops\/([^/]+)/);
  const urlWorkshopId = workshopMatch && workshopMatch[1] !== 'new' ? workshopMatch[1] : null;

  const activeTab = searchParams.get('tab') ?? 'programme';
  const isJardin = pathname.includes('/garden');
  const isProfil = pathname.includes('/profile');

  // Nom + rôle de l'atelier courant. Appel client à la server action existante
  // (pas de nouvelle route) : coût d'une requête en plus par navigation
  // d'atelier, accepté pour ce socle de navigation.
  useEffect(() => {
    if (!urlWorkshopId) {
      setWorkshop(null);
      return;
    }
    let cancelled = false;
    getWorkshop(urlWorkshopId).then((w) => {
      if (cancelled) return;
      const info = w ? { name: w.name, role: w.currentUserRole, emoji: w.emoji } : null;
      setWorkshop(info);
      // On mémorise au passage le contexte pour le profil : y arriver depuis une
      // page d'atelier n'a alors plus rien à attendre du serveur.
      if (info) {
        setLastWorkshop({ id: urlWorkshopId, ...info });
        saveLastWorkshop(userId, { id: urlWorkshopId, ...info });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [urlWorkshopId, userId]);

  // Renommage ou nouvel emoji depuis les paramètres : la page l'annonce, le
  // menu suit tout de suite (sans quoi il gardait l'ancien nom jusqu'au
  // changement d'atelier), et le souvenir aussi.
  useEffect(
    () =>
      onWorkshopDetails(({ id, name, emoji }) => {
        setWorkshop((w) => (w && id === urlWorkshopId ? { ...w, name, emoji } : w));
        setLastWorkshop((w) => {
          if (!w || w.id !== id) return w;
          const next = { ...w, name, emoji };
          saveLastWorkshop(userId, next);
          return next;
        });
      }),
    [urlWorkshopId, userId],
  );

  // Jardin, profil et tableau de bord n'appartiennent à aucun atelier, mais la
  // navigation doit être IDENTIQUE partout : on y rétablit le contexte avec le
  // dernier atelier visité, au lieu d'un menu amputé.
  //
  // ⚠️ `lastWorkshop` est un SOUVENIR, pas l'état de la page courante : on ne le
  // vide jamais en changeant de page. Le vider faisait disparaître le groupe
  // d'atelier le temps de l'aller-retour serveur, puis réapparaître — le
  // clignotement constaté en changeant de page.
  //
  // Le souvenir arrive déjà rempli du cookie (`initialWorkshop`, dès le HTML) :
  // cet appel ne sert qu'à le rafraîchir en arrière-plan, si le nom ou le rôle a
  // changé, ou si le cookie n'existait pas encore. Une réponse `null` fait
  // autorité — plus aucun atelier accessible, on efface le souvenir.
  useEffect(() => {
    if (urlWorkshopId) return;
    let cancelled = false;
    getLastVisitedWorkshop().then((w) => {
      if (cancelled) return;
      setLastWorkshop(w);
      if (w) saveLastWorkshop(userId, w);
      else clearLastWorkshop();
    });
    return () => {
      cancelled = true;
    };
  }, [urlWorkshopId, userId]);

  // Contexte d'atelier : celui de l'URL sur une page d'atelier, le dernier
  // visité partout ailleurs. Le seul cas sans contexte est un compte qui n'a
  // encore aucun atelier.
  //
  // Sur une page d'atelier, `workshop` repart de `null` à chaque changement
  // d'`urlWorkshopId` : on retombe entre-temps sur le souvenir quand c'est le
  // même atelier, sinon le nom dans le sélecteur et l'entrée « examens » (qui
  // dépend du rôle) disparaîtraient le temps de l'aller-retour serveur.
  const workshopId = urlWorkshopId ?? lastWorkshop?.id ?? null;
  const activeWorkshop = urlWorkshopId
    ? (workshop ?? (lastWorkshop?.id === urlWorkshopId ? lastWorkshop : null))
    : lastWorkshop;
  const canManage = activeWorkshop?.role === 'owner' || activeWorkshop?.role === 'manager';

  // Un onglet d'atelier n'est actif que sur une page d'atelier : ailleurs (jardin,
  // profil, tableau de bord) le groupe est un raccourci, aucun de ses onglets ne
  // décrit la page courante. Les pages paramètres ne sont pas des onglets.
  const onWorkshopPage = !!urlWorkshopId && !pathname.includes('/settings');

  // Bouton Premium : seulement quand l'abonnement gratuit est AVÉRÉ — tant que
  // le compte n'est pas chargé, rien (ne pas le montrer un instant à un abonné).
  const tier = user?.publicMetadata?.tier;
  const showPremium = !!user && tier !== 'premium' && tier !== 'premium_plus';

  if (pathname.includes('/exercise/')) return null;

  const mobileItemClass = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-[3px] py-1.5 text-[10.5px] leading-none font-semibold outline-none ${
      active ? 'text-[var(--green)]' : 'text-[var(--ink-muted)]'
    }`;

  return (
    <>
      <AppSidebar
        workshopId={workshopId}
        workshopName={activeWorkshop?.name ?? null}
        workshopEmoji={workshopId && activeWorkshop ? emojiFor(workshopId, activeWorkshop.emoji) : null}
        canManage={canManage}
        isMember={activeWorkshop?.role === 'member'}
        pathname={pathname}
        searchParams={searchParams}
        initialPinned={initialPinned}
        accountPinned={!user ? undefined : typeof user.publicMetadata?.navPinned === 'boolean' ? user.publicMetadata.navPinned : null}
        showPremium={showPremium}
      />
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 border-t border-[var(--line)] bg-[var(--surface-raised)] px-3 pt-2 pb-3.5 md:hidden">
        <WarmLink href={`/${locale}/garden`} className={mobileItemClass(isJardin)}>
          <Sprout size={22} strokeWidth={1.75} />
          {t('tabJardin')}
        </WarmLink>
        {workshopId && (
          <div className="flex flex-[3] items-stretch gap-1 rounded-2xl border border-[var(--line-strong)]">
            <WarmLink
              href={`/${locale}/workshops/${workshopId}?tab=programme`}
              className={mobileItemClass(onWorkshopPage && activeTab === 'programme')}
            >
              <Route size={22} strokeWidth={1.75} />
              {t('tabParcours')}
            </WarmLink>
            {canManage && (
              <WarmLink
                href={`/${locale}/workshops/${workshopId}?tab=examen`}
                className={mobileItemClass(onWorkshopPage && activeTab === 'examen')}
              >
                <FileText size={22} strokeWidth={1.75} />
                {t('tabExamens')}
              </WarmLink>
            )}
            <div aria-disabled="true" className={mobileItemClass(false)} style={{ pointerEvents: 'none' }}>
              <BookOpen size={22} strokeWidth={1.75} />
              {t('tabCours')}
            </div>
          </div>
        )}
        <WarmLink href={`/${locale}/profile`} className={mobileItemClass(isProfil)}>
          <User size={22} strokeWidth={1.75} />
          {t('tabProfil')}
        </WarmLink>
      </nav>
    </>
  );
}
