'use client';

import { palette, ink, withAlpha } from '@/lib/theme';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { ListChecks } from 'lucide-react';
import type { Chapter } from '@/app/actions/workshopChapters';
import ParcoursQuestions from './programme/ParcoursQuestions';

// Un pot par chapitre de l'atelier. La plante reste enroulée sur elle-même : le
// « chemin » d'exercices dépliable a été retiré (19/07/2026) — il reposait sur
// des exercices factices, et on lance désormais un exercice par le bouton du
// pot. Le nombre de pots suit donc directement le nombre de chapitres.

const COL_W = 300;
const POT_ZONE = 168;

const P = { plantAccent: palette.greenSoft, plantDeep: palette.green };

function Pot({ glow = false }: { glow?: boolean }) {
  return (
    <svg width="146" height="104" viewBox="0 0 146 104" style={{ display: 'block', filter: glow ? 'drop-shadow(0 0 18px rgba(232,200,106,0.5))' : 'none' }}>
      <ellipse cx="73" cy="98" rx="58" ry="8" fill="rgba(45,42,36,0.18)" />
      <path d="M 16 36 L 130 36 L 119 96 Q 118 99 114 99 L 32 99 Q 28 99 27 96 Z" fill="#bd8158" />
      <path d="M 16 36 L 130 36 L 127 52 L 19 52 Z" fill="#a86f49" />
      <path d="M 16 36 L 130 36 L 119 96 Q 118 99 114 99 L 100 99 L 112 36 Z" fill="rgba(0,0,0,0.06)" />
      <rect x="10" y="26" width="126" height="16" rx="6" fill="#cf9069" />
      <rect x="10" y="26" width="126" height="6" rx="3" fill="#dca079" />
      <ellipse cx="73" cy="34" rx="56" ry="7" fill="#5a4634" />
      <ellipse cx="73" cy="33" rx="52" ry="5.5" fill="#6b5440" />
      {[22, 48, 96, 120].map((x, i) => <circle key={i} cx={x} cy={33 + (i % 2)} r="2" fill="#4a382a" opacity="0.6" />)}
    </svg>
  );
}

function spiralPath(cx: number, cy: number, turns: number, maxR: number) {
  const steps = turns * 36;
  let d = '';
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const ang = t * turns * Math.PI * 2 - Math.PI / 2;
    const r = maxR * (0.12 + 0.88 * t);
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.92;
    d += (s === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
  }
  return d;
}

function Leaf({ x, y, rot = 0, s = 1, color }: { x: number; y: number; rot?: number; s?: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 0 C 10 -10 24 -8 30 2 C 20 8 6 8 0 0 Z" fill={color} />
      <path d="M2 1 C 12 -3 22 -2 28 2" stroke="rgba(0,0,0,0.12)" strokeWidth="1" fill="none" />
    </g>
  );
}

