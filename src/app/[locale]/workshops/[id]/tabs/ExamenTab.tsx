'use client';

import { useState, useRef, useLayoutEffect } from 'react';

// ---- shared data ----
const LABELS = [
  { id: 'all', name: 'toutes', count: 142, color: '#7a766d' },
  { id: 'membr', name: 'membrane', count: 24, color: '#7a9968' },
  { id: 'cyto', name: 'cytosquelette', count: 28, color: '#c89860' },
  { id: 'mito', name: 'mitochondrie', count: 31, color: '#9eb3b9' },
  { id: 'noyau', name: 'noyau', count: 22, color: '#a890b8' },
  { id: 'examQ', name: 'tombé en examen', count: 18, color: '#b85a4a' },
];

const QUESTIONS = [
  { id: 'q1', type: 'QCM', diff: 7, labels: ['mitochondrie'], q: "Quelle structure produit la majorité de l'ATP par phosphorylation oxydative ?", a: 'La mitochondrie — via la chaîne respiratoire de la membrane interne.' },
  { id: 'q2', type: 'Vrai/Faux', diff: 4, labels: ['membrane'], q: "La membrane plasmique est une bicouche lipidique imperméable à l'eau.", a: "Faux — elle est semi-perméable ; l'eau traverse via les aquaporines." },
  { id: 'q3', type: 'Ouverte', diff: 8, labels: ['mitochondrie', 'tombé en examen'], q: 'Décrivez les trois étapes de la respiration cellulaire aérobie.', a: 'Glycolyse (cytosol) → cycle de Krebs (matrice) → chaîne respiratoire (membrane interne).' },
  { id: 'q4', type: 'QCM', diff: 5, labels: ['cytosquelette'], q: "Quel filament est responsable de la contraction cellulaire ?", a: "Les microfilaments d'actine." },
  { id: 'q5', type: 'Appariement', diff: 6, labels: ['cytosquelette'], q: 'Associez chaque élément du cytosquelette à sa fonction.', a: 'Actine→contraction · Microtubules→transport · Filaments intermédiaires→soutien.' },
  { id: 'q6', type: 'QCM', diff: 9, labels: ['mitochondrie', 'tombé en examen'], q: 'Où se déroule le cycle de Krebs ?', a: 'Dans la matrice mitochondriale.' },
  { id: 'q7', type: 'Vrai/Faux', diff: 3, labels: ['membrane'], q: 'Les protéines membranaires assurent le transport sélectif.', a: 'Vrai.' },
  { id: 'q8', type: 'QCM', diff: 6, labels: ['noyau'], q: "Quel processus précède la division cellulaire ?", a: "La réplication de l'ADN durant la phase S." },
];

type Exam = { id: string; title: string; date: string; q: number; dur: string; avg: string; status: string; taken: number };

const INITIAL_EXAMS: Exam[] = [
  { id: 'e1', title: 'Partiel — Biologie cellulaire', date: '12 mai 2026', q: 24, dur: '45 min', avg: '14,2/20', status: 'publié', taken: 38 },
  { id: 'e2', title: 'Quiz éclair — Mitochondrie', date: '4 mai 2026', q: 10, dur: '12 min', avg: '16,0/20', status: 'publié', taken: 31 },
  { id: 'e3', title: 'Rattrapage — Membrane', date: '28 avr. 2026', q: 18, dur: '30 min', avg: '11,5/20', status: 'archivé', taken: 7 },
  { id: 'e4', title: 'Éval. diagnostique', date: '15 avr. 2026', q: 12, dur: '15 min', avg: '—', status: 'brouillon', taken: 0 },
];

// ---- small helpers ----
function TypePill({ type }: { type: string }) {
  const c = ({ QCM: '#7a9968', 'Vrai/Faux': '#c89860', Ouverte: '#9eb3b9', Appariement: '#a890b8' } as Record<string, string>)[type] || '#7a766d';
  return <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: `${c}28`, color: '#3a352c', letterSpacing: '0.02em' }}>{type}</span>;
}

