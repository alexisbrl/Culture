'use client';

import { useState, useRef, useEffect } from 'react';

const COL_W = 300;
const POT_ZONE = 168;
const SPACING = 92;

type ExState = 'done' | 'current' | 'locked';
type ExItem = { i: number; title: string; state: ExState; exam: boolean };
type Chapter = { id: string; n: number; label: string; total: number; done: number; ex: ExItem[]; status: 'done' | 'current' | 'locked' };

function makeEx(n: number, doneCount: number): ExItem[] {
  return Array.from({ length: n }, (_, i) => ({
    i,
    title: 'exercice ' + (i + 1),
    state: (i < doneCount ? 'done' : i === doneCount ? 'current' : 'locked') as ExState,
    exam: (i + 1) % 6 === 0,
  }));
}

const CHAPTERS: Chapter[] = [
  { id: 'c1', n: 1, label: '01 · La cellule', total: 14, done: 14, ex: makeEx(14, 14), status: 'done' },
  { id: 'c2', n: 2, label: '02 · Membrane', total: 16, done: 16, ex: makeEx(16, 16), status: 'done' },
  { id: 'c3', n: 3, label: '03 · Métabolisme', total: 18, done: 11, ex: makeEx(18, 11), status: 'current' },
  { id: 'c4', n: 4, label: '04 · Respiration', total: 24, done: 0, ex: makeEx(24, 0), status: 'locked' },
  { id: 'c5', n: 5, label: '05 · Division', total: 20, done: 0, ex: makeEx(20, 0), status: 'locked' },
];

const P = { plantAccent: '#7a9968', plantDeep: '#4f6b40' };

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

