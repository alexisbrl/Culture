'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, Loader2, Star } from 'lucide-react';
import { palette, radius, shadow, withAlpha } from '@/lib/theme';
import Modal from '@/components/Modal';
import { activateWorkshopPremium } from '@/app/actions/workshops';
import { Row, SectionCard } from './settingsShared';

// Tarif réel (cible) : ~3,5 €/membre à plat, voir docs/product-spec.md § Atelier
// Premium. Purement indicatif ici (le paiement réel n'est pas encore branché,
// cf. le mécanisme de test ci-dessous) — sert seulement à donner une estimation
// avant activation, jamais à calculer une facturation réelle.
const REAL_PRICE_PER_MEMBER = 3.5;

// Grille de paliers dégressifs de la maquette (lignes 1698-1709 de
// App-Culture.dc.html) — dessinée pour se conformer visuellement au design,
// mais **inerte** : aucun palier dégressif n'existe réellement, le tarif réel
// est le taux unique ci-dessus (docs/product-spec.md). Décision consignée dans
// docs/chantiers/2026-08-05-refonte-ui-design-system.md (T32).
const DEGRESSIVE_TIERS = [
  { label: '1er membre', price: '1,00' },
  { label: '2 à 4 membres', price: '0,85' },
  { label: '5 à 9 membres', price: '0,75' },
  { label: '10 à 19 membres', price: '0,68' },
  { label: '20 à 49 membres', price: '0,63' },
  { label: '50 à 99 membres', price: '0,60' },
  { label: '100 membres et +', price: '0,575' },
] as const;

const ADVANTAGE_KEYS = [
  'noAds', 'unlimitedEnergy', 'aiExchange', 'examGenerator', 'inviteMembers', 'dailyJoker', 'exclusivePlants',
] as const;

export default function PremiumSection({ workshopId, isPremium, memberCount }: { workshopId: string; isPremium: boolean; memberCount: number }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [premiumPassword, setPremiumPassword] = useState('');
  const [premiumError, setPremiumError] = useState('');
  const [activatingPremium, setActivatingPremium] = useState(false);
  const [showPremiumConfirm, setShowPremiumConfirm] = useState(false);

  const total = memberCount * REAL_PRICE_PER_MEMBER;
  const totalStr = total.toFixed(2).replace('.', ',').replace(',00', '');
  const avgStr = REAL_PRICE_PER_MEMBER.toFixed(2).replace('.', ',').replace(',00', '');

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
        {/* ── 5. Atelier Premium (propriétaire uniquement) ── */}
        <SectionCard
          title={t('premium.title')}
          description={t('premium.desc')}
        >
          {/* Carte de passage / statut actif — fond doré, lignes 1643-1678 de la maquette */}
          <div style={{ position: 'relative', overflow: 'hidden', background: withAlpha(palette.gold, 0.14), border: `1.5px solid ${palette.gold}`, borderRadius: radius.lg, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: palette.gold, color: palette.onInk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Star size={19} strokeWidth={1.75} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.amberLight }}>
                {isPremium ? t('premium.eyebrowActive') : t('premium.eyebrowInactive')}
              </span>
            </div>

            {isPremium ? (
              <div style={{ marginTop: 14 }}>
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
              <>
              <div style={{ marginTop: 14 }}>
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
                  <Star size={16} strokeWidth={2} />
                  {t('premium.activate')}
                </button>
                <div style={{ fontSize: 11.5, color: palette.inkMuted, textAlign: 'center', marginTop: 8 }}>
                  {t('premium.irreversibleNote')}
                </div>
              </div>

              {/* [TEST TEMPORAIRE — 13/06/2026] Activation par mot de passe en attendant Stripe. À retirer une fois le paiement réel branché. */}
              <Row label={t('premium.testPwLabel')} hint={t('premium.testPwHint')} noBorder>
                <input
                  type="password"
                  value={premiumPassword}
                  onChange={(e) => { setPremiumPassword(e.target.value); setPremiumError(''); }}
                  placeholder={t('premium.pwPlaceholder')}
                  style={{
                    fontSize: 13,
                    padding: '9px 12px',
                    border: `1px solid ${palette.lineStrong}`,
                    borderRadius: 9,
                    outline: 'none',
                    background: palette.surfaceInput,
                    color: palette.ink,
                    width: 160,
                    boxSizing: 'border-box',
                  }}
                />
              </Row>
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
                    margin: '4px 0 0',
                  }}
                >
                  {premiumError}
                </p>
              )}
              </>
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

          {/* Détail des prix — grille de paliers dégressifs dessinée mais INERTE :
              aucun palier réel n'existe, le tarif réel est REAL_PRICE_PER_MEMBER
              ci-dessus (docs/product-spec.md). aria-disabled + pointer-events:none
              pour qu'elle ne semble jamais interactive. */}
          <div style={{ marginTop: 22, opacity: 0.7 }} aria-disabled="true">
            <div style={{ fontSize: 14, fontWeight: 700, color: palette.ink }}>{t('premium.tiersTitle')}</div>
            <div style={{ fontSize: 12.5, color: palette.inkFaint, marginTop: 3 }}>{t('premium.tiersNote')}</div>
            <div style={{ marginTop: 12, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden', pointerEvents: 'none' }}>
              {DEGRESSIVE_TIERS.map((tier, i) => (
                <div
                  key={tier.label}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                    padding: '13px 15px',
                    borderBottom: i < DEGRESSIVE_TIERS.length - 1 ? `1px solid ${palette.line}` : 'none',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: palette.inkMuted }}>{tier.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: palette.inkMuted, whiteSpace: 'nowrap' }}>
                    {tier.price} € <span style={{ fontSize: 11.5, fontWeight: 500, color: palette.inkFaint }}>/ membre</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

      {/* ── Modale « confirmation activation Premium » ──
          Modal directement (pas ConfirmDialog) : le bouton de confirmation doit
          rester désactivable tant que le mot de passe de test est vide ou que
          l'activation est en cours (ConfirmDialog n'expose pas de `disabled` sur
          son bouton de confirmation) — évite un double déclenchement du
          mécanisme d'activation irréversible. */}
      {showPremiumConfirm && (
        <Modal width={400} onClose={() => { setShowPremiumConfirm(false); setPremiumError(''); }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: palette.amberTint, color: palette.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6, textAlign: 'center' }}>{t('premium.confirmTitle')}</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: 20, textAlign: 'center' }}>
            {t('premium.confirmDesc')}
          </div>
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
