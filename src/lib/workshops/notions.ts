// Logique métier « notions » (liste, création, édition,
// suppression) — même découpage que @/lib/workshops/files : module pur, pas de
// Clerk `auth()`, pas de `revalidatePath`. Les wrappers `'use server'` de
// app/actions/workshopNotions.ts gardent l'authz et la revalidation.
//
// Une notion n'a ni difficulté ni importance (décision 19/07/2026, remplace le
// cahier des charges initial). `chapter_id` reste null tant que la table des
// chapitres n'existe pas. La table `brick_mastery` (niveau Bloom par
// utilisateur × notion) est la fondation de l'Analyse — rien ne l'alimente
// encore. Lexique : notion (produit, code) = brick (base), voir CLAUDE.md §1.

import { getSupabaseServerClient } from '@/lib/supabase';

// Une notion n'a qu'UN texte (19/08/2026). Le titre et la description séparés
// disaient deux fois la même chose : la liste n'affichait que le titre, et la
// description ne se lisait qu'en rouvrant le formulaire. Le champ unique est
// `title` — c'est lui que lisent les autres écrans (liaison aux questions
// d'examen, parcours). La colonne `content` de la base n'est plus ni lue ni
// écrite ; son contenu est recollé au titre par
// `docs/migrations/2026-08-19-notion-texte-unique.sql`, et la colonne elle-même
// tombe une fois ce code déployé (voir EN-ATTENTE-DEPLOIEMENT.md).
export type Notion = {
  id: string;
  title: string;
  chapterId: string | null;
  createdAt: string;
};

/** Assez pour une notion en une ou deux phrases, pas assez pour un paragraphe :
 *  la même valeur sert de libellé partout ailleurs dans l'app. */
export const NOTION_TITLE_MAX = 280;

/** Combien de notions un atelier peut porter, au total (25/08/2026).
 *
 *  **Une limite physique, pas une règle pédagogique.** La cible produit est de
 *  500 à 1 000 notions (§9 du plan d'ingestion) : 2 000 laisse largement passer
 *  un programme annuel dense et n'arrête que ce qui n'a plus de sens — une
 *  boucle qui s'emballe, un import relancé en série, un corpus déposé par
 *  erreur. Elle compte parce que c'est le nombre de notions qui commande TOUT
 *  le volume en aval : douze questions de parcours par notion, donc douze fois
 *  la facture.
 *
 *  Elle s'applique à la création manuelle comme à l'IA. Une limite qui ne
 *  vaudrait que pour l'une des deux n'en serait pas une. */
export const MAX_NOTIONS_PER_WORKSHOP = 2000;

/** Combien de notions cet atelier porte déjà. On lit avant d'écrire, jamais
 *  après.
 *
 *  Compte inconnu → on rend 0, donc on laisse passer. Un plafond qui bloquerait
 *  sur une lecture ratée transformerait un incident de lecture en panne
 *  d'écriture, ce qui est bien pire que le dépassement qu'il évite. */
export async function countNotions(workshopId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { count, error } = await supabase
    .from('workshop_bricks')
    .select('id', { count: 'exact', head: true })
    .eq('workshop_id', workshopId);
  if (error) return 0;
  return count ?? 0;
}

function validate(title: string): string | null {
  if (!title.trim()) return 'Le texte de la notion est requis';
  if (title.length > NOTION_TITLE_MAX) return `Texte trop long (${NOTION_TITLE_MAX} caractères max)`;
  return null;
}

export async function listNotions(workshopId: string): Promise<Notion[]> {
  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .select('id, title, chapter_id, created_at')
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listNotions error:', error);
    return [];
  }

  return (data ?? []).map((b) => ({
    id: b.id,
    title: b.title,
    chapterId: b.chapter_id,
    createdAt: b.created_at,
  }));
}

// Vérifie qu'un chapitre appartient bien à cet atelier avant de l'associer —
// sinon on rattacherait une notion au chapitre d'un autre atelier.
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

export async function createNotion(
  workshopId: string,
  userId: string,
  title: string,
  chapterId: string | null = null
): Promise<{ success: boolean; notion?: Notion; error?: string }> {
  const invalid = validate(title);
  if (invalid) return { success: false, error: invalid };

  if (chapterId && !(await chapterBelongsToWorkshop(workshopId, chapterId))) {
    return { success: false, error: 'Chapitre introuvable' };
  }

  if ((await countNotions(workshopId)) >= MAX_NOTIONS_PER_WORKSHOP) {
    return { success: false, error: `Cet atelier a atteint sa limite de ${MAX_NOTIONS_PER_WORKSHOP} notions.` };
  }

  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .insert({
      workshop_id: workshopId,
      created_by: userId,
      title: title.trim(),
      chapter_id: chapterId,
    })
    .select('id, title, chapter_id, created_at')
    .single();

  if (error || !data) {
    console.error('createNotion error:', error);
    return { success: false, error: 'Erreur lors de la création' };
  }

  return {
    success: true,
    notion: { id: data.id, title: data.title, chapterId: data.chapter_id, createdAt: data.created_at },
  };
}

export async function updateNotion(
  workshopId: string,
  notionId: string,
  title: string,
  chapterId: string | null = null
): Promise<{ success: boolean; error?: string }> {
  const invalid = validate(title);
  if (invalid) return { success: false, error: invalid };

  if (chapterId && !(await chapterBelongsToWorkshop(workshopId, chapterId))) {
    return { success: false, error: 'Chapitre introuvable' };
  }

  const supabase = getSupabaseServerClient();

  // Le filtre workshop_id garantit qu'on ne peut pas modifier la notion d'un
  // autre atelier avec un notionId volé (l'authz du wrapper porte sur workshopId).
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .update({ title: title.trim(), chapter_id: chapterId, updated_at: new Date().toISOString() })
    .eq('id', notionId)
    .eq('workshop_id', workshopId)
    .select('id');

  if (error) {
    console.error('updateNotion error:', error);
    return { success: false, error: 'Erreur lors de la modification' };
  }
  if (!data || data.length === 0) return { success: false, error: 'Notion introuvable' };

  return { success: true };
}

/** Range une notion dans un chapitre (ou l'en sort, avec `null`) sans toucher à
 *  son texte — c'est ce que fait le glisser-déposer d'une notion sur un chapitre.
 *  Passer par `updateNotion` obligerait l'appelant à renvoyer le texte, donc à
 *  l'écraser avec ce qu'il croit être à jour. */
export async function setNotionChapter(
  workshopId: string,
  notionId: string,
  chapterId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (chapterId && !(await chapterBelongsToWorkshop(workshopId, chapterId))) {
    return { success: false, error: 'Chapitre introuvable' };
  }

  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .update({ chapter_id: chapterId, updated_at: new Date().toISOString() })
    .eq('id', notionId)
    .eq('workshop_id', workshopId)
    .select('id');

  if (error) {
    console.error('setNotionChapter error:', error);
    return { success: false, error: 'Erreur lors du déplacement' };
  }
  if (!data || data.length === 0) return { success: false, error: 'Notion introuvable' };

  return { success: true };
}

export async function deleteNotion(
  workshopId: string,
  notionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { error } = await supabase
    .from('workshop_bricks')
    .delete()
    .eq('id', notionId)
    .eq('workshop_id', workshopId);

  if (error) {
    console.error('deleteNotion error:', error);
    return { success: false, error: 'Erreur lors de la suppression' };
  }

  return { success: true };
}
