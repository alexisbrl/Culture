'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { palette, ink } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  createWorkshopBrick,
  updateWorkshopBrick,
  deleteWorkshopBrick,
  type Brick,
} from '@/app/actions/workshopBricks';
import {
  createWorkshopChapter,
  renameWorkshopChapter,
  deleteWorkshopChapter,
  reorderWorkshopChapters,
  type Chapter,
} from '@/app/actions/workshopChapters';
import { Row, SmallBtn, SectionCard } from './settingsShared';

type Props = {
  workshopId: string;
  bricks: Brick[];
  chapters: Chapter[];
  /** Bascule vers la section Fichiers (les briques sont issues des fichiers sources). */
  onManageFiles: () => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 9,
  border: `1px solid ${ink(0.14)}`,
  background: palette.paper,
  color: palette.ink,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

// Formulaire partagé ajout/édition d'une brique : titre requis, contenu et
// chapitre optionnels.
function BrickForm({
  initialTitle,
  initialContent,
  initialChapterId,
  chapters,
  saving,
  onSave,
  onCancel,
}: {
  initialTitle: string;
  initialContent: string;
  initialChapterId: string | null;
  chapters: Chapter[];
  saving: boolean;
  onSave: (title: string, content: string, chapterId: string | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('settings');
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [chapterId, setChapterId] = useState<string>(initialChapterId ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('bricks.titlePlaceholder')}
        maxLength={200}
        autoFocus
        style={inputStyle}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('bricks.contentPlaceholder')}
        maxLength={2000}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} style={inputStyle}>
        <option value="">{t('bricks.noChapter')}</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SmallBtn tone="ghost" onClick={onCancel} disabled={saving}>{t('bricks.cancel')}</SmallBtn>
        <SmallBtn tone="dark" onClick={() => onSave(title, content, chapterId || null)} disabled={saving || !title.trim()}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : t('bricks.save')}
        </SmallBtn>
      </div>
    </div>
  );
}

