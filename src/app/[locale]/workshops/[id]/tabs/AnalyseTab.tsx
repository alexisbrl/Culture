'use client';

const KPIS = [
  { v: '38', l: 'membres', sub: '+5 ce mois', tone: '#7a9968' },
  { v: '61 %', l: 'progression moyenne', sub: '+4 pts / 7 j', tone: '#c89860' },
  { v: '118', l: 'briques maîtrisées (moy.)', sub: 'sur 142', tone: '#9eb3b9' },
  { v: '14,2/20', l: 'note moyenne examens', sub: '3 examens passés', tone: '#a890b8' },
];

const MEMBERS = [
  { name: 'Claire V.', role: 'propriétaire', section: 'terminé', pct: 100, last: "aujourd'hui", note: '19,5', toneA: '#b8c8a4', toneB: '#7a9968' },
  { name: 'Marie L.', role: 'gestionnaire', section: '05 · Golgi', pct: 84, last: 'il y a 2 h', note: '16,0', toneA: '#e8c8a4', toneB: '#b89a8a' },
  { name: 'Lucas B.', role: 'membre', section: '03 · Mitochondrie', pct: 58, last: 'hier', note: '13,5', toneA: '#c8c0b0', toneB: '#8c8170' },
  { name: 'Théo P.', role: 'membre', section: '03 · Mitochondrie', pct: 52, last: 'il y a 3 j', note: '12,0', toneA: '#d6c4e0', toneB: '#a890b8' },
  { name: 'Pauline R.', role: 'membre', section: '02 · Cytosquelette', pct: 38, last: "aujourd'hui", note: '—', toneA: '#a8c8be', toneB: '#7a9c92' },
  { name: 'Alex M.', role: 'toi', section: '03 · Mitochondrie', pct: 41, last: 'maintenant', note: '14,0', toneA: '#c8b89a', toneB: '#9e8d72' },
];

const SECTIONS = [
  { n: '01', name: 'Membrane plasmique', mastery: 0.96 },
  { n: '02', name: 'Cytosquelette', mastery: 0.78 },
  { n: '03', name: 'Mitochondrie', mastery: 0.54 },
  { n: '04', name: 'Réticulum', mastery: 0.31 },
  { n: '05', name: 'Golgi & lysosomes', mastery: 0.18 },
  { n: '06', name: 'Noyau & division', mastery: 0.08 },
];

const DIST = [4, 9, 14, 7, 3, 1];

function heatColor(m: number) {
  if (m >= 0.8) return '#4f6b40';
  if (m >= 0.6) return '#7a9968';
  if (m >= 0.4) return '#a8bd8e';
  if (m >= 0.2) return '#cdd9b6';
  return '#e6ead9';
}

function ACard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 14, padding: '16px 18px', ...style }}>
      {children}
    </div>
  );
}

function AKicker({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 12 }}>
      {children}
    </div>
  );
}

export default function AnalyseTab() {
  const plantAccent = '#7a9968';

  return (
    <div style={{ padding: '18px 22px 24px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' as const }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#2d2a24' }}>Tableau de bord</div>
          <div style={{ fontSize: 12, color: '#7a766d' }}>vue gestionnaire · 38 membres · mis à jour il y a 5 min</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['7 jours', '30 jours', 'tout'].map((p, i) => (
            <button key={p} style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: i === 1 ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: i === 1 ? '#2d2a24' : 'rgba(255,255,255,0.7)', color: i === 1 ? '#f4f0e6' : '#3a352c' }}>{p}</button>
          ))}
          <button style={{ fontSize: 11.5, padding: '5px 12px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>exporter CSV</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        {KPIS.map((k, i) => (
          <ACard key={i} style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: k.tone, display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#7a766d' }}>{k.l}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 500, color: '#2d2a24', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
            <div style={{ fontSize: 11, color: '#5a8a4a', marginTop: 2 }}>{k.sub}</div>
          </ACard>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Mastery heatmap */}
        <ACard>
          <AKicker>maîtrise par section (moyenne du groupe)</AKicker>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SECTIONS.map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9a948a', width: 18 }}>{s.n}</span>
                <span style={{ fontSize: 12.5, color: '#2d2a24', width: 150 }}>{s.name}</span>
                <div style={{ flex: 1, height: 16, borderRadius: 5, background: 'rgba(45,42,36,0.05)', overflow: 'hidden' }}>
                  <div style={{ width: `${s.mastery * 100}%`, height: '100%', background: heatColor(s.mastery), borderRadius: 5 }} />
                </div>
                <span style={{ fontSize: 12, color: '#2d2a24', fontWeight: 500, width: 38, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{Math.round(s.mastery * 100)}%</span>
              </div>
            ))}
          </div>
        </ACard>

        {/* Distribution */}
        <ACard>
          <AKicker>répartition · section en cours</AKicker>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, paddingTop: 10 }}>
            {DIST.map((d, i) => {
              const max = Math.max(...DIST);
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, color: '#2d2a24', fontWeight: 500 }}>{d}</span>
                  <div style={{ width: '100%', height: `${(d / max) * 100}%`, background: i === 2 ? '#a87a3a' : plantAccent, borderRadius: '5px 5px 0 0', minHeight: 4 }} />
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#9a948a' }}>{SECTIONS[i]?.n}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#a87a3a', marginTop: 10, textAlign: 'center' as const }}>« le gros du groupe est sur la mitochondrie »</div>
        </ACard>
      </div>

      {/* Members table */}
      <ACard style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(45,42,36,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#2d2a24' }}>Progression par membre</span>
          <span style={{ fontSize: 11, color: '#7a766d' }}>6 sur 38 · trier par progression ▾</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 2fr 1fr 0.8fr', gap: 12, padding: '8px 18px', background: 'rgba(45,42,36,0.03)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a' }}>
          <span>membre</span><span>section en cours</span><span>progression</span><span>dernière activité</span><span style={{ textAlign: 'right' as const }}>note</span>
        </div>
        {MEMBERS.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 2fr 1fr 0.8fr', gap: 12, padding: '11px 18px', alignItems: 'center', borderBottom: i === MEMBERS.length - 1 ? 'none' : '1px solid rgba(45,42,36,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${m.toneA}, ${m.toneB})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{m.name[0]}</div>
              <div>
                <div style={{ fontSize: 12.5, color: '#2d2a24', fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 10, color: '#9a948a' }}>{m.role}</div>
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#5a564c' }}>{m.section}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(45,42,36,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${m.pct}%`, height: '100%', background: m.pct === 100 ? '#4f6b40' : plantAccent }} />
              </div>
              <span style={{ fontSize: 11.5, color: '#2d2a24', fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' as const }}>{m.pct}%</span>
            </div>
            <span style={{ fontSize: 11.5, color: '#7a766d' }}>{m.last}</span>
            <span style={{ fontSize: 12.5, color: m.note === '—' ? '#bdb8ad' : '#2d2a24', fontWeight: 500, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{m.note}</span>
          </div>
        ))}
      </ACard>
    </div>
  );
}
