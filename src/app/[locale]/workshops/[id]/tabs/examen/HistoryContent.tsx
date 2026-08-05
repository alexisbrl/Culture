'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, Check, Copy, Download, Filter, Plus, Search, Trash2 } from 'lucide-react';
import { palette, shadow, withAlpha } from '@/lib/theme';
import { type Exam, statusStyle } from './examShared';

type SortKey = 'recent' | 'ancien' | 'az';
type Status = 'brouillon' | 'publié' | 'archivé';
const STATUSES: Status[] = ['brouillon', 'publié', 'archivé'];

// ---- HISTORY — barre de recherche/tri/filtres toujours visible + cartes en
// mode dense (variante retenue, lignes 810-869 de App-Culture.dc.html : le
// prototype garde le tri sur l'ordre d'insertion — pas de vraie date en base
// pour les examens générés — donc « plus récents »/« plus anciens » se
// contentent d'inverser la liste, exactement comme le fait le getter réel
// `examsList` de la maquette). ----
function HistoryContent({ exams, justAddedId, onEdit, onNew, onDelete }: { exams: Exam[]; justAddedId: string | null; onEdit: (e: Exam) => void; onNew: () => void; onDelete: (e: Exam) => void }) {
  const t = useTranslations('examen');
  const statusLabel = (s: string): string => s === 'publié' ? t('status.publié') : s === 'brouillon' ? t('status.brouillon') : s === 'archivé' ? t('status.archivé') : s;

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const q = search.trim().toLowerCase();
  let filtered = exams
    .filter((e) => !q || e.title.toLowerCase().includes(q))
    .filter((e) => statusFilter.length === 0 || statusFilter.includes(e.status as Status));
  if (sort === 'ancien') filtered = [...filtered].reverse();
  else if (sort === 'az') filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  function toggleStatus(s: Status) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <div style={{ padding: '16px 16px 20px' }} onClick={() => { setSortOpen(false); setFilterOpen(false); }}>
      <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink, marginBottom: 2 }}>{t('history.title')}</div>
      <div style={{ fontSize: 12, color: palette.inkSoft, marginBottom: 12 }}>{t('history.subtitle', { count: exams.length })}</div>

      {/* Barre de recherche + tri + filtres — toujours visible (variante retenue) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: palette.surfaceInput, border: `1px solid ${palette.line}`, borderRadius: 10, padding: '8px 11px' }}>
          <Search size={15} strokeWidth={1.75} color={palette.inkFaint} style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: palette.ink }}
          />
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setSortOpen((v) => !v); setFilterOpen(false); }}
            title={t('history.sortTitle')}
            style={{
              cursor: 'pointer', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              border: `1px solid ${sortOpen || sort !== 'recent' ? palette.greenSoft : palette.lineStrong}`,
              background: sortOpen || sort !== 'recent' ? withAlpha(palette.green, 0.12) : palette.surfaceRaised,
              color: sortOpen || sort !== 'recent' ? palette.greenBrand : palette.inkMuted,
            }}
          >
            <ArrowUpDown size={16} strokeWidth={1.75} />
          </button>
          {sortOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 158, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg, padding: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: palette.inkFaint, padding: '6px 10px 4px' }}>{t('history.sortTitle').toUpperCase()}</div>
              {(['recent', 'ancien', 'az'] as SortKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => { setSort(key); setSortOpen(false); }}
                  style={{ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', fontSize: 13, fontWeight: 600, color: sort === key ? palette.greenBrand : palette.inkMuted, background: sort === key ? withAlpha(palette.green, 0.12) : 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                >
                  {t(`history.sort.${key}`)}
                  {sort === key && <Check size={13} strokeWidth={2.5} color={palette.greenBrand} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setFilterOpen((v) => !v); setSortOpen(false); }}
            title={t('history.filterTitle')}
            style={{
              cursor: 'pointer', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              border: `1px solid ${filterOpen || statusFilter.length > 0 ? palette.greenSoft : palette.lineStrong}`,
              background: filterOpen || statusFilter.length > 0 ? withAlpha(palette.green, 0.12) : palette.surfaceRaised,
              color: filterOpen || statusFilter.length > 0 ? palette.greenBrand : palette.inkMuted,
            }}
          >
            <Filter size={16} strokeWidth={1.75} />
          </button>
          {filterOpen && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 170, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg, padding: 5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: palette.inkFaint, padding: '6px 10px 4px' }}>{t('history.filterTitle').toUpperCase()}</div>
              {STATUSES.map((s) => {
                const on = statusFilter.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    style={{ cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', fontSize: 13, fontWeight: 600, color: on ? palette.greenBrand : palette.inkMuted, background: on ? withAlpha(palette.green, 0.12) : 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    {statusLabel(s)}
                    {on && <Check size={13} strokeWidth={2.5} color={palette.greenBrand} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={onNew}
          title={t('history.newExam')}
          style={{ cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, fontSize: 13, fontWeight: 600, padding: '9px 13px', borderRadius: 10, background: palette.green, border: 'none', color: palette.onGreen, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <Plus size={15} strokeWidth={2} />
          {t('history.newExam')}
        </button>
      </div>

      {/* Filtres actifs */}
      {statusFilter.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 9 }}>
          {statusFilter.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              style={{ cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '4px 8px 4px 11px', borderRadius: 999, background: withAlpha(palette.green, 0.12), border: `1px solid ${palette.greenSoft}`, color: palette.greenBrand, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {statusLabel(s)}
              <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Liste — une carte par examen, mode dense */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 12.5, color: palette.inkFaint, textAlign: 'center', padding: '20px 0' }}>
            {t('history.noResults')}
          </div>
        )}
        {filtered.map((e) => {
          const st = statusStyle(e.status);
          const hot = e.id === justAddedId;
          return (
            <div
              key={e.id}
              onClick={() => onEdit(e)}
              style={{
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 13px', borderRadius: 12,
                background: hot ? withAlpha(palette.gold, 0.14) : palette.surfaceRaised,
                border: hot ? `1.5px solid ${palette.gold}` : `1px solid ${palette.line}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, background: st.bg, color: st.fg, borderRadius: 6, padding: '3px 6px' }}>
                  {statusLabel(e.status)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: palette.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('history.colQuestions')} : {e.q} · {e.date}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }} onClick={(ev) => ev.stopPropagation()}>
                  {/* dupliquer/exporter : pas encore de fonction réelle derrière (déjà le cas avant ce chantier) — icônes décoratives conservées à l'identique */}
                  <button title={t('history.duplicate')} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, color: palette.inkMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <Copy size={13} strokeWidth={1.75} />
                  </button>
                  <button title={t('history.export')} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, color: palette.inkMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <Download size={13} strokeWidth={1.75} />
                  </button>
                  <button title={t('history.deleteAction')} onClick={() => onDelete(e)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, color: palette.inkMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default HistoryContent;
