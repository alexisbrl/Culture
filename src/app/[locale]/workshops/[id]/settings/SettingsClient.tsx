'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Loader2, Mail, QrCode, RotateCcw, X } from 'lucide-react';
import { requestDeletionCode, confirmDeletion, updateWorkshopDetails, uploadWorkshopCover, activateWorkshopPremium } from '@/app/actions/workshops';
import { COVER_GRADIENTS, COVER_GRADIENT_KEYS, COVER_EMOJIS, coverGradientFor, emojiFor } from '@/lib/workshopCover';
import ShareQRModal from '@/components/ShareQRModal';

type Member = {
  id: string;
  userId: string;
  role: 'owner' | 'member';
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
  currentUserRole: 'owner' | 'member';
  isPremium: boolean;
  isPrivate: boolean;
  showProgramme: boolean;
  maxMembersTotal: number | null;
  maxMembersMonthly: number | null;
  members: Member[];
};

type NavSection = 'general' | 'members' | 'bricks' | 'premium';

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: 'general', label: 'Général' },
  { id: 'members', label: 'Membres & rôles' },
  { id: 'bricks', label: 'Briques de connaissance' },
  { id: 'premium', label: 'Atelier Premium' },
];

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
      <span style={{ fontSize: 10, color: '#9a948a', width: 28 }}>{label}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i < value ? '#a87a3a' : 'rgba(45,42,36,0.12)',
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
        borderBottom: noBorder ? 'none' : '1px solid rgba(45,42,36,0.06)',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 450, color: '#2d2a24' }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: '#9a948a', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'rgba(45,42,36,0.06)',
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {(['privé', 'public'] as const).map((opt) => {
        const active = (opt === 'public') === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt === 'public')}
            style={{
              padding: '5px 14px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: active ? '#fff' : 'transparent',
              color: active ? '#2d2a24' : '#7a766d',
              boxShadow: active ? '0 1px 4px rgba(45,42,36,0.12)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {opt}
          </button>
        );
      })}
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
        background: value ? '#7a9968' : 'rgba(45,42,36,0.14)',
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
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        }}
      />
    </button>
  );
}