function CoiledVine({ status }: { status: string }) {
  const cx = 150, cy = 86;
  const faded = status === 'locked';
  const stroke = faded ? '#a7b79a' : P.plantAccent;
  return (
    <svg width={COL_W} height="180" viewBox={`0 0 ${COL_W} 180`} style={{ display: 'block', opacity: faded ? 0.55 : 1 }}>
      <path d={`M ${cx} ${cy + 58} C ${cx - 4} 150, ${cx + 6} 160, ${cx} 178`} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" />
      <path d={spiralPath(cx, cy, 2.6, 52)} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d={spiralPath(cx, cy, 2.6, 52)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeLinecap="round" />
      <Leaf x={cx + 44} y={cy - 8} rot={-18} s={1.05} color={faded ? '#b3c1a6' : P.plantDeep} />
      <Leaf x={cx - 60} y={cy + 30} rot={158} s={0.95} color={faded ? '#b3c1a6' : P.plantAccent} />
    </svg>
  );
}

function ExerciseNode({ ex, x }: { ex: ExItem; x: number }) {
  const isDone = ex.state === 'done';
  const isCur = ex.state === 'current';
  const isExam = ex.exam;
  const size = isCur ? 64 : 50;
  const bg = isDone ? (isExam ? '#c89860' : P.plantDeep) : isCur ? '#a87a3a' : 'rgba(255,255,255,0.6)';
  const ring = isCur ? '#e8c86a' : isDone ? 'rgba(255,255,255,0.75)' : 'rgba(45,42,36,0.14)';
  const style: React.CSSProperties = {
    position: 'absolute', left: x, top: 0, transform: 'translate(-50%, -50%)',
    width: size, height: size, borderRadius: '50%',
    background: bg, border: `3px solid ${ring}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: isDone || isCur ? '#fff' : '#9a948a',
    fontSize: isCur ? 22 : 17, textDecoration: 'none',
    cursor: isCur ? 'pointer' : 'default', zIndex: 4,
    boxShadow: isCur ? '0 10px 24px rgba(168,122,58,0.42), 0 0 0 8px rgba(232,200,106,0.16)' : isDone ? '0 6px 14px rgba(79,107,64,0.28)' : '0 3px 8px rgba(45,42,36,0.10)',
  };
  if (isCur) {
    return (
      <a href="#" style={style}>
        {isExam ? '◆' : '💧'}
        <span style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', background: '#2d2a24', color: '#f4f0e6', fontFamily: 'inherit', fontSize: 11, padding: '4px 9px', borderRadius: 8, whiteSpace: 'nowrap', boxShadow: '0 6px 14px rgba(45,42,36,0.22)' }}>prochain</span>
      </a>
    );
  }
  return (
    <div style={style}>
      {isExam ? (isDone ? '🏅' : '◆') : (isDone ? '✓' : '')}
    </div>
  );
}

function ChapterColumn({ ch, expanded, onToggle }: { ch: Chapter; expanded: boolean; onToggle: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const isDone = ch.status === 'done';
  const isLocked = ch.status === 'locked';

  const TOP_PAD = 96;
  const innerH = TOP_PAD + ch.ex.length * SPACING + 30;
  const nodeY = (i: number) => innerH - 30 - i * SPACING;
  const nodeX = (i: number) => 150 + (i % 2 === 0 ? -30 : 30);

  let vinePath = `M 150 ${innerH} `;
  for (let i = 0; i < ch.ex.length; i++) {
    const x = nodeX(i), y = nodeY(i);
    const px = i === 0 ? 150 : nodeX(i - 1), py = i === 0 ? innerH : nodeY(i - 1);
    const my = (py + y) / 2;
    vinePath += `C ${px} ${my}, ${x} ${my}, ${x} ${y} `;
  }

  const curIdx = ch.ex.findIndex(e => e.state === 'current');

  useEffect(() => {
    if (!expanded || !scroller.current) return;
    const el = scroller.current;
    const targetY = curIdx >= 0 ? nodeY(curIdx) : nodeY(ch.ex.length - 1);
    el.scrollTop = Math.max(0, targetY - el.clientHeight * 0.6);
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: COL_W, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {expanded ? (
          <>
            <div ref={scroller} style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              <div style={{ position: 'relative', height: innerH, width: COL_W }}>
                <svg width={COL_W} height={innerH} style={{ position: 'absolute', inset: 0 }}>
                  <path d={vinePath} fill="none" stroke={P.plantAccent} strokeWidth="11" strokeLinecap="round" />
                  <path d={vinePath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3.5" strokeLinecap="round" />
                  {ch.ex.map((e, i) => (i % 3 === 1) && (
                    <Leaf key={i} x={nodeX(i) + (i % 2 ? 16 : -42)} y={nodeY(i) - 8} rot={i % 2 ? -16 : 168} s={0.95} color={i < ch.done ? P.plantDeep : '#bcc8ad'} />
                  ))}
                </svg>
                {ch.ex.map((e, i) => (
                  <div key={i} style={{ position: 'absolute', top: nodeY(i), left: 0, width: COL_W }}>
                    <ExerciseNode ex={e} x={nodeX(i)} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 84, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(238,240,221,0.96) 42%, rgba(238,240,221,0) 100%)' }} />
              <svg width="100%" height="84" style={{ position: 'absolute', inset: 0 }}>
                <ellipse cx="96" cy="34" rx="62" ry="26" fill="#fff" opacity="0.92" />
                <ellipse cx="186" cy="44" rx="48" ry="22" fill="#fff" opacity="0.88" />
              </svg>
              <div style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', fontFamily: "'Caveat', cursive", fontSize: 15, color: '#8a8678' }}>« à venir »</div>
            </div>
          </>
        ) : (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {ch.status === 'current' && (
              <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', background: '#a87a3a', color: '#f4f0e6', fontFamily: 'inherit', fontSize: 12, padding: '7px 12px', borderRadius: 999, marginBottom: 6, boxShadow: '0 8px 18px rgba(168,122,58,0.34)' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▶</span>
                lancer le prochain
              </a>
            )}
            {isDone && <div style={{ marginBottom: 6, fontSize: 26, filter: 'drop-shadow(0 4px 8px rgba(200,152,96,0.4))' }}>🏅</div>}
            {isLocked && <div style={{ marginBottom: 6, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#9a948a', border: '2px solid rgba(45,42,36,0.12)' }}>🔒</div>}
            <CoiledVine status={ch.status} />
          </div>
        )}
      </div>

      <div style={{ height: POT_ZONE, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', zIndex: 5 }}>
        <svg width="40" height="34" viewBox="0 0 40 34" style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)' }}>
          <path d="M20 34 C 16 20, 24 14, 20 0" fill="none" stroke={isLocked ? '#a7b79a' : P.plantAccent} strokeWidth="9" strokeLinecap="round" opacity={isLocked ? 0.55 : 1} />
        </svg>
        <Pot glow={ch.status === 'current'} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <div style={{ textAlign: 'left' as const }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: isLocked ? '#9a948a' : '#2d2a24' }}>{ch.label}</div>
            <div style={{ fontSize: 11, color: '#7a766d' }}>{ch.done} / {ch.total} exercices</div>
          </div>
          <button onClick={onToggle} title={expanded ? 'enrouler' : 'dérouler'} style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: '1px solid rgba(45,42,36,0.16)', background: 'rgba(255,255,255,0.8)', color: '#5a564c', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>{expanded ? '⌃' : '⌄'}</button>
        </div>
        <div style={{ width: 150, height: 5, borderRadius: 3, background: 'rgba(45,42,36,0.10)', overflow: 'hidden', marginTop: 7 }}>
          <div style={{ width: (ch.done / ch.total * 100) + '%', height: '100%', background: isDone ? '#c89860' : P.plantAccent }} />
        </div>
      </div>
    </div>
  );
}

function SideCard() {
  return (
    <div style={{ width: 264, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 16, padding: '18px 18px 16px', textAlign: 'center', boxShadow: '0 8px 26px rgba(45,42,36,0.06)' }}>
        <div style={{ position: 'relative', width: 150, height: 140, margin: '0 auto' }}>
          <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', width: 92, height: 16, borderRadius: '50%', background: 'rgba(45,42,36,0.12)', filter: 'blur(4px)' }} />
          {/* Tree placeholder (paulownia-style SVG) */}
          <svg viewBox="0 0 100 130" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <rect x="44" y="80" width="12" height="40" rx="3" fill="#9e7a55" />
            <ellipse cx="50" cy="55" rx="32" ry="36" fill="#5a8040" />
            <ellipse cx="35" cy="65" rx="20" ry="22" fill="#6a9050" />
            <ellipse cx="65" cy="62" rx="22" ry="24" fill="#6a9050" />
            <ellipse cx="50" cy="40" rx="24" ry="26" fill="#7aa868" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginTop: 4 }}>Biologie cellulaire</div>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: '#a87a3a', marginTop: 1 }}>« paulownia · niveau 2 »</div>
        <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'rgba(45,42,36,0.07)', overflow: 'hidden' }}>
          <div style={{ width: '58%', height: '100%', background: P.plantAccent }} />
        </div>
        <div style={{ fontSize: 11, color: '#7a766d', marginTop: 6 }}>58 % du parcours · 6 briques pour niv. 3</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 16, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 10 }}>l&apos;atelier</div>
        {([['membres', '38 jardiniers'], ['propriétaire', 'Pr. C. Vaisse'], ['briques', '142 · 5 chapitres'], ['ta série', '12 jours 🔥']] as [string, string][]).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(45,42,36,0.05)', fontSize: 12.5 }}>
            <span style={{ color: '#7a766d' }}>{k}</span>
            <span style={{ color: '#2d2a24', fontWeight: 500 }}>{v}</span>
          </div>
        ))}
        <a href="#" style={{ display: 'block', textAlign: 'center', marginTop: 14, padding: '11px 14px', borderRadius: 10, background: P.plantDeep, color: '#f4f0e6', textDecoration: 'none', fontSize: 13, fontWeight: 500, boxShadow: '0 6px 16px rgba(79,107,64,0.28)' }}>continuer le parcours →</a>
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [['terminé', P.plantDeep], ['en cours', '#a87a3a'], ['à venir', 'rgba(45,42,36,0.18)']];
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 999, padding: '6px 14px', fontSize: 11.5, color: '#5a564c' }}>
      {items.map(([l, c]) => (
        <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}
        </span>
      ))}
    </div>
  );
}

export default function ProgrammeTab() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['c3']));
  const [page, setPage] = useState(2);
  const VISIBLE = 3;
  const maxPage = Math.max(0, CHAPTERS.length - VISIBLE);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const left = Math.min(Math.max(0, page - 1), maxPage);
  const offset = -left * COL_W;

  function navBtn(side: 'left' | 'right'): React.CSSProperties {
    return {
      position: 'absolute', top: '46%', [side]: 12, transform: 'translateY(-50%)',
      width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', zIndex: 9,
      border: '1px solid rgba(45,42,36,0.12)', background: 'rgba(255,255,255,0.9)',
      color: '#5a564c', fontSize: 22, lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 6px 16px rgba(45,42,36,0.16)', fontFamily: 'inherit',
    };
  }

  return (
    <div style={{ display: 'flex', gap: 18, padding: '18px 22px 22px', height: '100%', boxSizing: 'border-box' as const }}>
      <style>{`
        @keyframes cv_pulse { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.06); } }
        @keyframes cv_cloud { 0% { transform: translateX(0); } 100% { transform: translateX(24px); } }
      `}</style>
      <SideCard />

      <div style={{ flex: 1, position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(45,42,36,0.07)', background: 'linear-gradient(180deg, #eef0dd 0%, #e6ecdc 46%, #dce7d2 100%)' }}>
        {/* sky / sun glow */}
        <div style={{ position: 'absolute', top: -70, right: -50, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(246,201,112,0.34), rgba(246,201,112,0) 70%)', pointerEvents: 'none' }} />
        <svg width="100%" height="120" style={{ position: 'absolute', top: 10, left: 0, pointerEvents: 'none' }}>
          <g style={{ animation: 'cv_cloud 11s ease-in-out infinite alternate' }} opacity="0.8">
            <ellipse cx="78%" cy="48" rx="70" ry="26" fill="#fff" />
            <ellipse cx="84%" cy="60" rx="46" ry="20" fill="#fff" />
          </g>
        </svg>

        <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 8 }}><Legend /></div>

        {/* shelf / floor */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: POT_ZONE - 18, background: 'linear-gradient(180deg, #d8c3a0 0%, #c9b08a 30%, #bea271 100%)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.25)' }} />
          <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 10, background: 'rgba(45,42,36,0.10)' }} />
        </div>

        {/* chapters track */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', transform: `translateX(${offset}px)`, transition: 'transform .45s cubic-bezier(.4,0,.2,1)', paddingLeft: 22 }}>
            {CHAPTERS.map(ch => (
              <ChapterColumn key={ch.id} ch={ch} expanded={expanded.has(ch.id)} onToggle={() => toggle(ch.id)} />
            ))}
          </div>
        </div>

        {left > 0 && <button onClick={() => setPage(p => Math.max(0, p - 1))} style={navBtn('left')}>‹</button>}
        {left < maxPage && <button onClick={() => setPage(p => Math.min(maxPage + 1, p + 1))} style={navBtn('right')}>›</button>}

        {/* chapter indicator */}
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 8 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {CHAPTERS.map((c, i) => (
              <span key={c.id} style={{ width: i >= left && i < left + VISIBLE ? 16 : 7, height: 7, borderRadius: 999, background: i >= left && i < left + VISIBLE ? '#a87a3a' : 'rgba(45,42,36,0.2)', transition: 'all .3s', display: 'inline-block' }} />
            ))}
          </div>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#7a4d20' }}>chapitre {left + 1}–{Math.min(CHAPTERS.length, left + VISIBLE)} / {CHAPTERS.length}</span>
        </div>
      </div>
    </div>
  );
}
