'use client';

// Amène un formulaire qu'on vient d'ouvrir ENTIÈREMENT à l'écran.
//
// Né dans la liste des questions d'examen (06/09/2026), partagé depuis le
// 05/10/2026 avec les paramètres d'atelier (modifier une notion, renommer un
// chapitre) : ouvrir un formulaire en bas d'une liste le laissait à moitié
// coupé, et le clic semblait ne rien faire.
//
// ⚠️ **Pas de `scrollIntoView`, et ce n'est pas un caprice** : une colonne mise à
// l'échelle (`--exam-list-zoom`) ne défilait tout simplement pas quand le
// navigateur s'en chargeait. On vise donc le panneau défilant nous-mêmes.
//
// Les deux repères ne sont pas dans la même unité : un rectangle est dans le
// repère de la FENÊTRE (donc mis à l'échelle), `scrollTop` en unités LOCALES.
// D'où la calibration sur le panneau lui-même (hauteur mesurée / hauteur
// locale) avant de convertir l'écart.
//
// ⚠️ **La barre de navigation est COLLANTE : elle recouvre le haut de ce qui
// défile sous elle.** On vise donc le premier pixel réellement VISIBLE : sous la
// barre quand elle est là, le haut du panneau sinon. La barre se mesure
// (`data-app-header`) — absente en mobile, elle mesure alors zéro.
//
// ─── Du MINIMUM ───────────────────────────────────────────────────────────────
//
// On défile juste de ce qu'il faut pour voir le formulaire en entier. Déjà
// entièrement visible, rien ne bouge. Plus haut que la zone d'affichage, on
// aligne son HAUT : c'est le début qu'on vient ouvrir.
//
// ⚠️ **Le défilement animé n'aboutit pas toujours, et il échoue en silence.** On
// anime, puis on REPASSE poser la position — RECALCULÉE, car le formulaire
// grandit souvent après son montage. **Un geste de l'utilisateur annule cette
// seconde passe** : elle rattrape un défilement qui n'a pas pris, elle ne
// reprend jamais la main à qui fait défiler la liste juste après avoir ouvert.

import { useEffect, type RefObject } from 'react';

/** Une marge de respiration : collé au bord, le formulaire paraît coupé. */
const GAP = 12;

function settle(el: HTMLElement, last: boolean) {
  const header = document.querySelector('[data-app-header]');
  const covered = header ? header.getBoundingClientRect().bottom : 0;

  let panel: HTMLElement | null = el.parentElement;
  while (panel) {
    const oy = getComputedStyle(panel).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && panel.scrollHeight > panel.clientHeight) break;
    panel = panel.parentElement;
  }

  // Le cadre réellement visible, dans le repère de la FENÊTRE : le panneau
  // défilant quand il y en a un, la fenêtre elle-même sinon.
  const panelRect = panel ? panel.getBoundingClientRect() : null;
  const frameTop = Math.max(panelRect ? panelRect.top : 0, covered) + GAP;
  const frameBottom = (panelRect ? panelRect.bottom : window.innerHeight) - GAP;

  const rect = el.getBoundingClientRect();
  // Déplacement à faire, en pixels de FENÊTRE. Positif = descendre.
  let shift = 0;
  if (rect.height > frameBottom - frameTop || rect.top < frameTop) shift = rect.top - frameTop;
  else if (rect.bottom > frameBottom) shift = rect.bottom - frameBottom;
  if (Math.abs(shift) < 1) return;

  if (!panel) {
    // La PAGE défile : coordonnées de la fenêtre, rien à convertir.
    const top = Math.max(0, window.scrollY + shift);
    window.scrollTo(last ? { top } : { top, behavior: 'smooth' });
    return;
  }
  const scale = panel.clientHeight > 0 && panelRect ? panelRect.height / panel.clientHeight : 1;
  const top = Math.max(0, panel.scrollTop + shift / (scale || 1));
  if (last) panel.scrollTop = top;
  else panel.scrollTo({ top, behavior: 'smooth' });
}

/** À chaque fois que `openKey` prend une valeur non nulle (le formulaire
 *  s'ouvre, ou passe à un autre élément), amène `ref` entièrement à l'écran. */
export function useRevealWhenOpened(ref: RefObject<HTMLElement | null>, openKey: string | null) {
  useEffect(() => {
    if (openKey === null) return;
    let retry = 0;

    let userMoved = false;
    const noteUserScroll = () => { userMoved = true; };
    window.addEventListener('wheel', noteUserScroll, { passive: true });
    window.addEventListener('touchmove', noteUserScroll, { passive: true });
    window.addEventListener('keydown', noteUserScroll);

    // Un `rAF` laisse la mise en page se poser — le formulaire vient de
    // remplacer une ligne, les hauteurs bougent.
    const raf = requestAnimationFrame(() => {
      if (ref.current) settle(ref.current, false);
      if (!userMoved) retry = window.setTimeout(() => { if (!userMoved && ref.current) settle(ref.current, true); }, 700);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(retry);
      window.removeEventListener('wheel', noteUserScroll);
      window.removeEventListener('touchmove', noteUserScroll);
      window.removeEventListener('keydown', noteUserScroll);
    };
  }, [openKey, ref]);
}
