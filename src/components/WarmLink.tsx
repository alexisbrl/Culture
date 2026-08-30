'use client';

// Un lien qui prépare sa page dès qu'on le vise.
//
// ── Pourquoi pas le `prefetch` de Next ──────────────────────────────────────
//
// Il se déclenche à l'ENTRÉE DANS LE CHAMP DE VISION. Sur une barre de
// navigation, tous les onglets sont visibles en permanence : chaque ouverture
// de page ferait alors calculer au serveur toutes les autres, y compris pour
// les visites qui n'y vont jamais. Le survol, lui, est une intention — le
// trajet vers le serveur se fait pendant que la souris achève sa course, et la
// page est là au relâchement.
//
// Sur téléphone il n'y a pas de survol : le premier contact du doigt
// (`touchstart`) part quelques dizaines de millisecondes avant le clic, ce qui
// est toujours ça de pris. Le focus clavier compte aussi comme une intention.
//
// Une page n'est préparée QU'UNE FOIS par visite : le résultat reste en réserve
// côté navigateur, et repartir dessus au survol suivant ne servirait à rien.
//
// ⚠️ Sans effet en développement — Next.js ne prépare rien hors production.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & { href: string };

export default function WarmLink({ href, children, ...rest }: Props) {
  const router = useRouter();
  const warmed = useRef(false);

  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    router.prefetch(href);
  }, [router, href]);

  return (
    <Link href={href} onPointerEnter={warm} onTouchStart={warm} onFocus={warm} {...rest}>
      {children}
    </Link>
  );
}
