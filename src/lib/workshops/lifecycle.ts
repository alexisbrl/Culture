// Logique métier « cycle de vie d'un atelier » (création, suppression avec code
// envoyé par e-mail, restauration), extraite de src/app/actions/workshops.ts
// (audit §5.2, même découpage que @/lib/workshops/members et core.ts).
//
// Comme pour les autres modules de ce dossier : pas de `revalidatePath` ici. Les
// wrappers `'use server'` de workshops.ts gardent l'authz (`requireOwner`) et la
// revalidation Next.js. Les appels Clerk/Resend restent ici : ce sont des effets
// de bord métier (« qui reçoit le code de suppression »), pas des concepts
// Next.js, et une future route API aurait besoin exactement du même comportement.

import { randomInt } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { Resend } from 'resend';
import { getSupabaseServerClient } from '@/lib/supabase';
import { generateTag } from '@/lib/tag';
import { EMAIL_FROM, deletionCodeEmail, workshopTrashedEmail } from '@/lib/emails';

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY manquante');
  return new Resend(process.env.RESEND_API_KEY);
}

// Code à 6 chiffres généré avec un générateur cryptographiquement sûr
// (randomInt — pas de biais de modulo, non prédictible, contrairement à Math.random).
function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

// Génère un tag d'atelier garanti unique (max 10 tentatives).
// Le générateur de base est partagé avec les tags utilisateur (cf. @/lib/tag).
async function generateUniqueWorkshopTag(): Promise<string> {
  const supabase = getSupabaseServerClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateTag();
    const { data } = await supabase
      .from('workshops')
      .select('id')
      .eq('unique_tag', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error('Impossible de générer un tag unique après 10 tentatives');
}

export async function createWorkshop(
  name: string,
  ownerId: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseServerClient();
  const uniqueTag = await generateUniqueWorkshopTag();

  const { data: workshop, error } = await supabase
    .from('workshops')
    .insert({ name: name.trim(), created_by: ownerId, unique_tag: uniqueTag })
    .select('id')
    .single();

  if (error || !workshop) {
    console.error('createWorkshop error:', error);
    return { success: false, error: 'Erreur lors de la création' };
  }

  await supabase.from('workshop_members').insert({
    workshop_id: workshop.id,
    user_id: ownerId,
    role: 'owner',
  });

  return { success: true, id: workshop.id };
}

export async function requestDeletionCode(
  workshopId: string,
  ownerId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  const { data: workshop } = await supabase
    .from('workshops')
    .select('name')
    .eq('id', workshopId)
    .single();

  if (!workshop) return { success: false, error: 'Atelier introuvable' };

  // Supprimer les anciens codes pour cet atelier (compteur d'essais remis à zéro)
  await supabase
    .from('deletion_codes')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', ownerId);

  // Générer et stocker le nouveau code (valable 15 min)
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await supabase.from('deletion_codes').insert({
    workshop_id: workshopId,
    user_id: ownerId,
    code,
    expires_at: expiresAt,
  });

  // Récupérer l'email du propriétaire via Clerk
  const client = await clerkClient();
  const user = await client.users.getUser(ownerId);
  const ownerEmail = user.emailAddresses[0]?.emailAddress;
  if (!ownerEmail) return { success: false, error: 'Email introuvable' };

  const ownerName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || ownerEmail;

  // Envoyer le code par email
  const resend = getResend();
  const mail = deletionCodeEmail({ ownerName, workshopName: workshop.name, code });
  await resend.emails.send({ from: EMAIL_FROM, to: ownerEmail, subject: mail.subject, html: mail.html });

  return { success: true };
}

export async function confirmDeletion(
  workshopId: string,
  ownerId: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  // Charger le code et son suivi anti-brute-force.
  const { data: codeRecord } = await supabase
    .from('deletion_codes')
    .select('code, expires_at, attempts, last_attempt_at')
    .eq('workshop_id', workshopId)
    .eq('user_id', ownerId)
    .single();

  if (!codeRecord) return { success: false, error: 'Code introuvable. Renvoyez un nouveau code.' };
  if (new Date(codeRecord.expires_at) < new Date()) return { success: false, error: 'Code expiré. Renvoyez un nouveau code.' };

  // Plafond de 25 essais : au-delà, le code est invalidé et l'utilisateur doit
  // renvoyer un nouveau code (jamais bloqué durablement).
  if (codeRecord.attempts >= 25) {
    await supabase.from('deletion_codes').delete().eq('workshop_id', workshopId).eq('user_id', ownerId);
    return { success: false, error: 'Trop de tentatives. Renvoyez un nouveau code.' };
  }

  // Délai minimal de 5 s entre deux essais (anti-brute-force).
  if (codeRecord.last_attempt_at && Date.now() - new Date(codeRecord.last_attempt_at).getTime() < 5000) {
    return { success: false, error: 'Veuillez patienter quelques secondes avant de réessayer.' };
  }

  // Enregistrer l'essai (compteur + horodatage) AVANT de comparer le code.
  await supabase
    .from('deletion_codes')
    .update({ attempts: codeRecord.attempts + 1, last_attempt_at: new Date().toISOString() })
    .eq('workshop_id', workshopId)
    .eq('user_id', ownerId);

  if (codeRecord.code !== code) return { success: false, error: 'Code incorrect.' };

  // Nom de l'atelier (pour l'email) + liste des propriétaires : requêtes
  // indépendantes → lancées en parallèle (audit 4.2).
  const [{ data: workshop }, { data: owners }] = await Promise.all([
    supabase.from('workshops').select('name').eq('id', workshopId).single(),
    supabase.from('workshop_members').select('user_id').eq('workshop_id', workshopId).eq('role', 'owner'),
  ]);

  if (!workshop) return { success: false, error: 'Atelier introuvable' };

  // Soft delete
  await supabase
    .from('workshops')
    .update({ deleted_at: new Date().toISOString(), deleted_by: ownerId })
    .eq('id', workshopId);

  // Supprimer le code utilisé
  await supabase
    .from('deletion_codes')
    .delete()
    .eq('workshop_id', workshopId)
    .eq('user_id', ownerId);

  // Envoyer un email de notification à tous les propriétaires.
  // Audit 4.2 : on évite le N+1 (un `getUser` Clerk par propriétaire) — un seul
  // `getUserList` batch pour tous les propriétaires, et envois Resend en parallèle.
  try {
    const resend = getResend();
    const client = await clerkClient();

    const ownerIds = (owners ?? []).map((o) => o.user_id);
    const [currentUser, ownerList] = await Promise.all([
      client.users.getUser(ownerId),
      ownerIds.length > 0
        ? client.users.getUserList({ userId: ownerIds, limit: ownerIds.length })
        : Promise.resolve({ data: [] as Awaited<ReturnType<typeof client.users.getUser>>[] }),
    ]);

    const actionBy = `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() ||
      currentUser.emailAddresses[0]?.emailAddress || 'Un propriétaire';

    await Promise.all(
      ownerList.data.flatMap((ownerUser) => {
        const ownerEmail = ownerUser.emailAddresses[0]?.emailAddress;
        if (!ownerEmail) return [];
        const ownerName = `${ownerUser.firstName ?? ''} ${ownerUser.lastName ?? ''}`.trim() || ownerEmail;
        const mail = workshopTrashedEmail({ ownerName, workshopName: workshop.name, actionBy });
        return [resend.emails.send({ from: EMAIL_FROM, to: ownerEmail, subject: mail.subject, html: mail.html })];
      })
    );
  } catch (emailErr) {
    console.error('Email notification error (non-blocking):', emailErr);
  }

  return { success: true };
}

export async function restoreWorkshop(workshopId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseServerClient();

  await supabase
    .from('workshops')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', workshopId);

  return { success: true };
}
