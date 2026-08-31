// « Quel est le rôle de cet utilisateur dans cet atelier ? » — la question la
// plus posée du projet. Chaque server action la repose en tête (voir
// @/lib/authz), donc une page qui en enchaîne plusieurs la reposait autant de
// fois : la page des paramètres l'a longtemps posée CINQ fois, en file, avant
// d'afficher le moindre pixel.
//
// `cache` de React la mémorise pour la durée d'UNE requête serveur, et rien de
// plus : deux requêtes ne partagent jamais ce cache, un changement de rôle est
// donc visible dès le rendu suivant. Module pur (pas de Clerk, pas de
// revalidation) : l'identité arrive déjà résolue, comme partout dans lib/.

import { cache } from 'react';
import { getSupabaseServerClient } from '@/lib/supabase';
import type { WorkshopRole } from '@/lib/authz';

export const getWorkshopRole = cache(
  async (workshopId: string, userId: string): Promise<WorkshopRole | null> => {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('workshop_members')
      .select('role')
      .eq('workshop_id', workshopId)
      .eq('user_id', userId)
      .maybeSingle();

    return (data?.role as WorkshopRole | undefined) ?? null;
  },
);
