'use client';

import { palette, ink, withAlpha, shadow } from '@/lib/theme';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, Loader2, Mail, QrCode, RotateCcw, Trash2, X } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { requestDeletionCode, confirmDeletion, updateWorkshopDetails, uploadWorkshopCover, leaveWorkshop, type MemberGroup } from '@/app/actions/workshops';
import type { WorkshopFile } from '@/app/actions/workshopFiles';
import type { Notion } from '@/app/actions/workshopNotions';
import type { Chapter } from '@/app/actions/workshopChapters';
import { COVER_GRADIENTS, COVER_GRADIENT_KEYS, COVER_EMOJIS, coverGradientFor, emojiFor } from '@/lib/workshopCover';
import ShareQRModal from '@/components/ShareQRModal';
import { Tooltip } from '@/components/ui/tooltip';
import { NAV_ITEMS, Row, Switch, SmallBtn, SectionCard, type WorkshopRole, type Member, type NavSection } from './settingsShared';
import MembersSection from './MembersSection';
import FilesSection from './FilesSection';
import NotionsSection from './NotionsSection';
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
  notions: Notion[];
  chapters: Chapter[];
};

export default function SettingsClient({ locale, workshopId, workshopName, description, coverGradient, coverImageUrl, coverImageActive, emoji, createdAt, uniqueTag, currentUserRole, isPremium, showProgramme: showProgrammeProp, members, groups, files: initialFiles, notions, chapters }: Props) {
  const router = useRouter();
  const t = useTranslations('settings');

  // Propriétaire vs gestionnaire : seul le propriétaire touche à l'argent (Premium)
  // et à la suppression de l'atelier ; le reste est accessible aux deux.
  // Un membre simple voit une version réduite : section Général seule, nom et
  // description en lecture seule, QR, et « quitter l'atelier » en zone de danger.
  const isOwner = currentUserRole === 'owner';
  const isMember = currentUserRole === 'member';

  const [activeSection, setActiveSection] = useState<NavSection>('general');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    isMember ? item.id === 'general' : item.id !== 'premium' || isOwner,
  );

  // ── Quitter l'atelier (membre et gestionnaire — le propriétaire supprime) ──
  const [leaveWorkshopOpen, setLeaveWorkshopOpen] = useState(false);
  const [leavingWorkshop, setLeavingWorkshop] = useState(false);
  const [leaveWorkshopError, setLeaveWorkshopError] = useState('');
  const tw = useTranslations('workshop');

  async function handleLeaveWorkshop() {
    setLeavingWorkshop(true);
    setLeaveWorkshopError('');
    const result = await leaveWorkshop(workshopId);
    if (result.success) {
      router.push(`/${locale}/dashboard`);
      return;
    }
    setLeavingWorkshop(false);
    setLeaveWorkshopError(result.error ?? tw('leaveConfirm.error'));
  }

  return (
    <div
      style={{
        fontFamily: 'var(--font-sans)',
        color: palette.ink,
        minHeight: 'calc(100vh - 60px)',
        background: palette.cream,
        cursor: 'default',
      }}
    >
      {/* Coquille centrée (T44) — la maquette rend cet écran dans le conteneur
          centré de l'app (`shellWidth`), la page elle-même occupant toute la
          largeur disponible à l'intérieur. Sans ce conteneur, navigation et
          cartes restaient collées au bord gauche du viewport. */}
      <div className="settings-shell mx-auto flex w-full md:gap-7 md:px-6 md:py-8" style={{ maxWidth: 1100 }}>
      {/* ── Sidebar (ordinateur) ── */}
      <div
        className="scroll-panel hidden md:flex"
        style={{
          width: 232,
          flexShrink: 0,
          // Pas de `sticky` : la coquille (.settings-shell) est bornée au
          // viewport et ne défile pas — la navigation reste en place d'elle-même.
          // `scroll-panel` (barre masquée) couvre le cas d'un viewport trop bas
          // pour afficher toutes les entrées : la colonne défile alors seule.
          flexDirection: 'column',
          gap: 0,
          minHeight: 0,
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
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: palette.inkFaint,
            textTransform: 'uppercase',
            marginBottom: 8,
            paddingLeft: 10,
          }}
        >
          {t('sidebarLabel')}
        </div>

        {/* Nav items — « Atelier Premium » réservé au propriétaire */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visibleNavItems.map((item) => {
            const active = activeSection === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 12,
                  border: 'none',
                  background: active ? palette.surfaceSunken : 'transparent',
                  color: active ? palette.ink : palette.inkMuted,
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} strokeWidth={1.75} style={{ flexShrink: 0, color: active ? palette.green : palette.inkFaint }} />
                {t(`nav.${item.id}`)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Main content — seule colonne à défiler (sans barre visible) ── */}
      <div
        className="scroll-panel px-5 pt-0 pb-10 md:px-0 md:pt-0 md:pb-4"
        style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}
      >
        {/* Sélecteur de section (téléphone) — même système que le changement d'atelier */}
        <div
          className="md:hidden"
          style={{ position: 'sticky', top: 0, zIndex: 40, margin: '0 -20px 22px', background: palette.surfaceRaised, borderBottom: `1px solid ${palette.line}` }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: '15px 24px' }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: palette.inkFaint }}>{t('sidebarLabel')}</span>
              <span style={{ width: 20, height: 20, borderRadius: 999, border: `1px solid ${palette.line}`, background: palette.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted }}>
                <ChevronDown size={11} strokeWidth={2.25} />
              </span>
            </button>
            <Tooltip content={t('closeSettings')}>
              <Link
                href={`/${locale}/workshops/${workshopId}`}
                aria-label={t('closeSettings')}
                style={{ flexShrink: 0, marginRight: 20, width: 30, height: 30, borderRadius: 999, border: `1px solid ${palette.line}`, background: palette.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.inkMuted }}
              >
                <X size={14} strokeWidth={2.25} />
              </Link>
            </Tooltip>
          </div>
          {mobileNavOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 16, width: 300, maxWidth: 'calc(100% - 32px)', zIndex: 60, background: palette.surfaceRaised, border: `1px solid ${palette.line}`, borderRadius: 14, boxShadow: shadow.lg, overflow: 'hidden', boxSizing: 'border-box' }}>
              {visibleNavItems.map((item) => {
                const active = activeSection === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileNavOpen(false);
                    }}
                    style={{ width: '100%', border: 'none', background: active ? withAlpha(palette.green, 0.08) : 'transparent', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: `1px solid ${palette.line}`, textAlign: 'left', fontSize: 13.5, fontWeight: 600, color: active ? palette.green : palette.ink }}
                  >
                    <Icon size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                    {t(`nav.${item.id}`)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {activeSection === 'general' && (
        <>
        {/* ── 1. Général ── */}
        <SectionCard title={t('general.title')}>
          {isMember ? (
            <>
              {/* Membre simple : nom et description en lecture seule. */}
              <Row label={t('general.nameLabel')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: palette.inkSoft }}>
                  <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: palette.inkFaint }}>{uniqueTag}</span>
                  <span style={{ color: palette.lineStrong }}>·</span>
                  {workshopName}
                </span>
              </Row>
              <Row label={t('general.descLabel')} noBorder>
                <span style={{ fontSize: 13, color: palette.inkSoft, maxWidth: 300, textAlign: 'right' }}>
                  {description || '—'}
                </span>
              </Row>
            </>
          ) : (
            <>
          <Row label={t('general.nameLabel')}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                border: `1px solid ${palette.line}`,
                borderRadius: 12,
                background: palette.surfaceInput,
                width: 300,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  color: palette.inkFaint,
                  flexShrink: 0,
                }}
              >
                {uniqueTag}
              </span>
              <span style={{ fontSize: 13, color: palette.lineStrong, flexShrink: 0 }}>·</span>
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

          <Row label={t('general.descLabel')}>
            <textarea
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder={t('general.descPlaceholder')}
              rows={3}
              style={{
                fontSize: 13,
                fontFamily: 'inherit',
                padding: '8px 12px',
                border: `1px solid ${palette.line}`,
                borderRadius: 12,
                outline: 'none',
                background: palette.surfaceInput,
                color: palette.ink,
                width: 260,
                resize: 'vertical',
              }}
            />
          </Row>

          <Row label={t('general.coverLabel')}>
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
                      border: !useCustomCover && selectedCover === key ? `2px solid ${palette.ink}` : '2px solid transparent',
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
                      backgroundColor: coverImage ? 'transparent' : palette.surfaceSunken,
                      backgroundImage: coverImage ? `url(${coverImage})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: useCustomCover && coverImage ? `2px solid ${palette.ink}` : `2px dashed ${palette.lineStrong}`,
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
                        border: `1px solid ${palette.surfaceRaised}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <X size={10} color={palette.onInk} />
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

          <Row label={t('general.emojiLabel')}>
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
                    background: palette.surfaceInput,
                    border: selectedEmoji === e ? `2px solid ${palette.ink}` : '2px solid transparent',
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
            </>
          )}
        </SectionCard>

        {/* ── 2. Accès & limites ── */}
        <SectionCard title={t('access.title')}>
          {!isMember && (
            <Row label={t('access.showProgramme')}>
              <Switch value={showProgramme} onChange={setShowProgramme} />
            </Row>
          )}

          <Row label={t('access.qr')} noBorder>
            <button
              onClick={() => setShareOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'transparent', border: `1px solid ${palette.lineStrong}`, color: palette.inkMuted, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <QrCode size={13} strokeWidth={1.75} />
              {t('access.shareQr')}
            </button>
          </Row>
        </SectionCard>

        {/* ── Zone de danger — supprimer (propriétaire) ou quitter (les autres) ── */}
        <SectionCard title={t('danger.title')}>
          {isOwner ? (
            <Row
              label={t('danger.deleteLabel')}
              hint={t('danger.deleteHint')}
              noBorder
            >
              <SmallBtn tone="danger" onClick={() => setDeleteStep('confirm')}>
                {t('danger.deleteBtn')}
              </SmallBtn>
            </Row>
          ) : (
            <Row
              label={t('danger.leaveLabel')}
              hint={t('danger.leaveHint')}
              noBorder
            >
              <SmallBtn tone="danger" onClick={() => setLeaveWorkshopOpen(true)}>
                {tw('leaveBtn')}
              </SmallBtn>
            </Row>
          )}
        </SectionCard>
        </>
        )}

        <div style={{ display: activeSection === 'members' ? 'contents' : 'none' }}>
          <MembersSection workshopId={workshopId} isPremium={isPremium} currentUserRole={currentUserRole} members={members} groups={groups} />
        </div>

        <div style={{ display: activeSection === 'files' ? 'contents' : 'none' }}>
          <FilesSection workshopId={workshopId} initialFiles={initialFiles} />
        </div>

        <div style={{ display: activeSection === 'notions' ? 'contents' : 'none' }}>
          <NotionsSection workshopId={workshopId} notions={notions} chapters={chapters} />
        </div>

        {isOwner && (
          <div style={{ display: activeSection === 'premium' ? 'contents' : 'none' }}>
            <PremiumSection workshopId={workshopId} isPremium={isPremium} memberCount={members.length} />
          </div>
        )}
      </div>
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

      {/* ── Confirmation « quitter l'atelier » (non-propriétaire) ── */}
      {leaveWorkshopOpen && (
        <ConfirmDialog
          width={420}
          title={tw('leaveConfirm.title')}
          description={
            <>
              {tw('leaveConfirm.desc', { name: workshopName })}
              {leaveWorkshopError && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{leaveWorkshopError}</div>}
            </>
          }
          confirmLabel={leavingWorkshop ? '…' : tw('leaveConfirm.confirm')}
          cancelLabel={tw('leaveConfirm.cancel')}
          onCancel={() => {
            if (!leavingWorkshop) setLeaveWorkshopOpen(false);
          }}
          onConfirm={handleLeaveWorkshop}
        />
      )}

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
