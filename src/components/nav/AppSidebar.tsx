'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookOpen,
  ChartColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  Info,
  LayoutGrid,
  Leaf,
  List,
  Route,
  SlidersHorizontal,
  Sprout,
  Star,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import WarmLink from '@/components/WarmLink';
import { saveNavPinned } from '@/lib/navPinned';
import { setNavPinned } from '@/app/actions/profile';
import { pinnedNavNeedsRoom } from './contentFit';
import { NAV_SECTIONS, settingsSectionUrl, type NavSection } from '@/app/[locale]/workshops/[id]/settings/sections';
import { NAV_W_CLOSED, NAV_W_OPEN } from './navWidths';
import WorkshopDrawer from './WorkshopDrawer';
import { useFold, type FoldPhase } from './useFold';

// ─── Menu latéral (ordinateur) ───────────────────────────────────────────────
//
// Maquette « latérale gauche », sélecteur d'atelier en « sous-menu »
// (docs/design, App Culture). Replié, il ne montre que les icônes ; il s'ouvre
// au survol PAR-DESSUS la page (ombre portée), ou en permanence une fois
// épinglé. Épinglé, il ne pousse la page que s'il en couvrirait du contenu
// (contentFit) : une page centrée garde sa largeur. Ouvrir le tiroir « changer d'atelier »
// le garde ouvert le temps du choix.
//
// Les sous-menus (« parcours » → liste des questions, « paramètres » → ses
// sections) n'existent que sur leur page : ils se déplient en y arrivant et se
// replient en la quittant (useFold).

const EASE = 'cubic-bezier(0.22,1,0.36,1)';

const SECTION_ICONS: Record<NavSection, LucideIcon> = {
  general: Info,
  members: Users,
  files: Folder,
  notions: LayoutGrid,
};

type Props = {
  workshopId: string | null;
  workshopName: string | null;
  /** Emoji de l'atelier courant — null tant qu'on ne le connaît pas. */
  workshopEmoji: string | null;
  canManage: boolean;
  isMember: boolean;
  pathname: string;
  searchParams: { get(name: string): string | null };
  initialPinned: boolean;
  /** Préférence du compte : undefined tant que le compte n'est pas chargé,
   *  null s'il n'en a encore aucune. */
  accountPinned: boolean | null | undefined;
  /** Abonnement gratuit avéré — le bouton Premium ne s'affiche qu'alors. */
  showPremium: boolean;
};

/** Lien du menu qui reste sur place quand seule la requête change.
 *
 *  Une vue qui vit dans l'URL de la page courante (section des paramètres,
 *  liste des questions) s'ouvre par l'API d'historique — la page la lit via
 *  `useSearchParams`, sans aller-retour serveur ni rechargement de ses
 *  sections. Toute autre destination est une navigation ordinaire. */
function shallowIfSamePage(e: MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const target = new URL(href, window.location.href);
  if (target.pathname !== window.location.pathname) return;
  e.preventDefault();
  if (target.search !== window.location.search) window.history.pushState(null, '', target);
}

