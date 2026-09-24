import { NextRequest, NextResponse, after } from 'next/server';

import { dispatchTasks, isValidTaskToken } from '@/lib/ingest/dispatch';
import { runTask } from '@/lib/ingest/orchestrator';

// Une tâche de génération — un appel au modèle au plus —, dans SA fonction
// serveur (docs/architecture.md §7.11).
//
// Appelée par nous seuls : par le lancement, par une tâche qui vient de finir, ou
// par la veille. Pas de session derrière — la signature de l'identifiant de tâche
// en tient lieu (@/lib/ingest/dispatch), et elle ne permet que d'exécuter une
// tâche déjà rangée en base par une action qui a contrôlé les droits.
//
// La route répond DÈS réception : l'appelant n'attend que ça, et le travail se
// fait ensuite (`after`), dans la durée maximale de la fonction. Une tâche coupée
// par cette limite est reprise une fois par la veille.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { taskId?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { taskId, token } = body;
  if (typeof taskId !== 'string' || !isValidTaskToken(taskId, token)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  after(async () => {
    const next = await runTask(taskId);
    await dispatchTasks(next.baseUrl, next.taskIds);
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
