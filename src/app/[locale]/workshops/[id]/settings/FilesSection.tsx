'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Download, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react';
import { palette, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  createFileUploadTicket, finalizeWorkshopFileUpload, deleteWorkshopFile, renameWorkshopFile,
  getFileDownloadUrl, type WorkshopFile,
} from '@/app/actions/workshopFiles';
import type { UploadTicket } from '@/lib/storage';
import { FileCategoryIcon, formatFileSize, SectionCard } from './settingsShared';

export default function FilesSection({ workshopId, initialFiles }: { workshopId: string; initialFiles: WorkshopFile[] }) {
  const t = useTranslations('settings');
  const fileUnits = { b: t('fileUnit.b'), kb: t('fileUnit.kb'), mb: t('fileUnit.mb') };
  const [files, setFiles] = useState<WorkshopFile[]>(initialFiles);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percent: number } | null>(null);
  const [fileError, setFileError] = useState('');
  const [fileDragOver, setFileDragOver] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [pendingDeleteFile, setPendingDeleteFile] = useState<WorkshopFile | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Téléchargement : on demande au serveur une URL signée (gestionnaire requis),
  // puis on déclenche le téléchargement côté navigateur.
  async function handleDownloadFile(fileId: string) {
    setDownloadingFileId(fileId);
    const result = await getFileDownloadUrl(workshopId, fileId);
    setDownloadingFileId(null);
    if (!result.success || !result.url) {
      setFileError(result.error ?? t('err.upload'));
      return;
    }
    const a = document.createElement('a');
    a.href = result.url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Upload direct vers le stockage via une URL signée (ticket), sans passer
  // par le serveur Next.js — contourne la limite de taille de requête de
  // Vercel pour les Server Actions.
  function uploadFileDirect(file: File, ticket: UploadTicket): Promise<boolean> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open(ticket.method, ticket.url, true);
      for (const [key, value] of Object.entries(ticket.headers)) {
        xhr.setRequestHeader(key, value);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress({ name: file.name, percent: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
  }

  async function handleFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setFileError('');

    for (const file of list) {
      setUploadProgress({ name: file.name, percent: 0 });
      const mimeType = file.type || 'application/octet-stream';

      const ticket = await createFileUploadTicket(workshopId, file.name, file.size, mimeType);
      if (!ticket.success || !ticket.ticket || !ticket.path) {
        setFileError(ticket.error ?? t('err.prepare'));
        continue;
      }

      const uploaded = await uploadFileDirect(file, ticket.ticket);
      if (!uploaded) {
        setFileError(t('err.uploadNamed', { name: file.name }));
        continue;
      }

      const result = await finalizeWorkshopFileUpload(workshopId, ticket.path, file.name, file.size, mimeType);
      if (result.success && result.file) {
        setFiles((prev) => [result.file!, ...prev]);
      } else {
        setFileError(result.error ?? t('err.save'));
      }
    }

    setUploadProgress(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    handleFiles(e.target.files);
    e.target.value = '';
  }

  function handleFileDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setFileDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }

  async function handleDeleteFile(fileId: string) {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    const result = await deleteWorkshopFile(workshopId, fileId);
    if (!result.success) {
      setFileError(result.error ?? t('err.delete'));
    }
  }

  function confirmDeleteFile() {
    if (!pendingDeleteFile) return;
    handleDeleteFile(pendingDeleteFile.id);
    setPendingDeleteFile(null);
  }

  function splitFileName(name: string): { base: string; extension: string } {
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex <= 0) return { base: name, extension: '' };
    return { base: name.slice(0, dotIndex), extension: name.slice(dotIndex) };
  }

  function startEditingFile(file: WorkshopFile) {
    setEditingFileId(file.id);
    setEditingFileName(splitFileName(file.name).base);
  }

  function cancelEditingFile() {
    setEditingFileId(null);
    setEditingFileName('');
  }

  async function handleRenameFile(fileId: string) {
    const trimmed = editingFileName.trim();
    if (!trimmed) {
      setFileError(t('err.emptyName'));
      return;
    }
    setFileError('');
    const result = await renameWorkshopFile(workshopId, fileId, trimmed);
    if (result.success && result.name) {
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: result.name! } : f)));
      cancelEditingFile();
    } else {
      setFileError(result.error ?? t('err.rename'));
    }
  }

  return (
    <>
        {/* ── Fichiers ── */}
        <SectionCard
          title={t('files.title')}
          description={t('files.desc')}
        >
          {/* Zone de dépôt — bordure pointillée `--line-strong`, vire au vert au
              survol/glisser-déposer (getter réel de la maquette, lignes 1600-1607
              de App-Culture.dc.html) plutôt qu'à l'ambre de l'ancien habillage. */}
          <label
            onDragOver={(e) => { e.preventDefault(); if (uploadProgress === null) setFileDragOver(true); }}
            onDragLeave={() => setFileDragOver(false)}
            onDrop={handleFileDrop}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textAlign: 'center',
              cursor: uploadProgress !== null ? 'default' : 'pointer',
              padding: '26px 20px',
              background: fileDragOver ? withAlpha(palette.green, 0.06) : 'transparent',
              border: `1.5px dashed ${fileDragOver ? palette.green : palette.lineStrong}`,
              borderRadius: 16,
              marginBottom: files.length > 0 ? 16 : 0,
              transition: 'border-color 160ms, background 160ms',
              position: 'relative',
            }}
          >
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              disabled={uploadProgress !== null}
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
            />
            <span style={{ width: 44, height: 44, borderRadius: 12, background: withAlpha(palette.green, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.greenBrand, flexShrink: 0 }}>
              {uploadProgress !== null ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={20} strokeWidth={1.75} />}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: palette.ink }}>
              {uploadProgress !== null ? t('files.uploading', { percent: uploadProgress.percent }) : t('files.addFile')}
            </span>
            <span style={{ fontSize: 12.5, color: palette.inkFaint }}>{t('files.addFileHint')}</span>
          </label>

          {uploadProgress !== null && (
            <div style={{ padding: '10px 0 8px' }}>
              <ProgressBar
                value={uploadProgress.percent}
                label={uploadProgress.name}
                showValue
                size="sm"
              />
            </div>
          )}

          {fileError && (
            <div style={{ fontSize: 12, color: palette.danger, padding: '6px 0' }}>{fileError}</div>
          )}

          {files.length === 0 ? (
            <div style={{ fontSize: 12.5, color: palette.inkFaint, padding: '14px 0' }}>
              {t('files.noFiles')}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {[...files]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((file, i, arr) => {
                  const { base, extension } = splitFileName(file.name);
                  const isEditing = editingFileId === file.id;
                  return (
                  <div
                    key={file.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minHeight: 48,
                      padding: '8px 0',
                      borderBottom: i < arr.length - 1 ? `1px solid ${palette.line}` : 'none',
                    }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: withAlpha(palette.amber, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileCategoryIcon category={file.category} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="text"
                            value={editingFileName}
                            onChange={(e) => setEditingFileName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameFile(file.id);
                              if (e.key === 'Escape') cancelEditingFile();
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              color: palette.ink,
                              border: `1px solid ${palette.lineStrong}`,
                              borderRadius: 9,
                              padding: '7px 9px',
                              background: palette.surfaceInput,
                              outline: 'none',
                              boxSizing: 'border-box',
                              minHeight: 32,
                            }}
                          />
                          {extension && (
                            <span style={{ fontSize: 13, color: palette.inkFaint, flexShrink: 0 }}>{extension}</span>
                          )}
                          <button
                            onClick={() => handleRenameFile(file.id)}
                            title={t('files.saveTitle')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: withAlpha(palette.green, 0.10), border: `1px solid ${withAlpha(palette.green, 0.30)}`, color: palette.greenBrand, cursor: 'pointer', flexShrink: 0 }}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            onClick={cancelEditingFile}
                            title={t('files.cancelTitle')}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 9, background: 'transparent', border: `1px solid ${palette.lineStrong}`, color: palette.inkMuted, cursor: 'pointer', flexShrink: 0 }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 13,
                            color: palette.ink,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {base}
                          {extension && <span style={{ color: palette.inkFaint }}>{extension}</span>}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: palette.inkFaint, marginTop: 2 }}>
                        {formatFileSize(file.size, fileUnits)}
                      </div>
                    </div>
                    {!isEditing && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => handleDownloadFile(file.id)}
                          disabled={downloadingFileId === file.id}
                          title={t('files.downloadTitle')}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, borderRadius: 9,
                            background: 'transparent', border: `1px solid ${palette.lineStrong}`,
                            color: palette.inkMuted, cursor: 'pointer',
                          }}
                        >
                          {downloadingFileId === file.id ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> : <Download size={14} strokeWidth={1.75} />}
                        </button>
                        <button
                          onClick={() => startEditingFile(file)}
                          title={t('files.renameTitle')}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, borderRadius: 9,
                            background: 'transparent', border: `1px solid ${palette.lineStrong}`,
                            color: palette.inkMuted, cursor: 'pointer',
                          }}
                        >
                          <Pencil size={14} strokeWidth={1.75} />
                        </button>
                        <button
                          onClick={() => setPendingDeleteFile(file)}
                          title={t('files.deleteTitle')}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 32, height: 32, borderRadius: 9,
                            background: withAlpha(palette.danger, 0.10), border: `1px solid ${withAlpha(palette.danger, 0.30)}`,
                            color: palette.danger, cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
            </div>
          )}
        </SectionCard>
      {/* ── Modale « confirmation suppression fichier » ── */}
      {pendingDeleteFile && (
        <ConfirmDialog
          width={400}
          icon={<Trash2 size={17} />}
          title={t('files.deleteFileTitle')}
          description={t('files.deleteFileDesc', { name: pendingDeleteFile.name })}
          confirmLabel={t('delete')}
          onCancel={() => setPendingDeleteFile(null)}
          onConfirm={confirmDeleteFile}
        />
      )}
    </>
  );
}
