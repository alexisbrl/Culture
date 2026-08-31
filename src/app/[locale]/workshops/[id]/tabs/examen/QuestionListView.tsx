'use client';

import { useState, useRef, useEffect, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { palette, withAlpha, ink } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import AiGenerationDialog, { useWorkshopFiles } from '@/components/ai/AiGenerationDialog';
import ImportBanner from '@/components/ai/ImportBanner';
import { type Question, type ResponseType } from '../QuestionEditor';
import { RESPONSE_TYPE_ORDER } from './questionFields';
import {
  type Pool, type Exam, type SortBy, type SortDir,
  DEFAULT_SORT_DIR, NEVER_EXAM_ID, CARD_LINE, CARD_ACTION_BTN, LIST_INSET_X,
  RESPONSE_TYPE_ICONS, RESPONSE_TYPE_COLORS,
  TypeIcon, IconBtn, ListToolbar, FilterButton, ListCard, LabelPill, LabelEditor,
  useDismissOnOutsideClick,
} from './examShared';
import { Tooltip } from '@/components/ui/tooltip';

// Le filtre « QCM » couvre aussi les questions à réponse unique : `qcs` est la
// variante de `qcm`, elle partage son libellé et son pictogramme et n'a jamais
// sa propre entrée (voir `RESPONSE_TYPE_ORDER`). Sans ça, une question
// enregistrée en `qcs` ne serait atteignable par aucun filtre.
const typeMatches = (filter: ResponseType, actual: ResponseType) =>
  filter === actual || (filter === 'qcm' && actual === 'qcs');

// Une grappe se filtre comme un tout, à l'image de `chaptersOfQuestion` : la
// banque n'affiche qu'une carte par grappe, donc le type de réponse de chaque
// question liée compte autant que celui de la question principale. Sans ça, une
// grappe dont seule la deuxième question est un tableau restait introuvable par
// le filtre « tableau ».
const typesOfQuestion = (q: Question): ResponseType[] =>
  [q.responseType, ...q.parts.map(p => p.responseType)];

// Filtre « sans chapitre » : les questions dont aucune notion associée n'est
// rattachée à un chapitre (y compris celles sans notion du tout).
const NO_CHAPTER_ID = '__nochapter__';
// Filtre « questions liées » : une grappe, c'est une question qui porte au moins
// une question liée (`parts`). Une seule valeur possible, mais rangée dans une
// liste comme les autres familles de filtres — c'est ce qui lui donne le même
// cycle inclus/exclu sans code particulier, et « exclu » veut alors dire
// « seulement les questions seules ».
const LINKED_ID = '__linked__';
// Hauteur réservée à la ligne « filtres » du panneau — mesurée, pas déduite :
// une pastille `xs` y fait 24px de haut (interlignage compris) contre 20px pour
// le titre seul, et les retraits de la ligne en ajoutent 22. Sans cette réserve
// la ligne passait de 42 à 46px à l'apparition de la légende, poussant tout le
// panneau de 4px vers le bas — au moment précis où l'on vise une pastille.
// `box-sizing: border-box` étant global, la valeur inclut les retraits.
const LEGEND_ROW_H = 46;

// critères de tri proposés par la banque de questions
const BANK_SORTS: readonly SortBy[] = ['recent', 'name', 'type', 'label'];

// ---- LISTE DE QUESTIONS — une seule implémentation pour les deux écrans qui
// en montrent une : la banque d'examen (`BankContent`) et les questions du
// parcours pédagogique (`ParcoursQuestions`, 19/08/2026). Barre d'outils
// toujours visible (recherche/tri/filtres), lignes en mode dense, deux icônes
// d'action par carte, et un chevron de détail séparé (pas une action sur la
// donnée) quand la question porte des questions liées.
//
// Ce qui appartient à l'examen est optionnel, et son absence RETIRE l'élément au
// lieu de le désactiver :
//   - `labels` : les libellés (`exam_pools`) — section du panneau de filtres,
//     tri par libellé, pastilles sur les cartes. Le parcours n'en a pas.
//   - `exams` : la feuille en cours et les examens — clic sur la carte pour y
//     poser la question, teinte de celle qui y figure déjà, filtre « jamais
//     utilisée », rappel des examens concernés au moment de supprimer. Une
//     question de parcours n'appartient à aucun examen.
//
// Chaque appelant ne sert que SES questions (`context` filtré côté serveur :
// `getExamBankData` pour la banque, `getParcoursData` pour le parcours), il n'y
// a donc rien à filtrer ici. ----
type FilterMode = 'pos' | 'neg';

// Gabarit de carte (`CARD_*`) et titre coupé à deux lignes (`ClampedTitle`) :
// voir `examShared` — la liste d'examens suit exactement la même trame.
const CARD_DRAFT_TINT = withAlpha(palette.green, 0.08); // teinte de la carte déjà posée sur la feuille

export type QuestionListLabels = {
  pools: Pool[];
  onCreate: (name: string) => string;
  onUpdate: (pool: Pool) => void;
  onDelete: (id: string) => void;
};

export type QuestionListExams = {
  list: Exam[];
  /** Questions déjà posées sur la feuille en cours de composition. */
  draftIds: string[];
  onToggleInExam: (id: string) => void;
};

function QuestionListView({ questions, notions, chapters, labels, exams: examsProp, renderEditor, editOnDoubleClick = false, editingQuestionId, openId, setOpenId, onEditQuestion, onNewQuestion, onDeleteQuestion, workshopId, aiContext }: {
  questions: Question[];
  /** Requis pour la génération par IA ; absent, la liste se comporte comme avant. */
  workshopId?: string;
  /** Le contexte dans lequel l'IA écrira : celui de CETTE liste, jamais un choix
   *  du modèle. Une liste de parcours ne remplit pas la banque d'examen (§8). */
  aiContext?: 'parcours' | 'exam';
  /** `chapterId` par notion : c'est de là que vient le chapitre d'une question. */
  notions: { id: string; title: string; chapterId: string | null }[];
  chapters: { id: string; name: string }[];
  /** Absent = pas de libellés du tout (parcours). */
  labels?: QuestionListLabels;
  /** Absent = les questions n'appartiennent à aucun examen (parcours). */
  exams?: QuestionListExams;
  /** Éditeur de la question en cours de modification, rendu **dans la liste**
   *  (parcours). C'est l'appelant qui le construit — la liste ne connaît pas
   *  l'éditeur, elle décide seulement OÙ il va : à la place de la carte quand
   *  celle-ci est visible, tout en haut sinon (question nouvelle, ou question
   *  que les filtres actifs écartent). Absent = l'éditeur vit ailleurs, comme
   *  dans la feuille de la banque d'examen. */
  renderEditor?: () => ReactNode;
  /** Ouvre l'éditeur au double-clic sur une carte. Raccourci seulement : le
   *  crayon fait la même chose et reste le geste découvrable. */
  editOnDoubleClick?: boolean;
  editingQuestionId: string | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onEditQuestion: (q: Question) => void;
  onNewQuestion: () => void;
  onDeleteQuestion: (q: Question) => void;
}) {
  const tr = useTranslations('examen');
  const tAi = useTranslations('ai');
  // Génération par IA : le choix d'abord, le dialogue ensuite. Les documents sont
  // chargés d'avance pour que le dialogue s'ouvre déjà rempli.
  const [choosing, setChoosing] = useState(false);
  const [generating, setGenerating] = useState(false);
  // `generating` en second argument : la liste est relue à chaque ouverture du
  // dialogue (voir `useWorkshopFiles`), pas seulement au montage de la page.
  const aiFiles = useWorkshopFiles(workshopId ?? '', generating);
  // Les deux familles optionnelles ramenées à des valeurs neutres : le reste du
  // composant s'écrit alors sans condition, seuls l'affichage des sections
  // concernées et les rappels regardent leur présence.
  const showLabels = labels !== undefined;
  const showExams = examsProp !== undefined;
  const pools = labels?.pools ?? [];
  const exams = examsProp?.list ?? [];
  const draftIds = examsProp?.draftIds ?? [];
  const [filterPools, setFilterPools] = useState<string[]>([]);
  const [filterTypes, setFilterTypes] = useState<ResponseType[]>([]);
  const [filterChapters, setFilterChapters] = useState<string[]>([]);
  const [filterExams, setFilterExams] = useState<string[]>([]);
  const [filterLinked, setFilterLinked] = useState<string[]>([]);
  // Côté de chaque filtre actif — inclusion par défaut, exclusion au clic
  // suivant (voir `cycleFilter`). Indexé par clé « catégorie:valeur », les
  // quatre familles de filtres se partageant le même registre.
  const [filterModes, setFilterModes] = useState<Record<string, FilterMode>>({});
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
  const [pendingDeleteQuestion, setPendingDeleteQuestion] = useState<Question | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = filterPools.length + filterTypes.length + filterChapters.length + filterExams.length + filterLinked.length;
  // Trier par libellé n'a de sens que là où il y en a.
  const sortOptions = showLabels ? BANK_SORTS : BANK_SORTS.filter(so => so !== 'label');

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

  // Clic en dehors du panneau : il le referme, avec l'éditeur de libellé s'il
  // était ouvert — chaque couche se prononce sur le même geste — et il ne fait
  // rien d'autre. Voir `useDismissOnOutsideClick`.
  useDismissOnOutsideClick(filterOpen, filterRef, () => setFilterOpen(false));

  useEffect(() => {
    if (!filterOpen) return;
    // Le défilement referme le panneau, exactement comme un clic à côté — avec
    // l'éditeur de libellé s'il était ouvert, l'effet ci-dessous s'en chargeant
    // dès que le panneau se ferme.
    //
    // Mais seul le défilement d'un conteneur qui **porte** le panneau compte.
    // C'est là toute la raison de le fermer : posé en `position: fixed` pour
    // échapper au rognage de la colonne (voir `FilterButton`), il suit son
    // bouton vers le haut de l'écran et finit par passer par-dessus la barre de
    // navigation. Défiler la feuille d'examen, à côté, ne le déplace pas d'un
    // pixel — ça n'a donc pas à le fermer. Le test « la cible contient le
    // panneau » dit exactement ça, et écarte du même coup le défilement de la
    // liste *interne* du panneau, qui n'est pas un geste pour en sortir.
    //
    // Écoute en capture : ce qui défile est la colonne, pas la fenêtre, et les
    // événements `scroll` ne remontent pas.
    function handleScroll(e: Event) {
      // Modale ouverte au-dessus : elle a la main, rien ne se ferme derrière
      // elle. Même exception que pour le clic (`useDismissOnOutsideClick`).
      if (document.querySelector('[data-modal-layer]')) return;
      const target = e.target as Node | null;
      if (!target || !filterRef.current || !target.contains(filterRef.current)) return;
      setFilterOpen(false);
    }
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
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
  function setFilterMode(key: string, mode: FilterMode) {
    setFilterModes(prev => ({ ...prev, [key]: mode }));
  }
  /** Cycle d'un filtre, au clic sur sa pastille : absent → inclus → exclu →
   *  absent. Un seul geste, au même endroit que la liste des valeurs — il n'y a
   *  plus rien à glisser ni à viser ailleurs.
   *
   *  Ce cycle a remplacé (18/08/2026) les deux zones de dépôt « inclure » et
   *  « exclure » posées au-dessus de la liste : elles obligeaient à sélectionner
   *  dans le panneau, puis à ressortir glisser la pastille dans la bonne zone
   *  pour exclure, et occupaient deux lignes en permanence dès qu'un filtre
   *  était actif. Le modèle de filtrage, lui, n'a pas bougé (`filterModes`).
   *
   *  Les deux états ne sont **pas** symétriques dans la liste des filtres : un
   *  filtre exclu reste dans sa liste (`filterPools`…) et n'en sort qu'au
   *  troisième clic ; c'est `filterModes` qui dit de quel côté il joue. */
  function cycleFilter<T extends string>(value: T, key: string, list: T[], setList: Dispatch<SetStateAction<T[]>>) {
    if (!list.includes(value)) {
      setList(prev => [...prev, value]);
      setFilterMode(key, 'pos');
      return;
    }
    if ((filterModes[key] ?? 'pos') === 'pos') {
      setFilterMode(key, 'neg');
      return;
    }
    setList(prev => prev.filter(v => v !== value));
    clearMode(key);
  }
  function togglePoolFilter(id: string) { cycleFilter(id, `pool:${id}`, filterPools, setFilterPools); }
  function toggleTypeFilter(t: ResponseType) { cycleFilter(t, `type:${t}`, filterTypes, setFilterTypes); }
  function toggleChapterFilter(id: string) { cycleFilter(id, `chapter:${id}`, filterChapters, setFilterChapters); }
  function toggleExamFilter(id: string) { cycleFilter(id, `exam:${id}`, filterExams, setFilterExams); }
  function toggleLinkedFilter() { cycleFilter(LINKED_ID, `linked:${LINKED_ID}`, filterLinked, setFilterLinked); }
  function resetFilters() {
    setFilterPools([]);
    setFilterTypes([]);
    setFilterChapters([]);
    setFilterExams([]);
    setFilterLinked([]);
    setFilterModes({});
  }
  function addLabel() {
    const name = newLabelName.trim();
    if (!name || !labels) return;
    labels.onCreate(name);
    setNewLabelName('');
    setCreatingLabel(false);
  }
  // Suppression d'un libellé : la banque a en plus à oublier le filtre qui le
  // visait, sans quoi la liste resterait filtrée sur un libellé disparu.
  function deleteLabel(id: string) {
    labels?.onDelete(id);
    setFilterPools(prev => prev.filter(p => p !== id));
    clearMode(`pool:${id}`);
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
  const linkedMode = filterLinked.length > 0 ? modeOf(`linked:${LINKED_ID}`) : null;

  /** État d'une pastille de filtre, à étaler sur `LabelPill`. */
  const pillState = (key: string, selected: boolean) => ({
    active: selected && modeOf(key) === 'pos',
    excluded: selected && modeOf(key) === 'neg',
  });
  // La légende du panneau ne montre que les états réellement en jeu : tant que
  // rien n'est exclu, « exclu » n'a rien à expliquer et ne prend pas de place.
  const hasIncluded = posPools.length + posTypes.length + posChapters.length + posExams.length > 0 || linkedMode === 'pos';
  const hasExcluded = negPools.length + negTypes.length + negChapters.length + negExams.length > 0 || linkedMode === 'neg';

  let filtered = questions.filter(q => {
    const qPools = new Set(q.pools);
    const qExamIds = new Set(q.examIds);
    const qChapters = chaptersOfQuestion(q);
    const qTypes = typesOfQuestion(q);
    const neverExam = q.examIds.length === 0;

    if (posPools.length && !posPools.some(p => qPools.has(p))) return false;
    if (negPools.length && negPools.some(p => qPools.has(p))) return false;
    if (posTypes.length && !posTypes.some(t => qTypes.some(a => typeMatches(t, a)))) return false;
    if (negTypes.length && negTypes.some(t => qTypes.some(a => typeMatches(t, a)))) return false;
    if (posChapters.length && !posChapters.some(c => qChapters.has(c))) return false;
    if (negChapters.length && negChapters.some(c => qChapters.has(c))) return false;
    if (posExams.length && !posExams.some(f => f === NEVER_EXAM_ID ? neverExam : qExamIds.has(f))) return false;
    if (negExams.length && negExams.some(f => f === NEVER_EXAM_ID ? neverExam : qExamIds.has(f))) return false;
    // Inclus = seulement les grappes, exclu = seulement les questions seules.
    if (linkedMode === 'pos' && q.parts.length === 0) return false;
    if (linkedMode === 'neg' && q.parts.length > 0) return false;
    // La recherche balaie la grappe entière, pour la même raison que les filtres
    // ci-dessus : l'énoncé d'une question liée n'a pas d'autre carte que celle
    // de sa grappe, il serait sinon impossible de le retrouver au texte.
    if (search.trim()) {
      const haystack = [q.content, q.answer, ...q.parts.flatMap(p => [p.content, p.answer])].join(' ').toLowerCase();
      if (!haystack.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'name':
        return dir * a.content.localeCompare(b.content);
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
        onClick={examsProp ? () => examsProp.onToggleInExam(q.id) : undefined}
        onDoubleClick={editOnDoubleClick ? () => onEditQuestion(q) : undefined}
        tint={inDraft ? CARD_DRAFT_TINT : undefined}
        borderColor={inDraft ? palette.greenSoft : undefined}
        title={q.content || tr('noStatement')}
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
              <Tooltip content={open ? tr('bank.hideParts') : tr('bank.showParts', { count: q.parts.length + 1 })}>
              <button
                onClick={(e) => { e.stopPropagation(); setOpenId(open ? null : q.id); }}
                aria-label={open ? tr('bank.hideParts') : tr('bank.showParts', { count: q.parts.length + 1 })}
                /* Même gabarit que `TypeIcon` (carré `CARD_LINE`, rayon 7) mais en
                   contour seul, sans aplat : les deux pictogrammes se lisent comme
                   une paire sans que le lien de grappe se fasse passer pour un
                   type de réponse. Le groupe déplié renforce le contour et l'encre. */
                style={{ flexShrink: 0, width: CARD_LINE, height: CARD_LINE, borderRadius: 7, border: `1px solid ${open ? ink(0.32) : ink(0.16)}`, background: 'transparent', color: open ? palette.inkSoft : palette.inkFaint, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <Link2 size={CARD_LINE - 8} strokeWidth={1.75} />
              </button>
              </Tooltip>
            )}
          </>
        }
        meta={!showLabels ? undefined : q.pools.map(pid => {
          const p = pools.find(pp => pp.id === pid);
          if (!p) return null;
          return <LabelPill key={pid} name={p.name} color={p.color} size="xs" />;
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

  return (
    <div style={{ padding: `16px ${LIST_INSET_X}px 28px` }}>
      {/* Ni titre ni bouton en propre : l'onglet au-dessus de la liste dit déjà
          où l'on est, et la maquette ne montre que la barre d'outils (recherche ·
          tri · filtre · nouvelle). La génération n'ajoute donc pas un bouton de
          plus — elle se glisse DANS « + nouvelle », qui demande désormais par
          quoi créer. Les filtres actifs ne sont pas repris ici non plus : ils se
          lisent et se règlent dans leur panneau, d'où le compteur porté par le
          bouton « filtres ». */}
      {/* Le bandeau n'annonce que ce que CETTE liste a reçu : la banque d'examen
          ne parle pas des questions du parcours, et réciproquement. */}
      {workshopId && (
        <ImportBanner
          workshopId={workshopId}
          scope={aiContext === 'exam' ? 'exam' : 'programme'}
          onCancelled={() => window.location.reload()}
        />
      )}

      {/* Le choix « par IA / manuellement ». Une modale plutôt qu'un menu ancré :
          le bouton est rendu par `ListToolbar`, qui n'expose pas son nœud — et
          deux options méritent d'être lisibles, pas tassées. */}
      {choosing && (
        <Modal onClose={() => setChoosing(false)} width={360} portal>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={() => { setChoosing(false); setGenerating(true); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 14px', borderRadius: 10, border: 'none', background: palette.green, color: palette.parchment, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Sparkles size={15} /> {tAi('chooseAi')}
            </button>
            <button
              type="button"
              onClick={() => { setChoosing(false); onNewQuestion(); }}
              style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${palette.lineStrong}`, background: 'transparent', color: palette.inkMuted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {tAi('chooseManual')}
            </button>
          </div>
        </Modal>
      )}

      {generating && workshopId && (
        <AiGenerationDialog
          workshopId={workshopId}
          files={aiFiles ?? []}
          forcedContext={aiContext}
          onClose={() => setGenerating(false)}
          onDone={() => window.location.reload()}
        />
      )}

      {/* Barre d'outils commune aux deux listes (`ListToolbar`) : la banque n'y
          met que ce qui lui est propre — sa recherche, ses critères de tri, son
          panneau de filtres et son action « nouvelle question ». */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={tr('bank.searchPlaceholder')}
        sortOptions={sortOptions}
        sortBy={sortBy}
        onSortByChange={changeSortBy}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
        actionLabel={tr('bank.newShort')}
        actionTitle={tr('bank.newQuestion')}
        // « + nouvelle » ne crée plus directement : elle demande d'abord PAR QUOI
        // (§8 du plan d'ingestion). Sans `aiContext` — donc partout où la
        // génération n'a pas de sens — le comportement d'avant est conservé.
        onAction={aiContext ? () => setChoosing(true) : onNewQuestion}
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
              {/* Légende posée SUR la ligne du titre, et cette ligne a une
                  hauteur réservée (`minHeight`) : les deux mots peuvent
                  apparaître et disparaître au fil des clics sans que rien ne
                  bouge sous eux. Sur leur propre ligne, ils poussaient tout le
                  panneau vers le bas en s'affichant — au moment précis où l'on
                  vise une pastille.

                  Un mot par état, dans la couleur exacte de la sélection qu'il
                  décrit : c'est une vraie `LabelPill` qui sert de témoin, elle
                  ne peut donc pas mentir sur ce qu'on voit en dessous. Chaque
                  mot n'apparaît qu'une fois son état utilisé — au premier clic
                  on découvre « inclus », au deuxième « exclu » — et son
                  infobulle dit le cycle en entier. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: LEGEND_ROW_H, padding: '12px 14px 10px', flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: palette.ink, flexShrink: 0 }}>{tr('bank.filtersTitle')}</span>
                {hasIncluded && <LabelPill size="xs" name={tr('bank.include')} title={tr('bank.includeHint')} active />}
                {hasExcluded && <LabelPill size="xs" name={tr('bank.exclude')} title={tr('bank.excludeHint')} excluded />}
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} style={{ marginLeft: 'auto', fontSize: 11.5, color: palette.greenBrand, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>{tr('bank.filtersReset')}</button>
                )}
              </div>
              <div style={{ overflowY: 'auto', padding: '0 14px 14px', flex: 1, minHeight: 0 }}>
                {/* Type de réponse */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.rTypeSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {RESPONSE_TYPE_ORDER.map(ty => {
                    const Icon = RESPONSE_TYPE_ICONS[ty];
                    return (
                      <LabelPill
                        key={ty}
                        name={tr(`responseType.${ty}`)}
                        color={RESPONSE_TYPE_COLORS[ty]}
                        icon={<Icon size={11} strokeWidth={1.75} />}
                        {...pillState(`type:${ty}`, filterTypes.includes(ty))}
                        onClick={() => toggleTypeFilter(ty)}
                      />
                    );
                  })}
                </div>
                {/* Statut */}
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.statusSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {/* Pastille neutre : même composant et donc même état
                      sélectionné que les libellés et les types de réponse
                      au-dessus (voir `LabelPill`). « Jamais utilisée » parle des
                      examens — sans examens, elle n'a rien à dire. */}
                  {showExams && (
                    <LabelPill
                      name={tr('bank.statusNew')}
                      {...pillState(`exam:${NEVER_EXAM_ID}`, filterExams.includes(NEVER_EXAM_ID))}
                      onClick={() => toggleExamFilter(NEVER_EXAM_ID)}
                    />
                  )}
                  {/* Le seul filtre dont l'exclusion dit quelque chose d'utile
                      en soi : « exclu » isole les questions seules, ce qu'aucun
                      autre filtre ne sait faire. */}
                  <LabelPill
                    name={tr('bank.statusLinked')}
                    icon={<Link2 size={11} strokeWidth={1.75} />}
                    {...pillState(`linked:${LINKED_ID}`, filterLinked.length > 0)}
                    onClick={toggleLinkedFilter}
                  />
                </div>
                {/* Libellés — banque d'examen seulement. */}
                {showLabels && (
                <>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.labelsSection')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {pools.map(l => (
                    <LabelPill
                      key={l.id}
                      name={l.name}
                      color={l.color}
                      {...pillState(`pool:${l.id}`, filterPools.includes(l.id))}
                      onClick={() => togglePoolFilter(l.id)}
                      onEdit={() => setEditingLabel(editingLabel === l.id ? null : l.id)}
                      editTitle={tr('bank.editLabelTitle')}
                    />
                  ))}
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
                </>
                )}
                {/* Chapitre — une question n'en porte pas directement : elle
                    hérite de ceux de ses notions associées. Section masquée
                    tant que l'atelier n'a aucun chapitre. */}
                {chapters.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: palette.inkFaint, marginBottom: 8 }}>{tr('bank.chapterSection')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {chapters.map(c => (
                        <LabelPill
                          key={c.id}
                          name={c.name}
                          {...pillState(`chapter:${c.id}`, filterChapters.includes(c.id))}
                          onClick={() => toggleChapterFilter(c.id)}
                        />
                      ))}
                      <LabelPill
                        name={tr('bank.noChapter')}
                        {...pillState(`chapter:${NO_CHAPTER_ID}`, filterChapters.includes(NO_CHAPTER_ID))}
                        onClick={() => toggleChapterFilter(NO_CHAPTER_ID)}
                      />
                    </div>
                  </>
                )}
              </div>
              {editingLabel && (() => {
                const label = pools.find(p => p.id === editingLabel);
                if (!label) return null;
                return (
                  <LabelEditor
                    label={label}
                    usageCount={questions.filter(q => q.pools.includes(label.id)).length}
                    onSave={pool => labels?.onUpdate(pool)}
                    onDelete={() => deleteLabel(label.id)}
                    onClose={() => setEditingLabel(null)}
                  />
                );
              })()}
            </div>
          </FilterButton>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Éditeur détaché, tout en haut : la question éditée n'a pas de carte
            où se poser. Deux cas, et un seul comportement — on la garde sous
            les yeux jusqu'à la fin de l'édition. Une question NOUVELLE n'est pas
            encore dans la liste ; une question existante peut en être écartée
            par les filtres actifs, et la voir disparaître sous le formulaire
            qu'on vient d'ouvrir n'aurait aucun sens. Elle rejoint la liste — ou
            s'efface, si les filtres l'écartent — une fois l'édition terminée. */}
        {renderEditor && editingQuestionId !== null && !filtered.some(q => q.id === editingQuestionId) && renderEditor()}
        {filtered.map(q => (
          renderEditor && q.id === editingQuestionId
            ? <div key={q.id}>{renderEditor()}</div>
            : renderQuestionCard(q)
        ))}
        {filtered.length === 0 && editingQuestionId === null && (
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
    </div>
  );
}

export default QuestionListView;
