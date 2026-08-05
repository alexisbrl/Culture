'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { palette, shadow } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  createWorkshopNotion,
  updateWorkshopNotion,
  deleteWorkshopNotion,
  type Notion,
} from '@/app/actions/workshopNotions';
import {
  createWorkshopChapter,
  renameWorkshopChapter,
  deleteWorkshopChapter,
  reorderWorkshopChapters,
  type Chapter,
} from '@/app/actions/workshopChapters';
import { Row, SmallBtn } from './settingsShared';

type Props = {
  workshopId: string;
  notions: Notion[];
  chapters: Chapter[];
  /** Bascule vers la section Fichiers (les notions sont issues des fichiers sources). */
  onManageFiles: () => void;
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

// Formulaire partagé ajout/édition d'une notion : titre requis, contenu et
// chapitre optionnels.
function NotionForm({
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('notions.titlePlaceholder')}
        maxLength={200}
        autoFocus
        style={inputStyle}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t('notions.contentPlaceholder')}
        maxLength={2000}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} style={inputStyle}>
        <option value="">{t('notions.noChapter')}</option>
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SmallBtn tone="ghost" onClick={onCancel} disabled={saving}>{t('notions.cancel')}</SmallBtn>
        <SmallBtn tone="dark" onClick={() => onSave(title, content, chapterId || null)} disabled={saving || !title.trim()}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : t('notions.save')}
        </SmallBtn>
      </div>
    </div>
  );
}

