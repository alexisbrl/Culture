'use server';

import { requireManager } from '@/lib/authz';
import * as notionsLib from '@/lib/workshops/notions';
import * as trashLib from '@/lib/workshops/trash';
import { getSupabaseServerClient } from '@/lib/supabase';
import { revalidateWorkshop } from '@/lib/revalidate';

// Logique métier : voir @/lib/workshops/notions. Les wrappers `'use server'` ici
// ne portent que l'authz Clerk et la revalidation Next.js. Type redéclaré
// localement (un fichier `'use server'` ne peut pas réexporter un type importé
// — piège Turbopack, cf. .claude/rules/server-architecture.md).
// Une notion n'a qu'UN texte, porté par `title` (voir @/lib/workshops/notions).
export type Notion = {
  id: string;
  title: string;
  chapterId: string | null;
  createdAt: string;
};

// Ce que rend une restauration (voir @/lib/workshops/trash), redéclaré pour la
// même raison que `Notion`.
export type Restored = {
  chapterIds: string[];
  notionIds: string[];
};

// Gestion des notions : propriétaire OU gestionnaire, comme les fichiers sources
// dont elles sont issues.

export async function getWorkshopNotions(workshopId: string): Promise<Notion[]> {
  if (!(await requireManager(workshopId))) return [];
  return await notionsLib.listNotions(workshopId);
}

export async function createWorkshopNotion(
  workshopId: string,
  title: string,
  chapterId: string | null = null
): Promise<{ success: boolean; notion?: Notion; error?: string }> {
  try {
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };

    const result = await notionsLib.createNotion(workshopId, ctx.userId, title, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('createWorkshopNotion error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

export async function updateWorkshopNotion(
  workshopId: string,
  notionId: string,
  title: string,
  chapterId: string | null = null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await notionsLib.updateNotion(workshopId, notionId, title, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('updateWorkshopNotion error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Glisser-déposer d'une notion sur un chapitre : ne touche qu'au rangement.
export async function moveWorkshopNotion(
  workshopId: string,
  notionId: string,
  chapterId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await notionsLib.setNotionChapter(workshopId, notionId, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('moveWorkshopNotion error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

/** Supprime une notion en gardant de quoi l'annuler (voir @/lib/workshops/trash) :
 *  `trashId` est ce que le bouton d'annulation renvoie pour la restaurer. */
export async function deleteWorkshopNotion(
  workshopId: string,
  notionId: string
): Promise<{ success: boolean; trashId?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await trashLib.trashNotion(getSupabaseServerClient(), workshopId, notionId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteWorkshopNotion error:', err);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}

/** Supprime d'un coup toutes les notions sans chapitre (annulable d'un coup). */
export async function deleteUnassignedWorkshopNotions(
  workshopId: string
): Promise<{ success: boolean; trashId?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await trashLib.trashUnassignedNotions(getSupabaseServerClient(), workshopId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteUnassignedWorkshopNotions error:', err);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}

/** Remet ce qu'une suppression a mis de côté — notion ou chapitre. */
export async function restoreWorkshopTrash(
  workshopId: string,
  trashId: string
): Promise<{ success: boolean; restored?: Restored; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await trashLib.restoreFromTrash(getSupabaseServerClient(), workshopId, trashId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('restoreWorkshopTrash error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

/** Retire une notion qu'on vient de créer — l'annulation d'un « ajouter ».
 *  Sans copie : il n'y a rien à garder d'une notion qui vient de naître. */
export async function removeNewWorkshopNotion(
  workshopId: string,
  notionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await notionsLib.deleteNotion(workshopId, notionId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteWorkshopNotion error:', err);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}
