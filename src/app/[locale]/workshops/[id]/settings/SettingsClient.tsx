'use client';

import { palette, ink, withAlpha } from '@/lib/theme';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronLeft, Download, FileText, Loader2, Mail, Music, Pencil, QrCode, RotateCcw, Trash2, Upload, UserPlus, X, File as FileIcon } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import { requestDeletionCode, confirmDeletion, updateWorkshopDetails, uploadWorkshopCover, activateWorkshopPremium, inviteMemberByTag, getWorkshopInvitations, cancelInvitation, setMemberRole, removeMember, getJoinRequests, approveJoinRequest, rejectJoinRequest, type PendingInvite } from '@/app/actions/workshops';
import { createFileUploadTicket, finalizeWorkshopFileUpload, deleteWorkshopFile, renameWorkshopFile, getFileDownloadUrl, type WorkshopFile, type FileCategory } from '@/app/actions/workshopFiles';
import type { UploadTicket } from '@/lib/storage';
import { COVER_GRADIENTS, COVER_GRADIENT_KEYS, COVER_EMOJIS, coverGradientFor, emojiFor } from '@/lib/workshopCover';
import ShareQRModal from '@/components/ShareQRModal';

type WorkshopRole = 'owner' | 'manager' | 'member';

type Member = {
  id: string;
  userId: string;
  role: WorkshopRole;
  joinedAt: string;
  displayName: string;
  uniqueTag: string;
};

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  description: string | null;
  coverGradient: string | null;
  coverImageUrl: string | null;
  coverImageActive: boolean;
  emoji: string | null;
  createdAt: string;
  uniqueTag: string | null;
  currentUserRole: WorkshopRole;
  isPremium: boolean;
  showProgramme: boolean;
  members: Member[];
  files: WorkshopFile[];
};

type NavSection = 'general' | 'members' | 'bricks' | 'files' | 'premium';

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: 'general', label: 'Général' },
  { id: 'members', label: 'Membres & rôles' },
  { id: 'files', label: 'Fichiers' },
  { id: 'bricks', label: 'Briques de connaissance' },
  { id: 'premium', label: 'Atelier Premium' },
];

const ROLE_RANK: Record<WorkshopRole, number> = { owner: 3, manager: 2, member: 1 };
const ROLE_LABEL: Record<WorkshopRole, string> = { owner: 'propriétaire', manager: 'gestionnaire', member: 'membre' };

function FileCategoryIcon({ category }: { category: FileCategory }) {
  const props = { size: 18, style: { color: palette.amber, flexShrink: 0 } };
  if (category === 'audio') return <Music {...props} />;
  if (category === 'texte') return <FileText {...props} />;
  return <FileIcon {...props} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const MOCK_BRICKS = [
  { section: '01', title: 'La membrane est une bicouche phospholipidique fluide', diff: 3, imp: 5 },
  { section: '01', title: 'Les protéines membranaires permettent le transport sélectif', diff: 5, imp: 5 },
  { section: '02', title: 'Le cytosquelette structure et déplace la cellule', diff: 4, imp: 4 },
  { section: '03', title: "La mitochondrie produit l'ATP par phosphorylation oxydative", diff: 7, imp: 6 },
  { section: '03', title: 'Le cycle de Krebs se déroule dans la matrice mitochondriale', diff: 8, imp: 6 },
];

function avatarGradient(name: string) {
  const hues = [220, 160, 30, 270, 190, 340, 80, 130];
  const idx = name.charCodeAt(0) % hues.length;
  const h = hues[idx];
  return `linear-gradient(135deg, hsl(${h},55%,62%), hsl(${(h + 40) % 360},60%,52%))`;
}

function DotRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: palette.inkFaint, width: 28 }}>{label}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i < value ? palette.amber : ink(0.12),
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Row({
  label,
  hint,
  children,
  noBorder,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  noBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '14px 0',
        borderBottom: noBorder ? 'none' : `1px solid ${ink(0.06)}`,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 450, color: palette.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: palette.inkFaint, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: 'none',
        background: value ? palette.greenSoft : ink(0.14),
        cursor: 'pointer',
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: value ? 'flex-end' : 'flex-start',
        transition: 'all 0.18s',
        flexShrink: 0,
      }}
      aria-checked={value}
      role="switch"
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: palette.paper,
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        }}
      />
    </button>
  );
}