export default function AppSidebar({ workshopId, workshopName, workshopEmoji, canManage, isMember, pathname, searchParams, initialPinned, accountPinned, showPremium }: Props) {
  const t = useTranslations('nav');
  const ts = useTranslations('settings');
  const locale = useLocale();

  const [pinned, setPinned] = useState(initialPinned);
  // Le cookie (`initialPinned`) n'est que la copie locale de la préférence du
  // compte : elle fait foi dès qu'elle arrive, une seule fois par chargement
  // (après, c'est le geste de l'utilisateur qui l'écrit). Un compte qui n'en
  // a pas encore reçoit celle du poste.
  const [accountSynced, setAccountSynced] = useState(false);
  if (!accountSynced && accountPinned !== undefined) {
    setAccountSynced(true);
    if (accountPinned !== null && accountPinned !== pinned) setPinned(accountPinned);
  }
  useEffect(() => {
    if (accountSynced && accountPinned === null) void setNavPinned(pinned);
    // Une seule fois, à l'arrivée du compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountSynced]);
  useEffect(() => saveNavPinned(pinned), [pinned]);
  const [hover, setHover] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [titleHover, setTitleHover] = useState(false);
  const open = pinned || hover || drawerOpen;
  const panelW = open ? NAV_W_OPEN : NAV_W_CLOSED;

  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);
    void setNavPinned(next);
    // Le prochain épinglage repart de la largeur repliée : la mesure s'y fait
    // directement, et l'ouverture s'anime si la page doit se resserrer.
    setPushes(false);
    // Replier depuis le menu ouvert au survol : sans ça, il resterait ouvert
    // sous la souris et le clic paraîtrait sans effet.
    setHover(false);
  };
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // ─── Où sommes-nous ──────────────────────────────────────────────────────
  const workshopMatch = pathname.match(/^\/[a-z]{2}\/workshops\/([^/]+)(\/[^/]+)?/);
  const urlWorkshopId = workshopMatch && workshopMatch[1] !== 'new' ? workshopMatch[1] : null;
  const onSettings = !!urlWorkshopId && workshopMatch?.[2] === '/settings';
  // Les pages paramètres ne sont pas des onglets : « parcours »/« examens » n'y
  // sont pas actifs. La session d'arrosage, si — elle prolonge le parcours.
  const onWorkshopTabs = !!urlWorkshopId && !onSettings;
  const tab = searchParams.get('tab') ?? 'programme';
  const parcoursActive = onWorkshopTabs && tab === 'programme';
  const questionsActive = parcoursActive && canManage && searchParams.get('view') === 'questions';
  const examActive = onWorkshopTabs && tab === 'examen';
  const wantedSection = searchParams.get('section');
  const activeSection: NavSection =
    !isMember && (NAV_SECTIONS as readonly string[]).includes(wantedSection ?? '') ? (wantedSection as NavSection) : 'general';
  const jardinActive = pathname.includes('/garden');
  const profilActive = pathname.includes('/profile');

  const parcoursFold = useFold(parcoursActive && canManage);
  const settingsFold = useFold(onSettings);

  // ─── Pousser la page, ou se poser par-dessus ─────────────────────────────
  const slotRef = useRef<HTMLDivElement>(null);
  const [pushes, setPushes] = useState(false);
  const evaluateFit = useCallback(() => {
    const slot = slotRef.current;
    const main = document.querySelector<HTMLElement>('[data-app-main]');
    if (!slot || !main || slot.offsetParent === null) return;
    setPushes(pinnedNavNeedsRoom(slot, main));
  }, []);
  const routeKey = pathname + '?' + (searchParams.get('tab') ?? '') + (searchParams.get('section') ?? '') + (searchParams.get('view') ?? '');
  // Avant peinture à l'épinglage et à chaque page, puis encore un peu plus
  // tard : une page arrive souvent en plusieurs fois (sections en flux).
  useLayoutEffect(() => {
    if (!pinned) return;
    evaluateFit();
    const ids = [300, 1200].map((ms) => setTimeout(evaluateFit, ms));
    return () => ids.forEach(clearTimeout);
  }, [pinned, routeKey, evaluateFit]);
  // Fenêtre redimensionnée, ou contenu qui change de taille.
  useEffect(() => {
    if (!pinned) return;
    const main = document.querySelector<HTMLElement>('[data-app-main]');
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(evaluateFit);
    };
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    if (main?.firstElementChild) ro.observe(main.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [pinned, routeKey, evaluateFit]);

  const base = `/${locale}/workshops/${workshopId}`;
  const sections = isMember ? (['general'] as const) : NAV_SECTIONS;

  return (
    <div
      ref={slotRef}
      className="sticky top-0 hidden h-screen flex-none md:block"
      style={{ width: pinned && pushes ? NAV_W_OPEN : NAV_W_CLOSED, transition: `width 240ms ${EASE}`, zIndex: 50 }}
    >
      {drawerOpen && <WorkshopDrawer left={NAV_W_OPEN} currentWorkshopId={workshopId} onClose={closeDrawer} />}

      <nav
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="absolute top-0 bottom-0 left-0 z-[55] flex flex-col gap-1 overflow-x-hidden overflow-y-auto border-r border-[var(--line)] bg-[var(--surface-raised)] px-3 py-4 [scrollbar-width:none]"
        style={{
          width: panelW,
          boxShadow: open && !pinned ? 'var(--shadow-lg)' : 'none',
          transition: `width 240ms ${EASE}, box-shadow 240ms`,
        }}
      >
        {/* ── Logo + épingle ── */}
        {/* Hauteur fixe : le nom « Culture » et l'épingle, qui n'existent qu'ouvert,
            ne doivent pas grandir la rangée et pousser tout le menu. */}
        <div className="flex h-11 flex-none items-center justify-between gap-2 px-1 pt-0.5 pb-3">
          <WarmLink href={`/${locale}/dashboard`} aria-label="Culture" className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:shadow-[var(--shadow-focus)]">
            <Sprout size={22} strokeWidth={1.75} className="flex-none text-[var(--green)]" />
            {open && (
              <span className="whitespace-nowrap" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 20, color: 'var(--ink)' }}>
                Culture
              </span>
            )}
          </WarmLink>
          {open && (
            <Tooltip content={pinned ? t('pinClose') : t('pinOpen')}>
              <button
                type="button"
                onClick={togglePinned}
                aria-label={pinned ? t('pinClose') : t('pinOpen')}
                aria-pressed={pinned}
                className="flex size-7 flex-none items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-page)] p-0 text-[var(--ink-muted)] outline-none hover:text-[var(--green-strong)] focus-visible:shadow-[var(--shadow-focus)]"
              >
                <ChevronLeft size={14} strokeWidth={2} style={{ transform: pinned ? 'none' : 'rotate(180deg)', transition: 'transform 200ms' }} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* ── L'atelier : sélecteur + ses pages ── */}
        {workshopId && (
          <div className="flex flex-none flex-col gap-0.5">
            {open ? (
              <button
                type="button"
                onClick={() => setDrawerOpen((v) => !v)}
                onMouseEnter={() => setTitleHover(true)}
                onMouseLeave={() => setTitleHover(false)}
                aria-label={t('changeWorkshop')}
                aria-expanded={drawerOpen}
                className="relative z-[1] flex max-w-full flex-none items-start gap-2.5 rounded-xl border-none bg-transparent px-1 py-1 text-left outline-none hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)]"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span aria-hidden className="flex size-[34px] flex-none items-center justify-center text-[20px] leading-none">
                    {workshopEmoji}
                  </span>
                  <span className="flex h-10 min-w-0 flex-1 items-center">
                    <span
                      className="line-clamp-2 overflow-hidden text-[var(--ink)]"
                      style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600, lineHeight: '20px', textWrap: 'pretty' }}
                    >
                      {workshopName ?? ''}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    className="flex-none text-[var(--ink-muted)]"
                    style={{
                      opacity: titleHover || drawerOpen ? 1 : 0,
                      transform: drawerOpen ? 'rotate(180deg)' : titleHover ? 'translateX(2px)' : 'none',
                      transition: 'opacity 160ms, transform 200ms',
                    }}
                  />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label={t('changeWorkshop')}
                className="flex flex-none flex-col items-start gap-1.5 rounded-xl border-none bg-transparent px-1 py-1 outline-none hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)]"
              >
                <span aria-hidden className="my-[3px] flex size-[34px] flex-none items-center justify-center text-[20px] leading-none">
                  {workshopEmoji}
                </span>
              </button>
            )}

            <div
              className="relative flex flex-none flex-col overflow-hidden"
              style={{
                // Seuls la marge et le trait de GAUCHE changent à l'ouverture :
                // tout écart vertical entre les deux états ferait sauter les
                // entrées de quelques pixels à chaque survol.
                gap: 2,
                margin: open ? '0 0 4px 4px' : '0 0 4px 0',
                padding: open ? '0 0 0 8px' : 0,
                borderLeft: open ? '1px solid var(--line)' : 'none',
                transition: 'margin 200ms var(--ease-out), padding 200ms var(--ease-out)',
              }}
            >
              <NavItem
                href={`${base}?tab=programme`}
                icon={Route}
                label={t('tabParcours')}
                active={parcoursActive}
                open={open}
                // Depuis la liste des questions, revenir au parcours reste sur
                // place ; depuis un autre onglet, c'est une navigation.
                onClick={questionsActive ? (e) => shallowIfSamePage(e, `${base}?tab=programme`) : undefined}
              />
              {parcoursFold.mounted && (
                <SubMenu open={open} phase={parcoursFold.phase}>
                  <SubItem
                    index={0}
                    count={1}
                    phase={parcoursFold.phase}
                    href={`${base}?tab=programme&view=questions`}
                    icon={List}
                    label={t('subQuestions')}
                    active={questionsActive}
                    open={open}
                    onClick={parcoursActive ? (e) => shallowIfSamePage(e, `${base}?tab=programme&view=questions`) : undefined}
                  />
                </SubMenu>
              )}
              {canManage && (
                <NavItem href={`${base}?tab=examen`} icon={FileText} label={t('tabExamens')} active={examActive} open={open} />
              )}
              <SoonItem icon={BookOpen} label={t('tabCours')} soon={t('soon')} open={open} />
              <NavItem href={`${base}/settings`} icon={SlidersHorizontal} label={t('tabParametres')} active={onSettings} open={open} />
              {settingsFold.mounted && (
                <SubMenu open={open} phase={settingsFold.phase}>
                  {sections.map((id, i) => {
                    const href = id === 'general' ? `${base}/settings` : `${base}/settings?section=${id}`;
                    return (
                      <SubItem
                        key={id}
                        index={i}
                        count={sections.length}
                        phase={settingsFold.phase}
                        href={href}
                        icon={SECTION_ICONS[id]}
                        label={ts(`nav.${id}`)}
                        active={onSettings && activeSection === id}
                        open={open}
                        onClick={(e) => {
                          // Déjà sur ces paramètres : la page suit l'URL, on
                          // l'écrit comme elle le fait elle-même.
                          if (!onSettings || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          if (activeSection !== id) window.history.pushState(null, '', settingsSectionUrl(window.location.href, id));
                        }}
                      />
                    );
                  })}
                </SubMenu>
              )}
            </div>
          </div>
        )}

        {/* ── Hors atelier ── */}
        <div className="mx-1.5 mb-[9px]" />
        <SoonItem icon={ChartColumnIncreasing} label={t('tabSuivi')} soon={t('soon')} open={open} />
        <NavItem href={`/${locale}/garden`} icon={Leaf} label={t('tabJardin')} active={jardinActive} open={open} style={{ marginTop: 14 }} />

        <div className="mt-auto flex flex-col gap-1.5 border-t border-[var(--line-soft)] pt-3">
          <NavItem href={`/${locale}/profile`} icon={User} label={t('tabProfil')} active={profilActive} open={open} />
          {showPremium && (
            <WarmLink
              href={`/${locale}/pricing`}
              aria-label={t('goPremium')}
              className="flex h-10 flex-none items-center justify-center gap-2 rounded-xl px-3 text-[13.5px] font-bold text-[var(--ink)] outline-none focus-visible:shadow-[var(--shadow-focus)] [background:color-mix(in_oklab,var(--gold)_12%,var(--surface-raised))] hover:[background:color-mix(in_oklab,var(--gold)_20%,var(--surface-raised))]"
              style={{ border: '1px solid color-mix(in oklab, var(--gold) 45%, transparent)' }}
            >
              <Star size={16} strokeWidth={1.75} className="flex-none text-[var(--gold)]" />
              {open && <span className="whitespace-nowrap">{t('goPremium')} →</span>}
            </WarmLink>
          )}
        </div>
      </nav>
    </div>
  );
}

