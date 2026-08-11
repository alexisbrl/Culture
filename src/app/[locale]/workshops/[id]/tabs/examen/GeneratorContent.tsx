'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Star, RefreshCw, SeparatorHorizontal, SlidersHorizontal, PenLine } from 'lucide-react';
import { palette, ink, shadow, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import InlineQuestionEditor from './InlineQuestionEditor';
import { type Question } from '../QuestionEditor';
import {
  type Exam, type ExamConfig, type ExamPresentation, type ExamSection, type QuestionWeight,
  type IdentitySide, type CandidateIdentity, type SheetFocus, type PageBlock,
  IDENTITY_KEY_SET, BAREME_KEY,
  A4_TITLE_BLOCK_HEIGHT, A4_IDENTITY_ROW_HEIGHT, A4_MARGIN_PX, A4_PAGE_HEIGHT,
  A4_PAGE_BREAK_HEIGHT, A4_ROW_FALLBACK_HEIGHT, A4_SECTION_HEADER_HEIGHT, A4_BLOCK_WIDTH,
  PAGE_BREAK_PREFIX,
  configQuestionIds, defaultWeight, partWeightKey, flattenSections, isPageBreakId,
  computePagination, defaultPresentation, getFavoritePresentation, saveFavoritePresentation, isSamePresentation,
  moveSectionRow, clearWeightingFor,
  EditQuestionButton, renderAnswerSpace, partAsQuestion, QuestionImagePreview, QuestionAudioNote,
} from './examShared';

/** Champ de la feuille A4 qui passe à la ligne au lieu de rogner : un
 *  `textarea` d'une ligne qui grandit avec son contenu. Un `<input>` ne sait pas
 *  faire (le texte trop long y défile hors du cadre), et le titre d'un examen
 *  n'a pas de raison d'être coupé au milieu.
 *  La touche Entrée est neutralisée : le champ reste une valeur d'une seule
 *  ligne logique, qui s'enroule toute seule. La hauteur est recalculée en
 *  `useLayoutEffect` — c'est-à-dire avant que le parent ne mesure le bloc
 *  d'en-tête pour la pagination A4. */
function SheetAutoText({ value, onChange, placeholder, title, style }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  title: string;
  style: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\n/g, ''))}
      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
      placeholder={placeholder}
      title={title}
      style={{
        width: '100%', textAlign: 'center' as const, fontFamily: 'inherit', background: 'transparent',
        border: 'none', borderRadius: 6, outline: 'none', padding: '2px 0', boxSizing: 'border-box' as const,
        resize: 'none' as const, overflow: 'hidden', display: 'block',
        ...style,
      }}
    />
  );
}

// Le bloc A4 est composé de trois colonnes : gouttière gauche (26), la feuille,
// gouttière droite (86), séparées par deux espaces de 10.
const LEFT_GUTTER = 36;  // 26 + l'espace
const RIGHT_GUTTER = 96; // 86 + l'espace
const TOOLBAR_WIDTH = A4_BLOCK_WIDTH + LEFT_GUTTER + RIGHT_GUTTER;

/** Une ligne de la copie, dans l'ordre où elle est posée sur les pages.
 *
 *  Une question liée est une ligne à part entière (`qpart`), pas un morceau du
 *  bloc de sa question principale (`qhead`) : c'est ce qui lui permet de basculer
 *  seule sur la page suivante quand la grappe ne tient plus, sans jamais changer
 *  de place dans la liste. Une question **en cours de modification** redevient
 *  une ligne unique (`editor`) : le formulaire couvre toute la grappe.
 *
 *  Deux index cohabitent, et ils ne mesurent pas la même chose :
 *  - `bi` indexe les blocs paginables (une question liée compte pour un) — c'est
 *    l'index des sauts de page rendus par `computePagination` ;
 *  - `gi` indexe les questions de `flat` (`flattenSections`) — c'est l'index du
 *    glisser-déposer, qui déplace toujours une grappe entière. Toutes les lignes
 *    d'une même grappe partagent donc le même `gi`. */
type SheetRow =
  | { kind: 'header'; key: string; sectionIdx: number }
  | { kind: 'empty'; key: string; sectionIdx: number }
  | { kind: 'pagebreak'; key: string; bi: number; gi: number; sectionIdx: number; id: string }
  | { kind: 'editor'; key: string; bi: number; gi: number; sectionIdx: number; number: number; q: Question }
  | { kind: 'qhead'; key: string; bi: number; gi: number; sectionIdx: number; number: number; q: Question; last: boolean }
  | { kind: 'qpart'; key: string; bi: number; gi: number; sectionIdx: number; number: number; q: Question; partIdx: number; last: boolean };

/** Les lignes de la copie portent un `bi` sauf les titres de partie et les
 *  cales « partie vide », qui ne sont pas des blocs paginables. */
function isBlockRow(row: SheetRow): row is Extract<SheetRow, { bi: number }> {
  return row.kind !== 'header' && row.kind !== 'empty';
}

// Tout ce qui accompagne la feuille (barre d'outils, zone d'en-tête, boutons du
// pied) prend la largeur totale du bloc pour se centrer comme lui, mais réserve
// les gouttières en marge intérieure : le contenu s'aligne alors exactement sur
// les bords de la feuille, pas sur ceux du bloc.
const SHEET_ALIGNED: React.CSSProperties = {
  width: TOOLBAR_WIDTH,
  maxWidth: '100%',
  margin: '0 auto',
  paddingLeft: LEFT_GUTTER,
  paddingRight: RIGHT_GUTTER,
  boxSizing: 'border-box',
};

