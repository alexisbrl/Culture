'use server';

import { requireMember } from '@/lib/authz';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as masteryLib from '@/lib/workshops/mastery';

// Avancement d'un membre sur son parcours — alimente les barres de progression
// de l'onglet parcours. Logique métier : voir @/lib/workshops/mastery.
//
// Lecture ouverte à tout membre, mais toujours sur SA propre progression :
// l'identité vient de `requireMember`, jamais d'un paramètre. Type redéclaré
// localement (un fichier `'use server'` ne peut pas réexporter un type importé
// — piège Turbopack, cf. .claude/rules/server-architecture.md).

export type ParcoursProgress = {
  workshopPercent: number;
  chapterPercent: Record<string, number>;
};

export async function getParcoursProgress(workshopId: string): Promise<ParcoursProgress> {
  const ctx = await requireMember(workshopId);
  if (!ctx) return { workshopPercent: 0, chapterPercent: {} };
  return await masteryLib.getParcoursProgress(workshopId, ctx.userId);
}

// ⚠️ MÉCANISME DE TEST TEMPORAIRE — à retirer avant la mise en service.
// Voir `resetUserMastery` dans @/lib/workshops/mastery pour le pourquoi.
//
// L'identité vient de `requireMember`, JAMAIS d'un paramètre : un membre ne
// peut remettre à zéro que sa propre progression. Une server action est une URL
// POST publique — accepter un `userId` du client donnerait à n'importe quel
// membre le pouvoir d'effacer la progression des autres.
export async function resetMyParcoursProgress(
  workshopId: string
): Promise<{ success: boolean; cleared: number; error?: string }> {
  const ctx = await requireMember(workshopId);
  if (!ctx) return { success: false, cleared: 0, error: 'Accès refusé' };

  const result = await masteryLib.resetUserMastery(workshopId, ctx.userId);
  if (result.success) revalidateWorkshop();
  return result;
}
