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
 *  **`content` vide (`undefined`/`''`) ⇒ aucune infobulle**, mais l'arbre React ne
 *  change pas pour autant : le déclencheur est simplement désactivé et la bulle
 *  n'est pas rendue. C'est ce qui permet les infobulles conditionnelles
 *  (`LabelPill` n'affiche le nom complet que s'il est coupé) sans que l'appelant
 *  ait à écrire deux branches de JSX.
 *
 *  **L'arbre stable n'est pas un détail d'implémentation.** La première version
 *  renvoyait l'enfant nu quand `content` était vide : l'élément changeait alors
 *  de place dans l'arbre en gagnant son infobulle, React le démontait et le
 *  remontait, et tout ce qui était accroché à l'ancien nœud tombait — dont la
 *  mesure de débordement de `LabelPill`, qui décide justement du contenu de
 *  l'infobulle. Les noms de pastille coupés n'en avaient donc plus (18/08/2026).
 *  Toute condition portée par `content` doit rester sans effet sur le DOM rendu.
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
  // Sous l'élément par défaut : au-dessus, la bulle couvre ce qu'on vient de
  // survoler et la ligne qui le précède — souvent le libellé qui l'explique.
  // Base UI la retourne d'elle-même si le bas de la fenêtre manque de place.
  side = 'bottom',
  sideOffset = 6,
  delay = 750,
  className,
}: {
  /** Vide ⇒ pas d'infobulle du tout (voir plus haut). */
  content?: React.ReactNode;
  /** Le déclencheur. Un unique élément, qui reçoit les props de Base UI. */
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  /** Délai d'ouverture au survol, en ms. Long à dessein : une infobulle qui
   *  s'ouvre au premier frôlement agresse plus qu'elle n'aide, et la plupart
   *  des survols ne sont que des passages. */
  delay?: number;
  /** Pour ajuster la bulle elle-même (largeur, alignement du texte). */
  className?: string;
}) {
  const hasContent = content !== undefined && content !== null && content !== '';

  return (
    // `disabled` plutôt qu'un retour anticipé : le déclencheur reste le même
    // nœud, sans écouteur ni `aria-describedby` (voir plus haut).
    <BaseTooltip.Root disabled={!hasContent}>
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
            // L'ombre en `style` et non en classe : `shadow-[var(--shadow-lg)]`
            // passe par la composition d'ombres de Tailwind v4, qui perd la
            // couleur du token et rend une ombre transparente. Or c'est elle
            // qui détache la bulle, crème sur crème.
            style={{ boxShadow: 'var(--shadow-lg)' }}
            className={cn(
              // Une surface de plus, pas un contraste : la bulle est du même
              // crème que les panneaux et les cartes, posée sur un filet et une
              // ombre. L'aplat d'encre des premiers essais (18/08/2026) tranchait
              // trop avec la page — le regard allait à la bulle avant d'aller à
              // ce qu'elle explique.
              // `w-fit` pour qu'une bulle courte fasse la largeur de son texte,
              // et **surtout pas `text-balance`** : il raccourcit les lignes
              // sans rétrécir la boîte, qui reste à sa largeur maximale — d'où
              // une bande blanche à droite de toute bulle qui revient à la
              // ligne. Sans lui, les lignes remplissent la largeur et le bord
              // droit se tient.
              'w-fit max-w-[260px] rounded-[var(--radius-sm)] bg-[var(--surface-raised)] px-2.5 py-1.5',
              'border border-[var(--line)]',
              'font-sans text-[12px] leading-[1.35] font-medium break-words text-[var(--ink-body)]',
              // L'apparition est franche mais pas sèche : la bulle descend de
              // 2px en se révélant, et s'efface sans bouger.
              'transition-[opacity,translate] duration-[var(--dur-fast)] ease-[var(--ease-soft)]',
              'data-[starting-style]:-translate-y-[2px] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
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

// `Tooltip.Provider` de Base UI a été monté ici puis retiré (18/08/2026) : il
// partage le délai entre bulles voisines, si bien qu'une fois la première
// ouverte, toutes les suivantes s'ouvraient INSTANTANÉMENT. Balayer une rangée
// de boutons faisait alors clignoter une bulle par bouton. Chaque infobulle
// attend désormais son propre délai, sans exception.

export { Tooltip };
