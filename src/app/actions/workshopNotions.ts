'use server';

import { requireManager } from '@/lib/authz';
import * as notionsLib from '@/lib/workshops/notions';
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

export async function deleteWorkshopNotion(
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
