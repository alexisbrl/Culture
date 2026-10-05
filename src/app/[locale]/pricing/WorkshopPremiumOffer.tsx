'use client';

// Vitrine de l'offre « atelier Premium », affichée sur la page tarifs quand on
// bascule sur la nouvelle version. Purement indicative : l'abonnement se porte
// sur le compte (docs/product-spec.md § Comptes & abonnements), rien ici ne
// s'active ni ne se facture. Le nombre de membres est simulé par un curseur,
// faute d'atelier auquel se rapporter sur cette page.

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Crown } from 'lucide-react';
import { palette, radius, shadow, withAlpha } from '@/lib/theme';

// Grille de paliers dégressifs : le total mensuel est la somme membre par
// membre à travers les paliers (ex. 6 membres = 1×1,00 + 3×0,85 + 2×0,75 = 5,05 €).
const PRICE_TIERS = [
  { key: 't1', upTo: 1, price: 1.0 },
  { key: 't2to4', upTo: 4, price: 0.85 },
  { key: 't5to9', upTo: 9, price: 0.75 },
  { key: 't10to19', upTo: 19, price: 0.68 },
  { key: 't20to49', upTo: 49, price: 0.63 },
  { key: 't50to99', upTo: 99, price: 0.6 },
  { key: 't100plus', upTo: Infinity, price: 0.57 },
] as const;

const MAX_SIMULATED_MEMBERS = 150;
const DEFAULT_SIMULATED_MEMBERS = 20;

function monthlyTotal(memberCount: number): number {
  let total = 0;
  let prev = 0;
  for (const tier of PRICE_TIERS) {
    const span = Math.max(0, Math.min(memberCount, tier.upTo) - prev);
    total += span * tier.price;
    prev = tier.upTo;
    if (memberCount <= tier.upTo) break;
  }
  return total;
}

const ADVANTAGE_KEYS = [
  'noAds', 'unlimitedEnergy', 'aiExchange', 'examGenerator', 'inviteMembers', 'fileStorage', 'dailyJoker', 'exclusivePlants',
] as const;

export default function WorkshopPremiumOffer() {
  const locale = useLocale();
  const t = useTranslations('accountPricing.workshopOffer');
  const [memberCount, setMemberCount] = useState(DEFAULT_SIMULATED_MEMBERS);

  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  const fmt = (value: number, decimals: number) =>
    new Intl.NumberFormat(numberLocale, { minimumFractionDigits: decimals, maximumFractionDigits: 2 }).format(value);

  const total = monthlyTotal(memberCount);
  const currentTierIndex = PRICE_TIERS.findIndex((tier) => memberCount <= tier.upTo);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
      {/* Carte de présentation — fond doré, comme l'ancienne section des paramètres */}
      <div style={{ position: 'relative', overflow: 'hidden', background: withAlpha(palette.gold, 0.14), border: `1.5px solid ${palette.gold}`, borderRadius: radius.lg, padding: 22 }}>
        <div aria-hidden style={{ position: 'absolute', top: -55, right: -25, width: 170, height: 170, borderRadius: '50%', background: withAlpha(palette.gold, 0.16), pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: palette.gold, color: palette.onInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crown size={19} strokeWidth={1.75} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.amberLight }}>
            {t('eyebrow')}
          </span>
        </div>
        <div style={{ position: 'relative', marginTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 23, color: palette.ink, lineHeight: 1.2 }}>
            {t('heroTitle')}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: palette.ink }}>≈ {fmt(total, 2)} €</span>
            <span style={{ fontSize: 13, color: palette.inkMuted }}>{t('perMonthFor', { count: memberCount })}</span>
          </div>
          <div style={{ fontSize: 12.5, color: palette.inkMuted, marginTop: 4 }}>
            {t('perMemberNote', { avg: fmt(total / memberCount, 2) })}
          </div>
          <label style={{ display: 'block', marginTop: 16 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: palette.inkMuted, marginBottom: 6 }}>
              {t('simulatorLabel')}
            </span>
            <input
              type="range"
              min={1}
              max={MAX_SIMULATED_MEMBERS}
              value={memberCount}
              onChange={(e) => setMemberCount(Number(e.target.value))}
              style={{ width: '100%', accentColor: palette.gold }}
            />
          </label>
        </div>
      </div>

      {/* Avantages */}
      <div style={{ fontSize: 14, fontWeight: 700, color: palette.ink, marginTop: 24, marginBottom: 10 }}>
        {t('advantagesTitle')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {ADVANTAGE_KEYS.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: withAlpha(palette.gold, 0.18), color: palette.amberLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={13} strokeWidth={2.5} />
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: palette.inkMuted, lineHeight: 1.35 }}>
              {t(`advantages.${key}`)}
            </span>
          </div>
        ))}
      </div>

      {/* Détail des prix — le palier du nombre simulé est surligné */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: palette.ink }}>{t('tiersTitle')}</div>
        <div style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 3 }}>{t('tiersNote')}</div>
        <div style={{ marginTop: 12, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden' }}>
          {PRICE_TIERS.map((tier, i) => {
            const isCurrent = i === currentTierIndex;
            return (
              <div
                key={tier.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                  padding: '13px 15px',
                  background: isCurrent ? withAlpha(palette.gold, 0.12) : 'transparent',
                  borderBottom: i < PRICE_TIERS.length - 1 ? `1px solid ${palette.line}` : 'none',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: isCurrent ? palette.ink : palette.inkMuted }}>
                  {t(`tiers.${tier.key}`)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: palette.ink, whiteSpace: 'nowrap' }}>
                  {fmt(tier.price, Number.isInteger(tier.price) ? 0 : 2)} € <span style={{ fontSize: 11.5, fontWeight: 500, color: palette.inkFaint }}>{t('perMemberUnit')}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
