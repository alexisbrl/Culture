'use client';

import { palette, ink, withAlpha, shadow } from '@/lib/theme';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, Loader2, Mail, QrCode, RotateCcw, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { requestDeletionCode, confirmDeletion, updateWorkshopDetails, leaveWorkshop } from '@/app/actions/workshops';
import { COVER_EMOJIS, coverGradientFor, emojiFor } from '@/lib/workshopCover';
import ShareQRModal from '@/components/ShareQRModal';
import { Tooltip } from '@/components/ui/tooltip';
import { NAV_ITEMS, Row, Switch, SmallBtn, SectionCard, UNDO_FLASH_MS, type WorkshopRole } from './settingsShared';
import { announceWorkshopDetails } from '@/lib/workshopDetailsEvent';
import type { WorkshopDetailsPatch } from '@/lib/workshops/details';
import { isNavSection, settingsSectionUrl, type NavSection } from './sections';
import { GenerationUndoContext, UndoHistoryContext, type GenerationUndoHandle, type UndoEntry } from './undoHistory';

type Props = {
  locale: string;
  workshopId: string;
  workshopName: string;
  coverGradient: string | null;
  coverImageUrl: string | null;
  coverImageActive: boolean;
  emoji: string | null;
  createdAt: string;
  uniqueTag: string | null;
  currentUserRole: WorkshopRole;
  showProgramme: boolean;
  /** Vient de l'atelier lui-même, donc gratuit : c'est la seule chose dont la
   *  section Premium a besoin de la liste des membres. */
  // Les trois sections lourdes arrivent en flux : la page les rend dans leur
  // propre frontière de chargement et nous les passe déjà emballées (page.tsx).
  membersSlot: React.ReactNode;
  filesSlot: React.ReactNode;
  notionsSlot: React.ReactNode;
};

