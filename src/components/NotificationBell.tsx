'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';

/**
 * Cloche de notifications — dessinée d'après la maquette (lignes 109-129 de
 * App-Culture.dc.html). Montée dans DashboardHeader mais NON FONCTIONNELLE :
 * aucune donnée de notification n'existe encore côté serveur, le panneau
 * affiche deux exemples figés et les boutons ne font que le refermer. Voir T15,
 * docs/chantiers/2026-08-05-refonte-ui-design-system.md. Le contenu des
 * exemples ci-dessous reste volontairement en français (donnée fictive
 * représentative d'un futur flux réel, cf. .claude/rules/i18n.md) ; seuls
 * les libellés d'interface passent par next-intl.
 */
export default function NotificationBell() {
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-[34px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-page)] text-[var(--ink-body)] outline-none focus-visible:shadow-[var(--shadow-focus)]"
      >
        <Bell size={16} strokeWidth={1.75} />
        <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[var(--gold)] text-[9.5px] font-bold text-white">
          2
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-11 right-0 z-50 w-[300px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]">
            <div className="border-b border-[var(--line-soft)] px-4 py-3 text-[11px] font-bold tracking-[0.14em] text-[var(--ink-muted)] uppercase">
              {t('title')}
            </div>
            <div className="border-b border-[var(--line-soft)] px-4 py-3.5">
              <div className="text-[13.5px] leading-snug text-[var(--ink-body)]">
                <strong className="text-[var(--ink)]">Camille</strong> t&apos;invite dans l&apos;atelier{' '}
                <strong className="text-[var(--ink)]">Histoire — 2nde B</strong>
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-[10px] bg-[var(--green)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--on-green)]"
                >
                  {t('join')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--ink-body)]"
                >
                  {t('ignore')}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2.5 px-4 py-3.5">
              <div className="text-[13.5px] leading-snug text-[var(--ink-body)]">
                atelier <strong className="text-[var(--ink)]">Brevet blanc</strong> supprimé
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-[var(--tan-strong)]"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
