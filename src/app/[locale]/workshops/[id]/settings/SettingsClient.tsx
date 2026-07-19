'use client';

import { palette, ink, withAlpha } from '@/lib/theme';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, ChevronLeft, Loader2, Mail, QrCode, RotateCcw, Trash2, X } from 'lucide-react';
import Modal from '@/components/Modal';
import { requestDeletionCode, confirmDeletion, updateWorkshopDetails, uploadWorkshopCover, type MemberGroup } from '@/app/actions/workshops';
import type { WorkshopFile } from '@/app/actions/workshopFiles';
import type { Brick } from '@/app/actions/workshopBricks';
import type { Chapter } from '@/app/actions/workshopChapters';
import { COVER_GRADIENTS, COVER_GRADIENT_KEYS, COVER_EMOJIS, coverGradientFor, emojiFor } from '@/lib/workshopCover';
import ShareQRModal from '@/components/ShareQRModal';
import { NAV_ITEMS, Row, Switch, SmallBtn, SectionCard, type WorkshopRole, type Member, type NavSection } from './settingsShared';
import MembersSection from './MembersSection';
import FilesSection from './FilesSection';
import BricksSection from './BricksSection';
import PremiumSection from './PremiumSection';

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
  groups: MemberGroup[];
  files: WorkshopFile[];
  bricks: Brick[];
  chapters: Chapter[];
};

export default function SettingsClient({ locale, workshopId, workshopName, description, coverGradient, coverImageUrl, coverImageActive, emoji, createdAt, uniqueTag, currentUserRole, isPremium, showProgramme: showProgrammeProp, members, groups, files: initialFiles, bricks, chapters }: Props) {
  const router = useRouter();
  const t = useTranslations('settings');

  // Propriétaire vs gestionnaire : seul le propriétaire touche à l'argent (Premium)
  // et à la suppression de l'atelier ; le reste est accessible aux deux.
  const isOwner = currentUserRole === 'owner';

  const [activeSection, setActiveSection] = useState<NavSection>('general');

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
      setUploadError(result.error ?? t('err.upload'));
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

  // Confirmation de sortie (modifications non enregistrées)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // URL vers laquelle naviguer une fois la confirmation résolue (lien cliqué intercepté).
  // Si null, le bouton « retour à l'atelier » est utilisé par défaut.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // `isDirty` recalculé à chaque render ; on garde sa dernière valeur dans un ref
  // (mis à jour en effet, pas pendant le render) pour les handlers beforeunload/click
  // enregistrés une seule fois au montage, sans closure obsolète.
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; });

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
      setDeleteError(result.error ?? t('err.generic'));
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
      setDeleteError(result.error ?? t('err.generic'));
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
          {t('sidebarLabel')}
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
                {t(`nav.${item.id}`)}
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
          title={t('general.title')}
          description={t('general.desc')}
        >
          <Row label={t('general.nameLabel')}>
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

          <Row label={t('general.descLabel')} hint={t('general.previewHint')}>
            <textarea
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder={t('general.descPlaceholder')}
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

          <Row label={t('general.coverLabel')} hint={t('general.previewHint')}>
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
                    aria-label={t('general.uploadAria')}
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
                      aria-label={t('general.removeCoverAria')}
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

          <Row label={t('general.emojiLabel')} hint={t('general.previewHint')}>
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

          <Row label={t('general.createdLabel')} noBorder>
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
          title={t('access.title')}
          description={t('access.desc')}
        >
          <Row label={t('access.showProgramme')}>
            <Switch value={showProgramme} onChange={setShowProgramme} />
          </Row>

          <Row label={t('access.qr')} hint={t('access.qrHint')} noBorder>
            <button
              onClick={() => setShareOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'transparent', border: `1px solid ${ink(0.16)}`, color: palette.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <QrCode size={13} />
              {t('access.shareQr')}
            </button>
          </Row>
        </SectionCard>

        {/* ── Zone de danger (suppression) — propriétaire uniquement ── */}
        {isOwner && (
        <SectionCard
          title={t('danger.title')}
          description={t('danger.desc')}
        >
          <Row
            label={t('danger.deleteLabel')}
            hint={t('danger.deleteHint')}
            noBorder
          >
            <SmallBtn tone="danger" onClick={() => setDeleteStep('confirm')}>
              {t('danger.deleteBtn')}
            </SmallBtn>
          </Row>
        </SectionCard>
        )}
        </>
        )}

        <div style={{ display: activeSection === 'members' ? 'contents' : 'none' }}>
          <MembersSection workshopId={workshopId} isPremium={isPremium} currentUserRole={currentUserRole} members={members} groups={groups} />
        </div>

        <div style={{ display: activeSection === 'files' ? 'contents' : 'none' }}>
          <FilesSection workshopId={workshopId} initialFiles={initialFiles} />
        </div>

        <div style={{ display: activeSection === 'bricks' ? 'contents' : 'none' }}>
          <BricksSection workshopId={workshopId} bricks={bricks} chapters={chapters} onManageFiles={() => setActiveSection('files')} />
        </div>

        {isOwner && (
          <div style={{ display: activeSection === 'premium' ? 'contents' : 'none' }}>
            <PremiumSection workshopId={workshopId} isPremium={isPremium} />
          </div>
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
              {!canSave ? t('saveBar.emptyName') : t('saveBar.unsaved')}
            </span>
          )}
          <SmallBtn tone={detailsSaved ? 'ghost' : 'dark'} onClick={handleSaveDetails} disabled={!canSave}>
            {savingDetails ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" />{t('saveBar.saving')}</span>
            ) : detailsSaved ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Check size={12} />{t('saveBar.saved')}</span>
            ) : (
              t('saveBar.save')
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
                  {t('deleteModal.trashTitle')}
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: palette.inkSoft,
                    textAlign: 'center',
                    margin: '0 0 6px',
                  }}
                >
                  {t('deleteModal.trashDesc', { name: workshopName })}
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: palette.inkFaint,
                    textAlign: 'center',
                    margin: '0 0 20px',
                  }}
                >
                  {t('deleteModal.codeByEmail')}
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
                    {t('cancel')}
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
                        {t('deleteModal.sending')}
                      </>
                    ) : (
                      <>
                        <Mail size={14} />
                        {t('deleteModal.sendCode')}
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
                  {t('deleteModal.codeSentTitle')}
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: palette.inkSoft,
                    textAlign: 'center',
                    margin: '0 0 20px',
                  }}
                >
                  {t('deleteModal.enterCode')}
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
                    {t('deleteModal.resend')}
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
                        {t('deleteModal.verifying')}
                      </>
                    ) : (
                      t('deleteModal.confirm')
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
          <div style={{ fontSize: 15, fontWeight: 500, color: palette.ink, marginBottom: 6 }}>{t('leave.title')}</div>
          <div style={{ fontSize: 12.5, color: palette.inkSoft, marginBottom: canSave ? 20 : 10 }}>
            {t('leave.desc')}
          </div>
          {!canSave && (
            <div style={{ fontSize: 12, color: palette.danger, marginBottom: 16 }}>
              {t('leave.emptyName')}
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
              {t('leave.saveAndLeave')}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowLeaveConfirm(false); setPendingHref(null); }}
                style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: `1px solid ${ink(0.14)}`, background: 'transparent', color: palette.inkMuted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => { setShowLeaveConfirm(false); router.push(leaveTargetHref()); setPendingHref(null); }}
                style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: palette.danger, color: palette.paper, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('leave.leaveWithout')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
