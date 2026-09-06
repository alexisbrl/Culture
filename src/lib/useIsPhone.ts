'use client';

import { useEffect, useState } from 'react';

/** Le seuil « téléphone » du site, en un seul endroit.
 *
 *  768px, et ce n'est pas un choix neuf : c'est déjà la bascule de toute
 *  l'application — le `md:` de Tailwind, et la coquille à deux colonnes de
 *  l'onglet examen (`.split-shell`, globals.css), qui empile ses colonnes en
 *  dessous. Une seconde valeur inventée ici ferait diverger la mise en page CSS
 *  et le comportement JavaScript, avec une bande de largeurs où l'un dit
 *  « téléphone » et l'autre non. */
export const PHONE_MAX_WIDTH = 767;

/** Vrai quand l'écran est un téléphone, au sens ci-dessus.
 *
 *  ⚠️ **Faux au premier rendu, toujours** — y compris sur un téléphone. Le
 *  serveur ne connaît pas la taille de l'écran : répondre autre chose que la
 *  version large produirait un HTML différent de celui que le client
 *  reconstruit, donc une erreur d'hydratation. La vraie valeur arrive à l'effet,
 *  juste après le premier rendu.
 *
 *  Conséquence à connaître : **ce hook ne sert qu'à changer un COMPORTEMENT**
 *  (quelle colonne est montée, où s'ouvre un formulaire). Ce qui relève de la
 *  mise en page — masquer, empiler, redimensionner — se fait en CSS, où le
 *  bon rendu est là dès la première image et ne clignote pas. */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    const sync = () => setIsPhone(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return isPhone;
}