export default function SettingsClient({ locale, workshopId, workshopName, coverGradient, coverImageUrl, coverImageActive, emoji, createdAt, uniqueTag, currentUserRole, showProgramme: showProgrammeProp, membersSlot, filesSlot, notionsSlot }: Props) {
  const router = useRouter();
  const t = useTranslations('settings');

  // Propriétaire vs gestionnaire : seul le propriétaire touche à l'argent (Premium)
  // et à la suppression de l'atelier ; le reste est accessible aux deux.
  // Un membre simple voit une version réduite : section Général seule, nom en
  // lecture seule, QR, et « quitter l'atelier » en zone de danger.
  const isOwner = currentUserRole === 'owner';
  const isMember = currentUserRole === 'member';

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // ─── La section ouverte vit dans l'URL, et le retour arrière la suit ─────
  //
  // Elle est écrite dans `?section=notions` SANS passer par le routeur : les
  // sections sont montées en permanence (docs/architecture.md §10), et une
  // vraie navigation remettrait un temps de chargement là où il n'y en a pas.
  // L'API d'historique du navigateur ne déclenche aucune requête, et Next la
  // relaie à `useSearchParams` : l'URL est donc la SEULE source de vérité, lue
  // telle quelle au rendu serveur comme au retour arrière.
  //
  // C'est ce qui laisse le menu latéral (sous-menu « paramètres ») ouvrir une
  // section sans rien savoir de cette page : il écrit l'URL de la même façon
  // (`settingsSectionUrl`), et la page suit.
  const searchParams = useSearchParams();
  const wantedSection = searchParams.get('section') ?? undefined;
  // Un membre simple n'a que « Général » : une URL qui en nomme une autre
  // n'ouvre pas une section qu'il ne voit pas.
  const activeSection: NavSection = !isMember && isNavSection(wantedSection) ? wantedSection : 'general';

  function openSection(id: NavSection) {
    if (id === activeSection) return;
    window.history.pushState(null, '', settingsSectionUrl(window.location.href, id));
  }

  // Section 1 — General
  //
  // Chaque changement s'enregistre AU MOMENT où il est fait, et s'inscrit dans
  // l'historique du bouton d'annulation (voir undoHistory.tsx). Il n'y a plus
  // ni barre « modifications non enregistrées » ni confirmation de sortie
  // (05/10/2026) : rien n'est jamais en attente.
  type Details = {
    name: string;
    cover: string;
    emoji: string;
    coverImage: string | null;
    useCustomCover: boolean;
    showProgramme: boolean;
  };
  const initialDetails: Details = {
    name: workshopName,
    cover: coverGradientFor(workshopId, coverGradient),
    emoji: emojiFor(workshopId, emoji),
    coverImage: coverImageUrl,
    useCustomCover: coverImageActive,
    // Tous les ateliers sont privés : on rejoint un atelier uniquement sur
    // invitation ou via une demande d'adhésion validée par un gestionnaire. Il
    // n'y a donc plus de réglage public/privé (cf. audit §1.2).
    showProgramme: showProgrammeProp,
  };
  // Ce qui est affiché ET enregistré : les deux ne divergent plus, sauf le nom
  // pendant la frappe (voir `nameDraft`).
  const [details, setDetails] = useState<Details>(initialDetails);
  // Le dernier état enregistré, lu par les annulations — qui s'exécutent bien
  // après le rendu qui les a créées.
  const savedDetailsRef = useRef<Details>(initialDetails);
  const [nameDraft, setNameDraft] = useState(workshopName);
  const [detailsError, setDetailsError] = useState('');

  // La couverture n'est plus réglable ici (10/10/2026) : elle reste dans les
  // réglages enregistrés, telle quelle, pour les cartes d'atelier.
  const { showProgramme } = details;
  const selectedEmoji = details.emoji;

  /** Applique et enregistre de nouveaux réglages. `record` inscrit le geste
   *  dans l'historique ; une annulation, elle, ne s'y inscrit pas. */
  /** Ce qui diffère entre deux états, au format de l'écriture : c'est tout ce
   *  qu'on envoie — un champ qu'on n'a pas touché n'écrase pas celui qu'un
   *  autre gestionnaire a pu changer entre-temps (src/lib/workshops/details.ts). */
  function detailsPatch(from: Details, to: Details): WorkshopDetailsPatch {
    const patch: WorkshopDetailsPatch = {};
    if (from.name !== to.name) patch.name = to.name;
    if (from.cover !== to.cover) patch.coverGradient = to.cover;
    if (from.coverImage !== to.coverImage) patch.coverImageUrl = to.coverImage;
    if (from.useCustomCover !== to.useCustomCover) patch.coverImageActive = to.useCustomCover;
    if (from.emoji !== to.emoji) patch.emoji = to.emoji;
    if (from.showProgramme !== to.showProgramme) patch.showProgramme = to.showProgramme;
    return patch;
  }

  /** `undoing` : l'état que cette annulation défait. Elle ne s'applique que si
   *  la base le contient encore — sinon quelqu'un d'autre a changé ces
   *  réglages depuis, et on ne revient pas sur son travail. */
  async function applyDetails(next: Details, record = true, undoing?: Details): Promise<boolean> {
    const previous = savedDetailsRef.current;
    if (JSON.stringify(next) === JSON.stringify(previous)) return true;
    const patch = detailsPatch(previous, next);
    const expected = undoing ? detailsPatch(next, undoing) : undefined;
    setDetails(next);
    setNameDraft(next.name);
    setDetailsError('');
    savedDetailsRef.current = next;
    const result = await updateWorkshopDetails(workshopId, patch, expected);
    if (!result.success) {
      // L'écran doit refléter la base : on revient à ce qui y est.
      savedDetailsRef.current = previous;
      setDetails(previous);
      setNameDraft(previous.name);
      setDetailsError(result.conflict ? t('err.changedMeanwhile') : (result.error ?? t('err.generic')));
      return false;
    }
    // Le menu latéral affiche nom et emoji : il suit sans attendre.
    announceWorkshopDetails({ id: workshopId, name: next.name, emoji: next.emoji });
    if (record) {
      recordUndo({
        section: 'general',
        undo: async () => {
          const ok = await applyDetails(previous, false, next);
          if (ok) flashGeneral(changedRows(next, previous));
          return ok;
        },
      });
    }
    return true;
  }

  // Ligne de Général qu'une annulation vient de changer, pour la faire
  // clignoter : on ne voit pas forcément ce qui a bougé, surtout si
  // l'annulation vient de nous ramener sur cette section.
  type GeneralRow = 'name' | 'cover' | 'emoji' | 'programme';
  const [generalFlash, setGeneralFlash] = useState<{ rows: GeneralRow[]; n: number } | null>(null);
  const generalFlashSeq = useRef(0);
  function changedRows(a: Details, b: Details): GeneralRow[] {
    const rows: GeneralRow[] = [];
    if (a.name !== b.name) rows.push('name');
    if (a.cover !== b.cover || a.coverImage !== b.coverImage || a.useCustomCover !== b.useCustomCover) rows.push('cover');
    if (a.emoji !== b.emoji) rows.push('emoji');
    if (a.showProgramme !== b.showProgramme) rows.push('programme');
    return rows;
  }
  function flashGeneral(rows: GeneralRow[]) {
    generalFlashSeq.current += 1;
    const n = generalFlashSeq.current;
    setGeneralFlash({ rows, n });
    setTimeout(() => setGeneralFlash((f) => (f?.n === n ? null : f)), UNDO_FLASH_MS + 200);
  }
  const flashOf = (row: GeneralRow) => (generalFlash?.rows.includes(row) ? generalFlash.n : null);

  function changeDetails(patch: Partial<Details>) {
    void applyDetails({ ...savedDetailsRef.current, ...patch });
  }

  /** Le nom s'enregistre quand on a fini de le taper (on quitte le champ, ou
   *  Entrée) : une seule action par renommage, pas une par lettre. Vide, il
   *  reprend sa valeur enregistrée. */
  function commitName() {
    const name = nameDraft.trim();
    if (!name) {
      setNameDraft(savedDetailsRef.current.name);
      return;
    }
    changeDetails({ name });
  }

  // ─── Historique et bouton d'annulation ───────────────────────────────────
  //
  // Une pile, jamais affichée : le bouton (et Ctrl+Z) défait la dernière
  // action, puis la précédente… Elle vit dans un ref — les annulations
  // inscrivent et retirent pendant des appels asynchrones — et `undoCount` ne
  // sert qu'à afficher ou masquer le bouton.
  const undoStack = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const undoingRef = useRef(false);

  const recordUndo = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    setUndoCount(undoStack.current.length);
    setUndoFailed(false);
  }, [setUndoCount, setUndoFailed]);

  // L'annulation de la dernière génération, signalée par la section des notions
  // (voir undoHistory.tsx). Deux confirmations s'y rattachent : l'annuler, et
  // défaire un geste ordinaire qui toucherait au programme — ce qui la retire.
  const [generationUndo, setGenerationUndo] = useState<GenerationUndoHandle | null>(null);
  const generationUndoRef = useRef<GenerationUndoHandle | null>(null);
  useEffect(() => { generationUndoRef.current = generationUndo; });
  const [confirmGenerationUndo, setConfirmGenerationUndo] = useState(false);
  const [confirmProgramUndo, setConfirmProgramUndo] = useState(false);
  const [generationUndoing, setGenerationUndoing] = useState(false);
  const [generationUndoFailed, setGenerationUndoFailed] = useState(false);

  async function runGenerationUndo() {
    const handle = generationUndoRef.current;
    setConfirmGenerationUndo(false);
    if (!handle) return;
    setGenerationUndoing(true);
    setGenerationUndoFailed(false);
    const ok = await handle.run();
    setGenerationUndoing(false);
    if (!ok) setGenerationUndoFailed(true);
  }

  async function undoLast(confirmed = false) {
    // Une annulation à la fois : deux Ctrl+Z rapprochés défont deux actions,
    // dans l'ordre, jamais la même deux fois.
    if (undoingRef.current) return;
    const top = undoStack.current[undoStack.current.length - 1];
    if (!top) return;
    if (top.section === 'notions' && generationUndoRef.current) {
      if (!confirmed) {
        openSection('notions');
        setConfirmProgramUndo(true);
        return;
      }
      generationUndoRef.current.dismiss();
    }
    const entry = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!entry) return;
    undoingRef.current = true;
    setUndoing(true);
    setUndoFailed(false);
    // On montre ce qu'on défait : annuler un renommage depuis l'onglet des
    // notions sans y retourner ne laisserait rien voir.
    openSection(entry.section);
    const ok = await entry.undo();
    undoingRef.current = false;
    setUndoing(false);
    if (!ok) setUndoFailed(true);
  }

  // Quitter la page vide la liste — et efface les copies de suppression qu'elle
  // seule pouvait restaurer. Deux sorties : un lien de l'app (la page est
  // démontée) et la fermeture ou le rechargement de l'onglet (`pagehide`). Dans
  // les deux cas par `sendBeacon`, seul envoi que le navigateur mène à terme
  // quand la page disparaît. Ce qui échapperait (navigateur tué) est rattrapé
  // par la purge des copies de plus d'un jour (@/lib/workshops/trash).
  useEffect(() => {
    function discardCopies() {
      const trashIds = undoStack.current.flatMap((e) => (e.trashId ? [e.trashId] : []));
      // La liste part avec les copies : une page restaurée depuis le cache du
      // navigateur (retour arrière) ne doit pas proposer d'annuler ce qui ne
      // peut plus l'être.
      undoStack.current = [];
      setUndoCount(0);
      if (trashIds.length === 0) return;
      const body = new Blob([JSON.stringify({ workshopId, trashIds })], { type: 'application/json' });
      navigator.sendBeacon('/api/settings-trash', body);
    }
    window.addEventListener('pagehide', discardCopies);
    return () => {
      window.removeEventListener('pagehide', discardCopies);
      discardCopies();
    };
  }, [workshopId]);

  // Ctrl+Z (Cmd+Z sur Mac) — sauf dans un champ de saisie, où il garde son
  // sens habituel : défaire la frappe.
  const undoLastRef = useRef(undoLast);
  useEffect(() => { undoLastRef.current = undoLast; });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      e.preventDefault();
      void undoLastRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const visibleNavItems = isMember ? NAV_ITEMS.filter((item) => item.id === 'general') : NAV_ITEMS;

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
        minHeight: 'calc(100vh - var(--app-chrome-h))',
        background: palette.cream,
        cursor: 'default',
      }}
    >
      {/* Coquille bornée à la fenêtre (ordinateur) : seule la colonne de contenu
          défile. Plus de navigation de sections ici — elle vit dans le sous-menu
          « paramètres » du menu latéral, qui écrit l'URL lue plus haut. La
          colonne occupe toute la largeur (la molette agit partout) et centre son
          contenu par ses marges intérieures : 760 px, 1080 pour « Chapitre &
          Notion » dont les listes ont besoin de place (maquette). */}
      <div className="settings-shell flex w-full md:py-8">
      {/* ── Main content — seule colonne à défiler (sans barre visible) ── */}
      <div
        className="scroll-panel settings-content px-5 pt-0 pb-10 md:pt-0 md:pb-4"
        style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', ['--settings-w' as string]: activeSection === 'notions' ? '1080px' : '760px' }}
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
                      openSection(item.id);
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
              {/* Membre simple : nom en lecture seule. */}
              <Row label={t('general.nameLabel')} noBorder>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: palette.inkSoft }}>
                  <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: palette.inkFaint }}>{uniqueTag}</span>
                  <span style={{ color: palette.lineStrong }}>·</span>
                  {workshopName}
                </span>
              </Row>
            </>
          ) : (
            <>
          <Row label={t('general.nameLabel')} flash={flashOf('name')}>
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
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
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

          <Row label={t('general.emojiLabel')} flash={flashOf('emoji')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COVER_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => changeDetails({ emoji: e })}
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
            <Row label={t('access.showProgramme')} flash={flashOf('programme')}>
              <Switch value={showProgramme} onChange={(v) => changeDetails({ showProgramme: v })} />
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
          {membersSlot}
        </div>

        <div style={{ display: activeSection === 'files' ? 'contents' : 'none' }}>
          {filesSlot}
        </div>

        <div style={{ display: activeSection === 'notions' ? 'contents' : 'none' }}>
          <UndoHistoryContext.Provider value={recordUndo}>
            <GenerationUndoContext.Provider value={setGenerationUndo}>
              {notionsSlot}
            </GenerationUndoContext.Provider>
          </UndoHistoryContext.Provider>
        </div>

      </div>
      </div>

      {/* ── Bouton d'annulation (05/10/2026) ──
          Remplace la barre « modifications non enregistrées » : tout
          s'enregistre au moment du geste, et ce bouton défait le dernier.
          Visible seulement s'il y a quelque chose à défaire. */}
      {/* Au-dessus de lui, celui de la dernière génération : visible tant
          qu'elle s'annule (voir undoHistory.tsx), quelle que soit la section. */}
      <div style={{ position: 'fixed', bottom: 24, right: 32, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
      {(generationUndo || generationUndoing || generationUndoFailed) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: palette.paper,
            borderRadius: 12,
            boxShadow: `0 10px 30px ${ink(0.16)}`,
            border: `1px solid ${ink(0.08)}`,
            padding: '8px 8px 8px 14px',
          }}
        >
          {generationUndoFailed && (
            <span style={{ fontSize: 12.5, color: palette.danger }}>{t('generationUndo.failed')}</span>
          )}
          {(generationUndo || generationUndoing) && (
            <Tooltip content={t('generationUndo.tooltip')}>
              <span style={{ display: 'inline-flex' }}>
                <SmallBtn
                  onClick={() => { openSection('notions'); setConfirmGenerationUndo(true); }}
                  disabled={generationUndoing}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {generationUndoing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={2} />}
                    {t('generationUndo.button')}
                  </span>
                </SmallBtn>
              </span>
            </Tooltip>
          )}
          {generationUndoFailed && !generationUndo && (
            <button
              onClick={() => setGenerationUndoFailed(false)}
              aria-label={t('cancel')}
              style={{ display: 'flex', border: 'none', background: 'transparent', color: palette.inkMuted, cursor: 'pointer', padding: 4 }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      {(undoCount > 0 || undoing || undoFailed || detailsError) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: palette.paper,
            borderRadius: 12,
            boxShadow: `0 10px 30px ${ink(0.16)}`,
            border: `1px solid ${ink(0.08)}`,
            padding: '8px 8px 8px 14px',
          }}
        >
          {(undoFailed || detailsError) && (
            <span style={{ fontSize: 12.5, color: palette.danger }}>
              {detailsError || t('undo.failed')}
            </span>
          )}
          {(undoCount > 0 || undoing) && (
            <Tooltip content={t('undo.tooltip')}>
              {/* Enveloppe : le déclencheur reçoit les écouteurs de l'infobulle,
                  que SmallBtn ne transmet pas à son bouton. */}
              <span style={{ display: 'inline-flex' }}>
                <SmallBtn onClick={() => void undoLast()} disabled={undoing}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {undoing ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} strokeWidth={2} />}
                    {t('undo.button')}
                  </span>
                </SmallBtn>
              </span>
            </Tooltip>
          )}
        </div>
      )}
      </div>

      {confirmGenerationUndo && generationUndo && (
        <ConfirmDialog
          width={440}
          title={t('generationUndo.confirmTitle')}
          description={t('generationUndo.confirmDesc', { created: generationUndo.created, changed: generationUndo.changed })}
          confirmLabel={t('generationUndo.confirmAction')}
          cancelLabel={t('generationUndo.keep')}
          icon={<Undo2 size={17} />}
          onCancel={() => setConfirmGenerationUndo(false)}
          onConfirm={() => void runGenerationUndo()}
        />
      )}

      {confirmProgramUndo && (
        <ConfirmDialog
          width={440}
          title={t('generationUndo.modifyTitle')}
          description={t('generationUndo.modifyDesc')}
          confirmLabel={t('generationUndo.modifyConfirm')}
          cancelLabel={t('cancel')}
          confirmTone="confirm"
          iconTone="accent"
          onCancel={() => setConfirmProgramUndo(false)}
          onConfirm={() => { setConfirmProgramUndo(false); void undoLast(true); }}
        />
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

    </div>
  );
}
