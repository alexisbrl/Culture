'use client';

import { palette, ink, withAlpha } from '@/lib/theme';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SubscriptionTier } from '@/lib/subscription';

const AMBER       = palette.amber;
const AMBER_LIGHT = '#e8b86c';
const AMBER_PALE  = '#e8d8a8';
const BG          = palette.cream;
const DARK        = palette.ink;
const TEXT_MUTED  = palette.inkSoft;

// ---- Glyphs ----

function SeedGlyph() {
  return (
    <svg viewBox="0 0 56 56" width="80" height="80" aria-hidden>
      <ellipse cx="28" cy="48" rx="20" ry="4" fill="#000" opacity={0.15} />
      <path d="M 28 26 L 46 36 L 28 46 L 10 36 Z" fill="#cfd9c0" />
      <ellipse cx="28" cy="32" rx="6" ry="3" fill="#a08a72" />
      <path d="M 28 30 q -2 -8 0 -12" stroke="#7a9968" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <ellipse cx="28" cy="20" rx="4" ry="3" fill="#7a9968" />
    </svg>
  );
}

function BushGlyph() {
  return (
    <svg viewBox="0 0 56 56" width="80" height="80" aria-hidden>
      <ellipse cx="28" cy="48" rx="20" ry="4" fill="#000" opacity={0.15} />
      <path d="M 28 26 L 46 36 L 28 46 L 10 36 Z" fill="#cfd9c0" />
      <rect x="26" y="20" width="4" height="14" rx="1" fill="#6e5a44" />
      <ellipse cx="28" cy="18" rx="11" ry="10" fill="#7a9968" />
      <ellipse cx="25" cy="14" rx="4" ry="3" fill="#fff" opacity={0.25} />
      <ellipse cx="28" cy="12" rx="8" ry="6" fill="#4f6b40" />
    </svg>
  );
}

function TreeGlyph() {
  return (
    <svg viewBox="0 0 56 56" width="80" height="80" aria-hidden>
      <ellipse cx="28" cy="48" rx="20" ry="4" fill="#000" opacity={0.15} />
      <path d="M 28 26 L 46 36 L 28 46 L 10 36 Z" fill="#cfd9c0" />
      <rect x="26" y="20" width="4" height="14" rx="1" fill="#5a4838" />
      <ellipse cx="22" cy="14" rx="10" ry="10" fill="#7a9968" />
      <ellipse cx="34" cy="12" rx="11" ry="11" fill="#7a9968" />
      <ellipse cx="28" cy="6" rx="13" ry="12" fill="#4f6b40" />
      <ellipse cx="24" cy="6" rx="6" ry="5" fill="#fff" opacity={0.18} />
      <circle cx="34" cy="8" r="2" fill="#e8d8a8" opacity={0.85} />
    </svg>
  );
}

function FeatureItem({ included, label, dark }: { included: boolean; label: string; dark?: boolean }) {
  return (
    <li style={{
      display: 'flex', alignItems: 'center', fontSize: 13, marginBottom: 6,
      color: dark ? (included ? AMBER_PALE : 'rgba(244,240,230,0.45)') : (included ? '#3a3630' : '#b0a898'),
      textDecoration: !included ? 'line-through' : 'none',
    }}>
      <span style={{ color: dark ? (included ? AMBER_PALE : '#c0b8ac') : (included ? '#5a8a4a' : '#c0b8ac'), fontWeight: 600, marginRight: 8 }}>
        {included ? '✓' : '✗'}
      </span>
      {label}
    </li>
  );
}

// ---- CTA button per tier ----

function TierCTA({ tier, current, annual, dark }: {
  tier: SubscriptionTier;
  current: SubscriptionTier;
  annual: boolean;
  dark?: boolean;
}) {
  const t = useTranslations('accountPricing');
  const isCurrent = tier === current;

  if (isCurrent) {
    return (
      <button disabled style={{
        width: '100%', padding: '11px 0', borderRadius: 10, border: dark ? '1.5px solid rgba(244,240,230,0.18)' : `1.5px solid ${ink(0.16)}`,
        background: 'transparent', color: dark ? 'rgba(244,240,230,0.6)' : TEXT_MUTED,
        fontSize: 14, fontWeight: 500, fontFamily: "'Inter Tight', sans-serif", cursor: 'default',
      }}>
        {t('currentPlan')}
      </button>
    );
  }

  const labels: Record<SubscriptionTier, string> = {
    free:         t('switchTo.free'),
    premium:      t('switchTo.premium'),
    premium_plus: t('switchTo.premiumPlus'),
  };

  const bg = tier === 'premium_plus' ? AMBER_PALE : tier === 'premium' ? AMBER_LIGHT : DARK;
  const color = tier === 'premium_plus' ? DARK : palette.paper;

  return (
    <button
      onClick={() => alert(t('alerts.paymentSoon'))}
      style={{
        width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
        background: bg, color,
        fontSize: 14, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
      }}
    >
      {labels[tier]}{annual && tier !== 'free' ? ` (${t('annualSuffix')})` : ''}
    </button>
  );
}

