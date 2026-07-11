'use client';

// Boîte à outils partagée de l'onglet « Génération d'examen » : types de domaine,
// constantes (pagination A4, couleurs), fonctions utilitaires pures et petits composants
// présentationnels réutilisés par HistoryContent / BankContent / GeneratorContent / ExamenTab.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings2 } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import { type Question, type ResponseType } from '../QuestionEditor';

// ---- shared data ----
//
// Types de domaine déplacés vers @/lib/workshops/examTypes (audit §5.3).
// `Pool`/`Exam` sont des alias historiques de `ExamPool`/`GeneratedExam` — le
// reste de l'onglet examen (BankContent, GeneratorContent, HistoryContent) les
// importe sous ces noms depuis ce fichier, inchangé.
import type {
  IdentitySide, CandidateIdentity, CustomField, ExamPresentation, ExamSection, QuestionWeight, ExamConfig,
  ExamPool, GeneratedExam,
} from '@/lib/workshops/examTypes';
export type { IdentitySide, CandidateIdentity, CustomField, ExamPresentation, ExamSection, QuestionWeight, ExamConfig };
export type Pool = ExamPool;
export type Exam = GeneratedExam;

export const DEFAULT_IDENTITY_ORDER: (keyof CandidateIdentity)[] = ['nom', 'prenom', 'tag', 'classe', 'date'];
export const IDENTITY_KEY_SET = new Set<string>(DEFAULT_IDENTITY_ORDER);
export const IDENTITY_LABELS: Record<keyof CandidateIdentity, string> = { nom: 'Nom', prenom: 'Prénom', tag: 'Tag - Culture', classe: 'Classe', date: 'Date' };

// ---- small helpers ----
export const RESPONSE_TYPE_COLORS: Record<ResponseType, string> = {
  sans_reponse: palette.inkSoft,
  qcs: palette.amberLight,
  qcm: palette.greenSoft,
  textuelle: '#9eb3b9',
  dessin: '#a890b8',
  audio: '#a890b8',
  sondage: '#9eb3b9',
  fill_blank: palette.amberLight,
  matching: '#a890b8',
  ordre: '#a890b8',
};

export type SortBy = 'difficulty' | 'name' | 'type' | 'label' | 'recent';
export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT_DIR: Record<SortBy, SortDir> = {
  difficulty: 'desc',
  name: 'asc',
  type: 'asc',
  label: 'asc',
  recent: 'desc',
};

export const NEVER_EXAM_ID = '__never__';
export const NO_DIFFICULTY = 0;
export const NO_ANSWER_ID = '__no_answer__';

// pagination de l'aperçu A4 (panneau « Éditeur d'examen ») — dimensions en px pour un bloc de 880px de large
export const A4_PAGE_HEIGHT = 1494; // ≈ ratio A4 (210×297mm) pour un bloc de 1056px de large
export const A4_ROW_GAP = 0; // les questions sont désormais collées (un seul bloc continu par section) — pas de marge entre lignes
export const A4_SECTION_HEADER_HEIGHT = 44; // hauteur approx. de la barre de titre de section (+ marge)
export const A4_TITLE_BLOCK_HEIGHT = 162; // hauteur approx. du titre d'examen centré en haut de la 1ère page (incl. ~1,5cm d'espace avant la 1ère partie)
export const A4_IDENTITY_ROW_HEIGHT = 24; // hauteur approx. d'une ligne d'identité candidat (nom/prénom/tag/classe/date)
export const A4_ROW_FALLBACK_HEIGHT = 396; // hauteur estimée avant la première mesure réelle
export const A4_BLOCK_WIDTH = 1056; // largeur du bloc question au format A4 dans l'aperçu
export const A4_MARGIN_PX = Math.round(A4_BLOCK_WIDTH / 21 * 1); // marge non imprimable de 1cm en haut et en bas de chaque page (1056px ≈ 21cm de large)
export const A4_PAGE_BREAK_HEIGHT = 56; // hauteur approx. du repère « saut de page » dans l'aperçu
export const PAGE_BREAK_PREFIX = 'pb';

export function isPageBreakId(id: string): boolean {
  return id.startsWith(PAGE_BREAK_PREFIX);
}

export const LABEL_COLORS = ['#9eb3b9', '#a890b8', palette.greenSoft, palette.amberLight, palette.danger, palette.greenBrand, palette.amber, palette.inkFaint, '#6b8ea8', '#c2603a'];

export function DiffDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < level ? palette.amber : ink(0.15), display: 'inline-block' }} />)}
    </span>
  );
}

export function TypePill({ type }: { type: ResponseType }) {
  const t = useTranslations('examen');
  const c = RESPONSE_TYPE_COLORS[type] || palette.inkSoft;
  return <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 999, background: `${c}28`, color: '#3a352c', letterSpacing: '0.02em' }}>{t(`responseType.${type}`)}</span>;
}

