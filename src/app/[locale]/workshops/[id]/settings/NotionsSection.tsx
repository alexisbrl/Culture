'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, EllipsisVertical, EyeOff, GripVertical, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { palette, shadow, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import AiGenerationButton from '@/components/ai/AiGenerationButton';
import ImportBanner from '@/components/ai/ImportBanner';
import {
  createWorkshopNotion,
  updateWorkshopNotion,
  deleteWorkshopNotion,
  moveWorkshopNotion,
  type Notion,
} from '@/app/actions/workshopNotions';
import {
  createWorkshopChapter,
  renameWorkshopChapter,
  restoreWorkshopChapter,
  deleteWorkshopChapter,
  reorderWorkshopChapters,
  type Chapter,
} from '@/app/actions/workshopChapters';
import { SmallBtn } from './settingsShared';
import { Tooltip } from '@/components/ui/tooltip';
import { ClippedText } from '@/components/ui/clipped-text';
import { SelectMenu } from '../tabs/examen/examShared';
import { NOTION_TITLE_MAX } from '@/lib/workshops/notions';

/** Hauteur commune aux lignes des deux colonnes, pour qu'elles se répondent
 *  d'une colonne à l'autre. C'est la hauteur naturelle d'une ligne de chapitre :
 *  8 + 21 (nom) + 1 + 18 (compte de notions) + 8. Une notion n'ayant qu'un
 *  titre, la place ainsi libérée lui sert à l'écrire sur deux lignes. */
const ROW_MIN_HEIGHT = 56;

type Props = {
  workshopId: string;
  notions: Notion[];
  chapters: Chapter[];
};

// Pseudo-identifiant du groupe « sans chapitre » dans la colonne de sélection —
// distinct de `null` (qui, lui, signifie « aucune sélection », cas atteint
// seulement à zéro chapitre ET zéro notion non rangée).
const UNASSIGNED = '__unassigned__' as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 9,
  border: `1px solid ${palette.lineStrong}`,
  background: palette.surfaceInput,
  color: palette.ink,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

// La zone de saisie d'une notion grandit avec son texte, jusqu'à 6 lignes ;
// au-delà, elle défile. `LINE` doit rester égal au `lineHeight` posé sur la
// zone, et `PADDING` aux deux moitiés de son remplissage vertical (`inputStyle`)
// — c'est ce que `scrollHeight` mesure.
/** Mise en page des formulaires de chapitre (ajout, renommage), reprise de
 *  celle d'une notion en édition : le champ sur toute la largeur, les actions
 *  rangées en dessous à droite. Sur une seule ligne, le champ n'avait plus la
 *  place d'afficher ce qu'on y tapait dès que les deux boutons étaient là. */
const chapterFormStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
};

/** Une ligne « il n'y a rien ici » est une ligne comme une autre : même
 *  hauteur que les vraies, sans quoi la carte se tasse dès qu'elle est vide et
 *  les deux colonnes ne se répondent plus. */
const emptyRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: ROW_MIN_HEIGHT, padding: '6px 14px',
  fontSize: 13, color: palette.inkMuted, textAlign: 'center',
};

const NOTION_LINE_HEIGHT = 20;
const NOTION_MAX_LINES = 6;
const NOTION_TEXTAREA_MAX = NOTION_MAX_LINES * NOTION_LINE_HEIGHT + 18;

