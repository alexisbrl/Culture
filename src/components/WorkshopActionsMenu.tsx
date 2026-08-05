'use client';

// Menu d'actions de l'atelier, ouvert par l'engrenage de la coquille.
//
// Il remplace le « chrome hérité » que WorkshopClient posait au-dessus du
// contenu (titre + chips + boutons flottants « partager · QR » / « paramètres »
// / « quitter ») : la maquette ne montre que cet engrenage, le nom de l'atelier
// vivant déjà dans la barre du haut (T12) et dans le bandeau téléphone (T14).
//
// Monté à deux endroits — la barre du haut (ordinateur) et le bandeau d'atelier
// (téléphone) — d'où le composant partagé : sans lui, un membre simple perdrait
// « quitter l'atelier » sur téléphone, où l'engrenage n'était affiché qu'aux
// gestionnaires.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { QrCode, Settings, LogOut } from 'lucide-react';
import ShareQRModal from '@/components/ShareQRModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { leaveWorkshop } from '@/app/actions/workshops';

type Props = {
  workshopId: string;
  workshopName: string;
  role: 'owner' | 'manager' | 'member';
  /** 34px dans la barre du haut, 30px dans le bandeau téléphone. */
  size?: number;
};

export default function WorkshopActionsMenu({ workshopId, workshopName, role, size = 34 }: Props) {
  const t = useTranslations('workshop');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  // Gestionnaire ou propriétaire : réglages + partage. Le partage est une
  // invitation à rejoindre l'atelier, pas une action de candidat.
  const canManage = role === 'owner' || role === 'manager';
  // Le propriétaire ne peut pas quitter son atelier (il doit d'abord le
  // transférer ou le supprimer).
  const canLeave = role !== 'owner';

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/${locale}/dashboard?preview=${workshopId}`);
  }, [locale, workshopId]);

  async function handleLeave() {
    setLeaving(true);
    setLeaveError('');
    const result = await leaveWorkshop(workshopId);
    if (result.success) {
      router.push(`/${locale}/dashboard`);
      return;
    }
    setLeaving(false);
    setLeaveError(result.error ?? t('leaveConfirm.error'));
  }

  // Un propriétaire sans droit de gestion n'existe pas : si les deux sont faux,
  // le menu n'aurait aucune entrée.
  if (!canManage && !canLeave) return null;

  const itemClass =
    'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--ink-body)] hover:bg-[var(--surface-sunken)]';

  return (
    <div className="relative">
      <button
        type="button"
        title={tNav('workshopSettings')}
        onClick={() => setOpen((v) => !v)}
        className="flex flex-none items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink-body)] outline-none transition-colors hover:text-[var(--green-strong)] focus-visible:shadow-[var(--shadow-focus)]"
        style={{ width: size, height: size }}
      >
        <Settings size={size >= 34 ? 16 : 15} strokeWidth={1.75} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-raised)] py-2 shadow-[var(--shadow-lg)]">
            {canManage && (
              <Link
                href={`/${locale}/workshops/${workshopId}/settings`}
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <Settings size={16} strokeWidth={1.75} />
                {tNav('workshopSettings')}
              </Link>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShareOpen(true);
                }}
                className={itemClass}
              >
                <QrCode size={16} strokeWidth={1.75} />
                {t('shareBtn')}
              </button>
            )}
            {canLeave && (
              <>
                {canManage && <div className="my-1 border-t border-[var(--line)]" />}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setLeaveOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[var(--ink-body)] hover:bg-[var(--danger-tint)] hover:text-[var(--danger-strong)]"
                >
                  <LogOut size={16} strokeWidth={1.75} />
                  {t('leaveBtn')}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <ShareQRModal open={canManage && shareOpen} onClose={() => setShareOpen(false)} title={workshopName} url={joinUrl} />

      {leaveOpen && (
        <ConfirmDialog
          width={420}
          title={t('leaveConfirm.title')}
          description={
            <>
              {t('leaveConfirm.desc', { name: workshopName })}
              {leaveError && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{leaveError}</div>}
            </>
          }
          confirmLabel={leaving ? '…' : t('leaveConfirm.confirm')}
          cancelLabel={t('leaveConfirm.cancel')}
          onCancel={() => {
            if (!leaving) setLeaveOpen(false);
          }}
          onConfirm={handleLeave}
        />
      )}
    </div>
  );
}
