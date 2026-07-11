'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import Modal from '@/components/Modal';
import { activateWorkshopPremium } from '@/app/actions/workshops';
import { Row, SmallBtn, SectionCard } from './settingsShared';

export default function PremiumSection({ workshopId, isPremium }: { workshopId: string; isPremium: boolean }) {
  const router = useRouter();
  const t = useTranslations('settings');
  const [premiumPassword, setPremiumPassword] = useState('');
  const [premiumError, setPremiumError] = useState('');
  const [activatingPremium, setActivatingPremium] = useState(false);
  const [showPremiumConfirm, setShowPremiumConfirm] = useState(false);

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
          {isPremium ? (
            <Row
              label={t('premium.statusLabel')}
              hint={t('premium.statusHint')}
              noBorder
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: withAlpha(palette.amberGlow, 0.20),
                  border: `1px solid ${withAlpha(palette.amber, 0.30)}`,
                  color: '#7a4d20',
                  letterSpacing: '0.02em',
                }}
              >
                {t('premium.statusBadge')}
              </span>
            </Row>
          ) : (
            <>
            <Row
              label={t('premium.goPremiumLabel')}
              hint={t('premium.goPremiumHint')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: withAlpha(palette.amberGlow, 0.20),
                    border: `1px solid ${withAlpha(palette.amber, 0.30)}`,
                    color: '#7a4d20',
                    letterSpacing: '0.02em',
                  }}
                >
                  {t('premium.badgePremium')}
                </span>
                <SmallBtn tone="amber" onClick={() => setShowPremiumConfirm(true)}>{t('premium.activate')}</SmallBtn>
              </div>
            </Row>
            {/* [TEST TEMPORAIRE — 13/06/2026] Activation par mot de passe en attendant Stripe. À retirer une fois le paiement réel branché. */}
            <Row
              label={t('premium.testPwLabel')}
              hint={t('premium.testPwHint')}
              noBorder
            >
              <input
                type="password"
                value={premiumPassword}
                onChange={(e) => { setPremiumPassword(e.target.value); setPremiumError(''); }}
                placeholder={t('premium.pwPlaceholder')}
                style={{
                  fontSize: 13,
                  padding: '7px 12px',
                  border: `1px solid ${ink(0.14)}`,
                  borderRadius: 9,
                  outline: 'none',
                  background: withAlpha(palette.paper, 0.7),
                  color: palette.ink,
                  width: 160,
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
                  margin: '4px 0 12px',
                }}
              >
                {premiumError}
              </p>
            )}
            </>
          )}
        </SectionCard>
      {/* ── Modale « confirmation activation Premium » ── */}
      {showPremiumConfirm && (
        <Modal width={400} onClose={() => { setShowPremiumConfirm(false); setPremiumError(''); }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: withAlpha(palette.amberGlow, 0.18), color: palette.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>{t('premium.confirmTitle')}</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: 20 }}>
            {t('premium.confirmDesc')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              disabled={activatingPremium || !premiumPassword}
              onClick={handleActivatePremium}
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                background: (activatingPremium || !premiumPassword) ? ink(0.12) : palette.ink,
                color: (activatingPremium || !premiumPassword) ? palette.inkFaint : palette.paper,
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
              style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('cancel')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
