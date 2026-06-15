'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import QuestionEditor, { Question, ResponseType, RESPONSE_TYPE_LABELS, emptyQuestion } from './QuestionEditor';
import { getExamBankData, saveQuestion, saveQuestions, createPool as createPoolAction, updatePool as updatePoolAction, deletePool as deletePoolAction, saveGeneratedExam } from '@/app/actions/examQuestions';

// ---- shared data ----
type Pool = { id: string; name: string; color: string };

type Exam = { id: string; title: string; date: string; q: number; dur: string; avg: string; status: string; taken: number; questionIds?: string[] };

// ---- small helpers ----
const RESPONSE_TYPE_COLORS: Record<ResponseType, string> = {
  sans_reponse: '#7a766d',
  qcs: '#c89860',
  qcm: '#7a9968',
  textuelle: '#9eb3b9',
  dessin: '#a890b8',
  audio: '#a890b8',
  sondage: '#9eb3b9',
  fill_blank: '#c89860',
  matching: '#a890b8',
  ordre: '#a890b8',
};

type SortBy = 'difficulty' | 'name' | 'type' | 'label';

const NEVER_EXAM_ID = '__never__';
const NO_DIFFICULTY = 0;
const NO_ANSWER_ID = '__no_answer__';
const LINKED_ID = '__linked__';

const LABEL_COLORS = ['#9eb3b9', '#a890b8', '#7a9968', '#c89860', '#b85a4a', '#5f8a3f', '#a87a3a', '#9a948a', '#6b8ea8', '#c2603a'];

function DiffDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < level ? '#a87a3a' : 'rgba(45,42,36,0.15)', display: 'inline-block' }} />)}
    </span>
  );
}

function TypePill({ type }: { type: ResponseType }) {
  const c = RESPONSE_TYPE_COLORS[type] || '#7a766d';
  return <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: `${c}28`, color: '#3a352c', letterSpacing: '0.02em' }}>{RESPONSE_TYPE_LABELS[type] ?? type}</span>;
}

function Diff({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 9, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>diff</span>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < n ? '#a87a3a' : 'rgba(45,42,36,0.12)', display: 'inline-block' }} />)}
    </span>
  );
}

function answerSummary(q: Question): string {
  if (q.responseType === 'qcm' || q.responseType === 'qcs') {
    const correct = q.correctChoices.map((i) => q.choices[i]).filter(Boolean);
    return correct.length ? correct.join(' · ') : '(bonne réponse non définie)';
  }
  if (q.responseType === 'matching') {
    return q.choices.map((c) => c.replace(' :: ', ' → ')).join(' · ') || '(paires non définies)';
  }
  if (q.responseType === 'ordre') {
    return q.choices.join(' → ') || '(ordre non défini)';
  }
  if (q.responseType === 'sans_reponse') {
    return 'aucune réponse associée';
  }
  if (q.responseType === 'sondage') {
    const freeText = q.correctChoices.map((i) => q.choices[i]).filter(Boolean);
    return freeText.length ? `sondage · réponse libre (${freeText.join(' · ')})` : 'sondage sans correction';
  }
  return q.answer || '(réponse non définie)';
}

function hasNoAnswer(q: Question): boolean {
  // sans_reponse / sondage : l'absence de réponse est voulue, pas "manquante"
  if (q.responseType === 'sans_reponse' || q.responseType === 'sondage') return false;
  if (q.responseType === 'qcm' || q.responseType === 'qcs') {
    return q.correctChoices.map((i) => q.choices[i]).filter(Boolean).length === 0;
  }
  if (q.responseType === 'matching' || q.responseType === 'ordre') {
    return q.choices.length === 0;
  }
  return !q.answer || !q.answer.trim();
}

// regroupe une liste de questions en lignes : une question seule, ou un groupe de questions liées
// (les questions liées forment un bloc indissociable — sélection, envoi au générateur et affichage groupé)
type Row = { kind: 'single'; q: Question } | { kind: 'group'; ids: string[]; members: Question[] };

function groupIntoRows(list: Question[], allQuestions: Question[]): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const q of list) {
    if (seen.has(q.id)) continue;
    if (q.linkedQuestionIds.length > 1) {
      const members = q.linkedQuestionIds.map(id => allQuestions.find(p => p.id === id)).filter((p): p is Question => !!p);
      members.forEach(m => seen.add(m.id));
      rows.push({ kind: 'group', ids: q.linkedQuestionIds, members });
    } else {
      seen.add(q.id);
      rows.push({ kind: 'single', q });
    }
  }
  return rows;
}

function rowMembers(row: Row): Question[] {
  return row.kind === 'group' ? row.members : [row.q];
}

function statusStyle(s: string) {
  return ({ publié: { bg: 'rgba(122,153,104,0.20)', fg: '#3f5630' }, brouillon: { bg: 'rgba(232,184,108,0.22)', fg: '#7a4d20' }, archivé: { bg: 'rgba(45,42,36,0.07)', fg: '#7a766d' } } as Record<string, { bg: string; fg: string }>)[s] ?? { bg: 'rgba(45,42,36,0.07)', fg: '#7a766d' };
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button title={title} onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(45,42,36,0.12)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{children}</button>
  );
}