export default function NotionsSection({ workshopId, notions: initialNotions, chapters: initialChapters, onManageFiles }: Props) {
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

  async function handleCreate(title: string, content: string, chapterId: string | null) {
    setSaving(true);
    setError('');
    const result = await createWorkshopNotion(workshopId, title, content.trim() ? content : null, chapterId);
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

  async function handleUpdate(notionId: string, title: string, content: string, chapterId: string | null) {
    const previous = notions.find((n) => n.id === notionId);
    setSaving(true);
    setError('');
    const cleanContent = content.trim() ? content : null;
    const result = await updateWorkshopNotion(workshopId, notionId, title, cleanContent, chapterId);
    setSaving(false);
    if (result.success) {
      setNotions((prev) => prev.map((n) => (n.id === notionId ? { ...n, title: title.trim(), content: cleanContent, chapterId } : n)));
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
      if (selectedChapterId === target.id) setSelectedChapterId(UNASSIGNED);
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

  const unassignedNotions = notions.filter((n) => !n.chapterId || !chapters.some((c) => c.id === n.chapterId));
  const showUnassignedEntry = unassignedNotions.length > 0 || selectedChapterId === UNASSIGNED;
  const activeNotions = selectedChapterId === UNASSIGNED
    ? unassignedNotions
    : notions.filter((n) => n.chapterId === selectedChapterId);
  // Rien à gérer nulle part : ni chapitre, ni notion non rangée — état vide
  // fidèle à la maquette (lignes 1780-1782). Dans tous les autres cas (au
  // moins un chapitre, ou des notions sans chapitre à retrouver), la colonne
  // de droite reste utilisable même à zéro chapitre.
  const nothingToManage = chapters.length === 0 && unassignedNotions.length === 0;

  function renderNotionRow(notion: Notion) {
    if (editingId === notion.id) {
      return (
        <div key={notion.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${palette.line}` }}>
          <NotionForm
            initialTitle={notion.title}
            initialContent={notion.content ?? ''}
            initialChapterId={notion.chapterId}
            chapters={chapters}
            saving={saving}
            onSave={(title, content, chapterId) => handleUpdate(notion.id, title, content, chapterId)}
            onCancel={() => setEditingId(null)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '0 14px 12px' }}>
            <SmallBtn tone="danger" onClick={() => setDeleteTarget(notion)} disabled={saving}>
              {t('notions.delete')}
            </SmallBtn>
          </div>
        </div>
      );
    }

    return (
      <div key={notion.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '8px 14px', borderBottom: `1px solid ${palette.line}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notion.title}
          </div>
          {notion.content && (
            <div style={{ fontSize: 11.5, color: palette.inkFaint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {notion.content}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button
            onClick={() => { setEditingId(notion.id); setAdding(false); setError(''); }}
            title={t('notions.edit')}
            style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, padding: 0 }}
          >
            <Pencil size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setDeleteTarget(notion)}
            title={t('notions.delete')}
            style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, padding: 0 }}
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── En-tête + fichiers source (fonction réelle, absente de la maquette) ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, color: palette.inkFaint, marginBottom: 10 }}>{t('notions.desc')}</div>
        <Row label={t('notions.sourceFiles')} noBorder>
          <div style={{ display: 'flex', gap: 8 }}>
            <SmallBtn tone="ghost" onClick={onManageFiles}>{t('notions.manageFiles')}</SmallBtn>
            {/* Placeholder : la génération par IA arrive avec le module générateur */}
            <SmallBtn tone="dark" disabled>{t('notions.regenAI')}</SmallBtn>
          </div>
        </Row>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: palette.danger, padding: '2px 0 12px' }}>{error}</div>
      )}

      {nothingToManage ? (
        <div style={{ background: palette.cream, border: `1.5px dashed ${palette.lineStrong}`, borderRadius: 16, padding: '34px 24px', textAlign: 'center', fontSize: 13.5, color: palette.inkMuted }}>
          {t('notions.needChapterHint')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[0.85fr_1.45fr]" style={{ gap: 16, alignItems: 'start' }}>
          {/* ── Colonne Chapitres ── */}
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: palette.ink, padding: '0 2px' }}>
              {t('chapters.title')}
            </div>
            <div style={{ fontSize: 12, color: palette.inkFaint, padding: '2px 2px 8px' }}>{t('chapters.desc')}</div>
            <div style={{ background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.sm, overflow: 'hidden' }}>
              {addingChapter ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${palette.line}` }}>
                  <input
                    value={chapterName}
                    onChange={(e) => setChapterName(e.target.value)}
                    placeholder={t('chapters.namePlaceholder')}
                    maxLength={120}
                    autoFocus
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <SmallBtn tone="ghost" onClick={() => { setAddingChapter(false); setChapterName(''); }} disabled={chapterSaving}>{t('notions.cancel')}</SmallBtn>
                  <SmallBtn tone="dark" onClick={handleCreateChapter} disabled={chapterSaving || !chapterName.trim()}>{t('notions.save')}</SmallBtn>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingChapter(true); setError(''); }}
                  className="hover:bg-[var(--green-tint)]"
                  style={{ width: '100%', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderBottom: `1px solid ${palette.line}`, background: 'transparent', color: palette.greenBrand, fontSize: 13.5, fontWeight: 600 }}
                >
                  <Plus size={16} strokeWidth={2} />
                  {t('chapters.add')}
                </button>
              )}

              {chapters.length === 0 && (
                <div style={{ padding: '18px 14px', textAlign: 'center', fontSize: 12.5, color: palette.inkFaint }}>
                  {t('chapters.empty')}
                </div>
              )}

              {chapters.map((chapter, i) => {
                const isActive = selectedChapterId === chapter.id;
                if (editingChapterId === chapter.id) {
                  return (
                    <div key={chapter.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: i < chapters.length - 1 || showUnassignedEntry ? `1px solid ${palette.line}` : 'none' }}>
                      <input
                        value={editingChapterName}
                        onChange={(e) => setEditingChapterName(e.target.value)}
                        maxLength={120}
                        autoFocus
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <SmallBtn tone="ghost" onClick={() => setEditingChapterId(null)} disabled={chapterSaving}>{t('notions.cancel')}</SmallBtn>
                      <SmallBtn tone="dark" onClick={() => handleRenameChapter(chapter.id)} disabled={chapterSaving || !editingChapterName.trim()}>{t('notions.save')}</SmallBtn>
                    </div>
                  );
                }
                return (
                  <div
                    key={chapter.id}
                    onClick={() => setSelectedChapterId(chapter.id)}
                    style={{
                      position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
                      padding: '8px 14px 8px 17px', cursor: 'pointer',
                      borderBottom: i < chapters.length - 1 || showUnassignedEntry ? `1px solid ${palette.line}` : 'none',
                      background: isActive ? palette.surfaceSunken : 'transparent',
                    }}
                  >
                    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: isActive ? palette.green : 'transparent' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveChapter(i, -1); }}
                        disabled={i === 0}
                        title={t('chapters.moveUp')}
                        style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? palette.inkFaint : palette.inkMuted, padding: 0, display: 'flex' }}
                      >
                        <ChevronUp size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveChapter(i, 1); }}
                        disabled={i === chapters.length - 1}
                        title={t('chapters.moveDown')}
                        style={{ border: 'none', background: 'none', cursor: i === chapters.length - 1 ? 'default' : 'pointer', color: i === chapters.length - 1 ? palette.inkFaint : palette.inkMuted, padding: 0, display: 'flex' }}
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? palette.greenBrand : palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {chapter.name}
                      </div>
                      <div style={{ fontSize: 12, color: palette.inkMuted, marginTop: 1 }}>
                        {t('notions.count', { count: chapter.notionCount })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingChapterId(chapter.id); setEditingChapterName(chapter.name); setError(''); }}
                        title={t('chapters.rename')}
                        style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, padding: 0 }}
                      >
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setChapterDeleteTarget(chapter); }}
                        title={t('notions.delete')}
                        style={{ cursor: 'pointer', width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted, padding: 0 }}
                      >
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {showUnassignedEntry && (
                <div
                  onClick={() => setSelectedChapterId(UNASSIGNED)}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
                    padding: '8px 14px 8px 17px', cursor: 'pointer',
                    background: selectedChapterId === UNASSIGNED ? palette.surfaceSunken : 'transparent',
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: selectedChapterId === UNASSIGNED ? palette.green : 'transparent' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: selectedChapterId === UNASSIGNED ? 700 : 600, color: selectedChapterId === UNASSIGNED ? palette.greenBrand : palette.inkMuted, fontStyle: 'italic' }}>
                      {t('notions.noChapter')}
                    </div>
                    <div style={{ fontSize: 12, color: palette.inkMuted, marginTop: 1 }}>
                      {t('notions.count', { count: unassignedNotions.length })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Colonne Notions du chapitre sélectionné ── */}
          <div>
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
                <NotionForm
                  initialTitle=""
                  initialContent=""
                  initialChapterId={selectedChapterId === UNASSIGNED ? null : selectedChapterId}
                  chapters={chapters}
                  saving={saving}
                  onSave={handleCreate}
                  onCancel={() => setAdding(false)}
                />
              )}

              {activeNotions.length === 0 ? (
                <div style={{ padding: '22px 20px', textAlign: 'center', fontSize: 13, color: palette.inkMuted }}>
                  {t('notions.emptyChapter')}
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
