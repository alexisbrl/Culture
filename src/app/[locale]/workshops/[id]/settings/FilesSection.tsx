'use client';

import { useState, useRef } from 'react';
import { Check, Download, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react';
import { palette, ink, withAlpha } from '@/lib/theme';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  createFileUploadTicket, finalizeWorkshopFileUpload, deleteWorkshopFile, renameWorkshopFile,
  getFileDownloadUrl, type WorkshopFile,
} from '@/app/actions/workshopFiles';
import type { UploadTicket } from '@/lib/storage';
import { FileCategoryIcon, formatFileSize, Row, SmallBtn, SectionCard } from './settingsShared';

export default function FilesSection({ workshopId, initialFiles }: { workshopId: string; initialFiles: WorkshopFile[] }) {
  const [files, setFiles] = useState<WorkshopFile[]>(initialFiles);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percent: number } | null>(null);
  const [fileError, setFileError] = useState('');
  const [fileDragOver, setFileDragOver] = useState(false);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [pendingDeleteFile, setPendingDeleteFile] = useState<WorkshopFile | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Téléchargement : on demande au serveur une URL signée (gestionnaire requis),
  // puis on déclenche le téléchargement côté navigateur.
  async function handleDownloadFile(fileId: string) {
    setDownloadingFileId(fileId);
    const result = await getFileDownloadUrl(workshopId, fileId);
    setDownloadingFileId(null);
    if (!result.success || !result.url) {
      setFileError(result.error ?? 'Erreur lors du téléchargement');
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
        setFileError(ticket.error ?? 'Erreur lors de la préparation du téléchargement');
        continue;
      }

      const uploaded = await uploadFileDirect(file, ticket.ticket);
      if (!uploaded) {
        setFileError(`Erreur lors du téléchargement de « ${file.name} »`);
        continue;
      }

      const result = await finalizeWorkshopFileUpload(workshopId, ticket.path, file.name, file.size, mimeType);
      if (result.success && result.file) {
        setFiles((prev) => [result.file!, ...prev]);
      } else {
        setFileError(result.error ?? 'Erreur lors de l’enregistrement');
      }
    }

    setUploadProgress(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    handleFiles(e.target.files);
    e.target.value = '';
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setFileDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }

  async function handleDeleteFile(fileId: string) {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    const result = await deleteWorkshopFile(workshopId, fileId);
    if (!result.success) {
      setFileError(result.error ?? 'Erreur lors de la suppression');
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
      setFileError('Le nom ne peut pas être vide');
      return;
    }
    setFileError('');
    const result = await renameWorkshopFile(workshopId, fileId, trimmed);
    if (result.success && result.name) {
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, name: result.name! } : f)));
      cancelEditingFile();
    } else {
      setFileError(result.error ?? 'Erreur lors du renommage');
    }
  }

  return (
    <>
        {/* ── Fichiers ── */}
        <SectionCard
          title="Fichiers"
          description="Tous les fichiers déposés dans cet atelier, triés par nom."
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setFileDragOver(true); }}
            onDragLeave={() => setFileDragOver(false)}
            onDrop={handleFileDrop}
            style={{
              border: `1.5px dashed ${fileDragOver ? palette.amber : ink(0.14)}`,
              borderRadius: 12,
              background: fileDragOver ? withAlpha(palette.amber, 0.06) : 'transparent',
              padding: '14px 16px',
              marginBottom: files.length > 0 ? 8 : 0,
              transition: 'all 0.12s',
            }}
          >
            <Row label="Ajouter un fichier" hint="glisser-déposer ou parcourir · taille max. 50 Mo" noBorder>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <SmallBtn tone="dark" onClick={() => fileInputRef.current?.click()} disabled={uploadProgress !== null}>
                {uploadProgress !== null ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> téléchargement… {uploadProgress.percent}%
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Upload size={13} /> ajouter un fichier
                  </span>
                )}
              </SmallBtn>
            </Row>
          </div>

          {uploadProgress !== null && (
            <div style={{ padding: '2px 0 8px' }}>
              <div style={{ fontSize: 11.5, color: palette.inkFaint, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {uploadProgress.name}
              </div>
              <div style={{ height: 4, borderRadius: 999, background: ink(0.08), overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${uploadProgress.percent}%`,
                    background: palette.amber,
                    borderRadius: 999,
                    transition: 'width 0.15s',
                  }}
                />
              </div>
            </div>
          )}

          {fileError && (
            <div style={{ fontSize: 12, color: palette.danger, padding: '6px 0' }}>{fileError}</div>
          )}

          {files.length === 0 ? (
            <div style={{ fontSize: 12.5, color: palette.inkFaint, padding: '14px 0' }}>
              aucun fichier déposé pour l’instant.
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
                      padding: '11px 0',
                      borderBottom: i < arr.length - 1 ? '1px solid rgba(45,42,36,0.06)' : 'none',
                    }}
                  >
                    <FileCategoryIcon category={file.category} />
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
                              border: `1px solid ${withAlpha(palette.amber, 0.40)}`,
                              borderRadius: 6,
                              padding: '3px 6px',
                              background: palette.paper,
                              outline: 'none',
                            }}
                          />
                          {extension && (
                            <span style={{ fontSize: 13, color: palette.inkFaint, flexShrink: 0 }}>{extension}</span>
                          )}
                          <button
                            onClick={() => handleRenameFile(file.id)}
                            title="enregistrer"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.greenSoft, display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            onClick={cancelEditingFile}
                            title="annuler"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.inkGhost, display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0 }}
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
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => handleDownloadFile(file.id)}
                          disabled={downloadingFileId === file.id}
                          title="télécharger"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: palette.inkGhost,
                            display: 'flex',
                            alignItems: 'center',
                            padding: 4,
                          }}
                        >
                          {downloadingFileId === file.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        </button>
                        <button
                          onClick={() => startEditingFile(file)}
                          title="renommer"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: palette.inkGhost,
                            display: 'flex',
                            alignItems: 'center',
                            padding: 4,
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setPendingDeleteFile(file)}
                          title="supprimer"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: palette.inkGhost,
                            display: 'flex',
                            alignItems: 'center',
                            padding: 4,
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
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
          title="Supprimer ce fichier ?"
          description={<>&quot;{pendingDeleteFile.name}&quot; sera définitivement supprimé. Cette action est irréversible.</>}
          confirmLabel="Supprimer"
          onCancel={() => setPendingDeleteFile(null)}
          onConfirm={confirmDeleteFile}
        />
      )}
    </>
  );
}