// ─── Entrées ───────────────────────────────────────────────────────────────

const itemBase =
  // Hauteur fixe : le libellé, qui n'existe qu'ouvert, ne doit pas grandir
  // l'entrée d'un pixel (cumulé sur tout le menu, il se voyait).
  'flex h-10 flex-none items-center justify-start gap-3 rounded-xl px-3 text-sm leading-5 outline-none focus-visible:shadow-[var(--shadow-focus)]';

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  open,
  onClick,
  style,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  open: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  style?: CSSProperties;
}) {
  return (
    <WarmLink
      href={href}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`${itemBase} hover:bg-[var(--surface-sunken)] ${active ? 'font-bold text-[var(--green-strong)]' : 'font-semibold text-[var(--ink-muted)]'}`}
      style={style}
    >
      <Icon size={19} strokeWidth={1.75} className="flex-none" />
      {open && <span className="whitespace-nowrap">{label}</span>}
    </WarmLink>
  );
}

/** Page qui n'existe pas encore : grisée, inerte, « bientôt ». */
function SoonItem({ icon: Icon, label, soon, open }: { icon: LucideIcon; label: string; soon: string; open: boolean }) {
  return (
    <div aria-disabled="true" aria-label={`${label} — ${soon}`} className={`${itemBase} cursor-default font-semibold text-[var(--ink-faint)]`}>
      <Icon size={19} strokeWidth={1.75} className="flex-none" />
      {open && (
        <>
          <span className="flex-1 text-left whitespace-nowrap">{label}</span>
          <Badge tone="version">{soon}</Badge>
        </>
      )}
    </div>
  );
}

