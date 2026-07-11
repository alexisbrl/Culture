// Logique métier « fichiers d'atelier » (upload via ticket signé, téléchargement,
// renommage, suppression), extraite de src/app/actions/workshopFiles.ts (audit
// §5.2, même découpage que les autres modules de ce dossier).
//
// Pas de `revalidatePath` ici. Les wrappers `'use server'` de workshopFiles.ts
// gardent l'authz (`requireManager`) et la revalidation Next.js.

import { getSupabaseServerClient } from '@/lib/supabase';
import { buildWorkshopFileKey, createUploadTicket, createSignedDownloadUrl, deleteObject, type UploadTicket } from '@/lib/storage';

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

export async function listFiles(workshopId: string): Promise<WorkshopFile[]> {
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

// 1. Le client demande un ticket : vérifie le quota, puis renvoie une requête
//    HTTP signée (scope limité à ce fichier, courte durée de vie) que le client
//    exécute lui-même pour transférer le fichier directement.
export async function createUploadTicketFor(
  workshopId: string,
  fileName: string,
  fileSize: number,
  mimeType: string
): Promise<{ success: boolean; ticket?: UploadTicket; path?: string; error?: string }> {
  if (fileSize > MAX_FILE_SIZE) {
    return { success: false, error: 'Fichier trop lourd (50 Mo maximum)' };
  }

  const path = buildWorkshopFileKey(workshopId, fileName);
  const ticket = await createUploadTicket(path, mimeType);
  if (!ticket) {
    return { success: false, error: 'Erreur lors de la préparation du téléchargement' };
  }

  return { success: true, ticket, path };
}

// 2. Une fois le fichier transféré (PUT direct vers le stockage via le ticket
//    ci-dessus), le client enregistre les métadonnées.
export async function finalizeUpload(
  workshopId: string,
  uploaderId: string,
  path: string,
  name: string,
  size: number,
  mimeType: string
): Promise<{ success: boolean; file?: WorkshopFile; error?: string }> {
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
      created_by: uploaderId,
    })
    .select('id, name, size, mime_type, category, created_at')
    .single();

  if (insertError || !row) {
    console.error('finalizeUpload insert error:', insertError);
    await deleteObject(path);
    return { success: false, error: 'Erreur lors de l’enregistrement' };
  }

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
}

// Les fichiers sont confidentiels : le bucket est privé et n'expose aucune URL
// publique. On génère à la demande une URL signée de courte durée.
export async function getDownloadUrl(
  workshopId: string,
  fileId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
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
}

// L'extension d'origine est toujours conservée, quoi que l'utilisateur saisisse.
export async function rename(
  workshopId: string,
  fileId: string,
  newBaseName: string
): Promise<{ success: boolean; name?: string; error?: string }> {
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
    console.error('rename error:', error);
    return { success: false, error: 'Erreur serveur' };
  }

  return { success: true, name: newName };
}

export async function remove(workshopId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
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

  return { success: true };
}