// ---- Main component ----

export default function PricingClient({ currentTier }: { currentTier: SubscriptionTier }) {
  const t = useTranslations('accountPricing');
  const [annual, setAnnual] = useState(false);

  const cardBase: React.CSSProperties = {
    background: withAlpha(palette.paper, 0.85),
    border: `1.5px solid ${ink(0.12)}`,
    borderRadius: 20, padding: '32px 28px',
    display: 'flex', flexDirection: 'column',
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Caveat:wght@400;600&display=swap');`}</style>

      <div style={{ background: BG, minHeight: 'calc(100vh - 65px)', fontFamily: "'Inter Tight', sans-serif", padding: '60px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 22, color: AMBER, marginBottom: 8 }}>
            {t('tagline')}
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 500, color: DARK, margin: '0 0 10px', lineHeight: 1.2 }}>
            {t('title')}
          </h2>
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 24 }}>
            {t('subtitle')}
          </p>
          <div style={{ display: 'inline-flex', background: ink(0.06), borderRadius: 100, padding: 4, gap: 2 }}>
            {(['mensuel', 'annuel'] as const).map((opt) => (
              <button key={opt} onClick={() => setAnnual(opt === 'annuel')} style={{
                border: 'none', borderRadius: 100, padding: '6px 18px', fontSize: 13,
                fontFamily: "'Inter Tight', sans-serif", fontWeight: 500, cursor: 'pointer',
                background: (annual ? opt === 'annuel' : opt === 'mensuel') ? palette.paper : 'transparent',
                color: (annual ? opt === 'annuel' : opt === 'mensuel') ? DARK : TEXT_MUTED,
                boxShadow: (annual ? opt === 'annuel' : opt === 'mensuel') ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                transition: 'all 0.15s',
              }}>
                {t(`billing.${opt}`)}{opt === 'annuel' && <span style={{ marginLeft: 6, fontSize: 11, color: '#5a8a4a', fontWeight: 600 }}>-20%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 3 cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, maxWidth: 1100, margin: '0 auto 40px', alignItems: 'start' }}>

          {/* Gratuit */}
          <div style={{ ...cardBase, outline: currentTier === 'free' ? `2px solid ${DARK}` : 'none' }}>
            {currentTier === 'free' && <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: DARK, marginBottom: 12 }}>{t('currentBadge')}</div>}
            <div style={{ marginBottom: 16 }}><SeedGlyph /></div>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: TEXT_MUTED, marginBottom: 4 }}>{t('tierKicker.free')}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: DARK, marginBottom: 8 }}>{t('tierName.free')}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: DARK, marginBottom: 4 }}>0 € <span style={{ fontSize: 14, color: TEXT_MUTED }}>{t('forever')}</span></div>
            <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 20 }}>{t('tierTagline.free')}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
              <FeatureItem included label={t('feature.energyLimited')} />
              <FeatureItem included label={t('feature.workshops5')} />
              <FeatureItem included label={t('feature.qcmLearning')} />
              <FeatureItem included={false} label={t('feature.noAds')} />
              <FeatureItem included={false} label={t('feature.examGenerator')} />
              <FeatureItem included={false} label={t('feature.aiExchange')} />
              <FeatureItem included={false} label={t('feature.exclusivePlants')} />
              <FeatureItem included={false} label={t('feature.enhancedSecurity')} />
            </ul>
            <TierCTA tier="free" current={currentTier} annual={annual} />
          </div>

          {/* Premium */}
          <div style={{
            ...cardBase,
            transform: 'translateY(-8px)',
            boxShadow: `0 30px 60px ${withAlpha(palette.amber, 0.18)}`,
            border: currentTier === 'premium' ? `2px solid ${AMBER_LIGHT}` : `1.5px solid ${withAlpha(palette.amber, 0.45)}`,
            position: 'relative',
          }}>
            {currentTier === 'premium' ? (
              <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: AMBER_LIGHT, color: palette.paper, fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                {t('ribbonCurrentBadge')}
              </div>
            ) : (
              <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: ink(0.12), color: DARK, fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                {t('recommendedBadge')}
              </div>
            )}
            <div style={{ marginBottom: 16 }}><BushGlyph /></div>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: TEXT_MUTED, marginBottom: 4 }}>{t('tierKicker.premium')}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: DARK, marginBottom: 8 }}>Premium</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: DARK, marginBottom: 2 }}>
              {annual ? '8 €' : '10 €'} <span style={{ fontSize: 14, color: TEXT_MUTED }}>{t('perMonth')}</span>
            </div>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: AMBER, marginBottom: 4 }}>
              {annual ? t('tierTagline.saveAnnual', { amount: '24 €' }) : t('tierTagline.monthlyIfAnnual', { amount: '8 €' })}
            </div>
            <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 20 }}>{t('tierTagline.premium')}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
              <FeatureItem included label={t('feature.energyUnlimited')} />
              <FeatureItem included label={t('feature.noAds')} />
              <FeatureItem included label={t('feature.workshops10')} />
              <FeatureItem included label={t('feature.examGenerator')} />
              <FeatureItem included label={t('feature.aiExchange')} />
              <FeatureItem included label={t('feature.exclusivePlants')} />
              <FeatureItem included label={t('feature.joker1')} />
              <FeatureItem included label={t('feature.shareSub2')} />
              <FeatureItem included={false} label={t('feature.enhancedSecurity')} />
              <FeatureItem included={false} label={t('feature.courseGeneration')} />
            </ul>
            <TierCTA tier="premium" current={currentTier} annual={annual} />
          </div>

          {/* Premium+ */}
          <div style={{ ...cardBase, background: DARK, border: currentTier === 'premium_plus' ? `2px solid ${AMBER_LIGHT}` : '1.5px solid rgba(232,216,168,0.2)' }}>
            {currentTier === 'premium_plus' && <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: AMBER_PALE, marginBottom: 12 }}>{t('currentBadge')}</div>}
            <div style={{ marginBottom: 16 }}><TreeGlyph /></div>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'rgba(244,240,230,0.45)', marginBottom: 4 }}>{t('tierKicker.premiumPlus')}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: palette.parchment, marginBottom: 8 }}>Premium+</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: palette.parchment, marginBottom: 2 }}>
              {annual ? '20 €' : '25 €'} <span style={{ fontSize: 14, color: 'rgba(244,240,230,0.55)' }}>{t('perMonth')}</span>
            </div>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: AMBER_PALE, marginBottom: 4 }}>
              {annual ? t('tierTagline.saveAnnual', { amount: '60 €' }) : t('tierTagline.monthlyIfAnnual', { amount: '20 €' })}
            </div>
            <p style={{ fontSize: 13, color: 'rgba(244,240,230,0.6)', marginBottom: 20 }}>{t('tierTagline.premiumPlus')}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
              <FeatureItem included dark label={t('feature.allPremium')} />
              <FeatureItem included dark label={t('feature.enhancedSecurityExams')} />
              <FeatureItem included dark label={t('feature.secondaryCamera')} />
              <FeatureItem included dark label={t('feature.courseGeneration')} />
              <FeatureItem included dark label={t('feature.autoIntros')} />
              <FeatureItem included dark label={t('feature.autoFinalExam')} />
              <FeatureItem included dark label={t('feature.manualSectionValidation')} />
              <FeatureItem included dark label={t('feature.workshops15')} />
              <FeatureItem included dark label={t('feature.jokerChoice')} />
              <FeatureItem included dark label={t('feature.shareSub3')} />
            </ul>
            <TierCTA tier="premium_plus" current={currentTier} annual={annual} dark />
          </div>
        </div>

        {/* Atelier Premium */}
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          background: `linear-gradient(135deg, ${withAlpha(palette.amberGlow, 0.18)}, ${withAlpha(palette.amber, 0.10)})`,
          border: `1.5px solid ${withAlpha(palette.amber, 0.35)}`, borderRadius: 20, padding: '28px 32px',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', background: AMBER_LIGHT, color: palette.paper, padding: '3px 10px', borderRadius: 100 }}>{t('workshopPremium.badge')}</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', background: '#e05c3a', color: palette.paper, padding: '3px 10px', borderRadius: 100 }}>{t('workshopPremium.irreversible')}</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: DARK, margin: '0 0 8px' }}>{t('workshopPremium.title')}</h3>
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: '0 0 4px' }}>
              {t('workshopPremium.description')}
            </p>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 17, color: AMBER }}>{t('workshopPremium.tagline')}</div>
          </div>
          <button onClick={() => alert(t('alerts.soon'))} style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: AMBER_LIGHT, color: palette.paper, fontSize: 14, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t('workshopPremium.cta')}
          </button>
        </div>

      </div>
    </>
  );
}
