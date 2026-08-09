'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import { Sprout, ChevronDown, Route, FileText, BookOpen, User } from 'lucide-react';
import { setUserLocale } from '@/app/actions/profile';
import { getWorkshop, getLastVisitedWorkshop } from '@/app/actions/workshops';
import { clearLastWorkshop, saveLastWorkshop, type CachedWorkshop } from '@/lib/lastWorkshopCache';
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

type Props = {
  userId: string;
  /** Dernier atelier visité, lu du cookie par le layout — voir lastWorkshopCache. */
  initialWorkshop: CachedWorkshop | null;
};

export default function DashboardHeader({ userId, initialWorkshop }: Props) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [workshop, setWorkshop] = useState<WorkshopHeaderInfo | null>(null);
  const [lastWorkshop, setLastWorkshop] = useState<CachedWorkshop | null>(initialWorkshop);

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
  const urlWorkshopId = workshopMatch && workshopMatch[1] !== 'new' ? workshopMatch[1] : null;

  const activeTab = searchParams.get('tab') ?? 'programme';
  const isJardin = pathname.includes('/garden');
  const isProfil = pathname.includes('/profile');

  // Nom + rôle de l'atelier courant, pour la barre du haut. Appel client à la
  // server action existante (pas de nouvelle route) : coût d'une requête en plus
  // par navigation d'atelier, accepté pour ce socle de navigation (T12).
  useEffect(() => {
    if (!urlWorkshopId) {
      setWorkshop(null);
      return;
    }
    let cancelled = false;
    getWorkshop(urlWorkshopId).then((w) => {
      if (cancelled) return;
      const info = w ? { name: w.name, role: w.currentUserRole } : null;
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

  // Jardin, profil et tableau de bord n'appartiennent à aucun atelier, mais la
  // barre doit être IDENTIQUE partout où elle est affichée : on y rétablit le
  // contexte avec le dernier atelier visité, au lieu d'une barre amputée.
  //
  // ⚠️ `lastWorkshop` est un SOUVENIR, pas l'état de la page courante : on ne le
  // vide jamais en changeant de page. Le vider faisait disparaître le groupe
  // d'onglets le temps de l'aller-retour serveur, puis réapparaître — le
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

  // Contexte d'atelier de la barre : celui de l'URL sur une page d'atelier, le
  // dernier visité partout ailleurs. Aucune page où la barre est affichée n'en
  // est privée — le seul cas sans contexte est un compte qui n'a encore aucun
  // atelier.
  //
  // Sur une page d'atelier, `workshop` repart de `null` à chaque changement
  // d'`urlWorkshopId` : on retombe entre-temps sur le souvenir quand c'est le
  // même atelier, sinon le nom dans le sélecteur et l'onglet « examens » (qui
  // dépend du rôle) disparaîtraient le temps de l'aller-retour serveur.
  const workshopId = urlWorkshopId ?? lastWorkshop?.id ?? null;
  const activeWorkshop = urlWorkshopId
    ? (workshop ?? (lastWorkshop?.id === urlWorkshopId ? lastWorkshop : null))
    : lastWorkshop;
  const canManage = activeWorkshop?.role === 'owner' || activeWorkshop?.role === 'manager';

  // Un onglet d'atelier n'est actif que sur une page d'atelier : ailleurs (jardin,
  // profil, tableau de bord) le groupe est un raccourci, aucun de ses onglets ne
  // décrit la page courante. Sans ce garde-fou, `activeTab` valant « programme »
  // par défaut, « parcours » s'allumerait sur le tableau de bord.
  // Les pages paramètres (et autres sous-pages) d'un atelier ne sont pas des
  // onglets : « parcours »/« examens » n'y sont pas actifs, l'engrenage l'est.
  const onWorkshopPage = !!urlWorkshopId && !pathname.includes('/settings');

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
                className={mobileItemClass(onWorkshopPage && activeTab === 'programme')}
              >
                <Route size={22} strokeWidth={1.75} />
                {t('tabParcours')}
              </Link>
              {canManage && (
                <Link
                  href={`/${locale}/workshops/${workshopId}?tab=examen`}
                  className={mobileItemClass(onWorkshopPage && activeTab === 'examen')}
                >
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
      {/* `sticky` plutôt que `fixed` : la barre reste dans le flux, donc aucune
          page n'a besoin d'une compensation de hauteur. Les rares blocs collants
          des pages (barre latérale des paramètres, colonne de création) ont leur
          `top` décalé de 60 px en conséquence. */}
      {!isExercise && (
      <header
        className="sticky top-0 z-50 hidden items-center gap-6 px-6 md:flex"
        style={{ height: 60, borderBottom: '1px solid var(--line)', background: 'var(--surface-raised)' }}
      >
      <div className="flex min-w-0 flex-1 items-center gap-6">
        <Link href={`/${locale}/dashboard`} className="flex shrink-0 items-center gap-2">
          <Sprout size={20} strokeWidth={1.75} className="text-[var(--green)]" />
          <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 19, color: 'var(--ink)' }}>Culture</span>
        </Link>
        {workshopId && activeWorkshop && (
          <div className="relative flex min-w-0 items-center gap-2 text-[13px] text-[var(--ink-muted)]">
            <span className="truncate font-semibold text-[var(--ink)]">{activeWorkshop.name}</span>
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
              className={tabClass(onWorkshopPage && activeTab === 'programme')}
            >
              {t('tabParcours')}
            </Link>
            {/* `canManage` vient d'un appel client (`getWorkshop`) : tant qu'il
                n'a pas répondu, on réserve la largeur de l'onglet au lieu de le
                faire surgir après coup en décalant tout le groupe (T50). Le
                libellé est rendu invisible plutôt que remplacé par un gabarit,
                pour que la largeur réservée soit exactement la bonne. */}
            {activeWorkshop === null ? (
              <span aria-hidden className={`${tabClass(false)} invisible`}>{t('tabExamens')}</span>
            ) : canManage ? (
              <Link
                href={`/${locale}/workshops/${workshopId}?tab=examen`}
                className={tabClass(onWorkshopPage && activeTab === 'examen')}
              >
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
        {workshopId && activeWorkshop && (
          <WorkshopActionsMenu workshopId={workshopId} />
        )}

        {/* Pas de vignette d'avatar ici : le seul accès au profil est l'onglet
            « profil » au centre. Tout ce que portait son menu déroulant (profil,
            passage Premium, langue, déconnexion) existe déjà sur la page profil,
            rien n'a été perdu en le retirant. */}
        <NotificationBell />
        <DropletCounter count={PLACEHOLDER_DROPLETS} />
      </div>
    </header>
    )}
    </>
  );
}
