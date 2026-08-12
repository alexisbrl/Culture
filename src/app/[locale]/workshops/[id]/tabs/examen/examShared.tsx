'use client';

// Boîte à outils partagée de l'onglet « Génération d'examen » : types de domaine,
// constantes (pagination A4, couleurs), fonctions utilitaires pures et petits composants
// présentationnels réutilisés par HistoryContent / BankContent / GeneratorContent / ExamenTab.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlignLeft, ArrowDown, ArrowUp, CheckSquare, File, Filter, List, Palette, Paperclip, Pencil, Plus, Route, Search, Settings2, Table, X, type LucideIcon } from 'lucide-react';
import { palette, ink, withAlpha, categoryTones, shadow } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import { type Question, type QuestionPart, type ResponseType } from '../QuestionEditor';
// Pièce jointe média (image/audio) : voir questionMedia.tsx pour l'explication
// du cycle d'import évité. Réexporté ici pour ne pas casser les imports
// existants (GeneratorContent importe QuestionImagePreview/QuestionAudioNote
// depuis ce fichier).
export { useQuestionMediaUrl, uploadQuestionMedia, useQuestionMediaDrop, MediaAttachment, QuestionImagePreview, QuestionAudioNote } from './questionMedia';

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
// bornes du curseur de partage gauche/droite des paires — la copie applique le même réglage que l'éditeur
import { MATCH_SPLIT_DEFAULT, MATCH_SPLIT_MAX, MATCH_SPLIT_MIN } from '@/lib/workshops/examTypes';
export type { IdentitySide, CandidateIdentity, CustomField, ExamPresentation, ExamSection, QuestionWeight, ExamConfig };
export type Pool = ExamPool;
export type Exam = GeneratedExam;

export const DEFAULT_IDENTITY_ORDER: (keyof CandidateIdentity)[] = ['nom', 'prenom', 'tag', 'classe', 'date', 'bareme'];
export const IDENTITY_KEY_SET = new Set<string>(DEFAULT_IDENTITY_ORDER);
export const IDENTITY_LABELS: Record<keyof CandidateIdentity, string> = { nom: 'Nom', prenom: 'Prénom', tag: 'Tag - Culture', classe: 'Classe', date: 'Date', bareme: 'Barème' };
// Le barème n'est pas un champ à remplir par l'élève : il s'affiche « …… / N pts »
// et ne porte donc pas de ligne de pointillés comme les autres pilules.
export const BAREME_KEY = 'bareme';

// ---- small helpers ----
export const RESPONSE_TYPE_COLORS: Record<ResponseType, string> = {
  sans_reponse: palette.inkSoft,
  qcs: palette.greenSoft,
  qcm: palette.greenSoft,
  textuelle: categoryTones.blueGray,
  liste: categoryTones.steelBlue,
  tableau: palette.amberLight,
  matching: categoryTones.mauve,
  dessin: categoryTones.mauve,
  fichier: categoryTones.rust,
};

// La difficulté a été retirée des critères de tri le 09/08/2026 (elle reste un
// filtre) : cinq critères pour une colonne étroite, dont un que personne ne
// classait par ordre croissant.
export type SortBy = 'name' | 'type' | 'label' | 'recent';
export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT_DIR: Record<SortBy, SortDir> = {
  name: 'asc',
  type: 'asc',
  label: 'asc',
  recent: 'desc',
};

// Dimensions de la barre d'outils des deux listes. Elles ne sortent pas d'ici :
// les listes passent par `ListToolbar`, ce qui garantit que les cartes
// commencent à la même hauteur de part et d'autre et qu'on bascule d'un onglet
// à l'autre sans que la liste ne saute d'un pixel.
const TOOLBAR_H = 34;
const TOOLBAR_GAP = 6;
const TOOLBAR_MB = 12;

/** Bouton de sens de tri : la double flèche ↑↓ habituelle, celle du sens actif
 *  en gras et à pleine encre, l'autre effacée. Deux icônes Lucide serrées l'une
 *  contre l'autre plutôt que `ArrowUpDown` — d'un seul composant on ne peut pas
 *  styler une flèche sans l'autre, et un SVG maison est proscrit (CLAUDE.md §1). */
export function SortDirIcon({ dir, size = 13 }: { dir: SortDir; size?: number }) {
  const asc = dir === 'asc';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <ArrowUp size={size} strokeWidth={asc ? 2.75 : 1.5} color={asc ? palette.ink : palette.inkGhost} />
      <ArrowDown size={size} strokeWidth={asc ? 1.5 : 2.75} color={asc ? palette.inkGhost : palette.ink} style={{ marginLeft: -3 }} />
    </span>
  );
}

/** Contrôle de tri des deux listes de l'onglet (banque de questions et
 *  historique d'examens) : sens de tri à gauche, critère à droite, dans un même
 *  bloc segmenté. Chaque liste passe les critères qui la concernent — le reste
 *  (dimensions, libellés) est commun, condition pour que les deux barres
 *  d'outils fassent exactement la même hauteur et que les cartes des deux
 *  listes se superposent quand on bascule de l'une à l'autre.
 *
 *  Le critère courant reste écrit en clair — c'est le seul contrôle de la barre
 *  dont la valeur doit se lire d'un coup d'œil — mais sans chevron ni largeur
 *  fixe : le `select` natif est rendu transparent et posé par-dessus un simple
 *  libellé, qui donne au bloc la largeur exacte du texte affiché. On garde le
 *  déroulé natif au clic (et au clavier) sans hériter de sa décoration ni de sa
 *  largeur intrinsèque, qui se cale sur l'option la plus longue. */
