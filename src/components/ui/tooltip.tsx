'use client';

import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';

/** Infobulle de l'app — **le seul moyen d'en afficher une**.
 *
 *  L'attribut `title` du HTML est interdit dans le JSX (règle `no-restricted-syntax`
 *  d'`eslint.config.mjs`) : il est dessiné par le système d'exploitation, hors du
 *  DOM, donc aucun CSS ne l'atteint — police, couleurs, rayon, délai, position, on
 *  ne maîtrise rien. D'un poste à l'autre, la même infobulle n'a pas la même tête.
 *
 *  Usage : on enveloppe l'élément déclencheur, on ne lui passe pas de prop.
 *
 *      <Tooltip content={t('bank.editLabelTitle')}>
 *        <button …><Pencil /></button>
 *      </Tooltip>
 *
 *  **`content` vide (`undefined`/`''`) ⇒ aucune infobulle et aucun composant monté** :
 *  l'enfant est rendu tel quel. C'est ce qui permet les infobulles conditionnelles
 *  (`LabelPill` n'affiche le nom complet que s'il est coupé) sans que l'appelant
 *  ait à écrire deux branches de JSX.
 *
 *  **Une infobulle n'est pas un nom accessible.** Elle décrit, elle ne nomme pas :
 *  Base UI la relie au déclencheur par `aria-describedby`. Un bouton sans texte
 *  visible (bouton-icône) doit donc porter en plus son propre `aria-label` — sinon
 *  il n'a plus de nom du tout pour un lecteur d'écran, ce que l'attribut `title`
 *  assurait au passage.
 *
 *  **Desktop seulement, et c'est voulu.** Base UI n'ouvre l'infobulle qu'au
 *  survol souris (`mouseOnly`) : un appui tactile ne la déclenche jamais, aucun
 *  réglage à faire. Ne jamais y mettre une information nécessaire pour agir,
 *  seulement un appoint — sur mobile, elle n'existe pas. */
function Tooltip({
  content,
  children,
  side = 'top',
  sideOffset = 6,
  delay = 350,
  className,
}: {
  /** Vide ⇒ pas d'infobulle du tout (voir plus haut). */
  content?: React.ReactNode;
  /** Le déclencheur. Un unique élément, qui reçoit les props de Base UI. */
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  /** Délai d'ouverture au survol, en ms. */
  delay?: number;
  /** Pour ajuster la bulle elle-même (largeur, alignement du texte). */
  className?: string;
}) {
  if (content === undefined || content === null || content === '') return children;

  return (
    <BaseTooltip.Root>
      {/* `render` : le déclencheur EST l'enfant, aucun nœud ne s'intercale — une
          mise en page en flex/grid n'est donc jamais perturbée par l'ajout d'une
          infobulle. Base UI n'y pose que ses écouteurs, `id` et
          `aria-describedby` : ni `role`, ni `tabIndex`, ni style. Un élément
          décoratif (pictogramme, pastille non cliquable) le reste. */}
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        {/* `z-[90]` : au-dessus de tout ce qui peut la déclencher — panneaux
            flottants (60), modales (80). Une infobulle cachée derrière la
            surface qui la déclenche ne sert à rien. Le portail sur `body` est
            indispensable dans la feuille A4 de l'onglet examen, mise à l'échelle
            en `zoom` : sans lui, la bulle grossirait avec la feuille. */}
        <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className="z-[90]">
          <BaseTooltip.Popup
            className={cn(
              'max-w-[260px] rounded-[var(--radius-sm)] bg-[var(--surface-ink)] px-2.5 py-1.5',
              'font-sans text-[12px] leading-[1.35] font-medium text-balance break-words text-[var(--on-ink)]',
              'shadow-[var(--shadow-lg)]',
              // L'apparition est franche mais pas sèche : la bulle monte de 2px
              // en se révélant, et s'efface sans bouger.
              'transition-[opacity,translate] duration-[var(--dur-fast)] ease-[var(--ease-soft)]',
              'data-[starting-style]:translate-y-[2px] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
              className,
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

/** Délai partagé par toutes les infobulles, monté une fois dans le layout.
 *  Sans lui, chaque bulle attend son propre délai : en balayant une rangée de
 *  boutons, on paie l'attente à chaque bouton. Avec, la première attend, les
 *  suivantes s'ouvrent aussitôt — et le groupe se referme après un court répit. */
function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <BaseTooltip.Provider closeDelay={100}>{children}</BaseTooltip.Provider>;
}

export { Tooltip, TooltipProvider };
