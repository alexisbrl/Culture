'use server';

import { getSupabaseServerClient } from '@/lib/supabase';
import { requireManager } from '@/lib/authz';
import { buildWorkshopFileKey, createUploadTicket, createSignedDownloadUrl, deleteObject, type UploadTicket } from '@/lib/storage';
import { revalidatePath } from 'next/cache';

export type FileCategory = 'audio' | 'texte' | 'autre';

export type WorkshopFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  createdAt: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 Mo (limite globale Supabase sur le plan Free)

function categoryFor(mimeType: string): FileCategory {
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument')
  ) {
    return 'texte';
  }
  return 'autre';
}

// Gestion des fichiers : propriétaire OU gestionnaire — contrôle d'accès factorisé
// dans `@/lib/authz` (requireManager), partagé avec les autres server actions.

// ─── Lister les fichiers d'un atelier ────────────────────────────────────────

export async function getWorkshopFiles(workshopId: string): Promise<WorkshopFile[]> {
  // Lecture réservée aux gestionnaires (cf. §1.4 de l'audit : ne plus exposer la
  // liste des fichiers d'un atelier à n'importe quel utilisateur connecté).
  if (!(await requireManager(workshopId))) return [];

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from('workshop_files')
    .select('id, name, size, mime_type, category, created_at')
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimeType: f.mime_type,
    category: f.category as FileCategory,
    createdAt: f.created_at,
  }));
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

    if (fileSize > MAX_FILE_SIZE) {
      return { success: false, error: 'Fichier trop lourd (50 Mo maximum)' };
    }

    const path = buildWorkshopFileKey(workshopId, fileName);
    const ticket = await createUploadTicket(path, mimeType);
    if (!ticket) {
      return { success: false, error: 'Erreur lors de la préparation du téléchargement' };
    }

    return { success: true, ticket, path };
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

    const supabase = getSupabaseServerClient();
    const category = categoryFor(mimeType);

    const { data: row, error: insertError } = await supabase
      .from('workshop_files')
      .insert({
        workshop_id: workshopId,
        name,
        size,
        mime_type: mimeType,
        category,
        storage_path: path,
        created_by: ctx.userId,
      })
      .select('id, name, size, mime_type, category, created_at')
      .single();

    if (insertError || !row) {
      console.error('finalizeWorkshopFileUpload insert error:', insertError);
      await deleteObject(path);
      return { success: false, error: 'Erreur lors de l’enregistrement' };
    }

    revalidatePath(`/`, 'layout');
    return {
      success: true,
      file: {
        id: row.id,
        name: row.name,
        size: row.size,
        mimeType: row.mime_type,
        category: row.category as FileCategory,
        createdAt: row.created_at,
      },
    };
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

    const supabase = getSupabaseServerClient();
    const { data: row } = await supabase
      .from('workshop_files')
      .select('storage_path, name')
      .eq('id', fileId)
      .eq('workshop_id', workshopId)
      .maybeSingle();

    if (!row) return { success: false, error: 'Fichier introuvable' };

    const url = await createSignedDownloadUrl(row.storage_path, row.name);
    if (!url) return { success: false, error: 'Erreur lors de la préparation du téléchargement' };

    return { success: true, url };
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

    const trimmed = newBaseName.trim();
    if (!trimmed) return { success: false, error: 'Le nom ne peut pas être vide' };

    const supabase = getSupabaseServerClient();
    const { data: row } = await supabase
      .from('workshop_files')
      .select('name')
      .eq('id', fileId)
      .eq('workshop_id', workshopId)
      .single();

    if (!row) return { success: false, error: 'Fichier introuvable' };

    const dotIndex = row.name.lastIndexOf('.');
    const extension = dotIndex > 0 ? row.name.slice(dotIndex) : '';
    const newName = `${trimmed}${extension}`;

    const { error } = await supabase
      .from('workshop_files')
      .update({ name: newName })
      .eq('id', fileId)
      .eq('workshop_id', workshopId);

    if (error) {
      console.error('renameWorkshopFile error:', error);
      return { success: false, error: 'Erreur serveur' };
    }

    revalidatePath('/', 'layout');
    return { success: true, name: newName };
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

    const supabase = getSupabaseServerClient();
    const { data: row } = await supabase
      .from('workshop_files')
      .select('storage_path')
      .eq('id', fileId)
      .eq('workshop_id', workshopId)
      .single();

    if (!row) return { success: false, error: 'Fichier introuvable' };

    await deleteObject(row.storage_path);
    await supabase.from('workshop_files').delete().eq('id', fileId).eq('workshop_id', workshopId);

    revalidatePath(`/`, 'layout');
    return { success: true };
  } catch (err) {
    console.error('deleteWorkshopFile error:', err);
    return { success: false, error: 'Erreur serveur' };
  }
}