export function WeightControls({ weight, onChange }: { weight: QuestionWeight; onChange: (patch: Partial<QuestionWeight>) => void }) {
  const t = useTranslations('examen');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <input type="number" min={0} step={0.5} value={weight.points} onChange={e => onChange({ points: Number(e.target.value) || 0 })} title={t('weight.points')} style={{ width: 42, fontSize: 11, padding: '4px 5px', borderRadius: 6, border: `1px solid ${ink(0.14)}`, background: palette.paper, fontFamily: 'inherit', textAlign: 'center' as const }} />
      {!weight.eliminatory && (
        <button type="button" onClick={() => onChange({ negative: { ...weight.negative, enabled: !weight.negative.enabled } })} title={t('weight.negative')} style={{ fontSize: 11, padding: '4px 7px', borderRadius: 6, border: weight.negative.enabled ? '1px solid rgba(184,90,74,0.4)' : `1px solid ${ink(0.12)}`, background: weight.negative.enabled ? withAlpha(palette.danger, 0.12) : withAlpha(palette.paper, 0.7), color: weight.negative.enabled ? palette.danger : palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
      )}
      {!weight.eliminatory && weight.negative.enabled && (
        <input type="number" min={0} step={0.5} value={weight.negative.value} onChange={e => onChange({ negative: { ...weight.negative, value: Number(e.target.value) || 0 } })} title={t('weight.negativeValue')} style={{ width: 42, fontSize: 11, padding: '4px 5px', borderRadius: 6, border: `1px solid ${withAlpha(palette.danger, 0.3)}`, background: palette.paper, fontFamily: 'inherit', textAlign: 'center' as const, color: palette.danger }} />
      )}
      <button type="button" onClick={() => onChange({ eliminatory: !weight.eliminatory, negative: weight.eliminatory ? weight.negative : { ...weight.negative, enabled: false } })} title={t('weight.eliminatory')} style={{ fontSize: 11, padding: '4px 7px', borderRadius: 6, border: weight.eliminatory ? '1px solid rgba(184,90,74,0.4)' : `1px solid ${ink(0.12)}`, background: weight.eliminatory ? palette.danger : withAlpha(palette.paper, 0.7), color: weight.eliminatory ? palette.paper : palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>⚑</button>
    </div>
  );
}

export function Diff({ n }: { n: number }) {
  const t = useTranslations('examen');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 9, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{t('diff')}</span>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < n ? palette.amber : ink(0.12), display: 'inline-block' }} />)}
    </span>
  );
}

