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

/** Ramène un nom de fichier à ce qu'une clé de stockage accepte.
 *
 *  ⚠️ **Le stockage refuse tout ce qui n'est pas de l'ASCII**, et il le refuse
 *  d'un bloc : « Invalid key », aucun octet écrit. Un accent, une apostrophe
 *  typographique ou un idéogramme suffisent — et c'est exactement ce qui a
 *  empêché l'IA d'écrire son cours deux jours durant (04-05/09/2026) : son
 *  document s'appelle « Cours écrit par l’IA.md », donc sa clé était refusée à
 *  chaque tentative. L'échec étant avalé (l'étape 0 n'a pas le droit de faire
 *  échouer la génération), la génération repartait simplement sans matière.
 *
 *  Le même piège attendait n'importe quel utilisateur déposant un « Cours
 *  d'été.pdf ». Le nom AFFICHÉ ne change pas pour autant : il est stocké à part
 *  en base et c'est lui qu'on propose au téléchargement — seule la clé technique
 *  est translittérée. */
// Les marques diacritiques que la décomposition NFD isole. Écrite en échappements
// plutôt qu'en caractères littéraux : une classe de caractères invisibles dans le
// code source est illisible, et se perd au premier outil qui recopie le fichier.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function asciiKeySegment(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    // Les diacritiques, isolés par la décomposition, disparaissent : « é » → « e ».
    .replace(COMBINING_MARKS, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|-+$/g, '');
  // Un nom entièrement non-latin ne laisse rien après translittération : la clé
  // doit rester valide, pas forcément lisible — l'horodatage qui la précède
  // suffit à l'unicité.
  return ascii.length > 0 ? ascii.slice(0, 120) : 'fichier';
}

// Construit la clé de stockage d'un fichier d'atelier (workshopId en premier
// segment pour faciliter l'isolation par atelier).
export function buildWorkshopFileKey(workshopId: string, fileName: string): string {
  return `${workshopId}/${Date.now()}-${asciiKeySegment(fileName)}`;
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

/** Lit le contenu d'un objet **côté serveur**, sans passer par une URL signée.
 *
 *  Sert à l'ingestion IA : le fichier doit être remis au fournisseur de modèle,
 *  ce qui suppose d'en avoir les octets ici. Le reste de l'app n'en a pas besoin
 *  — un client télécharge toujours par URL signée (`createSignedDownloadUrl`),
 *  jamais en faisant transiter le fichier par notre serveur. */
export async function readObject(key: string): Promise<Uint8Array | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(WORKSHOP_FILES_BUCKET).download(key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Écrit un objet **depuis le serveur**, sans ticket ni client.
 *
 *  L'exception au modèle habituel — un fichier arrive normalement du navigateur,
 *  qui le pousse lui-même via une URL signée. Ici, le contenu est produit par le
 *  serveur (le document que l'IA rédige à partir d'une consigne) : il n'y a
 *  aucun navigateur dans la boucle, et lui faire faire l'aller-retour n'aurait
 *  aucun sens.
 *
 *  Rend `false` plutôt que de lever : l'appelant décide si l'échec est fatal. */
export async function writeObject(key: string, bytes: Uint8Array, mimeType: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.storage
    .from(WORKSHOP_FILES_BUCKET)
    .upload(key, bytes, { contentType: mimeType, upsert: true });
  if (error) {
    console.error('writeObject error:', error);
    return false;
  }
  return true;
}

export async function deleteObject(key: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.storage.from(WORKSHOP_FILES_BUCKET).remove([key]);
}

// Génère une URL de téléchargement signée, de courte durée de vie, pour un objet
// d'un bucket privé. `downloadName` force le téléchargement (plutôt qu'un affichage
// inline) en proposant ce nom de fichier au navigateur. Renvoie null en cas d'échec.
export async function createSignedDownloadUrl(
  key: string,
  downloadName?: string,
  expiresInSeconds = 120,
): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(WORKSHOP_FILES_BUCKET)
    .createSignedUrl(key, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}