// Formulaire partagé ajout/édition d'une notion : un seul texte (requis) et le
// chapitre (optionnel). Le texte est saisi dans une zone multi-lignes — c'est
// une phrase, pas un intitulé — et c'est ce même texte que la liste affiche.
//
// Le chapitre passe par `SelectMenu` et non par un `<select>` natif : le déroulé
// natif est peint par le système, il sortait de la page et n'avait aucun rapport
// avec la palette. Le panneau maison se place sous le bouton, borné à la fenêtre.
// Le glisser-déposer d'une notion sur un chapitre fait la même chose en un
// geste, mais ce choix reste : il sert quand les deux colonnes ne sont pas
// visibles ensemble (téléphone) et à la création, avant que la notion existe.
function NotionForm({
  initialText,
  initialChapterId,
  chapters,
  saving,
  onSave,
  onCancel,
}: {
  initialText: string;
  initialChapterId: string | null;
  chapters: Chapter[];
  saving: boolean;
  onSave: (text: string, chapterId: string | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('settings');
  const [text, setText] = useState(initialText);
  const [chapterId, setChapterId] = useState<string>(initialChapterId ?? '');
  const chapterLabel = chapters.find((c) => c.id === chapterId)?.name ?? t('notions.noChapter');

  // Hauteur ajustée au texte, écrite directement sur le nœud : la passer par un
  // state relancerait un rendu à chaque frappe pour une valeur que seul le DOM
  // consomme. Remise à `auto` avant la mesure — sinon `scrollHeight` reste
  // bloqué sur la hauteur déjà posée et la zone ne rétrécit jamais.
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fitHeight = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, NOTION_TEXTAREA_MAX) + 2}px`;  // + les deux filets
    el.style.overflowY = el.scrollHeight > NOTION_TEXTAREA_MAX ? 'auto' : 'hidden';
  }, []);
  // Sans tableau de dépendances : la frappe, le texte initial et le montage
  // passent tous par un rendu.
  useLayoutEffect(fitHeight);
  // La largeur, elle, peut changer sans rendu (fenêtre redimensionnée) et le
  // texte se replie alors sur un nombre de lignes différent. On ne réagit qu'à
  // la LARGEUR : réagir à la hauteur ferait boucler l'observateur, puisque c'est
  // nous qui la modifions.
  const lastWidth = useRef(0);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      if (!textRef.current || textRef.current.clientWidth === lastWidth.current) return;
      lastWidth.current = textRef.current.clientWidth;
      fitHeight();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fitHeight]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('notions.textPlaceholder')}
        maxLength={NOTION_TITLE_MAX}
        rows={1}
        autoFocus
        // `resize: none` : la zone se dimensionne elle-même, une poignée de
        // redimensionnement serait reprise dès la frappe suivante.
        style={{ ...inputStyle, lineHeight: `${NOTION_LINE_HEIGHT}px`, resize: 'none' }}
      />
      <SelectMenu
        items={[
          { value: '', label: t('notions.noChapter') },
          // Pas les chapitres écartés : on ne range pas dans une boîte mise de
          // côté. Pour y remettre une notion, on restaure d'abord le chapitre.
          ...chapters.filter((c) => !c.hidden).map((c) => ({ value: c.id, label: c.name })),
        ]}
        value={chapterId}
        onSelect={(next) => setChapterId(next)}
        title={t('notions.chapterLabel')}
        panelWidth="trigger"
        triggerStyle={{
          ...inputStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chapterLabel}
        </span>
        <ChevronDown size={14} strokeWidth={2} style={{ flexShrink: 0, color: palette.inkFaint }} />
      </SelectMenu>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SmallBtn tone="ghost" onClick={onCancel} disabled={saving}>{t('notions.cancel')}</SmallBtn>
        <SmallBtn tone="dark" onClick={() => onSave(text, chapterId || null)} disabled={saving || !text.trim()}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : t('notions.save')}
        </SmallBtn>
      </div>
    </div>
  );
}

export default function NotionsSection({ workshopId, notions: initialNotions, chapters: initialChapters }: Props) {
  const t = useTranslations('settings');
  const [notions, setNotions] = useState<Notion[]>(initialNotions);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Notion | null>(null);

  // Chapitres
  const [addingChapter, setAddingChapter] = useState(false);
  const [chapterName, setChapterName] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterName, setEditingChapterName] = useState('');
  const [chapterSaving, setChapterSaving] = useState(false);
  const [chapterDeleteTarget, setChapterDeleteTarget] = useState<Chapter | null>(null);

  // Colonne de droite : chapitre sélectionné (deux colonnes, lignes 1717-1786 de
  // la maquette). `UNASSIGNED` sélectionne le groupe « sans chapitre » — un cas
  // que la maquette ne modélise pas (ses notions vivent toujours dans un
  // chapitre), mais qu'on doit garder accessible pour ne rien casser côté réel.
  const [selectedChapterId, setSelectedChapterId] = useState<string | typeof UNASSIGNED | null>(
    initialChapters[0]?.id ?? (initialNotions.some((n) => !n.chapterId) ? UNASSIGNED : null)
  );

  // ─── Notions ──────────────────────────────────────────────────────────────

  async function handleCreate(text: string, chapterId: string | null) {
    setSaving(true);
    setError('');
    const result = await createWorkshopNotion(workshopId, text, chapterId);
    setSaving(false);
    if (result.success && result.notion) {
      const notion = result.notion;
      setNotions((prev) => [...prev, notion]);
      bumpChapterCount(chapterId, +1);
      setAdding(false);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleUpdate(notionId: string, text: string, chapterId: string | null) {
    const previous = notions.find((n) => n.id === notionId);
    setSaving(true);
    setError('');
    const result = await updateWorkshopNotion(workshopId, notionId, text, chapterId);
    setSaving(false);
    if (result.success) {
      setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, title: text.trim(), chapterId } : n)));
      if (previous && previous.chapterId !== chapterId) {
        bumpChapterCount(previous.chapterId, -1);
        bumpChapterCount(chapterId, +1);
      }
      setEditingId(null);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setError('');
    const result = await deleteWorkshopNotion(workshopId, target.id);
    setDeleteTarget(null);
    if (result.success) {
      setNotions((prev) => prev.filter((n) => n.id !== target.id));
      bumpChapterCount(target.chapterId, -1);
      if (editingId === target.id) setEditingId(null);
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  function bumpChapterCount(chapterId: string | null, delta: number) {
    if (!chapterId) return;
    setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, notionCount: Math.max(0, c.notionCount + delta) } : c)));
  }

  // ─── Chapitres ────────────────────────────────────────────────────────────

  async function handleCreateChapter() {
    if (!chapterName.trim()) return;
    setChapterSaving(true);
    setError('');
    const result = await createWorkshopChapter(workshopId, chapterName);
    setChapterSaving(false);
    if (result.success && result.chapter) {
      const chapter = result.chapter;
      setChapters((prev) => [...prev, chapter]);
      setChapterName('');
      setAddingChapter(false);
      setSelectedChapterId(chapter.id);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleRenameChapter(chapterId: string) {
    if (!editingChapterName.trim()) return;
    setChapterSaving(true);
    setError('');
    const name = editingChapterName.trim();
    const result = await renameWorkshopChapter(workshopId, chapterId, name);
    setChapterSaving(false);
    if (result.success) {
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, name } : c)));
      setEditingChapterId(null);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleDeleteChapter() {
    if (!chapterDeleteTarget) return;
    const target = chapterDeleteTarget;
    setError('');
    const result = await deleteWorkshopChapter(workshopId, target.id);
    setChapterDeleteTarget(null);
    if (result.success) {
      setChapters((prev) => prev.filter((c) => c.id !== target.id));
      // Les notions du chapitre ne sont pas supprimées : elles retombent dans
      // « sans chapitre » (FK en `on delete set null`).
      setNotions((prev) => prev.map((n) => (n.chapterId === target.id ? { ...n, chapterId: null } : n)));
      // Où atterrir quand c'est le chapitre affiché qu'on vient de supprimer.
      // La règle suit ce qui s'est réellement passé, elle n'est pas un repli
      // par défaut : basculer systématiquement sur « sans chapitre » plantait
      // l'écran sur un groupe VIDE quand on supprimait un chapitre sans notion
      // — et comme l'entrée « sans chapitre » ne s'affiche que si elle contient
      // quelque chose *ou* si elle est sélectionnée, elle n'apparaissait alors
      // que parce qu'on venait de la sélectionner. Le rechargement réparait
      // l'affichage, ce qui est la signature d'un état client incohérent.
      if (selectedChapterId === target.id) {
        const index = chapters.findIndex((c) => c.id === target.id);
        const remaining = chapters.filter((c) => c.id !== target.id);
        const orphans = notions.some((n) => n.chapterId === target.id || !n.chapterId);
        if (notions.some((n) => n.chapterId === target.id)) {
          // Des notions viennent de retomber dans « sans chapitre » : y aller,
          // c'est montrer où elles sont parties.
          setSelectedChapterId(UNASSIGNED);
        } else if (remaining.length > 0) {
          // Rien n'a bougé : prendre la place laissée vide — le chapitre suivant,
          // ou le précédent si on supprimait le dernier de la liste.
          setSelectedChapterId(remaining[Math.min(index, remaining.length - 1)].id);
        } else {
          // Plus aucun chapitre : « sans chapitre » seulement s'il y a vraiment
          // des notions à y voir, sinon aucune sélection (l'écran invite alors
          // à créer un chapitre).
          setSelectedChapterId(orphans ? UNASSIGNED : null);
        }
      }
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  // Réordonnancement par glisser-déposer (poignée à 6 points, maquette ligne
  // 1728-1732) : le drop réinsère le chapitre saisi à la position visée puis
  // persiste l'ordre complet. L'index saisi vit dans un ref (le state ne sert
  // qu'au style) : le handler de drop de la ligne cible a été attaché avant le
  // re-render déclenché par le dragstart, sa closure ne voit donc pas le state.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  function startChapterDrag(index: number | null) {
    dragIndexRef.current = index;
    setDragIndex(index);
  }

  // Glisser-déposer d'une NOTION sur un chapitre : le geste range la notion,
  // il ne réordonne rien. Les deux glissements arrivent sur les mêmes lignes de
  // chapitre, d'où deux références distinctes — celle qui est renseignée dit de
  // quel geste il s'agit. Même raison qu'au-dessus pour le ref plutôt que le
  // state : le `onDrop` de la ligne cible a été attaché avant le rendu déclenché
  // par le `dragstart`.
  const [dragNotionId, setDragNotionId] = useState<string | null>(null);
  const dragNotionRef = useRef<string | null>(null);
  // Ligne de chapitre survolée par la notion en cours de glissement — c'est le
  // seul retour visuel qui dit où le lâcher va la ranger.
  const [dropChapterId, setDropChapterId] = useState<string | typeof UNASSIGNED | null>(null);

  function startNotionDrag(id: string | null) {
    dragNotionRef.current = id;
    setDragNotionId(id);
    if (!id) setDropChapterId(null);
  }

  async function handleDropNotion(chapterId: string | null) {
    const notionId = dragNotionRef.current;
    startNotionDrag(null);
    if (!notionId) return;

    const notion = notions.find((n) => n.id === notionId);
    if (!notion || notion.chapterId === chapterId) return;

    const from = notion.chapterId;
    setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, chapterId } : n)));
    bumpChapterCount(from, -1);
    bumpChapterCount(chapterId, +1);
    setError('');

    const result = await moveWorkshopNotion(workshopId, notionId, chapterId);
    if (!result.success) {
      setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, chapterId: from } : n)));
      bumpChapterCount(chapterId, -1);
      bumpChapterCount(from, +1);
      setError(result.error ?? t('err.save'));
    }
  }

  // Retour visuel du survol, posé sur la ligne visée. Le `onDrop`, lui, reste à
  // la charge de chaque ligne : celle d'un chapitre doit encore départager les
  // deux gestes possibles.
  function dropHoverProps(target: string | typeof UNASSIGNED) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        // Seul le glissement d'une notion allume la cible : un chapitre qu'on
        // réordonne se signale déjà par sa propre ligne en transparence. L'état
        // suffit ici (le rendu qui suit le `dragstart` a eu lieu bien avant
        // qu'on survole une autre ligne), là où le lâcher a besoin du ref.
        if (dragNotionId) setDropChapterId((prev) => (prev === target ? prev : target));
      },
      onDragLeave: () => setDropChapterId((prev) => (prev === target ? null : prev)),
    };
  }

  async function handleDropOnChapter(targetIndex: number) {
    const from = dragIndexRef.current;
    startChapterDrag(null);
    if (from === null || from === targetIndex) return;

    const reordered = [...chapters];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(targetIndex, 0, moved);
    const previous = chapters;
    setChapters(reordered);
    setError('');

    const result = await reorderWorkshopChapters(workshopId, reordered.map((c) => c.id));
    if (!result.success) {
      setChapters(previous); // rollback : l'ordre affiché doit refléter la base
      setError(result.error ?? t('err.save'));
    }
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const unassignedNotions = notions.filter((n) => !n.chapterId || !chapters.some((c) => c.id === n.chapterId));
  const showUnassignedEntry = unassignedNotions.length > 0 || selectedChapterId === UNASSIGNED;
  // Les chapitres écartés vivent SOUS les autres, jamais mêlés à eux : c'est ce
  // qui rend un changement d'atelier lisible d'un coup d'œil.
  const hiddenChapters = chapters.filter((c) => c.hidden);

  async function handleRestoreChapter(chapterId: string) {
    setChapterSaving(true);
    const result = await restoreWorkshopChapter(workshopId, chapterId);
    setChapterSaving(false);
    if (!result.success) return setError(result.error ?? t('chapters.restoreFailed'));
    setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, hidden: false } : c)));
    setSelectedChapterId(chapterId);
  }
  const activeNotions = selectedChapterId === UNASSIGNED
    ? unassignedNotions
    : notions.filter((n) => n.chapterId === selectedChapterId);
  // Menu ⋮ d'une ligne (chapitre ou notion) : « modifier » et « supprimer »,
  // là où les deux listes alignaient un crayon et une corbeille. Deux cibles de
  // 32px par ligne coûtaient 70px de largeur dans des colonnes déjà étroites,
  // pour des actions qu'on ne déclenche qu'occasionnellement.
  //
  // `stopPropagation` sur l'enveloppe : la ligne d'un chapitre est cliquable
  // (elle le sélectionne), et ouvrir son menu n'est pas le choisir. Le clic-
  // dehors du panneau, lui, est écouté sur `document` en capture — il n'est pas
  // concerné.
  function rowMenu({ label, onEdit, onDelete, editLabel, deleteLabel }: {
    label: string; onEdit: () => void; onDelete: () => void; editLabel: string; deleteLabel: string;
  }) {
    return (
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexShrink: 0 }}>
        <SelectMenu
          items={[
            { value: 'edit', label: editLabel, icon: <Pencil size={14} strokeWidth={2} /> },
            { value: 'delete', label: deleteLabel, tone: 'danger', icon: <Trash2 size={14} strokeWidth={2} /> },
          ]}
          onSelect={(action) => { if (action === 'edit') onEdit(); else onDelete(); }}
          title={label}
          triggerLabel={label}
          panelWidth="auto"
          align="right"
          triggerStyle={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, padding: 0, borderRadius: 9,
            border: 'none', background: 'transparent', color: palette.inkMuted,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <EllipsisVertical size={15} strokeWidth={1.75} />
        </SelectMenu>
      </span>
    );
  }

  function renderNotionRow(notion: Notion) {
    if (editingId === notion.id) {
      return (
        <div key={notion.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${palette.line}` }}>
          {/* Pas de « supprimer » ici : l'entrée existe déjà dans le ⋮ de la
              ligne, et deux chemins pour la même action destructive à deux
              clics d'écart est un piège de plus qu'un service. */}
          <NotionForm
            initialText={notion.title}
            initialChapterId={notion.chapterId}
            chapters={chapters}
            saving={saving}
            onSave={(text, chapterId) => handleUpdate(notion.id, text, chapterId)}
            onCancel={() => setEditingId(null)}
          />
        </div>
      );
    }

    return (
      // `alignItems: 'center'` fait tout le travail d'alignement vertical : un
      // titre d'une ligne se centre dans la hauteur de la ligne, un titre de deux
      // lignes se centre en bloc. Le remplissage vertical descend à 6 pour que
      // deux lignes (2 × 21) tiennent dans les 56 sans pousser la ligne.
      <div
        key={notion.id}
        draggable
        onDragStart={() => startNotionDrag(notion.id)}
        onDragEnd={() => startNotionDrag(null)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, minHeight: ROW_MIN_HEIGHT,
          padding: '6px 6px 6px 10px', borderBottom: `1px solid ${palette.line}`,
          opacity: dragNotionId === notion.id ? 0.5 : 1,
        }}
      >
        <Tooltip content={t('notions.dragHint')}>
          <span style={{ cursor: 'grab', color: palette.inkFaint, flexShrink: 0, display: 'flex' }}>
            <GripVertical size={15} strokeWidth={1.75} />
          </span>
        </Tooltip>
        {/* Le texte de la notion, tel qu'il est saisi — il n'y en a qu'un. */}
        <ClippedText
          text={notion.title}
          lines={2}
          style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: '21px', fontWeight: 600, color: palette.ink }}
        />
        {rowMenu({
          label: t('notions.actions'),
          editLabel: t('notions.edit'),
          deleteLabel: t('notions.delete'),
          onEdit: () => { setEditingId(notion.id); setAdding(false); setError(''); },
          onDelete: () => setDeleteTarget(notion),
        })}
      </div>
    );
  }

  return (
    <>
      {/* Pas de titre de section, contrairement aux autres : la maquette n'en
          met pas ici, « Chapitres » et « Notions » en tête de colonne disant
          déjà de quoi il s'agit — et le titre répétait le libellé de l'entrée
          de navigation active, juste à gauche. */}
      {error && (
        <div style={{ fontSize: 12.5, color: palette.danger, padding: '2px 0 12px' }}>{error}</div>
      )}

      {/* Génération par IA — l'une des deux portes sur la même fonction, l'autre
          étant Ressources (§8 du plan d'ingestion). Le bandeau d'annulation est
          posé ici parce que c'est ici qu'on constate le résultat sur les
          chapitres et les notions ; il ne s'affiche que tant que le lot est
          réellement annulable, et disparaît de lui-même. */}
      <ImportBanner workshopId={workshopId} onCancelled={() => window.location.reload()} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <AiGenerationButton workshopId={workshopId} onDone={() => window.location.reload()} />
      </div>

      {(
        // `minWidth: 0` sur chaque colonne : une colonne de grille ne descend pas
        // d'elle-même sous la largeur minimale de son contenu (`min-width: auto`).
        // Un nom de chapitre long, posé en `nowrap`, élargissait donc la première
        // colonne bien au-delà de son `0.85fr` et poussait la colonne des notions
        // hors de l'écran — le texte n'était jamais coupé puisque la colonne
        // cédait à sa place.
        <div className="grid grid-cols-1 md:grid-cols-[0.85fr_1.45fr]" style={{ gap: 16, alignItems: 'start' }}>
          {/* ── Colonne Chapitres ── */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: palette.ink, padding: '0 2px 8px' }}>
              {t('chapters.title')}
            </div>
            <div style={{ background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden' }}>
              {/* « ajouter un chapitre » ne disparaît plus quand on l'active :
                  le formulaire s'ajoute EN LIGNE juste en dessous, comme dans la
                  colonne des notions. Le remplacer par sa propre saisie faisait
                  perdre le repère du geste en cours. */}
              <button
                onClick={() => { setAddingChapter(true); setError(''); }}
                className="hover:bg-[var(--green-tint)]"
                style={{ width: '100%', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderBottom: `1px solid ${palette.line}`, background: 'transparent', color: palette.greenBrand, fontSize: 13.5, fontWeight: 600 }}
              >
                <Plus size={16} strokeWidth={2} />
                {t('chapters.add')}
              </button>

              {addingChapter && (
                <div style={{ ...chapterFormStyle, borderBottom: `1px solid ${palette.line}` }}>
                  <input
                    value={chapterName}
                    onChange={(e) => setChapterName(e.target.value)}
                    placeholder={t('chapters.namePlaceholder')}
                    maxLength={120}
                    autoFocus
                    style={inputStyle}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <SmallBtn tone="ghost" onClick={() => { setAddingChapter(false); setChapterName(''); }} disabled={chapterSaving}>{t('notions.cancel')}</SmallBtn>
                    <SmallBtn tone="dark" onClick={handleCreateChapter} disabled={chapterSaving || !chapterName.trim()}>{t('notions.save')}</SmallBtn>
                  </div>
                </div>
              )}

              {chapters.length === 0 && (
                <div style={emptyRowStyle}>{t('chapters.empty')}</div>
              )}

              {/* On boucle sur TOUS les chapitres et on saute les cachés, plutôt
                  que de filtrer la liste : les indices servent au réordonnancement
                  par glisser-déposer, et les décaler les casserait. */}
              {chapters.map((chapter, i) => {
                if (chapter.hidden) return null;
                const isActive = selectedChapterId === chapter.id;
                if (editingChapterId === chapter.id) {
                  return (
                    <div key={chapter.id} style={{ ...chapterFormStyle, borderBottom: i < chapters.length - 1 || showUnassignedEntry ? `1px solid ${palette.line}` : 'none' }}>
                      <input
                        value={editingChapterName}
                        onChange={(e) => setEditingChapterName(e.target.value)}
                        maxLength={120}
                        autoFocus
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <SmallBtn tone="ghost" onClick={() => setEditingChapterId(null)} disabled={chapterSaving}>{t('notions.cancel')}</SmallBtn>
                        <SmallBtn tone="dark" onClick={() => handleRenameChapter(chapter.id)} disabled={chapterSaving || !editingChapterName.trim()}>{t('notions.save')}</SmallBtn>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={chapter.id}
                    onClick={() => setSelectedChapterId(chapter.id)}
                    draggable
                    onDragStart={() => startChapterDrag(i)}
                    onDragEnd={() => startChapterDrag(null)}
                    {...dropHoverProps(chapter.id)}
                    onDrop={(e) => {
                      e.preventDefault();
                      // Une notion se range, un chapitre se réordonne : c'est la
                      // référence renseignée qui tranche.
                      if (dragNotionRef.current) handleDropNotion(chapter.id);
                      else handleDropOnChapter(i);
                    }}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minHeight: ROW_MIN_HEIGHT,
                      padding: '8px 6px 8px 10px', cursor: 'pointer',
                      borderBottom: i < chapters.length - 1 || showUnassignedEntry ? `1px solid ${palette.line}` : 'none',
                      background: dropChapterId === chapter.id ? withAlpha(palette.green, 0.14)
                        : isActive ? palette.surfaceSunken : 'transparent',
                      opacity: dragIndex === i ? 0.5 : 1,
                    }}
                  >
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: isActive ? palette.green : 'transparent' }} />
                    <Tooltip content={t('chapters.dragHint')}>
                      <span style={{ cursor: 'grab', color: palette.inkFaint, flexShrink: 0, display: 'flex' }}>
                        <GripVertical size={15} strokeWidth={1.75} />
                      </span>
                    </Tooltip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <ClippedText
                        text={chapter.name}
                        style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? palette.greenBrand : palette.ink }}
                      />
                      <div style={{ fontSize: 12, color: palette.inkMuted }}>
                        {t('notions.count', { count: chapter.notionCount })}
                      </div>
                    </div>
                    {rowMenu({
                      label: t('chapters.actions'),
                      editLabel: t('chapters.rename'),
                      deleteLabel: t('notions.delete'),
                      onEdit: () => { setEditingChapterId(chapter.id); setEditingChapterName(chapter.name); setError(''); },
                      onDelete: () => setChapterDeleteTarget(chapter),
                    })}
                  </div>
                );
              })}

              {showUnassignedEntry && (
                <div
                  onClick={() => setSelectedChapterId(UNASSIGNED)}
                  {...dropHoverProps(UNASSIGNED)}
                  onDrop={(e) => { e.preventDefault(); handleDropNotion(null); }}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minHeight: ROW_MIN_HEIGHT,
                    padding: '8px 6px 8px 10px', cursor: 'pointer',
                    background: dropChapterId === UNASSIGNED ? withAlpha(palette.green, 0.14)
                      : selectedChapterId === UNASSIGNED ? palette.surfaceSunken : 'transparent',
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: selectedChapterId === UNASSIGNED ? palette.green : 'transparent' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: selectedChapterId === UNASSIGNED ? 700 : 600, color: selectedChapterId === UNASSIGNED ? palette.greenBrand : palette.inkMuted, fontStyle: 'italic' }}>
                      {t('notions.noChapter')}
                    </div>
                    <div style={{ fontSize: 12, color: palette.inkMuted }}>
                      {t('notions.count', { count: unassignedNotions.length })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Les chapitres écartés par l'IA ──
                  Sous les autres, séparés par un intitulé : un import qui change
                  l'atelier doit se lire d'un coup d'œil. Ils restent cliquables
                  (on veut pouvoir regarder ce qu'ils contenaient) mais ne sont ni
                  déplaçables ni cibles de dépôt — on ne range pas dans une boîte
                  qu'on a mise de côté.

                  Un seul bouton : « restaurer ». Il n'a pas de symétrique, parce
                  que l'interface n'offre pas de « cacher » — décision de sobriété
                  du 23/08/2026, pas une restriction de droits. */}
              {hiddenChapters.length > 0 && (
                <>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 10px 6px', borderTop: `1px solid ${palette.line}`,
                      fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
                      color: palette.inkFaint, background: palette.surfaceSunken,
                    }}
                  >
                    <EyeOff size={13} strokeWidth={2} />
                    {t('chapters.hiddenTitle')}
                  </div>
                  {hiddenChapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      onClick={() => setSelectedChapterId(chapter.id)}
                      style={{
                        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                        minHeight: ROW_MIN_HEIGHT, padding: '8px 6px 8px 10px', cursor: 'pointer',
                        background: selectedChapterId === chapter.id ? palette.surfaceSunken : 'transparent',
                      }}
                    >
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: selectedChapterId === chapter.id ? palette.green : 'transparent' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Tooltip content={t('chapters.hiddenHint')}>
                          <ClippedText
                            text={chapter.name}
                            style={{ fontSize: 14, fontWeight: 600, color: palette.inkMuted, textDecoration: 'line-through', textDecorationColor: palette.inkFaint }}
                          />
                        </Tooltip>
                        <div style={{ fontSize: 12, color: palette.inkFaint }}>
                          {t('notions.count', { count: chapter.notionCount })}
                        </div>
                      </div>
                      <Tooltip content={t('chapters.restore')}>
                        <button
                          type="button"
                          aria-label={t('chapters.restore')}
                          disabled={chapterSaving}
                          onClick={(e) => { e.stopPropagation(); handleRestoreChapter(chapter.id); }}
                          className="hover:bg-[var(--green-tint)]"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 28, height: 28, flexShrink: 0, cursor: chapterSaving ? 'default' : 'pointer',
                            border: 'none', borderRadius: 8, background: 'transparent', color: palette.greenBrand,
                          }}
                        >
                          <RotateCcw size={15} strokeWidth={2} />
                        </button>
                      </Tooltip>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ── Colonne Notions du chapitre sélectionné ── */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: palette.ink, padding: '0 2px 8px' }}>
              {t('notions.title')}
            </div>
            <div style={{ background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden' }}>
              <button
                onClick={() => { setAdding(true); setEditingId(null); setError(''); }}
                className="hover:bg-[var(--green-tint)]"
                style={{ width: '100%', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderBottom: `1px solid ${palette.line}`, background: 'transparent', color: palette.greenBrand, fontSize: 13.5, fontWeight: 600 }}
              >
                <Plus size={16} strokeWidth={2} />
                {t('notions.add')}
              </button>

              {adding && (
                // Le filet ferme le formulaire comme n'importe quelle autre
                // ligne de la carte : sans lui, il flottait au-dessus des
                // notions existantes sans frontière.
                <div style={{ borderBottom: `1px solid ${palette.line}` }}>
                  <NotionForm
                    initialText=""
                    initialChapterId={selectedChapterId === UNASSIGNED ? null : selectedChapterId}
                    chapters={chapters}
                    saving={saving}
                    onSave={handleCreate}
                    onCancel={() => setAdding(false)}
                  />
                </div>
              )}

              {activeNotions.length === 0 ? (
                // Sans le moindre chapitre, « aucune notion dans ce chapitre »
                // parlerait d'un chapitre qui n'existe pas : on dit alors par
                // quoi commencer.
                <div style={emptyRowStyle}>
                  {selectedChapterId === null ? t('notions.needChapterHint') : t('notions.emptyChapter')}
                </div>
              ) : (
                activeNotions.map((notion) => renderNotionRow(notion))
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={t('notions.deleteTitle')}
          description={t('notions.deleteDesc', { title: deleteTarget.title })}
          confirmLabel={t('notions.delete')}
          cancelLabel={t('notions.cancel')}
          portal
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {chapterDeleteTarget && (
        <ConfirmDialog
          title={t('chapters.deleteTitle')}
          description={t('chapters.deleteDesc', { name: chapterDeleteTarget.name })}
          confirmLabel={t('notions.delete')}
          cancelLabel={t('notions.cancel')}
          portal
          onConfirm={handleDeleteChapter}
          onCancel={() => setChapterDeleteTarget(null)}
        />
      )}
    </>
  );
}
