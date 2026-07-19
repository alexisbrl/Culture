'use server';

import { requireMember, requireManager } from '@/lib/authz';
import * as chaptersLib from '@/lib/workshops/chapters';
import { revalidateWorkshop } from '@/lib/revalidate';

// Logique métier : voir @/lib/workshops/chapters. Type redéclaré localement (un
// fichier `'use server'` ne peut pas réexporter un type importé — piège
// Turbopack, cf. .claude/rules/server-architecture.md).
export type Chapter = {
  id: string;
  name: string;
  position: number;
  brickCount: number;
};

// Lecture ouverte à tous les membres : les chapitres pilotent les pots de
// l'onglet Programme, visible par les candidats. Les mutations restent
// réservées au propriétaire et aux gestionnaires.
export async function getWorkshopChapters(workshopId: string): Promise<Chapter[]> {
  if (!(await requireMember(workshopId))) return [];
  return await chaptersLib.listChapters(workshopId);
}

export async function createWorkshopChapter(
  workshopId: string,
  name: string
): Promise<{ success: boolean; chapter?: Chapter; error?: string }> {
  try {
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };

    const result = await chaptersLib.createChapter(workshopId, ctx.userId, name);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('createWorkshopChapter error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

export async function renameWorkshopChapter(
  workshopId: string,
  chapterId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await chaptersLib.renameChapter(workshopId, chapterId, name);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('renameWorkshopChapter error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

export async function deleteWorkshopChapter(
  workshopId: string,
  chapterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await chaptersLib.deleteChapter(workshopId, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteWorkshopChapter error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

export async function reorderWorkshopChapters(
  workshopId: string,
  orderedIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await chaptersLib.reorderChapters(workshopId, orderedIds);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('reorderWorkshopChapters error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
