'use client';

// Page profil, alignée sur la maquette du 06/08/2026 : bannière rayée (avatar
// centré, nom + tag, bouton « éditer » vers le composeur), rangée de 4
// statistiques, encart d'upsell, bloc « suivi » (page d'analyse dédiée au
// profil, T39 — indépendante de tout atelier) et liste de paramètres.
//
// ⚠️ Deux zones sont volontairement NON fonctionnelles, comme le compteur de
// gouttes et la cloche du header : la rangée de statistiques (aucune série
// d'arrosage, aucun XP, aucun temps passé ni succès n'existe côté serveur —
// tout est V2, voir docs/product-spec.md) et la ligne « notifications ».

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { BarChart3, Check, ChevronRight, Clock, Droplet, LogOut, Sprout, Star, Trophy, Zap } from 'lucide-react';
import { palette, withAlpha, shadow } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import LinkButton from '@/components/LinkButton';
import AvatarComposer from '@/components/avatar/AvatarComposer';
import { AvatarConfig, loadAvatarConfig } from '@/components/avatar/avatarConfig';
import { markIntentionalSignOut } from '@/lib/signOutIntent';
import type { SubscriptionTier } from '@/lib/subscription';

type Props = {
  locale: string;
  uniqueId: string;
  firstName: string;
  lastName: string;
  tier: SubscriptionTier;
};

// Valeurs de la maquette, figées : aucune de ces 4 statistiques n'a de source
// côté serveur. Même principe que PLACEHOLDER_DROPLETS dans DashboardHeader —
// à brancher sur la vraie donnée le jour où la gamification existe (V2).
const PLACEHOLDER_STATS = {
  streak: '12',
  xp: '8 420',
  hours: '47 h',
  achievements: '23',
  notions: '156',
};

function planKey(tier: SubscriptionTier): 'free' | 'premium' | 'premiumPlus' {
  return tier === 'premium_plus' ? 'premiumPlus' : tier;
}

