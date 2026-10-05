'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, EllipsisVertical, EyeOff, GripVertical, Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { palette, shadow, withAlpha } from '@/lib/theme';
import AiGenerationButton, { SettingsGenerationBox } from '@/components/ai/AiGenerationButton';
import { notifyWorkshopChanged, useGenerationRefresh } from '@/components/ai/generationStore';
import { getGenerationUndo, undoLastGeneration, type GenerationUndoView } from '@/app/actions/aiIngest';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  createWorkshopNotion,
  updateWorkshopNotion,
  deleteWorkshopNotion,
  removeNewWorkshopNotion,
  deleteUnassignedWorkshopNotions,
  restoreWorkshopTrash,
  moveWorkshopNotion,
  getWorkshopNotions,
  type Notion,
} from '@/app/actions/workshopNotions';
import {
  createWorkshopChapter,
  renameWorkshopChapter,
  restoreWorkshopChapter,
  unrestoreWorkshopChapter,
  deleteWorkshopChapter,
  removeNewWorkshopChapter,
  deleteHiddenWorkshopChapter,
  reorderWorkshopChapters,
  getWorkshopChapters,
  type Chapter,
} from '@/app/actions/workshopChapters';
import { SmallBtn, UNDO_FLASH_MS } from './settingsShared';
import { useRecordUndo, useReportGenerationUndo } from './undoHistory';
import { useRevealWhenOpened } from '@/components/ui/useRevealWhenOpened';
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
  /** La dernière génération, si elle s'annule encore (@/lib/workshops/generationUndo). */
  generationUndo: GenerationUndoView | null;
};

/** Pastille « nouveau » / « modifié » posée par la dernière génération. */
function GenerationBadge({ kind, label }: { kind: 'new' | 'changed'; label: string }) {
  return (
    <span
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center',
        padding: '2px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, lineHeight: '14px',
        background: kind === 'new' ? withAlpha(palette.green, 0.14) : palette.amberTint,
        color: kind === 'new' ? palette.greenBrand : palette.amber,
      }}
    >
      {label}
    </span>
  );
}

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

/** Range `list` selon `ids` ; ce que `ids` ne connaît pas va à la fin, dans
 *  son ordre d'origine. */
function applyOrder<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const rank = (item: T) => {
    const i = ids.indexOf(item.id);
    return i === -1 ? ids.length : i;
  };
  return list.map((item, i) => ({ item, i })).sort((x, y) => rank(x.item) - rank(y.item) || x.i - y.i).map((x) => x.item);
}

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

