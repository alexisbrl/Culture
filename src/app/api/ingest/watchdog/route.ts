import { NextRequest, NextResponse } from 'next/server';

import { dispatchTasks } from '@/lib/ingest/dispatch';
import { watch } from '@/lib/ingest/orchestrator';

// La veille des générations, appelée chaque minute par une tâche planifiée de la
// base (docs/migrations/2026-09-24-veille-des-generations.sql).
//
// Elle reprend une fois une tâche coupée par la limite de durée de l'hébergeur,
// et relance ce qu'aucun relais n'a pris — de quoi finir une génération que plus
// personne ne regarde. L'écran fait la même chose pour SA génération à chaque
// lecture d'avancement ; cette veille couvre le cas où il est fermé.
//
// ⚠️ **Sans contrôle d'accès, et c'est voulu** : la base n'a pas de session à
// présenter. La route ne prend aucune entrée et ne fait que relancer des tâches
// déjà rangées, jamais en créer ; l'appeler cent fois ne coûte que des lectures.
// Elle ne touche que les lots ouverts par CE serveur (`baseUrl`).

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;
  const dispatches = await watch({ baseUrl });
  await Promise.all(dispatches.map((d) => dispatchTasks(d.baseUrl, d.taskIds)));
  return NextResponse.json({ ok: true, imports: dispatches.length });
}
