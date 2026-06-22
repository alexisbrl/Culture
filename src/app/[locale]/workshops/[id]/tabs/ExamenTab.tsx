'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Settings, Settings2, Copy, Download, FileText, AlertTriangle, Check, SeparatorHorizontal, SendHorizontal, X, ArrowRight, Star, RefreshCw } from 'lucide-react';
import QuestionEditor, { Question, ResponseType, RESPONSE_TYPE_LABELS, emptyQuestion } from './QuestionEditor';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getExamBankData, saveQuestion, saveQuestions, createPool as createPoolAction, updatePool as updatePoolAction, deletePool as deletePoolAction, deleteQuestion as deleteQuestionAction, saveGeneratedExam, deleteGeneratedExam, getExamDraft, saveExamDraft } from '@/app/actions/examQuestions';

// ---- shared data ----
type Pool = { id: string; name: string; color: string };

type Exam = { id: string; title: string; date: string; q: number; dur: string; avg: string; status: string; taken: number; questionIds?: string[]; config?: ExamConfig };

// ---- aperçu de l'examen (config live) ----
export type IdentitySide = 'left' | 'right' | 'hidden';
export type CandidateIdentity = { nom: IdentitySide; prenom: IdentitySide; tag: IdentitySide; classe: IdentitySide; date: IdentitySide };
export type CustomField = { id: string; label: string; side: IdentitySide };
const DEFAULT_IDENTITY_ORDER: (keyof CandidateIdentity)[] = ['nom', 'prenom', 'tag', 'classe', 'date'];
const IDENTITY_KEY_SET = new Set<string>(DEFAULT_IDENTITY_ORDER);
const IDENTITY_LABELS: Record<keyof CandidateIdentity, string> = { nom: 'Nom', prenom: 'Prénom', tag: 'Tag - Culture', classe: 'Classe', date: 'Date' };
export type ExamPresentation = { identity: CandidateIdentity; identityOrder: string[]; customFields: CustomField[] };
export type ExamSection = { id: string; title: string; questionIds: string[] };
export type QuestionWeight = { points: number; negative: { enabled: boolean; value: number }; eliminatory: boolean };
export type ExamConfig = {
  title: string;
  titleIncluded: boolean;
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
const A4_TITLE_BLOCK_HEIGHT = 162; // hauteur approx. du titre d'examen centré en haut de la 1ère page (incl. ~1,5cm d'espace avant la 1ère partie)
const A4_IDENTITY_ROW_HEIGHT = 24; // hauteur approx. d'une ligne d'identité candidat (nom/prénom/tag/classe/date)
const A4_ROW_FALLBACK_HEIGHT = 396; // hauteur estimée avant la première mesure réelle
const A4_BLOCK_WIDTH = 1056; // largeur du bloc question au format A4 dans l'aperçu
const A4_MARGIN_PX = Math.round(A4_BLOCK_WIDTH / 21 * 1); // marge non imprimable de 1cm en haut et en bas de chaque page (1056px ≈ 21cm de large)
const A4_PAGE_BREAK_HEIGHT = 56; // hauteur approx. du repère « saut de page » dans l'aperçu
const PAGE_BREAK_PREFIX = 'pb';

function isPageBreakId(id: string): boolean {
  return id.startsWith(PAGE_BREAK_PREFIX);
}

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


// une entrée aplatie est soit une vraie question, soit un repère « saut de page » (pseudo-question
// déplaçable comme une question mais jamais affichée/imprimée dans l'examen final)
type FlatEntry = { sectionIdx: number; kind: 'question'; q: Question } | { sectionIdx: number; kind: 'pagebreak'; id: string };

function flatEntryId(entry: FlatEntry): string {
  return entry.kind === 'pagebreak' ? entry.id : entry.q.id;
}

// calcule les sauts de page A4 : pour chaque indice (gi) dans la liste aplatie, indique si une nouvelle
// page commence à cet indice, et si l'en-tête de section affiché à cet endroit est une « (suite) »
// (saut au milieu d'une section). Un bloc de question n'est jamais coupé entre 2 pages. Un repère
// « saut de page » force toujours le passage à la page suivante juste après lui.
type PaginationInfo = { pageStarts: Set<number>; continuationStarts: Set<number>; pageCount: number };

function computePagination(flat: FlatEntry[], rowHeights: Record<string, number>, firstPageReservedHeight = 0): PaginationInfo {
  const pageStarts = new Set<number>();
  const continuationStarts = new Set<number>();
  const maxUsable = A4_PAGE_HEIGHT - A4_MARGIN_PX; // marge basse non imprimable réservée sur chaque page
  let used = A4_MARGIN_PX + firstPageReservedHeight; // marge haute non imprimable réservée sur chaque page
  let curSection = -1;
  let forceBreakNext = false;
  flat.forEach((entry, gi) => {
    let extra = 0;
    if (entry.sectionIdx !== curSection) {
      extra += A4_SECTION_HEADER_HEIGHT;
      curSection = entry.sectionIdx;
    }
    const h = entry.kind === 'pagebreak'
      ? (rowHeights[entry.id] ?? A4_PAGE_BREAK_HEIGHT)
      : (rowHeights[entry.q.id] ?? A4_ROW_FALLBACK_HEIGHT) + A4_ROW_GAP;
    const total = extra + h;
    if (gi > 0 && (forceBreakNext || used + total > maxUsable)) {
      pageStarts.add(gi);
      used = A4_MARGIN_PX;
      if (extra === 0) {
        continuationStarts.add(gi);
        used += A4_SECTION_HEADER_HEIGHT;
      }
    }
    forceBreakNext = entry.kind === 'pagebreak';
    used += total;
  });
  return { pageStarts, continuationStarts, pageCount: pageStarts.size + 1 };
}

function defaultWeight(): QuestionWeight {
  return { points: 1, negative: { enabled: false, value: 0 }, eliminatory: false };
}

// chaque partie supplémentaire d'une question a sa propre pondération indépendante, stockée sous une clé dérivée de l'id de la question
function partWeightKey(questionId: string, partIdx: number): string {
  return `${questionId}::part${partIdx}`;
}

function clearWeightingFor(weighting: Record<string, QuestionWeight>, id: string): Record<string, QuestionWeight> {
  const next = { ...weighting };
  delete next[id];
  for (const key of Object.keys(next)) {
    if (key.startsWith(`${id}::part`)) delete next[key];
  }
  return next;
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

// convertit l'ancien format booléen de identity (avant le drag and drop gauche/droite) vers IdentitySide
function normalizeIdentitySide(value: unknown, fallback: IdentitySide): IdentitySide {
  if (value === 'left' || value === 'right' || value === 'hidden') return value;
  if (typeof value === 'boolean') return value ? fallback : 'hidden';
  return fallback;
}

// complète les configs enregistrées avant l'ajout de titleIncluded / identity.date / du placement gauche-droite / des pilules personnalisées avec leurs valeurs par défaut
function normalizeExamConfig(config: ExamConfig): ExamConfig {
  const rawIdentity = config.presentation.identity as Partial<Record<keyof CandidateIdentity, unknown>>;
  const rawCustomFields = config.presentation.customFields as unknown;
  const customFields: CustomField[] = Array.isArray(rawCustomFields)
    ? rawCustomFields.map((f, i) => {
        if (typeof f === 'string') return { id: `cf-legacy-${i}`, label: f, side: 'hidden' as IdentitySide };
        const obj = f as Partial<CustomField>;
        return { id: obj.id ?? `cf-legacy-${i}`, label: obj.label ?? '', side: normalizeIdentitySide(obj.side, 'hidden') };
      })
    : [];
  const validIds = [...DEFAULT_IDENTITY_ORDER, ...customFields.map(f => f.id)];
  const saved = (config.presentation.identityOrder ?? []).filter((id): id is string => validIds.includes(id));
  const missing = validIds.filter(id => !saved.includes(id));
  return {
    ...config,
    titleIncluded: config.titleIncluded ?? true,
    presentation: {
      identity: {
        nom: normalizeIdentitySide(rawIdentity.nom, 'left'),
        prenom: normalizeIdentitySide(rawIdentity.prenom, 'left'),
        tag: normalizeIdentitySide(rawIdentity.tag, 'left'),
        classe: normalizeIdentitySide(rawIdentity.classe, 'left'),
        date: normalizeIdentitySide(rawIdentity.date, 'right'),
      },
      customFields,
      identityOrder: [...saved, ...missing],
    },
  };
}

function defaultPresentation(): ExamPresentation {
  return { identity: { nom: 'left', prenom: 'left', tag: 'left', classe: 'hidden', date: 'right' }, identityOrder: [...DEFAULT_IDENTITY_ORDER], customFields: [] };
}

function defaultExamConfig(title?: string): ExamConfig {
  return {
    title: title ?? '',
    titleIncluded: true,
    durationMinutes: 120,
    presentation: defaultPresentation(),
    sections: [{ id: 'sec' + Date.now(), title: 'Partie 1', questionIds: [] }],
    weighting: {},
  };
}

// favori de présentation — propre à l'utilisateur (navigateur), pas lié à un atelier en particulier ;
// par défaut (avant toute sauvegarde) c'est la présentation par défaut elle-même.
const FAVORITE_PRESENTATION_KEY = 'culture.examPresentationFavorite.v1';

function getFavoritePresentation(): ExamPresentation {
  if (typeof window === 'undefined') return defaultPresentation();
  try {
    const raw = window.localStorage.getItem(FAVORITE_PRESENTATION_KEY);
    if (!raw) return defaultPresentation();
    const parsed = JSON.parse(raw);
    if (!parsed?.identity || !Array.isArray(parsed?.identityOrder)) return defaultPresentation();
    return parsed as ExamPresentation;
  } catch {
    return defaultPresentation();
  }
}

function saveFavoritePresentation(presentation: ExamPresentation) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FAVORITE_PRESENTATION_KEY, JSON.stringify(presentation));
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function configQuestionIds(config: ExamConfig): string[] {
  return config.sections.flatMap(s => s.questionIds).filter(id => !isPageBreakId(id));
}

// aplatit toutes les sections en une liste ordonnée de questions et de repères « saut de page »
function flattenSections(sections: ExamSection[], allQuestions: Question[]): FlatEntry[] {
  const flat: FlatEntry[] = [];
  sections.forEach((sec, sIdx) => {
    sec.questionIds.forEach(id => {
      if (isPageBreakId(id)) {
        flat.push({ sectionIdx: sIdx, kind: 'pagebreak', id });
        return;
      }
      const q = allQuestions.find(p => p.id === id);
      if (q) flat.push({ sectionIdx: sIdx, kind: 'question', q });
    });
  });
  return flat;
}

// déplace une question (ou un saut de page) d'une position à une autre dans la liste aplatie,
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
  withoutMoving.splice(insertAt, 0, { ...moving, sectionIdx: targetSectionIdx });
  const newSections = sections.map(s => ({ ...s, questionIds: [] as string[] }));
  withoutMoving.forEach(entry => {
    newSections[entry.sectionIdx].questionIds.push(flatEntryId(entry));
  });
  return newSections;
}

