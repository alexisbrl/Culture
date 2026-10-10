'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { emojiFor } from '@/lib/workshopCover';
import { getUserWorkshops, type WorkshopCardData } from '@/app/actions/workshops';
import { Tooltip } from '@/components/ui/tooltip';
import WarmLink from '@/components/WarmLink';

type Props = {
  /** Bord gauche du tiroir : il se pose contre le menu, ouvert. */
  left: number;
  currentWorkshopId: string | null;
  onClose: () => void;
};

/**
 * Tiroir « changer d'atelier » du menu latéral (ordinateur). Il glisse depuis
 * le menu, sur toute la hauteur, par-dessus un voile qui le referme au clic —
 * le clic qui ferme ne fait que ça (docs/architecture.md §11.4).
 *
 * Pas de pourcentage par atelier, contrairement à la maquette : la donnée
 * n'existe pas (même choix que le sélecteur du téléphone, WorkshopSwitcher) —
 * le nombre de membres en tient lieu.
 */
export default function WorkshopDrawer({ left, currentWorkshopId, onClose }: Props) {
  const t = useTranslations('nav');
  const tw = useTranslations('workshop');
  const locale = useLocale();
  const [workshops, setWorkshops] = useState<WorkshopCardData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUserWorkshops().then(({ owned, joined }) => {
      if (!cancelled) setWorkshops([...owned, ...joined]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        data-nav-anim
        onClick={onClose}
        className="fixed inset-0 z-[53]"
        style={{ background: 'color-mix(in oklab, var(--ink) 10%, transparent)', animation: 'nav-fade-in 200ms both' }}
      />
      <div
        data-nav-anim
        role="dialog"
        aria-label={t('switcherTitle')}
        className="fixed top-0 bottom-0 z-[54] flex w-[300px] flex-col border-r border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
        style={{ left, transition: 'left 240ms cubic-bezier(0.22,1,0.36,1)', animation: 'nav-drawer-in 260ms cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line-soft)] pt-5 pr-4 pb-3.5 pl-5">
          <span className="text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">{t('switcherTitle')}</span>
          <Tooltip content={t('close')}>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="flex size-[30px] flex-none items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-page)] text-[var(--ink-muted)] outline-none hover:text-[var(--ink)] focus-visible:shadow-[var(--shadow-focus)]"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {workshops === null && (
            <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">{t('switcherLoading')}</div>
          )}
          {workshops?.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">{t('switcherEmpty')}</div>
          )}
          {workshops?.map((w) => {
            const active = w.id === currentWorkshopId;
            return (
              <WarmLink
                key={w.id}
                href={`/${locale}/workshops/${w.id}`}
                onClick={onClose}
                data-nav-anim
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none hover:bg-[var(--green-tint)] focus-visible:shadow-[var(--shadow-focus)] ${active ? 'bg-[var(--green-tint)]' : ''}`}
                style={{ animation: 'nav-item-in 240ms cubic-bezier(0.22,1,0.36,1) both' }}
              >
                <span aria-hidden className="flex size-[34px] flex-none items-center justify-center rounded-[10px] border border-[var(--line)] text-[17px] leading-none">
                  {emojiFor(w.id, w.emoji)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--ink)]">{w.name}</span>
                  <span className="mt-0.5 block text-[11.5px] text-[var(--ink-muted)]">
                    {tw('memberCount', { count: w.member_count, plural: w.member_count > 1 ? 's' : '' })}
                  </span>
                </span>
              </WarmLink>
            );
          })}
        </div>

        <div className="border-t border-[var(--line-soft)] p-2">
          <WarmLink
            href={`/${locale}/workshops/new`}
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold text-[var(--green-strong)] outline-none hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)]"
          >
            <span className="flex size-[34px] flex-none items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[var(--line-strong)] text-[var(--tan)]">
              <Plus size={15} strokeWidth={1.75} />
            </span>
            {t('newWorkshop')}
          </WarmLink>
        </div>
      </div>
    </>
  );
}
