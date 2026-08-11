'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { palette, shadow, withAlpha, ink, inkOn } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import { type Question, type ResponseType } from '../QuestionEditor';
import {
  type Pool, type Exam, type SortBy, type SortDir,
  DEFAULT_SORT_DIR, NEVER_EXAM_ID, LABEL_COLORS, CARD_LINE, CARD_ACTION_BTN,
  TypeIcon, IconBtn, ActiveChip, ListToolbar, FilterButton, ListCard,
} from './examShared';

// Filtre « sans chapitre » : les questions dont aucune notion associée n'est
// rattachée à un chapitre (y compris celles sans notion du tout).
const NO_CHAPTER_ID = '__nochapter__';

// critères de tri proposés par la banque de questions
const BANK_SORTS: readonly SortBy[] = ['recent', 'name', 'type', 'label'];

// ---- BANK — barre d'outils identique à T35 (recherche/tri/filtres toujours
// visibles), lignes de questions en mode dense : la carte entière envoie la
// question vers la feuille (fidèle à `onClick="{{bq.toggle}}"` de la maquette,
// lignes 916-926), avec un liseré vert quand elle y figure déjà (`inEx` du
// getter `banqueList`) ; 3 icônes d'action maximum (éditer/dupliquer/
// supprimer) + un chevron de détail séparé (pas une action sur la donnée).
// La banque ne montre que `context = 'exam'' — déjà garanti côté serveur
// (`getExamBankData`, `.eq('context','exam')`), rien à filtrer ici. ----
type FilterMode = 'pos' | 'neg';

// Gabarit de carte (`CARD_*`) et titre coupé à deux lignes (`ClampedTitle`) :
// voir `examShared` — la liste d'examens suit exactement la même trame.
const CARD_DRAFT_TINT = withAlpha(palette.green, 0.08); // teinte de la carte déjà posée sur la feuille

