'use client';

// Engrenage de la coquille : lien direct vers les paramètres de l'atelier.
//
// C'était auparavant un menu déroulant (paramètres / partager · QR / quitter) ;
// la maquette du redesign supprime cette popup — le partage QR vit dans la page
// paramètres (section « accès & limites ») et « quitter l'atelier » dans sa zone
// de danger. La page paramètres s'adapte au rôle (version réduite en lecture
// seule pour un membre simple), donc l'engrenage s'affiche pour tous les rôles.
//
// Monté à deux endroits — la barre du haut (ordinateur) et le bandeau d'atelier
// (téléphone) — d'où le composant partagé.
//
// Les paramètres se préparent au survol (`WarmLink`), sur le bouton lui-même et
// pas un pouce plus large : un halo de déclenchement autour attraperait aussi
// les clics, et il n'y a que 12 px de vide jusqu'à la cloche de notifications.

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Settings } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import WarmLink from '@/components/WarmLink';

type Props = {
  workshopId: string;
  /** 34px dans la barre du haut, 30px dans le bandeau téléphone. */
  size?: number;
};

export default function WorkshopActionsMenu({ workshopId, size = 34 }: Props) {
  const tNav = useTranslations('nav');
  const locale = useLocale();
  // Même convention que les onglets de la barre (tabClass, DashboardHeader) :
  // survol → encre, page active → vert.
  const pathname = usePathname();
  const active = pathname.includes(`/workshops/${workshopId}/settings`);

  return (
    <Tooltip content={tNav('workshopSettings')}>
      <WarmLink
        href={`/${locale}/workshops/${workshopId}/settings`}
        aria-label={tNav('workshopSettings')}
        className={`flex flex-none items-center justify-center rounded-full border border-[var(--line)] outline-none transition-colors focus-visible:shadow-[var(--shadow-focus)] ${
          active ? 'text-[var(--green)]' : 'text-[var(--ink-body)] hover:text-[var(--ink)]'
        }`}
        style={{ width: size, height: size }}
      >
        <Settings size={size >= 34 ? 16 : 15} strokeWidth={1.75} />
      </WarmLink>
    </Tooltip>
  );
}
