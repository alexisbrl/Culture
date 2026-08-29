'use server';

import { requireMember } from '@/lib/authz';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as masteryLib from '@/lib/workshops/mastery';
import * as examLib from '@/lib/workshops/exam';
import { paceVerdict, PACE_WINDOW } from '@/lib/workshops/answerPace';

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

  // Les deux vont ensemble : remettre la maîtrise à zéro sans oublier les
  // questions déjà répondues laisserait un parcours vierge et sans plus rien à
  // tirer. Une erreur ici n'annule pas la remise à zéro, qui a bien eu lieu.
  try {
    await examLib.clearParcoursAsked(workshopId, ctx.userId);
  } catch (err) {
    console.error('resetMyParcoursProgress asked error:', err);
  }

  if (result.success) revalidateWorkshop();
  return result;
}

// Combien de temps il reste avant qu'un membre puisse relancer un exercice.
//
// Rendu en DURÉE et non en date : l'écran s'en sert pour désactiver les boutons
// puis se réarmer tout seul au bout du compte, sans jamais lire l'horloge
// pendant un rendu (règle React Compiler du projet). 0 = rien ne bloque.
//
// ⚠️ La pause ne vit pas dans le navigateur : elle se déduit des dernières
// réponses enregistrées (voir @/lib/workshops/answerPace). Recharger la page,
// fermer l'onglet ou changer d'appareil n'y change donc rien — et le tirage la
// vérifie de son côté, l'écran n'en est que le reflet.
export async function getParcoursPause(workshopId: string): Promise<number> {
  const ctx = await requireMember(workshopId);
  if (!ctx) return 0;

  const verdict = paceVerdict(await examLib.recentAnswerPace(workshopId, ctx.userId, PACE_WINDOW));
  if (verdict.state !== 'blocked') return 0;

  return Math.max(0, verdict.until - Date.now());
}
