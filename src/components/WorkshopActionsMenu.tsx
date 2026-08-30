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

  // ─── La zone qui déclenche, plus large que l'engrenage ────────────────────
  //
  // Exprimée en FRACTION de la taille du bouton, jamais en pixels écrits à la
  // main : changer `size` déplace la zone d'autant, il n'y a rien à retoucher
  // ailleurs. La marge négative rend la place prise au voisinage, donc la mise
  // en page ne bouge pas d'un pixel.
  //
  // Pourquoi 0,35 et pas 1 (une zone trois fois plus grande) : ce halo attrape
  // AUSSI les clics. Au-delà de l'espace libre autour du bouton — 12 px jusqu'à
  // la cloche, 13 px jusqu'aux bords de la barre — il recouvrirait la cloche et
  // avalerait ses clics, ou déborderait sous la barre sur le contenu de la
  // page. 0,35 × 34 = 12 px : la zone occupe exactement le vide disponible.
  const halo = Math.round(size * 0.35);

  return (
    // Le halo porte le déclenchement, pas le bouton : c'est lui qui est large.
    // Il reste HORS de l'infobulle, qui doit continuer de suivre l'engrenage
    // lui-même et non son voisinage.
    <span
      onPointerEnter={warm}
      onTouchStart={warm}
      style={{ display: 'inline-flex', flex: 'none', padding: halo, margin: -halo }}
    >
      <Tooltip content={tNav('workshopSettings')}>
        <Link
          href={href}
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
    </span>
  );
}