function CoiledVine() {
  const cx = 150, cy = 86;
  return (
    <svg width={COL_W} height="180" viewBox={`0 0 ${COL_W} 180`} style={{ display: 'block' }}>
      <path d={`M ${cx} ${cy + 58} C ${cx - 4} 150, ${cx + 6} 160, ${cx} 178`} fill="none" stroke={P.plantAccent} strokeWidth="9" strokeLinecap="round" />
      <path d={spiralPath(cx, cy, 2.6, 52)} fill="none" stroke={P.plantAccent} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d={spiralPath(cx, cy, 2.6, 52)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeLinecap="round" />
      <Leaf x={cx + 44} y={cy - 8} rot={-18} s={1.05} color={P.plantDeep} />
      <Leaf x={cx - 60} y={cy + 30} rot={158} s={0.95} color={P.plantAccent} />
    </svg>
  );
}

function ChapterColumn({ chapter, index, workshopId, locale }: { chapter: Chapter; index: number; workshopId: string; locale: string }) {
  const t = useTranslations('programme');

  return (
    <div style={{ width: COL_W, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Une page dédiée plutôt qu'une modale : l'exercice tire sa question
              au chargement et enchaîne, il a besoin de toute la surface. */}
          <Link
            href={`/${locale}/workshops/${workshopId}/exercise/${chapter.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', background: palette.amber, color: palette.parchment, fontFamily: 'inherit', fontSize: 12, padding: '7px 12px', borderRadius: 999, marginBottom: 6, boxShadow: `0 8px 18px ${withAlpha(palette.amber, 0.34)}` }}
          >
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: withAlpha(palette.paper, 0.22), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▶</span>
            {t('startExercise')}
          </Link>
          <CoiledVine />
        </div>
      </div>

      <div style={{ height: POT_ZONE, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', zIndex: 5 }}>
        <svg width="40" height="34" viewBox="0 0 40 34" style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)' }}>
          <path d="M20 34 C 16 20, 24 14, 20 0" fill="none" stroke={P.plantAccent} strokeWidth="9" strokeLinecap="round" />
        </svg>
        <Pot />
        <div style={{ textAlign: 'center', marginTop: 6, maxWidth: COL_W - 40 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(index + 1).padStart(2, '0')} · {chapter.name}
          </div>
          <div style={{ fontSize: 11, color: palette.inkSoft, marginTop: 2 }}>{t('brickCount', { count: chapter.brickCount })}</div>
        </div>
      </div>
    </div>
  );
}

export default function ProgrammeTab({ chapters, workshopId, canManage }: { chapters: Chapter[]; workshopId: string; canManage: boolean }) {
  const t = useTranslations('programme');
  const locale = useLocale();
  const [page, setPage] = useState(0);
  // Gestion des questions du parcours : réservée aux gestionnaires, ouverte à
  // la place du décor des pots plutôt que dans une modale (l'éditeur de
  // question est haut et a besoin de toute la surface).
  const [showQuestions, setShowQuestions] = useState(false);
  const VISIBLE = 3;
  const maxPage = Math.max(0, chapters.length - VISIBLE);

  const left = Math.min(Math.max(0, page), maxPage);
  const offset = -left * COL_W;

  function navBtn(side: 'left' | 'right'): React.CSSProperties {
    return {
      position: 'absolute', top: '46%', [side]: 12, transform: 'translateY(-50%)',
      width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', zIndex: 9,
      border: `1px solid ${ink(0.12)}`, background: withAlpha(palette.paper, 0.9),
      color: palette.inkMuted, fontSize: 22, lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 6px 16px ${ink(0.16)}`, fontFamily: 'inherit',
    };
  }

  if (showQuestions) {
    return <ParcoursQuestions workshopId={workshopId} chapters={chapters} onBack={() => setShowQuestions(false)} />;
  }

  return (
    // minHeight requis : le panneau n'a que des enfants en position absolute (hauteur intrinsèque nulle) et le parent est en minHeight/auto — sans lui, la rangée s'effondre à 0 (page blanche)
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 22px 22px', height: '100%', minHeight: 560, boxSizing: 'border-box' as const }}>
      <style>{`
        @keyframes cv_cloud { 0% { transform: translateX(0); } 100% { transform: translateX(24px); } }
      `}</style>

      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={() => setShowQuestions(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <ListChecks size={13} strokeWidth={1.75} />
            {t('questions.open')}
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 18, overflow: 'hidden', border: `1px solid ${ink(0.07)}`, background: 'linear-gradient(180deg, #eef0dd 0%, #e6ecdc 46%, #dce7d2 100%)' }}>
        {/* sky / sun glow */}
        <div style={{ position: 'absolute', top: -70, right: -50, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(246,201,112,0.34), rgba(246,201,112,0) 70%)', pointerEvents: 'none' }} />
        <svg width="100%" height="120" style={{ position: 'absolute', top: 10, left: 0, pointerEvents: 'none' }}>
          <g style={{ animation: 'cv_cloud 11s ease-in-out infinite alternate' }} opacity="0.8">
            <ellipse cx="78%" cy="48" rx="70" ry="26" fill="#fff" />
            <ellipse cx="84%" cy="60" rx="46" ry="20" fill="#fff" />
          </g>
        </svg>

        {/* shelf / floor */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: POT_ZONE - 18, background: 'linear-gradient(180deg, #d8c3a0 0%, #c9b08a 30%, #bea271 100%)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: withAlpha(palette.paper, 0.25) }} />
          <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 10, background: ink(0.10) }} />
        </div>

        {chapters.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ fontFamily: "'Caveat', cursive", fontSize: 20, color: '#7a4d20' }}>{t('emptyTitle')}</div>
              <div style={{ fontSize: 12.5, color: palette.inkSoft, marginTop: 6 }}>{t('emptyDesc')}</div>
            </div>
          </div>
        ) : (
          <>
            {/* chapters track */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', transform: `translateX(${offset}px)`, transition: 'transform .45s cubic-bezier(.4,0,.2,1)', paddingLeft: 22 }}>
                {chapters.map((chapter, i) => (
                  <ChapterColumn key={chapter.id} chapter={chapter} index={i} workshopId={workshopId} locale={locale} />
                ))}
              </div>
            </div>

            {left > 0 && <button onClick={() => setPage((p) => Math.max(0, p - 1))} style={navBtn('left')}>‹</button>}
            {left < maxPage && <button onClick={() => setPage((p) => Math.min(maxPage, p + 1))} style={navBtn('right')}>›</button>}

            {/* chapter indicator */}
            <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {chapters.map((c, i) => (
                  <span key={c.id} style={{ width: i >= left && i < left + VISIBLE ? 16 : 7, height: 7, borderRadius: 999, background: i >= left && i < left + VISIBLE ? palette.amber : ink(0.2), transition: 'all .3s', display: 'inline-block' }} />
                ))}
              </div>
              <span style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#7a4d20' }}>
                {t('chapterIndicator', { from: left + 1, to: Math.min(chapters.length, left + VISIBLE), total: chapters.length })}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
