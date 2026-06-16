'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
const LINKED_ID = '__linked__';

// pagination de l'aperçu A4 (panneau « Éditeur d'examen ») — dimensions en px pour un bloc de 880px de large
const A4_PAGE_HEIGHT = 1245; // ≈ ratio A4 (210×297mm) pour un bloc de 880px de large
const A4_ROW_GAP = 0; // les questions sont désormais collées (un seul bloc continu par section) — pas de marge entre lignes
const A4_SECTION_HEADER_HEIGHT = 44; // hauteur approx. de la barre de titre de section (+ marge)
const A4_ROW_FALLBACK_HEIGHT = 330; // hauteur estimée avant la première mesure réelle
const A4_BLOCK_WIDTH = 880; // largeur du bloc question au format A4 dans l'aperçu

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

function rowKey(row: Row): string {
  return row.kind === 'group' ? row.ids.join(',') : row.q.id;
}

// calcule les sauts de page A4 : pour chaque indice (gi) dans la liste aplatie, indique si une nouvelle
// page commence à cet indice, et si l'en-tête de section affiché à cet endroit est une « (suite) »
// (saut au milieu d'une section). Un bloc de question n'est jamais coupé entre 2 pages.
type PaginationInfo = { pageStarts: Set<number>; continuationStarts: Set<number>; pageCount: number };

