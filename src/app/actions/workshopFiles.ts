'use server';

import { requireManager } from '@/lib/authz';
import * as filesLib from '@/lib/workshops/files';
import { type UploadTicket } from '@/lib/storage';
import { revalidateWorkshop } from '@/lib/revalidate';

// Logique métier : voir @/lib/workshops/files (audit §5.2). Les wrappers
// `'use server'` ici ne portent plus que l'authz Clerk et la revalidation
// Next.js. Types redéclarés ici (un fichier `'use server'` ne peut pas
// réexporter un type importé — cf. @/app/actions/workshops pour le détail).
export type FileCategory = 'audio' | 'texte' | 'autre';

export type WorkshopFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  createdAt: string;
};

// Gestion des fichiers : propriétaire OU gestionnaire — contrôle d'accès factorisé
// dans `@/lib/authz` (requireManager), partagé avec les autres server actions.

// ─── Lister les fichiers d'un atelier ────────────────────────────────────────

export async function getWorkshopFiles(workshopId: string): Promise<WorkshopFile[]> {
  // Lecture réservée aux gestionnaires (cf. §1.4 de l'audit : ne plus exposer la
  // liste des fichiers d'un atelier à n'importe quel utilisateur connecté).
  if (!(await requireManager(workshopId))) return [];
  return await filesLib.listFiles(workshopId);
}

// ─── Ajouter un fichier (upload direct vers le stockage via URL signée) ──────

// 1. Le client demande un ticket : vérifie les droits + le quota, puis renvoie
//    une requête HTTP signée (scope limité à ce fichier, courte durée de vie)
//    que le client exécute lui-même pour transférer le fichier directement.
export async function createFileUploadTicket(
  workshopId: string,
  fileName: string,
  fileSize: number,
  mimeType: string
): Promise<{ success: boolean; ticket?: UploadTicket; path?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
    return await filesLib.createUploadTicketFor(workshopId, fileName, fileSize, mimeType);
  } catch (err) {
    console.error('createFileUploadTicket error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// 2. Une fois le fichier transféré (PUT direct vers le stockage via le ticket
//    ci-dessus), le client enregistre les métadonnées.
export async function finalizeWorkshopFileUpload(
  workshopId: string,
  path: string,
  name: string,
  size: number,
  mimeType: string
): Promise<{ success: boolean; file?: WorkshopFile; error?: string }> {
  try {
    const ctx = await requireManager(workshopId);
    if (!ctx) return { success: false, error: 'Droits insuffisants' };

    const result = await filesLib.finalizeUpload(workshopId, ctx.userId, path, name, size, mimeType);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('finalizeWorkshopFileUpload error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Télécharger un fichier (gestionnaire uniquement) ────────────────────────
//
// Les fichiers sont confidentiels : le bucket est privé et n'expose aucune URL
// publique. On génère à la demande une URL signée de courte durée, et seulement
// après vérification que l'appelant est gestionnaire de CET atelier.
export async function getFileDownloadUrl(
  workshopId: string,
  fileId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };
    return await filesLib.getDownloadUrl(workshopId, fileId);
  } catch (err) {
    console.error('getFileDownloadUrl error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Renommer un fichier (l'extension d'origine est toujours conservée) ──────

export async function renameWorkshopFile(
  workshopId: string,
  fileId: string,
  newBaseName: string
): Promise<{ success: boolean; name?: string; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await filesLib.rename(workshopId, fileId, newBaseName);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('renameWorkshopFile error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}

// ─── Supprimer un fichier ─────────────────────────────────────────────────────

export async function deleteWorkshopFile(
  workshopId: string,
  fileId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireManager(workshopId))) return { success: false, error: 'Droits insuffisants' };

    const result = await filesLib.remove(workshopId, fileId);
    if (result.success) revalidateWorkshop();
    return result;
  } catch (err) {
    console.error('deleteWorkshopFile error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
