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

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Settings } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';

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

  const href = `/${locale}/workshops/${workshopId}/settings`;

  // ─── Les paramètres se préparent pendant qu'on vise l'engrenage ───────────
  //
  // La page est demandée au serveur dès le survol (ou le premier contact du
  // doigt), pas au clic : le trajet aller-retour se fait pendant que la souris
  // achève sa course, et l'écran est là au relâchement.
  //
  // Pourquoi pas `prefetch` de Next, qui ferait pareil ? Parce qu'il se
  // déclenche à l'ENTRÉE DANS LE CHAMP DE VISION, et que cet engrenage est
  // visible sur toutes les pages d'atelier : chaque ouverture d'atelier ferait
  // alors calculer les paramètres au serveur, y compris pour les 99 % de
  // visites qui n'y vont jamais. Le survol, lui, est une intention.
  const router = useRouter();
  const warmed = useRef(false);
  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    router.prefetch(href);
  }, [router, href]);

  return (
    <Tooltip content={tNav('workshopSettings')}>
      <Link
        href={href}
        onPointerEnter={warm}
        onTouchStart={warm}
        onFocus={warm}
        aria-label={tNav('workshopSettings')}
        className={`flex flex-none items-center justify-center rounded-full border border-[var(--line)] outline-none transition-colors focus-visible:shadow-[var(--shadow-focus)] ${
          active ? 'text-[var(--green)]' : 'text-[var(--ink-body)] hover:text-[var(--ink)]'
        }`}
        style={{ width: size, height: size }}
      >
        <Settings size={size >= 34 ? 16 : 15} strokeWidth={1.75} />
      </Link>
    </Tooltip>
  );
}
