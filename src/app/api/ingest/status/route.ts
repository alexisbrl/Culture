import { NextRequest, NextResponse } from 'next/server';

import { requireImportManager } from '@/lib/authz';
import { dispatchTasks } from '@/lib/ingest/dispatch';
import { generationStatus, watch } from '@/lib/ingest/orchestrator';
import { revalidateWorkshop } from '@/lib/revalidate';

// L'avancement d'une génération, lu par l'écran toutes les quelques secondes.
//
// Une route et non une server action : les actions d'un même onglet passent une
// par une, et une lecture répétée toutes les deux secondes bloquerait tout le
// reste de l'écran (voir l'en-tête de `AiGenerationDialog`).
//
// Chaque lecture fait aussi la veille de CE lot : tant que quelqu'un regarde, une
// tâche coupée ou perdue repart en quelques secondes, sans attendre la veille
// planifiée.

export async function GET(req: NextRequest) {
  const workshopId = req.nextUrl.searchParams.get('workshopId');
  const importId = req.nextUrl.searchParams.get('importId');
  if (!workshopId || !importId) return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });

  const ctx = await requireImportManager(workshopId, importId);
  if (!ctx) return NextResponse.json({ ok: false, error: 'Droits insuffisants' }, { status: 403 });

  const dispatches = await watch({ importId });
  await Promise.all(dispatches.map((d) => dispatchTasks(d.baseUrl, d.taskIds)));

  const status = await generationStatus(importId);
  if (!status) return NextResponse.json({ ok: false, error: 'Génération introuvable' }, { status: 404 });
  // Le travail est écrit en tâche de fond, où l'on ne peut pas revalider : on le
  // fait ici, quand la génération est finie et que l'écran va se rafraîchir.
  if (status.state !== 'running') revalidateWorkshop();
  return NextResponse.json({ ok: true, ...status });
}
