'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Settings, Copy, Download, FileText, AlertTriangle } from 'lucide-react';
import QuestionEditor, { Question, ResponseType, RESPONSE_TYPE_LABELS, emptyQuestion } from './QuestionEditor';
import { getExamBankData, saveQuestion, saveQuestions, createPool as createPoolAction, updatePool as updatePoolAction, deletePool as deletePoolAction, deleteQuestion as deleteQuestionAction, saveGeneratedExam, deleteGeneratedExam, getExamDraft, saveExamDraft } from '@/app/actions/examQuestions';

// ---- shared data ----
type Pool = { id: string; name: string; color: string };

type Exam = { id: string; title: string; date: string; q: number; dur: string; avg: string; status: string; taken: number; questionIds?: string[]; config?: ExamConfig };

// ---- aperçu de l'examen (config live) ----
export type CandidateIdentity = { nom: boolean; prenom: boolean; tag: boolean; classe: boolean };
export type ExamPresentation = { identity: CandidateIdentity; customFields: string[] };
export type ExamSection = { id: string; title: string; questionIds: string[] };
export type QuestionWeight = { points: number; negative: { enabled: boolean; value: number }; eliminatory: boolean };
export type ExamConfig = {
  title: string;
  durationMinutes: number;
  presentation: ExamPresentation;
  sections: ExamSection[];
  weighting: Record<string, QuestionWeight>;
};

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

type SortBy = 'difficulty' | 'name' | 'type' | 'label' | 'recent';
type SortDir = 'asc' | 'desc';

const DEFAULT_SORT_DIR: Record<SortBy, SortDir> = {
  difficulty: 'desc',
  name: 'asc',
  type: 'asc',
  label: 'asc',
  recent: 'desc',
};

const NEVER_EXAM_ID = '__never__';
const NO_DIFFICULTY = 0;
const NO_ANSWER_ID = '__no_answer__';

// pagination de l'aperçu A4 (panneau « Éditeur d'examen ») — dimensions en px pour un bloc de 880px de large
const A4_PAGE_HEIGHT = 1494; // ≈ ratio A4 (210×297mm) pour un bloc de 1056px de large
const A4_ROW_GAP = 0; // les questions sont désormais collées (un seul bloc continu par section) — pas de marge entre lignes
const A4_SECTION_HEADER_HEIGHT = 44; // hauteur approx. de la barre de titre de section (+ marge)
const A4_ROW_FALLBACK_HEIGHT = 396; // hauteur estimée avant la première mesure réelle
const A4_BLOCK_WIDTH = 1056; // largeur du bloc question au format A4 dans l'aperçu

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

function WeightControls({ weight, onChange }: { weight: QuestionWeight; onChange: (patch: Partial<QuestionWeight>) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <input type="number" min={0} step={0.5} value={weight.points} onChange={e => onChange({ points: Number(e.target.value) || 0 })} title="points" style={{ width: 42, fontSize: 11, padding: '4px 5px', borderRadius: 6, border: '1px solid rgba(45,42,36,0.14)', background: '#fff', fontFamily: 'inherit', textAlign: 'center' as const }} />
      {!weight.eliminatory && (
        <button type="button" onClick={() => onChange({ negative: { ...weight.negative, enabled: !weight.negative.enabled } })} title="points négatifs" style={{ fontSize: 11, padding: '4px 7px', borderRadius: 6, border: weight.negative.enabled ? '1px solid rgba(184,90,74,0.4)' : '1px solid rgba(45,42,36,0.12)', background: weight.negative.enabled ? 'rgba(184,90,74,0.12)' : 'rgba(255,255,255,0.7)', color: weight.negative.enabled ? '#b85a4a' : '#9a948a', cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
      )}
      {!weight.eliminatory && weight.negative.enabled && (
        <input type="number" min={0} step={0.5} value={weight.negative.value} onChange={e => onChange({ negative: { ...weight.negative, value: Number(e.target.value) || 0 } })} title="valeur du point négatif" style={{ width: 42, fontSize: 11, padding: '4px 5px', borderRadius: 6, border: '1px solid rgba(184,90,74,0.3)', background: '#fff', fontFamily: 'inherit', textAlign: 'center' as const, color: '#b85a4a' }} />
      )}
      <button type="button" onClick={() => onChange({ eliminatory: !weight.eliminatory, negative: weight.eliminatory ? weight.negative : { ...weight.negative, enabled: false } })} title="question éliminatoire" style={{ fontSize: 11, padding: '4px 7px', borderRadius: 6, border: weight.eliminatory ? '1px solid rgba(184,90,74,0.4)' : '1px solid rgba(45,42,36,0.12)', background: weight.eliminatory ? '#b85a4a' : 'rgba(255,255,255,0.7)', color: weight.eliminatory ? '#fff' : '#9a948a', cursor: 'pointer', fontFamily: 'inherit' }}>⚑</button>
    </div>
  );
}

function Diff({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 9, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>diff</span>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < n ? '#a87a3a' : 'rgba(45,42,36,0.12)', display: 'inline-block' }} />)}
    </span>
  );
}

function answerSummary(q: { responseType: ResponseType; answer: string; choices: string[]; correctChoices: number[]; answerOptional?: boolean }): string {
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
  if (q.responseType === 'textuelle' && q.answerOptional) {
    return 'réponse libre · sans correction';
  }
  return q.answer || '(réponse non définie)';
}

function answerMissing(p: { responseType: ResponseType; answer: string; choices: string[]; correctChoices: number[]; answerOptional?: boolean }): boolean {
  // sans_reponse / sondage : l'absence de réponse est voulue, pas "manquante"
  if (p.responseType === 'sans_reponse' || p.responseType === 'sondage') return false;
  // textuelle marquée "réponse libre" : l'absence de réponse de référence est volontaire
  if (p.responseType === 'textuelle' && p.answerOptional) return false;
  if (p.responseType === 'qcm' || p.responseType === 'qcs') {
    return p.correctChoices.map((i) => p.choices[i]).filter(Boolean).length === 0;
  }
  if (p.responseType === 'matching' || p.responseType === 'ordre') {
    return p.choices.length === 0;
  }
  return !p.answer || !p.answer.trim();
}

function hasNoAnswer(q: Question): boolean {
  if (answerMissing(q)) return true;
  return q.parts.some((part) => answerMissing(part));
}


// calcule les sauts de page A4 : pour chaque indice (gi) dans la liste aplatie, indique si une nouvelle
// page commence à cet indice, et si l'en-tête de section affiché à cet endroit est une « (suite) »
// (saut au milieu d'une section). Un bloc de question n'est jamais coupé entre 2 pages.
type PaginationInfo = { pageStarts: Set<number>; continuationStarts: Set<number>; pageCount: number };

function computePagination(flat: { sectionIdx: number; q: Question }[], rowHeights: Record<string, number>): PaginationInfo {
  const pageStarts = new Set<number>();
  const continuationStarts = new Set<number>();
  let used = 0;
  let curSection = -1;
  flat.forEach((entry, gi) => {
    let extra = 0;
    if (entry.sectionIdx !== curSection) {
      extra += A4_SECTION_HEADER_HEIGHT;
      curSection = entry.sectionIdx;
    }
    const h = (rowHeights[entry.q.id] ?? A4_ROW_FALLBACK_HEIGHT) + A4_ROW_GAP;
    const total = extra + h;
    if (gi > 0 && used + total > A4_PAGE_HEIGHT) {
      pageStarts.add(gi);
      used = 0;
      if (extra === 0) {
        continuationStarts.add(gi);
        used += A4_SECTION_HEADER_HEIGHT;
      }
    }
    used += total;
  });
  return { pageStarts, continuationStarts, pageCount: pageStarts.size + 1 };
}

