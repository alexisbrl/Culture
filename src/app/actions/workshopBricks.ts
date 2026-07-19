'use server';

import { requireManager } from '@/lib/authz';
import * as bricksLib from '@/lib/workshops/bricks';
import { revalidateWorkshop } from '@/lib/revalidate';

// Logique métier : voir @/lib/workshops/bricks. Les wrappers `'use server'` ici
// ne portent que l'authz Clerk et la revalidation Next.js. Type redéclaré
// localement (un fichier `'use server'` ne peut pas réexporter un type importé
// — piège Turbopack, cf. .claude/rules/server-architecture.md).
export type Brick = {
  id: string;
  title: string;
  content: string | null;
  chapterId: string | null;
  createdAt: string;
};

// Gestion des briques : propriétaire OU gestionnaire, comme les fichiers sources
// dont elles sont issues.

export async function getWorkshopBricks(workshopId: string): Promise<Brick[]> {
  if (!(await requireManager(workshopId))) return [];
  return await bricksLib.listBricks(workshopId);
}

export async function createWorkshopBrick(
  workshopId: string,
  title: string,
  content: string | null,
  chapterId: string | null = null
): Promise<{ success: boolean; brick?: Brick; error?: string }> {
  try {
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };

    const result = await bricksLib.createBrick(workshopId, ctx.userId, title, content, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('createWorkshopBrick error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

export async function updateWorkshopBrick(
  workshopId: string,
  brickId: string,
  title: string,
  content: string | null,
  chapterId: string | null = null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await bricksLib.updateBrick(workshopId, brickId, title, content, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('updateWorkshopBrick error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

export async function deleteWorkshopBrick(
  workshopId: string,
  brickId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await bricksLib.deleteBrick(workshopId, brickId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteWorkshopBrick error:', err);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}
