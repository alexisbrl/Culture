'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(45,42,36,0.42)', backdropFilter: 'blur(2px)' }} />
      <div style={{ position: 'relative', width, maxWidth: '90vw', background: '#fcf9f2', borderRadius: 20, padding: 24, boxShadow: '0 24px 64px rgba(45,42,36,0.25)', fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center' as const }}>
        {children}
      </div>
    </div>
  );

  return portal ? createPortal(node, document.body) : node;
}
