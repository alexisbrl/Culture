'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Check, Star, RefreshCw, SeparatorHorizontal, AlertTriangle } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import { type Question } from '../QuestionEditor';
import {
  type Exam, type ExamConfig, type ExamPresentation, type ExamSection, type QuestionWeight,
  type IdentitySide, type CandidateIdentity,
  IDENTITY_KEY_SET, IDENTITY_LABELS,
  A4_TITLE_BLOCK_HEIGHT, A4_IDENTITY_ROW_HEIGHT, A4_MARGIN_PX, A4_PAGE_HEIGHT,
  A4_PAGE_BREAK_HEIGHT, A4_ROW_FALLBACK_HEIGHT, A4_SECTION_HEADER_HEIGHT, A4_BLOCK_WIDTH,
  PAGE_BREAK_PREFIX,
  configQuestionIds, hasNoAnswer, defaultWeight, partWeightKey, flattenSections, isPageBreakId,
  computePagination, defaultPresentation, getFavoritePresentation, saveFavoritePresentation,
  moveSectionRow, clearWeightingFor, toggleQuestionInSections, formatDuration,
  WeightControls, EditQuestionButton, renderAnswerSpace,
} from './examShared';

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
    return <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: palette.inkGhost, marginBottom: 10 }}>page {n} / {pageCount}</div>;
  }
  function pageBreakSeparator(gi: number) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 20px' }}>
        <div style={{ flex: 1, borderTop: `1px dashed ${ink(0.15)}` }} />
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: palette.inkGhost, whiteSpace: 'nowrap' as const }}>page {pageNumberOf(gi)} / {pageCount}</span>
        <div style={{ flex: 1, borderTop: `1px dashed ${ink(0.15)}` }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 12px 24px 24px', height: '100%', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column', background: palette.creamAlt }}>
      <div style={{ marginBottom: 14, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink }}>Éditeur d&apos;examen</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft }}>les questions s&apos;enchaînent dans cet ordre — glisse pour réorganiser</div>
        </div>
        <button onClick={() => setConfirmClearOpen(true)} style={{ flexShrink: 0, fontSize: 12, padding: '8px 14px', borderRadius: 9, border: `1px solid ${withAlpha(palette.danger, 0.28)}`, background: withAlpha(palette.danger, 0.08), color: palette.danger, cursor: 'pointer', fontFamily: 'inherit' }}>
          {editing ? 'annuler les modifications' : "réinitialiser l'éditeur"}
        </button>
      </div>
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: withAlpha(palette.amberGlow, 0.18), border: `1px solid ${withAlpha(palette.amber, 0.35)}`, marginBottom: 14, flexShrink: 0 }}>
          <span style={{ fontSize: 14, color: palette.amber }}>✎</span>
          <div style={{ flex: 1, fontSize: 12.5, color: '#3a352c' }}>Modification de <b style={{ fontWeight: 600 }}>{editing.title}</b></div>
          <button onClick={onCancelEdit} style={{ fontSize: 11.5, color: '#7a4d20', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>annuler ✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, borderRight: `1px solid ${ink(0.08)}`, paddingRight: 16, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: palette.inkSoft }}>questions envoyées</div>
          <div style={{ fontSize: 11, color: palette.inkFaint, marginBottom: 4 }}>coche pour ajouter à l&apos;examen</div>
          {available.length === 0 && <div style={{ fontFamily: "'Caveat', cursive", fontSize: 15, color: palette.amber }}>« envoie des questions depuis la banque »</div>}
          {available.map(q => {
            const included = includedIds.includes(q.id);
            const incomplete = hasNoAnswer(q) || !q.content.trim();
            return (
              <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 9px', borderRadius: 8, background: included ? withAlpha(palette.green, 0.08) : withAlpha(palette.paper, 0.7), border: `1px solid ${ink(0.06)}` }}>
                <input type="checkbox" checked={included} onChange={() => toggleAvailable(q.id)} style={{ marginTop: 2, flexShrink: 0, accentColor: palette.green }} />
                {incomplete && (
                  <button onClick={() => onOpenQuestion(q.id)} title="question incomplète - cliquer pour compléter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, borderRadius: '50%', border: `1px solid ${withAlpha(palette.danger, 0.35)}`, background: withAlpha(palette.danger, 0.10), color: palette.danger, cursor: 'pointer', padding: 0, flexShrink: 0, alignSelf: 'flex-start' }}><AlertTriangle size={10} strokeWidth={2} /></button>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#3a352c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title.trim() || q.content || '(sans énoncé)'}</div>
                  {q.parts.length > 0 && <span style={{ fontSize: 10.5, color: '#7a4d20' }}>{q.parts.length + 1} parties</span>}
                </div>
                <span onClick={() => requestRemoveFromDraft(q.id)} title="retirer de la liste" style={{ fontSize: 14, color: palette.danger, cursor: 'pointer', flexShrink: 0 }}>×</span>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', minHeight: 0, paddingRight: 24, boxSizing: 'border-box' as const }}>
          <div style={{ background: ink(0.03), borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: palette.inkSoft, marginBottom: 8 }}>paramètres</div>

            <div style={{ fontSize: 11, color: palette.inkMuted, marginBottom: 6 }}>intitulé</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <input value={config.title} onChange={e => patchConfig({ title: e.target.value })} style={{ flex: 1, fontSize: 15, fontWeight: 500, color: palette.ink, border: `1px solid ${ink(0.12)}`, borderRadius: 9, padding: '10px 12px', background: palette.paper, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
              <button
                type="button"
                onClick={() => patchConfig({ titleIncluded: !config.titleIncluded })}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '9px 14px', borderRadius: 999, border: config.titleIncluded ? '1px solid rgba(79,107,64,0.35)' : `1px solid ${ink(0.14)}`, background: config.titleIncluded ? withAlpha(palette.green, 0.14) : 'transparent', color: config.titleIncluded ? palette.green : palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' as const }}
              >
                {config.titleIncluded && <Check size={13} strokeWidth={2.5} />}
                afficher
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: palette.inkMuted }}>présentation</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setConfirmApplyFavoriteOpen(true)}
                  title="appliquer la présentation favorite"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px', borderRadius: 999, border: `1px solid ${withAlpha(palette.amber, 0.30)}`, background: withAlpha(palette.amberGlow, 0.14), color: '#7a4d20', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <Star size={11.5} strokeWidth={2} fill={palette.amber} color={palette.amber} />
                  favori
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmSaveFavoriteOpen(true)}
                  title="remplacer le favori par la présentation actuelle"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: `1px solid ${ink(0.12)}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', padding: 0 }}
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
                  style={{ flex: 1, minHeight: 44, border: `1px dashed ${ink(0.18)}`, borderRadius: 9, padding: 8, display: 'flex', flexWrap: 'wrap' as const, alignContent: 'flex-start' as const, gap: 6 }}
                >
                  <div style={{ fontSize: 9.5, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em', width: '100%' }}>{side === 'left' ? 'à gauche' : 'à droite'}</div>
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
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: removable ? '5px 6px 5px 11px' : '5px 11px', borderRadius: 999, border: `1px solid ${withAlpha(palette.green, 0.35)}`, background: withAlpha(palette.green, 0.14), color: palette.green, cursor: 'grab', opacity: draggingIdentityKey === id ? 0.4 : 1 }}
                      >
                        <span style={{ color: palette.inkFaint, fontSize: 11 }}>⠿</span>
                        {labelOfItem(id)}
                        {removable && (
                          <button onClick={() => removeCustomField(id)} style={{ border: 'none', background: 'none', color: palette.green, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
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
              style={{ minHeight: 36, border: `1px dashed ${ink(0.14)}`, borderRadius: 9, padding: 8, display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 6, marginBottom: 14 }}
            >
              <div style={{ fontSize: 9.5, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em', width: '100%' }}>non affiché</div>
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
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: removable ? '5px 6px 5px 11px' : '5px 11px', borderRadius: 999, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkFaint, cursor: 'grab', opacity: draggingIdentityKey === id ? 0.4 : 1 }}
                  >
                    <span style={{ color: palette.inkFaint, fontSize: 11 }}>⠿</span>
                    {labelOfItem(id)}
                    {removable && (
                      <button onClick={() => removeCustomField(id)} style={{ border: 'none', background: 'none', color: palette.inkFaint, cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
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
                    style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 999, border: `1px solid ${ink(0.18)}`, background: palette.paper, fontFamily: 'inherit', outline: 'none', width: 140 }}
                  />
                  <button type="button" onClick={addCustomField} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: 'none', background: palette.green, color: palette.paper, cursor: 'pointer', fontFamily: 'inherit' }}>ajouter</button>
                  <button type="button" onClick={() => { setCreatingCustomField(false); setNewFieldName(''); }} style={{ fontSize: 11.5, padding: '5px 8px', borderRadius: 999, border: 'none', background: 'none', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>annuler</button>
                </span>
              ) : (
                <button type="button" onClick={() => setCreatingCustomField(true)} style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 999, border: `1px dashed ${ink(0.25)}`, background: 'transparent', color: palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit' }}>+ pilule personnalisée</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <div style={{ background: ink(0.04), borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 9.5, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>parties</div>
                  <button type="button" onClick={addSection} style={{ fontSize: 13, fontWeight: 500, color: palette.green, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>+ partie</button>
                </div>
                <div style={{ fontSize: 14, color: palette.ink, fontWeight: 500, marginTop: 1 }}>{config.sections.length}</div>
              </div>
              <div style={{ background: ink(0.04), borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 9.5, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>questions</div>
                  <button type="button" onClick={addPageBreak} title="ajouter un saut de page" style={{ fontSize: 13, fontWeight: 500, color: palette.green, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>+ saut de page</button>
                </div>
                <div style={{ fontSize: 14, color: palette.ink, fontWeight: 500, marginTop: 1 }}>{includedIds.length}</div>
              </div>
              <div style={{ background: ink(0.04), borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 9.5, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>barème</div>
                <div style={{ fontSize: 14, color: palette.ink, fontWeight: 500, marginTop: 1 }}>{totalPoints} pt{totalPoints === 1 ? '' : 's'}</div>
              </div>
              <div style={{ background: ink(0.04), borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 9.5, color: palette.inkFaint, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>durée</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 1 }}>
                  <input type="number" min={5} step={5} value={config.durationMinutes} onChange={e => patchConfig({ durationMinutes: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 50, fontSize: 14, color: palette.ink, fontWeight: 500, border: 'none', background: 'transparent', fontFamily: 'inherit', padding: 0, outline: 'none' }} />
                  <span style={{ fontSize: 11, color: palette.inkFaint }}>min · {formatDuration(config.durationMinutes)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: palette.inkSoft }}>déroulé de l&apos;examen</div>
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
              <button onClick={() => onOpenQuestion(id)} title="question incomplète - cliquer pour compléter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: `1px solid ${withAlpha(palette.danger, 0.35)}`, background: withAlpha(palette.danger, 0.10), color: palette.danger, cursor: 'pointer', padding: 0, flexShrink: 0 }}><AlertTriangle size={13} strokeWidth={2} /></button>
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
                    <div style={{ width: A4_BLOCK_WIDTH, height: A4_PAGE_HEIGHT, flexShrink: 0, background: palette.paper, border: `1px solid ${ink(0.08)}`, borderRadius: 4, boxShadow: `0 2px 14px ${ink(0.06)}`, overflow: 'hidden' }}>
                      <div style={{ height: A4_MARGIN_PX, flexShrink: 0 }} />
                      {chunkIdx === 0 && (identityBlockHeight > 0 || titleBlockHeight > 0) && (
                        <div ref={el => { qRefs.current['__page1_header__'] = el; }}>
                          {identityBlockHeight > 0 && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '24px 34px 0' }}>
                              <div style={{ fontSize: 13, color: '#3a352c', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {identityLeftKeys.map(key => (
                                  <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, width: 220 }}>
                                    <span>{labelOfItem(key)}</span>
                                    <span style={{ flex: 1, borderBottom: `1px solid ${ink(0.3)}` }} />
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 13, color: '#3a352c', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {identityRightKeys.map(key => (
                                  <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, width: 160 }}>
                                    <span>{labelOfItem(key)}</span>
                                    <span style={{ flex: 1, borderBottom: `1px solid ${ink(0.3)}` }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {titleBlockHeight > 0 && (
                            <div style={{ padding: '28px 34px 90px', textAlign: 'center' as const, fontSize: 24, fontWeight: 600, color: palette.ink }}>
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
                                style={{ width: '100%', fontSize: 16, fontWeight: 600, color: '#7a4d20', background: focusedSectionIdx === row.sectionIdx ? withAlpha(palette.amber, 0.06) : 'transparent', border: 'none', padding: '14px 40px 10px 34px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                              />
                              <span style={{ position: 'absolute' as const, right: 16, top: 16, fontSize: 12, color: withAlpha(palette.amber, 0.45), pointerEvents: 'none' as const }}>✎</span>
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
                              style={{ margin: '0 34px 14px', fontSize: 11.5, color: palette.inkGhost, padding: '14px', textAlign: 'center' as const, border: `1px dashed ${ink(0.12)}`, borderRadius: 9, background: dropIndicator === start && dragFlatIdx !== null ? withAlpha(palette.amber, 0.08) : 'transparent' }}
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
                              <div style={{ height: showLineBefore ? 3 : 0, background: palette.amber, transition: 'all 0.1s' }} />
                              <div style={{ margin: '10px 34px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: `1px dashed ${ink(0.20)}`, borderRadius: 8, background: ink(0.045), color: palette.inkFaint, fontSize: 11.5 }}>
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
                            <div {...dragOverPropsFor(gi, row.sectionIdx)} ref={el => { qRefs.current[row.key] = el; }} style={{ background: hovered ? withAlpha(palette.amber, 0.08) : 'transparent', transition: 'background 0.1s' }}>
                              <div style={{ height: showLineBefore ? 3 : 0, background: palette.amber, transition: 'all 0.1s' }} />
                              <div style={{ padding: '20px 34px' }}>
                                <div ref={el => { qRefs.current[`${q.id}::head`] = el; }}>
                                  <div style={{ fontSize: 14, color: palette.ink, lineHeight: 1.6 }}>
                                    <span style={{ color: palette.amber, fontWeight: 600, marginRight: 8 }}>{subStart}.</span>
                                    {q.content || '(sans énoncé)'}
                                  </div>
                                  {renderAnswerSpace(q)}
                                </div>
                                {q.parts.map((part, pi) => (
                                  <div key={pi} ref={el => { qRefs.current[partWeightKey(q.id, pi)] = el; }} style={{ marginTop: 40, paddingLeft: 28 }}>
                                    <div style={{ fontSize: 14, color: palette.ink, lineHeight: 1.6 }}>
                                      <span style={{ color: palette.amber, fontWeight: 600, marginRight: 8 }}>{subStart + pi + 1}.</span>
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
                                <button type="button" onClick={() => removeSection(row.sectionIdx)} title="supprimer la partie" style={{ fontSize: 15, color: palette.danger, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
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
                              <span onClick={() => removePageBreak(row.id)} title="retirer le saut de page" style={{ fontSize: 15, color: palette.danger, cursor: 'pointer' }}>×</span>
                            </div>
                          );
                        }
                        const { gi, q } = row;
                        return (
                          <div key={row.key} {...dragOverPropsFor(gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 20, boxSizing: 'border-box' as const }}>
                            <span style={{ fontSize: 11, color: palette.inkFaint, fontVariantNumeric: 'tabular-nums' }}>{String(gi + 1).padStart(2, '0')}</span>
                            <WeightControls weight={config.weighting[q.id] ?? defaultWeight()} onChange={patch => updateWeight(q.id, patch)} />
                            {q.parts.map((_part, pi) => {
                              const key = partWeightKey(q.id, pi);
                              return (
                                <div key={pi} style={{ height: rowHeights[key] ?? A4_ROW_FALLBACK_HEIGHT, marginTop: 40, paddingTop: 14, boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 9.5, color: palette.inkGhost }} title={`pondération de la partie ${pi + 2}`}>part. {pi + 2}</span>
                                  <WeightControls weight={config.weighting[key] ?? defaultWeight()} onChange={patch => updateWeight(key, patch)} />
                                </div>
                              );
                            })}
                            <span onClick={() => toggleAvailable(q.id)} title="retirer de l'examen" style={{ fontSize: 15, color: palette.danger, cursor: 'pointer' }}>×</span>
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
              style={{ height: 18, marginTop: -8, marginBottom: 14, borderRadius: 6, background: dropIndicator === flat.length ? withAlpha(palette.amber, 0.12) : 'transparent', border: dropIndicator === flat.length ? '1px dashed rgba(168,122,58,0.4)' : '1px dashed transparent' }}
            />
          )}

          <button onClick={handleGenerateClick} style={{ width: '100%', padding: '9px', borderRadius: 9, background: palette.green, border: 'none', color: palette.parchment, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' as const }}>
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
            ? <>Les modifications en cours sur <strong style={{ color: palette.ink }}>{editing.title}</strong> seront abandonnées. L&apos;examen déjà enregistré n&apos;est pas affecté.</>
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
          icon={<Star size={18} strokeWidth={2} fill={palette.amber} color={palette.amber} />}
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

export default GeneratorContent;
