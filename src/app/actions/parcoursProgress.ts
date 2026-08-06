'use server';

import { requireMember } from '@/lib/authz';
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