// ajoute/retire une question de l'examen : retrait si déjà présente, sinon ajout à la fin de la dernière section
function toggleQuestionInSections(sections: ExamSection[], id: string): ExamSection[] {
  const included = sections.some(s => s.questionIds.includes(id));
  let next = sections.map(s => ({ ...s, questionIds: s.questionIds.filter(qid => qid !== id) }));
  if (!included) {
    if (next.length === 0) next = [{ id: 'sec' + Date.now(), title: 'Partie 1', questionIds: [] }];
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

// bouton « modifier la question » dans l'aperçu de l'éditeur d'examen — le cercle n'apparaît qu'au survol, pour indiquer que le bouton est cliquable
function EditQuestionButton({ id, onOpenQuestion }: { id: string; onOpenQuestion: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onOpenQuestion(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="modifier la question"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: hovered ? '1px solid rgba(45,42,36,0.14)' : '1px solid transparent', background: hovered ? 'rgba(45,42,36,0.045)' : 'transparent', color: hovered ? '#7a766d' : '#9a948a', cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'background 0.12s, border-color 0.12s' }}
    >
      <Settings2 size={14} strokeWidth={1.85} />
    </button>
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

  function renderQuestionBody(q: Question) {
    const open = openId === q.id;
    const hasParts = q.parts.length > 0;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: '#2d2a24', lineHeight: 1.45, marginBottom: 8 }}>
            {q.title.trim() || q.content || '(sans énoncé)'}
            {hasParts && (
              <span style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 8, fontSize: 10.5, padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(232,184,108,0.12)', color: '#7a4d20' }}>
                {q.parts.length + 1} parties
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TypePill type={q.responseType} />
            {q.pools.map(pid => {
              const p = pools.find(pp => pp.id === pid);
              if (!p) return null;
              return <span key={pid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(45,42,36,0.05)', color: '#5a564c' }}>#{p.name}</span>;
            })}
            <button onClick={() => setOpenId(open ? null : q.id)} style={{ marginLeft: 'auto', fontSize: 11, color: '#a87a3a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{open ? 'masquer le détail ▴' : 'voir le détail ▾'}</button>
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
          {open && (
            <div style={{ marginTop: 10, borderTop: '1px solid rgba(168,122,58,0.18)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(232,184,108,0.08)', border: '1px solid rgba(168,122,58,0.15)' }}>
                <div style={{ fontSize: 11, color: '#a87a3a', marginBottom: 4 }}>Partie 1</div>
                <div style={{ fontSize: 12.5, color: '#3a352c', marginBottom: 6 }}>{q.content || '(sans énoncé)'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <TypePill type={q.responseType} />
                  {q.difficulty.enabled && <Diff n={q.difficulty.value} />}
                  {q.duration.enabled && <span style={{ fontSize: 10.5, color: '#7a766d' }}>{q.duration.minutes}min {(q.duration.seconds ?? 0).toString().padStart(2, '0')}s</span>}
                </div>
                <div style={{ fontSize: 12, color: '#3a352c' }}><span style={{ fontWeight: 600, color: '#7a4d20' }}>réponse · </span>{answerSummary(q)}</div>
              </div>
              {q.parts.map((part, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(232,184,108,0.08)', border: '1px solid rgba(168,122,58,0.15)' }}>
                  <div style={{ fontSize: 11, color: '#a87a3a', marginBottom: 4 }}>Partie {i + 2}</div>
                  <div style={{ fontSize: 12.5, color: '#3a352c', marginBottom: 6 }}>{part.content || '(sans énoncé)'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <TypePill type={part.responseType} />
                    {part.difficulty.enabled && <Diff n={part.difficulty.value} />}
                    {part.duration.enabled && <span style={{ fontSize: 10.5, color: '#7a766d' }}>{part.duration.minutes}min {(part.duration.seconds ?? 0).toString().padStart(2, '0')}s</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#3a352c' }}><span style={{ fontWeight: 600, color: '#7a4d20' }}>réponse · </span>{answerSummary(part)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onSendOne(q.id); }} title="envoyer vers l'éditeur d'examen" style={{ alignSelf: 'stretch', flexShrink: 0, marginRight: -14, marginTop: -12, marginBottom: -12, paddingLeft: 28, paddingRight: 28, borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: '1px solid rgba(45,42,36,0.10)', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}><SendHorizontal size={19} strokeWidth={2} /></button>
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
        return (
          <ConfirmDialog
            portal
            width={420}
            title="Supprimer cette question ?"
            description="Cette action est irréversible."
            confirmLabel="Supprimer"
            onCancel={() => setPendingDeleteQuestion(null)}
            onConfirm={() => { onDeleteQuestion(q); setPendingDeleteQuestion(null); }}
          >
            {affectedExams.length > 0 && (
              <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 9, background: 'rgba(184,90,74,0.08)', textAlign: 'left' as const }}>
                <div style={{ fontSize: 11.5, color: '#b85a4a', marginBottom: 6 }}>Elle sera retirée des examens suivants :</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5a564c' }}>
                  {affectedExams.map(e => <li key={e.id}>{e.title}</li>)}
                </ul>
              </div>
            )}
          </ConfirmDialog>
        );
      })()}
      {pendingDeleteLabel && (() => {
        const label = pools.find(p => p.id === pendingDeleteLabel);
        if (!label) return null;
        const count = questions.filter(q => q.pools.includes(label.id)).length;
        return (
          <ConfirmDialog
            portal
            width={380}
            title={`Supprimer le libellé « ${label.name} » ?`}
            description={`${count > 0 ? `Il sera retiré de ${count} question${count > 1 ? 's' : ''}. ` : ''}Cette action est irréversible.`}
            confirmLabel="Supprimer"
            onCancel={() => setPendingDeleteLabel(null)}
            onConfirm={confirmDeleteLabel}
          />
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
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [draggingIdentityKey, setDraggingIdentityKey] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [creatingCustomField, setCreatingCustomField] = useState(false);
  const [pendingRemoveSectionIdx, setPendingRemoveSectionIdx] = useState<number | null>(null);
  const [focusedSectionIdx, setFocusedSectionIdx] = useState<number | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmGenerateOpen, setConfirmGenerateOpen] = useState(false);
  const [pendingRemoveFromDraftId, setPendingRemoveFromDraftId] = useState<string | null>(null);
  const [favoritePresentation, setFavoritePresentation] = useState<ExamPresentation>(defaultPresentation());
  const [confirmApplyFavoriteOpen, setConfirmApplyFavoriteOpen] = useState(false);
  const [confirmSaveFavoriteOpen, setConfirmSaveFavoriteOpen] = useState(false);

  useEffect(() => {
    setFavoritePresentation(getFavoritePresentation());
  }, []);

  useEffect(() => {
    if (!draggingIdentityKey) return;
    const clear = () => setDraggingIdentityKey(null);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    window.addEventListener('mouseup', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
      window.removeEventListener('mouseup', clear);
    };
  }, [draggingIdentityKey]);

  const includedIds = configQuestionIds(config);
  const available = draftIds.map(id => questions.find(q => q.id === id)).filter((q): q is Question => !!q);
  const incompleteCount = includedIds.filter(id => {
    const q = questions.find(p => p.id === id);
    return q && (hasNoAnswer(q) || !q.content.trim());
  }).length;
  const totalPoints = includedIds.reduce((sum, id) => {
    const q = questions.find(p => p.id === id);
    const mainPoints = config.weighting[id]?.points ?? defaultWeight().points;
    const partsPoints = q ? q.parts.reduce((s, _part, pi) => s + (config.weighting[partWeightKey(id, pi)]?.points ?? defaultWeight().points), 0) : 0;
    return sum + mainPoints + partsPoints;
  }, 0);

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
    const count = sec.questionIds.filter(id => isPageBreakId(id) || questions.some(q => q.id === id)).length;
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
  const titleBlockHeight = config.titleIncluded && config.title.trim() ? A4_TITLE_BLOCK_HEIGHT : 0;
  const identity = config.presentation.identity;
  const identityOrder = config.presentation.identityOrder;
  function sideOfItem(id: string): IdentitySide {
    if (IDENTITY_KEY_SET.has(id)) return identity[id as keyof CandidateIdentity];
    return config.presentation.customFields.find(f => f.id === id)?.side ?? 'hidden';
  }
  function labelOfItem(id: string): string {
    if (IDENTITY_KEY_SET.has(id)) return IDENTITY_LABELS[id as keyof CandidateIdentity];
    return config.presentation.customFields.find(f => f.id === id)?.label ?? '';
  }
  const identityLeftKeys = identityOrder.filter(id => sideOfItem(id) === 'left');
  const identityRightKeys = identityOrder.filter(id => sideOfItem(id) === 'right');
  const identityBlockHeight = (identityLeftKeys.length > 0 || identityRightKeys.length > 0)
    ? A4_IDENTITY_ROW_HEIGHT * Math.max(identityLeftKeys.length, identityRightKeys.length, 1) + 24
    : 0;
  const headerBlockHeight = rowHeights['__page1_header__'] ?? (titleBlockHeight + identityBlockHeight);
  const { pageStarts, pageCount } = computePagination(flat, rowHeights, headerBlockHeight);
  function pageNumberOf(gi: number): number {
    let n = 1;
    pageStarts.forEach(p => { if (p <= gi) n++; });
    return n;
  }

  function patchConfig(patch: Partial<ExamConfig>) {
    onConfigChange({ ...config, ...patch });
  }
  function applyFavoritePresentation() {
    patchConfig({ presentation: favoritePresentation });
    setConfirmApplyFavoriteOpen(false);
  }
  function saveFavoriteFromCurrent() {
    saveFavoritePresentation(config.presentation);
    setFavoritePresentation(config.presentation);
    setConfirmSaveFavoriteOpen(false);
  }
  function updateSection(idx: number, patch: Partial<ExamSection>) {
    patchConfig({ sections: config.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) });
  }
  function addSection() {
    patchConfig({ sections: [...config.sections, { id: 'sec' + Date.now(), title: `Partie ${config.sections.length + 1}`, questionIds: [] }] });
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
  function addPageBreak() {
    const id = PAGE_BREAK_PREFIX + Date.now();
    let next = config.sections.map(s => ({ ...s }));
    if (next.length === 0) next = [{ id: 'sec' + Date.now(), title: 'Partie 1', questionIds: [] }];
    next[next.length - 1] = { ...next[next.length - 1], questionIds: [...next[next.length - 1].questionIds, id] };
    patchConfig({ sections: next });
  }
  function removePageBreak(id: string) {
    patchConfig({ sections: config.sections.map(s => ({ ...s, questionIds: s.questionIds.filter(qid => qid !== id) })) });
  }
  // déplace l'item (champ d'identité fixe ou pilule personnalisée) vers `side`, en l'insérant juste avant `beforeId` dans l'ordre global (ou en fin de liste si absent)
  function moveIdentity(id: string, side: IdentitySide, beforeId?: string) {
    if (beforeId === id) return;
    const withoutId = config.presentation.identityOrder.filter(k => k !== id);
    let insertAt = withoutId.length;
    if (beforeId && beforeId !== id) {
      const idx = withoutId.indexOf(beforeId);
      if (idx !== -1) insertAt = idx;
    }
    const identityOrder = [...withoutId.slice(0, insertAt), id, ...withoutId.slice(insertAt)];
    const sameOrder = identityOrder.length === config.presentation.identityOrder.length && identityOrder.every((k, i) => k === config.presentation.identityOrder[i]);
    if (sameOrder && sideOfItem(id) === side) return;
    if (IDENTITY_KEY_SET.has(id)) {
      patchConfig({ presentation: { ...config.presentation, identity: { ...config.presentation.identity, [id]: side }, identityOrder } });
    } else {
      patchConfig({ presentation: { ...config.presentation, customFields: config.presentation.customFields.map(f => f.id === id ? { ...f, side } : f), identityOrder } });
    }
  }
  function addCustomField() {
    const label = newFieldName.trim();
    if (!label) return;
    const id = 'cf' + Date.now();
    patchConfig({ presentation: { ...config.presentation, customFields: [...config.presentation.customFields, { id, label, side: 'hidden' }], identityOrder: [...config.presentation.identityOrder, id] } });
    setNewFieldName('');
    setCreatingCustomField(false);
  }
  function removeCustomField(id: string) {
    patchConfig({ presentation: { ...config.presentation, customFields: config.presentation.customFields.filter(f => f.id !== id), identityOrder: config.presentation.identityOrder.filter(k => k !== id) } });
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
    const weighting = clearWeightingFor(config.weighting, id);
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

  return (
    <div style={{ padding: '20px 12px 24px 24px', height: '100%', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column', background: '#fbf7ef' }}>
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
                  <div style={{ fontSize: 12, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title.trim() || q.content || '(sans énoncé)'}</div>
                  {q.parts.length > 0 && <span style={{ fontSize: 10.5, color: '#7a4d20' }}>{q.parts.length + 1} parties</span>}
                </div>
                <span onClick={() => requestRemoveFromDraft(q.id)} title="retirer de la liste" style={{ fontSize: 14, color: '#b85a4a', cursor: 'pointer', flexShrink: 0 }}>×</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', minHeight: 0, paddingRight: 24, boxSizing: 'border-box' as const }}>
          <div style={{ background: 'rgba(45,42,36,0.03)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d', marginBottom: 8 }}>paramètres</div>

            <div style={{ fontSize: 11, color: '#5a564c', marginBottom: 6 }}>intitulé</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input value={config.title} onChange={e => patchConfig({ title: e.target.value })} style={{ flex: 1, fontSize: 15, fontWeight: 500, color: '#2d2a24', border: '1px solid rgba(45,42,36,0.12)', borderRadius: 9, padding: '10px 12px', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
              <button
                type="button"
                onClick={() => patchConfig({ titleIncluded: !config.titleIncluded })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '9px 14px', borderRadius: 999, border: config.titleIncluded ? '1px solid rgba(79,107,64,0.35)' : '1px solid rgba(45,42,36,0.14)', background: config.titleIncluded ? 'rgba(79,107,64,0.14)' : 'transparent', color: config.titleIncluded ? '#4f6b40' : '#9a948a', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' as const }}
              >
                {config.titleIncluded && <Check size={13} strokeWidth={2.5} />}
                afficher
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: '#5a564c' }}>présentation</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setConfirmApplyFavoriteOpen(true)}
                  title="appliquer la présentation favorite"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(168,122,58,0.30)', background: 'rgba(232,184,108,0.14)', color: '#7a4d20', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <Star size={11.5} strokeWidth={2} fill="#a87a3a" color="#a87a3a" />
                  favori
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSaveFavoriteOpen(true)}
                  title="remplacer le favori par la présentation actuelle"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(45,42,36,0.12)', background: 'transparent', color: '#7a766d', cursor: 'pointer', padding: 0 }}
                >
                  <RefreshCw size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {(['left', 'right'] as IdentitySide[]).map(side => (
                <div
                  key={side}
                  onDragOver={e => { e.preventDefault(); if (draggingIdentityKey && sideOfItem(draggingIdentityKey) === side) moveIdentity(draggingIdentityKey, side); }}
                  onDrop={e => { e.preventDefault(); if (draggingIdentityKey) moveIdentity(draggingIdentityKey, side); }}
                  style={{ flex: 1, minHeight: 44, border: '1px dashed rgba(45,42,36,0.18)', borderRadius: 9, padding: 8, display: 'flex', flexWrap: 'wrap' as const, alignContent: 'flex-start' as const, gap: 6 }}
                >
                  <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em', width: '100%' }}>{side === 'left' ? 'à gauche' : 'à droite'}</div>
                  {identityOrder.filter(id => sideOfItem(id) === side).map(id => {
                    const removable = !IDENTITY_KEY_SET.has(id);
                    return (
                      <span
                        key={id}
                        draggable
                        onDragStart={() => setDraggingIdentityKey(id)}
                        onDragEnd={() => setDraggingIdentityKey(null)}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (draggingIdentityKey && draggingIdentityKey !== id && sideOfItem(draggingIdentityKey) === side) moveIdentity(draggingIdentityKey, side, id); }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggingIdentityKey && draggingIdentityKey !== id) moveIdentity(draggingIdentityKey, side, id); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: removable ? '5px 6px 5px 11px' : '5px 11px', borderRadius: 999, border: '1px solid rgba(79,107,64,0.35)', background: 'rgba(79,107,64,0.14)', color: '#4f6b40', cursor: 'grab', opacity: draggingIdentityKey === id ? 0.4 : 1 }}
                      >
                        <span style={{ color: '#9a948a', fontSize: 11 }}>⠿</span>
                        {labelOfItem(id)}
                        {removable && (
                          <button onClick={() => removeCustomField(id)} style={{ border: 'none', background: 'none', color: '#4f6b40', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div
              onDragOver={e => { e.preventDefault(); if (draggingIdentityKey && sideOfItem(draggingIdentityKey) === 'hidden') moveIdentity(draggingIdentityKey, 'hidden'); }}
              onDrop={e => { e.preventDefault(); if (draggingIdentityKey) moveIdentity(draggingIdentityKey, 'hidden'); }}
              style={{ minHeight: 36, border: '1px dashed rgba(45,42,36,0.14)', borderRadius: 9, padding: 8, display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 6, marginBottom: 14 }}
            >
              <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em', width: '100%' }}>non affiché</div>
              {identityOrder.filter(id => sideOfItem(id) === 'hidden').map(id => {
                const removable = !IDENTITY_KEY_SET.has(id);
                return (
                  <span
                    key={id}
                    draggable
                    onDragStart={() => setDraggingIdentityKey(id)}
                    onDragEnd={() => setDraggingIdentityKey(null)}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (draggingIdentityKey && draggingIdentityKey !== id && sideOfItem(draggingIdentityKey) === 'hidden') moveIdentity(draggingIdentityKey, 'hidden', id); }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggingIdentityKey && draggingIdentityKey !== id) moveIdentity(draggingIdentityKey, 'hidden', id); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: removable ? '5px 6px 5px 11px' : '5px 11px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#9a948a', cursor: 'grab', opacity: draggingIdentityKey === id ? 0.4 : 1 }}
                  >
                    <span style={{ color: '#9a948a', fontSize: 11 }}>⠿</span>
                    {labelOfItem(id)}
                    {removable && (
                      <button onClick={() => removeCustomField(id)} style={{ border: 'none', background: 'none', color: '#9a948a', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
                    )}
                  </span>
                );
              })}
              {creatingCustomField ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    autoFocus
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } if (e.key === 'Escape') { setCreatingCustomField(false); setNewFieldName(''); } }}
                    placeholder="nom de la pilule…"
                    style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 999, border: '1px solid rgba(45,42,36,0.18)', background: '#fff', fontFamily: 'inherit', outline: 'none', width: 140 }}
                  />
                  <button type="button" onClick={addCustomField} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: 'none', background: '#4f6b40', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>ajouter</button>
                  <button type="button" onClick={() => { setCreatingCustomField(false); setNewFieldName(''); }} style={{ fontSize: 11.5, padding: '5px 8px', borderRadius: 999, border: 'none', background: 'none', color: '#9a948a', cursor: 'pointer', fontFamily: 'inherit' }}>annuler</button>
                </span>
              ) : (
                <button type="button" onClick={() => setCreatingCustomField(true)} style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 999, border: '1px dashed rgba(45,42,36,0.25)', background: 'transparent', color: '#5a564c', cursor: 'pointer', fontFamily: 'inherit' }}>+ pilule personnalisée</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>parties</div>
                  <button type="button" onClick={addSection} style={{ fontSize: 13, fontWeight: 500, color: '#4f6b40', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>+ partie</button>
                </div>
                <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{config.sections.length}</div>
              </div>
              <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>questions</div>
                  <button type="button" onClick={addPageBreak} title="ajouter un saut de page" style={{ fontSize: 13, fontWeight: 500, color: '#4f6b40', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>+ saut de page</button>
                </div>
                <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{includedIds.length}</div>
              </div>
              <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>barème</div>
                <div style={{ fontSize: 14, color: '#2d2a24', fontWeight: 500, marginTop: 1 }}>{totalPoints} pt{totalPoints === 1 ? '' : 's'}</div>
              </div>
              <div style={{ background: 'rgba(45,42,36,0.04)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 9.5, color: '#9a948a', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>durée</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
                  <input type="number" min={5} step={5} value={config.durationMinutes} onChange={e => patchConfig({ durationMinutes: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 50, fontSize: 14, color: '#2d2a24', fontWeight: 500, border: 'none', background: 'transparent', fontFamily: 'inherit', padding: 0, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: '#9a948a' }}>min · {formatDuration(config.durationMinutes)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#7a766d' }}>déroulé de l&apos;examen</div>
          </div>

          {(() => {
            type Row =
              | { kind: 'header'; key: string; sectionIdx: number }
              | { kind: 'empty'; key: string; sectionIdx: number }
              | { kind: 'pagebreak'; key: string; gi: number; sectionIdx: number; id: string }
              | { kind: 'question'; key: string; gi: number; sectionIdx: number; subStart: number; q: Question };

            const rows: Row[] = [];
            let flatCursor = 0;
            config.sections.forEach((section, sIdx) => {
              rows.push({ kind: 'header', key: `h-${section.id}`, sectionIdx: sIdx });
              let pushedAny = false;
              let subCursor = 1;
              section.questionIds.forEach(id => {
                if (isPageBreakId(id)) {
                  rows.push({ kind: 'pagebreak', key: id, gi: flatCursor, sectionIdx: sIdx, id });
                  flatCursor++;
                  pushedAny = true;
                  return;
                }
                const q = questions.find(p => p.id === id);
                if (!q) return;
                rows.push({ kind: 'question', key: q.id, gi: flatCursor, sectionIdx: sIdx, subStart: subCursor, q });
                subCursor += 1 + q.parts.length;
                flatCursor++;
                pushedAny = true;
              });
              if (!pushedAny) rows.push({ kind: 'empty', key: `e-${section.id}`, sectionIdx: sIdx });
            });

            const chunks: Row[][] = [];
            let current: Row[] = [];
            rows.forEach(row => {
              if ((row.kind === 'question' || row.kind === 'pagebreak') && row.gi > 0 && pageStarts.has(row.gi)) {
                const carryOver: Row[] = [];
                while (current.length > 0 && (current[current.length - 1].kind === 'header' || current[current.length - 1].kind === 'empty') && current[current.length - 1].sectionIdx === row.sectionIdx) {
                  carryOver.unshift(current.pop()!);
                }
                if (current.length > 0) chunks.push(current);
                current = carryOver;
              }
              current.push(row);
            });
            chunks.push(current);

            const incompleteIcon = (id: string) => (
              <button onClick={() => onOpenQuestion(id)} title="question incomplète - cliquer pour compléter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid rgba(184,90,74,0.35)', background: 'rgba(184,90,74,0.10)', color: '#b85a4a', cursor: 'pointer', padding: 0, flexShrink: 0 }}><AlertTriangle size={13} strokeWidth={2} /></button>
            );

            const COLUMN_GAP = 10; // espace entre les 3 colonnes (gauche/feuille/droite), distinct de A4_ROW_GAP

            // 3 colonnes parallèles (gouttière gauche / feuille A4 / gouttière droite), chacune fait son
            // propre .map() sur `chunk` — une ligne ne change jamais de colonne, seulement de position.
            // Les mêmes handlers de drag (calcul avant/après identique) sont attachés aux 3 cellules d'une
            // même ligne, pour pouvoir déposer en survolant n'importe laquelle des 3 zones.
            const dragOverPropsFor = (gi: number, sectionIdx: number) => ({
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragFlatIdx === null) return; const rect = e.currentTarget.getBoundingClientRect(); const before = (e.clientY - rect.top) < rect.height / 2; setDropIndicator(before ? gi : gi + 1); },
              onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dropIndicator !== null) handleDrop(dropIndicator, sectionIdx); else setDragFlatIdx(null); },
            });
            const emptyDropPropsFor = (start: number, sectionIdx: number) => ({
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragFlatIdx !== null) setDropIndicator(start); },
              onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(start, sectionIdx); },
            });

            return chunks.map((chunk, chunkIdx) => {
              const firstQuestionRow = chunk.find(r => r.kind === 'question' || r.kind === 'pagebreak') as (Row & { kind: 'question' | 'pagebreak' }) | undefined;
              const isPageBreak = !!firstQuestionRow && pageStarts.has(firstQuestionRow.gi);
              return (
                <div key={chunkIdx} style={{ marginBottom: 14 }}>
                  {chunkIdx === 0 && pageCount > 1 && pageLabel(1)}
                  {isPageBreak && pageBreakSeparator(firstQuestionRow!.gi)}
                  {/* centrage via margin:auto plutôt que justifyContent:center — quand le contenu dépasse,
                      les navigateurs refusent un scrollLeft négatif et la partie gauche resterait
                      inaccessible ; avec margin:auto la marge se résout à 0 en cas de dépassement, donc
                      tout reste atteignable en scrollant (le bord gauche est alors immédiatement visible). */}
                  <div style={{ display: 'flex', gap: COLUMN_GAP, alignItems: 'flex-start', width: 'fit-content', margin: '0 auto' }}>
                    {/* gouttière gauche : poignée de glisser-déposer + icône (⚠ incomplète / ⚙ éditer) */}
                    <div style={{ width: 26, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ height: A4_MARGIN_PX, flexShrink: 0 }} />
                      {chunkIdx === 0 && headerBlockHeight > 0 && <div style={{ height: headerBlockHeight, flexShrink: 0 }} />}
                      {chunk.map(row => {
                        const rh = rowHeights[row.key];
                        if (row.kind === 'header' || row.kind === 'empty') {
                          return <div key={row.key} style={{ height: rh, minHeight: rh ? undefined : A4_SECTION_HEADER_HEIGHT }} />;
                        }
                        if (row.kind === 'pagebreak') {
                          return (
                            <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_PAGE_BREAK_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' as const, opacity: dragFlatIdx === row.gi ? 0.4 : 1 }}>
                              <span draggable onDragStart={() => setDragFlatIdx(row.gi)} onDragEnd={() => { setDragFlatIdx(null); setDropIndicator(null); }} title="glisser pour réorganiser" style={{ cursor: 'grab', color: '#c8c2b6', fontSize: 13, lineHeight: 1, userSelect: 'none' as const }}>⠿</span>
                            </div>
                          );
                        }
                        const incomplete = hasNoAnswer(row.q);
                        return (
                          <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, paddingTop: 20, boxSizing: 'border-box' as const, opacity: dragFlatIdx === row.gi ? 0.4 : 1 }}>
                            <span draggable onDragStart={() => setDragFlatIdx(row.gi)} onDragEnd={() => { setDragFlatIdx(null); setDropIndicator(null); }} onMouseEnter={() => setHoveredRowKey(row.key)} onMouseLeave={() => setHoveredRowKey(null)} title="glisser pour réorganiser" style={{ cursor: 'grab', color: '#c8c2b6', fontSize: 13, lineHeight: 1, userSelect: 'none' as const }}>⠿</span>
                            {incomplete ? incompleteIcon(row.q.id) : <EditQuestionButton id={row.q.id} onOpenQuestion={onOpenQuestion} />}
                          </div>
                        );
                      })}
                    </div>

                    {/* colonne centrale : la feuille A4 elle-même (fond blanc, bordure, ombre) */}
                    <div style={{ width: A4_BLOCK_WIDTH, height: A4_PAGE_HEIGHT, flexShrink: 0, background: '#fff', border: '1px solid rgba(45,42,36,0.08)', borderRadius: 4, boxShadow: '0 2px 14px rgba(45,42,36,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: A4_MARGIN_PX, flexShrink: 0 }} />
                      {chunkIdx === 0 && (identityBlockHeight > 0 || titleBlockHeight > 0) && (
                        <div ref={el => { qRefs.current['__page1_header__'] = el; }}>
                          {identityBlockHeight > 0 && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '24px 34px 0' }}>
                              <div style={{ fontSize: 13, color: '#3a352c', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {identityLeftKeys.map(key => (
                                  <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, width: 220 }}>
                                    <span>{labelOfItem(key)}</span>
                                    <span style={{ flex: 1, borderBottom: '1px solid rgba(45,42,36,0.3)' }} />
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 13, color: '#3a352c', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {identityRightKeys.map(key => (
                                  <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, width: 160 }}>
                                    <span>{labelOfItem(key)}</span>
                                    <span style={{ flex: 1, borderBottom: '1px solid rgba(45,42,36,0.3)' }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {titleBlockHeight > 0 && (
                            <div style={{ padding: '28px 34px 90px', textAlign: 'center' as const, fontSize: 24, fontWeight: 600, color: '#2d2a24' }}>
                              {config.title}
                            </div>
                          )}
                        </div>
                      )}
                      {chunk.map(row => {
                        const section = config.sections[row.sectionIdx];
                        if (row.kind === 'header') {
                          return (
                            <div key={row.key} ref={el => { qRefs.current[row.key] = el; }} style={{ position: 'relative' as const }}>
                              <input
                                value={section.title}
                                onChange={e => updateSection(row.sectionIdx, { title: e.target.value })}
                                onFocus={() => setFocusedSectionIdx(row.sectionIdx)}
                                onBlur={() => setFocusedSectionIdx(null)}
                                style={{ width: '100%', fontSize: 16, fontWeight: 600, color: '#7a4d20', background: focusedSectionIdx === row.sectionIdx ? 'rgba(168,122,58,0.06)' : 'transparent', border: 'none', padding: '14px 40px 10px 34px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                              />
                              <span style={{ position: 'absolute' as const, right: 16, top: 16, fontSize: 12, color: 'rgba(168,122,58,0.45)', pointerEvents: 'none' as const }}>✎</span>
                            </div>
                          );
                        }
                        if (row.kind === 'empty') {
                          const start = sectionRanges[row.sectionIdx].start;
                          return (
                            <div
                              key={row.key}
                              ref={el => { qRefs.current[row.key] = el; }}
                              {...emptyDropPropsFor(start, row.sectionIdx)}
                              style={{ margin: '0 34px 14px', fontSize: 11.5, color: '#bdb8ad', padding: '14px', textAlign: 'center' as const, border: '1px dashed rgba(45,42,36,0.12)', borderRadius: 9, background: dropIndicator === start && dragFlatIdx !== null ? 'rgba(168,122,58,0.08)' : 'transparent' }}
                            >
                              partie vide — glisse une question ici
                            </div>
                          );
                        }
                        if (row.kind === 'pagebreak') {
                          const gi = row.gi;
                          const showLineBefore = dragFlatIdx !== null && dragFlatIdx !== gi && dragFlatIdx !== gi - 1 && dropIndicator === gi;
                          return (
                            <div key={row.key} {...dragOverPropsFor(gi, row.sectionIdx)} ref={el => { qRefs.current[row.key] = el; }}>
                              <div style={{ height: showLineBefore ? 3 : 0, background: '#a87a3a', transition: 'all 0.1s' }} />
                              <div style={{ margin: '10px 34px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px dashed rgba(45,42,36,0.20)', borderRadius: 8, background: 'rgba(45,42,36,0.045)', color: '#9a948a', fontSize: 11.5 }}>
                                <SeparatorHorizontal size={14} strokeWidth={1.75} />
                                saut de page
                              </div>
                            </div>
                          );
                        }
                        const { gi, subStart, q } = row;
                        const showLineBefore = dragFlatIdx !== null && dragFlatIdx !== gi && dragFlatIdx !== gi - 1 && dropIndicator === gi;
                        const incomplete = hasNoAnswer(q);
                        const hovered = hoveredRowKey === row.key;
                        return (
                          <div key={row.key}>
                            <div {...dragOverPropsFor(gi, row.sectionIdx)} ref={el => { qRefs.current[row.key] = el; }} style={{ background: hovered ? 'rgba(168,122,58,0.08)' : 'transparent', transition: 'background 0.1s' }}>
                              <div style={{ height: showLineBefore ? 3 : 0, background: '#a87a3a', transition: 'all 0.1s' }} />
                              <div style={{ padding: '20px 34px' }}>
                                <div ref={el => { qRefs.current[`${q.id}::head`] = el; }}>
                                  <div style={{ fontSize: 14, color: '#2d2a24', lineHeight: 1.6 }}>
                                    <span style={{ color: '#a87a3a', fontWeight: 600, marginRight: 8 }}>{subStart}.</span>
                                    {q.content || '(sans énoncé)'}
                                  </div>
                                  {renderAnswerSpace(q)}
                                </div>
                                {q.parts.map((part, pi) => (
                                  <div key={pi} ref={el => { qRefs.current[partWeightKey(q.id, pi)] = el; }} style={{ marginTop: 40, paddingLeft: 28 }}>
                                    <div style={{ fontSize: 14, color: '#2d2a24', lineHeight: 1.6 }}>
                                      <span style={{ color: '#a87a3a', fontWeight: 600, marginRight: 8 }}>{subStart + pi + 1}.</span>
                                      {part.content || '(sans énoncé)'}
                                    </div>
                                    {renderAnswerSpace({ ...q, responseType: part.responseType, answer: part.answer, choices: part.choices, correctChoices: part.correctChoices, textLines: part.textLines })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* gouttière droite : numéro, pondération, bouton de suppression */}
                    <div style={{ width: 86, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ height: A4_MARGIN_PX, flexShrink: 0 }} />
                      {chunkIdx === 0 && headerBlockHeight > 0 && <div style={{ height: headerBlockHeight, flexShrink: 0 }} />}
                      {chunk.map(row => {
                        const rh = rowHeights[row.key];
                        if (row.kind === 'header') {
                          return (
                            <div key={row.key} style={{ height: rh, minHeight: rh ? undefined : A4_SECTION_HEADER_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {config.sections.length > 1 && (
                                <button type="button" onClick={() => removeSection(row.sectionIdx)} title="supprimer la partie" style={{ fontSize: 15, color: '#b85a4a', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
                              )}
                            </div>
                          );
                        }
                        if (row.kind === 'empty') {
                          return <div key={row.key} style={{ height: rh, minHeight: rh ? undefined : A4_SECTION_HEADER_HEIGHT }} />;
                        }
                        if (row.kind === 'pagebreak') {
                          return (
                            <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_PAGE_BREAK_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span onClick={() => removePageBreak(row.id)} title="retirer le saut de page" style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
                            </div>
                          );
                        }
                        const { gi, q } = row;
                        return (
                          <div key={row.key} {...dragOverPropsFor(gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 20, boxSizing: 'border-box' as const }}>
                            <span style={{ fontSize: 11, color: '#9a948a', fontVariantNumeric: 'tabular-nums' }}>{String(gi + 1).padStart(2, '0')}</span>
                            <WeightControls weight={config.weighting[q.id] ?? defaultWeight()} onChange={patch => updateWeight(q.id, patch)} />
                            {q.parts.map((_part, pi) => {
                              const key = partWeightKey(q.id, pi);
                              return (
                                <div key={pi} style={{ height: rowHeights[key] ?? A4_ROW_FALLBACK_HEIGHT, marginTop: 40, paddingTop: 14, boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 9.5, color: '#bdb8ad' }} title={`pondération de la partie ${pi + 2}`}>part. {pi + 2}</span>
                                  <WeightControls weight={config.weighting[key] ?? defaultWeight()} onChange={patch => updateWeight(key, patch)} />
                                </div>
                              );
                            })}
                            <span onClick={() => toggleAvailable(q.id)} title="retirer de l'examen" style={{ fontSize: 15, color: '#b85a4a', cursor: 'pointer' }}>×</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            });
          })()}

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
          <ConfirmDialog
            width={420}
            title={`Supprimer la partie « ${section.title} » ?`}
            description={<>Les {count} question{count > 1 ? 's' : ''} de cette partie ne seront plus dans l&apos;examen et retourneront dans la liste des questions envoyées.</>}
            confirmLabel="Supprimer"
            onCancel={() => setPendingRemoveSectionIdx(null)}
            onConfirm={confirmRemoveSection}
          />
        );
      })()}
      {confirmClearOpen && (
        <ConfirmDialog
          width={420}
          title={editing ? 'Annuler les modifications ?' : "Effacer l'éditeur d'examen ?"}
          description={editing
            ? <>Les modifications en cours sur <strong style={{ color: '#2d2a24' }}>{editing.title}</strong> seront abandonnées. L&apos;examen déjà enregistré n&apos;est pas affecté.</>
            : "L'intitulé, les parties, la pondération et les questions envoyées seront réinitialisés."}
          confirmLabel={editing ? 'Annuler les modifications' : 'Effacer'}
          onCancel={() => setConfirmClearOpen(false)}
          onConfirm={() => { setConfirmClearOpen(false); onClearEditor(); }}
        />
      )}
      {confirmGenerateOpen && (
        <ConfirmDialog
          width={420}
          confirmTone="confirm"
          title="Enregistrer malgré tout ?"
          description={<>{incompleteCount} question{incompleteCount > 1 ? 's' : ''} de cet examen {incompleteCount > 1 ? 'sont incomplètes' : 'est incomplète'} (sans réponse associée ou sans énoncé).</>}
          confirmLabel="Enregistrer"
          onCancel={() => setConfirmGenerateOpen(false)}
          onConfirm={() => { setConfirmGenerateOpen(false); onGenerate(); }}
        />
      )}
      {confirmApplyFavoriteOpen && (
        <ConfirmDialog
          width={420}
          iconTone="accent"
          confirmTone="confirm"
          icon={<Star size={18} strokeWidth={2} fill="#a87a3a" color="#a87a3a" />}
          title="Appliquer la présentation favorite ?"
          description="La section présentation va être remplacée par votre favori."
          confirmLabel="Appliquer"
          onCancel={() => setConfirmApplyFavoriteOpen(false)}
          onConfirm={applyFavoritePresentation}
        />
      )}
      {confirmSaveFavoriteOpen && (
        <ConfirmDialog
          width={420}
          iconTone="accent"
          confirmTone="confirm"
          icon={<RefreshCw size={17} strokeWidth={2} />}
          title="Remplacer le favori ?"
          description={<>Enregistre la présentation actuelle comme favorite. Elle remplacera l&apos;ancienne favorite.</>}
          confirmLabel="Enregistrer"
          onCancel={() => setConfirmSaveFavoriteOpen(false)}
          onConfirm={saveFavoriteFromCurrent}
        />
      )}
      {pendingRemoveFromDraftId && (
        <ConfirmDialog
          width={420}
          title="Retirer cette question ?"
          description={<>Elle est cochée dans l&apos;examen en cours — la retirer de la liste des questions envoyées la retirera aussi de l&apos;aperçu.</>}
          confirmLabel="Retirer"
          onCancel={() => setPendingRemoveFromDraftId(null)}
          onConfirm={confirmRemoveFromDraft}
        />
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
  const [introOpen, setIntroOpen] = useState(false);

  function isEditorEmpty() {
    return editing === null && draftIds.length === 0 && examConfig.title.trim() === '' && configQuestionIds(examConfig).length === 0;
  }

  function requestEditExam(e: Exam) {
    if (editing?.id === e.id || isEditorEmpty()) {
      setEditing(e);
      setDraftIds(e.questionIds ?? []);
      setExamConfig(e.config?.sections ? normalizeExamConfig(e.config) : defaultExamConfig(e.title));
      focus('generator');
    } else {
      setPendingEditExam(e);
    }
  }

  const GAP = 16;
  const SIDE_W = 320;
  // sous cette largeur, les 3 panneaux passent d'une mise en page côte-à-côte (avec mise à l'échelle)
  // à une pile verticale plein-largeur (échelle 1:1, scroll vertical) — reflow façon Gmail au zoom navigateur.
  const STACK_BP = 860;
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
        setExamConfig(draft.config?.sections ? normalizeExamConfig(draft.config) : defaultExamConfig());
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
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w > 0 && h > 0) {
        setDim(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
      }
    };
    // mesure en continu (et pas seulement au premier rendu) : un changement de zoom navigateur modifie
    // la largeur en px CSS disponible et doit donc redéclencher le calcul de mise en page/reflow.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
      const withCreatedAt = q.createdAt ? q : { ...q, createdAt: new Date().toISOString() };
      return [withCreatedAt, ...prev];
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
      const weighting = clearWeightingFor(e.config.weighting, id);
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
      const weighting = clearWeightingFor(prev.weighting, id);
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
    if (w < STACK_BP) {
      // pile verticale plein-largeur : chaque panneau occupe toute la largeur disponible (s=1, pas de
      // mise à l'échelle) ; le panneau focus (role 0) est plus grand, les 2 autres défilent en dessous.
      const mainH = 620;
      const sideH = 400;
      const y = role === 0 ? 0 : role === 1 ? mainH + GAP : mainH + GAP + sideH + GAP;
      return { x: 0, y, w, h: role === 0 ? mainH : sideH, main: role === 0 };
    }
    const mainW = Math.max(360, w - SIDE_W - GAP);
    const sideH = (h - GAP) / 2;
    if (role === 0) return { x: 0, y: 0, w: mainW, h, main: true };
    if (role === 1) return { x: mainW + GAP, y: 0, w: SIDE_W, h: sideH, main: false };
    return { x: mainW + GAP, y: sideH + GAP, w: SIDE_W, h: sideH, main: false };
  }

  const stacked = dim.w < STACK_BP;
  const mainW = stacked ? dim.w : Math.max(360, dim.w - SIDE_W - GAP);
  const ready = dim.w > 0 && dim.h > 0;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes examPop { 0% { background: rgba(232,184,108,0.42); } 100% { } }`}</style>
      <div ref={stageRef} style={{ flex: 1, position: 'relative', margin: '22px 22px 20px', minHeight: 0, overflow: stacked ? 'auto' : 'visible', paddingBottom: stacked ? 50 : 0 }}>
        {ready && IDS.map(id => {
          const role = order.indexOf(id);
          const r = rectFor(role);
          const s = r.w / mainW;
          // historique/banque défilent via ce conteneur (l'éditeur gère son propre scroll interne) : on
          // réserve une petite marge à droite pour décoller la scrollbar de la bordure de la tuile, comme
          // c'est déjà le cas pour l'éditeur d'examen.
          const contentW = id === 'generator' ? mainW : mainW - 16;
          return (
            <div key={id} ref={el => { tileRefs.current[id] = el; }} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 16, overflow: 'hidden', border: r.main ? '1px solid rgba(45,42,36,0.10)' : '1px solid rgba(45,42,36,0.08)', background: id === 'generator' ? '#fbf7ef' : '#fcf9f2', boxShadow: r.main ? '0 16px 44px rgba(45,42,36,0.10)' : '0 6px 18px rgba(45,42,36,0.08)', zIndex: r.main ? 2 : 1 }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: contentW, height: r.h / s, transform: `scale(${s})`, transformOrigin: '0 0', overflowY: id === 'generator' ? 'hidden' : 'auto', overflowX: 'hidden', background: id === 'generator' ? '#fbf7ef' : '#fcf9f2' }}>
                {id === 'history' && <HistoryContent exams={exams} justAddedId={justAdded} onEdit={requestEditExam} onNew={() => setIntroOpen(true)} onDelete={e => setPendingDeleteExam(e)} />}
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
      {introOpen && (() => {
        const steps = [
          { title: 'Constituez votre banque de questions', text: 'Créez vos questions manuellement ou laissez l’IA s’en charger à partir des fichiers de l’atelier.', side: 'left' as const },
          { title: 'Composez votre examen', text: 'Envoyez vos questions vers l’éditeur, glissez-les dans des sections, ajustez la pondération et la difficulté.', side: 'right' as const },
          { title: 'Générez et diffusez', text: 'L’examen est prêt : export PDF, passage en ligne, projection, ou intégration au programme éducatif.', side: 'left' as const },
        ];
        // bandes verticales (% de la hauteur totale de la popup) : en-tête, 3 lignes égales, pied de page
        const HEADER_PCT = 16;
        const FOOTER_PCT = 13;
        const ROW_PCT = (100 - HEADER_PCT - FOOTER_PCT) / steps.length;
        return createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setIntroOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.46)', backdropFilter: 'blur(3px)' }} />
            <div style={{ position: 'relative', height: '90vh', width: 'calc(90vh * 0.75)', maxWidth: '92vw' }}>
              {/* carte : fond, texte, bouton — clippée pour les coins arrondis */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden', background: 'linear-gradient(160deg, #fdf9ef 0%, #f6ead2 100%)', boxShadow: '0 28px 70px rgba(45,42,36,0.32)' }}>
                <button onClick={() => setIntroOpen(false)} title="fermer" style={{ position: 'absolute', top: 18, right: 18, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(45,42,36,0.12)', background: '#fff', color: '#2d2a24', cursor: 'pointer' }}>
                  <X size={17} strokeWidth={2} />
                </button>

                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${HEADER_PCT}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 70px', textAlign: 'center' }}>
                  <div style={{ fontSize: 23, fontWeight: 600, color: '#2d2a24' }}>Comment fonctionne le générateur d&apos;examen</div>
                  <div style={{ fontSize: 13.5, color: '#8a7f64', marginTop: 8 }}>Trois étapes pour passer de votre banque de questions à un examen prêt à être donné.</div>
                </div>

                {steps.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: `${HEADER_PCT + ROW_PCT * i}%`,
                      height: `${ROW_PCT}%`,
                      left: step.side === 'left' ? '46%' : '6%',
                      right: step.side === 'left' ? '6%' : '46%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#7a4d20', marginBottom: 8 }}>{step.title}</div>
                    <div style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.65 }}>{step.text}</div>
                  </div>
                ))}

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${FOOTER_PCT}%`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 32px', borderTop: '1px solid rgba(45,42,36,0.08)' }}>
                  <button
                    onClick={() => { setIntroOpen(false); setEditing(null); setExamConfig(defaultExamConfig()); focus('bank'); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 10, border: 'none', background: '#4f6b40', color: '#fff', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Commencer
                    <ArrowRight size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* images : par-dessus la carte, non clippées — débordent du cadre pour l'effet « pop-out » */}
              {steps.map((step, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: `${HEADER_PCT + ROW_PCT * (i + 0.5)}%`,
                    transform: `translateY(-50%) rotate(${step.side === 'left' ? -4 : 4}deg)`,
                    left: step.side === 'left' ? -64 : undefined,
                    right: step.side === 'left' ? undefined : -64,
                    width: 260,
                    height: 230,
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '46% 54% 58% 42% / 50% 46% 54% 50%',
                    background: 'radial-gradient(circle at 32% 28%, #f2cf8e 0%, #dba85a 55%, #c98f43 100%)',
                    boxShadow: '0 20px 46px rgba(168,122,58,0.38)',
                  }} />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(122,77,32,0.55)',
                    textAlign: 'center',
                  }}>
                    image {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
