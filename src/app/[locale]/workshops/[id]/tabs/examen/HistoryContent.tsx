'use client';

import { useTranslations } from 'next-intl';
import { palette, ink, withAlpha } from '@/lib/theme';
import { Settings, Copy, Download, FileText } from 'lucide-react';
import { type Exam, statusStyle, IconBtn } from './examShared';

// ---- HISTORY ----
function HistoryContent({ exams, justAddedId, onEdit, onNew, onDelete }: { exams: Exam[]; justAddedId: string | null; onEdit: (e: Exam) => void; onNew: () => void; onDelete: (e: Exam) => void }) {
  const t = useTranslations('examen');
  const statusLabel = (s: string): string => s === 'publié' ? t('status.publié') : s === 'brouillon' ? t('status.brouillon') : s === 'archivé' ? t('status.archivé') : s;
  return (
    <div style={{ padding: '20px 24px 24px', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink }}>{t('history.title')}</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft }}>{t('history.subtitle', { count: exams.length })}</div>
        </div>
        <button onClick={onNew} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: palette.ink, color: palette.parchment, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <span style={{ fontSize: 15 }}>+</span> {t('history.newExam')}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 0.8fr 1fr 1fr 1.1fr', gap: 12, padding: '0 14px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint }}>
        <span>{t('history.colExam')}</span><span>{t('history.colDate')}</span><span>{t('history.colQuestions')}</span><span>{t('history.colTakenBy')}</span><span>{t('history.colAvg')}</span><span style={{ textAlign: 'right' as const }}>{t('history.colActions')}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {exams.map(e => {
          const st = statusStyle(e.status);
          const hot = e.id === justAddedId;
          return (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 0.8fr 1fr 1fr 1.1fr', gap: 12, alignItems: 'center', padding: '14px', borderRadius: 12, background: hot ? withAlpha(palette.amberGlow, 0.18) : withAlpha(palette.paper, 0.8), border: hot ? '1.5px solid rgba(168,122,58,0.45)' : `1px solid ${ink(0.08)}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 36, height: 36, borderRadius: 9, background: ink(0.05), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={18} color={palette.amber} strokeWidth={1.75} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.fg }}>{statusLabel(e.status)}</span>
                </div>
              </div>
              <span style={{ fontSize: 12, color: palette.inkMuted }}>{e.date}</span>
              <span style={{ fontSize: 12.5, color: palette.ink, fontVariantNumeric: 'tabular-nums' }}>{e.q}</span>
              <span style={{ fontSize: 12, color: palette.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{e.taken > 0 ? t('history.takenMembers', { count: e.taken }) : '—'}</span>
              <span style={{ fontSize: 12.5, color: e.avg === '—' ? palette.inkGhost : palette.ink, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{e.avg}</span>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <IconBtn title={t('history.edit')} onClick={() => onEdit(e)}>
                  <Settings size={14} strokeWidth={1.75} />
                </IconBtn>
                <IconBtn title={t('history.duplicate')}><Copy size={14} strokeWidth={1.75} /></IconBtn>
                <IconBtn title={t('history.export')}><Download size={14} strokeWidth={1.75} /></IconBtn>
                <IconBtn title={t('history.deleteAction')} onClick={() => onDelete(e)}>
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2.5 4h9M5.5 4V2.5h3V4M5.5 6.5v4M8.5 6.5v4M3.5 4l.7 8h5.6l.7-8" stroke={palette.danger} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </IconBtn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HistoryContent;