export default function BricksSection({ workshopId, bricks: initialBricks, chapters: initialChapters, onManageFiles }: Props) {
  const t = useTranslations('settings');
  const [bricks, setBricks] = useState<Brick[]>(initialBricks);
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Brick | null>(null);

  // Chapitres
  const [addingChapter, setAddingChapter] = useState(false);
  const [chapterName, setChapterName] = useState('');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingChapterName, setEditingChapterName] = useState('');
  const [chapterSaving, setChapterSaving] = useState(false);
  const [chapterDeleteTarget, setChapterDeleteTarget] = useState<Chapter | null>(null);

  // ─── Briques ──────────────────────────────────────────────────────────────

  async function handleCreate(title: string, content: string, chapterId: string | null) {
    setSaving(true);
    setError('');
    const result = await createWorkshopBrick(workshopId, title, content.trim() ? content : null, chapterId);
    setSaving(false);
    if (result.success && result.brick) {
      const brick = result.brick;
      setBricks((prev) => [...prev, brick]);
      bumpChapterCount(chapterId, +1);
      setAdding(false);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleUpdate(brickId: string, title: string, content: string, chapterId: string | null) {
    const previous = bricks.find((b) => b.id === brickId);
    setSaving(true);
    setError('');
    const cleanContent = content.trim() ? content : null;
    const result = await updateWorkshopBrick(workshopId, brickId, title, cleanContent, chapterId);
    setSaving(false);
    if (result.success) {
      setBricks((prev) => prev.map((b) => (b.id === brickId ? { ...b, title: title.trim(), content: cleanContent, chapterId } : b)));
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
    const result = await deleteWorkshopBrick(workshopId, target.id);
    setDeleteTarget(null);
    if (result.success) {
      setBricks((prev) => prev.filter((b) => b.id !== target.id));
      bumpChapterCount(target.chapterId, -1);
      if (editingId === target.id) setEditingId(null);
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  function bumpChapterCount(chapterId: string | null, delta: number) {
    if (!chapterId) return;
    setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, brickCount: Math.max(0, c.brickCount + delta) } : c)));
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
      // Les briques du chapitre ne sont pas supprimées : elles retombent dans
      // « sans chapitre » (FK en `on delete set null`).
      setBricks((prev) => prev.map((b) => (b.chapterId === target.id ? { ...b, chapterId: null } : b)));
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  async function moveChapter(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= chapters.length) return;

    const reordered = [...chapters];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
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

  // Briques groupées par chapitre, dans l'ordre des chapitres ; les briques non
  // rangées ferment la liste.
  const groups: Array<{ chapter: Chapter | null; items: Brick[] }> = [
    ...chapters.map((chapter) => ({ chapter, items: bricks.filter((b) => b.chapterId === chapter.id) })),
    { chapter: null, items: bricks.filter((b) => !b.chapterId || !chapters.some((c) => c.id === b.chapterId)) },
  ];

  function renderBrick(brick: Brick, index: number) {
    if (editingId === brick.id) {
      return (
        <div key={brick.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${ink(0.06)}` }}>
          <BrickForm
            initialTitle={brick.title}
            initialContent={brick.content ?? ''}
            initialChapterId={brick.chapterId}
            chapters={chapters}
            saving={saving}
            onSave={(title, content, chapterId) => handleUpdate(brick.id, title, content, chapterId)}
            onCancel={() => setEditingId(null)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-start', paddingBottom: 12 }}>
            <SmallBtn tone="danger" onClick={() => setDeleteTarget(brick)} disabled={saving}>
              {t('bricks.delete')}
            </SmallBtn>
          </div>
        </div>
      );
    }

    return (
      <div key={brick.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${ink(0.06)}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#b8b1a6', fontFamily: 'ui-monospace, monospace', width: 24, flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {brick.title}
          </div>
          {brick.content && (
            <div style={{ fontSize: 11.5, color: palette.inkFaint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {brick.content}
            </div>
          )}
        </div>
        <SmallBtn tone="ghost" onClick={() => { setEditingId(brick.id); setAdding(false); setError(''); }}>
          {t('bricks.edit')}
        </SmallBtn>
      </div>
    );
  }

  return (
    <>
      {/* ── Chapitres ── */}
      <SectionCard title={t('chapters.title')} description={t('chapters.desc')}>
        {chapters.length === 0 && !addingChapter && (
          <div style={{ fontSize: 12.5, color: palette.inkFaint, padding: '16px 0', textAlign: 'center' }}>
            {t('chapters.empty')}
          </div>
        )}

        {chapters.map((chapter, i) => (
          <div key={chapter.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: `1px solid ${ink(0.06)}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                onClick={() => moveChapter(i, -1)}
                disabled={i === 0}
                title={t('chapters.moveUp')}
                style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? ink(0.14) : palette.inkMuted, padding: 0, display: 'flex' }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => moveChapter(i, 1)}
                disabled={i === chapters.length - 1}
                title={t('chapters.moveDown')}
                style={{ border: 'none', background: 'none', cursor: i === chapters.length - 1 ? 'default' : 'pointer', color: i === chapters.length - 1 ? ink(0.14) : palette.inkMuted, padding: 0, display: 'flex' }}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#b8b1a6', fontFamily: 'ui-monospace, monospace', width: 24, flexShrink: 0 }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            {editingChapterId === chapter.id ? (
              <>
                <input
                  value={editingChapterName}
                  onChange={(e) => setEditingChapterName(e.target.value)}
                  maxLength={120}
                  autoFocus
                  style={{ ...inputStyle, flex: 1 }}
                />
                <SmallBtn tone="ghost" onClick={() => setEditingChapterId(null)} disabled={chapterSaving}>{t('bricks.cancel')}</SmallBtn>
                <SmallBtn tone="dark" onClick={() => handleRenameChapter(chapter.id)} disabled={chapterSaving || !editingChapterName.trim()}>{t('bricks.save')}</SmallBtn>
              </>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.name}</div>
                  <div style={{ fontSize: 11.5, color: palette.inkFaint, marginTop: 2 }}>{t('bricks.count', { count: chapter.brickCount })}</div>
                </div>
                <SmallBtn tone="ghost" onClick={() => { setEditingChapterId(chapter.id); setEditingChapterName(chapter.name); setError(''); }}>
                  {t('chapters.rename')}
                </SmallBtn>
                <SmallBtn tone="danger" onClick={() => setChapterDeleteTarget(chapter)}>{t('bricks.delete')}</SmallBtn>
              </>
            )}
          </div>
        ))}

        {addingChapter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <input
              value={chapterName}
              onChange={(e) => setChapterName(e.target.value)}
              placeholder={t('chapters.namePlaceholder')}
              maxLength={120}
              autoFocus
              style={{ ...inputStyle, flex: 1 }}
            />
            <SmallBtn tone="ghost" onClick={() => { setAddingChapter(false); setChapterName(''); }} disabled={chapterSaving}>{t('bricks.cancel')}</SmallBtn>
            <SmallBtn tone="dark" onClick={handleCreateChapter} disabled={chapterSaving || !chapterName.trim()}>{t('bricks.save')}</SmallBtn>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${ink(0.06)}`, marginTop: 4, paddingBottom: 10 }}>
          <span style={{ fontSize: 12, color: palette.inkFaint }}>{t('chapters.count', { count: chapters.length })}</span>
          {!addingChapter && (
            <SmallBtn tone="ghost" onClick={() => { setAddingChapter(true); setError(''); }}>{t('chapters.add')}</SmallBtn>
          )}
        </div>
      </SectionCard>

      {/* ── Briques ── */}
      <SectionCard title={t('bricks.title')} description={t('bricks.desc')}>
        <Row label={t('bricks.sourceFiles')} noBorder={false}>
          <div style={{ display: 'flex', gap: 8 }}>
            <SmallBtn tone="ghost" onClick={onManageFiles}>{t('bricks.manageFiles')}</SmallBtn>
            {/* Placeholder : la génération par IA arrive avec le module générateur */}
            <SmallBtn tone="dark" disabled>{t('bricks.regenAI')}</SmallBtn>
          </div>
        </Row>

        {error && (
          <div style={{ fontSize: 12, color: palette.danger, padding: '10px 0', borderBottom: `1px solid ${ink(0.06)}` }}>{error}</div>
        )}

        <div style={{ marginTop: 4 }}>
          {bricks.length === 0 && !adding && (
            <div style={{ fontSize: 12.5, color: palette.inkFaint, padding: '16px 0', textAlign: 'center' }}>
              {t('bricks.empty')}
            </div>
          )}

          {bricks.length > 0 && groups.map(({ chapter, items }) => {
            // On masque le groupe « sans chapitre » quand il est vide, mais on
            // garde un chapitre vide visible (il existe, il a juste 0 brique).
            if (!chapter && items.length === 0) return null;
            return (
              <div key={chapter?.id ?? 'unassigned'}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.inkSoft, padding: '14px 0 6px' }}>
                  {chapter ? chapter.name : t('bricks.noChapter')}
                </div>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12, color: palette.inkFaint, padding: '6px 0 10px' }}>{t('bricks.emptyChapter')}</div>
                ) : (
                  items.map((brick, i) => renderBrick(brick, i))
                )}
              </div>
            );
          })}

          {adding && (
            <BrickForm
              initialTitle=""
              initialContent=""
              initialChapterId={null}
              chapters={chapters}
              saving={saving}
              onSave={handleCreate}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${ink(0.06)}`, marginTop: 4, paddingBottom: 10 }}>
          <span style={{ fontSize: 12, color: palette.inkFaint }}>{t('bricks.count', { count: bricks.length })}</span>
          {!adding && (
            <SmallBtn tone="ghost" onClick={() => { setAdding(true); setEditingId(null); setError(''); }}>
              {t('bricks.add')}
            </SmallBtn>
          )}
        </div>
      </SectionCard>

      {deleteTarget && (
        <ConfirmDialog
          title={t('bricks.deleteTitle')}
          description={t('bricks.deleteDesc', { title: deleteTarget.title })}
          confirmLabel={t('bricks.delete')}
          cancelLabel={t('bricks.cancel')}
          portal
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {chapterDeleteTarget && (
        <ConfirmDialog
          title={t('chapters.deleteTitle')}
          description={t('chapters.deleteDesc', { name: chapterDeleteTarget.name })}
          confirmLabel={t('bricks.delete')}
          cancelLabel={t('bricks.cancel')}
          portal
          onConfirm={handleDeleteChapter}
          onCancel={() => setChapterDeleteTarget(null)}
        />
      )}
    </>
  );
}