export default function ProfileClient({ locale, uniqueId, firstName, lastName, tier }: Props) {
  const t = useTranslations('profile');
  const router = useRouter();
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || t('defaultNameFull');
  const { user } = useUser();
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Avatar synchronisé au compte (publicMetadata.avatarParts), repli localStorage.
  useEffect(() => {
    const fromAccount = user?.publicMetadata?.avatarParts as AvatarConfig | undefined;
    setAvatarConfig(fromAccount ?? loadAvatarConfig());
  }, [user]);

  // Changer de langue = naviguer vers la même page dans l'autre locale. La
  // préférence est ensuite persistée sur le compte par DashboardHeader, qui
  // synchronise publicMetadata.locale sur la locale de l'URL (source de vérité
  // pour la langue des emails). `/profile` n'a pas de chemin localisé
  // (src/i18n/routing.ts) : le préfixe suffit.
  function chooseLocale(next: 'fr' | 'en') {
    setLangOpen(false);
    if (next !== locale) router.push(`/${next}/profile`);
  }

  // Carrousel de statistiques : glisser-déposer à la souris, pour retrouver au
  // clavier-souris le geste qu'on a naturellement au doigt sur téléphone.
  // `scrollLeft` est écrit directement sur le nœud (pas d'état React) : un rendu
  // par pixel parcouru rendrait le glissement saccadé. Seul le curseur
  // grab/grabbing passe par un état, changé deux fois par geste.
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null);

  function handleStripPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Le tactile défile déjà nativement, avec inertie : le capturer ici le
    // remplacerait par une simulation moins fluide.
    if (e.pointerType !== 'mouse') return;
    const el = stripRef.current;
    if (!el) return;
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function handleStripPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = stripRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;
    el.scrollLeft = drag.startScroll - (e.clientX - drag.startX);
  }

  function handleStripPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = stripRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;
    if (el.hasPointerCapture(drag.pointerId)) el.releasePointerCapture(drag.pointerId);
    dragRef.current = null;
    setDragging(false);
  }

  const cardStyle: React.CSSProperties = {
    background: palette.surfaceRaised,
    border: `1px solid ${palette.line}`,
    borderRadius: 16,
    boxShadow: shadow.sm,
  };

  const settingsRowStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 18px',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    color: palette.ink,
    textAlign: 'left',
    textDecoration: 'none',
    background: 'transparent',
    border: 'none',
  };

  const statTiles = [
    { icon: Droplet, value: PLACEHOLDER_STATS.streak, label: t('stats.streak') },
    { icon: Zap, value: PLACEHOLDER_STATS.xp, label: t('stats.xp') },
    { icon: Clock, value: PLACEHOLDER_STATS.hours, label: t('stats.time') },
    { icon: Trophy, value: PLACEHOLDER_STATS.achievements, label: t('stats.achievements') },
    { icon: Sprout, value: PLACEHOLDER_STATS.notions, label: t('stats.notions') },
  ];

  return (
    // `page-no-scrollbar` : la page défile toujours (elle dépasse d'environ
    // 180px sur un écran courant), mais sans barre visible à droite — décision
    // du 18/08/2026. Voir `globals.css`.
    <div className="page-no-scrollbar" style={{ background: palette.cream, minHeight: 'calc(100vh - 60px)', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Bannière — rayures diagonales, avatar centré sans contour, nom en haut
            à gauche avec le tag juste en dessous. « éditer » ouvre le composeur
            d'avatar : c'est le seul accès, la ligne « modifier l'avatar » a été
            retirée des paramètres. */}
        <div
          style={{
            position: 'relative',
            height: 176,
            borderRadius: 16,
            border: `1px solid ${palette.line}`,
            overflow: 'hidden',
            background: `repeating-linear-gradient(135deg, ${palette.greenTint} 0 14px, ${withAlpha(palette.greenSoft, 0.16)} 14px 28px)`,
          }}
        >
          <div style={{ position: 'absolute', top: 14, right: 14 }}>
            <LinkButton href={`/${locale}/profile/avatar`} variant="ghost" size="sm">
              {t('edit')}
            </LinkButton>
          </div>

          {/* Avatar calé sur le BAS de la bannière (`bottom: 0`, pas de marge) :
              le buste doit affleurer le bord, pas flotter au milieu. Sa coiffure
              monte à hauteur du nom, en haut à gauche — d'où le z-index sur le
              bloc nom + tag, qui passe devant.
              `overflow: visible` lève le rognage carré du composeur, dont le
              cadre `bust` (FRAMES, y=70) coupe le haut des coiffures les plus
              hautes (chignons). C'est la bannière, elle, qui rogne — ce qui
              donne exactement l'effet voulu en bas. */}
          <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', lineHeight: 0 }}>
            {avatarConfig && (
              <AvatarComposer config={avatarConfig} size={148} frame="bust" style={{ overflow: 'visible' }} />
            )}
          </div>

          {/* `pointerEvents: 'none'` — ce bloc s'étend sur toute la largeur de la
              bannière (il faut cette largeur pour que les noms longs se tronquent
              proprement) et passe donc PAR-DESSUS le bouton « éditer », dont il
              avalerait les clics. Rien n'y est cliquable, on laisse traverser. */}
          <div
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              top: 16,
              zIndex: 1,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 5,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 25,
                fontWeight: 700,
                color: palette.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {fullName}
            </span>
            {/* Pastille translucide : l'avatar est assez grand pour passer
                derrière le tag, qui deviendrait illisible posé à même le buste. */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: palette.inkSoft,
                background: withAlpha(palette.surfaceRaised, 0.75),
                padding: '2px 7px',
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              #{uniqueId}
            </span>
          </div>
        </div>

        {/* Statistiques — valeurs figées, voir PLACEHOLDER_STATS. Carrousel
            horizontal : il y a plus de tuiles que de largeur disponible, la
            dernière se découvre en faisant défiler. La barre de défilement est
            masquée (les deux syntaxes sont nécessaires : `scrollbar-width` pour
            Firefox, le pseudo-élément pour Chrome/Safari) ; molette, trackpad,
            clavier et glisser-déposer restent possibles.
            Pas de `scroll-snap` : la rangée doit rester exactement là où on la
            lâche, sans se recaler toute seule sur une tuile. */}
        <div
          ref={stripRef}
          onPointerDown={handleStripPointerDown}
          onPointerMove={handleStripPointerMove}
          onPointerUp={handleStripPointerUp}
          onPointerCancel={handleStripPointerUp}
          className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 14,
            overflowX: 'auto',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {statTiles.map(({ icon: Icon, value, label }) => (
            <div key={label} style={{ ...cardStyle, padding: '14px 14px 16px', width: 122, flex: '0 0 auto' }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: withAlpha(palette.green, 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: palette.greenBrand,
                }}
              >
                <Icon size={14} strokeWidth={1.75} />
              </span>
              <div style={{ fontSize: 21, fontWeight: 700, color: palette.ink, marginTop: 12 }}>{value}</div>
              <div style={{ fontSize: 11.5, color: palette.inkSoft, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Forfait — encart d'upsell pour les comptes gratuits (maquette), carte
            sobre pour les comptes déjà payants, à qui « passe à Smart » n'a rien
            à proposer. Le vocabulaire « Smart »/« basique » est celui de la
            maquette ; /pricing parle encore de Gratuit/Premium/Premium+ (voir
            docs/backlog.md). */}
        {tier === 'free' ? (
          <div
            style={{
              ...cardStyle,
              background: palette.goldTint,
              border: `1px solid ${withAlpha(palette.gold, 0.35)}`,
              padding: '18px 20px',
              marginTop: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: palette.surfaceRaised,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: palette.amberLight,
                  flexShrink: 0,
                }}
              >
                <Star size={17} strokeWidth={1.75} fill="currentColor" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: palette.amberLight,
                  }}
                >
                  {t('upsell.eyebrow')}
                </span>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: palette.ink, marginTop: 3 }}>
                  {t('upsell.title')}
                </span>
              </span>
            </div>
            <p style={{ fontSize: 13, color: palette.inkMuted, margin: '14px 0 0' }}>{t('upsell.desc')}</p>
            <Link href={`/${locale}/pricing`} style={{ display: 'block', marginTop: 16 }}>
              <Button variant="secondary" size="md" style={{ width: '100%' }}>
                {t('upsell.cta')}
              </Button>
            </Link>
            <div style={{ fontSize: 11.5, color: palette.inkSoft, textAlign: 'center', marginTop: 10 }}>
              {t('upsell.current')}
            </div>
          </div>
        ) : (
          <div style={{ ...cardStyle, padding: '16px 18px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: withAlpha(palette.gold, 0.18), display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.amberLight, flexShrink: 0 }}>
              <Sprout size={18} strokeWidth={1.75} />
            </span>
            <span style={{ flex: 1, minWidth: 160 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: palette.ink }}>{t(`plan.${planKey(tier)}`)}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: palette.inkMuted, marginTop: 2 }}>{t(`plan.desc.${planKey(tier)}`)}</span>
            </span>
            <Link href={`/${locale}/pricing`}>
              <Button variant="secondary" size="sm" trailingArrow>
                {t('plan.manage')}
              </Button>
            </Link>
          </div>
        )}

        {/* Suivi — page d'analyse dédiée (état vide V2), indépendante de tout atelier */}
        <Link
          href={`/${locale}/profile/analyse`}
          style={{ ...cardStyle, padding: '18px 20px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}
        >
          <span style={{ width: 44, height: 44, borderRadius: 12, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.greenBrand, flexShrink: 0 }}>
            <BarChart3 size={20} strokeWidth={1.75} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: palette.ink }}>{t('tracking.title')}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: palette.inkMuted, marginTop: 2 }}>{t('tracking.desc')}</span>
          </span>
          <ChevronRight size={18} strokeWidth={1.75} color={palette.inkMuted} />
        </Link>

        {/* Paramètres */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: palette.inkMuted, margin: '26px 0 12px', textTransform: 'uppercase' }}>
          {t('settings.title')}
        </div>
        <div style={{ ...cardStyle, overflow: 'visible' }}>
          <div style={{ ...settingsRowStyle, borderBottom: `1px solid ${palette.line}` }}>
            <span style={{ flex: 1 }}>{t('settings.notifications')}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: palette.inkFaint }}>{t('settings.notificationsHint')}</span>
            <ChevronRight size={15} strokeWidth={1.75} color={palette.inkFaint} />
          </div>

          {/* Langue — deux locales seulement, donc un menu court ancré sur la
              ligne plutôt qu'une sous-page. */}
          <div style={{ position: 'relative', borderBottom: `1px solid ${palette.line}` }}>
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              style={{ ...settingsRowStyle, cursor: 'pointer' }}
            >
              <span style={{ flex: 1 }}>{t('settings.language')}</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: palette.inkFaint }}>
                {t(locale === 'en' ? 'settings.languages.en' : 'settings.languages.fr')}
              </span>
              <ChevronRight size={15} strokeWidth={1.75} color={palette.inkFaint} />
            </button>

            {langOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setLangOpen(false)} />
                <div
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '100%',
                    zIndex: 50,
                    minWidth: 170,
                    background: palette.surfaceRaised,
                    border: `1px solid ${palette.line}`,
                    borderRadius: 12,
                    boxShadow: shadow.lg,
                    padding: 4,
                  }}
                >
                  {(['fr', 'en'] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => chooseLocale(code)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'transparent',
                        fontFamily: 'inherit',
                        fontSize: 13.5,
                        fontWeight: locale === code ? 700 : 500,
                        color: palette.ink,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ flex: 1 }}>{t(code === 'en' ? 'settings.languages.en' : 'settings.languages.fr')}</span>
                      {locale === code && <Check size={14} strokeWidth={2} color={palette.greenBrand} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link href={`/${locale}/contact`} style={{ ...settingsRowStyle, borderBottom: `1px solid ${palette.line}` }}>
            <span style={{ flex: 1 }}>{t('settings.help')}</span>
            <ChevronRight size={15} strokeWidth={1.75} color={palette.inkFaint} />
          </Link>

          <SignOutButton redirectUrl={`/${locale}`}>
            <button onClick={markIntentionalSignOut} style={{ ...settingsRowStyle, color: palette.danger, cursor: 'pointer' }}>
              <LogOut size={15} strokeWidth={1.75} />
              <span style={{ flex: 1 }}>{t('settings.signOut')}</span>
              <ChevronRight size={15} strokeWidth={1.75} color={withAlpha(palette.danger, 0.6)} />
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
