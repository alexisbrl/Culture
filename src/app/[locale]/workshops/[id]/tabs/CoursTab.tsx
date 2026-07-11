'use client';

import { palette } from '@/lib/theme';
import { useTranslations } from 'next-intl';

export default function CoursTab() {
  const t = useTranslations('cours');
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <svg width="120" height="92" viewBox="0 0 120 92" style={{ marginBottom: 18 }}>
          <rect x="14" y="10" width="92" height="60" rx="6" fill="#fff" stroke="rgba(45,42,36,0.14)" strokeWidth="1.4" />
          <rect x="14" y="10" width="92" height="14" rx="6" fill="rgba(232,184,108,0.4)" />
          <circle cx="22" cy="17" r="2" fill="#c89860" />
          <rect x="26" y="34" width="40" height="5" rx="2.5" fill="rgba(45,42,36,0.18)" />
          <rect x="26" y="44" width="64" height="4" rx="2" fill="rgba(45,42,36,0.10)" />
          <rect x="26" y="52" width="52" height="4" rx="2" fill="rgba(45,42,36,0.10)" />
          <polygon points="72,32 88,42 72,52" fill="#a87a3a" opacity="0.7" />
          <rect x="40" y="70" width="40" height="6" rx="3" fill="rgba(45,42,36,0.10)" />
        </svg>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: palette.amber, marginBottom: 8 }}>{t('comingV2')}</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500, color: palette.ink, letterSpacing: '-0.015em' }}>{t('title')}</h3>
        <p style={{ margin: 0, fontSize: 13.5, color: palette.inkMuted, lineHeight: 1.6 }}>
          {t('description')}
        </p>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 17, color: palette.amber, marginTop: 14 }}>{t('tagline')}</div>
      </div>
    </div>
  );
}
