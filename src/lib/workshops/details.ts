// Écriture des réglages généraux d'un atelier (nom, couverture, emoji,
// programme visible), sans écraser ce qu'un autre gestionnaire a changé.
//
// Deux gestionnaires peuvent avoir la page des paramètres ouverte en même
// temps, chacun avec sa propre copie des réglages. Deux règles empêchent l'un
// d'effacer le travail de l'autre sans le savoir :
//
// 1. **On n'écrit que ce qui change.** Changer l'emoji n'envoie pas le nom :
//    celui que la page avait en mémoire est peut-être déjà périmé.
// 2. **Une annulation ne s'applique que si rien n'a bougé depuis.** Elle porte
//    `expected` — les valeurs qu'elle s'apprête à défaire — et la ligne n'est
//    réécrite que si la base les contient encore. Sinon, rien n'est écrit et
//    l'appelant le dit (`conflict`).
//
// Module pur : il reçoit son client, ce qui permet de le tester sans base.

import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkshopDetailsPatch = {
  name?: string;
  coverGradient?: string;
  coverImageUrl?: string | null;
  coverImageActive?: boolean;
  emoji?: string;
  showProgramme?: boolean;
};

const COLUMNS: Record<keyof WorkshopDetailsPatch, string> = {
  name: 'name',
  coverGradient: 'cover_gradient',
  coverImageUrl: 'cover_image_url',
  coverImageActive: 'cover_image_active',
  emoji: 'emoji',
  showProgramme: 'show_programme',
};

function toRow(patch: WorkshopDetailsPatch): Record<string, string | boolean | null> {
  const row: Record<string, string | boolean | null> = {};
  for (const key of Object.keys(COLUMNS) as (keyof WorkshopDetailsPatch)[]) {
    const value = patch[key];
    if (value !== undefined) row[COLUMNS[key]] = value;
  }
  return row;
}

export async function writeWorkshopDetails(
  client: SupabaseClient,
  workshopId: string,
  details: WorkshopDetailsPatch,
  expected?: WorkshopDetailsPatch,
): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
  const update = toRow(details);
  if (Object.keys(update).length === 0) return { success: true };

  let query = client.from('workshops').update(update).eq('id', workshopId);
  for (const [column, value] of Object.entries(toRow(expected ?? {}))) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const { data, error } = await query.select('id');
  if (error) return { success: false, error: error.message };
  if (expected && (!data || data.length === 0)) return { success: false, conflict: true };
  return { success: true };
}
