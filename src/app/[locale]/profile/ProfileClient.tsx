'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
const DARK_BG = '#2d2a24';
const DARK_TEXT = '#f4f0e6';

function GardenerAvatar() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="58" fill="#f1ead4" />
      <ellipse cx="60" cy="100" rx="60" ry="14" fill="#cfd9c0" />
      <ellipse cx="60" cy="103" rx="60" ry="10" fill="#a8b896" />
      <ellipse cx="60" cy="98" rx="14" ry="3" fill="#000" opacity="0.18" />
      <rect x="54" y="80" width="5" height="18" rx="2" fill="#5a4838" />
      <rect x="61" y="80" width="5" height="18" rx="2" fill="#5a4838" />
      <path d="M 44 60 Q 60 56 76 60 L 78 84 Q 60 86 42 84 Z" fill="url(#tunic)" />
      <g transform="translate(86 66)">
        <rect x="-10" y="-6" width="14" height="8" rx="1.4" fill="#6e8a55" />
        <rect x="-10" y="-6" width="14" height="2" fill="#5a7245" />
        <path d="M 4 -3 L 11 -8 L 11 -1 Z" fill="#6e8a55" />
        <path
          d="M -10 -4 q -4 -2 -4 -6 q 0 -2 3 -2"
          fill="none"
          stroke="#5a7245"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
      <path d="M 76 62 Q 84 62 88 66" stroke="#7a9968" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M 44 62 Q 38 70 38 78" stroke="#7a9968" strokeWidth="6" strokeLinecap="round" fill="none" />
      <rect x="56" y="56" width="8" height="6" fill="#e8c8a4" />
      <ellipse cx="60" cy="50" rx="13" ry="14" fill="#f0d2ad" />
      <path d="M 47 46 Q 50 40 60 38 Q 70 40 73 46 Q 70 42 60 41 Q 50 42 47 46 Z" fill="#3a2a1c" />
      <path d="M 54 51 q 2 -1 4 0" stroke="#2d2a24" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M 62 51 q 2 -1 4 0" stroke="#2d2a24" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M 56 56 q 4 2 8 0" stroke="#2d2a24" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <ellipse cx="60" cy="38" rx="22" ry="5" fill="url(#hat)" />
      <ellipse cx="60" cy="34" rx="12" ry="6" fill="#c8b89a" />
      <ellipse cx="60" cy="32" rx="11" ry="3" fill="#a89878" />
      <rect x="50" y="35" width="20" height="2" fill="#a87a3a" opacity="0.85" />
      <defs>
        <linearGradient id="hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6c4a0" />
          <stop offset="1" stopColor="#a08a72" />
        </linearGradient>
        <linearGradient id="tunic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a9968" />
          <stop offset="1" stopColor="#4f6b40" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.7)',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 500, color: '#2d2a24', lineHeight: 1.1 }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: '#8a7f72' }}>{label}</span>
    </div>
  );
}

export default function ProfileClient({ locale, uniqueId, firstName, lastName }: Props) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Jardinier';
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);
  useEffect(() => { setAvatarConfig(loadAvatarConfig()); }, []);

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
        style={{ background: '#fcf9f2', minHeight: '100vh', padding: '28px 24px 48px' }}
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
            jardin
          </Link>
          <span>›</span>
          <span style={{ color: '#5a4838' }}>profil</span>
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
                color: '#a87a3a',
                marginBottom: 2,
              }}
            >
              bonjour {firstName || 'jardinier'},
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#2d2a24', marginBottom: 10 }}>
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
                  background: 'rgba(232,184,108,0.25)',
                  color: '#a87a3a',
                  padding: '3px 10px',
                  borderRadius: 8,
                  fontWeight: 500,
                }}
              >
                ★ Premium
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#8a7f72', marginBottom: 16 }}>
              jardinier depuis mars 2026
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="profile-btn-dark">éditer le profil</button>
              <Link href={`/${locale}/profile/avatar`} className="profile-btn-ghost">
                éditer l&apos;avatar
              </Link>
              <button className="profile-btn-ghost">partager mon jardin</button>
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
            <StatCard value={12} label="jours de série" />
            <StatCard value={5} label="ateliers actifs" />
            <StatCard value={5} label="plantes vivantes" />
            <StatCard value="2 480" label="questions répondues" />
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
              border: '1.5px solid rgba(232,184,108,0.4)',
              borderRadius: 18,
              padding: '22px 24px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#a87a3a',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 6,
              }}
            >
              abonnement
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#2d2a24', marginBottom: 10 }}>
              ★ Premium · 10 €/mois
            </div>
            <div style={{ fontSize: 13, color: '#5a4838', lineHeight: 1.6, marginBottom: 16 }}>
              Énergie illimitée · Sans publicités · Générateur d&apos;examen inclus · Échange IA en
              cours d&apos;apprentissage · Partage avec 2 personnes
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href={`/${locale}/pricing`} className="profile-btn-dark">
                gérer l&apos;abonnement →
              </Link>
              <button className="profile-btn-ghost">partager (2 places)</button>
            </div>
          </div>

          {/* Watering can / energy card */}
          <div
            style={{
              background: 'rgba(255,255,255,0.6)',
              border: '1.5px solid rgba(90,72,56,0.12)',
              borderRadius: 18,
              padding: '22px 24px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#a87a3a',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 12,
              }}
            >
              arrosoir du jour
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
                    background: i < 8 ? '#7a9968' : 'rgba(122,153,104,0.18)',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 13, color: '#5a4838', fontWeight: 500, marginBottom: 4 }}>
              8 sessions aujourd&apos;hui
            </div>
            <div style={{ fontSize: 12, color: '#a89880' }}>prochain joker dans 4 h</div>
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
                examen officiel
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
              Page publique de certification
            </div>
            <div style={{ fontSize: 13, color: 'rgba(244,240,230,0.65)', lineHeight: 1.6 }}>
              Récapitule tous vos examens standardisés officiels. Partageable publiquement via lien
              ou QR code. Disponible à partir de la version 3.
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
                jardiniers amis
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
              Ajoutez des amis via leur tag et suivez leur progression. Disponible en version 2.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
