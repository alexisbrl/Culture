'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Check, Crown, Loader2 } from 'lucide-react';
import { palette, radius, shadow, withAlpha } from '@/lib/theme';
import Modal from '@/components/Modal';
import { activateWorkshopPremium } from '@/app/actions/workshops';

// Grille de paliers dégressifs (maquette, lignes 1698-1709 de App-Culture.dc.html).
// C'est la source de vérité du prix affiché : le total mensuel est la somme
// membre par membre à travers les paliers (ex. 6 membres = 1×1,00 + 3×0,85 +
// 2×0,75 = 5,05 €). Purement indicatif tant que le paiement réel n'est pas
// branché (activation par code de test ci-dessous) — jamais utilisé pour une
// facturation réelle.
const PRICE_TIERS = [
  { key: 't1', upTo: 1, price: 1.0 },
  { key: 't2to4', upTo: 4, price: 0.85 },
  { key: 't5to9', upTo: 9, price: 0.75 },
  { key: 't10to19', upTo: 19, price: 0.68 },
  { key: 't20to49', upTo: 49, price: 0.63 },
  { key: 't50to99', upTo: 99, price: 0.6 },
  { key: 't100plus', upTo: Infinity, price: 0.57 },
] as const;

// Total mensuel dégressif : chaque membre est facturé au prix du palier dans
// lequel il tombe (le 1er à 1 €, les 3 suivants à 0,85 €, etc.).
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