// ---- GENERATOR / APERÇU EN DIRECT ----
function GeneratorContent({ workshopId, questions, config, onConfigChange, editing, onCancelEdit, onGenerate, onOpenQuestion, onRemoveFromDraft, onClearEditor, editingQuestion, newQuestionId, focusRequest, onRequestFocus, pools, notions, onCreatePool, onSaveQuestion, onCancelQuestion }: {
  workshopId: string;
  questions: Question[];
  config: ExamConfig;
  onConfigChange: (config: ExamConfig) => void;
  editing: Exam | null;
  onCancelEdit: () => void;
  onGenerate: () => void;
  onOpenQuestion: (id: string) => void;
  onRemoveFromDraft: (ids: string[]) => void;
  onClearEditor: () => void;
  /** Question en cours d'édition sur la feuille, `null` si aucune. */
  editingQuestion: Question | null;
  /** Id de la question tout juste créée — l'annulation la retire de la feuille. */
  newQuestionId: string | null;
  /** Ligne sur laquelle recadrer la feuille (voir `SheetFocus`). */
  focusRequest: SheetFocus | null;
  /** Demande de recadrage émise par la feuille elle-même (+ partie, + saut de page). */
  onRequestFocus: (key: string) => void;
  pools: { id: string; name: string; color: string }[];
  notions: { id: string; title: string }[];
  onCreatePool: (name: string) => string;
  onSaveQuestion: (q: Question) => void;
  onCancelQuestion: () => void;
}) {
  const t = useTranslations('examen');
  const [dragFlatIdx, setDragFlatIdx] = useState<number | null>(null);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [draggingIdentityKey, setDraggingIdentityKey] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [creatingCustomField, setCreatingCustomField] = useState(false);
  const [pendingRemoveSectionIdx, setPendingRemoveSectionIdx] = useState<number | null>(null);
  const [focusedSectionIdx, setFocusedSectionIdx] = useState<number | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [favoritePresentation, setFavoritePresentation] = useState<ExamPresentation>(defaultPresentation());
  const [confirmApplyFavoriteOpen, setConfirmApplyFavoriteOpen] = useState(false);
  const [confirmSaveFavoriteOpen, setConfirmSaveFavoriteOpen] = useState(false);
  // Bouton « personnaliser »/« terminer » de la maquette (toggleHdr/hdrOpen,
  // ligne 939) — replié à l'arrivée sur la page : la personnalisation de
  // l'en-tête est un réglage ponctuel, pas l'état de travail normal.
  const [hdrOpen, setHdrOpen] = useState(false);

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
  const totalPoints = includedIds.reduce((sum, id) => {
    const q = questions.find(p => p.id === id);
    const mainPoints = config.weighting[id]?.points ?? defaultWeight().points;
    const partsPoints = q ? q.parts.reduce((s, _part, pi) => s + (config.weighting[partWeightKey(id, pi)]?.points ?? defaultWeight().points), 0) : 0;
    return sum + mainPoints + partsPoints;
  }, 0);

  function handleGenerateClick() {
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

  // Lignes de la copie et blocs paginables, construits d'un seul tenant (voir
  // `SheetRow`) : la pagination et le rendu partagent ainsi exactement la même
  // découpe, jusqu'à la question liée.
  const sheetRows: SheetRow[] = [];
  const pageBlocks: PageBlock[] = [];
  {
    let gi = 0;
    const addBlock = (key: string, sectionIdx: number, fallbackHeight: number, forcesBreakAfter = false) => {
      pageBlocks.push({ key, sectionIdx, fallbackHeight, forcesBreakAfter });
      return pageBlocks.length - 1;
    };
    config.sections.forEach((section, sIdx) => {
      sheetRows.push({ kind: 'header', key: `h-${section.id}`, sectionIdx: sIdx });
      let pushedAny = false;
      let number = 1;
      section.questionIds.forEach(id => {
        if (isPageBreakId(id)) {
          sheetRows.push({ kind: 'pagebreak', key: id, bi: addBlock(id, sIdx, A4_PAGE_BREAK_HEIGHT, true), gi, sectionIdx: sIdx, id });
          gi++;
          pushedAny = true;
          return;
        }
        const q = questions.find(p => p.id === id);
        if (!q) return;
        const bi = addBlock(q.id, sIdx, A4_ROW_FALLBACK_HEIGHT);
        if (editingQuestion && editingQuestion.id === q.id) {
          sheetRows.push({ kind: 'editor', key: q.id, bi, gi, sectionIdx: sIdx, number, q });
        } else {
          sheetRows.push({ kind: 'qhead', key: q.id, bi, gi, sectionIdx: sIdx, number, q, last: q.parts.length === 0 });
          q.parts.forEach((_part, pi) => {
            const key = partWeightKey(q.id, pi);
            sheetRows.push({ kind: 'qpart', key, bi: addBlock(key, sIdx, A4_ROW_FALLBACK_HEIGHT), gi, sectionIdx: sIdx, number: number + 1 + pi, q, partIdx: pi, last: pi === q.parts.length - 1 });
          });
        }
        number += 1 + q.parts.length;
        gi++;
        pushedAny = true;
      });
      if (!pushedAny) sheetRows.push({ kind: 'empty', key: `e-${section.id}`, sectionIdx: sIdx });
    });
  }

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

  // Recadrage de la feuille sur la ligne qui vient de bouger : ouverture du
  // formulaire en ligne, mais aussi question envoyée depuis la banque, nouvelle
  // partie, nouveau saut de page. Sans ça, l'ajout se fait hors écran — tout
  // arrive à la fin de la copie, qui peut faire plusieurs pages — et rien ne
  // signale que le clic a produit quelque chose.
  //
  // Un seul canal pour les quatre cas : `focusRequest`, posé par ExamenTab (qui
  // sait quand une question entre dans l'examen ou passe en édition) ou par la
  // feuille elle-même via `onRequestFocus` (+ partie, + saut de page). Faire
  // dépendre l'effet de `editingQuestion` en plus rejouerait le recadrage sur
  // une demande périmée à la fermeture du formulaire.
  //
  // On ne peut pas défiler dès le rendu suivant : le montage du formulaire
  // change la hauteur de sa ligne, donc la mesure (`useLayoutEffect` ci-dessus)
  // puis la pagination, qui redécoupe les pages et déplace la ligne visée —
  // parfois de plusieurs milliers de pixels. On attend donc que sa position se
  // stabilise (deux relevés identiques), avec un plafond de sécurité, avant de
  // lancer un unique défilement animé.
  //
  // Relevés au `setTimeout` et non au `requestAnimationFrame` : un onglet en
  // arrière-plan ne reçoit aucune trame d'animation, le recadrage n'aurait
  // jamais lieu si la question était ouverte juste avant de changer d'onglet.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const focusKey = focusRequest.key;
    const STEP_MS = 50;
    const MAX_STEPS = 14; // ~700ms de sursis avant de recadrer quoi qu'il arrive
    let timer = 0;
    let steps = 0;
    let stable = 0;
    let lastTop = Number.NaN;
    // position de la ligne dans le contenu défilant, indépendante du défilement courant
    function contentTop(el: HTMLElement, panel: HTMLElement) {
      return panel.scrollTop + (el.getBoundingClientRect().top - panel.getBoundingClientRect().top);
    }
    // `last` : passe de rattrapage, une fois l'animation terminée — la mise en
    // page peut encore avoir bougé entre le calcul et l'arrivée. On ne rejoue le
    // défilement que si l'écart est visible, pour ne pas reprendre la main sur
    // un utilisateur qui aurait fait défiler lui-même entre-temps.
    function center(last: boolean) {
      const el = qRefs.current[focusKey];
      const panel = panelRef.current;
      if (!el) return;
      // sous 768px la coquille ne borne plus la hauteur : c'est la page qui
      // défile, pas le panneau — `scrollIntoView` vise alors le bon conteneur.
      if (!panel || panel.scrollHeight <= panel.clientHeight + 1) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      // Un formulaire plus haut que le panneau ne peut pas être centré : on
      // aligne alors son haut juste sous la barre d'outils collante (STICKY_GAP),
      // sinon son premier champ passerait dessous.
      const STICKY_GAP = 56;
      // Hauteur lue sur le rectangle et non sur `offsetHeight` : la feuille est
      // mise à l'échelle (`zoom`), or `offsetHeight` reste en unités locales
      // (non zoomées) alors que `clientHeight` et les rectangles sont dans le
      // repère de la fenêtre — les mélanger décentrerait le recadrage à toute
      // échelle autre que 100 %.
      const top = Math.max(0, contentTop(el, panel) - Math.max(STICKY_GAP, (panel.clientHeight - el.getBoundingClientRect().height) / 2));
      if (last && Math.abs(panel.scrollTop - top) <= 24) return;
      panel.scrollTo({ top, behavior: 'smooth' });
      if (!last) timer = window.setTimeout(() => center(true), 700);
    }
    function tick() {
      const el = qRefs.current[focusKey];
      const panel = panelRef.current;
      steps++;
      if (el && panel) {
        const top = contentTop(el, panel);
        if (Math.abs(top - lastTop) < 1) stable++; else { stable = 0; lastTop = top; }
        if (stable >= 2) { center(false); return; }
      }
      if (steps >= MAX_STEPS) { center(false); return; }
      timer = window.setTimeout(tick, STEP_MS);
    }
    timer = window.setTimeout(tick, STEP_MS);
    return () => clearTimeout(timer);
  }, [focusRequest]);
  // Le titre et le sous-titre s'écrivent directement sur la feuille, et leurs
  // champs y sont **toujours** présents, vides comme remplis, personnalisation
  // ouverte ou non : c'est là qu'on clique pour les saisir, il n'y a pas d'autre
  // porte d'entrée. Un champ vide montre son texte d'invite, qui sert
  // d'indication. `titleIncluded` n'a plus d'interrupteur — un titre vide, c'est
  // un examen sans titre.
  // `titleBlockHeight` n'est qu'un repli avant la première mesure réelle du bloc
  // d'en-tête (`__page1_header__`), qui est ce qui compte pour la pagination dès
  // que la feuille est rendue.
  const titleBlockHeight = A4_TITLE_BLOCK_HEIGHT;
  const identity = config.presentation.identity;
  const identityOrder = config.presentation.identityOrder;
  function sideOfItem(id: string): IdentitySide {
    if (IDENTITY_KEY_SET.has(id)) return identity[id as keyof CandidateIdentity];
    return config.presentation.customFields.find(f => f.id === id)?.side ?? 'hidden';
  }
  function labelOfItem(id: string): string {
    if (IDENTITY_KEY_SET.has(id)) return t(`identity.${id as keyof CandidateIdentity}`);
    return config.presentation.customFields.find(f => f.id === id)?.label ?? '';
  }
  // Le barème n'est pas un champ à remplir : il s'affiche « …… / N pts » sur la
  // copie et n'a donc pas de ligne de pointillés.
  function baremeLabel(): string {
    return `…… / ${t('generator.points', { count: totalPoints, plural: totalPoints === 1 ? '' : 's' })}`;
  }
  // Clic = alternative au glisser-déposer : la pilule entre dans l'en-tête ou en
  // sort, point. Elle faisait auparavant le tour des trois emplacements
  // (masqué → gauche → droite → masqué), si bien que cliquer une pilule déjà
  // posée à gauche l'envoyait à droite au lieu de la retirer. Passer d'un côté à
  // l'autre reste le rôle du glisser-déposer. Sans `beforeId`, `moveIdentity`
  // place l'entrée en fin d'ordre, donc en bas de la colonne de gauche.
  function toggleIdentity(id: string) {
    moveIdentity(id, sideOfItem(id) === 'hidden' ? 'left' : 'hidden');
  }
  /** Pilule déplaçable d'un champ d'en-tête — verte une fois posée sur la copie, neutre dans le réservoir. */
  function identityPill(id: string, side: IdentitySide) {
    const placed = side !== 'hidden';
    const removable = !IDENTITY_KEY_SET.has(id);
    const label = id === BAREME_KEY ? baremeLabel() : labelOfItem(id);
    return (
      <span
        key={id}
        draggable
        onDragStart={() => setDraggingIdentityKey(id)}
        onDragEnd={() => setDraggingIdentityKey(null)}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (draggingIdentityKey && draggingIdentityKey !== id && sideOfItem(draggingIdentityKey) === side) moveIdentity(draggingIdentityKey, side, id); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (draggingIdentityKey && draggingIdentityKey !== id) moveIdentity(draggingIdentityKey, side, id); }}
        onClick={() => toggleIdentity(id)}
        title={placed ? t('generator.pillPlacedHint') : t('generator.pillHiddenHint')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none',
          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
          color: placed ? palette.green : palette.inkMuted,
          background: placed ? withAlpha(palette.green, 0.14) : palette.surfaceRaised,
          border: `1px solid ${placed ? palette.greenSoft : palette.lineStrong}`,
          borderRadius: 999, padding: removable ? '2px 6px 2px 9px' : '2px 9px',
          cursor: 'grab', opacity: draggingIdentityKey === id ? 0.4 : 1,
        }}
      >
        <span style={{ color: palette.inkFaint, fontSize: 11 }}>⠿</span>
        {label}
        {removable && (
          <button onClick={e => { e.stopPropagation(); removeCustomField(id); }} style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
        )}
      </span>
    );
  }
  const identityLeftKeys = identityOrder.filter(id => sideOfItem(id) === 'left');
  const identityRightKeys = identityOrder.filter(id => sideOfItem(id) === 'right');
  const identityBlockHeight = (identityLeftKeys.length > 0 || identityRightKeys.length > 0)
    ? A4_IDENTITY_ROW_HEIGHT * Math.max(identityLeftKeys.length, identityRightKeys.length, 1) + 24
    : 0;
  const headerBlockHeight = rowHeights['__page1_header__'] ?? (titleBlockHeight + identityBlockHeight);
  const { pageStarts, pageCount } = computePagination(pageBlocks, rowHeights, headerBlockHeight);
  function pageNumberOf(bi: number): number {
    let n = 1;
    pageStarts.forEach(p => { if (p <= bi) n++; });
    return n;
  }

  function patchConfig(patch: Partial<ExamConfig>) {
    onConfigChange({ ...config, ...patch });
  }
  function applyFavoritePresentation() {
    patchConfig({ presentation: favoritePresentation });
    setConfirmApplyFavoriteOpen(false);
  }
  // Comparaison sur ce que l'en-tête montre, pas sur l'objet brut : deux
  // présentations qui rendent la même chose sont le même en-tête.
  const headerIsFavorite = isSamePresentation(config.presentation, favoritePresentation);
  function saveFavoriteFromCurrent() {
    saveFavoritePresentation(config.presentation);
    setFavoritePresentation(config.presentation);
    setConfirmSaveFavoriteOpen(false);
  }
  function updateSection(idx: number, patch: Partial<ExamSection>) {
    patchConfig({ sections: config.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) });
  }
  function addSection() {
    const id = 'sec' + Date.now();
    patchConfig({ sections: [...config.sections, { id, title: `Partie ${config.sections.length + 1}`, questionIds: [] }] });
    // `h-<id>` : clé de la ligne du titre de partie (voir la construction de
    // `rows` plus bas) — c'est elle qu'on ramène au centre, pas la partie vide.
    onRequestFocus(`h-${id}`);
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
  /** Retrait d'une question liée : les pondérations sont indexées par position
   *  (`partWeightKey`), donc toutes celles qui la suivent remontent d'un cran —
   *  sans quoi la question liée suivante hériterait du barème de celle qu'on
   *  vient de retirer. */
  function shiftPartWeights(questionId: string, removedIdx: number) {
    const weighting = { ...config.weighting };
    let i = removedIdx;
    for (;;) {
      const next = weighting[partWeightKey(questionId, i + 1)];
      if (!next) break;
      weighting[partWeightKey(questionId, i)] = next;
      i += 1;
    }
    delete weighting[partWeightKey(questionId, i)];
    patchConfig({ weighting });
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
    onRequestFocus(id);
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
  // Retrait par la croix de la gouttière droite. On prévient aussi le parent :
  // sans ça la carte de la banque garderait sa pastille verte, puisque c'est
  // `draftIds` qui l'allume. Pas de confirmation — le geste est réversible d'un
  // clic sur la même carte.
  function removeFromExam(id: string) {
    const sections = config.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(qid => qid !== id) }));
    onConfigChange({ ...config, sections, weighting: clearWeightingFor(config.weighting, id) });
    onRemoveFromDraft([id]);
  }

  // pied de page de la copie : numéro de page, seulement s'il y a plusieurs pages.
  // Posé en absolu dans la marge basse non imprimable (A4_MARGIN_PX), déjà réservée
  // par computePagination — il ne peut donc jamais chevaucher une question.
  function pageFooter(n: number) {
    return (
      <div style={{ position: 'absolute' as const, left: 0, right: 0, bottom: Math.round(A4_MARGIN_PX / 2) - 7, textAlign: 'center' as const, fontSize: 11, color: palette.inkGhost, pointerEvents: 'none' as const }}>
        {t('generator.pageNumber', { n, total: pageCount })}
      </div>
    );
  }

  // Pas de marge basse sur ce conteneur : la zone défilante descend jusqu'au
  // bord de la colonne, si bien que la feuille se coupe exactement à la hauteur
  // où s'arrête la carte de la banque de questions, à gauche. Le blanc de fin
  // de course reste, mais à l'intérieur du défilement (padding bas de
  // `.scroll-panel`).
  // Marges latérales du panneau exprimées en `calc(… * var(--exam-scale))` :
  // elles font partie de la largeur de référence du bloc (1236 = 1188 de bloc A4
  // + 48 de marges), donc elles suivent l'échelle comme lui. Sans ça, la largeur
  // laissée au contenu zoomé ne vaudrait plus exactement 1188 unités locales et
  // la feuille déborderait (échelle < 1) ou flotterait (échelle > 1).
  const SCALED_PAD_RIGHT = 'calc(12px * var(--exam-scale, 1))';
  return (
    <div style={{ padding: `8px ${SCALED_PAD_RIGHT} 0 calc(24px * var(--exam-scale, 1))`, height: '100%', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' }}>
      {editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: withAlpha(palette.amberGlow, 0.18), border: `1px solid ${withAlpha(palette.amber, 0.35)}`, marginBottom: 14, flexShrink: 0 }}>
          <PenLine size={14} strokeWidth={1.75} color={palette.amber} />
          <div style={{ flex: 1, fontSize: 12.5, color: palette.ink }}>{t('generator.editingPrefix')} <b style={{ fontWeight: 600 }}>{editing.title}</b></div>
          <button onClick={onCancelEdit} style={{ fontSize: 11.5, color: palette.amberLight, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{t('generator.cancelEdit')}</button>
        </div>
      )}
      {/* Colonne unique. La liste intermédiaire « questions envoyées » a disparu :
          une question entre dans l'examen d'un clic sur sa carte dans la banque, à
          gauche (`bq.toggle` de la maquette), et en ressort du même clic ou par la
          croix de la gouttière droite. */}
      <div ref={panelRef} className="scroll-panel" style={{ flex: 1, minWidth: 0, minHeight: 0, paddingRight: SCALED_PAD_RIGHT, paddingBottom: 28, boxSizing: 'border-box' as const }}>
      {/* Mise à l'échelle de toute la feuille et de ce qui l'accompagne (barre
          d'outils, bandeau de personnalisation, boutons du pied) : le contenu
          garde ses dimensions de référence en unités locales — un bloc de
          1188px, une page de 1494px de haut — et c'est `zoom` qui le rend de
          75 % à 140 %. Le panneau défilant, lui, reste hors du zoom : ses
          `scrollTop`/`clientHeight` restent dans le même repère que les
          `getBoundingClientRect()` du recadrage automatique.
          `--exam-scale` est posé par `.exam-shell` (globals.css) ; le repli à 1
          couvre un montage hors de cette coquille. */}
      <div style={{ zoom: 'var(--exam-scale, 1)' }}>
        {/* Barre d'outils de la feuille — alignée sur la largeur totale
            (gouttière gauche + feuille + gouttière droite) pour tomber pile
            au-dessus du bloc A4. Elle reste collée en haut du panneau défilant
            (`sticky`) : personnaliser / réinitialiser / enregistrer sont les
            trois actions de l'examen entier, elles doivent rester à portée
            quelle que soit la page de la copie qu'on regarde. Le bandeau de
            personnalisation, lui, défile normalement avec la feuille — il ne
            concerne que l'en-tête, en haut du document. Le fond crème (celui
            de la page) est ce qui masque la feuille qui passe dessous. */}
        <div style={{ position: 'sticky' as const, top: 0, zIndex: 6, background: palette.cream, paddingBottom: 10 }}>
        <div style={{ ...SHEET_ALIGNED, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setHdrOpen(v => !v)}
            /* Bordure encrée épaisse : c'est ce qui le distingue des autres
               boutons de la barre dans la maquette — pas un aplat de couleur,
               qui le faisait ressortir bien trop fort. Même habillage ouvert
               ou fermé, seul le libellé change. */
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: palette.ink, background: palette.surfaceRaised, border: `1.5px solid ${palette.ink}`, borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: shadow.sm }}
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} />
            {hdrOpen ? t('generator.done') : t('generator.customize')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, padding: '7px 14px', borderRadius: 999, border: `1px solid ${withAlpha(palette.danger, 0.28)}`, background: withAlpha(palette.danger, 0.08), color: palette.danger, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {editing ? t('generator.cancelEdits') : t('generator.resetEditor')}
          </button>
          <button
            type="button"
            onClick={handleGenerateClick}
            style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: '7px 16px', borderRadius: 999, border: 'none', background: palette.green, color: palette.parchment, cursor: 'pointer', fontFamily: 'inherit', boxShadow: shadow.sm }}
          >
            {editing ? t('generator.saveChanges') : t('generator.saveExam')}
          </button>
        </div>
        </div>

        {hdrOpen && (
          <>
            <div style={{ ...SHEET_ALIGNED, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: palette.inkMuted, background: palette.surfaceRaised, border: `1px solid ${palette.lineStrong}`, borderRadius: 999, padding: '4px 13px' }}>
                <Clock size={14} strokeWidth={1.75} />
                {t('generator.duration')}
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={config.durationMinutes}
                  onChange={e => patchConfig({ durationMinutes: Math.max(0, Number(e.target.value) || 0) })}
                  style={{ width: 48, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: palette.inkMuted, background: palette.surfaceInput, border: `1px solid ${palette.lineStrong}`, borderRadius: 6, padding: '2px 5px', textAlign: 'center' as const, outline: 'none' }}
                />
                <span style={{ color: palette.inkFaint, fontWeight: 500 }}>{t('generator.minShort')}</span>
              </span>
            </div>

            {/* Réservoir des pilules d'en-tête : tout ce qui n'est PAS sur la copie.
                On glisse (ou on clique) une pilule pour la poser sur la feuille, et
                inversement — les deux zones de la feuille sont les cibles de dépôt. */}
            <div style={{ ...SHEET_ALIGNED, marginBottom: 14 }}>
            <div
              onDragOver={e => { e.preventDefault(); if (draggingIdentityKey && sideOfItem(draggingIdentityKey) === 'hidden') moveIdentity(draggingIdentityKey, 'hidden'); }}
              onDrop={e => { e.preventDefault(); if (draggingIdentityKey) moveIdentity(draggingIdentityKey, 'hidden'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, padding: '9px 14px', border: `1.5px dashed ${palette.lineStrong}`, borderRadius: 12, boxSizing: 'border-box' as const }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: palette.inkFaint, marginRight: 4 }}>{t('generator.headerZone')}</span>
              {identityOrder.filter(id => sideOfItem(id) === 'hidden').map(id => identityPill(id, 'hidden'))}
              {creatingCustomField ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    autoFocus
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } if (e.key === 'Escape') { setCreatingCustomField(false); setNewFieldName(''); } }}
                    placeholder={t('generator.customFieldPlaceholder')}
                    style={{ fontSize: 12, padding: '4px 9px', borderRadius: 999, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceInput, fontFamily: 'inherit', outline: 'none', width: 140, color: palette.ink }}
                  />
                  <button type="button" onClick={addCustomField} style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 999, border: 'none', background: palette.green, color: palette.onGreen, cursor: 'pointer', fontFamily: 'inherit' }}>{t('add')}</button>
                  <button type="button" onClick={() => { setCreatingCustomField(false); setNewFieldName(''); }} style={{ fontSize: 11.5, padding: '5px 8px', borderRadius: 999, border: 'none', background: 'none', color: palette.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}>{t('cancelLower')}</button>
                </span>
              ) : (
                <button type="button" onClick={() => setCreatingCustomField(true)} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, border: `1.5px dashed ${palette.lineStrong}`, background: 'transparent', color: palette.tanStrong, cursor: 'pointer', fontFamily: 'inherit' }}>{t('generator.addCustomField')}</button>
              )}
              {/* Étoile pleine = l'en-tête posé est déjà le favori : il n'y a
                  alors ni rappel du favori à appliquer, ni enregistrement à
                  proposer, l'étoile n'est plus qu'un état. Dès que l'en-tête
                  s'en écarte, elle se vide, redevient le raccourci « revenir au
                  favori », et le bouton d'enregistrement reparaît. */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                {!headerIsFavorite && (
                  <button
                    type="button"
                    onClick={() => setConfirmSaveFavoriteOpen(true)}
                    title={t('generator.replaceFavorite')}
                    style={{ fontSize: 12, fontWeight: 600, color: palette.green, background: 'transparent', border: `1px solid ${palette.lineStrong}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {t('generator.saveFavorite')}
                  </button>
                )}
                {headerIsFavorite ? (
                  <span
                    role="img"
                    aria-label={t('generator.isFavorite')}
                    title={t('generator.isFavorite')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, color: palette.green }}
                  >
                    <Star size={16} strokeWidth={1.75} fill={palette.green} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmApplyFavoriteOpen(true)}
                    title={t('generator.applyFavorite')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'transparent', color: palette.green, cursor: 'pointer', padding: 0 }}
                  >
                    <Star size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>
            </div>
          </>
        )}


          {(() => {
            const chunks: SheetRow[][] = [];
            let current: SheetRow[] = [];
            sheetRows.forEach(row => {
              if (isBlockRow(row) && row.bi > 0 && pageStarts.has(row.bi)) {
                const carryOver: SheetRow[] = [];
                while (current.length > 0 && (current[current.length - 1].kind === 'header' || current[current.length - 1].kind === 'empty') && current[current.length - 1].sectionIdx === row.sectionIdx) {
                  carryOver.unshift(current.pop()!);
                }
                if (current.length > 0) chunks.push(current);
                current = carryOver;
              }
              current.push(row);
            });
            chunks.push(current);

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
              const firstBlockRow = chunk.find(isBlockRow);
              const pageNumber = firstBlockRow ? pageNumberOf(firstBlockRow.bi) : chunkIdx + 1;
              // Page qui porte le formulaire en ligne : elle cesse d'être bornée
              // à la hauteur d'un A4 le temps de la modification. Un formulaire
              // de question à plusieurs questions liées dépasse largement une
              // feuille, et la page le rognait — on ne voyait plus ni les
              // derniers champs ni les boutons enregistrer/annuler. La feuille
              // s'étire donc jusqu'au bas du formulaire (`minHeight` garde le
              // format A4 comme plancher), et la pagination normale reprend la
              // main dès que la modification est terminée : le formulaire rendu
              // à sa hauteur de question redevient une ligne comme une autre.
              const growsForEditor = chunk.some(r => r.kind === 'editor');
              return (
                <div key={chunkIdx} style={{ marginBottom: 14 }}>
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
                              <span draggable onDragStart={() => setDragFlatIdx(row.gi)} onDragEnd={() => { setDragFlatIdx(null); setDropIndicator(null); }} title={t('generator.dragReorder')} style={{ cursor: 'grab', color: palette.lineStrong, fontSize: 13, lineHeight: 1, userSelect: 'none' as const }}>⠿</span>
                            </div>
                          );
                        }
                        // Une question liée n'a ni poignée ni crayon : c'est la
                        // grappe entière qui se déplace et qui s'ouvre dans le
                        // formulaire. Sa cale garde seulement sa hauteur, pour
                        // que la ligne suivante reste en face de la bonne
                        // question quand la grappe est coupée entre deux pages.
                        if (row.kind === 'qpart') {
                          return <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, opacity: dragFlatIdx === row.gi ? 0.4 : 1 }} />;
                        }
                        return (
                          <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, paddingTop: 20, boxSizing: 'border-box' as const, opacity: dragFlatIdx === row.gi ? 0.4 : 1 }}>
                            <span draggable onDragStart={() => setDragFlatIdx(row.gi)} onDragEnd={() => { setDragFlatIdx(null); setDropIndicator(null); }} onMouseEnter={() => setHoveredRowKey(row.key)} onMouseLeave={() => setHoveredRowKey(null)} title={t('generator.dragReorder')} style={{ cursor: 'grab', color: palette.lineStrong, fontSize: 13, lineHeight: 1, userSelect: 'none' as const }}>⠿</span>
                            <EditQuestionButton id={row.q.id} onOpenQuestion={onOpenQuestion} active={editingQuestion?.id === row.q.id} />
                          </div>
                        );
                      })}
                    </div>

                    {/* colonne centrale : la feuille A4 elle-même (fond blanc, bordure, ombre) */}
                    <div style={{ width: A4_BLOCK_WIDTH, height: growsForEditor ? undefined : A4_PAGE_HEIGHT, minHeight: growsForEditor ? A4_PAGE_HEIGHT : undefined, flexShrink: 0, position: 'relative' as const, background: palette.paper, border: `1px solid ${ink(0.08)}`, borderRadius: 4, boxShadow: `0 2px 14px ${ink(0.06)}`, overflow: 'hidden' }}>
                      <div style={{ height: A4_MARGIN_PX, flexShrink: 0 }} />
                      {/* En-tête de la copie. En mode « personnaliser », les deux
                          zones deviennent les cibles de dépôt des pilules et le
                          titre s'édite directement ici — il n'y a plus de panneau
                          de paramètres séparé. */}
                      {chunkIdx === 0 && (
                        <div ref={el => { qRefs.current['__page1_header__'] = el; }}>
                          {/* Le haut de l'en-tête ne garde que le retrait minimal
                              sous la marge non imprimable : la copie commençait
                              trop bas dans le vide. */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '8px 34px 0' }}>
                            {([['left', identityLeftKeys, 300], ['right', identityRightKeys, 160]] as const).map(([side, keys, width]) => (
                              <div
                                key={side}
                                onDragOver={e => { e.preventDefault(); if (draggingIdentityKey && sideOfItem(draggingIdentityKey) === side) moveIdentity(draggingIdentityKey, side); }}
                                onDrop={e => { e.preventDefault(); if (draggingIdentityKey) moveIdentity(draggingIdentityKey, side); }}
                                style={{
                                  fontSize: 13, color: palette.inkMuted, display: 'flex', flexDirection: 'column',
                                  alignItems: side === 'right' ? 'flex-end' : 'flex-start', gap: hdrOpen ? 8 : 11,
                                  // En personnalisation, la zone est une cible de dépôt : elle
                                  // se réserve de la place même vide, plutôt que de se réduire
                                  // à la taille des pilules qu'elle contient déjà.
                                  minWidth: hdrOpen ? 200 : undefined, minHeight: hdrOpen ? 96 : undefined,
                                  padding: hdrOpen ? '12px 14px' : 0, borderRadius: 10,
                                  outline: hdrOpen ? `1.5px dashed ${palette.lineStrong}` : 'none', outlineOffset: 2,
                                }}
                              >
                                {keys.map(key => {
                                  if (hdrOpen) return identityPill(key, side);
                                  if (key === BAREME_KEY) return <div key={key} style={{ whiteSpace: 'nowrap' as const }}>{baremeLabel()}</div>;
                                  return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, width }}>
                                      <span>{labelOfItem(key)}</span>
                                      <span style={{ flex: 1, borderBottom: `1px solid ${ink(0.3)}` }} />
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          {/* Les deux champs sont toujours posés sur la feuille,
                              vides comme remplis : c'est le seul endroit où on
                              les saisit. Le sous-titre reprend la ligne
                              secondaire de la maquette (matière · durée ·
                              consignes), plus petite et en encre atténuée. */}
                          <div style={{ padding: '28px 34px 90px' }}>
                            <SheetAutoText
                              value={config.title}
                              onChange={v => patchConfig({ title: v, titleIncluded: true })}
                              placeholder={t('generator.titlePlaceholder')}
                              title={t('generator.titleHint')}
                              style={{ fontSize: 24, fontWeight: 600, color: palette.ink, lineHeight: 1.25 }}
                            />
                            <SheetAutoText
                              value={config.subtitle}
                              onChange={v => patchConfig({ subtitle: v })}
                              placeholder={t('generator.subtitlePlaceholder')}
                              title={t('generator.subtitleHint')}
                              style={{ fontSize: 13, color: palette.inkMuted, lineHeight: 1.4, marginTop: 5 }}
                            />
                          </div>
                        </div>
                      )}
                      {chunk.map(row => {
                        const section = config.sections[row.sectionIdx];
                        if (row.kind === 'header') {
                          return (
                            <div key={row.key} ref={el => { qRefs.current[row.key] = el; }}>
                              {/* Pas d'icône crayon sur la feuille : le titre de
                                  partie reste éditable au clic, mais la copie doit
                                  rester une copie, sans affordance imprimée. */}
                              <input
                                value={section.title}
                                onChange={e => updateSection(row.sectionIdx, { title: e.target.value })}
                                onFocus={() => setFocusedSectionIdx(row.sectionIdx)}
                                onBlur={() => setFocusedSectionIdx(null)}
                                style={{ width: '100%', fontSize: 16, fontWeight: 600, color: palette.tanStrong, background: focusedSectionIdx === row.sectionIdx ? withAlpha(palette.amber, 0.06) : 'transparent', border: 'none', padding: '14px 34px 10px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                              />
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
                              {t('generator.emptySection')}
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
                                {t('generator.pageBreak')}
                              </div>
                            </div>
                          );
                        }
                        const { gi, q } = row;
                        const showLineBefore = dragFlatIdx !== null && dragFlatIdx !== gi && dragFlatIdx !== gi - 1 && dropIndicator === gi;
                        // Survol : c'est la grappe entière qui s'éclaire, même
                        // coupée entre deux pages — la poignée déplace la grappe.
                        const hovered = hoveredRowKey === q.id;
                        // La question en cours d'édition cède sa place au
                        // formulaire, à l'endroit exact qu'elle occupe sur la
                        // copie, questions liées comprises (le formulaire les
                        // porte toutes). Le `ref` reste posé : la hauteur du
                        // formulaire entre dans le calcul de pagination comme le reste.
                        if (row.kind === 'editor') {
                          return (
                            <div key={row.key} ref={el => { qRefs.current[row.key] = el; }}>
                              <InlineQuestionEditor
                                workshopId={workshopId}
                                question={editingQuestion!}
                                number={row.number}
                                isNew={newQuestionId === q.id}
                                pools={pools}
                                notions={notions}
                                weight={config.weighting[q.id] ?? defaultWeight()}
                                onWeightChange={patch => updateWeight(q.id, patch)}
                                partWeight={idx => config.weighting[partWeightKey(q.id, idx)] ?? defaultWeight()}
                                onPartWeightChange={(idx, patch) => updateWeight(partWeightKey(q.id, idx), patch)}
                                onRemovePart={idx => shiftPartWeights(q.id, idx)}
                                onCreatePool={onCreatePool}
                                onSave={onSaveQuestion}
                                onCancel={onCancelQuestion}
                              />
                            </div>
                          );
                        }
                        // Question liée : une ligne comme une autre sur la copie.
                        // L'écart de 40px qui la sépare de la précédente est un
                        // `padding` et non une marge — il doit entrer dans la
                        // hauteur mesurée, sinon la pagination le perd et le bloc
                        // déborde de la page.
                        if (row.kind === 'qpart') {
                          const part = q.parts[row.partIdx];
                          if (!part) return null;
                          return (
                            <div key={row.key} {...dragOverPropsFor(gi, row.sectionIdx)} ref={el => { qRefs.current[row.key] = el; }} style={{ background: hovered ? withAlpha(palette.amber, 0.08) : 'transparent', transition: 'background 0.1s' }}>
                              <div style={{ padding: row.last ? '40px 34px 20px' : '40px 34px 0' }}>
                                <div style={{ fontSize: 14, color: palette.ink, lineHeight: 1.6 }}>
                                  <span style={{ color: palette.amber, fontWeight: 600, marginRight: 8 }}>{row.number}.</span>
                                  {part.content || t('noStatement')}
                                </div>
                                {/* `partAsQuestion` porte aussi les réglages
                                    du type (liste, tableau, paires, fichier) :
                                    sans eux, une question liée d'un de ces
                                    types retombait sur trois lignes vides. */}
                                {renderAnswerSpace(partAsQuestion(q, part))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={row.key} {...dragOverPropsFor(gi, row.sectionIdx)} ref={el => { qRefs.current[row.key] = el; }} style={{ background: hovered ? withAlpha(palette.amber, 0.08) : 'transparent', transition: 'background 0.1s' }}>
                            <div style={{ height: showLineBefore ? 3 : 0, background: palette.amber, transition: 'all 0.1s' }} />
                            <div style={{ padding: row.last ? '20px 34px' : '20px 34px 0' }}>
                              <QuestionImagePreview workshopId={workshopId} image={q.image} />
                              <QuestionAudioNote audio={q.audio} />
                              <div style={{ fontSize: 14, color: palette.ink, lineHeight: 1.6 }}>
                                <span style={{ color: palette.amber, fontWeight: 600, marginRight: 8 }}>{row.number}.</span>
                                {q.content || t('noStatement')}
                              </div>
                              {renderAnswerSpace(q)}
                            </div>
                          </div>
                        );
                      })}
                      {/* Marge basse de la feuille, à réserver explicitement
                          seulement quand la page s'étire : à hauteur fixe, le
                          vide sous la dernière ligne s'en charge tout seul. */}
                      {growsForEditor && <div style={{ height: A4_MARGIN_PX }} />}
                      {pageCount > 1 && pageFooter(pageNumber)}
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
                                <button type="button" onClick={() => removeSection(row.sectionIdx)} title={t('generator.removeSection')} style={{ fontSize: 15, color: palette.danger, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
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
                              <span onClick={() => removePageBreak(row.id)} title={t('generator.removePageBreak')} style={{ fontSize: 15, color: palette.danger, cursor: 'pointer' }}>×</span>
                            </div>
                          );
                        }
                        // Une question liée ne se retire pas seule de l'examen
                        // (elle appartient à sa grappe) : sa cale ne porte rien,
                        // elle réserve juste sa hauteur pour que la ligne
                        // suivante reste en face de la bonne question.
                        if (row.kind === 'qpart') {
                          return <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT }} />;
                        }
                        // La croix retire la grappe entière : elle est posée en
                        // face de son premier bloc, le seul dont on est certain
                        // qu'il est sur la même page que le début de la question.
                        return (
                          <div key={row.key} {...dragOverPropsFor(row.gi, row.sectionIdx)} style={{ height: rh, minHeight: rh ? undefined : A4_ROW_FALLBACK_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 20, boxSizing: 'border-box' as const }}>
                            <span onClick={() => removeFromExam(row.q.id)} title={t('generator.removeFromExam')} style={{ fontSize: 15, color: palette.danger, cursor: 'pointer' }}>×</span>
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
              style={{ height: 18, marginTop: -8, marginBottom: 14, borderRadius: 6, background: dropIndicator === flat.length ? withAlpha(palette.amber, 0.12) : 'transparent', border: dropIndicator === flat.length ? `1px dashed ${withAlpha(palette.amber, 0.4)}` : '1px dashed transparent' }}
            />
          )}

          {/* « + partie » vivait dans la rangée de statistiques supprimée ; la
              maquette le met au pied de la feuille, à la largeur du bloc A4.
              « saut de page » l'y rejoint : comme « + partie », il ajoute un
              élément à la fin du document, sa place est donc au pied de la
              feuille et non dans le bandeau de personnalisation de l'en-tête.
              L'enregistrement de l'examen, lui, est monté dans la barre
              collante du haut. */}
          <div style={{ ...SHEET_ALIGNED, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={addSection}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: `1px solid ${palette.line}`, background: palette.surfaceRaised, color: palette.tanStrong, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            >
              {t('generator.addSection')}
            </button>
            <button
              type="button"
              onClick={addPageBreak}
              title={t('generator.addPageBreakTooltip')}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: `1px solid ${palette.line}`, background: palette.surfaceRaised, color: palette.inkMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <SeparatorHorizontal size={15} strokeWidth={1.75} />
              {t('generator.pageBreak')}
            </button>
          </div>
      </div>
      </div>
      {pendingRemoveSectionIdx !== null && (() => {
        const section = config.sections[pendingRemoveSectionIdx];
        if (!section) return null;
        const count = section.questionIds.filter(id => questions.some(q => q.id === id)).length;
        return (
          <ConfirmDialog
            width={420}
            title={t('generator.removeSectionTitle', { title: section.title })}
            description={t('generator.removeSectionDesc', { count })}
            confirmLabel={t('delete')}
            onCancel={() => setPendingRemoveSectionIdx(null)}
            onConfirm={confirmRemoveSection}
          />
        );
      })()}
      {confirmClearOpen && (
        <ConfirmDialog
          width={420}
          title={editing ? t('generator.cancelEditsTitle') : t('generator.clearTitle')}
          description={editing ? t('generator.clearDescEditing') : t('generator.clearDesc')}
          confirmLabel={editing ? t('generator.cancelEdits') : t('delete')}
          onCancel={() => setConfirmClearOpen(false)}
          onConfirm={() => { setConfirmClearOpen(false); onClearEditor(); }}
        />
      )}
      {confirmApplyFavoriteOpen && (
        <ConfirmDialog
          width={420}
          iconTone="accent"
          confirmTone="confirm"
          icon={<Star size={18} strokeWidth={2} fill={palette.amber} color={palette.amber} />}
          title={t('generator.applyFavoriteTitle')}
          description={t('generator.applyFavoriteDesc')}
          confirmLabel={t('generator.apply')}
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
          title={t('generator.replaceFavoriteTitle')}
          description={t('generator.replaceFavoriteDesc')}
          confirmLabel={t('generator.save')}
          onCancel={() => setConfirmSaveFavoriteOpen(false)}
          onConfirm={saveFavoriteFromCurrent}
        />
      )}
    </div>
  );
}

export default GeneratorContent;
