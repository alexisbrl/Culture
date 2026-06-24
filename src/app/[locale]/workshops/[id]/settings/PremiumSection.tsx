'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import Modal from '@/components/Modal';
import { activateWorkshopPremium } from '@/app/actions/workshops';
import { Row, SmallBtn, SectionCard } from './settingsShared';

export default function PremiumSection({ workshopId, isPremium }: { workshopId: string; isPremium: boolean }) {
  const router = useRouter();
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
      setPremiumError(result.error ?? 'Erreur');
    }
  }

  return (
    <>
        {/* ── 5. Atelier Premium (propriétaire uniquement) ── */}
        <SectionCard
          title="Atelier Premium"
          description="Activez le statut Premium pour débloquer des fonctionnalités avancées pour tous les membres."
        >
          {isPremium ? (
            <Row
              label="Statut de l'atelier"
              hint="passage Premium définitif"
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
                ✓ atelier premium
              </span>
            </Row>
          ) : (
            <>
            <Row
              label="Passer l'atelier Premium"
              hint="badge visible · engagement irréversible"
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
                  badge premium
                </span>
                <SmallBtn tone="amber" onClick={() => setShowPremiumConfirm(true)}>activer →</SmallBtn>
              </div>
            </Row>
            {/* [TEST TEMPORAIRE — 13/06/2026] Activation par mot de passe en attendant Stripe. À retirer une fois le paiement réel branché. */}
            <Row
              label="Mot de passe d'activation (test)"
              hint="mode de test — sera retiré avec l'intégration du paiement"
              noBorder
            >
              <input
                type="password"
                value={premiumPassword}
                onChange={(e) => { setPremiumPassword(e.target.value); setPremiumError(''); }}
                placeholder="mot de passe…"
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
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>Passer l&apos;atelier Premium</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: 20 }}>
            Cette action est définitive et irréversible : l&apos;atelier deviendra privé pour toujours et tous ses membres (actuels et futurs) auront un accès Premium à vie.
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
              Confirmer l&apos;activation
            </button>
            <button
              onClick={() => { setShowPremiumConfirm(false); setPremiumError(''); }}
              style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