function Diff({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 9, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>diff</span>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < Math.ceil(n / 2) ? '#a87a3a' : 'rgba(45,42,36,0.12)', display: 'inline-block' }} />)}
    </span>
  );
}

function statusStyle(s: string) {
  return ({ publié: { bg: 'rgba(122,153,104,0.20)', fg: '#3f5630' }, brouillon: { bg: 'rgba(232,184,108,0.22)', fg: '#7a4d20' }, archivé: { bg: 'rgba(45,42,36,0.07)', fg: '#7a766d' } } as Record<string, { bg: string; fg: string }>)[s] ?? { bg: 'rgba(45,42,36,0.07)', fg: '#7a766d' };
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button title={title} onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(45,42,36,0.12)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{children}</button>
  );
}

// ---- HISTORY ----
function HistoryContent({ exams, justAddedId, onEdit, onNew }: { exams: Exam[]; justAddedId: string | null; onEdit: (e: Exam) => void; onNew: () => void }) {
  return (
    <div style={{ padding: '20px 24px 24px', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24' }}>Examens générés</div>
          <div style={{ fontSize: 12.5, color: '#7a766d' }}>{exams.length} examens · historique de l&apos;atelier</div>
        </div>
        <button onClick={onNew} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#2d2a24', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <span style={{ fontSize: 15 }}>+</span> nouvel examen
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 0.8fr 1fr 1fr 1.1fr', gap: 12, padding: '0 14px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a' }}>
        <span>examen</span><span>date</span><span>questions</span><span>passé par</span><span>note moy.</span><span style={{ textAlign: 'right' as const }}>actions</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {exams.map(e => {
          const st = statusStyle(e.status);
          const hot = e.id === justAddedId;
          return (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 0.8fr 1fr 1fr 1.1fr', gap: 12, alignItems: 'center', padding: '14px', borderRadius: 12, background: hot ? 'rgba(232,184,108,0.18)' : 'rgba(255,255,255,0.8)', border: hot ? '1.5px solid rgba(168,122,58,0.45)' : '1px solid rgba(45,42,36,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(45,42,36,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="20" viewBox="0 0 18 20"><path d="M2 1h9l5 5v13H2Z" fill="#fff" stroke="rgba(45,42,36,0.3)" strokeWidth="1"/><path d="M11 1v5h5" fill="none" stroke="rgba(45,42,36,0.3)" strokeWidth="1"/><line x1="5" y1="10" x2="13" y2="10" stroke="#a87a3a" strokeWidth="1.2"/><line x1="5" y1="13" x2="13" y2="13" stroke="rgba(45,42,36,0.25)" strokeWidth="1.2"/><line x1="5" y1="16" x2="10" y2="16" stroke="rgba(45,42,36,0.25)" strokeWidth="1.2"/></svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: '#2d2a24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.fg }}>{e.status}</span>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#5a564c' }}>{e.date}</span>
              <span style={{ fontSize: 12.5, color: '#2d2a24', fontVariantNumeric: 'tabular-nums' }}>{e.q}</span>
              <span style={{ fontSize: 12, color: '#5a564c', fontVariantNumeric: 'tabular-nums' }}>{e.taken > 0 ? `${e.taken} membres` : '—'}</span>
              <span style={{ fontSize: 12.5, color: e.avg === '—' ? '#bdb8ad' : '#2d2a24', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{e.avg}</span>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <IconBtn title="modifier" onClick={() => onEdit(e)}>
                  <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6L11 11M11 3L9.6 4.4M4.4 9.6L3 11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                </IconBtn>
                <IconBtn title="dupliquer"><svg width="14" height="14" viewBox="0 0 14 14"><rect x="3.5" y="3.5" width="7" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M2 9V2.6A1 1 0 0 1 3 1.6h5" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg></IconBtn>
                <IconBtn title="exporter"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v7M4 6l3 3 3-3M2.5 11.5h9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg></IconBtn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- BANK ----
function BankContent({ selected, onToggle, openId, setOpenId, activeLabel, setActiveLabel }: { selected: string[]; onToggle: (id: string) => void; openId: string | null; setOpenId: (id: string | null) => void; activeLabel: string; setActiveLabel: (l: string) => void }) {
  return (
    <div style={{ padding: '20px 24px 24px', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24' }}>Banque de questions</div>
          <div style={{ fontSize: 12.5, color: '#7a766d' }}>142 questions générées depuis 4 fichiers source · {selected.length} sélectionnées</div>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#a87a3a', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', boxShadow: '0 6px 16px rgba(168,122,58,0.28)' }}>
          <span style={{ fontSize: 14 }}>✦</span> générer par IA
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {LABELS.map(l => (
          <button key={l.id} onClick={() => setActiveLabel(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: activeLabel === l.id ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: activeLabel === l.id ? '#2d2a24' : 'rgba(255,255,255,0.7)', color: activeLabel === l.id ? '#f4f0e6' : '#3a352c' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, display: 'inline-block' }} />{l.name}<span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{l.count}</span>
          </button>
        ))}
        <button style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 999, border: '1px dashed rgba(45,42,36,0.20)', background: 'transparent', color: '#7a766d', cursor: 'pointer', fontFamily: 'inherit' }}>+ libellé</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 9 }}>
          <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5" stroke="#7a766d" strokeWidth="1.4" fill="none" /><line x1="10" y1="10" x2="14" y2="14" stroke="#7a766d" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <span style={{ fontSize: 12.5, color: '#9a948a' }}>filtrer les questions…</span>
        </div>
        <button style={{ fontSize: 12, padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>trier · difficulté ▾</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {QUESTIONS.map(q => {
          const isSel = selected.includes(q.id);
          const open = openId === q.id;
          return (
            <div key={q.id} style={{ border: isSel ? '1px solid rgba(122,153,104,0.4)' : '1px solid rgba(45,42,36,0.08)', background: isSel ? 'rgba(122,153,104,0.07)' : 'rgba(255,255,255,0.8)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                <div onClick={() => onToggle(q.id)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1, cursor: 'pointer', border: isSel ? 'none' : '1.5px solid rgba(45,42,36,0.18)', background: isSel ? '#7a9968' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{isSel ? '✓' : ''}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: '#2d2a24', lineHeight: 1.45, marginBottom: 8 }}>{q.q}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <TypePill type={q.type} />
                    <Diff n={q.diff} />
                    {q.labels.map(l => <span key={l} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(45,42,36,0.05)', color: '#5a564c' }}>#{l}</span>)}
                    <button onClick={() => setOpenId(open ? null : q.id)} style={{ marginLeft: 'auto', fontSize: 11, color: '#a87a3a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{open ? 'masquer la réponse ▴' : 'voir la réponse ▾'}</button>
                  </div>
                  {open && <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(232,216,168,0.22)', borderRadius: 8, fontSize: 12.5, color: '#3a352c', lineHeight: 1.5 }}><span style={{ fontWeight: 600, color: '#7a4d20' }}>réponse · </span>{q.a}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- GENERATOR ----
function GeneratorContent({ selected, editing, onCancelEdit, onGenerate }: { selected: string[]; editing: Exam | null; onCancelEdit: () => void; onGenerate: () => void }) {
  const chosen = QUESTIONS.filter(q => selected.includes(q.id));
  return (
    <div style={{ padding: '20px 24px 24px', minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#fbf7ef' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24' }}>Générer un examen</div>
        <div style={{ fontSize: 12.5, color: '#7a766d' }}>assemble les questions retenues en un examen prêt à diffuser</div>
      </div>
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(232,184,108,0.18)', border: '1px solid rgba(168,122,58,0.35)', marginBottom: 14 }}>
          <span style={{ fontSize: 14, color: '#a87a3a' }}>✎</span>
          <div style={{ flex: 1, fontSize: 12.5, color: '#3a352c' }}>Modification de <b style={{ fontWeight: 600 }}>{editing.title}</b></div>
          <button onClick={onCancelEdit} style={{ fontSize: 11.5, color: '#7a4d20', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>annuler ✕</button>
        </div>
      )}
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 6 }}>intitulé</div>
      <input key={editing ? editing.id : 'new'} defaultValue={editing ? editing.title : 'Partiel · Biologie cellulaire'} style={{ width: '100%', fontSize: 15, fontWeight: 500, color: '#2d2a24', border: '1px solid rgba(45,42,36,0.12)', borderRadius: 9, padding: '10px 12px', marginBottom: 16, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {([['questions', `${chosen.length}`], ['durée', '45 min'], ['mélange', 'activé'], ['barème', 'auto /20']] as [string, string][]).map(([k, v]) => (
          <div key={k} style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{k}</div>
            <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 8 }}>questions retenues</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, minHeight: 80 }}>
        {chosen.length === 0 && <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: '#a87a3a', padding: '12px 0' }}>« coche des questions dans la banque pour les ajouter ici »</div>}
        {chosen.map((q, i) => (
          <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(252,249,242,0.9)', border: '1px solid rgba(45,42,36,0.06)', borderRadius: 9 }}>
            <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
            <TypePill type={q.type} />
            <span style={{ flex: 1, fontSize: 12.5, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.q}</span>
            <span style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
          </div>
        ))}
      </div>
      <button onClick={onGenerate} style={{ padding: '13px 18px', borderRadius: 11, background: '#4f6b40', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 8, boxShadow: '0 8px 20px rgba(79,107,64,0.28)' }}>
        {editing ? 'enregistrer les modifications →' : "générer l'examen →"}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, padding: '9px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>aperçu</button>
        <button style={{ flex: 1, padding: '9px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>exporter PDF</button>
      </div>
    </div>
  );
}

// ---- PANEL TITLES ----
const META: Record<string, string> = { history: 'Examen généré', bank: 'Banque de questions', generator: "Générer un examen" };
const IDS = ['history', 'bank', 'generator'] as const;
type PanelId = typeof IDS[number];

// ---- MAIN EXAMEN TAB ----
export default function ExamenTab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevRects = useRef<Record<string, { l: number; t: number; w: number; h: number }>>({});
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [order, setOrder] = useState<PanelId[]>(['history', 'bank', 'generator']);
  const [exams, setExams] = useState<Exam[]>(INITIAL_EXAMS);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [selected, setSelected] = useState(['q1', 'q2', 'q4']);
  const [openId, setOpenId] = useState<string | null>('q1');
  const [activeLabel, setActiveLabel] = useState('all');

  const GAP = 16;
  const SIDE_W = 320;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w > 0 && h > 0) {
        setDim(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
        if (ro) { ro.disconnect(); ro = null; }
      }
    };
    measure();
    ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, []);

  useLayoutEffect(() => {
    IDS.forEach(id => {
      const el = tileRefs.current[id];
      if (!el) return;
      const nr = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      const pr = prevRects.current[id];
      prevRects.current[id] = nr;
      if (!pr || !nr.w || !nr.h) return;
      const dx = pr.l - nr.l, dy = pr.t - nr.t;
      const sx = pr.w / nr.w, sy = pr.h / nr.h;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.004 && Math.abs(sy - 1) < 0.004) return;
      if (typeof el.animate !== 'function') return;
      el.animate([
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: 'top left', transform: 'translate(0px, 0px) scale(1, 1)' },
      ], { duration: 480, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
    });
  });

  function focus(id: PanelId) {
    setOrder(prev => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const n = [...prev];
      const tmp = n[0]; n[0] = n[i]; n[i] = tmp;
      return n;
    });
  }

  function handleGenerate() {
    const id = 'e' + Date.now();
    const title = editing ? editing.title : 'Partiel · Biologie cellulaire';
    setExams(prev => {
      if (editing) {
        const rest = prev.filter(e => e.id !== editing.id);
        const existing = prev.find(e => e.id === editing.id);
        return [{ ...existing!, date: "aujourd'hui", q: selected.length }, ...rest];
      }
      return [{ id, title, date: "aujourd'hui", q: selected.length, dur: '45 min', avg: '—', status: 'brouillon', taken: 0 }, ...prev];
    });
    const hotId = editing ? editing.id : id;
    setJustAdded(hotId);
    setEditing(null);
    focus('history');
    setTimeout(() => setJustAdded(cur => cur === hotId ? null : cur), 2600);
  }

  function rectFor(role: number) {
    const { w, h } = dim;
    const mainW = Math.max(360, w - SIDE_W - GAP);
    const sideH = (h - GAP) / 2;
    if (role === 0) return { x: 0, y: 0, w: mainW, h, main: true };
    if (role === 1) return { x: mainW + GAP, y: 0, w: SIDE_W, h: sideH, main: false };
    return { x: mainW + GAP, y: sideH + GAP, w: SIDE_W, h: sideH, main: false };
  }

  const mainW = Math.max(360, dim.w - SIDE_W - GAP);
  const ready = dim.w > 0 && dim.h > 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes examPop { 0% { background: rgba(232,184,108,0.42); } 100% { } }`}</style>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '14px 22px 12px', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24' }}>Génération d&apos;examen</span>
        <span style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#a87a3a' }}>« clique une vignette pour l&apos;agrandir »</span>
      </div>
      <div ref={stageRef} style={{ flex: 1, position: 'relative', margin: '0 22px 20px', minHeight: 0 }}>
        {ready && IDS.map(id => {
          const role = order.indexOf(id);
          const r = rectFor(role);
          const s = r.w / mainW;
          return (
            <div key={id} ref={el => { tileRefs.current[id] = el; }} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 16, overflow: 'hidden', border: r.main ? '1px solid rgba(45,42,36,0.10)' : '1px solid rgba(45,42,36,0.08)', background: 'rgba(255,255,255,0.92)', boxShadow: r.main ? '0 16px 44px rgba(45,42,36,0.10)' : '0 6px 18px rgba(45,42,36,0.08)', zIndex: r.main ? 2 : 1 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: mainW, height: r.h / s, transform: `scale(${s})`, transformOrigin: '0 0', overflowY: 'auto', overflowX: 'hidden', background: id === 'generator' ? '#fbf7ef' : '#fcf9f2' }}>
                {id === 'history' && <HistoryContent exams={exams} justAddedId={justAdded} onEdit={e => { setEditing(e); focus('generator'); }} onNew={() => { setEditing(null); focus('generator'); }} />}
                {id === 'bank' && <BankContent selected={selected} onToggle={id2 => setSelected(s => s.includes(id2) ? s.filter(x => x !== id2) : [...s, id2])} openId={openId} setOpenId={setOpenId} activeLabel={activeLabel} setActiveLabel={setActiveLabel} />}
                {id === 'generator' && <GeneratorContent selected={selected} editing={editing} onCancelEdit={() => setEditing(null)} onGenerate={handleGenerate} />}
              </div>
              {!r.main && (
                <>
                  <div onClick={() => focus(id)} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer', background: 'linear-gradient(180deg, rgba(252,249,242,0.96), rgba(252,249,242,0.0))' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#a87a3a', display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#2d2a24' }}>{META[id]}</span>
                  </div>
                  <div onClick={() => focus(id)} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,42,36,0.0)', transition: 'background 180ms ease', cursor: 'pointer' }}>
                    <button onClick={e => { e.stopPropagation(); focus(id); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(255,255,255,0.96)', color: '#2d2a24', fontSize: 12.5, fontWeight: 500, boxShadow: '0 6px 18px rgba(45,42,36,0.20)', opacity: 0, pointerEvents: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5.5 1.5H1.5V5.5M8.5 12.5h4V8.5M1.5 8.5v4h4M12.5 5.5v-4h-4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      agrandir
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
