// Le libellé d'un lot de questions d'examen écrites par l'IA (27/09/2026).
//
// Remplace le bandeau d'annulation : à la fin d'une génération lancée depuis
// l'examen, toutes les questions qu'elle a écrites reçoivent un libellé neuf,
// « Lot IA n°N ». Le relire se fait par le filtre, le défaire par la
// suppression du libellé avec ses questions — sans délai ni condition, là où le
// bandeau ne tenait que 24 h et tant que rien n'avait bougé.
//
// Le numéro se déduit des libellés existants (le plus grand + 1) : aucun
// compteur à tenir en base. Supprimer le dernier lot libère son numéro, que le
// suivant reprend — sans ambiguïté, puisque l'ancien n'existe plus.

import { getSupabaseServerClient } from '@/lib/supabase';
import { palette } from '@/lib/theme';

export const LOT_LABEL_PREFIX = 'Lot IA n°';

/** Nom du prochain lot, d'après les noms des libellés de l'atelier. */
export function nextLotLabelName(existingNames: readonly string[]): string {
  let max = 0;
  for (const name of existingNames) {
    if (!name.startsWith(LOT_LABEL_PREFIX)) continue;
    const rest = name.slice(LOT_LABEL_PREFIX.length).trim();
    if (!/^\d+$/.test(rest)) continue;
    max = Math.max(max, Number(rest));
  }
  return `${LOT_LABEL_PREFIX}${max + 1}`;
}

/** Pose le libellé du lot sur ses questions d'examen. Rien si le lot n'en a
 *  écrit aucune (génération côté parcours, échec avant la première écriture,
 *  lot annulé). Les libellés déjà posés à la main pendant la génération sont
 *  gardés : le lot s'ajoute, il ne remplace pas. */
export async function labelExamLot(workshopId: string, importId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from('exam_questions')
    .select('id, pools')
    .eq('workshop_id', workshopId)
    .eq('import_id', importId)
    .eq('context', 'exam');
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return;

  const { data: pools, error: poolsError } = await supabase.from('exam_pools').select('name').eq('workshop_id', workshopId);
  if (poolsError) throw new Error(poolsError.message);

  // Même forme d'identifiant que les libellés créés à l'écran.
  const poolId = `pool${Date.now()}`;
  const { error: insertError } = await supabase.from('exam_pools').insert({
    id: poolId,
    workshop_id: workshopId,
    name: nextLotLabelName((pools ?? []).map((p) => p.name as string)),
    // Le beige neutre des libellés neufs (`LABEL_NEUTRAL` côté écran).
    color: palette.surfaceSunken,
  });
  if (insertError) throw new Error(insertError.message);

  const bare = rows.filter((r) => !Array.isArray(r.pools) || r.pools.length === 0).map((r) => r.id as string);
  if (bare.length > 0) {
    const { error: updateError } = await supabase
      .from('exam_questions')
      .update({ pools: [poolId] })
      .eq('workshop_id', workshopId)
      .in('id', bare);
    if (updateError) throw new Error(updateError.message);
  }
  for (const row of rows) {
    const current = Array.isArray(row.pools) ? (row.pools as string[]) : [];
    if (current.length === 0) continue;
    const { error: updateError } = await supabase
      .from('exam_questions')
      .update({ pools: [...current, poolId] })
      .eq('workshop_id', workshopId)
      .eq('id', row.id as string);
    if (updateError) throw new Error(updateError.message);
  }
}