function SubMenu({ open, phase, children }: { open: boolean; phase: FoldPhase; children: ReactNode }) {
  const animation =
    phase === 'opening'
      ? `nav-unfold 280ms ${EASE} both`
      : phase === 'closing'
        ? 'nav-fold 240ms cubic-bezier(0.4,0,0.2,1) both'
        : 'none';
  return (
    <div
      data-nav-anim
      className="flex flex-none flex-col gap-0.5 overflow-hidden"
      style={{
        margin: open ? '2px 0 4px 12px' : '2px 0 4px 0',
        paddingLeft: open ? 12 : 0,
        borderLeft: open ? '1px solid var(--line)' : 'none',
        animation,
      }}
    >
      {children}
    </div>
  );
}

function SubItem({
  index,
  count,
  phase,
  href,
  icon: Icon,
  label,
  active,
  open,
  onClick,
}: {
  index: number;
  count: number;
  phase: FoldPhase;
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  open: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  // Entrées en décalé : vers le bas en arrivant, vers le haut en repartant.
  const animation =
    phase === 'opening'
      ? `nav-item-in 240ms ${EASE} ${60 + index * 35}ms both`
      : phase === 'closing'
        ? `nav-item-out 160ms cubic-bezier(0.4,0,0.2,1) ${(count - 1 - index) * 20}ms both`
        : 'none';
  return (
    <WarmLink
      href={href}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-nav-anim
      className={`box-border flex h-[31px] items-center gap-[9px] overflow-hidden rounded-[10px] text-left text-[13px] whitespace-nowrap outline-none hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)] ${active ? 'font-bold text-[var(--green-strong)]' : 'font-semibold text-[var(--ink-muted)]'}`}
      style={{ padding: open ? '0 10px' : '0 0 0 14.5px', animation }}
    >
      <Icon size={15} strokeWidth={1.75} className="flex-none" />
      {open && <span className="truncate">{label}</span>}
    </WarmLink>
  );
}
