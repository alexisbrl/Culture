'use client';

import { useState } from 'react';
import type { SubscriptionTier } from '@/lib/subscription';

const AMBER       = '#a87a3a';
const AMBER_LIGHT = '#e8b86c';
const AMBER_PALE  = '#e8d8a8';
const BG          = '#fcf9f2';
const DARK        = '#2d2a24';
const TEXT_MUTED  = '#7a766d';

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
  const isCurrent = tier === current;

  if (isCurrent) {
    return (
      <button disabled style={{
        width: '100%', padding: '11px 0', borderRadius: 10, border: dark ? '1.5px solid rgba(244,240,230,0.18)' : '1.5px solid rgba(45,42,36,0.16)',
        background: 'transparent', color: dark ? 'rgba(244,240,230,0.6)' : TEXT_MUTED,
        fontSize: 14, fontWeight: 500, fontFamily: "'Inter Tight', sans-serif", cursor: 'default',
      }}>
        ton offre actuelle
      </button>
    );
  }

  const labels: Record<SubscriptionTier, string> = {
    free:         'passer au gratuit',
    premium:      'passer Premium →',
    premium_plus: 'passer Premium+ →',
  };

  const bg = tier === 'premium_plus' ? AMBER_PALE : tier === 'premium' ? AMBER_LIGHT : DARK;
  const color = tier === 'premium_plus' ? DARK : '#fff';

  return (
    <button
      onClick={() => alert('Paiement disponible prochainement.')}
      style={{
        width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
        background: bg, color,
        fontSize: 14, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer',
      }}
    >
      {labels[tier]}{annual && tier !== 'free' ? ' (annuel)' : ''}
    </button>
  );
}

// ---- Main component ----

