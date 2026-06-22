'use client';

import type { ReactNode } from 'react';
import Modal from './Modal';

// Modale de confirmation partagée (carte crème centrée). Reproduit à l'identique
// le motif dupliqué une dizaine de fois dans l'éditeur d'examen (et ailleurs) :
// backdrop flouté, pastille d'icône, titre, description, bloc optionnel, puis
// deux boutons « annuler » / action. Le rendu visuel est strictement le même que
// les modales inline d'origine — seuls les textes/handlers changent par appel.
//
// `portal` reproduit le `createPortal(document.body)` requis quand la modale est
// rendue dans un conteneur ayant un ancêtre `transform` (sinon `position: fixed`
// se cale sur cet ancêtre au lieu de l'écran). À régler selon le point d'appel.

type ButtonTone = 'danger' | 'confirm';
type IconTone = 'danger' | 'accent';

type ConfirmDialogProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Bloc additionnel rendu entre la description et les boutons (ex. liste d'éléments affectés). */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Couleur du bouton de confirmation : rouge (danger) ou vert (confirm). Défaut : danger. */
  confirmTone?: ButtonTone;
  /** Couleur de la pastille d'icône. Défaut : danger (rouge). */
  iconTone?: IconTone;
  /** Icône custom (Lucide). Par défaut, le glyphe « ! ». */
  icon?: ReactNode;
  /** Largeur de la carte. Défaut : 420. */
  width?: number;
  /** Rendu via createPortal(document.body). Défaut : false (rendu inline). */
  portal?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Annuler',
  confirmTone = 'danger',
  iconTone = 'danger',
  icon,
  width = 420,
  portal = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const iconBg = iconTone === 'accent' ? 'rgba(232,184,108,0.18)' : 'rgba(184,90,74,0.12)';
  const iconColor = iconTone === 'accent' ? '#a87a3a' : '#b85a4a';
  const confirmBg = confirmTone === 'confirm' ? '#4f6b40' : '#b85a4a';

  return (
    <Modal onClose={onCancel} width={width} portal={portal}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, margin: '0 auto 12px' }}>
        {icon ?? '!'}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#2d2a24', marginBottom: 6 }}>{title}</div>
      {description !== undefined && (
        <div style={{ fontSize: 12.5, color: '#7a766d', marginBottom: children ? 10 : 20 }}>{description}</div>
      )}
      {children}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(45,42,36,0.14)', background: 'transparent', color: '#5a564c', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{cancelLabel}</button>
        <button onClick={onConfirm} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: confirmBg, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
