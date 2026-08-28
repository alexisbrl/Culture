'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { palette, ink, radius, shadow } from '@/lib/theme';

// Coquille de modale partagée (carte crème centrée + fond flouté). C'est la partie
// dupliquée d'innombrables modales du projet : backdrop `position:fixed` cliquable
// (ferme la modale) + carte crème. Le contenu (icône, titre, boutons…) est libre,
// fourni par `children`. `ConfirmDialog` est bâti dessus pour le cas standard à deux
// boutons ; les modales plus spécifiques (multi-étapes, 3 boutons) utilisent
// directement `<Modal>` avec leur propre contenu.
//
// `portal` reproduit `createPortal(document.body)`, nécessaire quand la modale est
// rendue dans un conteneur ayant un ancêtre `transform` (sinon `position:fixed` se
// cale sur cet ancêtre au lieu de l'écran).

/** Ce qui peut recevoir le clavier. Sert au piège à tabulation ci-dessous. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  /** Clic sur le fond. Si non fourni, le fond n'est pas cliquable. */
  onClose?: () => void;
  /** Largeur de la carte. Défaut : 420. */
  width?: number;
  /** Rendu via createPortal(document.body). Défaut : false. */
  portal?: boolean;
  children: ReactNode;
};

export default function Modal({ onClose, width = 420, portal = false, children }: ModalProps) {
  const card = useRef<HTMLDivElement>(null);

  // ─── Le clavier ne sort pas de la carte ───────────────────────────────────
  //
  // Sans ça, la tabulation continue d'atteindre la page RESTÉE DERRIÈRE le fond
  // flouté : on ne voit pas ce qui est sélectionné, et un appui sur Entrée
  // déclenche un bouton qu'on ne regarde pas — changement de page compris
  // (constaté le 28/08/2026 pendant une génération par IA). La modale prend donc
  // le focus à l'ouverture, le fait tourner en boucle sur son propre contenu, et
  // le rend à l'élément d'où il venait à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = card.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? card.current)?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Échap ferme, mais seulement là où la sortie est ouverte : une modale sans
    // `onClose` refuse délibérément qu'on la quitte d'un geste.
    if (event.key === 'Escape') {
      if (!onClose) return;
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !card.current) return;

    const targets = Array.from(card.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.getClientRects().length > 0);
    // Une carte sans rien de cliquable garde quand même le clavier : sortir
    // reviendrait à rendre la main à la page de derrière.
    if (targets.length === 0) return event.preventDefault();

    const edge = event.shiftKey ? targets[0] : targets[targets.length - 1];
    const active = document.activeElement;
    if (active === edge || active === card.current) {
      event.preventDefault();
      (event.shiftKey ? targets[targets.length - 1] : targets[0]).focus();
    }
  }

  const node = (
    /* `data-modal-layer` : repère lu par les panneaux qui se ferment au clic
       extérieur (`useDismissOnOutsideClick`). Une modale se pose au-dessus
       d'eux et gère elle-même sa sortie (fond cliquable) ; sans ce repère, un
       clic sur « confirmer » — rendu dans un portail, donc hors de leur arbre —
       passerait pour un clic ailleurs, refermerait le panneau et serait avalé
       avant d'atteindre le bouton. */
    <div data-modal-layer="" onKeyDown={onKeyDown} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />
      <div ref={card} role="dialog" aria-modal="true" tabIndex={-1} style={{ position: 'relative', width, maxWidth: '90vw', background: palette.surfaceRaised, borderRadius: radius.lg, padding: 24, boxShadow: shadow.lg, fontFamily: 'var(--font-sans)', textAlign: 'center' as const, outline: 'none' }}>
        {children}
      </div>
    </div>
  );

  return portal ? createPortal(node, document.body) : node;
}