function BankContent({ questions, pools, exams, notions, chapters, draftIds, editingQuestionId, openId, setOpenId, onEditQuestion, onNewQuestion, onToggleInExam, onCreatePool, onUpdatePool, onDeletePool, onDeleteQuestion }: {
  questions: Question[];
  pools: Pool[];
  exams: Exam[];
  notions: { id: string; title: string; chapterId: string | null }[];
  chapters: { id: string; name: string }[];
  draftIds: string[];
  editingQuestionId: string | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEditQuestion: (q: Question) => void;
  onNewQuestion: () => void;
  onToggleInExam: (id: string) => void;
  onCreatePool: (name: string) => string;
  onUpdatePool: (pool: Pool) => void;
  onDeletePool: (id: string) => void;
  onDeleteQuestion: (q: Question) => void;
}) {
  const tr = useTranslations('examen');
  const [filterPools, setFilterPools] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<ResponseType[]>([]);
  const [filterChapters, setFilterChapters] = useState<string[]>([]);
  const [filterExams, setFilterExams] = useState<string[]>([]);
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

  const allTypes = Array.from(new Set(questions.map(q => q.responseType)));
  const activeFilterCount = filterPools.length + filterTypes.length + filterChapters.length + filterExams.length;

  // Chapitre(s) d'une question = ceux de ses notions associées. La table de
  // correspondance est construite une fois pour toutes les questions plutôt
  // qu'un `find` par notion et par question.
  const chapterOfNotion = new Map(notions.map(n => [n.id, n.chapterId]));
  const chaptersOfQuestion = (q: Question): Set<string> => {
    const set = new Set<string>();
    // Les notions des questions liées comptent autant que celles de la question
    // principale : une grappe se range dans le chapitre de tout ce qu'elle
    // couvre. Elles vivent dans le jsonb `parts` et pas dans la table de
    // jonction, d'où l'union faite ici (voir `QuestionPart`).
    const allNotionIds = [...(q.notionIds ?? []), ...(q.parts ?? []).flatMap(p => p.notionIds ?? [])];
    for (const nid of allNotionIds) {
      const cid = chapterOfNotion.get(nid);
      if (cid) set.add(cid);
    }
    if (set.size === 0) set.add(NO_CHAPTER_ID);
    return set;
  };

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
  function toggleChapterFilter(id: string) {
    setFilterChapters(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    clearMode(`chapter:${id}`);
  }
  function toggleExamFilter(id: string) {
    setFilterExams(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    clearMode(`exam:${id}`);
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
    setFilterChapters([]);
    setFilterExams([]);
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
  const posChapters = filterChapters.filter(c => modeOf(`chapter:${c}`) === 'pos');
  const negChapters = filterChapters.filter(c => modeOf(`chapter:${c}`) === 'neg');
  const posExams = filterExams.filter(e => modeOf(`exam:${e}`) === 'pos');
  const negExams = filterExams.filter(e => modeOf(`exam:${e}`) === 'neg');

  let filtered = questions.filter(q => {
    const qPools = new Set(q.pools);
    const qExamIds = new Set(q.examIds);
    const qChapters = chaptersOfQuestion(q);
    const neverExam = q.examIds.length === 0;

    if (posPools.length && !posPools.some(p => qPools.has(p))) return false;
    if (negPools.length && negPools.some(p => qPools.has(p))) return false;
    if (posTypes.length && !posTypes.some(t => t === q.responseType)) return false;
    if (negTypes.length && negTypes.some(t => t === q.responseType)) return false;
    if (posChapters.length && !posChapters.some(c => qChapters.has(c))) return false;
    if (negChapters.length && negChapters.some(c => qChapters.has(c))) return false;
    if (posExams.length && !posExams.some(f => f === NEVER_EXAM_ID ? neverExam : qExamIds.has(f))) return false;
    if (negExams.length && negExams.some(f => f === NEVER_EXAM_ID ? neverExam : qExamIds.has(f))) return false;
    if (search.trim() && !(q.title + ' ' + q.content + ' ' + q.answer).toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
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
    // Question déjà ouverte dans le formulaire en ligne : le crayon devient le
    // bouton d'annulation de cette modification (icône et liseré verts).
    const isEditing = editingQuestionId === q.id;
    return (
      <ListCard
        key={q.id}
        onClick={() => onToggleInExam(q.id)}
        tint={inDraft ? CARD_DRAFT_TINT : undefined}
        borderColor={inDraft ? palette.greenSoft : undefined}
        title={q.title.trim() || q.content || tr('noStatement')}
        /* Les icônes tiennent sur la hauteur d'une ligne et ne décalent que la
           première (`indent`), donc la deuxième repart au ras du bord gauche. */
        indent={hasParts ? 2 * CARD_LINE + 10 : CARD_LINE + 6}
        leading={
          /* Pas de pictogramme d'image ni de son ici : `indent` ne réserve de
             place que pour le type de réponse et le lien de grappe, deux
             largeurs connues. Les pastilles de pièce jointe, elles, apparaissent
             et disparaissent selon la question — l'énoncé leur passait dessous
             dès qu'il y en avait une (11/08/2026). */
          <>
            <TypeIcon type={q.responseType} size={CARD_LINE - 8} />
            {hasParts && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpenId(open ? null : q.id); }}
                title={open ? tr('bank.hideParts') : tr('bank.showParts', { count: q.parts.length + 1 })}
                style={{ flexShrink: 0, width: CARD_LINE, height: CARD_LINE, borderRadius: 7, border: 'none', background: open ? ink(0.08) : 'transparent', color: open ? palette.inkSoft : palette.inkFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <Link2 size={14} strokeWidth={1.75} />
              </button>
            )}
          </>
        }
        meta={q.pools.map(pid => {
          const p = pools.find(pp => pp.id === pid);
          if (!p) return null;
          return <span key={pid} style={{ flexShrink: 0, fontSize: 10, padding: '2px 8px', borderRadius: 999, background: palette.surfaceSunken, color: palette.inkMuted }}>#{p.name}</span>;
        })}
        actions={
          <>
            <IconBtn size={CARD_ACTION_BTN} active={isEditing} title={isEditing ? tr('cancelEditQuestion') : tr('bank.editQuestion')} onClick={() => onEditQuestion(q)}>
              <Pencil size={14} strokeWidth={1.75} />
            </IconBtn>
            <IconBtn size={CARD_ACTION_BTN} title={tr('bank.deleteQuestion')} onClick={() => setPendingDeleteQuestion(q)}>
              <Trash2 size={14} strokeWidth={1.75} />
            </IconBtn>
          </>
        }
      >
        {/* Déplié : rien que les énoncés de chaque partie, chacun précédé de son
            type de réponse. Ni difficulté, ni durée, ni réponse attendue — le
            détail complet se lit dans l'éditeur de question. */}
        {open && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, borderTop: `1px solid ${palette.line}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'default' }}>
            {[{ responseType: q.responseType, content: q.content }, ...q.parts.map(p => ({ responseType: p.responseType, content: p.content }))].map((part, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <TypeIcon type={part.responseType} size={13} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: palette.ink, lineHeight: 1.45 }}>{part.content || tr('noStatement')}</div>
              </div>
            ))}
          </div>
        )}
      </ListCard>
    );
  }

  type ActiveFilter = { key: string; category: 'pool' | 'type' | 'chapter' | 'exam'; value: string; label: string; color?: string };
  const activeFilters: ActiveFilter[] = [
    ...filterPools.map(id => ({ key: `pool:${id}`, category: 'pool' as const, value: id, label: pools.find(p => p.id === id)?.name ?? id, color: pools.find(p => p.id === id)?.color })),
    ...filterTypes.map(ty => ({ key: `type:${ty}`, category: 'type' as const, value: ty, label: tr(`responseType.${ty}`) })),
    ...filterChapters.map(cid => ({ key: `chapter:${cid}`, category: 'chapter' as const, value: cid, label: cid === NO_CHAPTER_ID ? tr('bank.noChapter') : (chapters.find(c => c.id === cid)?.name ?? cid) })),
    ...filterExams.map(eid => ({ key: `exam:${eid}`, category: 'exam' as const, value: eid, label: eid === NEVER_EXAM_ID ? tr('bank.statusNew') : (exams.find(ex => ex.id === eid)?.title ?? eid) })),
  ];
  const positiveFilters = activeFilters.filter(f => modeOf(f.key) === 'pos');
  const negativeFilters = activeFilters.filter(f => modeOf(f.key) === 'neg');

  function removeFilter(f: ActiveFilter) {
    switch (f.category) {
      case 'pool': togglePoolFilter(f.value as string); break;
      case 'type': toggleTypeFilter(f.value as ResponseType); break;
      case 'chapter': toggleChapterFilter(f.value); break;
      case 'exam': toggleExamFilter(f.value); break;
    }
  }

  return (
    <div style={{ padding: '16px 16px 28px' }}>
      {/* Ni titre ni bouton « générer par IA » : l'onglet au-dessus de la liste
          dit déjà où l'on est, et la maquette ne montre que la barre d'outils
          (recherche · tri · filtre · nouvelle). */}
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

      {/* Barre d'outils commune aux deux listes (`ListToolbar`) : la banque n'y
          met que ce qui lui est propre — sa recherche, ses critères de tri, son
          panneau de filtres et son action « nouvelle question ». */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={tr('bank.searchPlaceholder')}
        sortOptions={BANK_SORTS}
        sortBy={sortBy}
        onSortByChange={changeSortBy}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
        actionLabel={tr('bank.newShort')}
        actionTitle={tr('bank.newQuestion')}
        onAction={onNewQuestion}
        filter={
          <FilterButton
            title={tr('bank.filters')}
            count={activeFilterCount}
            open={filterOpen}
            onToggle={() => setFilterOpen(o => !o)}
            containerRef={filterRef}
          >
            {/* Le cadre du panneau (surface, largeur, position, hauteur max)
                appartient à `FilterButton` : il le pose en `position: fixed`
                pour ne pas être rogné par la colonne. Ici, uniquement son
                contenu. */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: palette.ink }}>{tr('bank.filtersTitle')}</span>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} style={{ fontSize: 11.5, color: palette.greenBrand, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{tr('bank.filtersReset')}</button>
                )}
              </div>
              <div style={{ overflowY: 'auto', padding: '0 14px 14px', flex: 1, minHeight: 0 }}>
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
                </div>
                {/* Libellés */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.labelsSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {pools.map(l => {
                    const active = filterPools.includes(l.id);
                    const displayName = l.name.length > 18 ? l.name.slice(0, 18) + '…' : l.name;
                    return (
                      <span key={l.id} style={{ position: 'relative', display: 'inline-flex' }}>
                        {/* La couleur du libellé EST le fond de la pilule (elle
                            ne se réduit plus à une pastille) : l'encre s'adapte
                            à sa luminance, et l'état actif se lit au liseré
                            d'encre plutôt qu'à un changement de fond. */}
                        <button onClick={() => togglePoolFilter(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${active ? palette.ink : withAlpha(l.color, 0.55)}`, boxShadow: active ? `0 0 0 2px ${ink(0.25)}` : 'none', background: l.color, color: inkOn(l.color), fontWeight: active ? 600 : 400 }}>
                          {displayName}
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
                {/* Chapitre — une question n'en porte pas directement : elle
                    hérite de ceux de ses notions associées. Section masquée
                    tant que l'atelier n'a aucun chapitre. */}
                {chapters.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.chapterSection')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {chapters.map(c => {
                        const active = filterChapters.includes(c.id);
                        return (
                          <button key={c.id} onClick={() => toggleChapterFilter(c.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                            {c.name}
                          </button>
                        );
                      })}
                      {(() => {
                        const active = filterChapters.includes(NO_CHAPTER_ID);
                        return (
                          <button onClick={() => toggleChapterFilter(NO_CHAPTER_ID)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: active ? `1px solid ${palette.ink}` : `1px solid ${palette.line}`, background: active ? palette.ink : palette.surfaceSunken, color: active ? palette.onInk : palette.inkMuted }}>
                            {tr('bank.noChapter')}
                          </button>
                        );
                      })()}
                    </div>
                  </>
                )}
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
          </FilterButton>
        }
      />

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
