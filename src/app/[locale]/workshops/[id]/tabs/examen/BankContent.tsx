'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronUp, Copy, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { palette, shadow, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import { type Question, type ResponseType } from '../QuestionEditor';
import {
  type Pool, type Exam, type SortBy, type SortDir,
  DEFAULT_SORT_DIR, NEVER_EXAM_ID, NO_DIFFICULTY, NO_ANSWER_ID, LABEL_COLORS,
  hasNoAnswer, DiffDots, TypePill, Diff, IconBtn, ActiveChip,
} from './examShared';

// ---- BANK — barre d'outils identique à T35 (recherche/tri/filtres toujours
// visibles), lignes de questions en mode dense : la carte entière envoie la
// question vers la feuille (fidèle à `onClick="{{bq.toggle}}"` de la maquette,
// lignes 916-926), avec un liseré vert quand elle y figure déjà (`inEx` du
// getter `banqueList`) ; 3 icônes d'action maximum (éditer/dupliquer/
// supprimer) + un chevron de détail séparé (pas une action sur la donnée).
// La banque ne montre que `context = 'exam'' — déjà garanti côté serveur
// (`getExamBankData`, `.eq('context','exam')`), rien à filtrer ici. ----
type FilterMode = 'pos' | 'neg';

function BankContent({ questions, pools, exams, draftIds, openId, setOpenId, onEditQuestion, onNewQuestion, onSendOne, onCreatePool, onUpdatePool, onDeletePool, onDuplicateQuestion, onDeleteQuestion }: {
  questions: Question[];
  pools: Pool[];
  exams: Exam[];
  draftIds: string[];
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
  const tr = useTranslations('examen');
  function answerSummary(q: { responseType: ResponseType; answer: string; choices: string[]; correctChoices: number[]; answerOptional?: boolean }): string {
    if (q.responseType === 'qcm' || q.responseType === 'qcs') {
      const correct = q.correctChoices.map((i) => q.choices[i]).filter(Boolean);
      return correct.length ? correct.join(' · ') : tr('answer.noCorrectChoice');
    }
    if (q.responseType === 'matching') return q.choices.map((c) => c.replace(' :: ', ' → ')).join(' · ') || tr('answer.noPairs');
    if (q.responseType === 'ordre') return q.choices.join(' → ') || tr('answer.noOrder');
    if (q.responseType === 'sans_reponse') return tr('answer.none');
    if (q.responseType === 'sondage') {
      const freeText = q.correctChoices.map((i) => q.choices[i]).filter(Boolean);
      return freeText.length ? tr('answer.surveyFree', { choices: freeText.join(' · ') }) : tr('answer.surveyNoCorrection');
    }
    if (q.responseType === 'textuelle' && q.answerOptional) return tr('answer.freeNoCorrection');
    return q.answer || tr('answer.notSet');
  }
  const qTypeLabel = (qt: string): string => qt === 'textuel' ? tr('questionType.textuel') : qt === 'visuel' ? tr('questionType.visuel') : qt === 'audio' ? tr('questionType.audio') : qt;
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
        return dir * tr(`responseType.${a.responseType}`).localeCompare(tr(`responseType.${b.responseType}`));
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

  function renderQuestionCard(q: Question) {
    const open = openId === q.id;
    const hasParts = q.parts.length > 0;
    const inDraft = draftIds.includes(q.id);
    return (
      <div
        key={q.id}
        onClick={() => onSendOne(q.id)}
        style={{
          cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 12,
          background: inDraft ? withAlpha(palette.green, 0.08) : palette.surfaceRaised,
          border: inDraft ? `1px solid ${palette.greenSoft}` : `1px solid ${palette.line}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: palette.ink, lineHeight: 1.4 }}>
            {q.title.trim() || q.content || tr('noStatement')}
          </div>
          {inDraft && (
            <span title={tr('bank.sendToEditor')} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: palette.green, color: palette.onGreen, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={12} strokeWidth={2.5} />
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <TypePill type={q.responseType} />
          {hasParts && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, border: `1px solid ${palette.gold}`, background: withAlpha(palette.gold, 0.14), color: palette.amberLight }}>
              {tr('bank.parts', { count: q.parts.length + 1 })}
            </span>
          )}
          {q.pools.map(pid => {
            const p = pools.find(pp => pp.id === pid);
            if (!p) return null;
            return <span key={pid} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: palette.surfaceSunken, color: palette.inkMuted }}>#{p.name}</span>;
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setOpenId(open ? null : q.id)}
            title={open ? tr('bank.hideDetail') : tr('bank.showDetail')}
            style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', color: palette.inkFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 'auto' }}
          >
            {open ? <ChevronUp size={15} strokeWidth={1.75} /> : <ChevronDown size={15} strokeWidth={1.75} />}
          </button>
          <IconBtn title={tr('bank.editQuestion')} onClick={() => onEditQuestion(q)}>
            <Pencil size={14} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn title={tr('bank.duplicateQuestion')} onClick={() => onDuplicateQuestion(q)}>
            <Copy size={14} strokeWidth={1.75} />
          </IconBtn>
          <IconBtn title={tr('bank.deleteQuestion')} onClick={() => setPendingDeleteQuestion(q)}>
            <Trash2 size={14} strokeWidth={1.75} />
          </IconBtn>
        </div>

        {open && (
          <div onClick={(e) => e.stopPropagation()} style={{ borderTop: `1px solid ${palette.line}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default' }}>
            <div style={{ padding: '8px 10px', borderRadius: 8, background: palette.surfaceSunken, border: `1px solid ${palette.line}` }}>
              <div style={{ fontSize: 11, color: palette.amberLight, marginBottom: 4 }}>{tr('bank.part', { n: 1 })}</div>
              <div style={{ fontSize: 12.5, color: palette.ink, marginBottom: 6 }}>{q.content || tr('noStatement')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <TypePill type={q.responseType} />
                {q.difficulty.enabled && <Diff n={q.difficulty.value} />}
                {q.duration.enabled && <span style={{ fontSize: 10.5, color: palette.inkSoft }}>{q.duration.minutes}min {(q.duration.seconds ?? 0).toString().padStart(2, '0')}s</span>}
              </div>
              <div style={{ fontSize: 12, color: palette.ink }}><span style={{ fontWeight: 600, color: palette.amberLight }}>{tr('answer.prefix')}</span>{answerSummary(q)}</div>
            </div>
            {q.parts.map((part, i) => (
              <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: palette.surfaceSunken, border: `1px solid ${palette.line}` }}>
                <div style={{ fontSize: 11, color: palette.amberLight, marginBottom: 4 }}>{tr('bank.part', { n: i + 2 })}</div>
                <div style={{ fontSize: 12.5, color: palette.ink, marginBottom: 6 }}>{part.content || tr('noStatement')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <TypePill type={part.responseType} />
                  {part.difficulty.enabled && <Diff n={part.difficulty.value} />}
                  {part.duration.enabled && <span style={{ fontSize: 10.5, color: palette.inkSoft }}>{part.duration.minutes}min {(part.duration.seconds ?? 0).toString().padStart(2, '0')}s</span>}
                </div>
                <div style={{ fontSize: 12, color: palette.ink }}><span style={{ fontWeight: 600, color: palette.amberLight }}>{tr('answer.prefix')}</span>{answerSummary(part)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  type ActiveFilter = { key: string; category: 'qtype' | 'pool' | 'type' | 'diff' | 'exam' | 'answer'; value: string | number; label: string; color?: string };
  const activeFilters: ActiveFilter[] = [
    ...filterQTypes.map(qt => ({ key: `qtype:${qt}`, category: 'qtype' as const, value: qt, label: qTypeLabel(qt) })),
    ...filterPools.map(id => ({ key: `pool:${id}`, category: 'pool' as const, value: id, label: pools.find(p => p.id === id)?.name ?? id, color: pools.find(p => p.id === id)?.color })),
    ...filterTypes.map(ty => ({ key: `type:${ty}`, category: 'type' as const, value: ty, label: tr(`responseType.${ty}`) })),
    ...filterDiffs.map(d => ({ key: `diff:${d}`, category: 'diff' as const, value: d, label: d === NO_DIFFICULTY ? tr('bank.filterNoDifficulty') : tr('bank.filterDifficulty', { n: d }) })),
    ...filterExams.map(eid => ({ key: `exam:${eid}`, category: 'exam' as const, value: eid, label: eid === NEVER_EXAM_ID ? tr('bank.statusNew') : (exams.find(ex => ex.id === eid)?.title ?? eid) })),
    ...filterAnswer.map(aid => ({ key: `answer:${aid}`, category: 'answer' as const, value: aid, label: tr('bank.statusIncomplete') })),
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
    <div style={{ padding: '16px 16px 20px' }}>
      <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink, marginBottom: 10 }}>{tr('bank.title')}</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button onClick={onNewQuestion} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, background: palette.ink, color: palette.onInk, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} strokeWidth={2} /> {tr('bank.newQuestion')}
        </button>
        <button disabled title={tr('bank.generateAI')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, background: palette.surfaceSunken, color: palette.inkFaint, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'not-allowed' }}>
          <Sparkles size={14} strokeWidth={1.75} /> {tr('bank.generateAI')}
        </button>
      </div>

      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <div
            onDragEnter={e => e.preventDefault()}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverZone('pos'); }}
            onDragLeave={() => setDragOverZone(prev => prev === 'pos' ? null : prev)}
            onDrop={e => handleDropOnZone(e, 'pos')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '4px 6px', borderRadius: 8, border: dragOverZone === 'pos' ? `1px dashed ${palette.greenSoft}` : '1px dashed transparent', background: dragOverZone === 'pos' ? withAlpha(palette.greenSoft, 0.10) : 'transparent' }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint }}>{tr('bank.include')}</span>
            {positiveFilters.map(f => (
              <ActiveChip key={f.key} filterKey={f.key} label={f.label} color={f.color} negative={false} onRemove={() => removeFilter(f)} setDraggedKey={setDraggedKey} />
            ))}
            {positiveFilters.length === 0 && <span style={{ fontSize: 11, color: palette.inkGhost, fontStyle: 'italic' }}>{tr('bank.dropFilterHere')}</span>}
          </div>
          <div
            onDragEnter={e => e.preventDefault()}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverZone('neg'); }}
            onDragLeave={() => setDragOverZone(prev => prev === 'neg' ? null : prev)}
            onDrop={e => handleDropOnZone(e, 'neg')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '4px 6px', borderRadius: 8, border: dragOverZone === 'neg' ? `1px dashed ${palette.danger}` : '1px dashed transparent', background: dragOverZone === 'neg' ? withAlpha(palette.danger, 0.10) : 'transparent' }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint }}>{tr('bank.exclude')}</span>
            {negativeFilters.map(f => (
              <ActiveChip key={f.key} filterKey={f.key} label={f.label} color={f.color} negative={true} onRemove={() => removeFilter(f)} setDraggedKey={setDraggedKey} />
            ))}
            {negativeFilters.length === 0 && <span style={{ fontSize: 11, color: palette.inkGhost, fontStyle: 'italic' }}>{tr('bank.dropFilterHere')}</span>}
          </div>
        </div>
      )}

      {/* Recherche */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: palette.surfaceInput, border: `1px solid ${palette.line}`, borderRadius: 10, padding: '8px 11px', marginBottom: 8 }}>
        <Search size={15} strokeWidth={1.75} color={palette.inkFaint} style={{ flexShrink: 0 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('bank.searchPlaceholder')} style={{ flex: 1, minWidth: 0, fontSize: 13, color: palette.ink, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
      </div>

      {/* Filtres + tri */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div ref={filterRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <button onClick={() => setFilterOpen(o => !o)} style={{ width: '100%', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 9, border: activeFilterCount > 0 ? `1px solid ${palette.greenSoft}` : `1px solid ${palette.lineStrong}`, background: activeFilterCount > 0 ? withAlpha(palette.green, 0.12) : palette.surfaceRaised, color: activeFilterCount > 0 ? palette.greenBrand : palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit' }}>
            {tr('bank.filters')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾
          </button>
          {filterOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 290, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg, zIndex: 20, display: 'flex', flexDirection: 'column', maxHeight: 'min(520px, calc(100vh - 200px))' }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: palette.ink }}>{tr('bank.filtersTitle')}</span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} style={{ fontSize: 11.5, color: palette.greenBrand, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{tr('bank.filtersReset')}</button>
                )}
              </div>
              <div style={{ overflowY: 'auto', padding: '0 14px 14px', flex: 1, minHeight: 0 }}>
                {/* Type de question — visible seulement si plusieurs types présents dans la banque */}
                {allQTypes.length > 1 && <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.qTypeSection')}</div>}
                {allQTypes.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {allQTypes.map(qt => {
                      const active = filterQTypes.includes(qt);
                      return (
                        <button key={qt} onClick={() => toggleQTypeFilter(qt)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                          {qTypeLabel(qt)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Type de réponse */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.rTypeSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {allTypes.map(ty => {
                    const active = filterTypes.includes(ty);
                    return (
                      <button key={ty} onClick={() => toggleTypeFilter(ty)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                        {tr(`responseType.${ty}`)}
                      </button>
                    );
                  })}
                </div>
                {/* Statut */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.statusSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {(() => {
                    const active = filterExams.includes(NEVER_EXAM_ID);
                    return (
                      <button onClick={() => toggleExamFilter(NEVER_EXAM_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                        {tr('bank.statusNew')}
                      </button>
                    );
                  })()}
                  {(() => {
                    const active = filterAnswer.includes(NO_ANSWER_ID);
                    return (
                      <button onClick={() => toggleAnswerFilter(NO_ANSWER_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                        {tr('bank.statusIncomplete')}
                      </button>
                    );
                  })()}
                </div>
                {/* Libellés */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.labelsSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {pools.map(l => {
                    const active = filterPools.includes(l.id);
                    const displayName = l.name.length > 18 ? l.name.slice(0, 18) + '…' : l.name;
                    return (
                      <span key={l.id} style={{ position: 'relative', display: 'inline-flex' }}>
                        <button onClick={() => togglePoolFilter(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, display: 'inline-block' }} />{displayName}
                        </button>
                        <button onClick={() => editingLabel === l.id ? setEditingLabel(null) : openEditLabel(l)} title={tr('bank.editLabelTitle')} style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, color: palette.inkFaint, cursor: 'pointer', fontSize: 10, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Pencil size={7} strokeWidth={2} />
                        </button>
                      </span>
                    );
                  })}
                  {creatingLabel ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input autoFocus value={newLabelName} onChange={e => setNewLabelName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLabel(); if (e.key === 'Escape') { setCreatingLabel(false); setNewLabelName(''); } }} placeholder={tr('editor.labelNamePlaceholder')} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: `1px solid ${palette.lineStrong}`, outline: 'none', fontFamily: 'inherit', width: 110, background: palette.surfaceInput, color: palette.ink }} />
                      <button onClick={addLabel} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px solid ${palette.ink}`, background: palette.ink, color: palette.onInk, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('add')}</button>
                      <button onClick={() => { setCreatingLabel(false); setNewLabelName(''); }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1px solid ${palette.line}`, background: 'transparent', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('cancelLower')}</button>
                    </span>
                  ) : (
                    <button onClick={() => setCreatingLabel(true)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: `1.5px dashed ${palette.lineStrong}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('bank.newLabel')}</button>
                  )}
                </div>
                {/* Difficulté */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.difficultySection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(d => {
                    const active = filterDiffs.includes(d);
                    return (
                      <button key={d} onClick={() => toggleDiffFilter(d)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                        <DiffDots level={d} />{d}/5
                      </button>
                    );
                  })}
                  {(() => {
                    const active = filterDiffs.includes(NO_DIFFICULTY);
                    return (
                      <button onClick={() => toggleDiffFilter(NO_DIFFICULTY)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                        <DiffDots level={0} />{tr('bank.noDifficulty')}
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
                  <div onClick={() => setEditingLabel(null)} style={{ position: 'absolute', inset: 0, zIndex: 29, background: withAlpha(palette.cream, 0.7), borderRadius: 12 }} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, width: 190, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg, padding: 10 }}>
                    <input autoFocus value={editLabelName} onChange={e => setEditLabelName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEditLabel(); if (e.key === 'Escape') setEditingLabel(null); }} style={{ width: '100%', fontSize: 11.5, padding: '6px 8px', borderRadius: 8, border: `1px solid ${palette.lineStrong}`, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' as const, background: palette.surfaceInput, color: palette.ink }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {LABEL_COLORS.map(c => (
                        <button key={c} onClick={() => setEditLabelColor(c)} title={c} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: editLabelColor === c ? `2px solid ${palette.ink}` : `1px solid ${palette.lineStrong}`, cursor: 'pointer', padding: 0 }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <button onClick={saveEditLabel} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: 'none', background: palette.ink, color: palette.onInk, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('bank.saveLabel')}</button>
                      <button onClick={() => setEditingLabel(null)} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('cancelLower')}</button>
                    </div>
                    <button onClick={() => setPendingDeleteLabel(label.id)} style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${withAlpha(palette.danger, 0.30)}`, background: withAlpha(palette.danger, 0.08), color: palette.danger, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('bank.deleteLabel')}</button>
                  </div>
                  </>
                );
              })()}
            </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', borderRadius: 9, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, overflow: 'hidden', flexShrink: 0 }}>
          <button type="button" title={sortDir === 'asc' ? tr('bank.sortAsc') : tr('bank.sortDesc')} onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')} style={{ width: 32, height: 34, border: 'none', borderRight: `1px solid ${palette.line}`, background: 'transparent', color: palette.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
            {sortDir === 'asc' ? <ChevronUp size={14} strokeWidth={1.75} /> : <ChevronDown size={14} strokeWidth={1.75} />}
          </button>
          <select value={sortBy} onChange={e => changeSortBy(e.target.value as SortBy)} style={{ fontSize: 12, padding: '8px 8px', border: 'none', background: 'transparent', color: palette.inkMuted, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
            <option value="recent">{tr('bank.sortRecent')}</option>
            <option value="name">{tr('bank.sortName')}</option>
            <option value="type">{tr('bank.sortType')}</option>
            <option value="difficulty">{tr('bank.sortDifficulty')}</option>
            <option value="label">{tr('bank.sortLabel')}</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(q => renderQuestionCard(q))}
        {filtered.length === 0 && (
          <div style={{ fontSize: 12.5, color: palette.inkFaint, padding: '20px 0', textAlign: 'center' as const }}>{tr('bank.noMatch')}</div>
        )}
      </div>
      {pendingDeleteQuestion && (() => {
        const q = pendingDeleteQuestion;
        const affectedExams = exams.filter(e => (e.config?.sections ?? []).some(sec => sec.questionIds.includes(q.id)));
        return (
          <ConfirmDialog
            portal
            width={420}
            title={tr('bank.deleteQuestionTitle')}
            description={tr('irreversible')}
            confirmLabel={tr('delete')}
            onCancel={() => setPendingDeleteQuestion(null)}
            onConfirm={() => { onDeleteQuestion(q); setPendingDeleteQuestion(null); }}
          >
            {affectedExams.length > 0 && (
              <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 9, background: withAlpha(palette.danger, 0.08), textAlign: 'left' as const }}>
                <div style={{ fontSize: 11.5, color: palette.danger, marginBottom: 6 }}>{tr('bank.deleteQuestionInExams')}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: palette.inkMuted }}>
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
            title={tr('bank.deleteLabelTitle', { name: label.name })}
            description={`${count > 0 ? tr('bank.deleteLabelCount', { count }) : ''}${tr('irreversible')}`}
            confirmLabel={tr('delete')}
            onCancel={() => setPendingDeleteLabel(null)}
            onConfirm={confirmDeleteLabel}
          />
        );
      })()}
    </div>
  );
}

export default BankContent;
