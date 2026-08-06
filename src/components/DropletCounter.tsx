import { Droplet } from 'lucide-react';

type Props = {
  count: number;
};

/**
 * Compteur de gouttes — dessiné d'après la maquette (ligne 131-134 de
 * App-Culture.dc.html). Monté dans DashboardHeader sur une valeur fixe :
 * l'énergie est une mécanique V2 (docs/product-spec.md), aucune donnée réelle
 * n'existe encore côté serveur. Voir T15,
 * docs/chantiers/2026-08-05-refonte-ui-design-system.md.
 */
export default function DropletCounter({ count }: Props) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-[var(--green-tint)] px-3 py-1.5 text-[13px] font-bold text-[var(--green-strong)]">
      <Droplet size={14} strokeWidth={1.75} />
      {count}
    </div>
  );
}