export function answerMissing(p: { responseType: ResponseType; answer: string; choices: string[]; correctChoices: number[]; answerOptional?: boolean }): boolean {
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

export function hasNoAnswer(q: Question): boolean {
  if (answerMissing(q)) return true;
  return q.parts.some((part) => answerMissing(part));
}


// une entrée aplatie est soit une vraie question, soit un repère « saut de page » (pseudo-question
// déplaçable comme une question mais jamais affichée/imprimée dans l'examen final)
export type FlatEntry = { sectionIdx: number; kind: 'question'; q: Question } | { sectionIdx: number; kind: 'pagebreak'; id: string };

export function flatEntryId(entry: FlatEntry): string {
  return entry.kind === 'pagebreak' ? entry.id : entry.q.id;
}

// calcule les sauts de page A4 : pour chaque indice (gi) dans la liste aplatie, indique si une nouvelle
// page commence à cet indice, et si l'en-tête de section affiché à cet endroit est une « (suite) »
// (saut au milieu d'une section). Un bloc de question n'est jamais coupé entre 2 pages. Un repère
// « saut de page » force toujours le passage à la page suivante juste après lui.
export type PaginationInfo = { pageStarts: Set<number>; continuationStarts: Set<number>; pageCount: number };

export function computePagination(flat: FlatEntry[], rowHeights: Record<string, number>, firstPageReservedHeight = 0): PaginationInfo {
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

export function defaultWeight(): QuestionWeight {
  return { points: 1, negative: { enabled: false, value: 0 }, eliminatory: false };
}

// chaque partie supplémentaire d'une question a sa propre pondération indépendante, stockée sous une clé dérivée de l'id de la question
export function partWeightKey(questionId: string, partIdx: number): string {
  return `${questionId}::part${partIdx}`;
}

export function clearWeightingFor(weighting: Record<string, QuestionWeight>, id: string): Record<string, QuestionWeight> {
  const next = { ...weighting };
  delete next[id];
  for (const key of Object.keys(next)) {
    if (key.startsWith(`${id}::part`)) delete next[key];
  }
  return next;
}

// espace de réponse générique affiché dans l'aperçu A4 — proportionné/structuré selon le type de réponse.
// `audioLabel` est passé par l'appelant (la traduction next-intl ne peut pas être lue dans une fonction pure).
export function renderAnswerSpace(q: Question, audioLabel: string) {
  const blankLines = (n: number) => (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: 22 }}>
      {Array.from({ length: n }, (_, i) => <div key={i} style={{ borderBottom: `1px solid ${ink(0.18)}` }} />)}
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
              <span style={{ width: 14, height: 14, border: `1.5px solid ${ink(0.35)}`, borderRadius: q.responseType === 'qcm' ? 3 : 999, flexShrink: 0, display: 'inline-block' }} />
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
              <span style={{ width: 26, height: 26, border: `1.5px solid ${ink(0.35)}`, borderRadius: 6, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#3a352c' }}>{c}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'dessin':
      return <div style={{ marginTop: 14, height: 180, border: `1px dashed ${ink(0.22)}`, borderRadius: 6 }} />;
    case 'audio':
      return <div style={{ marginTop: 14, height: 60, border: `1px dashed ${ink(0.22)}`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, color: palette.inkFaint }}>{audioLabel}</div>;
    case 'fill_blank':
      return blankLines(3);
    case 'textuelle':
      return blankLines(q.textLines ?? 4);
    default:
      return blankLines(5);
  }
}

// convertit l'ancien format booléen de identity (avant le drag and drop gauche/droite) vers IdentitySide
export function normalizeIdentitySide(value: unknown, fallback: IdentitySide): IdentitySide {
  if (value === 'left' || value === 'right' || value === 'hidden') return value;
  if (typeof value === 'boolean') return value ? fallback : 'hidden';
  return fallback;
}

// complète les configs enregistrées avant l'ajout de titleIncluded / identity.date / du placement gauche-droite / des pilules personnalisées avec leurs valeurs par défaut
export function normalizeExamConfig(config: ExamConfig): ExamConfig {
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

export function defaultPresentation(): ExamPresentation {
  return { identity: { nom: 'left', prenom: 'left', tag: 'left', classe: 'hidden', date: 'right' }, identityOrder: [...DEFAULT_IDENTITY_ORDER], customFields: [] };
}

export function defaultExamConfig(title?: string): ExamConfig {
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
export const FAVORITE_PRESENTATION_KEY = 'culture.examPresentationFavorite.v1';

export function getFavoritePresentation(): ExamPresentation {
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

export function saveFavoritePresentation(presentation: ExamPresentation) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FAVORITE_PRESENTATION_KEY, JSON.stringify(presentation));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function configQuestionIds(config: ExamConfig): string[] {
  return config.sections.flatMap(s => s.questionIds).filter(id => !isPageBreakId(id));
}

// aplatit toutes les sections en une liste ordonnée de questions et de repères « saut de page »
export function flattenSections(sections: ExamSection[], allQuestions: Question[]): FlatEntry[] {
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
export function moveSectionRow(sections: ExamSection[], allQuestions: Question[], fromFlatIdx: number, toFlatIdx: number, targetSectionIdx: number): ExamSection[] {
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
export function toggleQuestionInSections(sections: ExamSection[], id: string): ExamSection[] {
  const included = sections.some(s => s.questionIds.includes(id));
  let next = sections.map(s => ({ ...s, questionIds: s.questionIds.filter(qid => qid !== id) }));
  if (!included) {
    if (next.length === 0) next = [{ id: 'sec' + Date.now(), title: 'Partie 1', questionIds: [] }];
    next[next.length - 1] = { ...next[next.length - 1], questionIds: [...next[next.length - 1].questionIds, id] };
  }
  return next;
}

export function statusStyle(s: string) {
  return ({ publié: { bg: withAlpha(palette.greenSoft, 0.20), fg: '#3f5630' }, brouillon: { bg: withAlpha(palette.amberGlow, 0.22), fg: '#7a4d20' }, archivé: { bg: ink(0.07), fg: palette.inkSoft } } as Record<string, { bg: string; fg: string }>)[s] ?? { bg: ink(0.07), fg: palette.inkSoft };
}

export function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button title={title} onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${ink(0.12)}`, background: withAlpha(palette.paper, 0.7), color: palette.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{children}</button>
  );
}

// bouton « modifier la question » dans l'aperçu de l'éditeur d'examen — le cercle n'apparaît qu'au survol, pour indiquer que le bouton est cliquable
export function EditQuestionButton({ id, onOpenQuestion }: { id: string; onOpenQuestion: (id: string) => void }) {
  const t = useTranslations('examen');
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onOpenQuestion(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={t('editQuestion')}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: hovered ? '1px solid rgba(45,42,36,0.14)' : '1px solid transparent', background: hovered ? ink(0.045) : 'transparent', color: hovered ? palette.inkSoft : palette.inkFaint, cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'background 0.12s, border-color 0.12s' }}
    >
      <Settings2 size={14} strokeWidth={1.85} />
    </button>
  );
}

export function ActiveChip({ label, color, negative, filterKey, onRemove, setDraggedKey }: { label: string; color?: string; negative: boolean; filterKey: string; onRemove: () => void; setDraggedKey: (key: string | null) => void }) {
  return (
    <span
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', filterKey); setDraggedKey(filterKey); }}
      onDragEnd={() => setDraggedKey(null)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 6px 5px 11px', borderRadius: 999, border: negative ? '1px solid rgba(184,90,74,0.45)' : `1px solid ${ink(0.30)}`, background: negative ? palette.danger : palette.ink, color: palette.parchment, fontFamily: 'inherit', cursor: 'grab', clipPath: 'inset(0 round 999px)' }}
    >
      {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />}
      {label}
      <button onClick={onRemove} style={{ border: 'none', background: 'none', color: palette.parchment, cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1, opacity: 0.7 }}>×</button>
    </span>
  );
}
