'use client';

import { useTranslations } from 'next-intl';
import { palette, ink } from '@/lib/theme';
import { MOCK_BRICKS, DotRow, Row, SmallBtn, SectionCard } from './settingsShared';

export default function BricksSection() {
  const t = useTranslations('settings');
  return (
    <>
        {/* ── 4. Briques de connaissance ── */}
        <SectionCard
          title={t('bricks.title')}
          description={t('bricks.desc')}
        >
          <Row label={t('bricks.sourceFiles')} noBorder={false}>
            <div style={{ display: 'flex', gap: 8 }}>
              <SmallBtn tone="ghost">{t('bricks.manageFiles')}</SmallBtn>
              <SmallBtn tone="dark">{t('bricks.regenAI')}</SmallBtn>
            </div>
          </Row>

          {/* Bricks list */}
          <div style={{ marginTop: 4 }}>
            {MOCK_BRICKS.map((brick, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0',
                  borderBottom:
                    i < MOCK_BRICKS.length - 1 ? '1px solid rgba(45,42,36,0.06)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#b8b1a6',
                    fontFamily: 'ui-monospace, monospace',
                    width: 24,
                    flexShrink: 0,
                  }}
                >
                  {brick.section}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: palette.ink,
                      marginBottom: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {brick.title}
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <DotRow label={t('bricks.diff')} value={brick.diff} max={10} />
                    <DotRow label={t('bricks.imp')} value={brick.imp} max={10} />
                  </div>
                </div>
                <SmallBtn tone="ghost">{t('bricks.edit')}</SmallBtn>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12,
              borderTop: `1px solid ${ink(0.06)}`,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: palette.inkFaint }}>{t('bricks.shownCount', { shown: 5, total: 142 })}</span>
            <SmallBtn tone="ghost">{t('bricks.viewAll')}</SmallBtn>
          </div>
        </SectionCard>
    </>
  );
}
