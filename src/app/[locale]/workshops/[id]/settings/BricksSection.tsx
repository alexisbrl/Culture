'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { palette, ink } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  createWorkshopBrick,
  updateWorkshopBrick,
  deleteWorkshopBrick,
  type Brick,
} from '@/app/actions/workshopBricks';
import { Row, SmallBtn, SectionCard } from './settingsShared';

type Props = {
  workshopId: string;
  bricks: Brick[];
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

// Formulaire partagé ajout/édition d'une brique : titre requis + contenu optionnel.
function BrickForm({
  initialTitle,
  initialContent,
  saving,
  onSave,
  onCancel,
}: {
  initialTitle: string;
  initialContent: string;
  saving: boolean;
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('settings');
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

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
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <SmallBtn tone="ghost" onClick={onCancel} disabled={saving}>{t('bricks.cancel')}</SmallBtn>
        <SmallBtn tone="dark" onClick={() => onSave(title, content)} disabled={saving || !title.trim()}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : t('bricks.save')}
        </SmallBtn>
      </div>
    </div>
  );
}

export default function BricksSection({ workshopId, bricks: initialBricks, onManageFiles }: Props) {
  const t = useTranslations('settings');
  const [bricks, setBricks] = useState<Brick[]>(initialBricks);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Brick | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate(title: string, content: string) {
    setSaving(true);
    setError('');
    const result = await createWorkshopBrick(workshopId, title, content.trim() ? content : null);
    setSaving(false);
    if (result.success && result.brick) {
      const brick = result.brick;
      setBricks((prev) => [...prev, brick]);
      setAdding(false);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleUpdate(brickId: string, title: string, content: string) {
    setSaving(true);
    setError('');
    const cleanContent = content.trim() ? content : null;
    const result = await updateWorkshopBrick(workshopId, brickId, title, cleanContent);
    setSaving(false);
    if (result.success) {
      setBricks((prev) => prev.map((b) => (b.id === brickId ? { ...b, title: title.trim(), content: cleanContent } : b)));
      setEditingId(null);
    } else {
      setError(result.error ?? t('err.save'));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    setError('');
    const result = await deleteWorkshopBrick(workshopId, target.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (result.success) {
      setBricks((prev) => prev.filter((b) => b.id !== target.id));
      if (editingId === target.id) setEditingId(null);
    } else {
      setError(result.error ?? t('err.delete'));
    }
  }

  return (
    <>
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

        {/* Liste des briques */}
        <div style={{ marginTop: 4 }}>
          {bricks.length === 0 && !adding && (
            <div style={{ fontSize: 12.5, color: palette.inkFaint, padding: '16px 0', textAlign: 'center' }}>
              {t('bricks.empty')}
            </div>
          )}
          {bricks.map((brick, i) => (
            <div key={brick.id} style={{ borderBottom: i < bricks.length - 1 ? `1px solid ${ink(0.06)}` : 'none' }}>
              {editingId === brick.id ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <BrickForm
                    initialTitle={brick.title}
                    initialContent={brick.content ?? ''}
                    saving={saving}
                    onSave={(title, content) => handleUpdate(brick.id, title, content)}
                    onCancel={() => setEditingId(null)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-start', paddingBottom: 12 }}>
                    <SmallBtn tone="danger" onClick={() => setDeleteTarget(brick)} disabled={saving}>
                      {t('bricks.delete')}
                    </SmallBtn>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#b8b1a6', fontFamily: 'ui-monospace, monospace', width: 24, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
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
              )}
            </div>
          ))}

          {adding && (
            <div style={{ borderTop: bricks.length > 0 ? `1px solid ${ink(0.06)}` : 'none' }}>
              <BrickForm
                initialTitle=""
                initialContent=""
                saving={saving}
                onSave={handleCreate}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}
        </div>

        {/* Pied : compteur + ajout */}
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
          confirmLabel={deleting ? '…' : t('bricks.delete')}
          cancelLabel={t('bricks.cancel')}
          portal
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