function NumInput({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        style={{
          width: 90,
          textAlign: 'right',
          fontSize: 13,
          fontFamily: 'inherit',
          padding: '6px 10px',
          border: '1px solid rgba(45,42,36,0.14)',
          borderRadius: 9,
          outline: 'none',
          background: 'rgba(255,255,255,0.7)',
          color: '#2d2a24',
        }}
      />
      <span style={{ fontSize: 12, color: '#9a948a', whiteSpace: 'nowrap' }}>{suffix}</span>
    </div>
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
      border: '1px solid rgba(45,42,36,0.16)',
      color: '#5a564c',
    },
    danger: {
      bg: 'rgba(184,90,74,0.10)',
      border: '1px solid rgba(184,90,74,0.30)',
      color: '#b85a4a',
    },
    dark: {
      bg: '#2d2a24',
      border: '1px solid #2d2a24',
      color: '#fff',
    },
    amber: {
      bg: '#a87a3a',
      border: '1px solid #a87a3a',
      color: '#fff',
    },
  }[tone];

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px',
        borderRadius: 9,
        background: disabled ? 'rgba(45,42,36,0.12)' : styles.bg,
        border: disabled ? '1px solid rgba(45,42,36,0.12)' : styles.border,
        color: disabled ? '#9a948a' : styles.color,
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
        <div style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: '#9a948a' }}>{description}</div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.85)',
          borderRadius: 14,
          border: '1px solid rgba(45,42,36,0.07)',
          padding: '6px 18px',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function SettingsClient({ locale, workshopId, workshopName, description, coverGradient, coverImageUrl, coverImageActive, emoji, createdAt, uniqueTag, isPremium, isPrivate, showProgramme: showProgrammeProp, maxMembersTotal, maxMembersMonthly, members }: Props) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<NavSection>('general');

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

  // Section 2 — Visibility
  // Un atelier Premium est définitivement privé (voir activateWorkshopPremium) : le
  // toggle est verrouillé sur « privé » et ne peut plus être changé.
  const [isPublic, setIsPublic] = useState(!isPrivate);
  const [showProgramme, setShowProgramme] = useState(showProgrammeProp);
  const [maxTotal, setMaxTotal] = useState(maxMembersTotal != null ? String(maxMembersTotal) : '200');
  const [maxMonthly, setMaxMonthly] = useState(maxMembersMonthly != null ? String(maxMembersMonthly) : '40');

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
    isPublic,
    showProgramme,
    maxTotal,
    maxMonthly,
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
      isPrivate: !isPublic,
      showProgramme,
      maxMembersTotal: maxTotal.length > 0 ? Number(maxTotal) : null,
      maxMembersMonthly: maxMonthly.length > 0 ? Number(maxMonthly) : null,
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
        color: '#2d2a24',
        minHeight: '100vh',
        background: '#fcf9f2',
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
          borderRight: '1px solid rgba(45,42,36,0.07)',
          background: 'rgba(252,249,242,0.6)',
          padding: '22px 16px',
          position: 'sticky',
          top: 0,
          height: '100vh',
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
            color: '#5a564c',
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

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: 'none',
                  background: active ? 'rgba(168,122,58,0.14)' : 'transparent',
                  color: active ? '#7a4d20' : '#5a564c',
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
                border: '1px solid rgba(45,42,36,0.14)',
                borderRadius: 9,
                background: 'rgba(255,255,255,0.7)',
                width: 300,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '0.04em',
                  color: '#9a948a',
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
                  color: '#2d2a24',
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
                border: '1px solid rgba(45,42,36,0.14)',
                borderRadius: 9,
                outline: 'none',
                background: 'rgba(255,255,255,0.7)',
                color: '#2d2a24',
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
                      backgroundColor: coverImage ? 'transparent' : 'rgba(45,42,36,0.06)',
                      backgroundImage: coverImage ? `url(${coverImage})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: useCustomCover && coverImage ? '2px solid #2d2a24' : '2px dashed rgba(45,42,36,0.22)',
                      cursor: uploadingCover ? 'default' : 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      color: '#9a948a',
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
                        background: '#b85a4a',
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
                <span style={{ fontSize: 11, color: '#b85a4a' }}>{uploadError}</span>
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
                    background: 'rgba(255,255,255,0.7)',
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
            <span style={{ fontSize: 13, color: '#7a766d' }}>
              {new Date(createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </Row>
        </SectionCard>

        {/* ── 2. Visibilité & accès ── */}
        <SectionCard
          title="Visibilité & accès"
          description="Contrôlez qui peut accéder à votre atelier et comment."
        >
          <Row
            label="Visibilité"
            hint={isPremium ? 'atelier premium · définitivement privé' : 'un atelier privé se rejoint via tag ou invitation'}
          >
            {isPremium ? (
              <span style={{ fontSize: 13, color: '#7a766d' }}>privé</span>
            ) : (
              <Toggle value={isPublic} onChange={setIsPublic} />
            )}
          </Row>

          <Row label="Afficher le programme éducatif">
            <Switch value={showProgramme} onChange={setShowProgramme} />
          </Row>

          <Row label="Nombre maximal de candidats (total)">
            <NumInput value={maxTotal} onChange={setMaxTotal} suffix="membres" />
          </Row>

          <Row label="Nombre maximal de candidats (mensuel)">
            <NumInput value={maxMonthly} onChange={setMaxMonthly} suffix="/ mois" />
          </Row>

          <Row label="QR code" hint="redirige directement vers l'atelier" noBorder>
            <button
              onClick={() => setShareOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(45,42,36,0.16)', color: '#5a564c', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <QrCode size={13} />
              partager · QR
            </button>
          </Row>
        </SectionCard>

        {/* ── Zone de danger ── */}
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
            <Row label="Inviter un utilisateur" hint="par tag">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value.toUpperCase())}
                  placeholder="#tag…"
                  style={{
                    fontSize: 13,
                    fontFamily: "'ui-monospace', 'monospace', inherit",
                    padding: '7px 12px',
                    border: '1px solid rgba(45,42,36,0.14)',
                    borderRadius: 9,
                    outline: 'none',
                    background: 'rgba(255,255,255,0.7)',
                    color: '#2d2a24',
                    width: 130,
                    letterSpacing: '0.04em',
                  }}
                />
                <SmallBtn tone="dark">inviter</SmallBtn>
              </div>
            </Row>
          ) : (
            <Row label="Inviter un utilisateur" hint="par tag">
              <span
                style={{
                  fontSize: 12,
                  color: '#9a948a',
                  background: 'rgba(45,42,36,0.05)',
                  border: '1px solid rgba(45,42,36,0.08)',
                  borderRadius: 9,
                  padding: '7px 12px',
                }}
              >
                disponible pour les ateliers Premium
              </span>
            </Row>
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
                  color: '#fff',
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
                    color: '#2d2a24',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {member.displayName}
                </div>
                <div style={{ fontSize: 11, color: '#9a948a' }}>
                  {member.role === 'owner' ? 'propriétaire' : 'membre'} · {member.uniqueTag}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {member.role !== 'owner' && (
                  <SmallBtn tone="ghost">promouvoir</SmallBtn>
                )}
                {member.role === 'member' && (
                  <SmallBtn tone="ghost">rétrograder</SmallBtn>
                )}
                {member.role !== 'owner' && (
                  <SmallBtn
                    tone="danger"
                    onClick={() =>
                      setLocalMembers((prev) => prev.filter((m) => m.id !== member.id))
                    }
                  >
                    virer
                  </SmallBtn>
                )}
              </div>
            </div>
          ))}
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
                      color: '#2d2a24',
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
              borderTop: '1px solid rgba(45,42,36,0.06)',
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#9a948a' }}>5 sur 142 affichées</span>
            <SmallBtn tone="ghost">voir toutes les briques</SmallBtn>
          </div>
        </SectionCard>
        </>
        )}

        {activeSection === 'premium' && (
        <>
        {/* ── 5. Atelier Premium ── */}
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
                  background: 'rgba(232,184,108,0.20)',
                  border: '1px solid rgba(168,122,58,0.30)',
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
                    background: 'rgba(232,184,108,0.20)',
                    border: '1px solid rgba(168,122,58,0.30)',
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
                  border: '1px solid rgba(45,42,36,0.14)',
                  borderRadius: 9,
                  outline: 'none',
                  background: 'rgba(255,255,255,0.7)',
                  color: '#2d2a24',
                  width: 160,
                }}
              />
            </Row>
            {premiumError && (
              <p
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: '#b85a4a',
                  background: 'rgba(184,90,74,0.08)',
                  border: '1px solid rgba(184,90,74,0.18)',
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
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(45,42,36,0.16)',
            border: '1px solid rgba(45,42,36,0.08)',
            padding: '10px 14px',
          }}
        >
          {isDirty && !detailsSaved && (
            <span style={{ fontSize: 12.5, color: !canSave ? '#b85a4a' : '#7a766d' }}>
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
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(45,42,36,0.5)',
            backdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              boxShadow: '0 30px 80px rgba(45,42,36,0.18)',
              padding: 24,
              width: '100%',
              maxWidth: 360,
              fontFamily: 'inherit',
            }}
          >
            {(deleteStep === 'confirm' || deleteStep === 'sending') && (
              <>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: 'rgba(184,90,74,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b85a4a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    color: '#2d2a24',
                    textAlign: 'center',
                    margin: '0 0 8px',
                  }}
                >
                  Mettre en corbeille ?
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: '#7a766d',
                    textAlign: 'center',
                    margin: '0 0 6px',
                  }}
                >
                  &quot;{workshopName}&quot; sera mis en corbeille. Vous aurez 7 jours pour annuler.
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: '#9a948a',
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
                      color: '#b85a4a',
                      background: 'rgba(184,90,74,0.08)',
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
                      border: '1px solid rgba(45,42,36,0.14)',
                      background: 'transparent',
                      color: '#5a564c',
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
                      background: '#b85a4a',
                      color: '#fff',
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
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    background: 'rgba(232,184,108,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <Mail size={22} color="#c89860" />
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    color: '#2d2a24',
                    textAlign: 'center',
                    margin: '0 0 8px',
                  }}
                >
                  Code envoyé !
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: '#7a766d',
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
                    border: '2px solid rgba(45,42,36,0.14)',
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
                      color: '#b85a4a',
                      background: 'rgba(184,90,74,0.08)',
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
                      border: '1px solid rgba(45,42,36,0.14)',
                      background: 'transparent',
                      color: '#5a564c',
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
                      background: '#b85a4a',
                      color: '#fff',
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
          </div>
        </div>
      )}

      {/* Share / QR modal */}
      <ShareQRModal open={shareOpen} onClose={() => setShareOpen(false)} title={workshopName} url={joinUrl} />

      {/* ── Modale « modifications non enregistrées » ── */}
      {showLeaveConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(45,42,36,0.5)',
            backdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              boxShadow: '0 30px 80px rgba(45,42,36,0.18)',
              padding: 24,
              width: '100%',
              maxWidth: 360,
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: 'rgba(168,122,58,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a87a3a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: '#2d2a24',
                textAlign: 'center',
                margin: '0 0 8px',
              }}
            >
              Modifications non enregistrées
            </h3>
            <p
              style={{
                fontSize: 13,
                color: '#7a766d',
                textAlign: 'center',
                margin: '0 0 20px',
              }}
            >
              Si vous quittez maintenant, les modifications apportées seront perdues.
            </p>
            {!canSave && (
              <p style={{ fontSize: 12, color: '#b85a4a', textAlign: 'center', margin: '-8px 0 16px' }}>
                le nom de l&apos;atelier ne peut pas être vide
              </p>
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
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: canSave ? '#2d2a24' : 'rgba(45,42,36,0.12)',
                  color: canSave ? '#fff' : '#9a948a',
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
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    setPendingHref(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(45,42,36,0.14)',
                    background: 'transparent',
                    color: '#5a564c',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    setShowLeaveConfirm(false);
                    router.push(leaveTargetHref());
                    setPendingHref(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(184,90,74,0.30)',
                    background: 'rgba(184,90,74,0.10)',
                    color: '#b85a4a',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Quitter sans enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale « confirmation activation Premium » ── */}
      {showPremiumConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,42,36,0.5)', backdropFilter: 'blur(4px)', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 30px 80px rgba(45,42,36,0.18)', padding: 24, width: '100%', maxWidth: 360, fontFamily: 'inherit' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: 'rgba(168,122,58,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a87a3a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 500, color: '#2d2a24', textAlign: 'center', margin: '0 0 8px' }}>
              Passer l&apos;atelier Premium
            </h3>
            <p style={{ fontSize: 13, color: '#7a766d', textAlign: 'center', margin: '0 0 20px' }}>
              Cette action est définitive et irréversible : l&apos;atelier deviendra privé pour toujours et tous ses membres (actuels et futurs) auront un accès Premium à vie.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                disabled={activatingPremium || !premiumPassword}
                onClick={handleActivatePremium}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: (activatingPremium || !premiumPassword) ? 'rgba(45,42,36,0.12)' : '#2d2a24',
                  color: (activatingPremium || !premiumPassword) ? '#9a948a' : '#fff',
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
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(45,42,36,0.14)',
                  background: 'transparent',
                  color: '#5a564c',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
