import { getSupabaseServerClient } from './supabase';

// ─── Module de stockage de fichiers ──────────────────────────────────────────
// Point d'entrée unique pour le stockage de fichiers d'atelier. Le reste de
// l'app ne doit jamais appeler `supabase.storage` ni un SDK de provider
// directement — un futur changement de provider (ex. S3) ne touche que ce
// fichier. En base, on ne stocke que la clé/chemin de l'objet, jamais une URL.

const WORKSHOP_FILES_BUCKET = 'workshop-files';

export type UploadTicket = {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
};

// Construit la clé de stockage d'un fichier d'atelier (workshopId en premier
// segment pour faciliter l'isolation par atelier).
export function buildWorkshopFileKey(workshopId: string, fileName: string): string {
  return `${workshopId}/${Date.now()}-${fileName}`;
}

// Crée un ticket d'upload : le client effectue lui-même la requête HTTP
// décrite (PUT direct vers le stockage), sans clé secrète ni SDK côté client.
export async function createUploadTicket(key: string, mimeType: string): Promise<UploadTicket | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(WORKSHOP_FILES_BUCKET).createSignedUploadUrl(key);
  if (error || !data) return null;

  return {
    url: data.signedUrl,
    method: 'PUT',
    headers: {
      'content-type': mimeType,
      'cache-control': 'max-age=3600',
      'x-upsert': 'false',
    },
  };
}

export async function deleteObject(key: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.storage.from(WORKSHOP_FILES_BUCKET).remove([key]);
}