export default function NotionsSection({ workshopId, notions: initialNotions, chapters: initialChapters, generationUndo: initialGenerationUndo }: Props) {
  const t = useTranslations('settings');
  const [notions, setNotions] = useState<Notion[]>(initialNotions);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const recordUndo = useRecordUndo();
  // Les annulations s'exécutent bien après le rendu qui les a créées : elles
  // lisent l'état d'AUJOURD'HUI par ces deux références.
  const notionsRef = useRef(notions);
  const chaptersRef = useRef(chapters);
  useEffect(() => { notionsRef.current = notions; chaptersRef.current = chapters; });

  // ─── La dernière génération : pastilles et annulation ────────────────────
  //
  // Tant qu'elle s'annule, ce qu'elle a créé porte « nouveau » et ce qu'elle a
  // déplacé ou écarté « modifié ». Tout disparaît à la première modification
  // du programme — d'où la confirmation qui la précède — ou passé 48 h
  // (@/lib/workshops/generationUndo).
  const [genUndo, setGenUndo] = useState<GenerationUndoView | null>(initialGenerationUndo);
  const genUndoRef = useRef(genUndo);
  useEffect(() => { genUndoRef.current = genUndo; });
  const [pendingEdit, setPendingEdit] = useState<(() => void) | null>(null);
  const reportGenerationUndo = useReportGenerationUndo();

  // Passé le délai, elle s'éteint d'elle-même, page ouverte ou non.
  useEffect(() => {
    if (!genUndo) return;
    const left = Math.max(0, new Date(genUndo.expiresAt).getTime() - Date.now());
    const timer = setTimeout(() => setGenUndo(null), left);
    return () => clearTimeout(timer);
  }, [genUndo]);

  const marks = genUndo?.marks;
  const newIds = new Set([...(marks?.newChapters ?? []), ...(marks?.newNotions ?? [])]);
  const changedIds = new Set([...(marks?.changedChapters ?? []), ...(marks?.movedNotions ?? [])]);
  function badgeFor(id: string) {
    if (newIds.has(id)) return <GenerationBadge kind="new" label={t('generationUndo.badgeNew')} />;
    if (changedIds.has(id)) return <GenerationBadge kind="changed" label={t('generationUndo.badgeChanged')} />;
    return null;
  }

  /** Un geste qui modifie le programme : s'il reste une génération à annuler,
   *  on demande d'abord, puisqu'il retire cette possibilité. */
  function guarded(action: () => void) {
    if (genUndoRef.current) setPendingEdit(() => action);
    else action();
  }

  // Signalée à la page, qui porte le bouton (undoHistory.tsx). Les fonctions
  // lisent l'état du moment par les références.
  useEffect(() => {
    if (!genUndo) { reportGenerationUndo(null); return; }
    const m = genUndo.marks;
    reportGenerationUndo({
      created: m.newChapters.length + m.newNotions.length,
      changed: m.movedNotions.length + m.changedChapters.length,
      dismiss: () => setGenUndo(null),
      run: async () => {
        const current = genUndoRef.current;
        if (!current) return false;
        const result = await undoLastGeneration(workshopId, current.importId);
        setGenUndo(null);
        if (!result.ok) return false;
        const fresh = await reloadBoth();
        // Le chapitre affiché a pu partir avec la génération.
        setSelectedChapterId((selected) =>
          selected && selected !== UNASSIGNED && !fresh.chapters.some((c) => c.id === selected)
            ? fresh.chapters.find((c) => !c.hidden)?.id ?? null
            : selected);
        // Les autres écrans (questions du parcours) se relisent.
        notifyWorkshopChanged(workshopId);
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genUndo, reportGenerationUndo, workshopId]);
  useEffect(() => () => reportGenerationUndo(null), [reportGenerationUndo]);

  // Ce qu'écrit une génération apparaît au fil de l'eau, sans rechargement.
  // Les lectures se suivent (les actions passent une par une) : elles n'ont
  // lieu qu'au rythme du suivi, pas à chaque frappe. Une génération qui se
  // termine apporte son annulation ; la pile du bouton « annuler » est gardée.
  useGenerationRefresh(workshopId, () => {
    void (async () => {
      try {
        const nextNotions = await getWorkshopNotions(workshopId);
        const nextChapters = await getWorkshopChapters(workshopId);
        const nextUndo = await getGenerationUndo(workshopId);
        setNotions(nextNotions);
        setChapters(nextChapters);
        setGenUndo(nextUndo);
      } catch {
        // Rafraîchissement d'agrément : un échec laisse la liste affichée.
      }
    })();
  });

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Chapitres
  const [addingChapter, setAddingChapter] = useState(false);
  const [chapterName, setChapterName] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterName, setEditingChapterName] = useState('');
  const [chapterSaving, setChapterSaving] = useState(false);

  // Colonne de droite : chapitre sélectionné (deux colonnes, lignes 1717-1786 de
  // la maquette). `UNASSIGNED` sélectionne le groupe « sans chapitre » — un cas
  // que la maquette ne modélise pas (ses notions vivent toujours dans un
  // chapitre), mais qu'on doit garder accessible pour ne rien casser côté réel.
  const [selectedChapterId, setSelectedChapterId] = useState<string | typeof UNASSIGNED | null>(
    initialChapters[0]?.id ?? (initialNotions.some((n) => !n.chapterId) ? UNASSIGNED : null)
  );

  // Un formulaire qu'on ouvre (modifier, renommer, ajouter) s'affiche EN ENTIER :
  // ouvert en bas d'une liste qui défile, il restait à moitié coupé. Même
  // mécanisme que la liste des questions d'examen. Les deux formulaires de
  // notion ne sont jamais ouverts ensemble ; ceux de chapitre, si.
  const notionFormRef = useRef<HTMLDivElement>(null);
  const chapterEditRef = useRef<HTMLDivElement>(null);
  const chapterAddRef = useRef<HTMLDivElement>(null);
  useRevealWhenOpened(notionFormRef, editingId ?? (adding ? 'new' : null));
  useRevealWhenOpened(chapterEditRef, editingChapterId);
  useRevealWhenOpened(chapterAddRef, addingChapter ? 'new' : null);

  /** Relit les deux listes depuis la base — après une restauration, qui remet
   *  d'un coup des lignes dont la page n'a plus la trace exacte. */
  async function reload(): Promise<Notion[]> {
    return (await reloadBoth()).notions;
  }

  async function reloadBoth(): Promise<{ notions: Notion[]; chapters: Chapter[] }> {
    const nextNotions = await getWorkshopNotions(workshopId);
    const nextChapters = await getWorkshopChapters(workshopId);
    setNotions(nextNotions);
    setChapters(nextChapters);
    return { notions: nextNotions, chapters: nextChapters };
  }

  // ─── Montrer ce qu'une annulation vient de changer ───────────────────────
  //
  // Annuler peut changer de section, ou toucher une notion d'un autre chapitre
  // que celui affiché : on ne saurait pas où regarder. L'annulation affiche
  // donc le bon chapitre, fait défiler jusqu'à l'élément, et le fait clignoter.
  // `n` change à chaque fois : deux annulations de suite sur la même ligne la
  // refont clignoter (l'animation alterne entre deux noms identiques, sans quoi
  // le navigateur ne la relancerait pas).
  const [flash, setFlash] = useState<{ ids: string[]; n: number } | null>(null);
  const flashSeq = useRef(0);

  /** `select` : la ligne de chapitre à afficher (`undefined` : ne rien changer).
   *  `ids` : ce qui clignote — notions et lignes de chapitre ; on fait défiler
   *  jusqu'au premier. */
  function reveal(select: string | typeof UNASSIGNED | null | undefined, ids: (string | null)[]) {
    if (select !== undefined) setSelectedChapterId(select);
    flashSeq.current += 1;
    setFlash({ ids: ids.map((id) => id ?? UNASSIGNED), n: flashSeq.current });
  }

  useEffect(() => {
    if (!flash) return;
    // Après l'affichage du bon chapitre : la ligne visée n'existe qu'ensuite.
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector(`[data-flash-id="${flash.ids[0]}"]`);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    const timer = setTimeout(() => setFlash((f) => (f?.n === flash.n ? null : f)), UNDO_FLASH_MS + 200);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [flash]);

  /** Repère et animation d'une ligne qui peut clignoter. */
  function flashProps(id: string) {
    const on = flash?.ids.includes(id);
    return {
      'data-flash-id': id,
      style: on ? { animation: `${flash!.n % 2 ? 'undo-flash-a' : 'undo-flash-b'} ${UNDO_FLASH_MS}ms linear` } : undefined,
    };
  }

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
      recordUndo({
        section: 'notions',
        undo: async () => {
          const undone = await removeNewWorkshopNotion(workshopId, notion.id);
          if (!undone.success) return false;
          const current = notionsRef.current.find((n) => n.id === notion.id);
          const chapterId = current?.chapterId ?? null;
          setNotions((prev) => prev.filter((n) => n.id !== notion.id));
          bumpChapterCount(chapterId, -1);
          // La notion n'est plus là : c'est son chapitre, et son compte, qui changent.
          reveal(chapterId ?? UNASSIGNED, [chapterId]);
          return true;
        },
      });
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
      applyNotionLocally(notionId, text.trim(), chapterId);
      setEditingId(null);
      if (previous) {
        recordUndo({
          section: 'notions',
          undo: async () => {
            const undone = await updateWorkshopNotion(workshopId, notionId, previous.title, previous.chapterId);
            if (!undone.success) return false;
            const movedBack = notionsRef.current.find((n) => n.id === notionId)?.chapterId !== previous.chapterId;
            applyNotionLocally(notionId, previous.title, previous.chapterId);
            // Remise dans son ancien chapitre : on l'y montre, et lui avec.
            reveal(previous.chapterId ?? UNASSIGNED, movedBack ? [notionId, previous.chapterId] : [notionId]);
            return true;
          },
        });
      }
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleDelete(target: Notion) {
    setError('');
    const result = await deleteWorkshopNotion(workshopId, target.id);
    if (result.success && result.trashId) {
      const trashId = result.trashId;
      setNotions((prev) => prev.filter((n) => n.id !== target.id));
      bumpChapterCount(target.chapterId, -1);
      if (editingId === target.id) setEditingId(null);
      recordUndo({
        section: 'notions',
        trashId,
        undo: async () => {
          const undone = await restoreWorkshopTrash(workshopId, trashId);
          if (!undone.success) return false;
          // Le chapitre d'origine a pu disparaître : la base dit où elle revient.
          const back = (await reload()).find((n) => n.id === target.id);
          const chapterId = back?.chapterId ?? null;
          reveal(chapterId ?? UNASSIGNED, [target.id, chapterId]);
          return true;
        },
      });
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  /** Supprime d'un coup toutes les notions sans chapitre — annulable d'un coup. */
  async function handleDeleteUnassigned() {
    setError('');
    const result = await deleteUnassignedWorkshopNotions(workshopId);
    if (!result.success || !result.trashId) return setError(result.error ?? t('err.delete'));
    const trashId = result.trashId;
    await reload();
    // « sans chapitre » est vide : afficher le premier chapitre plutôt qu'un groupe vide.
    setSelectedChapterId(chaptersRef.current.find((c) => !c.hidden)?.id ?? null);
    recordUndo({
      section: 'notions',
      trashId,
      undo: async () => {
        const undone = await restoreWorkshopTrash(workshopId, trashId);
        if (!undone.success || !undone.restored) return false;
        await reload();
        reveal(UNASSIGNED, [UNASSIGNED, ...undone.restored.notionIds]);
        return true;
      },
    });
  }

  /** Reporte localement le texte et le chapitre d'une notion, compteurs compris. */
  function applyNotionLocally(notionId: string, title: string, chapterId: string | null) {
    const before = notionsRef.current.find((n) => n.id === notionId);
    setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, title, chapterId } : n)));
    if (before && before.chapterId !== chapterId) {
      bumpChapterCount(before.chapterId, -1);
      bumpChapterCount(chapterId, +1);
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
      recordUndo({
        section: 'notions',
        undo: async () => {
          const undone = await removeNewWorkshopChapter(workshopId, chapter.id);
          if (!undone.success) return false;
          dropChapterLocally(chapter.id);
          return true;
        },
      });
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleRenameChapter(chapterId: string) {
    if (!editingChapterName.trim()) return;
    setChapterSaving(true);
    setError('');
    const name = editingChapterName.trim();
    const previousName = chapters.find((c) => c.id === chapterId)?.name;
    const result = await renameWorkshopChapter(workshopId, chapterId, name);
    setChapterSaving(false);
    if (result.success) {
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, name } : c)));
      setEditingChapterId(null);
      if (previousName !== undefined && previousName !== name) {
        recordUndo({
          section: 'notions',
          undo: async () => {
            const undone = await renameWorkshopChapter(workshopId, chapterId, previousName);
            if (!undone.success) return false;
            setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, name: previousName } : c)));
            reveal(chapterId, [chapterId]);
            return true;
          },
        });
      }
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleDeleteChapter(target: Chapter) {
    setError('');
    const result = await deleteWorkshopChapter(workshopId, target.id);
    if (result.success && result.trashId) {
      const trashId = result.trashId;
      dropChapterLocally(target.id);
      recordUndo({
        section: 'notions',
        trashId,
        undo: async () => {
          const undone = await restoreWorkshopTrash(workshopId, trashId);
          if (!undone.success) return false;
          // Il reprend sa place dans la liste, et ses notions avec lui.
          await reload();
          reveal(target.id, [target.id]);
          return true;
        },
      });
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  /** Supprime un chapitre écarté par l'IA, avec ses notions — annulable. */
  async function handleDeleteHidden(target: Chapter) {
    setError('');
    const result = await deleteHiddenWorkshopChapter(workshopId, target.id);
    if (!result.success || !result.trashId) return setError(result.error ?? t('err.delete'));
    const trashId = result.trashId;
    await reload();
    setSelectedChapterId((selected) =>
      selected === target.id ? chaptersRef.current.find((c) => !c.hidden)?.id ?? null : selected);
    recordUndo({
      section: 'notions',
      trashId,
      undo: async () => {
        const undone = await restoreWorkshopTrash(workshopId, trashId);
        if (!undone.success) return false;
        await reload();
        reveal(target.id, [target.id]);
        return true;
      },
    });
  }

  /** Retire localement un chapitre qui n'existe plus (supprimé, ou création
   *  annulée), et choisit où poser la sélection s'il était affiché. */
  function dropChapterLocally(chapterId: string) {
    const current = chaptersRef.current;
    const currentNotions = notionsRef.current;
    setChapters((prev) => prev.filter((c) => c.id !== chapterId));
    // Les notions du chapitre ne sont pas supprimées : elles retombent dans
    // « sans chapitre » (FK en `on delete set null`).
    setNotions((prev) => prev.map((n) => (n.chapterId === chapterId ? { ...n, chapterId: null } : n)));
    // Où atterrir quand c'est le chapitre affiché qui disparaît. La règle suit
    // ce qui s'est réellement passé, elle n'est pas un repli par défaut :
    // basculer systématiquement sur « sans chapitre » plantait l'écran sur un
    // groupe VIDE quand on supprimait un chapitre sans notion — et comme
    // l'entrée « sans chapitre » ne s'affiche que si elle contient quelque
    // chose *ou* si elle est sélectionnée, elle n'apparaissait alors que parce
    // qu'on venait de la sélectionner.
    setSelectedChapterId((selected) => {
      if (selected !== chapterId) return selected;
      const index = current.findIndex((c) => c.id === chapterId);
      const remaining = current.filter((c) => c.id !== chapterId);
      // Des notions viennent de retomber dans « sans chapitre » : y aller,
      // c'est montrer où elles sont parties.
      if (currentNotions.some((n) => n.chapterId === chapterId)) return UNASSIGNED;
      // Rien n'a bougé : prendre la place laissée vide — le chapitre suivant,
      // ou le précédent si on supprimait le dernier de la liste.
      if (remaining.length > 0) return remaining[Math.min(index, remaining.length - 1)].id;
      // Plus aucun chapitre : « sans chapitre » seulement s'il y a vraiment des
      // notions à y voir, sinon aucune sélection (l'écran invite à en créer un).
      return currentNotions.some((n) => !n.chapterId) ? UNASSIGNED : null;
    });
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
    if (index === null) setChapterDropAt(null);
  }

  // Repère d'insertion, sur le modèle du glisser des questions d'Examen : la
  // moitié haute d'une ligne vise l'espace AVANT elle, la moitié basse l'espace
  // APRÈS. `at` est un rang d'insertion dans la liste complète des chapitres ;
  // `rowId`/`edge` disent sur quelle ligne et de quel côté dessiner le trait.
  const [chapterDropAt, setChapterDropAt] = useState<{ at: number; rowId: string; edge: 'before' | 'after' } | null>(null);

  // Le survol arrive des dizaines de fois par seconde : on rend l'état
  // précédent à l'identique quand rien n'a changé, sinon la colonne se
  // re-rendrait à chaque pixel parcouru.
  function aimChapterAt(next: { at: number; rowId: string; edge: 'before' | 'after' }) {
    setChapterDropAt((prev) => (prev && prev.at === next.at && prev.rowId === next.rowId && prev.edge === next.edge ? prev : next));
  }

  /** Trait à dessiner sur cette ligne, s'il y en a un. Rien quand le dépôt ne
   *  changerait rien (reposer le chapitre là où il est) : un trait qui promet
   *  un déplacement sans effet est pire que pas de trait du tout. */
  function chapterDropLine(rowId: string) {
    if (!chapterDropAt || chapterDropAt.rowId !== rowId || dragIndex === null) return null;
    if (chapterDropAt.at === dragIndex || chapterDropAt.at === dragIndex + 1) return null;
    // En absolu, jamais dans le flux : un trait qui prend de la hauteur
    // déplacerait la ligne sous le curseur, donc la cible, donc le trait.
    return (
      <span
        style={{
          position: 'absolute', [chapterDropAt.edge === 'before' ? 'top' : 'bottom']: -1.5,
          left: 8, right: 8, height: 3, borderRadius: 2,
          background: palette.green, pointerEvents: 'none', zIndex: 1,
        }}
      />
    );
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

  function handleDropNotion(chapterId: string | null) {
    const notionId = dragNotionRef.current;
    startNotionDrag(null);
    if (!notionId) return;

    const notion = notions.find((n) => n.id === notionId);
    if (!notion || notion.chapterId === chapterId) return;
    guarded(() => void commitNotionMove(notion, chapterId));
  }

  async function commitNotionMove(notion: Notion, chapterId: string | null) {
    const notionId = notion.id;
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
      return;
    }
    recordUndo({
      section: 'notions',
      undo: async () => {
        const undone = await moveWorkshopNotion(workshopId, notionId, from);
        if (!undone.success) return false;
        applyNotionLocally(notionId, notion.title, from);
        // On montre la notion revenue dans son ancien chapitre, et ce chapitre.
        reveal(from ?? UNASSIGNED, [notionId, from]);
        return true;
      },
    });
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

  /** Repose le chapitre au rang visé par le dernier survol — jamais d'après la
   *  ligne qui reçoit le `drop`. Le rang est celui de la liste d'origine :
   *  retirer le chapitre avant de l'insérer décale d'un cran tout ce qui le
   *  suivait, d'où la correction. L'ordre s'enregistre aussitôt. */
  function handleDropChapter() {
    const from = dragIndexRef.current;
    const target = chapterDropAt;
    startChapterDrag(null);
    if (from === null || !target) return;
    const to = target.at > from ? target.at - 1 : target.at;
    if (to === from) return;
    guarded(() => void commitChapterMove(from, to));
  }

  async function commitChapterMove(from: number, to: number) {
    const chapters = chaptersRef.current;

    // Les rangs sont ceux des chapitres VISIBLES. Un chapitre écarté rangé entre
    // deux visibles ne s'affiche pas là, mais il comptait dans le calcul :
    // déposer le premier chapitre juste au-dessus du deuxième le reposait alors
    // entre lui-même et l'écarté — au même endroit à l'écran (05/10/2026). Les
    // écartés gardent leur rang dans la liste complète ; seuls les visibles
    // permutent entre eux.
    const visible = chapters.filter((c) => !c.hidden);
    const movedId = visible[from].id;
    const reorderedVisible = [...visible];
    const [moved] = reorderedVisible.splice(from, 1);
    reorderedVisible.splice(to, 0, moved);
    let k = 0;
    const reordered = chapters.map((c) => (c.hidden ? c : reorderedVisible[k++]));

    const previousIds = chapters.map((c) => c.id);
    if (await saveChapterOrder(reordered)) {
      recordUndo({
        section: 'notions',
        // L'ordre d'avant, appliqué à la liste d'AUJOURD'HUI : un chapitre
        // arrivé entre-temps (génération) va en fin de liste.
        undo: async () => {
          const ok = await saveChapterOrder(applyOrder(chaptersRef.current, previousIds));
          if (ok) reveal(undefined, [movedId]);
          return ok;
        },
      });
    }
  }

  /** Affiche puis enregistre un ordre ; revient au précédent si l'écriture échoue. */
  async function saveChapterOrder(next: Chapter[]): Promise<boolean> {
    const previous = chaptersRef.current;
    setChapters(next);
    setError('');
    const result = await reorderWorkshopChapters(workshopId, next.map((c) => c.id));
    if (!result.success) {
      setChapters(previous); // l'ordre affiché doit refléter la base
      setError(result.error ?? t('err.save'));
      return false;
    }
    return true;
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const unassignedNotions = notions.filter((n) => !n.chapterId || !chapters.some((c) => c.id === n.chapterId));
  const showUnassignedEntry = unassignedNotions.length > 0 || selectedChapterId === UNASSIGNED;
  // Les chapitres écartés vivent SOUS les autres, jamais mêlés à eux : c'est ce
  // qui rend un changement d'atelier lisible d'un coup d'œil.
  const hiddenChapters = chapters.filter((c) => c.hidden);
  const visibleChapters = chapters.filter((c) => !c.hidden);

  async function handleRestoreChapter(chapterId: string) {
    setChapterSaving(true);
    const result = await restoreWorkshopChapter(workshopId, chapterId);
    setChapterSaving(false);
    if (!result.success) return setError(result.error ?? t('chapters.restoreFailed'));
    setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, hidden: false } : c)));
    setSelectedChapterId(chapterId);
    recordUndo({
      section: 'notions',
      undo: async () => {
        const undone = await unrestoreWorkshopChapter(workshopId, chapterId);
        if (!undone.success) return false;
        setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, hidden: true } : c)));
        reveal(undefined, [chapterId]);
        return true;
      },
    });
  }
  // Alphabétique, et retrié ICI plutôt que de faire confiance à l'ordre reçu du
  // serveur : une notion qu'on vient d'ajouter ou de renommer doit rejoindre sa
  // place tout de suite, sans attendre un rechargement de la page.
  const activeNotions = (selectedChapterId === UNASSIGNED
    ? unassignedNotions
    : notions.filter((n) => n.chapterId === selectedChapterId)
  ).slice().sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base', numeric: true }));
  // Menu ⋮ d'une ligne (chapitre ou notion) : « modifier » et « supprimer »,
  // là où les deux listes alignaient un crayon et une corbeille. Deux cibles de
  // 32px par ligne coûtaient 70px de largeur dans des colonnes déjà étroites,
  // pour des actions qu'on ne déclenche qu'occasionnellement.
  //
  // `stopPropagation` sur l'enveloppe : la ligne d'un chapitre est cliquable
  // (elle le sélectionne), et ouvrir son menu n'est pas le choisir. Le clic-
  // dehors du panneau, lui, est écouté sur `document` en capture — il n'est pas
  // concerné.
  function rowMenu({ label, onEdit, onDelete, editLabel, deleteLabel, editIcon }: {
    label: string; onEdit: () => void; onDelete: () => void; editLabel: string; deleteLabel: string;
    /** Icône de la première entrée (crayon par défaut — « restaurer » pour un chapitre écarté). */
    editIcon?: React.ReactNode;
  }) {
    return (
      <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexShrink: 0 }}>
        <SelectMenu
          items={[
            { value: 'edit', label: editLabel, icon: editIcon ?? <Pencil size={14} strokeWidth={2} /> },
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

  function startEditNotion(notionId: string) {
    setEditingId(notionId);
    setAdding(false);
    setError('');
  }

  function startRenameChapter(chapter: Chapter) {
    setEditingChapterId(chapter.id);
    setEditingChapterName(chapter.name);
    setError('');
  }

  function renderNotionRow(notion: Notion) {
    if (editingId === notion.id) {
      return (
        <div key={notion.id} ref={notionFormRef} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${palette.line}` }}>
          {/* Pas de « supprimer » ici : l'entrée existe déjà dans le ⋮ de la
              ligne, et deux chemins pour la même action destructive à deux
              clics d'écart est un piège de plus qu'un service. */}
          <NotionForm
            initialText={notion.title}
            initialChapterId={notion.chapterId}
            chapters={chapters}
            saving={saving}
            onSave={(text, chapterId) => guarded(() => void handleUpdate(notion.id, text, chapterId))}
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
        // Double-clic : raccourci de « modifier » du menu ⋮.
        onDoubleClick={() => startEditNotion(notion.id)}
        data-flash-id={notion.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, minHeight: ROW_MIN_HEIGHT,
          padding: '6px 6px 6px 10px', borderBottom: `1px solid ${palette.line}`,
          opacity: dragNotionId === notion.id ? 0.5 : 1,
          ...flashProps(notion.id).style,
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
        {badgeFor(notion.id)}
        {rowMenu({
          label: t('notions.actions'),
          editLabel: t('notions.edit'),
          deleteLabel: t('notions.delete'),
          onEdit: () => startEditNotion(notion.id),
          onDelete: () => guarded(() => void handleDelete(notion)),
        })}
      </div>
    );
  }

  return (
    // ─── Deux défilements indépendants (05/10/2026) ──────────────────────────
    // Sur ordinateur, la section prend exactement la hauteur de la colonne des
    // paramètres, et chaque liste défile seule dans sa carte : avec des
    // centaines de notions, la page entière défilait et emportait les
    // chapitres hors de l'écran. Les titres, le bouton de génération et les
    // boutons « ajouter » restent donc toujours visibles. Sur téléphone (sous
    // 768px), rien de tout cela : la page défile normalement.
    <div className="md:flex md:h-full md:min-h-0 md:flex-col">
      {/* Pas de titre de section, contrairement aux autres : la maquette n'en
          met pas ici, « Chapitres » et « Notions » en tête de colonne disant
          déjà de quoi il s'agit — et le titre répétait le libellé de l'entrée
          de navigation active, juste à gauche. */}
      {error && (
        <div style={{ fontSize: 12.5, color: palette.danger, padding: '2px 0 12px' }}>{error}</div>
      )}

      {/* Génération par IA — l'une des deux portes sur la même fonction, l'autre
          étant Ressources (§8 du plan d'ingestion). */}

      {/* L'encadré de génération, au-dessus des titres : le même que dans
          Ressources, qui garde sa consigne d'un onglet à l'autre. Il prend la
          place du bouton, et les listes glissent vers le bas. */}
      <SettingsGenerationBox workshopId={workshopId} origin="settings-notions" />

      {/* ─── Les titres, et le bouton sur la même ligne (25/09/2026) ─────────
          Comme dans Ressources : le bouton de génération s'aligne sur les
          titres. Les titres sortent donc des colonnes pour former une ligne à
          eux, qui porte le bouton. Sur téléphone, chaque titre reste en tête de
          sa colonne : seule la ligne du bouton demeure ici. */}
      <div className="grid grid-cols-1 md:grid-cols-[0.85fr_1.45fr]" style={{ gap: 16, alignItems: 'center', marginBottom: 10 }}>
        <div className="hidden md:block" style={{ fontSize: 17, fontWeight: 500, color: palette.ink, padding: '0 2px' }}>
          {t('chapters.title')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="hidden md:block" style={{ fontSize: 17, fontWeight: 500, color: palette.ink, padding: '0 2px' }}>
            {t('notions.title')}
          </div>
          <span style={{ marginLeft: 'auto' }}>
            <AiGenerationButton workshopId={workshopId} />
          </span>
        </div>
      </div>


      {(
        // `minWidth: 0` sur chaque colonne : une colonne de grille ne descend pas
        // d'elle-même sous la largeur minimale de son contenu (`min-width: auto`).
        // Un nom de chapitre long, posé en `nowrap`, élargissait donc la première
        // colonne bien au-delà de son `0.85fr` et poussait la colonne des notions
        // hors de l'écran — le texte n'était jamais coupé puisque la colonne
        // cédait à sa place.
        <div className="grid grid-cols-1 md:min-h-0 md:flex-1 md:grid-cols-[0.85fr_1.45fr] md:grid-rows-[minmax(0,1fr)]" style={{ gap: 16, alignItems: 'start' }}>
          {/* ── Colonne Chapitres ── */}
          <div className="md:flex md:max-h-full md:min-h-0 md:flex-col" style={{ minWidth: 0 }}>
            <div className="md:hidden" style={{ fontSize: 17, fontWeight: 500, color: palette.ink, padding: '0 2px 8px' }}>
              {t('chapters.title')}
            </div>
            <div className="md:flex md:min-h-0 md:flex-col" style={{ background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden' }}>
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

              <div className="scroll-panel md:min-h-0">
              {addingChapter && (
                <div ref={chapterAddRef} style={{ ...chapterFormStyle, borderBottom: `1px solid ${palette.line}` }}>
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
                    <SmallBtn tone="dark" onClick={() => guarded(() => void handleCreateChapter())} disabled={chapterSaving || !chapterName.trim()}>{t('notions.save')}</SmallBtn>
                  </div>
                </div>
              )}

              {chapters.length === 0 && (
                <div style={emptyRowStyle}>{t('chapters.empty')}</div>
              )}

              {/* Le glisser-déposer compte en rangs parmi les chapitres
                  AFFICHÉS (`vi`) — jamais dans la liste complète, où un écarté
                  peut s'intercaler sans être visible à cet endroit. */}
              {visibleChapters.map((chapter, vi) => {
                const i = vi;
                const lastRow = vi === visibleChapters.length - 1;
                const isActive = selectedChapterId === chapter.id;
                if (editingChapterId === chapter.id) {
                  return (
                    <div key={chapter.id} ref={chapterEditRef} style={{ ...chapterFormStyle, borderBottom: !lastRow || showUnassignedEntry ? `1px solid ${palette.line}` : 'none' }}>
                      <input
                        value={editingChapterName}
                        onChange={(e) => setEditingChapterName(e.target.value)}
                        maxLength={120}
                        autoFocus
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <SmallBtn tone="ghost" onClick={() => setEditingChapterId(null)} disabled={chapterSaving}>{t('notions.cancel')}</SmallBtn>
                        <SmallBtn tone="dark" onClick={() => guarded(() => void handleRenameChapter(chapter.id))} disabled={chapterSaving || !editingChapterName.trim()}>{t('notions.save')}</SmallBtn>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={chapter.id}
                    onClick={() => setSelectedChapterId(chapter.id)}
                    // Double-clic : raccourci de « renommer » du menu ⋮.
                    onDoubleClick={() => startRenameChapter(chapter)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      // Firefox n'amorce aucun glisser sans donnée transportée.
                      e.dataTransfer.setData('text/plain', chapter.id);
                      startChapterDrag(i);
                    }}
                    onDragEnd={() => startChapterDrag(null)}
                    {...dropHoverProps(chapter.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragNotionId) {
                        setDropChapterId((prev) => (prev === chapter.id ? prev : chapter.id));
                      } else if (dragIndex !== null) {
                        const r = e.currentTarget.getBoundingClientRect();
                        const before = e.clientY - r.top < r.height / 2;
                        aimChapterAt(before
                          ? { at: i, rowId: chapter.id, edge: 'before' }
                          : { at: i + 1, rowId: chapter.id, edge: 'after' });
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      // Une notion se range, un chapitre se réordonne : c'est la
                      // référence renseignée qui tranche.
                      if (dragNotionRef.current) handleDropNotion(chapter.id);
                      else handleDropChapter();
                    }}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minHeight: ROW_MIN_HEIGHT,
                      // Toute la ligne se saisit, pas seulement la poignée.
                      padding: '8px 6px 8px 10px', cursor: dragIndex !== null ? 'grabbing' : 'pointer', userSelect: 'none',
                      borderBottom: !lastRow || showUnassignedEntry ? `1px solid ${palette.line}` : 'none',
                      background: dropChapterId === chapter.id ? withAlpha(palette.green, 0.14)
                        : isActive ? palette.surfaceSunken : 'transparent',
                      opacity: dragIndex === i ? 0.4 : 1,
                      ...flashProps(chapter.id).style,
                    }}
                    data-flash-id={chapter.id}
                  >
                    {chapterDropLine(chapter.id)}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: palette.inkMuted }}>
                        {t('notions.count', { count: chapter.notionCount })}
                        {badgeFor(chapter.id)}
                      </div>
                    </div>
                    {rowMenu({
                      label: t('chapters.actions'),
                      editLabel: t('chapters.rename'),
                      deleteLabel: t('notions.delete'),
                      onEdit: () => startRenameChapter(chapter),
                      onDelete: () => guarded(() => void handleDeleteChapter(chapter)),
                    })}
                  </div>
                );
              })}

              {showUnassignedEntry && (
                <div
                  onClick={() => setSelectedChapterId(UNASSIGNED)}
                  {...dropHoverProps(UNASSIGNED)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragNotionId) setDropChapterId((prev) => (prev === UNASSIGNED ? prev : UNASSIGNED));
                    // Un chapitre lâché ici va en fin de liste : le trait se pose
                    // au-dessus de « sans chapitre », qui reste toujours dernier.
                    else if (dragIndex !== null) aimChapterAt({ at: visibleChapters.length, rowId: UNASSIGNED, edge: 'before' });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragNotionRef.current) handleDropNotion(null);
                    else handleDropChapter();
                  }}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minHeight: ROW_MIN_HEIGHT,
                    padding: '8px 6px 8px 10px', cursor: 'pointer',
                    background: dropChapterId === UNASSIGNED ? withAlpha(palette.green, 0.14)
                      : selectedChapterId === UNASSIGNED ? palette.surfaceSunken : 'transparent',
                    ...flashProps(UNASSIGNED).style,
                  }}
                  data-flash-id={UNASSIGNED}
                >
                  {chapterDropLine(UNASSIGNED)}
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
                      data-flash-id={chapter.id}
                      style={{
                        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                        minHeight: ROW_MIN_HEIGHT, padding: '8px 6px 8px 10px', cursor: 'pointer',
                        background: selectedChapterId === chapter.id ? palette.surfaceSunken : 'transparent',
                        ...flashProps(chapter.id).style,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: palette.inkFaint }}>
                          {t('notions.count', { count: chapter.notionCount })}
                          {badgeFor(chapter.id)}
                        </div>
                      </div>
                      {/* Même menu ⋮ que les autres chapitres. Supprimer un écarté
                          emporte ses notions : elles sont déjà hors du programme. */}
                      {rowMenu({
                        label: t('chapters.actions'),
                        editLabel: t('chapters.restore'),
                        editIcon: <RotateCcw size={14} strokeWidth={2} />,
                        deleteLabel: t('notions.delete'),
                        onEdit: () => guarded(() => void handleRestoreChapter(chapter.id)),
                        onDelete: () => guarded(() => void handleDeleteHidden(chapter)),
                      })}
                    </div>
                  ))}
                </>
              )}
              </div>
            </div>
          </div>

          {/* ── Colonne Notions du chapitre sélectionné ── */}
          <div className="md:flex md:max-h-full md:min-h-0 md:flex-col" style={{ minWidth: 0 }}>
            <div className="md:hidden" style={{ fontSize: 17, fontWeight: 500, color: palette.ink, padding: '0 2px 8px' }}>
              {t('notions.title')}
            </div>
            <div className="md:flex md:min-h-0 md:flex-col" style={{ background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden' }}>
              <button
                onClick={() => { setAdding(true); setEditingId(null); setError(''); }}
                className="hover:bg-[var(--green-tint)]"
                style={{ width: '100%', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderBottom: `1px solid ${palette.line}`, background: 'transparent', color: palette.greenBrand, fontSize: 13.5, fontWeight: 600 }}
              >
                <Plus size={16} strokeWidth={2} />
                {t('notions.add')}
              </button>

              {selectedChapterId === UNASSIGNED && unassignedNotions.length > 0 && (
                <button
                  onClick={() => guarded(() => void handleDeleteUnassigned())}
                  className="hover:bg-[var(--surface-sunken)]"
                  style={{ width: '100%', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderBottom: `1px solid ${palette.line}`, background: 'transparent', color: palette.danger, fontSize: 13.5, fontWeight: 600 }}
                >
                  <Trash2 size={15} strokeWidth={2} />
                  {t('notions.deleteUnassigned', { count: unassignedNotions.length })}
                </button>
              )}

              <div className="scroll-panel md:min-h-0">
              {adding && (
                // Le filet ferme le formulaire comme n'importe quelle autre
                // ligne de la carte : sans lui, il flottait au-dessus des
                // notions existantes sans frontière.
                <div ref={notionFormRef} style={{ borderBottom: `1px solid ${palette.line}` }}>
                  <NotionForm
                    initialText=""
                    initialChapterId={selectedChapterId === UNASSIGNED ? null : selectedChapterId}
                    chapters={chapters}
                    saving={saving}
                    onSave={(text, chapterId) => guarded(() => void handleCreate(text, chapterId))}
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
        </div>
      )}

      {pendingEdit && (
        <ConfirmDialog
          width={440}
          title={t('generationUndo.modifyTitle')}
          description={t('generationUndo.modifyDesc')}
          confirmLabel={t('generationUndo.modifyConfirm')}
          cancelLabel={t('cancel')}
          confirmTone="confirm"
          iconTone="accent"
          onCancel={() => setPendingEdit(null)}
          onConfirm={() => {
            const action = pendingEdit;
            setPendingEdit(null);
            setGenUndo(null);
            action();
          }}
        />
      )}
    </div>
  );
}
