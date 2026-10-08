'use server';

import { requireMember, requireManager } from '@/lib/authz';
import * as chaptersLib from '@/lib/workshops/chapters';
import * as trashLib from '@/lib/workshops/trash';
import { getSupabaseServerClient } from '@/lib/supabase';
import { revalidateWorkshop } from '@/lib/revalidate';
import { PROGRAM_LOCKED, programLocked } from '@/lib/workshops/programLock';

// Logique métier : voir @/lib/workshops/chapters. Type redéclaré localement (un
// fichier `'use server'` ne peut pas réexporter un type importé — piège
// Turbopack, cf. .claude/rules/server-architecture.md).
export type Chapter = {
  id: string;
  name: string;
  position: number;
  notionCount: number;
  hidden: boolean;
};

// Lecture ouverte à tous les membres : les chapitres pilotent les pots de
// l'onglet Programme, visible par les candidats. Les mutations restent
// réservées au propriétaire et aux gestionnaires.
export async function getWorkshopChapters(workshopId: string): Promise<Chapter[]> {
  if (!(await requireMember(workshopId))) return [];
  return await chaptersLib.listChapters(workshopId);
}

/** Remet un chapitre caché dans le programme.
 *
 *  Il n'existe pas d'action symétrique : cacher est réservé à l'ingestion IA,
 *  parce que l'interface ne propose pas ce bouton (voir `chapters.ts`). */
export async function restoreWorkshopChapter(
  workshopId: string,
  chapterId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
  if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

  const result = await chaptersLib.restoreChapter(workshopId, chapterId);
  if (result.success) revalidateWorkshop();
  return result;
}

/** Annule un « restaurer » (bouton d'annulation des paramètres). */
export async function unrestoreWorkshopChapter(
  workshopId: string,
  chapterId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
  if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

  const result = await chaptersLib.unrestoreChapter(workshopId, chapterId);
  if (result.success) revalidateWorkshop();
  return result;
}

export async function createWorkshopChapter(
  workshopId: string,
  name: string
): Promise<{ success: boolean; chapter?: Chapter; error?: string }> {
  try {
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };
    if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

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
    if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

    const result = await chaptersLib.renameChapter(workshopId, chapterId, name);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('renameWorkshopChapter error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

/** Supprime un chapitre en gardant de quoi l'annuler (voir @/lib/workshops/trash) :
 *  `trashId` est ce que le bouton d'annulation renvoie pour le restaurer. */
export async function deleteWorkshopChapter(
  workshopId: string,
  chapterId: string
): Promise<{ success: boolean; trashId?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
    if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

    const result = await trashLib.trashChapter(getSupabaseServerClient(), workshopId, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteWorkshopChapter error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

/** Supprime un chapitre écarté par l'IA, avec ses notions (annulable). */
export async function deleteHiddenWorkshopChapter(
  workshopId: string,
  chapterId: string
): Promise<{ success: boolean; trashId?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
    if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

    const result = await trashLib.trashHiddenChapter(getSupabaseServerClient(), workshopId, chapterId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteHiddenWorkshopChapter error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

/** Retire un chapitre qu'on vient de créer — l'annulation d'un « ajouter ».
 *  Sans copie : il n'y a rien à garder d'un chapitre qui vient de naître. */
export async function removeNewWorkshopChapter(
  workshopId: string,
  chapterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
    if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

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
    if (await programLocked(workshopId)) return { success: false, error: PROGRAM_LOCKED };

    const result = await chaptersLib.reorderChapters(workshopId, orderedIds);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('reorderWorkshopChapters error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
