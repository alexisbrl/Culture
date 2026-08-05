// Logique métier « briques de connaissance » (liste, création, édition,
// suppression) — même découpage que @/lib/workshops/files : module pur, pas de
// Clerk `auth()`, pas de `revalidatePath`. Les wrappers `'use server'` de
// app/actions/workshopBricks.ts gardent l'authz et la revalidation.
//
// Une brique n'a ni difficulté ni importance (décision 19/07/2026, remplace le
// cahier des charges initial). `chapter_id` reste null tant que la table des
// chapitres n'existe pas. La table `brick_mastery` (niveau Bloom par
// utilisateur × brique) est la fondation de l'Analyse — rien ne l'alimente
// encore.

import { getSupabaseServerClient } from '@/lib/supabase';

export type Brick = {
  id: string;
  title: string;
  content: string | null;
  chapterId: string | null;
  createdAt: string;
};

export const BRICK_TITLE_MAX = 200;
export const BRICK_CONTENT_MAX = 2000;

function validate(title: string, content: string | null): string | null {
  if (!title.trim()) return 'Le titre est requis';
  if (title.length > BRICK_TITLE_MAX) return `Titre trop long (${BRICK_TITLE_MAX} caractères max)`;
  if (content && content.length > BRICK_CONTENT_MAX) return `Contenu trop long (${BRICK_CONTENT_MAX} caractères max)`;
  return null;
}

export async function listBricks(workshopId: string): Promise<Brick[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('workshop_bricks')
    .select('id, title, content, chapter_id, created_at')
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listBricks error:', error);
    return [];
  }

  return (data ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    content: b.content,
    chapterId: b.chapter_id,
    createdAt: b.created_at,
  }));
}

// Vérifie qu'un chapitre appartient bien à cet atelier avant de l'associer —
// sinon on rattacherait une brique au chapitre d'un autre atelier.
async function chapterBelongsToWorkshop(workshopId: string, chapterId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from('workshop_chapters')
    .select('id')
    .eq('id', chapterId)
    .eq('workshop_id', workshopId)
    .maybeSingle();
  return !!data;
}

export async function createBrick(
  workshopId: string,
  userId: string,
  title: string,
  content: string | null,
  chapterId: string | null = null
): Promise<{ success: boolean; brick?: Brick; error?: string }> {
  const invalid = validate(title, content);
  if (invalid) return { success: false, error: invalid };

  if (chapterId && !(await chapterBelongsToWorkshop(workshopId, chapterId))) {
    return { success: false, error: 'Chapitre introuvable' };
  }

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('workshop_bricks')
    .insert({
      workshop_id: workshopId,
      created_by: userId,
      title: title.trim(),
      content: content?.trim() || null,
      chapter_id: chapterId,
    })
    .select('id, title, content, chapter_id, created_at')
    .single();

  if (error || !data) {
    console.error('createBrick error:', error);
    return { success: false, error: 'Erreur lors de la création' };
  }

  return {
    success: true,
    brick: { id: data.id, title: data.title, content: data.content, chapterId: data.chapter_id, createdAt: data.created_at },
  };
}

export async function updateBrick(
  workshopId: string,
  brickId: string,
  title: string,
  content: string | null,
  chapterId: string | null = null
): Promise<{ success: boolean; error?: string }> {
  const invalid = validate(title, content);
  if (invalid) return { success: false, error: invalid };

  if (chapterId && !(await chapterBelongsToWorkshop(workshopId, chapterId))) {
    return { success: false, error: 'Chapitre introuvable' };
  }

  const supabase = getSupabaseServerClient();

  // Le filtre workshop_id garantit qu'on ne peut pas modifier la brique d'un
  // autre atelier avec un brickId volé (l'authz du wrapper porte sur workshopId).
  const { data, error } = await supabase
    .from('workshop_bricks')
    .update({ title: title.trim(), content: content?.trim() || null, chapter_id: chapterId, updated_at: new Date().toISOString() })
    .eq('id', brickId)
    .eq('workshop_id', workshopId)
    .select('id');

  if (error) {
    console.error('updateBrick error:', error);
    return { success: false, error: 'Erreur lors de la modification' };
  }
  if (!data || data.length === 0) return { success: false, error: 'Brique introuvable' };

  return { success: true };
}

export async function deleteBrick(
  workshopId: string,
  brickId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from('workshop_bricks')
    .delete()
    .eq('id', brickId)
    .eq('workshop_id', workshopId);

  if (error) {
    console.error('deleteBrick error:', error);
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  return { success: true };
}
