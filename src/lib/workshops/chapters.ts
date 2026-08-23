// Logique métier « chapitres » (liste, création, renommage, suppression,
// réorganisation) — module pur, même découpage que @/lib/workshops/notions :
// pas de Clerk `auth()`, pas de `revalidatePath`. Les wrappers `'use server'`
// de app/actions/workshopChapters.ts gardent l'authz et la revalidation.
//
// L'ordre des chapitres (`position`) pilote directement l'ordre des pots dans
// l'onglet Programme. Supprimer un chapitre ne supprime pas ses notions : la FK
// est en `on delete set null`, elles retombent dans « sans chapitre ».

import { getSupabaseServerClient } from '@/lib/supabase';

export type Chapter = {
  id: string;
  name: string;
  position: number;
  notionCount: number;
  /** Chapitre mis à l'écart : lui et ses notions sortent du programme, mais
   *  restent consultables sous les chapitres visibles.
   *
   *  ⚠️ **Seule l'ingestion IA le pose**, quand un import vide un chapitre —
   *  l'interface n'offre pas de bouton « cacher » (décision de sobriété du
   *  23/08/2026, pas une restriction de droits). Elle offre en revanche
   *  « restaurer », qui est l'unique geste humain sur cet état. */
  hidden: boolean;
};

export const CHAPTER_NAME_MAX = 120;

function validateName(name: string): string | null {
  if (!name.trim()) return 'Le nom du chapitre est requis';
  if (name.length > CHAPTER_NAME_MAX) return `Nom trop long (${CHAPTER_NAME_MAX} caractères max)`;
  return null;
}

export async function listChapters(workshopId: string): Promise<Chapter[]> {
  const supabase = getSupabaseServerClient();

  // Chapitres + notions : deux requêtes indépendantes → parallèle (règle N+1).
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const [{ data: chapters, error }, { data: notions }] = await Promise.all([
    supabase
      .from('workshop_chapters')
      .select('id, name, position, hidden')
      .eq('workshop_id', workshopId)
      .order('position', { ascending: true }),
    supabase.from('workshop_bricks').select('chapter_id').eq('workshop_id', workshopId),
  ]);

  if (error) {
    console.error('listChapters error:', error);
    return [];
  }

  const countMap: Record<string, number> = {};
  for (const b of notions ?? []) {
    if (b.chapter_id) countMap[b.chapter_id] = (countMap[b.chapter_id] ?? 0) + 1;
  }

  return (chapters ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    notionCount: countMap[c.id] ?? 0,
    hidden: c.hidden === true,
  }));
}

/** Remet un chapitre caché dans le programme — le bouton « restaurer ».
 *
 *  Le seul geste humain sur cet état, et il est unidirectionnel : rien dans
 *  l'interface ne permet de cacher à la main. Un import ultérieur peut en
 *  revanche l'écarter de nouveau s'il n'est plus couvert par les documents. */
export async function restoreChapter(
  workshopId: string,
  chapterId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('workshop_chapters')
    .update({ hidden: false, updated_at: new Date().toISOString() })
    .eq('workshop_id', workshopId)
    .eq('id', chapterId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function createChapter(
  workshopId: string,
  userId: string,
  name: string
): Promise<{ success: boolean; chapter?: Chapter; error?: string }> {
  const invalid = validateName(name);
  if (invalid) return { success: false, error: invalid };

  const supabase = getSupabaseServerClient();

  // Nouveau chapitre en dernière position.
  const { data: last } = await supabase
    .from('workshop_chapters')
    .select('position')
    .eq('workshop_id', workshopId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (last?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('workshop_chapters')
    .insert({ workshop_id: workshopId, created_by: userId, name: name.trim(), position: nextPosition })
    .select('id, name, position')
    .single();

  if (error || !data) {
    console.error('createChapter error:', error);
    return { success: false, error: 'Erreur lors de la création' };
  }

  // Un chapitre créé à la main naît visible : `hidden` n'est posé que par un
  // import qui vide un chapitre existant.
  return {
    success: true,
    chapter: { id: data.id, name: data.name, position: data.position, notionCount: 0, hidden: false },
  };
}

export async function renameChapter(
  workshopId: string,
  chapterId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  const invalid = validateName(name);
  if (invalid) return { success: false, error: invalid };

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('workshop_chapters')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', chapterId)
    .eq('workshop_id', workshopId)
    .select('id');

  if (error) {
    console.error('renameChapter error:', error);
    return { success: false, error: 'Erreur lors du renommage' };
  }
  if (!data || data.length === 0) return { success: false, error: 'Chapitre introuvable' };

  return { success: true };
}

export async function deleteChapter(
  workshopId: string,
  chapterId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  // Les notions du chapitre ne sont pas supprimées : la FK est en
  // `on delete set null`, elles repassent dans « sans chapitre ».
  const { error } = await supabase
    .from('workshop_chapters')
    .delete()
    .eq('id', chapterId)
    .eq('workshop_id', workshopId);

  if (error) {
    console.error('deleteChapter error:', error);
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  return { success: true };
}

// Réordonne l'ensemble des chapitres de l'atelier. On reçoit la liste complète
// des identifiants dans le nouvel ordre plutôt qu'un déplacement unitaire :
// l'appelant (flèches monter/descendre) connaît déjà l'ordre final, et écrire
// toutes les positions évite de laisser des trous ou des doublons.
export async function reorderChapters(
  workshopId: string,
  orderedIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from('workshop_chapters')
    .select('id')
    .eq('workshop_id', workshopId);

  const known = new Set((existing ?? []).map((c) => c.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    return { success: false, error: 'Ordre invalide' };
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('workshop_chapters')
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('workshop_id', workshopId)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed) {
    console.error('reorderChapters error:', failed.error);
    return { success: false, error: 'Erreur lors de la réorganisation' };
  }

  return { success: true };
}
