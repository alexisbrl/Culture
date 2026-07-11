'use client';

import { palette, withAlpha } from '@/lib/theme';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUser } from '@clerk/nextjs';
import AvatarComposer from '@/components/avatar/AvatarComposer';
import { AvatarConfig, loadAvatarConfig } from '@/components/avatar/avatarConfig';

type Props = {
  locale: string;
  uniqueId: string;
  firstName: string;
  lastName: string;
};

const HERO_GRADIENT = 'linear-gradient(180deg, #f6f2eb, #ece6db)';
const AVATAR_GRADIENT = 'linear-gradient(180deg, #efe9d8, #dbe6d6)';
const SUB_CARD_GRADIENT = 'linear-gradient(180deg, rgba(232,184,108,0.20), rgba(232,184,108,0.06))';
const DARK_BG = palette.ink;
const DARK_TEXT = palette.parchment;

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div
      style={{
        background: withAlpha(palette.paper, 0.7),
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 500, color: palette.ink, lineHeight: 1.1 }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: '#8a7f72' }}>{label}</span>
    </div>
  );
}

export default function ProfileClient({ locale, uniqueId, firstName, lastName }: Props) {
  const t = useTranslations('profile');
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || t('defaultNameFull');
  const { user } = useUser();
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  // Avatar synchronisé au compte (publicMetadata.avatarParts), repli localStorage.
  useEffect(() => {
    const fromAccount = user?.publicMetadata?.avatarParts as AvatarConfig | undefined;
    setAvatarConfig(fromAccount ?? loadAvatarConfig());
  }, [user]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Caveat:wght@400;500&display=swap');
        .profile-root * { font-family: 'Inter Tight', sans-serif; box-sizing: border-box; }
        .profile-btn-dark {
          background: #2d2a24; color: #f4f0e6; border: none;
          border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: 'Inter Tight', sans-serif;
          text-decoration: none; display: inline-block;
        }
        .profile-btn-dark:hover { background: #3d3a34; }
        .profile-btn-ghost {
          background: transparent; color: #5a4838;
          border: 1.5px solid rgba(90,72,56,0.25); border-radius: 10px;
          padding: 8px 16px; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: 'Inter Tight', sans-serif;
          text-decoration: none; display: inline-block;
        }
        .profile-btn-ghost:hover { background: rgba(90,72,56,0.06); }
      `}</style>

      <div
        className="profile-root"
        style={{ background: palette.cream, minHeight: 'calc(100vh - 65px)', padding: '28px 24px 48px' }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            fontSize: 13,
            color: '#a89880',
            marginBottom: 20,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <Link href={`/${locale}/dashboard`} style={{ color: '#a89880', textDecoration: 'none' }}>
            {t('breadcrumbGarden')}
          </Link>
          <span>›</span>
          <span style={{ color: '#5a4838' }}>{t('breadcrumbCurrent')}</span>
        </div>

        {/* Hero Card */}
        <div
          style={{
            background: HERO_GRADIENT,
            borderRadius: 18,
            padding: '24px 28px',
            display: 'flex',
            gap: 24,
            alignItems: 'flex-start',
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          {/* Avatar column */}
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 18,
              background: AVATAR_GRADIENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {avatarConfig ? (
              <AvatarComposer config={avatarConfig} size={160} frame="bust" />
            ) : (
              <div style={{ width: 160, height: 160 }} />
            )}
          </div>

          {/* Info column */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div
              style={{
                fontFamily: 'Caveat, cursive',
                fontSize: 18,
                color: palette.amber,
                marginBottom: 2,
              }}
            >
              {t('greeting', { name: firstName || t('defaultName') })}
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, color: palette.ink, marginBottom: 10 }}>
              {fullName}
            </div>

            {/* Chips */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  background: 'rgba(90,72,56,0.10)',
                  color: '#5a4838',
                  padding: '3px 10px',
                  borderRadius: 8,
                  letterSpacing: '0.08em',
                }}
              >
                #{uniqueId}
              </span>
              <span
                style={{
                  fontSize: 12,
                  background: withAlpha(palette.amberGlow, 0.25),
                  color: palette.amber,
                  padding: '3px 10px',
                  borderRadius: 8,
                  fontWeight: 500,
                }}
              >
                {t('premiumBadge')}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#8a7f72', marginBottom: 16 }}>
              {t('memberSince')}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="profile-btn-dark">{t('editProfile')}</button>
              <Link href={`/${locale}/profile/avatar`} className="profile-btn-ghost">
                {t('editAvatar')}
              </Link>
              <button className="profile-btn-ghost">{t('shareGarden')}</button>
            </div>
          </div>

          {/* Stats column */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <StatCard value={12} label={t('stats.streak')} />
            <StatCard value={5} label={t('stats.activeWorkshops')} />
            <StatCard value={5} label={t('stats.livingPlants')} />
            <StatCard value="2 480" label={t('stats.questionsAnswered')} />
          </div>
        </div>

        {/* Bottom grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
          }}
        >
          {/* Subscription card — span 2 */}
          <div
            style={{
              gridColumn: 'span 2',
              background: SUB_CARD_GRADIENT,
              border: `1.5px solid ${withAlpha(palette.amberGlow, 0.4)}`,
              borderRadius: 18,
              padding: '22px 24px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: palette.amber,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 6,
              }}
            >
              {t('subscription.label')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: palette.ink, marginBottom: 10 }}>
              {t('subscription.plan')}
            </div>
            <div style={{ fontSize: 13, color: '#5a4838', lineHeight: 1.6, marginBottom: 16 }}>
              {t('subscription.features')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href={`/${locale}/pricing`} className="profile-btn-dark">
                {t('subscription.manage')}
              </Link>
              <button className="profile-btn-ghost">{t('subscription.share')}</button>
            </div>
          </div>

          {/* Watering can / energy card */}
          <div
            style={{
              background: withAlpha(palette.paper, 0.6),
              border: '1.5px solid rgba(90,72,56,0.12)',
              borderRadius: 18,
              padding: '22px 24px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: palette.amber,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 12,
              }}
            >
              {t('energy.label')}
            </div>
            {/* 10 vertical bars, 8 filled */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', marginBottom: 12 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 32,
                    borderRadius: 4,
                    background: i < 8 ? palette.greenSoft : withAlpha(palette.greenSoft, 0.18),
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 13, color: '#5a4838', fontWeight: 500, marginBottom: 4 }}>
              {t('energy.sessions', { count: 8 })}
            </div>
            <div style={{ fontSize: 12, color: '#a89880' }}>{t('energy.nextJoker', { hours: 4 })}</div>
          </div>

          {/* Official exam card — span 2 */}
          <div
            style={{
              gridColumn: 'span 2',
              background: DARK_BG,
              color: DARK_TEXT,
              borderRadius: 18,
              padding: '22px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'rgba(244,240,230,0.5)',
                }}
              >
                {t('exam.label')}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'rgba(244,240,230,0.12)',
                  color: 'rgba(244,240,230,0.6)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  letterSpacing: '0.06em',
                }}
              >
                V3
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>
              {t('exam.title')}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(244,240,230,0.65)', lineHeight: 1.6 }}>
              {t('exam.desc')}
            </div>
          </div>

          {/* Friends card */}
          <div
            style={{
              background: 'transparent',
              border: '1.5px dashed rgba(90,72,56,0.25)',
              borderRadius: 18,
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#a89880',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {t('friends.label')}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'rgba(168,152,128,0.15)',
                  color: '#a89880',
                  padding: '2px 8px',
                  borderRadius: 6,
                  letterSpacing: '0.06em',
                }}
              >
                V2
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#a89880', lineHeight: 1.6 }}>
              {t('friends.desc')}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
