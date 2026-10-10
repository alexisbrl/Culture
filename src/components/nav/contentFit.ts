// Le menu épinglé pousse-t-il la page, ou se pose-t-il par-dessus ?
//
// Décidé page par page, sans liste à tenir : on regarde si le menu OUVERT
// recouvrirait quelque chose de visible. Une page centrée avec de la marge
// (parcours, paramètres, profil, tarifs) garde sa largeur et le menu se pose à
// côté de son contenu ; une page qui occupe toute la largeur (examens) se
// resserre pour rester entièrement visible.
//
// La mesure se fait TOUJOURS dans la géométrie « par-dessus » (emplacement du
// menu à sa largeur repliée) : c'est elle qu'on veut juger, et c'est ce qui
// rend le verdict stable — passer de l'un à l'autre ne change pas la réponse.

import { NAV_W_CLOSED, NAV_W_OPEN } from './navWidths';

/** Air minimal à laisser entre le menu ouvert et le premier contenu. */
const BREATHING = 100;

/** Largeur que le menu ouvert prend en plus de sa largeur repliée, air compris. */
const NEEDED = NAV_W_OPEN - NAV_W_CLOSED + BREATHING;

/** Un bloc qui couvre (presque) toute la largeur est un fond de page, pas du
 *  contenu : il passe sous le menu sans rien cacher d'utile. */
const BACKDROP_RATIO = 0.9;

const REPLACED = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function isTransparent(color: string): boolean {
  return color === 'transparent' || /rgba?\([^)]*,\s*0\s*\)$/.test(color);
}

function paintsSomething(cs: CSSStyleDeclaration): boolean {
  if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
  if (!isTransparent(cs.backgroundColor) || cs.backgroundImage !== 'none') return true;
  if (cs.boxShadow !== 'none') return true;
  return ['Left', 'Top', 'Right', 'Bottom'].some(
    (side) =>
      parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
      cs.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' &&
      !isTransparent(cs.getPropertyValue(`border-${side.toLowerCase()}-color`)),
  );
}

/** Abscisse (fenêtre) du contenu visible le plus à gauche de `root`, dans la
 *  bande que le menu ouvert pourrait couvrir. Infinity si la bande est vide.
 *  On ne descend que dans ce qui touche la bande : le coût ne dépend pas de la
 *  longueur de la page. */
function leftmostContent(root: HTMLElement, rootLeft: number, zoneRight: number, backdropW: number): number {
  let min = Infinity;
  const range = document.createRange();

  const visit = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      // `display: contents` n'a pas de boîte mais ses enfants s'affichent.
      if (getComputedStyle(el).display !== 'contents') return;
    } else {
      if (r.right <= rootLeft || r.left >= zoneRight) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.display === 'none') return;
      if (r.width < backdropW) {
        if (REPLACED.has(el.tagName.toUpperCase())) {
          min = Math.min(min, r.left);
          return;
        }
        if (paintsSomething(cs)) min = Math.min(min, r.left);
      }
    }
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!child.textContent?.trim()) continue;
        range.selectNodeContents(child);
        for (const tr of range.getClientRects()) {
          if (tr.width > 0 && tr.right > rootLeft) min = Math.min(min, tr.left);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        visit(child as Element);
      }
    }
  };

  for (const child of root.children) visit(child);
  return min;
}

/**
 * Vrai si le menu épinglé doit pousser la page (il en couvrirait du contenu).
 *
 * `slot` est l'emplacement du menu dans la mise en page. S'il n'est pas à sa
 * largeur repliée, on l'y ramène le temps de la mesure — sans transition, et
 * en le rétablissant avant toute peinture : rien ne se voit.
 */
export function pinnedNavNeedsRoom(slot: HTMLElement, main: HTMLElement): boolean {
  const atClosed = Math.round(slot.getBoundingClientRect().width) === NAV_W_CLOSED;
  const prevWidth = slot.style.width;
  const prevTransition = slot.style.transition;
  if (!atClosed) {
    slot.style.transition = 'none';
    slot.style.width = `${NAV_W_CLOSED}px`;
  }
  const m = main.getBoundingClientRect();
  const left = leftmostContent(main, m.left, m.left + NEEDED, m.width * BACKDROP_RATIO);
  if (!atClosed) {
    slot.style.width = prevWidth;
    void slot.offsetWidth; // fige la largeur rétablie avant de rendre la transition
    slot.style.transition = prevTransition;
  }
  return left - m.left < NEEDED;
}
