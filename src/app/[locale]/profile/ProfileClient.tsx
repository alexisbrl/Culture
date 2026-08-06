'use client';

// Page profil : carte d'identité, bloc « suivi » (page d'analyse dédiée au
// profil, T39 — indépendante de tout atelier), bloc forfait (tier réel, Clerk
// publicMetadata) et liste de paramètres. Aucune notion de série d'arrosage
// n'existe côté serveur : ce bloc est écrit puis masqué derrière HAS_STREAK,
// même principe que HAS_NOTIFICATIONS/HAS_DROPLETS (T15). Voir
// docs/chantiers/2026-08-05-refonte-ui-design-system.md, Lot 6.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { BarChart3, ChevronRight, Droplet, LogOut, Sprout } from 'lucide-react';
import { palette, withAlpha, shadow } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import LinkButton from '@/components/LinkButton';
import AvatarComposer from '@/components/avatar/AvatarComposer';
import { AvatarConfig, loadAvatarConfig } from '@/components/avatar/avatarConfig';
import { markIntentionalSignOut } from '@/lib/signOutIntent';
import NotificationBell from '@/components/NotificationBell';
import type { SubscriptionTier } from '@/lib/subscription';

type Props = {
  locale: string;
  uniqueId: string;
  firstName: string;
  lastName: string;
  createdAt: string | null;
  tier: SubscriptionTier;
};

const HAS_STREAK = false;
const HAS_NOTIFICATIONS = false;

function planKey(tier: SubscriptionTier): 'free' | 'premium' | 'premiumPlus' {
  return tier === 'premium_plus' ? 'premiumPlus' : tier;
}

export default function ProfileClient({ locale, uniqueId, firstName, lastName, createdAt, tier }: Props) {
  const t = useTranslations('profile');
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || t('defaultNameFull');
  const { user } = useUser();
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);

  // Avatar synchronisé au compte (publicMetadata.avatarParts), repli localStorage.
  useEffect(() => {
    const fromAccount = user?.publicMetadata?.avatarParts as AvatarConfig | undefined;
    setAvatarConfig(fromAccount ?? loadAvatarConfig());
  }, [user]);

  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })
    : null;

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

  return (
    <div style={{ background: palette.cream, minHeight: 'calc(100vh - 60px)', padding: '28px 24px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Identité */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, overflow: 'hidden', flexShrink: 0, background: palette.surfaceSunken }}>
            {avatarConfig && <AvatarComposer config={avatarConfig} size={72} frame="bust" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fullName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              {memberSince && (
                <span style={{ fontSize: 13, color: palette.inkMuted }}>{t('memberSince', { date: memberSince })}</span>
              )}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: palette.inkFaint, background: palette.surfaceSunken, padding: '2px 8px', borderRadius: 999 }}>
                #{uniqueId}
              </span>
            </div>
          </div>
          {/* « éditer » — bouton de la maquette (T24), rétabli en T47. Il vise la
              même page que la ligne « modifier l'avatar » plus bas, qui reste. */}
          <LinkButton href={`/${locale}/profile/avatar`} variant="ghost" size="sm">
            {t('edit')}
          </LinkButton>
          {HAS_NOTIFICATIONS && <NotificationBell />}
        </div>

        {/* Série d'arrosage — aucune donnée n'existe, jamais monté */}
        {HAS_STREAK && (
          <div style={{ ...cardStyle, padding: '16px 18px', marginTop: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: palette.inkFaint, textTransform: 'uppercase' }}>
              {t('streak.label')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13.5, fontWeight: 600, color: palette.amber }}>
              <Droplet size={16} strokeWidth={1.75} />
              {t('streak.days', { count: 0 })}
            </div>
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

        {/* Forfait — tier réel du compte */}
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

        {/* Paramètres */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: palette.inkMuted, margin: '26px 0 12px' }}>
          {t('settings.title')}
        </div>
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <Link href={`/${locale}/profile/avatar`} style={{ ...settingsRowStyle, borderBottom: `1px solid ${palette.line}` }}>
            <span style={{ flex: 1 }}>{t('settings.editAvatar')}</span>
            <ChevronRight size={15} strokeWidth={1.75} color={palette.inkFaint} />
          </Link>
          <div style={{ ...settingsRowStyle, borderBottom: `1px solid ${palette.line}` }}>
            <span style={{ flex: 1 }}>{t('settings.notifications')}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: palette.inkFaint }}>{t('settings.notificationsHint')}</span>
          </div>
          <div style={{ ...settingsRowStyle, borderBottom: `1px solid ${palette.line}` }}>
            <span style={{ flex: 1 }}>{t('settings.language')}</span>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: palette.inkFaint }}>{t('settings.languageName')}</span>
          </div>
          <Link href={`/${locale}/contact`} style={{ ...settingsRowStyle, borderBottom: `1px solid ${palette.line}` }}>
            <span style={{ flex: 1 }}>{t('settings.help')}</span>
            <ChevronRight size={15} strokeWidth={1.75} color={palette.inkFaint} />
          </Link>
          <SignOutButton redirectUrl={`/${locale}`}>
            <button onClick={markIntentionalSignOut} style={{ ...settingsRowStyle, color: palette.danger, cursor: 'pointer' }}>
              <LogOut size={15} strokeWidth={1.75} />
              <span style={{ flex: 1 }}>{t('settings.signOut')}</span>
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