export default function PremiumSection({ workshopId, isPremium, memberCount }: { workshopId: string; isPremium: boolean; memberCount: number }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('settings');
  const [premiumPassword, setPremiumPassword] = useState('');
  const [premiumError, setPremiumError] = useState('');
  const [activatingPremium, setActivatingPremium] = useState(false);
  const [showPremiumConfirm, setShowPremiumConfirm] = useState(false);

  const numberLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  const fmt = (value: number, decimals: number) =>
    new Intl.NumberFormat(numberLocale, { minimumFractionDigits: decimals, maximumFractionDigits: 2 }).format(value);

  const total = monthlyTotal(memberCount);
  const totalStr = fmt(total, 2);
  const avgStr = fmt(memberCount > 0 ? total / memberCount : 0, 2);
  const currentTierIndex = PRICE_TIERS.findIndex((tier) => memberCount <= tier.upTo);

  async function handleActivatePremium() {
    setActivatingPremium(true);
    setPremiumError('');
    const result = await activateWorkshopPremium(workshopId, premiumPassword);
    setActivatingPremium(false);
    if (result.success) {
      setShowPremiumConfirm(false);
      router.refresh();
    } else {
      setPremiumError(result.error ?? t('err.generic'));
    }
  }

  return (
    <>
        {/* ── 5. Atelier Premium (propriétaire uniquement) ──
            Pas de SectionCard ici : la section vit sans encadré, directement
            sur le fond de la page (titre seul, sans description). */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink, marginBottom: 10 }}>
            {t('premium.title')}
          </div>
          {/* Carte de passage / statut actif — fond doré, lignes 1643-1678 de la maquette */}
          <div style={{ position: 'relative', overflow: 'hidden', background: withAlpha(palette.gold, 0.14), border: `1.5px solid ${palette.gold}`, borderRadius: radius.lg, padding: 20 }}>
            {/* Halo décoratif en haut à droite (maquette) */}
            <div aria-hidden style={{ position: 'absolute', top: -55, right: -25, width: 170, height: 170, borderRadius: '50%', background: withAlpha(palette.gold, 0.16), pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: palette.gold, color: palette.onInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Crown size={19} strokeWidth={1.75} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.amberLight }}>
                {isPremium ? t('premium.eyebrowActive') : t('premium.eyebrowInactive')}
              </span>
            </div>

            {isPremium ? (
              <div style={{ position: 'relative', marginTop: 14 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: palette.gold, color: palette.onInk, fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 999 }}>
                  <Check size={13} strokeWidth={2.5} />
                  {t('premium.activeBadge')}
                </div>
                <div style={{ fontSize: 21, fontWeight: 600, color: palette.ink, lineHeight: 1.25, marginTop: 12 }}>
                  {t('premium.activeTitle')}
                </div>
                <div style={{ fontSize: 13, color: palette.inkMuted, marginTop: 6 }}>
                  {t('premium.activeBilling', { total: totalStr, count: memberCount })}
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', marginTop: 14 }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 23, color: palette.ink, lineHeight: 1.2 }}>
                  {t('premium.heroTitle')}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: palette.ink }}>≈ {totalStr} €</span>
                  <span style={{ fontSize: 13, color: palette.inkMuted }}>{t('premium.perMonthFor', { count: memberCount })}</span>
                </div>
                <div style={{ fontSize: 12.5, color: palette.inkMuted, marginTop: 4 }}>
                  {t('premium.perMemberNote', { avg: avgStr })}
                </div>
                <button
                  onClick={() => setShowPremiumConfirm(true)}
                  style={{
                    cursor: 'pointer', fontFamily: 'inherit', marginTop: 16, width: '100%', border: 'none', borderRadius: 14,
                    background: palette.amberLight, color: palette.onInk, fontSize: 15, fontWeight: 700, padding: '14px 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Crown size={16} strokeWidth={2} />
                  {t('premium.activate')}
                </button>
                <div style={{ fontSize: 11.5, color: palette.inkMuted, textAlign: 'center', marginTop: 8 }}>
                  {t('premium.irreversibleNote')}
                </div>
              </div>
            )}
          </div>

          {/* Avantages — lignes 1681-1692 de la maquette */}
          <div style={{ marginTop: 22, fontSize: 14, fontWeight: 700, color: palette.ink }}>
            {t('premium.advantagesTitle')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 10, marginTop: 12 }}>
            {ADVANTAGE_KEYS.map((key) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, padding: '13px 15px' }}>
                <span style={{ width: 22, height: 22, borderRadius: 999, background: withAlpha(palette.green, 0.14), color: palette.greenBrand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Check size={13} strokeWidth={2.75} />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: palette.inkMuted, lineHeight: 1.35 }}>
                  {t(`premium.advantages.${key}`)}
                </span>
              </div>
            ))}
          </div>

          {/* Détail des prix — la grille dégressive qui sert au calcul du total
              ci-dessus ; le palier courant de l'atelier est surligné. */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: palette.ink }}>{t('premium.tiersTitle')}</div>
            <div style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 3 }}>{t('premium.tiersNote')}</div>
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: isCurrent ? palette.ink : palette.inkMuted }}>
                      {t(`premium.tiers.${tier.key}`)}
                      {isCurrent && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: palette.amberLight, border: `1px solid ${withAlpha(palette.gold, 0.55)}`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                          {t('premium.yourTier')}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: palette.ink, whiteSpace: 'nowrap' }}>
                      {fmt(tier.price, Number.isInteger(tier.price) ? 0 : 2)} € <span style={{ fontSize: 11.5, fontWeight: 500, color: palette.inkFaint }}>{t('premium.perMemberUnit')}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      {/* ── Modale « confirmation activation Premium » ──
          Modal directement (pas ConfirmDialog) : le bouton de confirmation doit
          rester désactivable tant que le code de test est vide ou que
          l'activation est en cours (ConfirmDialog n'expose pas de `disabled` sur
          son bouton de confirmation) — évite un double déclenchement du
          mécanisme d'activation irréversible.
          [TEST TEMPORAIRE — 13/06/2026] Activation par code en attendant Stripe.
          À retirer une fois le paiement réel branché. */}
      {showPremiumConfirm && (
        <Modal width={400} onClose={() => { setShowPremiumConfirm(false); setPremiumError(''); }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: palette.amberTint, color: palette.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6, textAlign: 'center' }}>{t('premium.confirmTitle')}</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: 16, textAlign: 'center' }}>
            {t('premium.confirmDesc')}
          </div>
          <input
            type="password"
            value={premiumPassword}
            onChange={(e) => { setPremiumPassword(e.target.value); setPremiumError(''); }}
            placeholder={t('premium.pwPlaceholder')}
            autoFocus
            style={{
              fontSize: 13,
              fontFamily: 'inherit',
              padding: '10px 12px',
              border: `1px solid ${palette.lineStrong}`,
              borderRadius: 10,
              outline: 'none',
              background: palette.surfaceInput,
              color: palette.ink,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: palette.inkFaint, marginTop: 6, marginBottom: premiumError ? 10 : 16 }}>
            {t('premium.testPwHint')}
          </div>
          {premiumError && (
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: palette.danger,
                background: withAlpha(palette.danger, 0.08),
                border: `1px solid ${withAlpha(palette.danger, 0.18)}`,
                borderRadius: 9,
                padding: '8px 12px',
                margin: '0 0 14px',
              }}
            >
              {premiumError}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              disabled={activatingPremium || !premiumPassword}
              onClick={handleActivatePremium}
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                background: (activatingPremium || !premiumPassword) ? palette.surfaceSunken : palette.ink,
                color: (activatingPremium || !premiumPassword) ? palette.inkFaint : palette.onInk,
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: (activatingPremium || !premiumPassword) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {activatingPremium ? <Loader2 size={14} className="animate-spin" /> : null}
              {t('premium.confirmBtn')}
            </button>
            <button
              onClick={() => { setShowPremiumConfirm(false); setPremiumError(''); }}
              style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${palette.lineStrong}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('cancel')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