function computePagination(flat: { sectionIdx: number; row: Row }[], rowHeights: Record<string, number>): PaginationInfo {
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
    const h = (rowHeights[rowKey(entry.row)] ?? A4_ROW_FALLBACK_HEIGHT) + A4_ROW_GAP;
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

// aplatit toutes les sections en une liste ordonnée de lignes (questions seules ou groupes liés)
function flattenSections(sections: ExamSection[], allQuestions: Question[]): { sectionIdx: number; row: Row }[] {
  const flat: { sectionIdx: number; row: Row }[] = [];
  sections.forEach((sec, sIdx) => {
    const secQuestions = sec.questionIds.map(id => allQuestions.find(q => q.id === id)).filter((q): q is Question => !!q);
    groupIntoRows(secQuestions, allQuestions).forEach(row => flat.push({ sectionIdx: sIdx, row }));
  });
  return flat;
}

// déplace une ligne (question ou groupe lié) d'une position à une autre dans la liste aplatie,
// vers la section `targetSectionIdx` (passée explicitement par l'appelant, qui connaît la section
// de la zone de dépôt — y compris pour une section vide, où on ne peut pas l'inférer des lignes voisines),
// puis reconstruit les questionIds de chaque section
function moveSectionRow(sections: ExamSection[], allQuestions: Question[], fromFlatIdx: number, toFlatIdx: number, targetSectionIdx: number): ExamSection[] {
  if (fromFlatIdx === toFlatIdx) return sections;
  const flat = flattenSections(sections, allQuestions);
  const moving = flat[fromFlatIdx];
  if (!moving) return sections;
  // un déplacement vers la position suivante n'est un no-op que si la section cible est la même
  // (sinon, ex. dernière question d'une section déposée dans la section suivante vide, il faut bien déplacer)
  if (fromFlatIdx + 1 === toFlatIdx && moving.sectionIdx === targetSectionIdx) return sections;
  const withoutMoving = flat.filter((_, i) => i !== fromFlatIdx);
  let insertAt = 0;
  for (let i = 0; i < toFlatIdx; i++) {
    if (i !== fromFlatIdx) insertAt++;
  }
  insertAt = Math.max(0, Math.min(withoutMoving.length, insertAt));
  withoutMoving.splice(insertAt, 0, { sectionIdx: targetSectionIdx, row: moving.row });
  const newSections = sections.map(s => ({ ...s, questionIds: [] as string[] }));
  withoutMoving.forEach(entry => {
    newSections[entry.sectionIdx].questionIds.push(...rowMembers(entry.row).map(q => q.id));
  });
  return newSections;
}

// ajoute/retire un ensemble d'ids (question seule ou groupe lié) de l'examen :
// retrait s'ils sont tous déjà présents, sinon ajout à la fin de la dernière section
function toggleQuestionsInSections(sections: ExamSection[], ids: string[]): ExamSection[] {
  const allIncluded = ids.every(id => sections.some(s => s.questionIds.includes(id)));
  let next = sections.map(s => ({ ...s, questionIds: s.questionIds.filter(id => !ids.includes(id)) }));
  if (!allIncluded) {
    if (next.length === 0) next = [{ id: 'sec' + Date.now(), title: 'Section 1', questionIds: [] }];
    next[next.length - 1] = { ...next[next.length - 1], questionIds: [...next[next.length - 1].questionIds, ...ids] };
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

// ---- LINK ORDER MODAL ----
function LinkOrderModal({ questions, onConfirm, onCancel }: { questions: Question[]; onConfirm: (orderedIds: string[]) => void; onCancel: () => void }) {
  const [order, setOrder] = useState<string[]>(questions.map(q => q.id));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);

  function reorderInsert(from: number, insertBefore: number) {
    if (insertBefore === from || insertBefore === from + 1) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    const to = from < insertBefore ? insertBefore - 1 : insertBefore;
    next.splice(to, 0, item);
    setOrder(next);
  }

  const ordered = order.map(id => questions.find(q => q.id === id)!);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width: 460, maxWidth: '92vw', maxHeight: '85vh', background: '#fcf9f2', borderRadius: 20, padding: '22px 24px', boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#2d2a24', marginBottom: 4, flexShrink: 0 }}>Lier {questions.length} questions</div>
        <div style={{ fontSize: 12, color: '#7a766d', marginBottom: 16, flexShrink: 0 }}>elles sortiront toujours ensemble, dans cet ordre, dans un examen — glisse-les pour réorganiser</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {ordered.map((q, i) => {
            const showLineBefore = dragIndex !== null && dragIndex !== i && dragIndex !== i - 1 && dropIndicator === i;
            return (
              <div key={q.id}>
                <div style={{
                  height: showLineBefore ? 3 : 0,
                  background: '#a87a3a',
                  borderRadius: 2,
                  margin: showLineBefore ? '0 0 4px' : '0',
                  transition: 'all 0.1s',
                }} />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex === null) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const before = (e.clientY - rect.top) < rect.height / 2;
                    setDropIndicator(before ? i : i + 1);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dropIndicator !== null) reorderInsert(dragIndex, dropIndicator);
                    setDragIndex(null);
                    setDropIndicator(null);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 9,
                    opacity: dragIndex === i ? 0.4 : 1, transition: 'opacity 0.12s',
                  }}
                >
                  <span
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragEnd={() => { setDragIndex(null); setDropIndicator(null); }}
                    title="glisser pour réorganiser"
                    style={{ cursor: 'grab', color: '#c8c2b6', fontSize: 13, lineHeight: 1, padding: '0 2px', flexShrink: 0, userSelect: 'none' as const }}
                  >
                    ⠿
                  </span>
                  <span style={{ fontSize: 11, color: '#a87a3a', fontVariantNumeric: 'tabular-nums', width: 16, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.content || '(sans énoncé)'}</span>
                </div>
              </div>
            );
          })}
          {(() => {
            const showLineAfter = dragIndex !== null && dragIndex !== ordered.length - 1 && dropIndicator === ordered.length;
            return (
              <div style={{
                height: showLineAfter ? 3 : 0,
                background: '#a87a3a',
                borderRadius: 2,
                margin: showLineAfter ? '0 0 4px' : '0',
                transition: 'all 0.1s',
              }} />
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
          <button onClick={() => onConfirm(order)} style={{ flex: 2, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#2d2a24', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Lier les questions</button>
        </div>
      </div>
    </div>
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

function BankContent({ questions, pools, exams, selected, onToggle, onToggleGroup, onDeselectAll, openId, setOpenId, onEditQuestion, onNewQuestion, onRequestLink, onSendToGenerator, onUnlinkGroup, onCreatePool, onUpdatePool, onDeletePool, onDuplicateQuestion, onDeleteQuestion }: {
  questions: Question[];
  pools: Pool[];
  exams: Exam[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onDeselectAll: () => void;
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
  onDeleteQuestion: (q: Question) => void;
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
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR.difficulty);

  function changeSortBy(value: SortBy) {
    setSortBy(value);
    setSortDir(DEFAULT_SORT_DIR[value]);
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
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'difficulty':
        return dir * ((qa.difficulty.enabled ? qa.difficulty.value : -1) - (qb.difficulty.enabled ? qb.difficulty.value : -1));
      case 'name':
        return dir * qa.content.localeCompare(qb.content);
      case 'type':
        return dir * (RESPONSE_TYPE_LABELS[qa.responseType] ?? '').localeCompare(RESPONSE_TYPE_LABELS[qb.responseType] ?? '');
      case 'label': {
        const an = pools.find(p => p.id === qa.pools[0])?.name ?? '';
        const bn = pools.find(p => p.id === qb.pools[0])?.name ?? '';
        return dir * an.localeCompare(bn);
      }
      case 'recent':
        return dir * ((qa.createdAt ?? '').localeCompare(qb.createdAt ?? ''));
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
            <IconBtn title="supprimer la question" onClick={() => setPendingDeleteQuestion(q)}>
              <svg width="13" height="13" viewBox="0 0 14 14"><path d="M2.5 3.5h9M5.5 3.5V2.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v1.3M3.5 3.5l.5 8.3a.8.8 0 0 0 .8.7h4.4a.8.8 0 0 0 .8-.7l.5-8.3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
            <button onClick={onDeselectAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(45,42,36,0.16)', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>
              désélectionner
            </button>
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
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>statut</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
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
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#9a948a', marginBottom: 8 }}>libellés</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
      {pendingDeleteQuestion && (() => {
        const q = pendingDeleteQuestion;
        const affectedExams = exams.filter(e => (e.config?.sections ?? []).some(sec => sec.questionIds.includes(q.id)));
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setPendingDeleteQuestion(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
            <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Supprimer cette question ?</div>
              <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: affectedExams.length > 0 ? 10 : 20 }}>
                {q.linkedQuestionIds.length > 1 ? 'Elle sera retirée de son groupe de questions liées. ' : ''}Cette action est irréversible.
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
          </div>
        );
      })()}
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [dragFlatIdx, setDragFlatIdx] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [pendingRemoveSectionIdx, setPendingRemoveSectionIdx] = useState<number | null>(null);
  const [focusedSectionIdx, setFocusedSectionIdx] = useState<number | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const includedIds = configQuestionIds(config);
  const available = draftIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q);
  const availableRows = groupIntoRows(available, questions);

  const flat = flattenSections(config.sections, questions);
  let cursor = 0;
  const sectionRanges = config.sections.map(sec => {
    const secQuestions = sec.questionIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q);
    const count = groupIntoRows(secQuestions, questions).length;
    const r = { start: cursor, end: cursor + count };
    cursor += count;
    return r;
  });

  // mesure la hauteur réelle de chaque bloc de question pour calculer les sauts de page A4
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let changed = false;
    for (const [key, el] of Object.entries(rowRefs.current)) {
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

  function toggleExpand(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
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
  function toggleAvailable(ids: string[]) {
    patchConfig({ sections: toggleQuestionsInSections(config.sections, ids) });
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
          effacer l&apos;éditeur
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
          {availableRows.length === 0 && <div style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: '#a87a3a' }}>« envoie des questions depuis la banque »</div>}
          {availableRows.map(row => {
            const ids = rowMembers(row).map(q => q.id);
            const included = ids.every(id => includedIds.includes(id));
            const linked = row.kind === 'group';
            const label = linked ? row.members[0].content : row.q.content;
            const incomplete = linked ? row.members.some(q => hasNoAnswer(q) || !q.content.trim()) : (hasNoAnswer(row.q) || !row.q.content.trim());
            return (
              <div key={ids.join(',')} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 9px', borderRadius: 8, background: included ? 'rgba(79,107,64,0.08)' : 'rgba(255,255,255,0.7)', border: '1px solid rgba(45,42,36,0.06)' }}>
                <input type="checkbox" checked={included} onChange={() => toggleAvailable(ids)} style={{ marginTop: 2, flexShrink: 0, accentColor: '#4f6b40' }} />
                {incomplete && (
                  <button onClick={() => onOpenQuestion(ids[0])} title="question incomplète — cliquer pour compléter dans la banque" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit', fontSize: 9, padding: 0, flexShrink: 0, alignSelf: 'flex-start' }}>⚠</button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linked ? '🔗 ' : ''}{label || '(sans énoncé)'}</div>
                  {linked && <span style={{ fontSize: 10.5, color: '#7a4d20' }}>{row.members.length} parties liées</span>}
                </div>
                <span onClick={() => onRemoveFromDraft(ids)} title="retirer de la liste" style={{ fontSize: 14, color: '#b85a4a', cursor: 'pointer', flexShrink: 0 }}>×</span>
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
                    // découpe les lignes de la section en "feuillets" continus, sans jamais couper un bloc de question entre 2 pages
                    type FlatRow = { gi: number; localIdx: number; row: Row };
                    const chunks: FlatRow[][] = [];
                    let current: FlatRow[] = [];
                    rowsInSection.forEach((entry, localIdx) => {
                      const gi = range.start + localIdx;
                      if (localIdx > 0 && pageStarts.has(gi)) {
                        chunks.push(current);
                        current = [];
                      }
                      current.push({ gi, localIdx, row: entry.row });
                    });
                    if (current.length > 0) chunks.push(current);
                    const incompleteIcon = (id: string) => (
                      <button onClick={() => onOpenQuestion(id)} title="question incomplète — cliquer pour compléter dans la banque" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0, flexShrink: 0 }}>⚠</button>
                    );
                    return chunks.map((chunk, chunkIdx) => (
                      <div key={chunkIdx}>
                        {chunk[0].gi === 0 && pageCount > 1 && pageLabel(1)}
                        {pageStarts.has(chunk[0].gi) && pageBreakSeparator(chunk[0].gi)}
                        {continuationStarts.has(chunk[0].gi) && continuationLabel(section.title)}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'center' }}>
                          <div style={{ width: 26, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                            {chunk.map(({ gi, row }) => {
                              const rh = rowHeights[rowKey(row)];
                              const incompleteId = row.kind === 'single'
                                ? (hasNoAnswer(row.q) ? row.q.id : null)
                                : (row.members.find(m => hasNoAnswer(m))?.id ?? null);
                              return (
                                <div key={rowKey(row)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 20, boxSizing: 'border-box' as const, opacity: dragFlatIdx === gi ? 0.4 : 1 }}>
                                  <span draggable onDragStart={() => setDragFlatIdx(gi)} onDragEnd={() => { setDragFlatIdx(null); setDropIndicator(null); }} title="glisser pour réorganiser" style={{ cursor: 'grab', color: '#c8c2b6', fontSize: 13, lineHeight: 1, userSelect: 'none' as const }}>⠿</span>
                                  {incompleteId && incompleteIcon(incompleteId)}
                                </div>
                              );
                            })}
                          </div>

                          <div style={{ width: A4_BLOCK_WIDTH, flexShrink: 0, background: '#fff', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 4, boxShadow: '0 2px 14px rgba(45,42,36,0.06)', overflow: 'hidden' }}>
                            {chunk.map(({ gi, localIdx, row }, idxInChunk) => {
                              const showLineBefore = dragFlatIdx !== null && dragFlatIdx !== gi && dragFlatIdx !== gi - 1 && dropIndicator === gi;
                              const dragOverProps = {
                                onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragFlatIdx === null) return; const rect = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - rect.top) < rect.height / 2; setDropIndicator(before ? gi : gi + 1); },
                                onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dropIndicator !== null) handleDrop(dropIndicator, sIdx); else setDragFlatIdx(null); },
                              };
                              const divider = idxInChunk > 0 ? '1px solid rgba(45,42,36,0.08)' : 'none';
                              if (row.kind === 'single') {
                                const q = row.q;
                                const incomplete = hasNoAnswer(q);
                                return (
                                  <div key={q.id} {...dragOverProps} ref={el => { rowRefs.current[rowKey(row)] = el; }} style={{ borderTop: divider, background: incomplete ? 'rgba(184,90,74,0.04)' : 'transparent' }}>
                                    <div style={{ height: showLineBefore ? 3 : 0, background: '#a87a3a', transition: 'all 0.1s' }} />
                                    <div style={{ padding: '20px 34px' }}>
                                      <div style={{ fontSize: 14, color: '#2d2a24', lineHeight: 1.6 }}>
                                        <span style={{ color: '#a87a3a', fontWeight: 600, marginRight: 8 }}>{localIdx + 1}.</span>
                                        {q.content || '(sans énoncé)'}
                                      </div>
                                      {renderAnswerSpace(q)}
                                    </div>
                                  </div>
                                );
                              }
                              const groupKey = row.ids.join(',');
                              const expanded = expandedGroups.has(groupKey);
                              const first = row.members[0];
                              return (
                                <div key={groupKey} {...dragOverProps} ref={el => { rowRefs.current[rowKey(row)] = el; }} style={{ borderTop: divider }}>
                                  <div style={{ height: showLineBefore ? 3 : 0, background: '#a87a3a', transition: 'all 0.1s' }} />
                                  <div style={{ padding: '20px 34px' }}>
                                    <div style={{ border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(168,122,58,0.05)', borderRadius: 9, padding: 10 }}>
                                      <div onClick={() => toggleExpand(groupKey)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', marginBottom: expanded ? 12 : 0, cursor: 'pointer' }}>
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 12.5, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.content || '(sans énoncé)'}</div>
                                          <div style={{ fontSize: 10.5, color: '#7a4d20', marginTop: 2 }}>question liée · {row.members.length} parties</div>
                                        </div>
                                        <span style={{ fontSize: 11, color: '#7a766d', flexShrink: 0 }}>{expanded ? 'replier ▴' : 'déplier ▾'}</span>
                                      </div>
                                      {expanded && (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                          {row.members.map((q, i) => {
                                            const inc = hasNoAnswer(q);
                                            const wgt = config.weighting[q.id] ?? defaultWeight();
                                            return (
                                              <div key={q.id} style={{ borderTop: i > 0 ? '1px solid rgba(168,122,58,0.18)' : 'none', paddingTop: i > 0 ? 14 : 0, marginTop: i > 0 ? 14 : 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                  <span style={{ fontSize: 11, color: '#a87a3a', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                                                  {inc && incompleteIcon(q.id)}
                                                  <div style={{ flex: 1 }} />
                                                  <WeightControls weight={wgt} onChange={patch => updateWeight(q.id, patch)} />
                                                </div>
                                                <div style={{ fontSize: 14, color: '#2d2a24', lineHeight: 1.6 }}>{q.content || '(sans énoncé)'}</div>
                                                {renderAnswerSpace(q)}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div style={{ width: 86, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                            {chunk.map(({ gi, row }) => {
                              const rh = rowHeights[rowKey(row)];
                              return (
                                <div key={rowKey(row)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 20, boxSizing: 'border-box' as const }}>
                                  <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>{String(gi + 1).padStart(2, '0')}</span>
                                  {row.kind === 'single' && <WeightControls weight={config.weighting[row.q.id] ?? defaultWeight()} onChange={patch => updateWeight(row.q.id, patch)} />}
                                  <span onClick={() => toggleAvailable(row.kind === 'single' ? [row.q.id] : row.ids)} title="retirer de l'examen" style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
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

          <button onClick={onGenerate} style={{ padding: '13px 18px', borderRadius: 11, background: '#4f6b40', color: '#f4f0e6', border: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 8, boxShadow: '0 8px 20px rgba(79,107,64,0.28)' }}>
            {editing ? 'enregistrer les modifications →' : "générer l'examen →"}
          </button>
          <button style={{ width: '100%', padding: '9px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' as const }}>exporter PDF</button>
        </div>
      </div>
      {pendingRemoveSectionIdx !== null && (() => {
        const section = config.sections[pendingRemoveSectionIdx];
        if (!section) return null;
        const count = groupIntoRows(section.questionIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q), questions).reduce((sum, row) => sum + rowMembers(row).length, 0);
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setPendingRemoveSectionIdx(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
            <div style={{ position: 'relative', width: 420, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(184,90,74,0.12)', color: '#b85a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>!</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Supprimer la section « {section.title} » ?</div>
              <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
                Les {count} question{count > 1 ? 's' : ''} de cette section ne seront plus dans l&apos;examen et retourneront dans la liste des questions envoyées. Cette action est irréversible.
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
            <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>Effacer l&apos;éditeur d&apos;examen ?</div>
            <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: 20 }}>
              L&apos;intitulé, les sections, la pondération et les questions envoyées seront réinitialisés. Cette action est irréversible.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClearOpen(false)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={() => { setConfirmClearOpen(false); onClearEditor(); }} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: '#b85a4a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Effacer</button>
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
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkCandidateIds, setLinkCandidateIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [examConfig, setExamConfig] = useState<ExamConfig>(defaultExamConfig());

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

  function handleDeleteQuestion(deleted: Question) {
    const id = deleted.id;

    // nettoyage des groupes de questions liées
    const groupSiblings = deleted.linkedQuestionIds.filter(gid => gid !== id);
    const affectedQuestions: Question[] = [];
    if (groupSiblings.length > 0) {
      const remaining = groupSiblings.filter(gid => questions.some(q => q.id === gid));
      const clearGroup = remaining.length <= 1;
      remaining.forEach(gid => {
        const sibling = questions.find(q => q.id === gid);
        if (!sibling) return;
        affectedQuestions.push({ ...sibling, linkedQuestionIds: clearGroup ? [] : remaining });
      });
    }
    setQuestions(prev => prev
      .filter(q => q.id !== id)
      .map(q => affectedQuestions.find(a => a.id === q.id) ?? q));

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

    setSelected(s => s.filter(qid => qid !== id));

    deleteQuestionAction(workshopId, id, affectedQuestions).catch(err => console.error('suppression de la question échouée', err));
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
              <div style={{ position: 'absolute', top: 0, left: 0, width: mainW, height: r.h / s, transform: `scale(${s})`, transformOrigin: '0 0', overflowY: id === 'generator' ? 'hidden' : 'auto', overflowX: 'hidden', background: id === 'generator' ? '#fbf7ef' : '#fcf9f2' }}>
                {id === 'history' && <HistoryContent exams={exams} justAddedId={justAdded} onEdit={e => { setEditing(e); setDraftIds(e.questionIds ?? []); setExamConfig(e.config?.sections ? e.config : defaultExamConfig(e.title)); focus('generator'); }} onNew={() => { setEditing(null); setExamConfig(defaultExamConfig()); focus('generator'); }} onDelete={e => setPendingDeleteExam(e)} />}
                {id === 'bank' && (
                  <BankContent
                    questions={questions}
                    pools={pools}
                    exams={exams}
                    selected={selected}
                    onToggle={id2 => setSelected(s => s.includes(id2) ? s.filter(x => x !== id2) : [...s, id2])}
                    onToggleGroup={handleToggleGroup}
                    onDeselectAll={() => setSelected([])}
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
      {linkModalOpen && (
        <LinkOrderModal
          questions={questions.filter(q => linkCandidateIds.includes(q.id))}
          onConfirm={handleLinkQuestions}
          onCancel={() => setLinkModalOpen(false)}
        />
      )}
      {pendingDeleteExam && (
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
        </div>
      )}
    </div>
  );
}