function SmallBtn({
  children,
  tone = 'ghost',
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  tone?: 'ghost' | 'danger' | 'dark' | 'amber';
  onClick?: () => void;
  disabled?: boolean;
}) {
  const styles = {
    ghost: {
      bg: 'transparent',
      border: `1px solid ${ink(0.16)}`,
      color: palette.inkMuted,
    },
    danger: {
      bg: withAlpha(palette.danger, 0.10),
      border: `1px solid ${withAlpha(palette.danger, 0.30)}`,
      color: palette.danger,
    },
    dark: {
      bg: palette.ink,
      border: '1px solid #2d2a24',
      color: palette.paper,
    },
    amber: {
      bg: palette.amber,
      border: '1px solid #a87a3a',
      color: palette.paper,
    },
  }[tone];

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px',
        borderRadius: 9,
        background: disabled ? ink(0.12) : styles.bg,
        border: disabled ? '1px solid rgba(45,42,36,0.12)' : styles.border,
        color: disabled ? palette.inkFaint : styles.color,
        fontSize: 12.5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        fontWeight: 450,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: palette.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: palette.inkFaint }}>{description}</div>
      </div>
      <div
        style={{
          background: withAlpha(palette.paper, 0.85),
          borderRadius: 14,
          border: `1px solid ${ink(0.07)}`,
          padding: '6px 18px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function SettingsClient({ locale, workshopId, workshopName, description, coverGradient, coverImageUrl, coverImageActive, emoji, createdAt, uniqueTag, currentUserRole, isPremium, showProgramme: showProgrammeProp, members, files: initialFiles }: Props) {
  const router = useRouter();

  // Propriétaire vs gestionnaire : seul le propriétaire touche à l'argent (Premium)
  // et à la suppression de l'atelier ; le reste est accessible aux deux.
  const isOwner = currentUserRole === 'owner';
  const actorRank = ROLE_RANK[currentUserRole];

  const [activeSection, setActiveSection] = useState<NavSection>('general');

  // Section — Fichiers
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

  // Section 5 — Atelier Premium (activation de test par mot de passe)
  const [premiumPassword, setPremiumPassword] = useState('');
  const [premiumError, setPremiumError] = useState('');
  const [activatingPremium, setActivatingPremium] = useState(false);
  const [showPremiumConfirm, setShowPremiumConfirm] = useState(false);

  async function handleActivatePremium() {
    setActivatingPremium(true);
    setPremiumError('');
    const result = await activateWorkshopPremium(workshopId, premiumPassword);
    setActivatingPremium(false);
    if (result.success) {
      setShowPremiumConfirm(false);
      router.refresh();
    } else {
      setPremiumError(result.error ?? 'Erreur');
    }
  }

  // Section 1 — General
  const [workshopNameInput, setWorkshopNameInput] = useState(workshopName);
  const [descriptionInput, setDescriptionInput] = useState(description ?? '');
  const [selectedCover, setSelectedCover] = useState(coverGradientFor(workshopId, coverGradient));
  const [selectedEmoji, setSelectedEmoji] = useState(emojiFor(workshopId, emoji));
  const [coverImage, setCoverImage] = useState(coverImageUrl);
  const [useCustomCover, setUseCustomCover] = useState(coverImageActive);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  async function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploadingCover(true);
    const formData = new FormData();
    formData.append('file', file);
    const result = await uploadWorkshopCover(workshopId, formData);
    setUploadingCover(false);
    if (result.success && result.url) {
      setCoverImage(result.url);
      setUseCustomCover(true);
    } else {
      setUploadError(result.error ?? 'Erreur lors du téléchargement');
    }
    e.target.value = '';
  }

  function handleRemoveCoverImage() {
    const wasActive = useCustomCover;
    setCoverImage(null);
    setUseCustomCover(false);
    if (wasActive) {
      const others = COVER_GRADIENT_KEYS.filter((k) => k !== selectedCover);
      const pool = others.length > 0 ? others : COVER_GRADIENT_KEYS;
      setSelectedCover(pool[Math.floor(Math.random() * pool.length)]);
    }
  }

  // Section 2 — Accès & limites
  // Tous les ateliers sont privés : on rejoint un atelier uniquement sur invitation
  // ou via une demande d'adhésion validée par un gestionnaire. Il n'y a donc plus de
  // réglage public/privé (cf. audit §1.2).
  const [showProgramme, setShowProgramme] = useState(showProgrammeProp);

  // Valeurs courantes de tous les champs des sections « Général » et « Visibilité & accès ».
  // Toute clé ajoutée ici (et au snapshot ci-dessous) participe automatiquement à isDirty
  // et à la sauvegarde — aucune autre modification n'est nécessaire pour une future ligne.
  const formValues = {
    name: workshopNameInput,
    description: descriptionInput,
    cover: selectedCover,
    emoji: selectedEmoji,
    coverImage,
    useCustomCover,
    showProgramme,
  };

  // Baseline used to detect unsaved changes
  const [savedSnapshot, setSavedSnapshot] = useState(formValues);

  const isDirty = JSON.stringify(formValues) !== JSON.stringify(savedSnapshot);

  const canSave = workshopNameInput.trim().length > 0;

  async function handleSaveDetails() {
    if (!canSave) return;
    setSavingDetails(true);
    setDetailsSaved(false);
    const result = await updateWorkshopDetails(workshopId, {
      name: workshopNameInput.trim(),
      description: descriptionInput,
      coverGradient: selectedCover,
      coverImageUrl: coverImage,
      coverImageActive: useCustomCover,
      emoji: selectedEmoji,
      showProgramme,
    });
    setSavingDetails(false);
    if (result.success) {
      const trimmedName = workshopNameInput.trim();
      setWorkshopNameInput(trimmedName);
      setSavedSnapshot({ ...formValues, name: trimmedName });
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 2000);
    }
  }

  // Section 3 — Members
  const [tagInput, setTagInput] = useState('');
  const [localMembers, setLocalMembers] = useState<Member[]>(members);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [cancelingInvite, setCancelingInvite] = useState<string | null>(null);

  // Demandes d'adhésion en attente (valables pour TOUS les ateliers, pas seulement Premium).
  const [joinRequests, setJoinRequests] = useState<PendingInvite[]>([]);
  const [joinReqActionId, setJoinReqActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPremium) return;
    getWorkshopInvitations(workshopId).then(setPendingInvites).catch(console.error);
  }, [isPremium, workshopId]);

  useEffect(() => {
    getJoinRequests(workshopId).then(setJoinRequests).catch(console.error);
  }, [workshopId]);

  async function handleApproveJoinRequest(targetUserId: string) {
    setJoinReqActionId(targetUserId);
    const result = await approveJoinRequest(workshopId, targetUserId);
    setJoinReqActionId(null);
    if (!result.success) return;
    const approved = joinRequests.find((r) => r.userId === targetUserId);
    setJoinRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
    if (approved) {
      setLocalMembers((prev) => [
        ...prev,
        {
          id: `req-${targetUserId}`,
          userId: targetUserId,
          role: 'member',
          joinedAt: new Date().toISOString(),
          displayName: approved.displayName,
          uniqueTag: approved.uniqueTag,
        },
      ]);
    }
  }

  async function handleRejectJoinRequest(targetUserId: string) {
    setJoinReqActionId(targetUserId);
    const result = await rejectJoinRequest(workshopId, targetUserId);
    setJoinReqActionId(null);
    if (result.success) {
      setJoinRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
    }
  }

  async function handleInvite() {
    const tag = tagInput.trim();
    if (!tag || inviting) return;
    setInviting(true);
    setInviteMsg(null);
    const result = await inviteMemberByTag(workshopId, tag);
    setInviting(false);
    if (result.success) {
      setInviteMsg({ type: 'success', text: `Invitation envoyée à ${result.displayName ?? tag}.` });
      setTagInput('');
      getWorkshopInvitations(workshopId).then(setPendingInvites).catch(console.error);
    } else {
      setInviteMsg({ type: 'error', text: result.error ?? 'Erreur lors de l’envoi' });
    }
  }

  async function handleCancelInvite(targetUserId: string) {
    setCancelingInvite(targetUserId);
    const result = await cancelInvitation(workshopId, targetUserId);
    setCancelingInvite(null);
    if (result.success) {
      setPendingInvites((prev) => prev.filter((p) => p.userId !== targetUserId));
    }
  }

  // ── Gestion des rôles / exclusion (règles de rang appliquées côté serveur) ──
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  async function handleSetRole(m: Member, newRole: 'manager' | 'member') {
    setMemberActionId(m.id);
    const res = await setMemberRole(workshopId, m.userId, newRole);
    setMemberActionId(null);
    if (res.success) {
      setLocalMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, role: newRole } : x)));
    }
  }

  async function handleExcludeMember(m: Member) {
    setMemberActionId(m.id);
    const res = await removeMember(workshopId, m.userId);
    setMemberActionId(null);
    if (res.success) {
      setLocalMembers((prev) => prev.filter((x) => x.id !== m.id));
    }
  }

  // Confirmation de sortie (modifications non enregistrées)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // URL vers laquelle naviguer une fois la confirmation résolue (lien cliqué intercepté).
  // Si null, le bouton « retour à l'atelier » est utilisé par défaut.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Avertir avant de fermer/recharger l'onglet si des modifications ne sont pas enregistrées.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Intercepte tout clic sur un lien de navigation interne (sidebar, header…) tant que
  // des modifications ne sont pas enregistrées, et affiche la modale de confirmation.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!isDirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
      setShowLeaveConfirm(true);
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  function leaveTargetHref() {
    return pendingHref ?? `/${locale}/workshops/${workshopId}`;
  }

  // Section 6 — Delete modal
  type DeleteStep = 'idle' | 'confirm' | 'sending' | 'enter_code' | 'verifying';
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Share / QR
  const [shareOpen, setShareOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/${locale}/dashboard?preview=${workshopId}`);
  }, [locale, workshopId]);

  async function handleSendCode() {
    setDeleteStep('sending');
    setDeleteError('');
    const result = await requestDeletionCode(workshopId);
    if (result.success) setDeleteStep('enter_code');
    else {
      setDeleteError(result.error ?? 'Erreur');
      setDeleteStep('confirm');
    }
  }

  async function handleConfirmDeletion() {
    if (deleteCode.length !== 6) return;
    setDeleteStep('verifying');
    setDeleteError('');
    const result = await confirmDeletion(workshopId, deleteCode);
    if (result.success) router.push(`/${locale}/dashboard`);
    else {
      setDeleteError(result.error ?? 'Erreur');
      setDeleteStep('enter_code');
    }
  }

  return (
    <div
      style={{
        fontFamily: "'Inter Tight', system-ui, sans-serif",
        color: palette.ink,
        minHeight: 'calc(100vh - 65px)',
        background: palette.cream,
        display: 'flex',
        cursor: 'default',
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Caveat:wght@400;500;600&display=swap');`}</style>

      {/* ── Sidebar ── */}
      <div
        style={{
          width: 232,
          flexShrink: 0,
          borderRight: `1px solid ${ink(0.07)}`,
          background: 'rgba(252,249,242,0.6)',
          padding: '22px 16px',
          position: 'sticky',
          top: 0,
          height: 'calc(100vh - 65px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Back link */}
        <Link
          href={`/${locale}/workshops/${workshopId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 500,
            color: palette.inkMuted,
            textDecoration: 'none',
            marginBottom: 20,
            padding: '8px 10px',
            margin: '-8px -10px 12px',
            borderRadius: 9,
          }}
        >
          <ChevronLeft size={18} />
          {workshopName}
        </Link>

        {/* Label */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: '#b8b1a6',
            textTransform: 'uppercase',
            marginBottom: 8,
            paddingLeft: 10,
          }}
        >
          Paramètres
        </div>

        {/* Nav items — « Atelier Premium » réservé au propriétaire */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.filter((item) => item.id !== 'premium' || isOwner).map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: 'none',
                  background: active ? withAlpha(palette.amber, 0.14) : 'transparent',
                  color: active ? '#7a4d20' : palette.inkMuted,
                  fontWeight: active ? 500 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  transition: 'all 0.12s',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Main content ── */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '40px 32px 40px 40px',
          maxWidth: 760,
        }}
      >
        {activeSection === 'general' && (
        <>
        {/* ── 1. Général ── */}
        <SectionCard
          title="Général"
          description="Informations de base de l'atelier."
        >
          <Row label="Nom de l'atelier">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                border: `1px solid ${ink(0.14)}`,
                borderRadius: 9,
                background: withAlpha(palette.paper, 0.7),
                width: 300,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '0.04em',
                  color: palette.inkFaint,
                  flexShrink: 0,
                }}
              >
                {uniqueTag}
              </span>
              <span style={{ fontSize: 13, color: '#c8c2b8', flexShrink: 0 }}>-</span>
              <input
                type="text"
                value={workshopNameInput}
                onChange={(e) => setWorkshopNameInput(e.target.value)}
                style={{
                  fontSize: 13,
                  fontFamily: 'inherit',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: palette.ink,
                  flex: 1,
                  minWidth: 0,
                  padding: 0,
                }}
              />
            </div>
          </Row>

          <Row label="Description" hint="affichée dans la preview de l'atelier">
            <textarea
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder="décrivez votre atelier en quelques mots…"
              rows={3}
              style={{
                fontSize: 13,
                fontFamily: 'inherit',
                padding: '8px 12px',
                border: `1px solid ${ink(0.14)}`,
                borderRadius: 9,
                outline: 'none',
                background: withAlpha(palette.paper, 0.7),
                color: palette.ink,
                width: 260,
                resize: 'vertical',
              }}
            />
          </Row>

          <Row label="Image de couverture" hint="affichée dans la preview de l'atelier">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {COVER_GRADIENT_KEYS.map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedCover(key);
                      setUseCustomCover(false);
                    }}
                    aria-label={key}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: COVER_GRADIENTS[key],
                      border: !useCustomCover && selectedCover === key ? '2px solid #2d2a24' : '2px solid transparent',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
                <div style={{ position: 'relative', width: 32, height: 32 }}>
                  <button
                    onClick={() => {
                      if (coverImage && !useCustomCover) {
                        setUseCustomCover(true);
                      } else {
                        coverFileInputRef.current?.click();
                      }
                    }}
                    aria-label="uploader votre image"
                    disabled={uploadingCover}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      backgroundColor: coverImage ? 'transparent' : ink(0.06),
                      backgroundImage: coverImage ? `url(${coverImage})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: useCustomCover && coverImage ? '2px solid #2d2a24' : `2px dashed ${ink(0.22)}`,
                      cursor: uploadingCover ? 'default' : 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      color: palette.inkFaint,
                    }}
                  >
                    {uploadingCover ? <Loader2 size={14} className="animate-spin" /> : !coverImage && '+'}
                  </button>
                  {coverImage && !uploadingCover && (
                    <button
                      onClick={handleRemoveCoverImage}
                      aria-label="supprimer l'image de couverture"
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: palette.danger,
                        border: '1px solid #fcf9f2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <X size={10} color="#fff" />
                    </button>
                  )}
                </div>
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverFileChange}
                  style={{ display: 'none' }}
                />
              </div>
              {uploadError && (
                <span style={{ fontSize: 11, color: palette.danger }}>{uploadError}</span>
              )}
            </div>
          </Row>

          <Row label="Emoji" hint="affiché dans la preview de l'atelier">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COVER_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setSelectedEmoji(e)}
                  aria-label={e}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: withAlpha(palette.paper, 0.7),
                    border: selectedEmoji === e ? '2px solid #2d2a24' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Date de création" noBorder>
            <span style={{ fontSize: 13, color: palette.inkSoft }}>
              {new Date(createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </Row>
        </SectionCard>

        {/* ── 2. Accès & limites ── */}
        <SectionCard
          title="Accès & limites"
          description="Tous les ateliers sont privés : on les rejoint via une demande validée par un gestionnaire ou sur invitation."
        >
          <Row label="Afficher le programme éducatif">
            <Switch value={showProgramme} onChange={setShowProgramme} />
          </Row>

          <Row label="QR code" hint="redirige directement vers l'atelier" noBorder>
            <button
              onClick={() => setShareOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <QrCode size={13} />
              partager · QR
            </button>
          </Row>
        </SectionCard>

        {/* ── Zone de danger (suppression) — propriétaire uniquement ── */}
        {isOwner && (
        <SectionCard
          title="Zone de danger"
          description="Actions irréversibles — procédez avec prudence."
        >
          <Row
            label="Supprimer l'atelier"
            hint="toutes les briques, examens et progressions seront perdus"
            noBorder
          >
            <SmallBtn tone="danger" onClick={() => setDeleteStep('confirm')}>
              supprimer l'atelier
            </SmallBtn>
          </Row>
        </SectionCard>
        )}
        </>
        )}

        {activeSection === 'members' && (
        <>
        {/* ── 3. Membres & rôles ── */}
        <SectionCard
          title="Membres & rôles"
          description="Gérez les accès et les permissions des membres de l'atelier."
        >
          {isPremium ? (
            <>
            <Row label="Inviter un utilisateur" hint="par tag">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
                    placeholder="#tag…"
                    style={{
                      fontSize: 13,
                      fontFamily: "'ui-monospace', 'monospace', inherit",
                      padding: '7px 12px',
                      border: `1px solid ${ink(0.14)}`,
                      borderRadius: 9,
                      outline: 'none',
                      background: withAlpha(palette.paper, 0.7),
                      color: palette.ink,
                      width: 130,
                      letterSpacing: '0.04em',
                    }}
                  />
                  <SmallBtn tone="dark" onClick={handleInvite} disabled={inviting || !tagInput.trim()}>
                    {inviting ? 'envoi…' : 'inviter'}
                  </SmallBtn>
                </div>
                {inviteMsg && (
                  <span style={{ fontSize: 12, color: inviteMsg.type === 'success' ? palette.green : palette.danger, textAlign: 'right', maxWidth: 280 }}>
                    {inviteMsg.text}
                  </span>
                )}
              </div>
            </Row>

            {pendingInvites.length > 0 && (
              <div style={{ marginTop: 4, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginBottom: 8 }}>
                  Invitations en attente ({pendingInvites.length})
                </div>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 10,
                      background: withAlpha(palette.amber, 0.06),
                      border: `1px solid ${withAlpha(palette.amber, 0.18)}`,
                    }}
                  >
                    <Mail size={16} style={{ color: palette.amber, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 450, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.displayName}
                      </div>
                      <div style={{ fontSize: 11, color: palette.amber }}>
                        en attente · {inv.uniqueTag}
                      </div>
                    </div>
                    <SmallBtn
                      tone="danger"
                      onClick={() => handleCancelInvite(inv.userId)}
                      disabled={cancelingInvite === inv.userId}
                    >
                      {cancelingInvite === inv.userId ? 'annulation…' : 'annuler'}
                    </SmallBtn>
                  </div>
                ))}
              </div>
            )}
            </>
          ) : (
            <Row label="Inviter un utilisateur" hint="par tag">
              <span
                style={{
                  fontSize: 12,
                  color: palette.inkFaint,
                  background: ink(0.05),
                  border: `1px solid ${ink(0.08)}`,
                  borderRadius: 9,
                  padding: '7px 12px',
                }}
              >
                disponible pour les ateliers Premium
              </span>
            </Row>
          )}

          {/* Demandes d'adhésion en attente (tous les ateliers) */}
          {joinRequests.length > 0 && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.inkFaint, marginBottom: 8 }}>
                Demandes d&apos;adhésion ({joinRequests.length})
              </div>
              {joinRequests.map((req) => (
                <div
                  key={req.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 10,
                    background: withAlpha(palette.green, 0.06),
                    border: `1px solid ${withAlpha(palette.green, 0.18)}`,
                  }}
                >
                  <UserPlus size={16} style={{ color: palette.green, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 450, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: palette.inkSoft }}>
                      demande · {req.uniqueTag}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <SmallBtn tone="dark" onClick={() => handleApproveJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      {joinReqActionId === req.userId ? '…' : 'accepter'}
                    </SmallBtn>
                    <SmallBtn tone="danger" onClick={() => handleRejectJoinRequest(req.userId)} disabled={joinReqActionId === req.userId}>
                      refuser
                    </SmallBtn>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Member list */}
          {localMembers.map((member, i) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderBottom:
                  i < localMembers.length - 1 ? '1px solid rgba(45,42,36,0.06)' : 'none',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: avatarGradient(member.displayName),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: palette.paper,
                  flexShrink: 0,
                }}
              >
                {member.displayName.charAt(0).toUpperCase()}
              </div>

              {/* Name + role */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 450,
                    color: palette.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {member.displayName}
                </div>
                <div style={{ fontSize: 11, color: palette.inkFaint }}>
                  {ROLE_LABEL[member.role]} · {member.uniqueTag}
                </div>
              </div>

              {/* Actions — uniquement sur un membre de rang strictement inférieur */}
              {member.role !== 'owner' && actorRank > ROLE_RANK[member.role] && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {member.role === 'member' && (
                    <SmallBtn tone="ghost" disabled={memberActionId === member.id} onClick={() => handleSetRole(member, 'manager')}>
                      promouvoir
                    </SmallBtn>
                  )}
                  {member.role === 'manager' && (
                    <SmallBtn tone="ghost" disabled={memberActionId === member.id} onClick={() => handleSetRole(member, 'member')}>
                      rétrograder
                    </SmallBtn>
                  )}
                  <SmallBtn tone="danger" disabled={memberActionId === member.id} onClick={() => handleExcludeMember(member)}>
                    exclure
                  </SmallBtn>
                </div>
              )}
            </div>
          ))}
        </SectionCard>
        </>
        )}

        {activeSection === 'files' && (
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
        </>
        )}

        {activeSection === 'bricks' && (
        <>
        {/* ── 4. Briques de connaissance ── */}
        <SectionCard
          title="Briques de connaissance"
          description="Les unités d'information extraites de vos fichiers sources par l'IA."
        >
          <Row label="Fichiers source" noBorder={false}>
            <div style={{ display: 'flex', gap: 8 }}>
              <SmallBtn tone="ghost">gérer les fichiers</SmallBtn>
              <SmallBtn tone="dark">✦ régénérer par IA</SmallBtn>
            </div>
          </Row>

          {/* Bricks list */}
          <div style={{ marginTop: 4 }}>
            {MOCK_BRICKS.map((brick, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0',
                  borderBottom:
                    i < MOCK_BRICKS.length - 1 ? '1px solid rgba(45,42,36,0.06)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#b8b1a6',
                    fontFamily: 'ui-monospace, monospace',
                    width: 24,
                    flexShrink: 0,
                  }}
                >
                  {brick.section}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: palette.ink,
                      marginBottom: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {brick.title}
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <DotRow label="diff" value={brick.diff} max={10} />
                    <DotRow label="imp" value={brick.imp} max={10} />
                  </div>
                </div>
                <SmallBtn tone="ghost">éditer</SmallBtn>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12,
              borderTop: `1px solid ${ink(0.06)}`,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: palette.inkFaint }}>5 sur 142 affichées</span>
            <SmallBtn tone="ghost">voir toutes les briques</SmallBtn>
          </div>
        </SectionCard>
        </>
        )}

        {activeSection === 'premium' && isOwner && (
        <>
        {/* ── 5. Atelier Premium (propriétaire uniquement) ── */}
        <SectionCard
          title="Atelier Premium"
          description="Activez le statut Premium pour débloquer des fonctionnalités avancées pour tous les membres."
        >
          {isPremium ? (
            <Row
              label="Statut de l'atelier"
              hint="passage Premium définitif"
              noBorder
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: withAlpha(palette.amberGlow, 0.20),
                  border: `1px solid ${withAlpha(palette.amber, 0.30)}`,
                  color: '#7a4d20',
                  letterSpacing: '0.02em',
                }}
              >
                ✓ atelier premium
              </span>
            </Row>
          ) : (
            <>
            <Row
              label="Passer l'atelier Premium"
              hint="badge visible · engagement irréversible"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: withAlpha(palette.amberGlow, 0.20),
                    border: `1px solid ${withAlpha(palette.amber, 0.30)}`,
                    color: '#7a4d20',
                    letterSpacing: '0.02em',
                  }}
                >
                  badge premium
                </span>
                <SmallBtn tone="amber" onClick={() => setShowPremiumConfirm(true)}>activer →</SmallBtn>
              </div>
            </Row>
            {/* [TEST TEMPORAIRE — 13/06/2026] Activation par mot de passe en attendant Stripe. À retirer une fois le paiement réel branché. */}
            <Row
              label="Mot de passe d'activation (test)"
              hint="mode de test — sera retiré avec l'intégration du paiement"
              noBorder
            >
              <input
                type="password"
                value={premiumPassword}
                onChange={(e) => { setPremiumPassword(e.target.value); setPremiumError(''); }}
                placeholder="mot de passe…"
                style={{
                  fontSize: 13,
                  padding: '7px 12px',
                  border: `1px solid ${ink(0.14)}`,
                  borderRadius: 9,
                  outline: 'none',
                  background: withAlpha(palette.paper, 0.7),
                  color: palette.ink,
                  width: 160,
                }}
              />
            </Row>
            {premiumError && (
              <p
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: palette.danger,
                  background: withAlpha(palette.danger, 0.08),
                  border: `1px solid ${withAlpha(palette.danger, 0.18)}`,
                  borderRadius: 9,
                  padding: '8px 12px',
                  margin: '4px 0 12px',
                }}
              >
                {premiumError}
              </p>
            )}
            </>
          )}
        </SectionCard>
        </>
        )}
      </div>

      {/* ── Barre d'enregistrement (visible si modifications non sauvegardées) ── */}
      {(isDirty || detailsSaved) && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 32,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: palette.paper,
            borderRadius: 12,
            boxShadow: `0 10px 30px ${ink(0.16)}`,
            border: `1px solid ${ink(0.08)}`,
            padding: '10px 14px',
          }}
        >
          {isDirty && !detailsSaved && (
            <span style={{ fontSize: 12.5, color: !canSave ? palette.danger : palette.inkSoft }}>
              {!canSave ? "le nom de l'atelier ne peut pas être vide" : 'modifications non enregistrées'}
            </span>
          )}
          <SmallBtn tone={detailsSaved ? 'ghost' : 'dark'} onClick={handleSaveDetails} disabled={!canSave}>
            {savingDetails ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" />enregistrement…</span>
            ) : detailsSaved ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={12} />enregistré</span>
            ) : (
              'enregistrer'
            )}
          </SmallBtn>
        </div>
      )}

      {/* ── Delete modal ── */}
      {deleteStep !== 'idle' && (
        <Modal width={400} onClose={() => setDeleteStep('idle')}>
            {(deleteStep === 'confirm' || deleteStep === 'sending') && (
              <>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: withAlpha(palette.danger, 0.12), color: palette.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Trash2 size={17} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>
                  Mettre en corbeille ?
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: palette.inkSoft,
                    textAlign: 'center',
                    margin: '0 0 6px',
                  }}
                >
                  &quot;{workshopName}&quot; sera mis en corbeille. Vous aurez 7 jours pour annuler.
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: palette.inkFaint,
                    textAlign: 'center',
                    margin: '0 0 20px',
                  }}
                >
                  Un code de confirmation sera envoyé par email.
                </p>
                {deleteError && (
                  <p
                    style={{
                      fontSize: 12,
                      color: palette.danger,
                      background: withAlpha(palette.danger, 0.08),
                      padding: '8px 12px',
                      borderRadius: 9,
                      textAlign: 'center',
                      marginBottom: 14,
                    }}
                  >
                    {deleteError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setDeleteStep('idle')}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: `1px solid ${ink(0.14)}`,
                      background: 'transparent',
                      color: palette.inkMuted,
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSendCode}
                    disabled={deleteStep === 'sending'}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: palette.danger,
                      color: palette.paper,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity: deleteStep === 'sending' ? 0.6 : 1,
                    }}
                  >
                    {deleteStep === 'sending' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Envoi…
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        Envoyer le code
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {(deleteStep === 'enter_code' || deleteStep === 'verifying') && (
              <>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: withAlpha(palette.amberGlow, 0.18), color: palette.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Mail size={17} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>
                  Code envoyé !
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: palette.inkSoft,
                    textAlign: 'center',
                    margin: '0 0 20px',
                  }}
                >
                  Saisissez le code à 6 chiffres reçu par email. Il expire dans 15 minutes.
                </p>
                <input
                  type="text"
                  value={deleteCode}
                  onChange={(e) => {
                    setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setDeleteError('');
                  }}
                  placeholder="000000"
                  maxLength={6}
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontSize: 28,
                    fontFamily: 'ui-monospace, monospace',
                    letterSpacing: '0.5em',
                    padding: '12px 16px',
                    border: `2px solid ${ink(0.14)}`,
                    borderRadius: 12,
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: 10,
                  }}
                  disabled={deleteStep === 'verifying'}
                  autoFocus
                />
                {deleteError && (
                  <p
                    style={{
                      fontSize: 12,
                      color: palette.danger,
                      background: withAlpha(palette.danger, 0.08),
                      padding: '8px 12px',
                      borderRadius: 9,
                      textAlign: 'center',
                      marginBottom: 10,
                    }}
                  >
                    {deleteError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      setDeleteStep('confirm');
                      setDeleteCode('');
                      setDeleteError('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: `1px solid ${ink(0.14)}`,
                      background: 'transparent',
                      color: palette.inkMuted,
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <RotateCcw size={13} />
                    Renvoyer
                  </button>
                  <button
                    onClick={handleConfirmDeletion}
                    disabled={deleteCode.length !== 6 || deleteStep === 'verifying'}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: palette.danger,
                      color: palette.paper,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      opacity:
                        deleteCode.length !== 6 || deleteStep === 'verifying' ? 0.5 : 1,
                    }}
                  >
                    {deleteStep === 'verifying' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Vérification…
                      </>
                    ) : (
                      'Confirmer'
                    )}
                  </button>
                </div>
              </>
            )}
        </Modal>
      )}

      {/* Share / QR modal */}
      <ShareQRModal open={shareOpen} onClose={() => setShareOpen(false)} title={workshopName} url={joinUrl} />

      {/* ── Modale « modifications non enregistrées » ── */}
      {showLeaveConfirm && (
        <Modal width={400} onClose={() => { setShowLeaveConfirm(false); setPendingHref(null); }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: withAlpha(palette.amberGlow, 0.18), color: palette.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>Modifications non enregistrées</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: canSave ? 20 : 10 }}>
            Si vous quittez maintenant, les modifications apportées seront perdues.
          </div>
          {!canSave && (
            <div style={{ fontSize: 12, color: palette.danger, marginBottom: 16 }}>
              le nom de l&apos;atelier ne peut pas être vide
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              disabled={!canSave}
              onClick={async () => {
                await handleSaveDetails();
                setShowLeaveConfirm(false);
                router.push(leaveTargetHref());
                setPendingHref(null);
              }}
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                background: canSave ? palette.ink : ink(0.12),
                color: canSave ? palette.paper : palette.inkFaint,
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              Enregistrer et quitter
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowLeaveConfirm(false); setPendingHref(null); }}
                style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Annuler
              </button>
              <button
                onClick={() => { setShowLeaveConfirm(false); router.push(leaveTargetHref()); setPendingHref(null); }}
                style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: palette.danger, color: palette.paper, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Quitter sans enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}

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

      {/* ── Modale « confirmation activation Premium » ── */}
      {showPremiumConfirm && (
        <Modal width={400} onClose={() => { setShowPremiumConfirm(false); setPremiumError(''); }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: withAlpha(palette.amberGlow, 0.18), color: palette.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <AlertTriangle size={18} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>Passer l&apos;atelier Premium</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: 20 }}>
            Cette action est définitive et irréversible : l&apos;atelier deviendra privé pour toujours et tous ses membres (actuels et futurs) auront un accès Premium à vie.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              disabled={activatingPremium || !premiumPassword}
              onClick={handleActivatePremium}
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                background: (activatingPremium || !premiumPassword) ? ink(0.12) : palette.ink,
                color: (activatingPremium || !premiumPassword) ? palette.inkFaint : palette.paper,
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: (activatingPremium || !premiumPassword) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {activatingPremium ? <Loader2 size={14} className="animate-spin" /> : null}
              Confirmer l&apos;activation
            </button>
            <button
              onClick={() => { setShowPremiumConfirm(false); setPremiumError(''); }}
              style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