function defaultWeight(): QuestionWeight {
  return { points: 1, negative: { enabled: false, value: 0 }, eliminatory: false };
}

// espace de réponse générique affiché dans l'aperçu A4 — proportionné/structuré selon le type de réponse
function renderAnswerSpace(q: Question) {
  const blankLines = (n: number) => (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: 22 }}>
      {Array.from({ length: n }, (_, i) => <div key={i} style={{ borderBottom: '1px solid rgba(45,42,36,0.18)' }} />)}
    </div>
  );

  switch (q.responseType) {
    case 'sans_reponse':
      return null;
    case 'qcm':
    case 'qcs':
    case 'sondage': {
      if (q.choices.length === 0) return blankLines(3);
      return (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {q.choices.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 14, height: 14, border: '1.5px solid rgba(45,42,36,0.35)', borderRadius: q.responseType === 'qcm' ? 3 : 999, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: '#3a352c' }}>{c}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'matching': {
      if (q.choices.length === 0) return blankLines(3);
      const pairs = q.choices.map(c => c.split(' :: '));
      return (
        <div style={{ marginTop: 14, display: 'flex', gap: 32 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {pairs.map((p, i) => <div key={i} style={{ fontSize: 13, color: '#3a352c' }}>{i + 1}. {p[0]}</div>)}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {pairs.map((p, i) => <div key={i} style={{ fontSize: 13, color: '#3a352c' }}>{String.fromCharCode(65 + i)}. {p[1] ?? ''}</div>)}
          </div>
        </div>
      );
    }
    case 'ordre': {
      if (q.choices.length === 0) return blankLines(3);
      return (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {q.choices.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 26, height: 26, border: '1.5px solid rgba(45,42,36,0.35)', borderRadius: 6, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#3a352c' }}>{c}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'dessin':
      return <div style={{ marginTop: 14, height: 180, border: '1px dashed rgba(45,42,36,0.22)', borderRadius: 6 }} />;
    case 'audio':
      return <div style={{ marginTop: 14, height: 60, border: '1px dashed rgba(45,42,36,0.22)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, color: '#9a948a' }}>🎙 espace de réponse audio</div>;
    case 'fill_blank':
      return blankLines(3);
    case 'textuelle':
      return blankLines(q.textLines ?? 4);
    default:
      return blankLines(5);
  }
}

function defaultExamConfig(title?: string): ExamConfig {
  return {
    title: title ?? '',
    durationMinutes: 120,
    presentation: { identity: { nom: true, prenom: true, tag: true, classe: false }, customFields: [] },
    sections: [{ id: 'sec' + Date.now(), title: 'Section 1', questionIds: [] }],
    weighting: {},
  };
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function configQuestionIds(config: ExamConfig): string[] {
  return config.sections.flatMap(s => s.questionIds);
}

// aplatit toutes les sections en une liste ordonnée de questions
function flattenSections(sections: ExamSection[], allQuestions: Question[]): { sectionIdx: number; q: Question }[] {
  const flat: { sectionIdx: number; q: Question }[] = [];
  sections.forEach((sec, sIdx) => {
    sec.questionIds.forEach(id => {
      const q = allQuestions.find(p => p.id === id);
      if (q) flat.push({ sectionIdx: sIdx, q });
    });
  });
  return flat;
}

// déplace une question d'une position à une autre dans la liste aplatie,
// vers la section `targetSectionIdx`, puis reconstruit les questionIds de chaque section
function moveSectionRow(sections: ExamSection[], allQuestions: Question[], fromFlatIdx: number, toFlatIdx: number, targetSectionIdx: number): ExamSection[] {
  if (fromFlatIdx === toFlatIdx) return sections;
  const flat = flattenSections(sections, allQuestions);
  const moving = flat[fromFlatIdx];
  if (!moving) return sections;
  if (fromFlatIdx + 1 === toFlatIdx && moving.sectionIdx === targetSectionIdx) return sections;
  const withoutMoving = flat.filter((_, i) => i !== fromFlatIdx);
  let insertAt = 0;
  for (let i = 0; i < toFlatIdx; i++) {
    if (i !== fromFlatIdx) insertAt++;
  }
  insertAt = Math.max(0, Math.min(withoutMoving.length, insertAt));
  withoutMoving.splice(insertAt, 0, { sectionIdx: targetSectionIdx, q: moving.q });
  const newSections = sections.map(s => ({ ...s, questionIds: [] as string[] }));
  withoutMoving.forEach(entry => {
    newSections[entry.sectionIdx].questionIds.push(entry.q.id);
  });
  return newSections;
}

// ajoute/retire une question de l'examen : retrait si déjà présente, sinon ajout à la fin de la dernière section
function toggleQuestionInSections(sections: ExamSection[], id: string): ExamSection[] {
  const included = sections.some(s => s.questionIds.includes(id));
  let next = sections.map(s => ({ ...s, questionIds: s.questionIds.filter(qid => qid !== id) }));
  if (!included) {
    if (next.length === 0) next = [{ id: 'sec' + Date.now(), title: 'Section 1', questionIds: [] }];
    next[next.length - 1] = { ...next[next.length - 1], questionIds: [...next[next.length - 1].questionIds, id] };
  }
  return next;
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

// ---- HISTORY ----
function HistoryContent({ exams, justAddedId, onEdit, onNew, onDelete }: { exams: Exam[]; justAddedId: string | null; onEdit: (e: Exam) => void; onNew: () => void; onDelete: (e: Exam) => void }) {
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
                  <FileText size={18} color="#a87a3a" strokeWidth={1.75} />
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
                  <Settings size={14} strokeWidth={1.75} />
                </IconBtn>
                <IconBtn title="dupliquer"><Copy size={14} strokeWidth={1.75} /></IconBtn>
                <IconBtn title="exporter"><Download size={14} strokeWidth={1.75} /></IconBtn>
                <IconBtn title="supprimer" onClick={() => onDelete(e)}>
                  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2.5 4h9M5.5 4V2.5h3V4M5.5 6.5v4M8.5 6.5v4M3.5 4l.7 8h5.6l.7-8" stroke="#b85a4a" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </IconBtn>
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

function BankContent({ questions, pools, exams, openId, setOpenId, onEditQuestion, onNewQuestion, onSendOne, onCreatePool, onUpdatePool, onDeletePool, onDuplicateQuestion, onDeleteQuestion }: {
  questions: Question[];
  pools: Pool[];
  exams: Exam[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEditQuestion: (q: Question) => void;
  onNewQuestion: () => void;
  onSendOne: (id: string) => void;
  onCreatePool: (name: string) => string;
  onUpdatePool: (pool: Pool) => void;
  onDeletePool: (id: string) => void;
  onDuplicateQuestion: (q: Question) => void;
  onDeleteQuestion: (q: Question) => void;
}) {
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [filterQTypes, setFilterQTypes] = useState<string[]>([]);
  const [filterPools, setFilterPools] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<ResponseType[]>([]);
  const [filterDiffs, setFilterDiffs] = useState<number[]>([]);
  const [filterExams, setFilterExams] = useState<string[]>([]);
  const [filterAnswer, setFilterAnswer] = useState<string[]>([]);
  const [filterModes, setFilterModes] = useState<Record<string, FilterMode>>({});
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<FilterMode | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR.recent);

  function changeSortBy(value: SortBy) {
    setSortBy(value);
  }
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState('');
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<string | null>(null);
  const [pendingDeleteQuestion, setPendingDeleteQuestion] = useState<Question | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const allQTypes = Array.from(new Set(questions.map(q => q.questionType)));
  const allTypes = Array.from(new Set(questions.map(q => q.responseType)));
  const activeFilterCount = filterQTypes.length + filterPools.length + filterTypes.length + filterDiffs.length + filterExams.length + filterAnswer.length;

  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e: MouseEvent) {
      if (pendingDeleteLabel) return;
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen, pendingDeleteLabel]);

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
  function toggleQTypeFilter(qt: string) {
    setFilterQTypes(prev => prev.includes(qt) ? prev.filter(x => x !== qt) : [...prev, qt]);
  }
  function toggleAnswerFilter(id: string) {
    setFilterAnswer(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    clearMode(`answer:${id}`);
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
    setFilterQTypes([]);
    setFilterPools([]);
    setFilterTypes([]);
    setFilterDiffs([]);
    setFilterExams([]);
    setFilterAnswer([]);
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

  let filtered = questions.filter(q => {
    const qPools = new Set(q.pools);
    const qExamIds = new Set(q.examIds);
    const qDiff = q.difficulty.enabled ? q.difficulty.value : NO_DIFFICULTY;
    const neverExam = q.examIds.length === 0;
    const noAnswer = hasNoAnswer(q);

    if (filterQTypes.length && !filterQTypes.includes(q.questionType)) return false;
    if (posPools.length && !posPools.some(p => qPools.has(p))) return false;
    if (negPools.length && negPools.some(p => qPools.has(p))) return false;
    if (posTypes.length && !posTypes.some(t => t === q.responseType)) return false;
    if (negTypes.length && negTypes.some(t => t === q.responseType)) return false;
    if (posDiffs.length && !posDiffs.some(d => d === qDiff)) return false;
    if (negDiffs.length && negDiffs.some(d => d === qDiff)) return false;
    if (posExams.length && !posExams.some(f => f === NEVER_EXAM_ID ? neverExam : qExamIds.has(f))) return false;
    if (negExams.length && negExams.some(f => f === NEVER_EXAM_ID ? neverExam : qExamIds.has(f))) return false;
    if (posAnswer.length && !posAnswer.some(f => f === NO_ANSWER_ID ? noAnswer : true)) return false;
    if (negAnswer.length && negAnswer.some(f => f === NO_ANSWER_ID ? noAnswer : false)) return false;
    if (search.trim() && !(q.title + ' ' + q.content + ' ' + q.answer).toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'difficulty':
        return dir * ((a.difficulty.enabled ? a.difficulty.value : -1) - (b.difficulty.enabled ? b.difficulty.value : -1));
      case 'name':
        return dir * (a.title.trim() || a.content).localeCompare(b.title.trim() || b.content);
      case 'type':
        return dir * (RESPONSE_TYPE_LABELS[a.responseType] ?? '').localeCompare(RESPONSE_TYPE_LABELS[b.responseType] ?? '');
      case 'label': {
        const an = pools.find(p => p.id === a.pools[0])?.name ?? '';
        const bn = pools.find(p => p.id === b.pools[0])?.name ?? '';
        return dir * an.localeCompare(bn);
      }
      case 'recent':
        return dir * ((a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      default:
        return 0;
    }
  });

  function toggleExpandParts(id: string) {
    setExpandedParts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderQuestionBody(q: Question) {
    const open = openId === q.id;
    const hasParts = q.parts.length > 0;
    const partsExpanded = expandedParts.has(q.id);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: '#2d2a24', lineHeight: 1.45, marginBottom: 8 }}>
            {q.title.trim() || q.content || '(sans énoncé)'}
            {hasParts && (
              <button onClick={() => toggleExpandParts(q.id)} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 8, fontSize: 10.5, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(232,184,108,0.12)', color: '#7a4d20', cursor: 'pointer', fontFamily: 'inherit' }}>
                {q.parts.length + 1} parties {partsExpanded ? '▴' : '▾'}
              </button>
            )}
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
              <Settings size={13} strokeWidth={1.75} />
            </IconBtn>
            <IconBtn title="dupliquer la question" onClick={() => onDuplicateQuestion(q)}>
              <Copy size={13} strokeWidth={1.75} />
            </IconBtn>
            <IconBtn title="supprimer la question" onClick={() => setPendingDeleteQuestion(q)}>
              <svg width="13" height="13" viewBox="0 0 14 14"><path d="M2.5 3.5h9M5.5 3.5V2.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v1.3M3.5 3.5l.5 8.3a.8.8 0 0 0 .8.7h4.4a.8.8 0 0 0 .8-.7l.5-8.3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </IconBtn>
          </div>
          {open && <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(232,216,168,0.22)', borderRadius: 8, fontSize: 12.5, color: '#3a352c', lineHeight: 1.5 }}><span style={{ fontWeight: 600, color: '#7a4d20' }}>réponse · </span>{answerSummary(q)}</div>}
          {hasParts && partsExpanded && (
            <div style={{ marginTop: 10, borderTop: '1px solid rgba(168,122,58,0.18)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.parts.map((part, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(232,184,108,0.08)', border: '1px solid rgba(168,122,58,0.15)' }}>
                  <div style={{ fontSize: 11, color: '#a87a3a', marginBottom: 4 }}>Partie {i + 2}</div>
                  <div style={{ fontSize: 12.5, color: '#3a352c', marginBottom: 6 }}>{part.content || '(sans énoncé)'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <TypePill type={part.responseType} />
                    {part.difficulty.enabled && <Diff n={part.difficulty.value} />}
                    {part.duration.enabled && <span style={{ fontSize: 10.5, color: '#7a766d' }}>{part.duration.minutes}min {part.duration.seconds.toString().padStart(2, '0')}s</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#3a352c' }}><span style={{ fontWeight: 600, color: '#7a4d20' }}>réponse · </span>{answerSummary(part)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onSendOne(q.id); }} title="envoyer vers l'éditeur d'examen" style={{ alignSelf: 'stretch', flexShrink: 0, marginRight: -14, marginTop: -12, marginBottom: -12, paddingLeft: 28, paddingRight: 28, borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: '1px solid rgba(45,42,36,0.10)', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit', fontSize: 30, fontWeight: 600, display: 'flex', alignItems: 'center' }}>→</button>
      </div>
    );
  }

  const QTYPE_LABELS: Record<string, string> = { textuel: 'Textuel', visuel: 'Visuel', audio: 'Audio' };
  type ActiveFilter = { key: string; category: 'qtype' | 'pool' | 'type' | 'diff' | 'exam' | 'answer'; value: string | number; label: string; color?: string };
  const activeFilters: ActiveFilter[] = [
    ...filterQTypes.map(qt => ({ key: `qtype:${qt}`, category: 'qtype' as const, value: qt, label: QTYPE_LABELS[qt] ?? qt })),
    ...filterPools.map(id => ({ key: `pool:${id}`, category: 'pool' as const, value: id, label: pools.find(p => p.id === id)?.name ?? id, color: pools.find(p => p.id === id)?.color })),
    ...filterTypes.map(t => ({ key: `type:${t}`, category: 'type' as const, value: t, label: RESPONSE_TYPE_LABELS[t] ?? t })),
    ...filterDiffs.map(d => ({ key: `diff:${d}`, category: 'diff' as const, value: d, label: d === NO_DIFFICULTY ? 'sans difficulté' : `difficulté ${d}/5` })),
    ...filterExams.map(eid => ({ key: `exam:${eid}`, category: 'exam' as const, value: eid, label: eid === NEVER_EXAM_ID ? 'Nouveau' : (exams.find(ex => ex.id === eid)?.title ?? eid) })),
    ...filterAnswer.map(aid => ({ key: `answer:${aid}`, category: 'answer' as const, value: aid, label: 'Incomplète' })),
  ];
  const positiveFilters = activeFilters.filter(f => modeOf(f.key) === 'pos');
  const negativeFilters = activeFilters.filter(f => modeOf(f.key) === 'neg');

  function removeFilter(f: ActiveFilter) {
    switch (f.category) {
      case 'qtype': toggleQTypeFilter(f.value as string); break;
      case 'pool': togglePoolFilter(f.value as string); break;
      case 'type': toggleTypeFilter(f.value as ResponseType); break;
      case 'diff': toggleDiffFilter(f.value as number); break;
      case 'exam': toggleExamFilter(f.value as string); break;
      case 'answer': toggleAnswerFilter(f.value as string); break;
    }
  }

  return (
    <div style={{ padding: '20px 24px 24px', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24' }}>Banque de questions</div>
          </div>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 9 }}>
          <Search size={14} color="#7a766d" strokeWidth={1.75} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="chercher une question…" style={{ flex: 1, fontSize: 12.5, color: '#3a352c', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
        </div>
        <div ref={filterRef} style={{ position: 'relative' }}>
          <button onClick={() => setFilterOpen(o => !o)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 9, border: activeFilterCount > 0 ? '1px solid rgba(168,122,58,0.45)' : '1px solid rgba(45,42,36,0.10)', background: activeFilterCount > 0 ? 'rgba(232,184,108,0.18)' : 'rgba(255,255,255,0.7)', color: activeFilterCount > 0 ? '#7a4d20' : '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>
            filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾
          </button>
          {filterOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 300, background: '#fff', border: '1px solid rgba(45,42,36,0.10)', borderRadius: 12, boxShadow: '0 12px 32px rgba(45,42,36,0.16)', zIndex: 20, display: 'flex', flexDirection: 'column', maxHeight: 'min(520px, calc(100vh - 200px))' }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#2d2a24' }}>filtres</span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} style={{ fontSize: 11.5, color: '#a87a3a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>réinitialiser</button>
                )}
              </div>
              <div style={{ overflowY: 'auto', padding: '0 14px 14px', flex: 1, minHeight: 0 }}>
                {/* Type de question — visible seulement si plusieurs types présents dans la banque */}
                {allQTypes.length > 1 && <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>type de question</div>}
                {allQTypes.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {allQTypes.map(qt => {
                      const active = filterQTypes.includes(qt);
                      const labels: Record<string, string> = { textuel: 'Textuel', visuel: 'Visuel', audio: 'Audio' };
                      return (
                        <button key={qt} onClick={() => toggleQTypeFilter(qt)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                          {labels[qt] ?? qt}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Type de réponse */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>type de réponse</div>
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
                {/* Statut */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>statut</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {(() => {
                    const active = filterExams.includes(NEVER_EXAM_ID);
                    return (
                      <button onClick={() => toggleExamFilter(NEVER_EXAM_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                        Nouveau
                      </button>
                    );
                  })()}
                  {(() => {
                    const active = filterAnswer.includes(NO_ANSWER_ID);
                    return (
                      <button onClick={() => toggleAnswerFilter(NO_ANSWER_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                        Incomplète
                      </button>
                    );
                  })()}
                </div>
                {/* Libellés */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>libellés</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {pools.map(l => {
                    const active = filterPools.includes(l.id);
                    const displayName = l.name.length > 18 ? l.name.slice(0, 18) + '…' : l.name;
                    return (
                      <span key={l.id} style={{ position: 'relative', display: 'inline-flex' }}>
                        <button onClick={() => togglePoolFilter(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? '1px solid rgba(45,42,36,0.30)' : '1px solid rgba(45,42,36,0.10)', background: active ? '#2d2a24' : 'rgba(45,42,36,0.04)', color: active ? '#f4f0e6' : '#3a352c' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, display: 'inline-block' }} />{displayName}
                        </button>
                        <button onClick={() => editingLabel === l.id ? setEditingLabel(null) : openEditLabel(l)} title="modifier le libellé" style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', border: '1px solid rgba(45,42,36,0.15)', background: '#fff', color: '#9a948a', cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="7" height="7" viewBox="0 0 14 14"><path d="M9.8 1.6l2.6 2.6L4.8 11.8l-3 .6.6-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/></svg>
                        </button>
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
                {/* Difficulté */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>difficulté</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
              </div>
              {editingLabel && (() => {
                const label = pools.find(p => p.id === editingLabel);
                if (!label) return null;
                return (
                  <>
                  <div onClick={() => setEditingLabel(null)} style={{ position: 'absolute', inset: 0, zIndex: 29, background: 'rgba(252,249,242,0.7)', borderRadius: 12 }} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, width: 190, background: '#fff', border: '1px solid rgba(45,42,36,0.10)', borderRadius: 12, boxShadow: '0 12px 32px rgba(45,42,36,0.16)', padding: 10 }}>
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
                    <button onClick={() => setPendingDeleteLabel(label.id)} style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(184,90,74,0.30)', background: 'rgba(184,90,74,0.08)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit' }}>supprimer le libellé</button>
                  </div>
                  </>
                );
              })()}
            </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', borderRadius: 9, border: '1px solid rgba(45,42,36,0.10)', background: 'rgba(255,255,255,0.7)', overflow: 'hidden' }}>
          <button type="button" title={sortDir === 'asc' ? 'ordre croissant' : 'ordre décroissant'} onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')} style={{ width: 30, height: 30, border: 'none', borderRight: '1px solid rgba(45,42,36,0.10)', background: 'transparent', color: '#5a564c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 14 14">
              {sortDir === 'asc' ? (
                <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M7 2v10M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <select value={sortBy} onChange={e => changeSortBy(e.target.value as SortBy)} style={{ fontSize: 12, padding: '8px 10px', border: 'none', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
            <option value="recent">trier · date d'ajout</option>
            <option value="name">trier · nom</option>
            <option value="type">trier · type</option>
            <option value="difficulty">trier · difficulté</option>
            <option value="label">trier · libellé</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(q => (
          <div key={q.id} style={{ border: '1px solid rgba(45,42,36,0.08)', background: 'rgba(255,255,255,0.8)', borderRadius: 10, overflow: 'hidden' }}>
            {renderQuestionBody(q)}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: '#a87a3a', padding: '20px 0', textAlign: 'center' as const }}>« aucune question ne correspond à ces filtres »</div>
        )}
      </div>
      {pendingDeleteQuestion && (() => {
        const q = pendingDeleteQuestion;
        const affectedExams = exams.filter(e => (e.config?.sections ?? []).some(sec => sec.questionIds.includes(q.id)));
        return createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setPendingDeleteQuestion(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
            <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Supprimer cette question ?</div>
              <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: affectedExams.length > 0 ? 10 : 20 }}>
                Cette action est irréversible.
              </div>
              {affectedExams.length > 0 && (
                <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 9, background: 'rgba(184,90,74,0.08)', textAlign: 'left' as const }}>
                  <div style={{ fontSize: 11.5, color: '#b85a4a', marginBottom: 6 }}>Elle sera retirée des examens suivants :</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5a564c' }}>
                    {affectedExams.map(e => <li key={e.id}>{e.title}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPendingDeleteQuestion(null)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                <button onClick={() => { onDeleteQuestion(q); setPendingDeleteQuestion(null); }} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#b85a4a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Supprimer</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
      {pendingDeleteLabel && (() => {
        const label = pools.find(p => p.id === pendingDeleteLabel);
        if (!label) return null;
        const count = questions.filter(q => q.pools.includes(label.id)).length;
        return createPortal(
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
          </div>,
          document.body
        );
      })()}
    </div>
  );
}

// ---- GENERATOR / APERÇU EN DIRECT ----
function GeneratorContent({ questions, draftIds, config, onConfigChange, editing, onCancelEdit, onGenerate, onOpenQuestion, onRemoveFromDraft, onClearEditor }: {
  questions: Question[];
  draftIds: string[];
  config: ExamConfig;
  onConfigChange: (config: ExamConfig) => void;
  editing: Exam | null;
  onCancelEdit: () => void;
  onGenerate: () => void;
  onOpenQuestion: (id: string) => void;
  onRemoveFromDraft: (ids: string[]) => void;
  onClearEditor: () => void;
}) {
  const [dragFlatIdx, setDragFlatIdx] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [pendingRemoveSectionIdx, setPendingRemoveSectionIdx] = useState<number | null>(null);
  const [focusedSectionIdx, setFocusedSectionIdx] = useState<number | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [pendingRemoveFromDraftId, setPendingRemoveFromDraftId] = useState<string | null>(null);

  const includedIds = configQuestionIds(config);
  const available = draftIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q);
  const incompleteCount = includedIds.filter(id => {
    const q = questions.find(p => p.id === id);
    return q && (hasNoAnswer(q) || !q.content.trim());
  }).length;

  function handleGenerateClick() {
    if (incompleteCount > 0) {
      setConfirmGenerateOpen(true);
      return;
    }
    onGenerate();
  }

  const flat = flattenSections(config.sections, questions);
  let cursor = 0;
  const sectionRanges = config.sections.map(sec => {
    const count = sec.questionIds.filter(id => questions.some(q => q.id === id)).length;
    const r = { start: cursor, end: cursor + count };
    cursor += count;
    return r;
  });

  // mesure la hauteur réelle de chaque bloc de question pour calculer les sauts de page A4
  const qRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let changed = false;
    for (const [key, el] of Object.entries(qRefs.current)) {
      if (!el) continue;
      const h = el.offsetHeight;
      next[key] = h;
      if (Math.abs((rowHeights[key] ?? -1) - h) > 0.5) changed = true;
    }
    if (!changed) {
      for (const key of Object.keys(rowHeights)) {
        if (!(key in next)) { changed = true; break; }
      }
    }
    if (changed) setRowHeights(next);
  });
  const { pageStarts, continuationStarts, pageCount } = computePagination(flat, rowHeights);
  function pageNumberOf(gi: number): number {
    let n = 1;
    pageStarts.forEach(p => { if (p <= gi) n++; });
    return n;
  }

  function patchConfig(patch: Partial<ExamConfig>) {
    onConfigChange({ ...config, ...patch });
  }
  function updateSection(idx: number, patch: Partial<ExamSection>) {
    patchConfig({ sections: config.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) });
  }
  function addSection() {
    patchConfig({ sections: [...config.sections, { id: 'sec' + Date.now(), title: `Section ${config.sections.length + 1}`, questionIds: [] }] });
  }
  function removeSection(idx: number) {
    if (config.sections.length <= 1) return;
    if (config.sections[idx].questionIds.length === 0) {
      patchConfig({ sections: config.sections.filter((_, i) => i !== idx) });
      return;
    }
    setPendingRemoveSectionIdx(idx);
  }
  function confirmRemoveSection() {
    if (pendingRemoveSectionIdx === null) return;
    const idx = pendingRemoveSectionIdx;
    if (config.sections.length > 1) {
      patchConfig({ sections: config.sections.filter((_, i) => i !== idx) });
    }
    setPendingRemoveSectionIdx(null);
  }
  function updateWeight(id: string, patch: Partial<QuestionWeight>) {
    const current = config.weighting[id] ?? defaultWeight();
    patchConfig({ weighting: { ...config.weighting, [id]: { ...current, ...patch } } });
  }
  function handleDrop(targetFlatIdx: number, targetSectionIdx: number) {
    if (dragFlatIdx === null) return;
    patchConfig({ sections: moveSectionRow(config.sections, questions, dragFlatIdx, targetFlatIdx, targetSectionIdx) });
    setDragFlatIdx(null);
    setDropIndicator(null);
  }
  function toggleIdentity(key: keyof CandidateIdentity) {
    patchConfig({ presentation: { ...config.presentation, identity: { ...config.presentation.identity, [key]: !config.presentation.identity[key] } } });
  }
  function addCustomField() {
    const name = newFieldName.trim();
    if (!name) return;
    patchConfig({ presentation: { ...config.presentation, customFields: [...config.presentation.customFields, name] } });
    setNewFieldName('');
  }
  function removeCustomField(name: string) {
    patchConfig({ presentation: { ...config.presentation, customFields: config.presentation.customFields.filter(f => f !== name) } });
  }
  function toggleAvailable(id: string) {
    patchConfig({ sections: toggleQuestionInSections(config.sections, id) });
  }

  function requestRemoveFromDraft(id: string) {
    if (includedIds.includes(id)) {
      setPendingRemoveFromDraftId(id);
    } else {
      onRemoveFromDraft([id]);
    }
  }

  function confirmRemoveFromDraft() {
    if (!pendingRemoveFromDraftId) return;
    const id = pendingRemoveFromDraftId;
    const sections = config.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) }));
    const weighting = { ...config.weighting };
    delete weighting[id];
    onConfigChange({ ...config, sections, weighting });
    onRemoveFromDraft([id]);
    setPendingRemoveFromDraftId(null);
  }

  // repères visuels de pagination A4 — un bloc de question n'est jamais coupé entre 2 pages
  function pageLabel(n: number) {
    return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#bdb8ad', marginBottom: 10 }}>page {n} / {pageCount}</div>;
  }
  function pageBreakSeparator(gi: number) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 20px' }}>
        <div style={{ flex: 1, borderTop: '1px dashed rgba(45,42,36,0.15)' }} />
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#bdb8ad', whiteSpace: 'nowrap' as const }}>page {pageNumberOf(gi)} / {pageCount}</span>
        <div style={{ flex: 1, borderTop: '1px dashed rgba(45,42,36,0.15)' }} />
      </div>
    );
  }
  function continuationLabel(title: string) {
    return (
      <div style={{ fontSize: 12, fontWeight: 600, color: '#a87a3a', marginBottom: 8 }}>
        {title} <span style={{ fontWeight: 400, color: '#bdb8ad' }}>(suite)</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 24px 24px', height: '100%', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column', background: '#fbf7ef' }}>
      <div style={{ marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24' }}>Éditeur d&apos;examen</div>
          <div style={{ fontSize: 12.5, color: '#7a766d' }}>les questions s&apos;enchaînent dans cet ordre — glisse pour réorganiser</div>
        </div>
        <button onClick={() => setConfirmClearOpen(true)} style={{ flexShrink: 0, fontSize: 12, padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(184,90,74,0.28)', background: 'rgba(184,90,74,0.08)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit' }}>
          {editing ? 'annuler les modifications' : "réinitialiser l'éditeur"}
        </button>
      </div>
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(232,184,108,0.18)', border: '1px solid rgba(168,122,58,0.35)', marginBottom: 14, flexShrink: 0 }}>
          <span style={{ fontSize: 14, color: '#a87a3a' }}>✎</span>
          <div style={{ flex: 1, fontSize: 12.5, color: '#3a352c' }}>Modification de <b style={{ fontWeight: 600 }}>{editing.title}</b></div>
          <button onClick={onCancelEdit} style={{ fontSize: 11.5, color: '#7a4d20', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>annuler ✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid rgba(45,42,36,0.08)', paddingRight: 16, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d' }}>questions envoyées</div>
          <div style={{ fontSize: 11, color: '#9a948a', marginBottom: 4 }}>coche pour ajouter à l&apos;examen</div>
          {available.length === 0 && <div style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#a87a3a' }}>« envoie des questions depuis la banque »</div>}
          {available.map(q => {
            const included = includedIds.includes(q.id);
            const incomplete = hasNoAnswer(q) || !q.content.trim();
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 9px', borderRadius: 8, background: included ? 'rgba(79,107,64,0.08)' : 'rgba(255,255,255,0.7)', border: '1px solid rgba(45,42,36,0.06)' }}>
                <input type="checkbox" checked={included} onChange={() => toggleAvailable(q.id)} style={{ marginTop: 2, flexShrink: 0, accentColor: '#4f6b40' }} />
                {incomplete && (
                  <button onClick={() => onOpenQuestion(q.id)} title="question incomplète - cliquer pour compléter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: '50%', border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', padding: 0, flexShrink: 0, alignSelf: 'flex-start' }}><AlertTriangle size={10} strokeWidth={2} /></button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.content || '(sans énoncé)'}</div>
                  {q.parts.length > 0 && <span style={{ fontSize: 10.5, color: '#7a4d20' }}>{q.parts.length + 1} parties</span>}
                </div>
                <span onClick={() => requestRemoveFromDraft(q.id)} title="retirer de la liste" style={{ fontSize: 14, color: '#b85a4a', cursor: 'pointer', flexShrink: 0 }}>×</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 6 }}>intitulé</div>
          <input value={config.title} onChange={e => patchConfig({ title: e.target.value })} style={{ width: '100%', fontSize: 15, fontWeight: 500, color: '#2d2a24', border: '1px solid rgba(45,42,36,0.12)', borderRadius: 9, padding: '10px 12px', marginBottom: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />

          <div style={{ background: 'rgba(45,42,36,0.03)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 8 }}>présentation</div>
            <div style={{ fontSize: 11, color: '#5a564c', marginBottom: 6 }}>identité du candidat demandée</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 8 }}>
              {([['nom', 'nom'], ['prenom', 'prénom'], ['tag', 'tag'], ['classe', 'classe']] as [keyof CandidateIdentity, string][]).map(([key, label]) => {
                const active = config.presentation.identity[key];
                return (
                  <button key={key} type="button" onClick={() => toggleIdentity(key)} style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 999, border: active ? '1px solid rgba(79,107,64,0.35)' : '1px solid rgba(45,42,36,0.14)', background: active ? 'rgba(79,107,64,0.14)' : 'transparent', color: active ? '#4f6b40' : '#9a948a', cursor: 'pointer', fontFamily: 'inherit' }}>{label}</button>
                );
              })}
              {config.presentation.customFields.map(f => (
                <span key={f} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 6px 5px 11px', borderRadius: 999, border: '1px solid rgba(79,107,64,0.35)', background: 'rgba(79,107,64,0.14)', color: '#4f6b40' }}>
                  {f}
                  <button onClick={() => removeCustomField(f)} style={{ border: 'none', background: 'none', color: '#4f6b40', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }} placeholder="champ personnalisé…" style={{ flex: 1, fontSize: 11.5, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(45,42,36,0.12)', background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
              <button type="button" onClick={addCustomField} style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>+ ajouter</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>questions</div>
              <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{includedIds.length}</div>
            </div>
            <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>sections</div>
              <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{config.sections.length}</div>
            </div>
            <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>pages</div>
              <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{pageCount}</div>
            </div>
            <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>durée</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
                <input type="number" min={5} step={5} value={config.durationMinutes} onChange={e => patchConfig({ durationMinutes: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 50, fontSize: 14, color: '#2d2a24', fontWeight: 500, border: 'none', background: 'transparent', fontFamily: 'inherit', padding: 0, outline: 'none' }} />
                <span style={{ fontSize: 11, color: '#9a948a' }}>min · {formatDuration(config.durationMinutes)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d' }}>déroulé de l&apos;examen</div>
            <button type="button" onClick={addSection} style={{ fontSize: 11, color: '#4f6b40', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+ section</button>
          </div>

          {config.sections.map((section, sIdx) => {
            const range = sectionRanges[sIdx];
            const rowsInSection = flat.slice(range.start, range.end);
            return (
              <div key={section.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, position: 'relative' as const }}>
                    <input
                      value={section.title}
                      onChange={e => updateSection(sIdx, { title: e.target.value })}
                      onFocus={() => setFocusedSectionIdx(sIdx)}
                      onBlur={() => setFocusedSectionIdx(null)}
                      style={{ width: '100%', fontSize: 12.5, fontWeight: 600, color: '#7a4d20', background: focusedSectionIdx === sIdx ? 'rgba(168,122,58,0.08)' : 'transparent', border: focusedSectionIdx === sIdx ? '1px solid rgba(168,122,58,0.20)' : '1px solid transparent', borderRadius: 7, padding: '6px 28px 6px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    <span style={{ position: 'absolute' as const, right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'rgba(168,122,58,0.45)', pointerEvents: 'none' as const }}>✎</span>
                  </div>
                  {config.sections.length > 1 && (
                    <button type="button" onClick={() => removeSection(sIdx)} title="supprimer la section" style={{ fontSize: 13, color: '#b85a4a', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {rowsInSection.length === 0 && (
                    <div
                      onDragOver={e => { e.preventDefault(); if (dragFlatIdx !== null) setDropIndicator(range.start); }}
                      onDrop={e => { e.preventDefault(); handleDrop(range.start, sIdx); }}
                      style={{ fontSize: 11.5, color: '#bdb8ad', padding: '14px', textAlign: 'center' as const, border: '1px dashed rgba(45,42,36,0.12)', borderRadius: 9, background: dropIndicator === range.start && dragFlatIdx !== null ? 'rgba(168,122,58,0.08)' : 'transparent' }}
                    >
                      section vide — glisse une question ici
                    </div>
                  )}
                  {(() => {
                    type FlatQ = { gi: number; localIdx: number; subStart: number; q: Question };
                    let subCursor = 1;
                    const subStarts = rowsInSection.map(entry => {
                      const start = subCursor;
                      subCursor += 1 + entry.q.parts.length;
                      return start;
                    });
                    const chunks: FlatQ[][] = [];
                    let current: FlatQ[] = [];
                    rowsInSection.forEach((entry, localIdx) => {
                      const gi = range.start + localIdx;
                      if (localIdx > 0 && pageStarts.has(gi)) {
                        chunks.push(current);
                        current = [];
                      }
                      current.push({ gi, localIdx, subStart: subStarts[localIdx], q: entry.q });
                    });
                    if (current.length > 0) chunks.push(current);
                    const incompleteIcon = (id: string) => (
                      <button onClick={() => onOpenQuestion(id)} title="question incomplète - cliquer pour compléter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', padding: 0, flexShrink: 0 }}><AlertTriangle size={13} strokeWidth={2} /></button>
                    );
                    return chunks.map((chunk, chunkIdx) => (
                      <div key={chunkIdx}>
                        {chunk[0].gi === 0 && pageCount > 1 && pageLabel(1)}
                        {pageStarts.has(chunk[0].gi) && pageBreakSeparator(chunk[0].gi)}
                        {continuationStarts.has(chunk[0].gi) && continuationLabel(section.title)}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'center' }}>
                          <div style={{ width: 26, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                            {chunk.map(({ gi, q }) => {
                              const rh = rowHeights[q.id];
                              const incomplete = hasNoAnswer(q);
                              return (
                                <div key={q.id} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 20, boxSizing: 'border-box' as const, opacity: dragFlatIdx === gi ? 0.4 : 1 }}>
                                  <span draggable onDragStart={() => setDragFlatIdx(gi)} onDragEnd={() => { setDragFlatIdx(null); setDropIndicator(null); }} title="glisser pour réorganiser" style={{ cursor: 'grab', color: '#c8c2b6', fontSize: 13, lineHeight: 1, userSelect: 'none' as const }}>⠿</span>
                                  {incomplete && incompleteIcon(q.id)}
                                </div>
                              );
                            })}
                          </div>

                          <div style={{ width: A4_BLOCK_WIDTH, flexShrink: 0, background: '#fff', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 4, boxShadow: '0 2px 14px rgba(45,42,36,0.06)', overflow: 'hidden' }}>
                            {chunk.map(({ gi, subStart, q }, idxInChunk) => {
                              const showLineBefore = dragFlatIdx !== null && dragFlatIdx !== gi && dragFlatIdx !== gi - 1 && dropIndicator === gi;
                              const dragOverProps = {
                                onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragFlatIdx === null) return; const rect = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - rect.top) < rect.height / 2; setDropIndicator(before ? gi : gi + 1); },
                                onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dropIndicator !== null) handleDrop(dropIndicator, sIdx); else setDragFlatIdx(null); },
                              };
                              const divider = idxInChunk > 0 ? '1px solid rgba(45,42,36,0.08)' : 'none';
                              const incomplete = hasNoAnswer(q);
                              return (
                                <div key={q.id} {...dragOverProps} ref={el => { qRefs.current[q.id] = el; }} style={{ borderTop: divider, background: incomplete ? 'rgba(184,90,74,0.04)' : 'transparent' }}>
                                  <div style={{ height: showLineBefore ? 3 : 0, background: '#a87a3a', transition: 'all 0.1s' }} />
                                  <div style={{ padding: '20px 34px' }}>
                                    <div style={{ fontSize: 14, color: '#2d2a24', lineHeight: 1.6 }}>
                                      <span style={{ color: '#a87a3a', fontWeight: 600, marginRight: 8 }}>{subStart}.</span>
                                      {q.content || '(sans énoncé)'}
                                    </div>
                                    {renderAnswerSpace(q)}
                                    {q.parts.map((part, pi) => (
                                      <div key={pi} style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(45,42,36,0.08)' }}>
                                        <div style={{ fontSize: 14, color: '#2d2a24', lineHeight: 1.6 }}>
                                          <span style={{ color: '#a87a3a', fontWeight: 600, marginRight: 8 }}>{subStart + pi + 1}.</span>
                                          {part.content || '(sans énoncé)'}
                                        </div>
                                        {renderAnswerSpace({ ...q, responseType: part.responseType, answer: part.answer, choices: part.choices, correctChoices: part.correctChoices, textLines: part.textLines })}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div style={{ width: 86, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                            {chunk.map(({ gi, q }) => {
                              const rh = rowHeights[q.id];
                              return (
                                <div key={q.id} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 20, boxSizing: 'border-box' as const }}>
                                  <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>{String(gi + 1).padStart(2, '0')}</span>
                                  <WeightControls weight={config.weighting[q.id] ?? defaultWeight()} onChange={patch => updateWeight(q.id, patch)} />
                                  <span onClick={() => toggleAvailable(q.id)} title="retirer de l'examen" style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            );
          })}

          {dragFlatIdx !== null && (
            <div
              onDragOver={e => { e.preventDefault(); setDropIndicator(flat.length); }}
              onDrop={e => { e.preventDefault(); handleDrop(flat.length, config.sections.length - 1); }}
              style={{ height: 18, marginTop: -8, marginBottom: 14, borderRadius: 6, background: dropIndicator === flat.length ? 'rgba(168,122,58,0.12)' : 'transparent', border: dropIndicator === flat.length ? '1px dashed rgba(168,122,58,0.4)' : '1px dashed transparent' }}
            />
          )}

          <button onClick={handleGenerateClick} style={{ width: '100%', padding: '9px', borderRadius: 9, background: '#4f6b40', border: 'none', color: '#f4f0e6', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' as const }}>
            {editing ? 'enregistrer les modifications' : "enregistrer l'examen"}
          </button>
        </div>
      </div>
      {pendingRemoveSectionIdx !== null && (() => {
        const section = config.sections[pendingRemoveSectionIdx];
        if (!section) return null;
        const count = section.questionIds.filter(id => questions.some(q => q.id === id)).length;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setPendingRemoveSectionIdx(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
            <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Supprimer la section « {section.title} » ?</div>
              <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
                Les {count} question{count > 1 ? 's' : ''} de cette section ne seront plus dans l&apos;examen et retourneront dans la liste des questions envoyées.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPendingRemoveSectionIdx(null)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                <button onClick={confirmRemoveSection} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#b85a4a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Supprimer</button>
              </div>
            </div>
          </div>
        );
      })()}
      {confirmClearOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setConfirmClearOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>{editing ? 'Annuler les modifications ?' : "Effacer l'éditeur d'examen ?"}</div>
            <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
              {editing
                ? <>Les modifications en cours sur <strong style={{ color: '#2d2a24' }}>{editing.title}</strong> seront abandonnées. L&apos;examen déjà enregistré n&apos;est pas affecté.</>
                : "L'intitulé, les sections, la pondération et les questions envoyées seront réinitialisés."}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClearOpen(false)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={() => { setConfirmClearOpen(false); onClearEditor(); }} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#b85a4a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>{editing ? 'Annuler les modifications' : 'Effacer'}</button>
            </div>
          </div>
        </div>
      )}
      {confirmGenerateOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setConfirmGenerateOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Enregistrer malgré tout ?</div>
            <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
              {incompleteCount} question{incompleteCount > 1 ? 's' : ''} de cet examen {incompleteCount > 1 ? 'sont incomplètes' : 'est incomplète'} (sans réponse associée ou sans énoncé).
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmGenerateOpen(false)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={() => { setConfirmGenerateOpen(false); onGenerate(); }} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#4f6b40', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
      {pendingRemoveFromDraftId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setPendingRemoveFromDraftId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Retirer cette question ?</div>
            <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
              Elle est cochée dans l&apos;examen en cours — la retirer de la liste des questions envoyées la retirera aussi de l&apos;aperçu.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPendingRemoveFromDraftId(null)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={confirmRemoveFromDraft} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#b85a4a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Retirer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- PANEL TITLES ----
const META: Record<string, string> = { history: 'Examen généré', bank: 'Banque de questions', generator: "Éditeur d'examen" };
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
  const [pendingDeleteExam, setPendingDeleteExam] = useState<Exam | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig>(defaultExamConfig());
  const [pendingEditExam, setPendingEditExam] = useState<Exam | null>(null);
  const [openQuestionBlocked, setOpenQuestionBlocked] = useState(false);

  function isEditorEmpty() {
    return editing === null && draftIds.length === 0 && examConfig.title.trim() === '' && configQuestionIds(examConfig).length === 0;
  }

  function requestEditExam(e: Exam) {
    if (editing?.id === e.id || isEditorEmpty()) {
      setEditing(e);
      setDraftIds(e.questionIds ?? []);
      setExamConfig(e.config?.sections ? e.config : defaultExamConfig(e.title));
      focus('generator');
    } else {
      setPendingEditExam(e);
    }
  }

  const GAP = 16;
  const SIDE_W = 320;
  const draftLoaded = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getExamBankData(workshopId), getExamDraft(workshopId)]).then(([{ questions, pools, exams }, draft]) => {
      const mappedExams = exams.map(e => ({ id: e.id, title: e.title, date: e.date, q: e.q, dur: e.dur, avg: e.avg, status: e.status, taken: e.taken, questionIds: e.questionIds, config: e.config }));
      setQuestions(questions);
      setPools(pools);
      setExams(mappedExams);
      if (draft) {
        setDraftIds(draft.draftIds);
        setExamConfig(draft.config?.sections ? draft.config : defaultExamConfig());
        if (draft.editingId) {
          const found = mappedExams.find(e => e.id === draft.editingId);
          if (found) setEditing(found);
        }
      }
    }).catch(err => console.error('chargement banque de questions échoué', err))
      .finally(() => { draftLoaded.current = true; });
  }, [workshopId]);

  // sauvegarde du brouillon de l'éditeur d'examen (reprise après reconnexion / le lendemain)
  useEffect(() => {
    if (!draftLoaded.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveExamDraft(workshopId, { draftIds, config: examConfig, editingId: editing?.id ?? null }).catch(err => console.error('sauvegarde du brouillon échouée', err));
    }, 800);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [workshopId, draftIds, examConfig, editing]);

  function handleClearEditor() {
    setEditing(null);
    setDraftIds([]);
    setExamConfig(defaultExamConfig());
  }

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
    const title = examConfig.title;
    const questionIds = configQuestionIds(examConfig);
    const dur = formatDuration(examConfig.durationMinutes);
    const saved: Exam = editing
      ? { ...editing, title, date: "aujourd'hui", q: questionIds.length, dur, questionIds, config: examConfig }
      : { id, title, date: "aujourd'hui", q: questionIds.length, dur, avg: '—', status: 'brouillon', taken: 0, questionIds, config: examConfig };
    setExams(prev => {
      if (editing) {
        const rest = prev.filter(e => e.id !== editing.id);
        return [saved, ...rest];
      }
      return [saved, ...prev];
    });
    const hotId = editing ? editing.id : id;
    setJustAdded(hotId);
    setEditing(null);
    setDraftIds([]);
    setExamConfig(defaultExamConfig());
    focus('history');
    setTimeout(() => setJustAdded(cur => cur === hotId ? null : cur), 2600);
    saveGeneratedExam(workshopId, saved).catch(err => console.error('enregistrement examen échoué', err));
  }

  function handleDeleteExam(exam: Exam) {
    setExams(prev => prev.filter(e => e.id !== exam.id));
    setPendingDeleteExam(null);
    if (editing?.id === exam.id) {
      setEditing(null);
      setDraftIds([]);
      setExamConfig(defaultExamConfig());
    }
    deleteGeneratedExam(workshopId, exam.id).catch(err => console.error('suppression de l\'examen échouée', err));
  }

  function handleOpenQuestion(id: string) {
    const q = questions.find(p => p.id === id);
    if (!q) return;
    if (editingQuestion && editingQuestion.id !== id) {
      setOpenQuestionBlocked(true);
      setTimeout(() => setOpenQuestionBlocked(false), 2200);
      return;
    }
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
    const copy: Question = { ...q, id: 'q' + Date.now() + Math.random().toString(36).slice(2, 7), examIds: [] };
    setQuestions(prev => [copy, ...prev]);
    saveQuestion(workshopId, copy).catch(err => console.error('duplication de la question échouée', err));
  }

  function handleDeleteQuestion(deleted: Question) {
    const id = deleted.id;

    setQuestions(prev => prev.filter(q => q.id !== id));

    // retrait des sections d'examens générés qui référencent la question
    const updatedExams: Exam[] = [];
    setExams(prev => prev.map(e => {
      if (!e.config) return e;
      if (!e.config.sections.some(sec => sec.questionIds.includes(id))) return e;
      const sections = e.config.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) }));
      const weighting = { ...e.config.weighting };
      delete weighting[id];
      const config = { ...e.config, sections, weighting };
      const questionIds = configQuestionIds(config);
      const next = { ...e, config, questionIds, q: questionIds.length };
      updatedExams.push(next);
      return next;
    }));
    updatedExams.forEach(next => saveGeneratedExam(workshopId, next).catch(err => console.error('mise à jour de l\'examen échouée', err)));

    // retrait de l'éditeur d'examen en cours
    setDraftIds(prev => prev.filter(qid => qid !== id));
    setExamConfig(prev => {
      if (!prev.sections.some(sec => sec.questionIds.includes(id))) return prev;
      const sections = prev.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) }));
      const weighting = { ...prev.weighting };
      delete weighting[id];
      return { ...prev, sections, weighting };
    });

    deleteQuestionAction(workshopId, id, []).catch(err => console.error('suppression de la question échouée', err));
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

  function handleSendOne(id: string) {
    setDraftIds(prev => prev.includes(id) ? prev : [id, ...prev]);
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
              <div style={{ position: 'absolute', top: 0, left: 0, width: mainW, height: r.h / s, transform: `scale(${s})`, transformOrigin: '0 0', overflowY: id === 'generator' ? 'hidden' : 'auto', overflowX: 'hidden', background: id === 'generator' ? '#fbf7ef' : '#fcf9f2' }}>
                {id === 'history' && <HistoryContent exams={exams} justAddedId={justAdded} onEdit={requestEditExam} onNew={() => { setEditing(null); setExamConfig(defaultExamConfig()); focus('generator'); }} onDelete={e => setPendingDeleteExam(e)} />}
                {id === 'bank' && (
                  <BankContent
                    questions={questions}
                    pools={pools}
                    exams={exams}
                    openId={openId}
                    setOpenId={setOpenId}
                    onEditQuestion={q => setEditingQuestion(q)}
                    onNewQuestion={() => setEditingQuestion(emptyQuestion())}
                    onSendOne={handleSendOne}
                    onCreatePool={handleCreatePool}
                    onUpdatePool={handleUpdatePool}
                    onDeletePool={handleDeletePool}
                    onDuplicateQuestion={handleDuplicateQuestion}
                    onDeleteQuestion={handleDeleteQuestion}
                  />
                )}
                {id === 'generator' && <GeneratorContent questions={questions} draftIds={draftIds} config={examConfig} onConfigChange={setExamConfig} editing={editing} onCancelEdit={() => setEditing(null)} onGenerate={handleGenerate} onOpenQuestion={handleOpenQuestion} onRemoveFromDraft={handleRemoveFromDraft} onClearEditor={handleClearEditor} />}
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
      {pendingDeleteExam && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setPendingDeleteExam(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: '#fcf9f2', borderRadius: 20, padding: '32px 28px 24px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>!</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#2d2a24' }}>Supprimer l&apos;examen ?</div>
            <div style={{ fontSize: 13, color: '#5a564c', lineHeight: 1.5 }}>
              <strong style={{ color: '#2d2a24' }}>{pendingDeleteExam.title}</strong>
              <br />Cette action est irréversible.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
              <button onClick={() => setPendingDeleteExam(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(45,42,36,0.15)', background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: '#5a564c', cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => pendingDeleteExam && handleDeleteExam(pendingDeleteExam)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#b85a4a', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#fff', cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {pendingEditExam && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setPendingEditExam(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
          <div style={{ position: 'relative', zIndex: 1, background: '#fcf9f2', borderRadius: 20, padding: '32px 28px 24px', maxWidth: 380, width: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>!</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#2d2a24' }}>Éditeur déjà en cours d&apos;utilisation</div>
            <div style={{ fontSize: 13, color: '#5a564c', lineHeight: 1.5 }}>
              L&apos;éditeur d&apos;examen contient déjà des modifications en cours{editing ? <> pour <strong style={{ color: '#2d2a24' }}>{editing.title}</strong></> : ''}. Termine ou efface l&apos;éditeur avant de modifier <strong style={{ color: '#2d2a24' }}>{pendingEditExam.title}</strong>.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, width: '100%' }}>
              <button onClick={() => setPendingEditExam(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(45,42,36,0.15)', background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: '#5a564c', cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => { setPendingEditExam(null); focus('generator'); }} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#4f6b40', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, color: '#fff', cursor: 'pointer' }}>Aller à l&apos;éditeur</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {openQuestionBlocked && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: '#2d2a24', color: '#f4f0e6', fontFamily: "'Inter Tight', system-ui, sans-serif", fontSize: 12.5, boxShadow: '0 12px 32px rgba(45,42,36,0.30)' }}>
          <AlertTriangle size={14} strokeWidth={2} color="#e8b86c" />
          question déjà en cours d&apos;édition
        </div>,
        document.body
      )}
    </div>
  );
}
