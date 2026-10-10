'use client';

import { useEffect, useState } from 'react';

/** Durées des animations de sous-menu (globals.css, `nav-unfold` / `nav-fold`),
 *  marges comprises pour le décalage des entrées. */
const UNFOLD_MS = 450;
const FOLD_MS = 260;

export type FoldPhase = 'idle' | 'opening' | 'closing';

/**
 * Cycle de vie d'un sous-menu du menu latéral.
 *
 * Il se déplie quand sa page DEVIENT active, et se replie quand on la quitte —
 * il doit donc rester monté le temps de son repli. Ouvert dès le premier rendu
 * (arrivée directe sur la page), il est là sans animation : rien ne vient de
 * changer sous les yeux.
 *
 * La phase est ajustée PENDANT le rendu (et non dans un effet) au changement de
 * `open` : l'animation part dès la première image, sans un rendu intermédiaire
 * où le sous-menu apparaîtrait plein avant de se déplier.
 */
export function useFold(open: boolean): { mounted: boolean; phase: FoldPhase } {
  const [prevOpen, setPrevOpen] = useState(open);
  const [phase, setPhase] = useState<FoldPhase>('idle');

  if (open !== prevOpen) {
    setPrevOpen(open);
    setPhase(open ? 'opening' : 'closing');
  }

  useEffect(() => {
    if (phase === 'idle') return;
    const id = setTimeout(() => setPhase('idle'), phase === 'opening' ? UNFOLD_MS : FOLD_MS);
    return () => clearTimeout(id);
  }, [phase]);

  return { mounted: open || phase === 'closing', phase };
}