function SortControl({ options, value, onChange, dir, onToggleDir }: {
  options: readonly SortBy[];
  value: SortBy;
  onChange: (v: SortBy) => void;
  dir: SortDir;
  onToggleDir: () => void;
}) {
  const t = useTranslations('examen');
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderRadius: 9, border: `1px solid ${palette.lineStrong}`, background: palette.surfaceRaised, overflow: 'hidden', flexShrink: 0 }}>
      <button type="button" title={dir === 'asc' ? t('sort.asc') : t('sort.desc')} onClick={onToggleDir} style={{ width: 30, minHeight: TOOLBAR_H, alignSelf: 'stretch', border: 'none', borderRight: `1px solid ${palette.line}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
        <SortDirIcon dir={dir} />
      </button>
      <span style={{ position: 'relative', alignSelf: 'stretch', display: 'inline-flex', alignItems: 'center', padding: '0 9px', flexShrink: 0 }}>
        <span aria-hidden style={{ fontSize: 11.5, color: palette.inkMuted, whiteSpace: 'nowrap' as const }}>{t(`sort.${value}`)}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value as SortBy)}
          title={t('sort.by')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, border: 'none', padding: 0 }}
        >
          {options.map(opt => <option key={opt} value={opt}>{t(`sort.${opt}`)}</option>)}
        </select>
      </span>
    </div>
  );
}

/** Bouton « filtrer » de la barre d'outils, et son panneau déroulant. Chaque
 *  liste fournit le contenu du panneau (`children`) et le nombre de filtres
 *  actifs, qui allume le bouton et sa pastille. Sans critère de filtre
 *  disponible (`disabled`), le bouton reste en place mais grisé — la barre
 *  garde la même composition d'une liste à l'autre.
 *  `containerRef` sert au clic-dehors, que l'appelant gère (lui seul sait si
 *  une modale du panneau doit le neutraliser).
 *
 *  Le panneau est **posé par le composant lui-même**, en `position: fixed` aux
 *  coordonnées du bouton : en `absolute`, il était rogné par le panneau
 *  défilant de la colonne (`overflow`), et un panneau plus large que la colonne
 *  sortait de l'écran. En `fixed`, il échappe au rognage (aucun ancêtre n'a de
 *  `transform`, sinon le repère redeviendrait celui de l'ancêtre — voir
 *  .claude/rules/frontend-patterns.md) et se recale sur le bord de la fenêtre.
 *  Il reste dans le DOM du conteneur, donc le clic-dehors de l'appelant, qui
 *  teste `containerRef.contains`, continue de fonctionner. */
const FILTER_PANEL_MARGIN = 8;  // écart minimum conservé avec le bord de la fenêtre

export function FilterButton({ title, count = 0, open = false, disabled = false, onToggle, containerRef, panelWidth = 290, children }: {
  title: string;
  count?: number;
  open?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  panelWidth?: number;
  children?: React.ReactNode;
}) {
  const active = count > 0;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const top = r.bottom + 6;
    const next = {
      left: Math.max(FILTER_PANEL_MARGIN, Math.min(r.left, window.innerWidth - panelWidth - FILTER_PANEL_MARGIN)),
      top,
      maxHeight: Math.max(220, window.innerHeight - top - 16),
    };
    // Comparaison explicite avant d'écrire : cet effet tourne à chaque rendu
    // (pas de tableau de dépendances), une écriture systématique bouclerait.
    setPanelPos(prev => (prev && prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight) ? prev : next);
  }, [panelWidth]);

  // Sans tableau de dépendances : le bouton bouge aussi quand la liste se
  // réagence sous lui (l'apparition des zones inclure/exclure le descend de
  // ~66px), et le panneau doit suivre — pas seulement au scroll ou au resize.
  useLayoutEffect(() => {
    if (open) place();
  });

  // Le scroll est écouté en capture : c'est le panneau de la colonne qui
  // défile, pas la fenêtre.
  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={onToggle}
        disabled={disabled}
        title={title}
        style={{
          position: 'relative', height: '100%', minHeight: TOOLBAR_H, width: TOOLBAR_H, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 9, fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: `1px solid ${disabled ? palette.line : active ? palette.greenSoft : palette.lineStrong}`,
          background: disabled ? palette.surfaceSunken : active ? withAlpha(palette.green, 0.12) : palette.surfaceRaised,
          color: disabled ? palette.inkGhost : active ? palette.greenBrand : palette.inkMuted,
        }}
      >
        <Filter size={15} strokeWidth={1.75} />
        {active && (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 999, background: palette.green, color: palette.onGreen, fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {count}
          </span>
        )}
      </button>
      {open && panelPos && (
        <div
          style={{
            position: 'fixed', left: panelPos.left, top: panelPos.top, width: panelWidth, maxHeight: panelPos.maxHeight,
            background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg,
            // au-dessus de la barre du haut collante (z-50), sous les modales
            zIndex: 60, display: 'flex', flexDirection: 'column',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Barre d'outils des deux listes de l'onglet : recherche · filtre · tri ·
 *  action primaire, sur une seule rangée (T48), comme la maquette. Les
 *  dimensions sont figées ici et le bouton de filtre est un emplacement —
 *  chaque liste passe son propre `FilterButton`, avec les critères qui la
 *  concernent. */
export function ListToolbar({ search, onSearchChange, searchPlaceholder, filter, sortOptions, sortBy, onSortByChange, sortDir, onToggleSortDir, actionLabel, actionTitle, onAction }: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  filter: React.ReactNode;
  sortOptions: readonly SortBy[];
  sortBy: SortBy;
  onSortByChange: (v: SortBy) => void;
  sortDir: SortDir;
  onToggleSortDir: () => void;
  actionLabel: string;
  actionTitle: string;
  onAction: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: TOOLBAR_GAP, marginBottom: TOOLBAR_MB }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0, background: palette.surfaceInput, border: `1px solid ${palette.line}`, borderRadius: 10, padding: '0 10px' }}>
        <Search size={15} strokeWidth={1.75} color={palette.inkFaint} style={{ flexShrink: 0 }} />
        <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder={searchPlaceholder} style={{ flex: 1, minWidth: 0, fontSize: 13, color: palette.ink, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
      </div>
      {filter}
      <SortControl options={sortOptions} value={sortBy} onChange={onSortByChange} dir={sortDir} onToggleDir={onToggleSortDir} />
      {/* Seule action primaire de la colonne (T48) — la maquette la met en vert. */}
      <button onClick={onAction} title={actionTitle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: TOOLBAR_H, padding: '0 11px', borderRadius: 9, background: palette.green, color: palette.onGreen, border: 'none', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
        <Plus size={15} strokeWidth={2.25} /> {actionLabel}
      </button>
    </div>
  );
}

/** Demande de recadrage de la feuille sur une ligne : `key` est la clé de la
 *  ligne dans `qRefs` (identifiant de question, de saut de page, ou
 *  `h-<id de partie>` pour un titre de partie). Le jeton ne sert qu'à
 *  redéclencher le recadrage sur une ligne déjà visée juste avant — sans lui,
 *  renvoyer deux fois la même question sur la feuille ne bougerait plus rien. */
export type SheetFocus = { key: string; token: number };

export const NEVER_EXAM_ID = '__never__';
export const NO_DIFFICULTY = 0;

// pagination de l'aperçu A4 (panneau « Éditeur d'examen ») — dimensions en px pour un bloc de 880px de large
export const A4_PAGE_HEIGHT = 1494; // ≈ ratio A4 (210×297mm) pour un bloc de 1056px de large
export const A4_ROW_GAP = 0; // les questions sont désormais collées (un seul bloc continu par section) — pas de marge entre lignes
export const A4_SECTION_HEADER_HEIGHT = 44; // hauteur approx. de la barre de titre de section (+ marge)
export const A4_TITLE_BLOCK_HEIGHT = 180; // hauteur approx. du bloc titre + sous-titre centré en haut de la 1ère page (incl. ~1,5cm d'espace avant la 1ère partie)
export const A4_IDENTITY_ROW_HEIGHT = 29; // hauteur approx. d'une ligne d'identité candidat (nom/prénom/tag/classe/date), interligne compris
export const A4_ROW_FALLBACK_HEIGHT = 396; // hauteur estimée avant la première mesure réelle
export const A4_BLOCK_WIDTH = 1056; // largeur du bloc question au format A4 dans l'aperçu
export const A4_MARGIN_PX = Math.round(A4_BLOCK_WIDTH / 21 * 1); // marge non imprimable de 1cm en haut et en bas de chaque page (1056px ≈ 21cm de large)
export const A4_PAGE_BREAK_HEIGHT = 56; // hauteur approx. du repère « saut de page » dans l'aperçu
// Pas des lignes à remplir sur la copie. Référence : la ligne d'une liste
// numérotée (hauteur du numéro + gouttière) — toute réponse lignée (texte,
// liste sans numéros, repli des autres types) utilise le même pas, sinon ses
// lignes sont deux fois plus serrées et l'élève n'a pas la place d'écrire.
export const A4_ANSWER_LINE_HEIGHT = 18;
export const A4_ANSWER_LINE_GAP = 22;
export const PAGE_BREAK_PREFIX = 'pb';

export function isPageBreakId(id: string): boolean {
  return id.startsWith(PAGE_BREAK_PREFIX);
}

export const LABEL_COLORS = [categoryTones.blueGray, categoryTones.mauve, palette.greenSoft, palette.amberLight, palette.danger, palette.greenBrand, palette.amber, palette.inkFaint, categoryTones.steelBlue, categoryTones.rust];

// Trois tailles pour un seul et même rendu de pastille : `xs` sur les cartes de
// la banque (la ligne de métadonnées est serrée), `sm` dans le panneau de
// filtres, `md` dans les éditeurs de question.
const LABEL_PILL_SIZES = {
  xs: { fontSize: 10.5, padding: '3px 9px', gap: 5, affordance: 13, icon: 8 },
  sm: { fontSize: 11, padding: '4px 8px', gap: 5, affordance: 15, icon: 9 },
  md: { fontSize: 12, padding: '5px 9px', gap: 6, affordance: 17, icon: 10 },
} as const;

/** Aplat sobre dérivé de la couleur d'un libellé. La couleur brute en fond plein
 *  jurait avec le crème de la page (12/08/2026) — et la corriger en changeant
 *  `LABEL_COLORS` n'aurait rien réglé pour les libellés déjà enregistrés, qui
 *  portent leur hex en base. On garde donc la couleur telle quelle comme
 *  identité et on l'atténue à l'affichage, exactement comme `TypeIcon`. */
export const labelTint = (color: string) => withAlpha(color, 0.22);

/** Pastille de libellé — rendu unique de la banque, des filtres et des deux
 *  éditeurs de question. Le fond est l'aplat atténué du libellé (`labelTint`),
 *  l'encre reste celle de la page : la couleur identifie, elle ne crie pas. Elle
 *  ne se réduit pas non plus à une pastille de 7 px (rendu abandonné le même
 *  jour : illisible et incohérent d'un écran à l'autre). L'état actif se lit au
 *  liseré d'encre, jamais à un changement de fond — sinon la couleur du libellé
 *  n'est plus une information fiable.
 *
 *  Les deux affordances vivent DANS la pastille, chacune de son côté et chacune
 *  conditionnée à ce qui est réellement possible sur l'écran courant :
 *  - `onEdit` → crayon à gauche : modifier le libellé lui-même (filtres et
 *    éditeur de question) ; ouvre `LabelEditor`.
 *  - `onRemove` → croix à droite : détacher le libellé de la question (éditeur
 *    de question seulement). Elle ne supprime jamais le libellé de l'atelier —
 *    ça, c'est le bouton « supprimer » de `LabelEditor`.
 *  Sur les cartes de la banque, la pastille n'a ni l'un ni l'autre.
 *
 *  Le fond coloré est un `span`, pas un `button` : `onClick` (bascule de filtre)
 *  est porté par le libellé lui-même, pour que le crayon et la croix restent des
 *  boutons frères — un `<button>` imbriqué dans un `<button>` est invalide.
 *
 *  `icon` : pictogramme collé à gauche du texte, pour les filtres de type de
 *  réponse qui reprennent la même pastille (voir `RESPONSE_TYPE_ICONS`). */
export function LabelPill({ name, color, size = 'sm', active = false, icon, onClick, onEdit, onRemove, editTitle, removeTitle }: {
  name: string;
  color: string;
  size?: keyof typeof LABEL_PILL_SIZES;
  active?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  editTitle?: string;
  removeTitle?: string;
}) {
  const s = LABEL_PILL_SIZES[size];
  const displayName = name.length > 18 ? name.slice(0, 18) + '…' : name;
  const affordance: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    width: s.affordance, height: s.affordance, borderRadius: '50%', padding: 0,
    border: 'none', background: ink(0.07), color: palette.inkSoft, cursor: 'pointer',
  };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: s.gap, flexShrink: 0,
        fontSize: s.fontSize, padding: s.padding, borderRadius: 999, fontFamily: 'inherit',
        // Aucun liseré au repos : sur une pastille l'entourage ne se voit qu'aux
        // deux extrémités arrondies, où il lit comme un défaut de rendu plutôt
        // que comme une bordure. Seul l'état actif en porte un, c'est son signal.
        border: `1px solid ${active ? palette.ink : 'transparent'}`,
        boxShadow: active ? `0 0 0 2px ${ink(0.25)}` : 'none',
        background: labelTint(color), color: palette.ink, fontWeight: active ? 600 : 400,
      }}
    >
      {icon && <span style={{ display: 'flex', flexShrink: 0, color: palette.inkSoft }}>{icon}</span>}
      {onEdit && (
        <button type="button" onClick={onEdit} title={editTitle} style={affordance}>
          <Pencil size={s.icon} strokeWidth={2} />
        </button>
      )}
      {onClick
        ? <button type="button" onClick={onClick} style={{ border: 'none', background: 'none', color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer' }}>{displayName}</button>
        : displayName}
      {onRemove && (
        <button type="button" onClick={onRemove} title={removeTitle} style={affordance}>
          <X size={s.icon} strokeWidth={2.2} />
        </button>
      )}
    </span>
  );
}

/** Panneau d'édition d'un libellé (nom, couleur, suppression), ouvert par le
 *  crayon d'une `LabelPill`. Partagé par le panneau de filtres et l'éditeur de
 *  question pour que « modifier un libellé » veuille dire la même chose des deux
 *  côtés — suppression comprise, avec sa confirmation qui annonce le nombre de
 *  questions concernées.
 *
 *  ⚠️ Se positionne en `absolute` au centre de son ancêtre positionné le plus
 *  proche : le conteneur appelant doit porter `position: relative`.
 *
 *  `usageCount` est le nombre de questions qui portent le libellé, calculé par
 *  l'appelant (lui seul connaît la liste complète). */
/** Ferme un panneau au clic en dehors de lui — et **ce clic ne fait que ça**.
 *
 *  Deux règles, qui vont ensemble :
 *
 *  1. *Le clic est avalé.* Il ne parvient pas à ce qu'il y avait dessous : ni
 *     le bouton visé, ni le focus, ni la sélection de texte. Un panneau ouvert
 *     capture donc le premier clic, et il en faut un second pour agir — ce qui
 *     est le comportement attendu d'un panneau qu'on quitte.
 *  2. *Toutes les couches concernées se ferment dans le même geste.* Chaque
 *     panneau juge de son propre côté : un clic hors de l'éditeur de libellé
 *     mais dans le panneau de filtres ne ferme que le premier ; un clic hors
 *     des deux les ferme tous les deux. Auparavant le panneau de filtres se
 *     mettait en retrait tant qu'un libellé était en cours d'édition, si bien
 *     qu'il fallait autant de clics que de couches ouvertes.
 *
 *  Écoute en capture sur `document` : elle passe avant React (qui pose ses
 *  écouteurs sur la racine de l'application, plus bas dans l'arbre), et
 *  `stopPropagation` n'empêche pas les autres couches de se prononcer — les
 *  écouteurs d'un même nœud s'exécutent tous, seule la descente est coupée.
 *
 *  Le `click` est un événement distinct du `mousedown` : l'empêcher demande de
 *  l'avaler à part. L'écouteur d'un coup se retire sur le clic qu'il avale, et à
 *  défaut au tour de boucle qui suit le `mouseup` — un `mousedown` ne produit
 *  pas toujours un `click` (glissement, menu contextuel), et un écouteur oublié
 *  avalerait un clic sans rapport.
 *
 *  Les modales (`data-modal-layer`) sont hors du jeu : elles se posent au-dessus
 *  et gèrent leur propre sortie. */
export function useDismissOnOutsideClick(
  active: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  // Rappel gardé dans une référence tenue à jour après chaque rendu : l'appelant
  // le redéfinit à chaque fois (fonction fléchée), et le mettre en dépendance de
  // l'effet ferait poser et retirer l'écouteur à chaque rendu.
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  useEffect(() => {
    if (!active) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (target.closest?.('[data-modal-layer]')) return;
      e.preventDefault();
      e.stopPropagation();
      const swallowClick = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); cleanup(); };
      const armCleanup = () => { window.setTimeout(cleanup, 0); };
      function cleanup() {
        document.removeEventListener('click', swallowClick, true);
        document.removeEventListener('mouseup', armCleanup, true);
      }
      document.addEventListener('click', swallowClick, true);
      document.addEventListener('mouseup', armCleanup, true);
      dismissRef.current();
    }
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [active, ref]);
}

export function LabelEditor({ label, usageCount, onSave, onDelete, onClose }: {
  label: Pool;
  usageCount: number;
  onSave: (next: Pool) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('examen');
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [confirming, setConfirming] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function save() {
    onSave({ ...label, name: name.trim() || label.name, color: color || label.color });
    onClose();
  }

  // N'importe quel clic hors du panneau l'abandonne (modifications perdues) :
  // un panneau qui reste ouvert pendant qu'on travaille ailleurs finit par
  // enregistrer sur un libellé qu'on ne regarde plus. Le voile ne couvre que
  // l'ancêtre positionné, d'où l'écoute au niveau du document. La confirmation
  // de suppression, elle, est une modale : `useDismissOnOutsideClick` l'ignore
  // d'office, il n'y a pas de cas particulier à tenir ici.
  useDismissOnOutsideClick(true, cardRef, onClose);

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, zIndex: 29, background: withAlpha(palette.cream, 0.7), borderRadius: 12 }} />
      <div ref={cardRef} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30, width: 190, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 12, boxShadow: shadow.lg, padding: 10 }}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); }} style={{ width: '100%', fontSize: 11.5, padding: '6px 8px', borderRadius: 8, border: `1px solid ${palette.lineStrong}`, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' as const, background: palette.surfaceInput, color: palette.ink }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {/* Les témoins montrent l'aplat réellement obtenu, pas la couleur
              brute : on choisit ce qu'on verra sur la pastille. */}
          {LABEL_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)} title={c} style={{ width: 16, height: 16, borderRadius: '50%', background: labelTint(c), border: color === c ? `2px solid ${palette.ink}` : `1px solid ${withAlpha(c, 0.55)}`, cursor: 'pointer', padding: 0 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={save} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: 'none', background: palette.ink, color: palette.onInk, cursor: 'pointer', fontFamily: 'inherit' }}>{t('bank.saveLabel')}</button>
          <button type="button" onClick={onClose} style={{ flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${palette.lineStrong}`, background: 'transparent', color: palette.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>{t('cancelLower')}</button>
        </div>
        <button type="button" onClick={() => setConfirming(true)} style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${withAlpha(palette.danger, 0.30)}`, background: withAlpha(palette.danger, 0.08), color: palette.danger, cursor: 'pointer', fontFamily: 'inherit' }}>{t('bank.deleteLabel')}</button>
      </div>
      {confirming && (
        <ConfirmDialog
          portal
          width={380}
          title={t('bank.deleteLabelTitle', { name: label.name })}
          description={`${usageCount > 0 ? t('bank.deleteLabelCount', { count: usageCount }) : ''}${t('irreversible')}`}
          confirmLabel={t('delete')}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); onDelete(); onClose(); }}
        />
      )}
    </>
  );
}

export function DiffDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < level ? palette.amber : ink(0.15), display: 'inline-block' }} />)}
    </span>
  );
}

// Icônes des types de réponse — source unique, partagée avec le menu de types de
// l'éditeur de question (`InlineQuestionEditor`) pour qu'un type garde le même
// pictogramme partout. `qcs` reprend celle de `qcm` : c'est sa variante « réponse
// unique ». Le type de réponse s'affiche par cette icône seule dans la banque
// (09/08/2026) — la pilule textuelle mangeait une ligne entière pour une
// information que le pictogramme donne d'un coup d'œil ; le libellé complet reste
// au survol.
// `matching` prend `Route` et non `Link2` (12/08/2026) : le maillon servait déjà
// au lien de grappe (bouton « questions liées » des cartes de la banque), les deux
// pictogrammes se confondaient sur la même ligne.
export const RESPONSE_TYPE_ICONS: Record<ResponseType, LucideIcon> = {
  qcm: CheckSquare,
  qcs: CheckSquare,
  textuelle: AlignLeft,
  liste: List,
  tableau: Table,
  matching: Route,
  dessin: Palette,
  fichier: Paperclip,
  sans_reponse: File,
};

export function TypeIcon({ type, size = 14 }: { type: ResponseType; size?: number }) {
  const t = useTranslations('examen');
  const Icon = RESPONSE_TYPE_ICONS[type] ?? File;
  const c = RESPONSE_TYPE_COLORS[type] || palette.inkSoft;
  return (
    <span title={t(`responseType.${type}`)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 8, height: size + 8, borderRadius: 7, background: withAlpha(c, 0.22), color: palette.inkMuted }}>
      <Icon size={size} strokeWidth={1.75} />
    </span>
  );
}

// La pondération ne se règle plus depuis la gouttière de la feuille (elle
// encombrait la marge sans être lisible) : elle vit dans l'éditeur de question
// posé sur la copie — barème simple par défaut, malus/éliminatoire dans les
// paramètres avancés. Voir `InlineQuestionEditor`.

// Le statut « réponse incomplète » (pastille d'alerte sur la feuille, filtre de
// la banque, garde-fou avant enregistrement) a été retiré le 09/08/2026 : avec
// huit types de réponse dont plusieurs sans correction automatique (dessin,
// fichier, vide), « incomplet » ne voulait plus rien dire d'utile.

// une entrée aplatie est soit une vraie question, soit un repère « saut de page » (pseudo-question
// déplaçable comme une question mais jamais affichée/imprimée dans l'examen final)
export type FlatEntry = { sectionIdx: number; kind: 'question'; q: Question } | { sectionIdx: number; kind: 'pagebreak'; id: string };

export function flatEntryId(entry: FlatEntry): string {
  return entry.kind === 'pagebreak' ? entry.id : entry.q.id;
}

/** Bloc paginable de la copie : l'unité que la pagination pose sur une page ou
 *  renvoie à la suivante, et qu'elle ne coupe jamais en deux.
 *
 *  Une **question liée** est un bloc à part entière, au même titre que la
 *  question principale de sa grappe : une grappe trop longue s'étale donc sur
 *  deux pages au lieu de sauter la page en bloc (ou de déborder). Leur ordre,
 *  lui, ne bouge pas — il est fixé par la liste des blocs, et le glisser-déposer
 *  continue de déplacer la grappe entière (voir `flattenSections`). */
export type PageBlock = {
  /** clé de mesure dans `rowHeights` */
  key: string;
  sectionIdx: number;
  /** hauteur estimée tant que le bloc n'a pas été mesuré */
  fallbackHeight: number;
  /** repère « saut de page » : force le passage à la page suivante juste après lui */
  forcesBreakAfter?: boolean;
  /** Bloc qui ne peut pas ouvrir une page de son propre fait (il en ouvre quand
   *  même une si un saut de page le précède).
   *
   *  Réservé à la ligne en cours de modification : sa page s'étire pour porter le
   *  formulaire, elle n'a donc jamais besoin d'être renvoyée à la suivante. Sans
   *  ça, la hauteur du formulaire décide de sa propre page — et le moindre champ
   *  qui apparaît ou disparaît (une pénalité masquée par « éliminatoire », un
   *  énoncé qui passe à la ligne) la fait basculer d'une page à l'autre. Or
   *  changer de page, c'est changer de parent dans l'arbre React : le formulaire
   *  est démonté puis remonté, et repart de zéro — paramètres avancés refermés,
   *  et saisie en cours perdue. */
  neverStartsPage?: boolean;
};

// calcule les sauts de page A4 : pour chaque indice de bloc, indique si une nouvelle page commence
// à cet indice, et si l'en-tête de section affiché à cet endroit est une « (suite) » (saut au milieu
// d'une section).
export type PaginationInfo = { pageStarts: Set<number>; continuationStarts: Set<number>; pageCount: number };

export function computePagination(blocks: PageBlock[], rowHeights: Record<string, number>, firstPageReservedHeight = 0): PaginationInfo {
  const pageStarts = new Set<number>();
  const continuationStarts = new Set<number>();
  const maxUsable = A4_PAGE_HEIGHT - A4_MARGIN_PX; // marge basse non imprimable réservée sur chaque page
  let used = A4_MARGIN_PX + firstPageReservedHeight; // marge haute non imprimable réservée sur chaque page
  let curSection = -1;
  let forceBreakNext = false;
  blocks.forEach((block, bi) => {
    // Le titre de partie n'est pas un bloc : sa hauteur est portée par le
    // premier bloc de la partie, ce qui interdit de le laisser seul en bas d'une page.
    let extra = 0;
    if (block.sectionIdx !== curSection) {
      extra += A4_SECTION_HEADER_HEIGHT;
      curSection = block.sectionIdx;
    }
    const total = extra + (rowHeights[block.key] ?? block.fallbackHeight) + A4_ROW_GAP;
    // Le saut forcé reste honoré même pour un bloc `neverStartsPage` : il ne
    // dépend d'aucune hauteur, donc il ne peut pas osciller.
    const overflows = used + total > maxUsable && !block.neverStartsPage;
    if (bi > 0 && (forceBreakNext || overflows)) {
      pageStarts.add(bi);
      used = A4_MARGIN_PX;
      if (extra === 0) {
        continuationStarts.add(bi);
        used += A4_SECTION_HEADER_HEIGHT;
      }
    }
    forceBreakNext = block.forcesBreakAfter === true;
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

// Vue « question » d'une question liée, pour réutiliser tels quels les rendus
// qui prennent une `Question` (espace de réponse sur la copie, aperçu de la
// banque). Tout ce qui est propre à l'énoncé est repris de la question liée ;
// seuls les éléments communs (image, audio, libellés) restent ceux de la
// question principale. Voir `QuestionPart`.
export function partAsQuestion(q: Question, part: QuestionPart): Question {
  return {
    ...q,
    content: part.content,
    responseType: part.responseType,
    answer: part.answer,
    choices: part.choices,
    correctChoices: part.correctChoices,
    shuffleChoices: part.shuffleChoices,
    textLines: part.textLines,
    typeOptions: part.typeOptions,
    expectations: part.expectations,
    bloomLevel: part.bloomLevel,
    notionIds: part.notionIds,
    parts: [],
  };
}

// espace de réponse générique affiché dans l'aperçu A4 — proportionné/structuré selon le type de réponse.
export function renderAnswerSpace(q: Question) {
  const blankLines = (n: number) => (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: A4_ANSWER_LINE_GAP }}>
      {Array.from({ length: n }, (_, i) => <div key={i} style={{ height: A4_ANSWER_LINE_HEIGHT, borderBottom: `1px solid ${ink(0.18)}` }} />)}
    </div>
  );

  switch (q.responseType) {
    case 'sans_reponse':
      return null;
    case 'qcm':
    case 'qcs': {
      if (q.choices.length === 0) return blankLines(3);
      return (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {q.choices.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 14, height: 14, border: `1.5px solid ${ink(0.35)}`, borderRadius: q.responseType === 'qcm' ? 3 : 999, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ fontSize: 13, color: palette.inkMuted }}>{c}</span>
            </div>
          ))}
        </div>
      );
    }
    // L'élève relie les points : l'élément est collé à gauche de son point
    // (texte aligné à droite), la correspondance collée à droite du sien
    // (texte aligné à gauche). Pas de numérotation — ce sont les traits tracés
    // d'un point à l'autre qui font la réponse. Le partage gauche/droite suit
    // le curseur réglé dans l'éditeur (5 % → 95 %).
    case 'matching': {
      if (q.choices.length === 0) return blankLines(3);
      const pairs = q.choices.map(c => c.split(' :: '));
      const split = Math.min(Math.max(q.typeOptions?.matchSplit ?? MATCH_SPLIT_DEFAULT, MATCH_SPLIT_MIN), MATCH_SPLIT_MAX);
      const PAIR_LINE = 18;
      // Vide de part et d'autre de la ligne de partage : c'est là que l'élève
      // trace ses traits, les deux points ne doivent pas se toucher. Symétrique,
      // donc la proportion des colonnes reste celle du curseur de l'éditeur.
      const PAIR_DOT_GUTTER = 26;
      // Grille à deux colonnes plutôt que deux colonnes indépendantes : les deux
      // cases d'une paire partagent la même rangée, donc elles commencent
      // toujours à la même hauteur et l'écart entre rangées reste constant même
      // quand une correspondance est vide. Le texte passe à la ligne (comme dans
      // l'éditeur) au lieu de déborder sur le point.
      const cell = (text: string, side: 'left' | 'right') => (
        <div style={{ minWidth: 0, boxSizing: 'border-box' as const, display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: side === 'left' ? 'flex-end' : 'flex-start', paddingRight: side === 'left' ? PAIR_DOT_GUTTER : 0, paddingLeft: side === 'right' ? PAIR_DOT_GUTTER : 0 }}>
          {side === 'right' && <span style={{ flexShrink: 0, width: 7, height: 7, marginTop: (PAIR_LINE - 7) / 2, borderRadius: '50%', background: ink(0.45) }} />}
          <span style={{ minWidth: 0, fontSize: 13, lineHeight: `${PAIR_LINE}px`, color: palette.inkMuted, textAlign: side === 'left' ? 'right' as const : 'left' as const, overflowWrap: 'anywhere' as const }}>{text}</span>
          {side === 'left' && <span style={{ flexShrink: 0, width: 7, height: 7, marginTop: (PAIR_LINE - 7) / 2, borderRadius: '50%', background: ink(0.45) }} />}
        </div>
      );
      return (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: `${split * 100}% 1fr`, rowGap: 14 }}>
          {pairs.map((p, i) => (
            <Fragment key={i}>
              {cell(p[0] ?? '', 'left')}
              {cell(p[1] ?? '', 'right')}
            </Fragment>
          ))}
        </div>
      );
    }
    // Liste : autant de lignes à remplir que de réponses attendues, numérotées
    // si l'option l'est. Le contenu saisi côté éditeur est la référence de
    // correction, il ne s'imprime pas sur la copie de l'élève.
    case 'liste': {
      const expected = Math.max(1, q.typeOptions?.listExpected ?? q.choices.filter(c => c.trim()).length ?? 3);
      const numbered = q.typeOptions?.listNumbered ?? true;
      return (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: A4_ANSWER_LINE_GAP }}>
          {Array.from({ length: expected }, (_, i) => (
            <div key={i} style={{ height: A4_ANSWER_LINE_HEIGHT, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              {numbered && <span style={{ fontSize: 12, lineHeight: 1.2, color: palette.inkFaint, flexShrink: 0 }}>{i + 1}.</span>}
              <div style={{ flex: 1, borderBottom: `1px solid ${ink(0.18)}` }} />
            </div>
          ))}
        </div>
      );
    }
    // Tableau : la grille à cocher telle que l'élève la reçoit — cases vides,
    // rondes si une seule réponse par ligne est permise.
    case 'tableau': {
      const rows = q.typeOptions?.tableRows ?? [];
      const cols = q.typeOptions?.tableCols ?? [];
      if (rows.length === 0 || cols.length === 0) return blankLines(3);
      const unique = q.typeOptions?.tableUnique ?? false;
      return (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ flex: '0 0 130px' }} />
            {cols.map((c, ci) => (
              <div key={ci} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' as const, fontSize: 12, fontWeight: 600, color: palette.inkMuted }}>{c}</div>
            ))}
          </div>
          {rows.map((r, ri) => (
            <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: '0 0 130px', fontSize: 13, color: palette.inkMuted }}>{r}</div>
              {cols.map((_c, ci) => (
                <div key={ci} style={{ flex: '1 1 0', display: 'flex', justifyContent: 'center' }}>
                  <span style={{ width: 16, height: 16, border: `1.5px solid ${ink(0.35)}`, borderRadius: unique ? 999 : 3, display: 'inline-block' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
    case 'dessin':
      return <div style={{ marginTop: 14, height: 180, border: `1px dashed ${ink(0.22)}`, borderRadius: 6 }} />;
    // Fichier : le dépôt se fait hors de la copie — une seule ligne pour noter
    // le nom du fichier rendu ou le lien.
    case 'fichier':
      return <div style={{ marginTop: 14, height: 44, border: `1px dashed ${ink(0.22)}`, borderRadius: 6 }} />;
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
    subtitle: config.subtitle ?? '',
    titleIncluded: config.titleIncluded ?? true,
    // Les copies enregistrées avant l'ajout du barème l'affichent : c'est la
    // mise en page attendue d'un sujet d'examen, et les deux réglages se
    // décochent d'un clic dans « personnaliser ».
    showQuestionPoints: config.showQuestionPoints ?? true,
    showSectionPoints: config.showSectionPoints ?? true,
    presentation: {
      identity: {
        nom: normalizeIdentitySide(rawIdentity.nom, 'left'),
        prenom: normalizeIdentitySide(rawIdentity.prenom, 'left'),
        tag: normalizeIdentitySide(rawIdentity.tag, 'left'),
        classe: normalizeIdentitySide(rawIdentity.classe, 'left'),
        date: normalizeIdentitySide(rawIdentity.date, 'right'),
        bareme: normalizeIdentitySide(rawIdentity.bareme, 'right'),
      },
      customFields,
      identityOrder: [...saved, ...missing],
    },
  };
}

/** Ne garde dans les parties (et la pondération) que les identifiants acceptés par `keep`. */
export function pruneUnknownQuestions(config: ExamConfig, keep: (id: string) => boolean): ExamConfig {
  const sections = config.sections.map(sec => ({ ...sec, questionIds: sec.questionIds.filter(keep) }));
  const weighting = Object.fromEntries(
    Object.entries(config.weighting).filter(([key]) => keep(key.split('::')[0])),
  );
  return { ...config, sections, weighting };
}

export function defaultPresentation(): ExamPresentation {
  return { identity: { nom: 'left', prenom: 'left', tag: 'left', classe: 'hidden', date: 'right', bareme: 'right' }, identityOrder: [...DEFAULT_IDENTITY_ORDER], customFields: [] };
}

export function defaultExamConfig(title?: string): ExamConfig {
  return {
    title: title ?? '',
    subtitle: '',
    titleIncluded: true,
    durationMinutes: 120,
    showQuestionPoints: true,
    showSectionPoints: true,
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

/** Signature de ce qu'un en-tête donne à voir : le contenu ordonné de chacune de
 *  ses deux colonnes, telles qu'elles sont rendues.
 *
 *  Deux choses en sont volontairement absentes, parce qu'elles ne se voient pas
 *  sur la copie : les champs masqués, et la façon dont les deux colonnes
 *  s'entrelacent dans `identityOrder`. Ce dernier point compte — sortir puis
 *  remettre une pilule la renvoie en fin d'ordre global, ce qui réordonne
 *  l'entrelacement sans déplacer quoi que ce soit à l'écran. */
function presentationSignature(p: ExamPresentation): string {
  const sideOf = (id: string): IdentitySide => IDENTITY_KEY_SET.has(id)
    ? p.identity[id as keyof CandidateIdentity]
    : p.customFields.find(f => f.id === id)?.side ?? 'hidden';
  const labelOf = (id: string): string => IDENTITY_KEY_SET.has(id)
    ? id
    : p.customFields.find(f => f.id === id)?.label ?? '';
  const column = (side: IdentitySide) => p.identityOrder
    .filter(id => sideOf(id) === side)
    .map(id => `${id}:${labelOf(id)}`)
    .join(',');
  return `L[${column('left')}]R[${column('right')}]`;
}

/** Les deux en-têtes affichent-ils exactement la même chose ? */
export function isSamePresentation(a: ExamPresentation, b: ExamPresentation): boolean {
  return presentationSignature(a) === presentationSignature(b);
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

// ---- gabarit commun des cartes de liste (banque de questions ET historique
// d'examens, pour que les deux colonnes aient exactement la même trame) :
// trois lignes de texte, pas une de plus. Tout est calé sur `CARD_LINE` —
// hauteur des icônes (1 ligne), du bloc de boutons (2 lignes) et de la carte
// elle-même (3 lignes + marges). Les mesures internes ne sortent pas d'ici :
// les listes passent par `ListCard`, qui est le seul point d'entrée. ----
export const CARD_LINE = 20;
export const CARD_ACTION_BTN = 30;
const CARD_PAD_X = 11;
const CARD_PAD_Y = 9;
const CARD_ACTION_GAP = 8;
// gouttière réservée à droite des lignes 2 et 3 : 2 boutons + leur écart + une marge
const CARD_ACTIONS_W = 2 * CARD_ACTION_BTN + CARD_ACTION_GAP + 6;
/** Hauteur laissée libre en haut de la cale flottante des boutons : c'est ce qui
 *  permet à la PREMIÈRE ligne du titre de passer devant eux (ils ne descendent
 *  qu'à partir de la deuxième). `CARD_LINE + 2` et non `CARD_LINE` tout rond :
 *  la colonne est mise à l'échelle (`--exam-list-zoom`), et à certaines échelles
 *  — 0,87 exactement, mesuré — l'arrondi sous-pixel plaçait le haut de la forme
 *  juste au-dessus du bas de la première ligne, qui se faisait alors repousser
 *  comme la seconde : le texte s'arrêtait au milieu de la carte. Les 2px de jeu
 *  restent très en deçà de la deuxième ligne, qui continue de contourner la
 *  cale à toutes les échelles. */
const CARD_ACTIONS_SHAPE_TOP = CARD_LINE + 2;

/** Énoncé/titre de la carte, coupé à deux lignes avec « … » quand il déborde.
 *
 *  Les points de suspension suivent le dernier mot affiché, séparés par une
 *  espace — pas collés au bord droit de la ligne. Ni `-webkit-line-clamp`, ni un
 *  « … » posé en absolu ne savent faire ça : le premier impose
 *  `display: -webkit-box`, où le flottant qui réserve la place des boutons cesse
 *  d'en être un (les enfants deviennent des items de boîte), le second se pose
 *  là où on l'ancre et pas là où le texte s'arrête.
 *
 *  Donc on cherche la coupe : recherche dichotomique sur le nombre de mots, en
 *  mesurant chaque candidat **suffixé de « … »** dans une sonde hors écran qui
 *  rejoue exactement la mise en page réelle (largeur, typographie, retrait de
 *  première ligne, cale flottante). Mesurer avec les points inclus est ce qui
 *  fait qu'un mot de plus saute quand ils ne tiennent pas. Repli caractère par
 *  caractère quand un seul mot déborde déjà.
 *
 *  La mesure est rejouée à chaque rendu et à chaque changement de largeur de la
 *  colonne (`ResizeObserver`), gardée par une comparaison pour ne pas boucler. */
function ClampedTitle({ text, indent }: { text: string; indent: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(text);
  // Largeur courante de la colonne, seule entrée variable de la mesure. Elle
  // passe par un état : le `ResizeObserver` la met à jour, ce qui redéclenche la
  // mesure quand le panneau est redimensionné (un rendu seul ne suffirait pas).
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `observe()` déclenche déjà un premier appel avec la taille initiale
    const obs = new ResizeObserver(() => setWidth(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !width) return;
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.cssText = [
      'position:absolute', 'top:0', 'left:-99999px', 'visibility:hidden', 'pointer-events:none',
      `width:${width}px`, `font:${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`,
      `letter-spacing:${cs.letterSpacing}`, `text-indent:${indent}px`, 'white-space:normal', 'overflow-wrap:anywhere',
    ].join(';');
    const spacer = document.createElement('span');
    spacer.style.cssText = `float:right;width:${CARD_ACTIONS_W}px;height:${2 * CARD_LINE}px;shape-outside:inset(${CARD_ACTIONS_SHAPE_TOP}px 0 0 0)`;
    const node = document.createTextNode('');
    probe.append(spacer, node);
    document.body.appendChild(probe);
    const fits = (s: string) => { node.nodeValue = s; return probe.scrollHeight <= 2 * CARD_LINE + 1; };

    let next = text;
    if (!fits(text)) {
      const words = text.split(/\s+/).filter(Boolean);
      // plus grand nombre de mots qui tient, points de suspension compris
      let lo = 0, hi = words.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(`${words.slice(0, mid).join(' ')} …`)) lo = mid; else hi = mid - 1;
      }
      if (lo > 0) {
        next = `${words.slice(0, lo).join(' ')} …`;
      } else {
        // même le premier mot déborde : on le coupe en plein milieu, faute de mieux
        let clo = 0, chi = text.length;
        while (clo < chi) {
          const mid = Math.ceil((clo + chi) / 2);
          if (fits(`${text.slice(0, mid)} …`)) clo = mid; else chi = mid - 1;
        }
        next = clo > 0 ? `${text.slice(0, clo)} …` : '…';
      }
    }
    document.body.removeChild(probe);
    if (next !== display) setDisplay(next);
  });

  return (
    <div
      ref={ref}
      title={text}
      style={{
        position: 'relative' as const, fontSize: 13, fontWeight: 600, color: palette.ink,
        lineHeight: `${CARD_LINE}px`, height: 2 * CARD_LINE, textIndent: indent, overflow: 'hidden',
        overflowWrap: 'anywhere' as const,
      }}
    >
      {/* Cale flottante qui réserve la place des boutons. Un simple `margin-top`
          ne suffit pas : les lignes contournent la boîte de MARGE du flottant,
          donc la 1re ligne était raccourcie elle aussi. `shape-outside` limite
          l'exclusion à la moitié basse — la 1re ligne court jusqu'au bord de la
          carte, seule la 2e s'arrête avant les boutons. */}
      <span style={{ float: 'right' as const, width: CARD_ACTIONS_W, height: 2 * CARD_LINE, shapeOutside: `inset(${CARD_ACTIONS_SHAPE_TOP}px 0 0 0)` }} />
      {display}
    </div>
  );
}

/** Carte d'une des deux listes de l'onglet. Elle fixe la trame — trois lignes,
 *  titre coupé sur les lignes 1-2, complément sur la ligne 3, bloc de boutons
 *  ancré en bas à droite — et chaque liste ne fournit que son contenu :
 *
 *  - `leading` : ce qui précède le titre sur la 1re ligne (icônes de type…) ;
 *    `indent` dit de combien la 1re ligne du titre s'écarte pour le contourner.
 *  - `meta` : la 3e ligne (libellés de la question, décompte de l'examen…).
 *  - `actions` : les boutons du coin bas droit, déjà protégés du clic de carte.
 *  - `tint` : teinte translucide d'un état particulier (posée sur la feuille,
 *    tout juste créée…), avec `borderColor` assorti.
 *  - `children` : le détail déplié, sous le bloc de trois lignes. */
export function ListCard({ onClick, tint, borderColor, leading, indent = 0, title, meta, actions, children }: {
  onClick?: () => void;
  tint?: string;
  borderColor?: string;
  leading?: React.ReactNode;
  indent?: number;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', padding: `${CARD_PAD_Y}px ${CARD_PAD_X}px`, borderRadius: 12,
        background: tint ?? palette.surfaceRaised,
        // Carte sans contour : c'est son fond, plus clair que le crème de la
        // page, qui la détache — la colonne n'a plus ni cadre ni panneau. La
        // bordure ne sert plus qu'aux états qui en demandent un (carte déjà
        // posée sur la feuille), et reste transparente sinon pour que les deux
        // états gardent exactement la même géométrie.
        border: `1px solid ${borderColor ?? 'transparent'}`,
      }}
    >
      <div style={{ position: 'relative' as const, height: 3 * CARD_LINE }}>
        {leading && (
          /* `zIndex` obligatoire : `ClampedTitle` est en `position: relative` et
             vient après dans le DOM, donc il se peint par-dessus les icônes et
             avalait leurs clics (le bouton « questions liées » basculait la carte
             dans le brouillon au lieu de déplier la grappe). */
          <div style={{ position: 'absolute' as const, zIndex: 1, top: 0, left: 0, height: CARD_LINE, display: 'flex', alignItems: 'center', gap: 4 }}>{leading}</div>
        )}
        <ClampedTitle text={title} indent={indent} />
        <div style={{ height: CARD_LINE, paddingRight: CARD_ACTIONS_W, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>{meta}</div>
        {actions && (
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute' as const, right: 0, bottom: 0, height: 2 * CARD_LINE, display: 'flex', alignItems: 'center', gap: CARD_ACTION_GAP }}>{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}

/** `active` : l'action du bouton est déjà en cours (question en cours de
 *  modification) — l'icône et le liseré passent au vert, jamais le fond. */
export function IconBtn({ children, title, onClick, size = 32, active = false }: { children: React.ReactNode; title: string; onClick?: (e: React.MouseEvent) => void; size?: number; active?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{ width: size, height: size, borderRadius: 9, border: `1px solid ${active ? palette.green : palette.lineStrong}`, background: palette.surfaceRaised, color: active ? palette.greenBrand : palette.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>{children}</button>
  );
}

// bouton « modifier la question » dans l'aperçu de l'éditeur d'examen — le cercle
// n'apparaît qu'au survol, pour indiquer que le bouton est cliquable. Quand la
// question est ouverte dans le formulaire en ligne (`active`), seule l'icône
// passe au vert (pas le fond) et le bouton annule la modification.
export function EditQuestionButton({ id, onOpenQuestion, active = false }: { id: string; onOpenQuestion: (id: string) => void; active?: boolean }) {
  const t = useTranslations('examen');
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onOpenQuestion(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={active ? t('cancelEditQuestion') : t('editQuestion')}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: hovered ? `1px solid ${ink(0.14)}` : '1px solid transparent', background: hovered ? ink(0.045) : 'transparent', color: active ? palette.greenBrand : hovered ? palette.inkSoft : palette.inkFaint, cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'background 0.12s, border-color 0.12s' }}
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
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '5px 6px 5px 11px', borderRadius: 999, border: negative ? `1px solid ${withAlpha(palette.danger, 0.45)}` : `1px solid ${ink(0.30)}`, background: negative ? palette.danger : palette.ink, color: palette.parchment, fontFamily: 'inherit', cursor: 'grab', clipPath: 'inset(0 round 999px)' }}
    >
      {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />}
      {label}
      <button onClick={onRemove} style={{ border: 'none', background: 'none', color: palette.parchment, cursor: 'pointer', fontSize: 13, padding: '0 4px', lineHeight: 1, opacity: 0.7 }}>×</button>
    </span>
  );
}