export default function PricingClient({ currentTier }: { currentTier: SubscriptionTier }) {
  const [annual, setAnnual] = useState(false);

  const cardBase: React.CSSProperties = {
    background: 'rgba(255,255,255,0.85)',
    border: '1.5px solid rgba(45,42,36,0.12)',
    borderRadius: 20, padding: '32px 28px',
    display: 'flex', flexDirection: 'column',
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Caveat:wght@400;600&display=swap');`}</style>

      <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Inter Tight', sans-serif", padding: '60px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 22, color: AMBER, marginBottom: 8 }}>
            de la graine à l&apos;arbre —
          </div>
          <h2 style={{ fontSize: 32, fontWeight: 500, color: DARK, margin: '0 0 10px', lineHeight: 1.2 }}>
            choisis ton niveau de jardinage.
          </h2>
          <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 24 }}>
            Tout commence gratuitement. Grandis à ton rythme.
          </p>
          <div style={{ display: 'inline-flex', background: 'rgba(45,42,36,0.06)', borderRadius: 100, padding: 4, gap: 2 }}>
            {(['mensuel', 'annuel'] as const).map((opt) => (
              <button key={opt} onClick={() => setAnnual(opt === 'annuel')} style={{
                border: 'none', borderRadius: 100, padding: '6px 18px', fontSize: 13,
                fontFamily: "'Inter Tight', sans-serif", fontWeight: 500, cursor: 'pointer',
                background: (annual ? opt === 'annuel' : opt === 'mensuel') ? '#fff' : 'transparent',
                color: (annual ? opt === 'annuel' : opt === 'mensuel') ? DARK : TEXT_MUTED,
                boxShadow: (annual ? opt === 'annuel' : opt === 'mensuel') ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                transition: 'all 0.15s',
              }}>
                {opt}{opt === 'annuel' && <span style={{ marginLeft: 6, fontSize: 11, color: '#5a8a4a', fontWeight: 600 }}>-20%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 3 cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, maxWidth: 1100, margin: '0 auto 40px', alignItems: 'start' }}>

          {/* Gratuit */}
          <div style={{ ...cardBase, outline: currentTier === 'free' ? `2px solid ${DARK}` : 'none' }}>
            {currentTier === 'free' && <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: DARK, marginBottom: 12 }}>● ton offre actuelle</div>}
            <div style={{ marginBottom: 16 }}><SeedGlyph /></div>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: TEXT_MUTED, marginBottom: 4 }}>graine</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: DARK, marginBottom: 8 }}>Gratuit</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: DARK, marginBottom: 4 }}>0 € <span style={{ fontSize: 14, color: TEXT_MUTED }}>— pour toujours</span></div>
            <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 20 }}>L&apos;essentiel pour planter ta première parcelle.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
              <FeatureItem included label="énergie limitée" />
              <FeatureItem included label="5 ateliers loisir" />
              <FeatureItem included label="apprentissage QCM" />
              <FeatureItem included={false} label="sans publicité" />
              <FeatureItem included={false} label="générateur examen" />
              <FeatureItem included={false} label="échange IA" />
              <FeatureItem included={false} label="plantes exclusives" />
              <FeatureItem included={false} label="sécurité renforcée" />
            </ul>
            <TierCTA tier="free" current={currentTier} annual={annual} />
          </div>

          {/* Premium */}
          <div style={{
            ...cardBase,
            transform: 'translateY(-8px)',
            boxShadow: '0 30px 60px rgba(168,122,58,0.18)',
            border: currentTier === 'premium' ? `2px solid ${AMBER_LIGHT}` : '1.5px solid rgba(168,122,58,0.45)',
            position: 'relative',
          }}>
            {currentTier === 'premium' ? (
              <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: AMBER_LIGHT, color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                ★ ton offre actuelle
              </div>
            ) : (
              <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(45,42,36,0.12)', color: DARK, fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                ★ recommandé
              </div>
            )}
            <div style={{ marginBottom: 16 }}><BushGlyph /></div>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: TEXT_MUTED, marginBottom: 4 }}>buisson</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: DARK, marginBottom: 8 }}>Premium</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: DARK, marginBottom: 2 }}>
              {annual ? '8 €' : '10 €'} <span style={{ fontSize: 14, color: TEXT_MUTED }}>/ mois</span>
            </div>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: AMBER, marginBottom: 4 }}>
              {annual ? '« économise 24 €/an »' : '« 8 €/mois si annuel »'}
            </div>
            <p style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: 20 }}>Pour un apprentissage sans limites.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
              <FeatureItem included label="énergie illimitée" />
              <FeatureItem included label="sans publicité" />
              <FeatureItem included label="10 ateliers loisir" />
              <FeatureItem included label="générateur examen" />
              <FeatureItem included label="échange IA" />
              <FeatureItem included label="plantes exclusives" />
              <FeatureItem included label="1 joker/jour" />
              <FeatureItem included label="partage abonnement +2" />
              <FeatureItem included={false} label="sécurité renforcée" />
              <FeatureItem included={false} label="génération de cours" />
            </ul>
            <TierCTA tier="premium" current={currentTier} annual={annual} />
          </div>

          {/* Premium+ */}
          <div style={{ ...cardBase, background: DARK, border: currentTier === 'premium_plus' ? `2px solid ${AMBER_LIGHT}` : '1.5px solid rgba(232,216,168,0.2)' }}>
            {currentTier === 'premium_plus' && <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: AMBER_PALE, marginBottom: 12 }}>● ton offre actuelle</div>}
            <div style={{ marginBottom: 16 }}><TreeGlyph /></div>
            <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'rgba(244,240,230,0.45)', marginBottom: 4 }}>arbre</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#f4f0e6', marginBottom: 8 }}>Premium+</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#f4f0e6', marginBottom: 2 }}>
              {annual ? '20 €' : '25 €'} <span style={{ fontSize: 14, color: 'rgba(244,240,230,0.55)' }}>/ mois</span>
            </div>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: AMBER_PALE, marginBottom: 4 }}>
              {annual ? '« économise 60 €/an »' : '« 20 €/mois si annuel »'}
            </div>
            <p style={{ fontSize: 13, color: 'rgba(244,240,230,0.6)', marginBottom: 20 }}>Tout ce dont tu as besoin, sans compromis.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
              <FeatureItem included dark label="tout Premium" />
              <FeatureItem included dark label="sécurité renforcée examens" />
              <FeatureItem included dark label="caméra secondaire" />
              <FeatureItem included dark label="génération de cours" />
              <FeatureItem included dark label="intros auto (IA)" />
              <FeatureItem included dark label="examen final auto (IA)" />
              <FeatureItem included dark label="validation manuelle sections" />
              <FeatureItem included dark label="15 ateliers loisir" />
              <FeatureItem included dark label="1 joker/jour au choix" />
              <FeatureItem included dark label="partage abonnement +3" />
            </ul>
            <TierCTA tier="premium_plus" current={currentTier} annual={annual} dark />
          </div>
        </div>

        {/* Atelier Premium */}
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          background: 'linear-gradient(135deg, rgba(232,184,108,0.18), rgba(168,122,58,0.10))',
          border: '1.5px solid rgba(168,122,58,0.35)', borderRadius: 20, padding: '28px 32px',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', background: AMBER_LIGHT, color: '#fff', padding: '3px 10px', borderRadius: 100 }}>atelier premium</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', background: '#e05c3a', color: '#fff', padding: '3px 10px', borderRadius: 100 }}>irréversible</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 500, color: DARK, margin: '0 0 8px' }}>débloque ton atelier pour tous tes membres, à vie.</h3>
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: '0 0 4px' }}>
              Une activation unique qui offre l&apos;accès Premium à tous les membres actuels et futurs de ton atelier — sans abonnement personnel requis.
            </p>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 17, color: AMBER }}>« écoles, formations, équipes — c&apos;est pour vous. »</div>
          </div>
          <button onClick={() => alert('Disponible prochainement.')} style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: AMBER_LIGHT, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: "'Inter Tight', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap' }}>
            activer pour un atelier →
          </button>
        </div>

      </div>
    </>
  );
}
