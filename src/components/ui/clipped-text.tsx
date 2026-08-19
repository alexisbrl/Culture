'use client';

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { Tooltip } from '@/components/ui/tooltip';

/** Vrai quand le contenu de l'élément déborde réellement de sa boîte — donc
 *  quand un `text-overflow: ellipsis` ou un `line-clamp` est en train de couper
 *  le texte. Les deux axes sont regardés : la coupe est horizontale sur une
 *  ligne unique, verticale dès qu'on autorise plusieurs lignes.
 *
 *  La coupe se décide à la largeur disponible : elle ne se déduit **pas** du
 *  texte (un plafond en nombre de caractères coupe ce qui tenait et laisse
 *  passer ce qui déborde). On la mesure, et on la remesure quand l'élément
 *  change de largeur (`ResizeObserver`) — un simple rendu ne suffirait pas.
 *
 *  - Effet **sans tableau de dépendances** : la place disponible ou le texte ont
 *    pu changer sans que ce composant sache lequel.
 *  - Comparaison explicite avant `setState`, sinon la mesure boucle.
 *  - Tolérance d'un pixel : elle écarte les faux positifs d'arrondi sous-pixel.
 *
 *  Ce que l'appelant en fait, c'est l'infobulle de secours — jamais un
 *  changement de place dans l'arbre React : `Tooltip` rend le même DOM que son
 *  `content` soit vide ou non, et c'est ce qui garde la mesure vivante (voir
 *  `ui/tooltip.tsx`, et `.claude/rules/frontend-patterns.md`). */
export function useIsClipped(ref: RefObject<HTMLElement | null>) {
  const [clipped, setClipped] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    setClipped(prev => prev === next ? prev : next);
  }, [ref]);
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(measure);   // `observe()` mesure déjà une fois
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, measure]);
  return clipped;
}

/** Ligne de texte bornée à la place disponible, avec l'infobulle de secours
 *  quand — et seulement quand — elle est réellement coupée.
 *
 *  À utiliser pour toute donnée saisie par l'utilisateur affichée dans une
 *  colonne (nom de chapitre, titre de notion…) : sans elle, il ne reste que deux
 *  mauvaises options, une infobulle sur tout y compris ce qui se lit déjà en
 *  entier, ou aucune sur ce qui est coupé.
 *
 *  `lines` borne le texte à plusieurs lignes plutôt qu'à une seule : il revient
 *  alors à la ligne et c'est la dernière qui porte les points de suspension
 *  (`line-clamp`). Utile quand la ligne a de la hauteur à donner mais pas de
 *  largeur — sinon un titre un peu long est coupé alors que la place existe
 *  juste en dessous.
 *
 *  ⚠️ L'élément doit pouvoir se réduire : dans un flex, l'ancêtre porteur du
 *  `flex: 1` a besoin de `minWidth: 0` ; dans une grille, la colonne aussi
 *  (`min-width: auto` par défaut, elle s'élargirait au texte au lieu de le
 *  laisser se couper). */
export function ClippedText({ text, lines = 1, style, className }: { text: string; lines?: number; style?: CSSProperties; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const clipped = useIsClipped(ref);
  // Au-delà d'une ligne, `line-clamp` remplace `text-overflow` : c'est le seul
  // mécanisme qui coupe APRÈS un retour à la ligne, points de suspension
  // compris. `display: -webkit-box` et son `box-orient` en font partie — ils
  // sont préfixés mais standards de fait, tous les navigateurs les rendent.
  const bounds: CSSProperties = lines > 1
    ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }
    : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  return (
    <Tooltip content={clipped ? text : undefined}>
      <div ref={ref} className={className} style={{ ...bounds, ...style }}>
        {text}
      </div>
    </Tooltip>
  );
}
