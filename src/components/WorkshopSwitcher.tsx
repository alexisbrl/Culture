'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Sprout, Plus } from 'lucide-react';
import { getUserWorkshops, type WorkshopCardData } from '@/app/actions/workshops';
import { Tooltip } from '@/components/ui/tooltip';

type Props = {
  open: boolean;
  onClose: () => void;
  currentWorkshopId: string | null;
};

/**
 * Panneau « changer d'atelier » (T13) — pas de pourcentage affiché : aucune
 * donnée de progression par atelier n'existe aujourd'hui (`WorkshopCardData`
 * n'a pas ce champ, le calculer serait une évolution fonctionnelle hors
 * périmètre). La maquette montre un pourcentage ; on affiche le nombre de
 * membres à la place, seule donnée réelle disponible pour cette ligne.
 */
export default function WorkshopSwitcher({ open, onClose, currentWorkshopId }: Props) {
  const t = useTranslations('nav');
  const tw = useTranslations('workshop');
  const locale = useLocale();
  const [workshops, setWorkshops] = useState<WorkshopCardData[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getUserWorkshops().then(({ owned, joined }) => {
      if (!cancelled) setWorkshops([...owned, ...joined]);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 z-50 mt-2 w-[300px] max-w-[calc(100vw-28px)] overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]">
        <div className="border-b border-[var(--line-soft)] px-4 py-3 text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">
          {t('switcherTitle')}
        </div>

        {workshops === null && (
          <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">{t('switcherLoading')}</div>
        )}
        {workshops?.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">{t('switcherEmpty')}</div>
        )}
        {workshops?.map((w) => {
          const active = w.id === currentWorkshopId;
          return (
            <Link
              key={w.id}
              href={`/${locale}/workshops/${w.id}`}
              onClick={onClose}
              className="relative flex w-full items-center gap-3 border-b border-[var(--line-soft)] px-4 py-3 text-left transition-[background-color,padding-left] duration-150 ease-out hover:bg-[var(--green-tint)] hover:pl-[22px]"
            >
              <span
                className="absolute top-[13px] bottom-[13px] left-[6px] w-[3px] rounded-full"
                style={{ background: active ? 'var(--green)' : 'transparent' }}
              />
              <Tooltip content={w.is_premium ? t('premiumWorkshop') : undefined}>
                <span
                  className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-[var(--green-tint)] text-[var(--green)]"
                  style={{ border: w.is_premium ? '1.5px solid var(--gold)' : '1.5px solid transparent' }}
                >
                  <Sprout size={15} strokeWidth={1.75} />
                </span>
              </Tooltip>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-[var(--ink)]">{w.name}</span>
                <span className="mt-0.5 block text-[11.5px] text-[var(--ink-muted)]">
                  {tw('memberCount', { count: w.member_count, plural: w.member_count > 1 ? 's' : '' })}
                </span>
              </span>
            </Link>
          );
        })}

        <Link
          href={`/${locale}/workshops/new`}
          onClick={onClose}
          className="flex items-center gap-3 px-4 py-3 text-[13.5px] font-semibold text-[var(--green-strong)] hover:bg-[var(--surface-sunken)]"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[var(--line-strong)] text-[var(--tan)]">
            <Plus size={15} strokeWidth={1.75} />
          </span>
          {t('newWorkshop')}
        </Link>
        <Link
          href={`/${locale}/dashboard`}
          onClick={onClose}
          className="block border-t border-[var(--line-soft)] px-4 py-3 text-center text-[12.5px] font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)]"
        >
          {t('allWorkshops')}
        </Link>
      </div>
    </>
  );
}