function ActiveChip({ label, color, negative, filterKey, onRemove, setDraggedKey }: { label: string; color?: string; negative: boolean; filterKey: string; onRemove: () => void; setDraggedKey: (key: string | null) => void }) {
  return (
    <span
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', filterKey); setDraggedKey(filterKey); }}
      onDragEnd={() => setDraggedKey(null)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 6px 5px 11px', borderRadius: 999, border: negative ? '1px solid rgba(184,90,74,0.45)' : '1px solid rgba(45,42,36,0.30)', background: negative ? '#b85a4a' : '#2d2a24', color: '#f4f0e6', fontFamily: 'inherit', cursor: 'grab', clipPath: 'inset(0 round 999px)' }}
    >
      {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />}
      {label}
      <button onClick={onRemove} style={{ border: 'none', background: 'none', color: '#f4f0e6', cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1, opacity: 0.7 }}>×</button>
    </span>
  );
}

// ---- LINK ORDER MODAL ----
function LinkOrderModal({ questions, onConfirm, onCancel }: { questions: Question[]; onConfirm: (orderedIds: string[]) => void; onCancel: () => void }) {
  const [order, setOrder] = useState<string[]>(questions.map(q => q.id));

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  const ordered = order.map(id => questions.find(q => q.id === id)!);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width: 460, maxWidth: '92vw', background: '#fcf9f2', borderRadius: 20, padding: '22px 24px', boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif" }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#2d2a24', marginBottom: 4 }}>Lier {questions.length} questions</div>
        <div style={{ fontSize: 12, color: '#7a766d', marginBottom: 16 }}>elles sortiront toujours ensemble, dans cet ordre, dans un examen</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20 }}>
          {ordered.map((q, i) => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 9 }}>
              <span style={{ fontSize: 11, color: '#a87a3a', fontVariantNumeric: 'tabular-nums', width: 16, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.content || '(sans énoncé)'}</span>
              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#d8d4cb' : '#7a766d', padding: 0, lineHeight: 1, fontSize: 11 }}>▲</button>
                <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1} style={{ border: 'none', background: 'none', cursor: i === ordered.length - 1 ? 'default' : 'pointer', color: i === ordered.length - 1 ? '#d8d4cb' : '#7a766d', padding: 0, lineHeight: 1, fontSize: 11 }}>▼</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
          <button onClick={() => onConfirm(order)} style={{ flex: 2, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#2d2a24', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Lier les questions</button>
        </div>
      </div>
    </div>
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
type FilterMode = 'pos' | 'neg';

function BankContent({ questions, pools, exams, selected, onToggle, onToggleGroup, openId, setOpenId, onEditQuestion, onNewQuestion, onRequestLink, onSendToGenerator, onUnlinkGroup, onCreatePool, onUpdatePool, onDeletePool, onDuplicateQuestion }: {
  questions: Question[];
  pools: Pool[];
  exams: Exam[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEditQuestion: (q: Question) => void;
  onNewQuestion: () => void;
  onRequestLink: () => void;
  onSendToGenerator: () => void;
  onUnlinkGroup: (ids: string[]) => void;
  onCreatePool: (name: string) => string;
  onUpdatePool: (pool: Pool) => void;
  onDeletePool: (id: string) => void;
  onDuplicateQuestion: (q: Question) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [pendingUnlinkKey, setPendingUnlinkKey] = useState<string | null>(null);
  const [filterPools, setFilterPools] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<ResponseType[]>([]);
  const [filterDiffs, setFilterDiffs] = useState<number[]>([]);
  const [filterExams, setFilterExams] = useState<string[]>([]);
  const [filterAnswer, setFilterAnswer] = useState<string[]>([]);
  const [filterLinked, setFilterLinked] = useState<string[]>([]);
  const [filterModes, setFilterModes] = useState<Record<string, FilterMode>>({});
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<FilterMode | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('difficulty');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('');
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const allTypes = Array.from(new Set(questions.map(q => q.responseType)));
  const activeFilterCount = filterPools.length + filterTypes.length + filterDiffs.length + filterExams.length + filterAnswer.length + filterLinked.length;

  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  useEffect(() => {
    if (!filterOpen) {
      setEditingLabel(null);
      setCreatingLabel(false);
    }
  }, [filterOpen]);

  function clearMode(key: string) {
    setFilterModes(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  function togglePoolFilter(id: string) {
    setFilterPools(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    clearMode(`pool:${id}`);
  }
  function toggleTypeFilter(t: ResponseType) {
    setFilterTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    clearMode(`type:${t}`);
  }
  function toggleDiffFilter(d: number) {
    setFilterDiffs(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
    clearMode(`diff:${d}`);
  }
  function toggleExamFilter(id: string) {
    setFilterExams(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    clearMode(`exam:${id}`);
  }
  function toggleAnswerFilter(id: string) {
    setFilterAnswer(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    clearMode(`answer:${id}`);
  }
  function toggleLinkedFilter(id: string) {
    setFilterLinked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    clearMode(`linked:${id}`);
  }
  function setFilterMode(key: string, mode: FilterMode) {
    setFilterModes(prev => ({ ...prev, [key]: mode }));
  }
  function handleDropOnZone(e: React.DragEvent, mode: FilterMode) {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain') || draggedKey;
    if (key) setFilterMode(key, mode);
    setDraggedKey(null);
    setDragOverZone(null);
  }
  function resetFilters() {
    setFilterPools([]);
    setFilterTypes([]);
    setFilterDiffs([]);
    setFilterExams([]);
    setFilterAnswer([]);
    setFilterLinked([]);
    setFilterModes({});
  }
  function addLabel() {
    const name = newLabelName.trim();
    if (!name) return;
    onCreatePool(name);
    setNewLabelName('');
    setCreatingLabel(false);
  }
  function openEditLabel(pool: Pool) {
    setEditingLabel(pool.id);
    setEditLabelName(pool.name);
    setEditLabelColor(pool.color);
    setCreatingLabel(false);
  }
  function saveEditLabel() {
    if (!editingLabel) return;
    const pool = pools.find(p => p.id === editingLabel);
    if (!pool) return;
    const name = editLabelName.trim();
    onUpdatePool({ ...pool, name: name || pool.name, color: editLabelColor || pool.color });
    setEditingLabel(null);
  }
  function confirmDeleteLabel() {
    if (!pendingDeleteLabel) return;
    const id = pendingDeleteLabel;
    onDeletePool(id);
    setFilterPools(prev => prev.filter(p => p !== id));
    clearMode(`pool:${id}`);
    setPendingDeleteLabel(null);
    if (editingLabel === id) setEditingLabel(null);
  }

  // chaque catégorie de filtre est répartie entre filtres positifs (le résultat doit correspondre)
  // et négatifs (le résultat ne doit pas correspondre), selon filterModes (par défaut : positif)
  const modeOf = (key: string): FilterMode => filterModes[key] ?? 'pos';
  const posPools = filterPools.filter(id => modeOf(`pool:${id}`) === 'pos');
  const negPools = filterPools.filter(id => modeOf(`pool:${id}`) === 'neg');
  const posTypes = filterTypes.filter(t => modeOf(`type:${t}`) === 'pos');
  const negTypes = filterTypes.filter(t => modeOf(`type:${t}`) === 'neg');
  const posDiffs = filterDiffs.filter(d => modeOf(`diff:${d}`) === 'pos');
  const negDiffs = filterDiffs.filter(d => modeOf(`diff:${d}`) === 'neg');
  const posExams = filterExams.filter(e => modeOf(`exam:${e}`) === 'pos');
  const negExams = filterExams.filter(e => modeOf(`exam:${e}`) === 'neg');
  const posAnswer = filterAnswer.filter(a => modeOf(`answer:${a}`) === 'pos');
  const negAnswer = filterAnswer.filter(a => modeOf(`answer:${a}`) === 'neg');
  const posLinked = filterLinked.filter(l => modeOf(`linked:${l}`) === 'pos');
  const negLinked = filterLinked.filter(l => modeOf(`linked:${l}`) === 'neg');

  // group linked questions into a single row avant le filtrage, pour que les caractéristiques
  // du groupe (libellés, types, difficulté, présence en examen, réponse…) soient l'union de ses membres
  const allRows: Row[] = groupIntoRows(questions, questions);

  let rows = allRows.filter(row => {
    const members = rowMembers(row);
    const rowPools = new Set(members.flatMap(m => m.pools));
    const rowTypes = new Set(members.map(m => m.responseType));
    const rowDiffs = new Set(members.map(m => m.difficulty.enabled ? m.difficulty.value : NO_DIFFICULTY));
    const rowExamIds = new Set(members.flatMap(m => m.examIds));
    const rowNeverExam = members.some(m => m.examIds.length === 0);
    const rowNoAnswer = members.some(m => hasNoAnswer(m));
    const rowLinked = row.kind === 'group';

    if (posPools.length && !posPools.some(p => rowPools.has(p))) return false;
    if (negPools.length && negPools.some(p => rowPools.has(p))) return false;
    if (posTypes.length && !posTypes.some(t => rowTypes.has(t))) return false;
    if (negTypes.length && negTypes.some(t => rowTypes.has(t))) return false;
    if (posDiffs.length && !posDiffs.some(d => rowDiffs.has(d))) return false;
    if (negDiffs.length && negDiffs.some(d => rowDiffs.has(d))) return false;
    if (posExams.length && !posExams.some(f => f === NEVER_EXAM_ID ? rowNeverExam : rowExamIds.has(f))) return false;
    if (negExams.length && negExams.some(f => f === NEVER_EXAM_ID ? rowNeverExam : rowExamIds.has(f))) return false;
    if (posAnswer.length && !posAnswer.some(f => f === NO_ANSWER_ID ? rowNoAnswer : true)) return false;
    if (negAnswer.length && negAnswer.some(f => f === NO_ANSWER_ID ? rowNoAnswer : false)) return false;
    if (posLinked.length && !posLinked.some(f => f === LINKED_ID ? rowLinked : true)) return false;
    if (negLinked.length && negLinked.some(f => f === LINKED_ID ? rowLinked : false)) return false;
    if (search.trim() && !members.some(m => m.content.toLowerCase().includes(search.trim().toLowerCase()))) return false;
    return true;
  });

  rows = [...rows].sort((a, b) => {
    const qa = rowMembers(a)[0];
    const qb = rowMembers(b)[0];
    switch (sortBy) {
      case 'difficulty':
        return (qb.difficulty.enabled ? qb.difficulty.value : -1) - (qa.difficulty.enabled ? qa.difficulty.value : -1);
      case 'name':
        return qa.content.localeCompare(qb.content);
      case 'type':
        return (RESPONSE_TYPE_LABELS[qa.responseType] ?? '').localeCompare(RESPONSE_TYPE_LABELS[qb.responseType] ?? '');
      case 'label': {
        const an = pools.find(p => p.id === qa.pools[0])?.name ?? '';
        const bn = pools.find(p => p.id === qb.pools[0])?.name ?? '';
        return an.localeCompare(bn);
      }
      default:
        return 0;
    }
  });

  function toggleExpand(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function renderQuestionBody(q: Question, opts?: { indexBadge?: number; selectable?: boolean }) {
    const selectable = opts?.selectable ?? true;
    const indexBadge = opts?.indexBadge;
    const isSel = selected.includes(q.id);
    const open = openId === q.id;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
        {selectable ? (
          <div onClick={() => onToggle(q.id)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1, cursor: 'pointer', border: isSel ? 'none' : '1.5px solid rgba(45,42,36,0.18)', background: isSel ? '#7a9968' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{isSel ? '✓' : ''}</div>
        ) : (
          <div title="fait partie d'un groupe de questions liées" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🔗</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: '#2d2a24', lineHeight: 1.45, marginBottom: 8 }}>
            {indexBadge != null && <span style={{ fontSize: 11, color: '#a87a3a', fontVariantNumeric: 'tabular-nums', marginRight: 6 }}>{indexBadge}.</span>}
            {q.content || '(sans énoncé)'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TypePill type={q.responseType} />
            {q.difficulty.enabled && <Diff n={q.difficulty.value} />}
            {q.pools.map(pid => {
              const p = pools.find(pp => pp.id === pid);
              if (!p) return null;
              return <span key={pid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(45,42,36,0.05)', color: '#5a564c' }}>#{p.name}</span>;
            })}
            <button onClick={() => setOpenId(open ? null : q.id)} style={{ marginLeft: 'auto', fontSize: 11, color: '#a87a3a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{open ? 'masquer la réponse ▴' : 'voir la réponse ▾'}</button>
            <IconBtn title="modifier la question" onClick={() => onEditQuestion(q)}>
              <svg width="13" height="13" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6L11 11M11 3L9.6 4.4M4.4 9.6L3 11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
            </IconBtn>
            <IconBtn title="dupliquer la question" onClick={() => onDuplicateQuestion(q)}>
              <svg width="13" height="13" viewBox="0 0 14 14"><rect x="3.5" y="3.5" width="7" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M2 9V2.6A1 1 0 0 1 3 1.6h5" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
            </IconBtn>
          </div>
          {open && <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(232,216,168,0.22)', borderRadius: 8, fontSize: 12.5, color: '#3a352c', lineHeight: 1.5 }}><span style={{ fontWeight: 600, color: '#7a4d20' }}>réponse · </span>{answerSummary(q)}</div>}
        </div>
      </div>
    );
  }

  type ActiveFilter = { key: string; category: 'pool' | 'type' | 'diff' | 'exam' | 'answer' | 'linked'; value: string | number; label: string; color?: string };
  const activeFilters: ActiveFilter[] = [
    ...filterPools.map(id => ({ key: `pool:${id}`, category: 'pool' as const, value: id, label: pools.find(p => p.id === id)?.name ?? id, color: pools.find(p => p.id === id)?.color })),
    ...filterTypes.map(t => ({ key: `type:${t}`, category: 'type' as const, value: t, label: RESPONSE_TYPE_LABELS[t] ?? t })),
    ...filterDiffs.map(d => ({ key: `diff:${d}`, category: 'diff' as const, value: d, label: d === NO_DIFFICULTY ? 'sans difficulté' : `difficulté ${d}/5` })),
    ...filterExams.map(eid => ({ key: `exam:${eid}`, category: 'exam' as const, value: eid, label: eid === NEVER_EXAM_ID ? 'jamais tombé en examen' : (exams.find(ex => ex.id === eid)?.title ?? eid) })),
    ...filterAnswer.map(aid => ({ key: `answer:${aid}`, category: 'answer' as const, value: aid, label: 'question incomplète' })),
    ...filterLinked.map(lid => ({ key: `linked:${lid}`, category: 'linked' as const, value: lid, label: 'questions liées' })),
  ];
  const positiveFilters = activeFilters.filter(f => modeOf(f.key) === 'pos');
  const negativeFilters = activeFilters.filter(f => modeOf(f.key) === 'neg');

  function removeFilter(f: ActiveFilter) {
    switch (f.category) {
      case 'pool': togglePoolFilter(f.value as string); break;
      case 'type': toggleTypeFilter(f.value as ResponseType); break;
      case 'diff': toggleDiffFilter(f.value as number); break;
      case 'exam': toggleExamFilter(f.value as string); break;
      case 'answer': toggleAnswerFilter(f.value as string); break;
      case 'linked': toggleLinkedFilter(f.value as string); break;
    }
  }

  return (
    <div style={{ padding: '20px 24px 24px', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24' }}>Banque de questions</div>
          {activeFilterCount > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                onDragEnter={e => e.preventDefault()}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverZone('pos'); }}
                onDragLeave={() => setDragOverZone(prev => prev === 'pos' ? null : prev)}
                onDrop={e => handleDropOnZone(e, 'pos')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '4px 6px', borderRadius: 8, border: dragOverZone === 'pos' ? '1px dashed rgba(122,153,104,0.6)' : '1px dashed transparent', background: dragOverZone === 'pos' ? 'rgba(122,153,104,0.10)' : 'transparent' }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a' }}>inclure</span>
                {positiveFilters.map(f => (
                  <ActiveChip key={f.key} filterKey={f.key} label={f.label} color={f.color} negative={false} onRemove={() => removeFilter(f)} setDraggedKey={setDraggedKey} />
                ))}
                {positiveFilters.length === 0 && <span style={{ fontSize: 11, color: '#bdb8ad', fontStyle: 'italic' }}>glisse un filtre ici</span>}
              </div>
              <div
                onDragEnter={e => e.preventDefault()}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverZone('neg'); }}
                onDragLeave={() => setDragOverZone(prev => prev === 'neg' ? null : prev)}
                onDrop={e => handleDropOnZone(e, 'neg')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '4px 6px', borderRadius: 8, border: dragOverZone === 'neg' ? '1px dashed rgba(184,90,74,0.6)' : '1px dashed transparent', background: dragOverZone === 'neg' ? 'rgba(184,90,74,0.10)' : 'transparent' }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a' }}>exclure</span>
                {negativeFilters.map(f => (
                  <ActiveChip key={f.key} filterKey={f.key} label={f.label} color={f.color} negative={true} onRemove={() => removeFilter(f)} setDraggedKey={setDraggedKey} />
                ))}
                {negativeFilters.length === 0 && <span style={{ fontSize: 11, color: '#bdb8ad', fontStyle: 'italic' }}>glisse un filtre ici</span>}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onNewQuestion} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#2d2a24', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <span style={{ fontSize: 15 }}>+</span> nouvelle question
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#a87a3a', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer', boxShadow: '0 6px 16px rgba(168,122,58,0.28)' }}>
            <span style={{ fontSize: 14 }}>✦</span> générer par IA
          </button>
        </div>
      </div>
      {selected.length >= 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', borderRadius: 9, background: 'rgba(232,184,108,0.16)', border: '1px solid rgba(168,122,58,0.28)', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: '#7a4d20' }}>{selected.length} question{selected.length > 1 ? 's' : ''} sélectionnée{selected.length > 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.length >= 2 && (
              <button onClick={onRequestLink} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(45,42,36,0.16)', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>
                🔗 lier ces questions
              </button>
            )}
            <button onClick={onSendToGenerator} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2d2a24', color: '#f4f0e6', cursor: 'pointer', fontFamily: 'inherit' }}>
              envoyer vers le générateur →
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 9 }}>
          <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5" stroke="#7a766d" strokeWidth="1.4" fill="none" /><line x1="10" y1="10" x2="14" y2="14" stroke="#7a766d" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="filtrer les questions…" style={{ flex: 1, fontSize: 12.5, color: '#3a352c', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
        </div>
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button onClick={() => setFilterOpen(o => !o)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 9, border: activeFilterCount > 0 ? '1px solid rgba(168,122,58,0.45)' : '1px solid rgba(45,42,36,0.10)', background: activeFilterCount > 0 ? 'rgba(232,184,108,0.18)' : 'rgba(255,255,255,0.7)', color: activeFilterCount > 0 ? '#7a4d20' : '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>
            filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾
          </button>
          {filterOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 280, background: '#fff', border: '1px solid rgba(45,42,36,0.10)', borderRadius: 12, boxShadow: '0 12px 32px rgba(45,42,36,0.16)', padding: 14, zIndex: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#2d2a24' }}>filtres</span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} style={{ fontSize: 11.5, color: '#a87a3a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>réinitialiser</button>
                )}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>libellés</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {pools.map(l => {
                  const active = filterPools.includes(l.id);
                  return (
                    <span key={l.id} style={{ position: 'relative', display: 'inline-flex' }}>
                      <button onClick={() => togglePoolFilter(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, display: 'inline-block' }} />{l.name}
                      </button>
                      <button onClick={() => editingLabel === l.id ? setEditingLabel(null) : openEditLabel(l)} title="modifier le libellé" style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', border: '1px solid rgba(45,42,36,0.15)', background: '#fff', color: '#9a948a', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="7" height="7" viewBox="0 0 14 14"><path d="M9.8 1.6l2.6 2.6L4.8 11.8l-3 .6.6-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/></svg>
                      </button>
                      {editingLabel === l.id && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 190, background: '#fff', border: '1px solid rgba(45,42,36,0.10)', borderRadius: 12, boxShadow: '0 12px 32px rgba(45,42,36,0.16)', padding: 10 }}>
                          <input autoFocus value={editLabelName} onChange={e => setEditLabelName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditLabel(); if (e.key === 'Escape') setEditingLabel(null); }} style={{ width: '100%', fontSize: 11.5, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(45,42,36,0.14)', outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' as const }} />
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                            {LABEL_COLORS.map(c => (
                              <button key={c} onClick={() => setEditLabelColor(c)} title={c} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: editLabelColor === c ? '2px solid #2d2a24' : '1px solid rgba(45,42,36,0.15)', cursor: 'pointer', padding: 0 }} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <button onClick={saveEditLabel} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: 'none', background: '#2d2a24', color: '#f4f0e6', cursor: 'pointer', fontFamily: 'inherit' }}>enregistrer</button>
                            <button onClick={() => setEditingLabel(null)} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(45,42,36,0.10)', background: 'transparent', color: '#7a766d', cursor: 'pointer', fontFamily: 'inherit' }}>annuler</button>
                          </div>
                          <button onClick={() => setPendingDeleteLabel(l.id)} style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(184,90,74,0.30)', background: 'rgba(184,90,74,0.08)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit' }}>supprimer le libellé</button>
                        </div>
                      )}
                    </span>
                  );
                })}
                {creatingLabel ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input autoFocus value={newLabelName} onChange={e => setNewLabelName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLabel(); if (e.key === 'Escape') { setCreatingLabel(false); setNewLabelName(''); } }} placeholder="nom du libellé…" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.18)', outline: 'none', fontFamily: 'inherit', width: 110 }} />
                    <button onClick={addLabel} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.10)', background: '#2d2a24', color: '#f4f0e6', cursor: 'pointer', fontFamily: 'inherit' }}>ajouter</button>
                    <button onClick={() => { setCreatingLabel(false); setNewLabelName(''); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.10)', background: 'transparent', color: '#9a948a', cursor: 'pointer', fontFamily: 'inherit' }}>annuler</button>
                  </span>
                ) : (
                  <button onClick={() => setCreatingLabel(true)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px dashed rgba(45,42,36,0.20)', background: 'transparent', color: '#7a766d', cursor: 'pointer', fontFamily: 'inherit' }}>+ libellé</button>
                )}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>type de question</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {allTypes.map(t => {
                  const active = filterTypes.includes(t);
                  return (
                    <button key={t} onClick={() => toggleTypeFilter(t)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                      {RESPONSE_TYPE_LABELS[t] ?? t}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>difficulté</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {[1, 2, 3, 4, 5].map(d => {
                  const active = filterDiffs.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDiffFilter(d)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                      <DiffDots level={d} />{d}/5
                    </button>
                  );
                })}
                {(() => {
                  const active = filterDiffs.includes(NO_DIFFICULTY);
                  return (
                    <button onClick={() => toggleDiffFilter(NO_DIFFICULTY)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                      <DiffDots level={0} />sans difficulté
                    </button>
                  );
                })()}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>statut</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(() => {
                  const active = filterExams.includes(NEVER_EXAM_ID);
                  return (
                    <button onClick={() => toggleExamFilter(NEVER_EXAM_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                      jamais tombé en examen
                    </button>
                  );
                })()}
                {(() => {
                  const active = filterAnswer.includes(NO_ANSWER_ID);
                  return (
                    <button onClick={() => toggleAnswerFilter(NO_ANSWER_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                      question incomplète
                    </button>
                  );
                })()}
                {(() => {
                  const active = filterLinked.includes(LINKED_ID);
                  return (
                    <button onClick={() => toggleLinkedFilter(LINKED_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                      questions liées
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{ fontSize: 12, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(255,255,255,0.7)', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
          <option value="difficulty">trier · difficulté</option>
          <option value="name">trier · nom</option>
          <option value="type">trier · type</option>
          <option value="label">trier · libellé</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => {
          if (row.kind === 'single') {
            const q = row.q;
            const isSel = selected.includes(q.id);
            return (
              <div key={q.id} style={{ border: isSel ? '1px solid rgba(122,153,104,0.4)' : '1px solid rgba(45,42,36,0.08)', background: isSel ? 'rgba(122,153,104,0.07)' : 'rgba(255,255,255,0.8)', borderRadius: 10, overflow: 'hidden' }}>
                {renderQuestionBody(q)}
              </div>
            );
          }
          const groupKey = row.ids.join(',');
          const expanded = expandedGroups.has(groupKey);
          const first = row.members[0];
          const groupSelected = row.ids.every(id => selected.includes(id));
          return (
            <div key={groupKey} style={{ border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(168,122,58,0.05)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                <div onClick={() => onToggleGroup(row.ids)} title="sélectionner le groupe" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: 'pointer', border: groupSelected ? 'none' : '1.5px solid rgba(45,42,36,0.18)', background: groupSelected ? '#7a9968' : '#fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{groupSelected ? '✓' : ''}</div>
                <div onClick={() => toggleExpand(groupKey)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: '#2d2a24', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.content || '(sans énoncé)'}</div>
                    <div style={{ fontSize: 11, color: '#7a4d20', marginTop: 4 }}>question liée · {row.members.length} parties</div>
                  </div>
                </div>
                {pendingUnlinkKey === groupKey ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { onUnlinkGroup(row.ids); setPendingUnlinkKey(null); }} style={{ fontSize: 11, color: '#b85a4a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: 0.85 }}>confirmer ✓</button>
                    <button onClick={() => setPendingUnlinkKey(null)} style={{ fontSize: 11, color: '#7a766d', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: 0.85 }}>annuler</button>
                  </div>
                ) : (
                  <button onClick={() => setPendingUnlinkKey(groupKey)} title="délier le groupe" style={{ fontSize: 11, color: '#7a4d20', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', opacity: 0.75, flexShrink: 0 }}>délier ✕</button>
                )}
                <span onClick={() => toggleExpand(groupKey)} style={{ fontSize: 11, color: '#7a766d', flexShrink: 0, cursor: 'pointer' }}>{expanded ? 'replier ▴' : 'déplier ▾'}</span>
              </div>
              {expanded && (
                <div style={{ borderTop: '1px solid rgba(168,122,58,0.20)', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px' }}>
                  {row.members.map((q, i) => (
                    <div key={q.id} style={{ border: '1px solid rgba(45,42,36,0.08)', background: 'rgba(255,255,255,0.85)', borderRadius: 9, overflow: 'hidden' }}>
                      {renderQuestionBody(q, { indexBadge: i + 1, selectable: false })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: '#a87a3a', padding: '20px 0', textAlign: 'center' as const }}>« aucune question ne correspond à ces filtres »</div>
        )}
      </div>
      {pendingDeleteLabel && (() => {
        const label = pools.find(p => p.id === pendingDeleteLabel);
        if (!label) return null;
        const count = questions.filter(q => q.pools.includes(label.id)).length;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setPendingDeleteLabel(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
            <div style={{ position: 'relative', width: 380, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Supprimer le libellé « {label.name} » ?</div>
              <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
                {count > 0 ? `Il sera retiré de ${count} question${count > 1 ? 's' : ''}. ` : ''}Cette action est irréversible.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPendingDeleteLabel(null)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                <button onClick={confirmDeleteLabel} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#b85a4a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Supprimer</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ---- GENERATOR ----
function GeneratorContent({ questions, draftIds, editing, onCancelEdit, onGenerate, onOpenQuestion, onRemoveFromDraft }: { questions: Question[]; draftIds: string[]; editing: Exam | null; onCancelEdit: () => void; onGenerate: () => void; onOpenQuestion: (id: string) => void; onRemoveFromDraft: (ids: string[]) => void }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const chosen = draftIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q);
  const rows = groupIntoRows(chosen, questions);

  function toggleExpand(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

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
        {rows.length === 0 && <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: '#a87a3a', padding: '12px 0' }}>« coche des questions dans la banque puis envoie-les vers le générateur »</div>}
        {rows.map((row, idx) => {
          if (row.kind === 'single') {
            const q = row.q;
            const incomplete = hasNoAnswer(q);
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: incomplete ? 'rgba(184,90,74,0.06)' : 'rgba(252,249,242,0.9)', border: incomplete ? '1px solid rgba(184,90,74,0.25)' : '1px solid rgba(45,42,36,0.06)', borderRadius: 9 }}>
                <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>{String(idx + 1).padStart(2, '0')}</span>
                <TypePill type={q.responseType} />
                <span style={{ flex: 1, fontSize: 12.5, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.content}</span>
                {incomplete && (
                  <button onClick={() => onOpenQuestion(q.id)} title="compléter la question" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    ⚠ question incomplète
                  </button>
                )}
                <span onClick={() => onRemoveFromDraft([q.id])} style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
              </div>
            );
          }
          const groupKey = row.ids.join(',');
          const expanded = expandedGroups.has(groupKey);
          const first = row.members[0];
          const incompleteMember = row.members.find(m => hasNoAnswer(m));
          return (
            <div key={groupKey} style={{ border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(168,122,58,0.05)', borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>{String(idx + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
                <div onClick={() => toggleExpand(groupKey)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ fontSize: 12.5, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.content || '(sans énoncé)'}</div>
                  <div style={{ fontSize: 10.5, color: '#7a4d20', marginTop: 2 }}>question liée · {row.members.length} parties</div>
                </div>
                {incompleteMember && (
                  <button onClick={() => onOpenQuestion(incompleteMember.id)} title="compléter la question" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                    ⚠ question incomplète
                  </button>
                )}
                <span onClick={() => toggleExpand(groupKey)} style={{ fontSize: 11, color: '#7a766d', cursor: 'pointer', flexShrink: 0 }}>{expanded ? 'replier ▴' : 'déplier ▾'}</span>
                <span onClick={() => onRemoveFromDraft(row.ids)} style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
              </div>
              {expanded && (
                <div style={{ borderTop: '1px solid rgba(168,122,58,0.20)', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px' }}>
                  {row.members.map((q, i) => {
                    const inc = hasNoAnswer(q);
                    return (
                      <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(45,42,36,0.06)', borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: '#a87a3a', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                        <TypePill type={q.responseType} />
                        <span style={{ flex: 1, fontSize: 12, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.content}</span>
                        {inc && (
                          <button onClick={() => onOpenQuestion(q.id)} title="compléter la question" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 9px', borderRadius: 999, border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                            ⚠ question incomplète
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
export default function ExamenTab({ workshopId }: { workshopId: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevRects = useRef<Record<string, { l: number; t: number; w: number; h: number }>>({});
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [order, setOrder] = useState<PanelId[]>(['history', 'bank', 'generator']);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkCandidateIds, setLinkCandidateIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const GAP = 16;
  const SIDE_W = 320;

  useEffect(() => {
    getExamBankData(workshopId).then(({ questions, pools, exams }) => {
      setQuestions(questions);
      setPools(pools);
      setExams(exams.map(e => ({ id: e.id, title: e.title, date: e.date, q: e.q, dur: e.dur, avg: e.avg, status: e.status, taken: e.taken, questionIds: e.questionIds })));
    }).catch(err => console.error('chargement banque de questions échoué', err));
  }, [workshopId]);

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
    let saved: Exam | null = null;
    setExams(prev => {
      if (editing) {
        const rest = prev.filter(e => e.id !== editing.id);
        const existing = prev.find(e => e.id === editing.id);
        saved = { ...existing!, date: "aujourd'hui", q: draftIds.length, questionIds: draftIds };
        return [saved, ...rest];
      }
      saved = { id, title, date: "aujourd'hui", q: draftIds.length, dur: '45 min', avg: '—', status: 'brouillon', taken: 0, questionIds: draftIds };
      return [saved, ...prev];
    });
    const hotId = editing ? editing.id : id;
    setJustAdded(hotId);
    setEditing(null);
    focus('history');
    setTimeout(() => setJustAdded(cur => cur === hotId ? null : cur), 2600);
    if (saved) saveGeneratedExam(workshopId, saved).catch(err => console.error('enregistrement examen échoué', err));
  }

  function handleOpenQuestion(id: string) {
    const q = questions.find(p => p.id === id);
    if (!q) return;
    setEditingQuestion(q);
    focus('bank');
  }

  function handleSaveQuestion(q: Question) {
    setQuestions(prev => {
      const exists = prev.some(p => p.id === q.id);
      if (exists) return prev.map(p => (p.id === q.id ? q : p));
      return [q, ...prev];
    });
    setEditingQuestion(null);
    saveQuestion(workshopId, q).catch(err => console.error('enregistrement question échoué', err));
  }

  function handleDuplicateQuestion(q: Question) {
    const copy: Question = { ...q, id: 'q' + Date.now() + Math.random().toString(36).slice(2, 7), linkedQuestionIds: [], examIds: [] };
    setQuestions(prev => [copy, ...prev]);
    saveQuestion(workshopId, copy).catch(err => console.error('duplication de la question échouée', err));
  }

  function handleCreatePool(name: string): string {
    const id = 'pool' + Date.now();
    const pool = { id, name, color: '#9eb3b9' };
    setPools(prev => [...prev, pool]);
    createPoolAction(workshopId, pool).catch(err => console.error('création libellé échouée', err));
    return id;
  }

  function handleUpdatePool(pool: Pool) {
    setPools(prev => prev.map(p => p.id === pool.id ? pool : p));
    updatePoolAction(workshopId, pool).catch(err => console.error('modification du libellé échouée', err));
  }

  function handleDeletePool(id: string) {
    setPools(prev => prev.filter(p => p.id !== id));
    const affected = questions.filter(q => q.pools.includes(id)).map(q => ({ ...q, pools: q.pools.filter(p => p !== id) }));
    setQuestions(prev => prev.map(q => q.pools.includes(id) ? { ...q, pools: q.pools.filter(p => p !== id) } : q));
    deletePoolAction(workshopId, id, affected).catch(err => console.error('suppression libellé échouée', err));
  }

  function handleRequestLink() {
    // si une question sélectionnée appartient déjà à un groupe lié, on fusionne tous les membres de ce groupe
    const merged = new Set<string>();
    for (const id of selected) {
      const q = questions.find(p => p.id === id);
      if (q && q.linkedQuestionIds.length > 1) {
        q.linkedQuestionIds.forEach(memberId => merged.add(memberId));
      } else {
        merged.add(id);
      }
    }
    setLinkCandidateIds([...merged]);
    setLinkModalOpen(true);
  }

  function handleLinkQuestions(orderedIds: string[]) {
    const updated: Question[] = [];
    setQuestions(prev => prev.map(q => {
      if (!orderedIds.includes(q.id)) return q;
      const next = { ...q, linkedQuestionIds: orderedIds };
      updated.push(next);
      return next;
    }));
    setLinkModalOpen(false);
    setSelected(s => s.filter(id => !orderedIds.includes(id)));
    if (updated.length) saveQuestions(workshopId, updated).catch(err => console.error('liaison des questions échouée', err));
  }

  function handleUnlinkGroup(ids: string[]) {
    const updated: Question[] = [];
    setQuestions(prev => prev.map(q => {
      if (!ids.includes(q.id)) return q;
      const next = { ...q, linkedQuestionIds: [] };
      updated.push(next);
      return next;
    }));
    setSelected(s => [...new Set([...s, ...ids])]);
    if (updated.length) saveQuestions(workshopId, updated).catch(err => console.error('déliaison des questions échouée', err));
  }

  function handleToggleGroup(ids: string[]) {
    setSelected(s => {
      const allSelected = ids.every(id => s.includes(id));
      if (allSelected) return s.filter(id => !ids.includes(id));
      return [...new Set([...s, ...ids])];
    });
  }

  function handleSendToGenerator() {
    setDraftIds(prev => [...prev, ...selected.filter(id => !prev.includes(id))]);
    setSelected([]);
  }

  function handleRemoveFromDraft(ids: string[]) {
    setDraftIds(prev => prev.filter(id => !ids.includes(id)));
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
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes examPop { 0% { background: rgba(232,184,108,0.42); } 100% { } }`}</style>
      <div ref={stageRef} style={{ flex: 1, position: 'relative', margin: '22px 22px 20px', minHeight: 0 }}>
        {ready && IDS.map(id => {
          const role = order.indexOf(id);
          const r = rectFor(role);
          const s = r.w / mainW;
          return (
            <div key={id} ref={el => { tileRefs.current[id] = el; }} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 16, overflow: 'hidden', border: r.main ? '1px solid rgba(45,42,36,0.10)' : '1px solid rgba(45,42,36,0.08)', background: 'rgba(255,255,255,0.92)', boxShadow: r.main ? '0 16px 44px rgba(45,42,36,0.10)' : '0 6px 18px rgba(45,42,36,0.08)', zIndex: r.main ? 2 : 1 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: mainW, height: r.h / s, transform: `scale(${s})`, transformOrigin: '0 0', overflowY: 'auto', overflowX: 'hidden', background: id === 'generator' ? '#fbf7ef' : '#fcf9f2' }}>
                {id === 'history' && <HistoryContent exams={exams} justAddedId={justAdded} onEdit={e => { setEditing(e); focus('generator'); }} onNew={() => { setEditing(null); focus('generator'); }} />}
                {id === 'bank' && (
                  <BankContent
                    questions={questions}
                    pools={pools}
                    exams={exams}
                    selected={selected}
                    onToggle={id2 => setSelected(s => s.includes(id2) ? s.filter(x => x !== id2) : [...s, id2])}
                    onToggleGroup={handleToggleGroup}
                    openId={openId}
                    setOpenId={setOpenId}
                    onEditQuestion={q => setEditingQuestion(q)}
                    onNewQuestion={() => setEditingQuestion(emptyQuestion())}
                    onRequestLink={handleRequestLink}
                    onSendToGenerator={handleSendToGenerator}
                    onUnlinkGroup={handleUnlinkGroup}
                    onCreatePool={handleCreatePool}
                    onUpdatePool={handleUpdatePool}
                    onDeletePool={handleDeletePool}
                    onDuplicateQuestion={handleDuplicateQuestion}
                  />
                )}
                {id === 'generator' && <GeneratorContent questions={questions} draftIds={draftIds} editing={editing} onCancelEdit={() => setEditing(null)} onGenerate={handleGenerate} onOpenQuestion={handleOpenQuestion} onRemoveFromDraft={handleRemoveFromDraft} />}
              </div>
              {id === 'bank' && editingQuestion && (
                <>
                  <QuestionEditor
                    question={editingQuestion}
                    allQuestions={questions}
                    pools={pools}
                    onCreatePool={handleCreatePool}
                    onSave={handleSaveQuestion}
                    onCancel={() => setEditingQuestion(null)}
                  />
                  {!r.main && (
                    <div onClick={() => focus(id)} style={{ position: 'absolute', inset: 0, zIndex: 61, cursor: 'pointer' }} />
                  )}
                </>
              )}
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
      {linkModalOpen && (
        <LinkOrderModal
          questions={questions.filter(q => linkCandidateIds.includes(q.id))}
          onConfirm={handleLinkQuestions}
          onCancel={() => setLinkModalOpen(false)}
        />
      )}
    </div>
  );
}
