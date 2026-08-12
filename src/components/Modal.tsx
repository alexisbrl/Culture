'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
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
  const node = (
    /* `data-modal-layer` : repère lu par les panneaux qui se ferment au clic
       extérieur (`useDismissOnOutsideClick`). Une modale se pose au-dessus
       d'eux et gère elle-même sa sortie (fond cliquable) ; sans ce repère, un
       clic sur « confirmer » — rendu dans un portail, donc hors de leur arbre —
       passerait pour un clic ailleurs, refermerait le panneau et serait avalé
       avant d'atteindre le bouton. */
    <div data-modal-layer="" style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: ink(0.42), backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width, maxWidth: '90vw', background: palette.surfaceRaised, borderRadius: radius.lg, padding: 24, boxShadow: shadow.lg, fontFamily: 'var(--font-sans)', textAlign: 'center' as const }}>
        {children}
      </div>
    </div>
  );

  return portal ? createPortal(node, document.body) : node;
}
