import { NextRequest, NextResponse, after } from 'next/server';

import { requireManager } from '@/lib/authz';
import { watch } from '@/lib/ingest/orchestrator';
import { followUp, listRequests, promoteNext } from '@/lib/ingest/queue';
import { revalidateWorkshop } from '@/lib/revalidate';

// Les générations d'un atelier, lues par l'écran toutes les quelques secondes.
//
// Une route et non une server action : les actions d'un même onglet passent une
// par une, et une lecture répétée toutes les deux secondes bloquerait tout le
// reste de l'écran (voir `generationStore`).
//
// Rend les demandes de la file (@/lib/ingest/queue) qui attendent ou tournent,
// plus celles que l'écran suit déjà (`follow`, séparées par des virgules), même
// finies : c'est ainsi qu'il apprend comment elles se sont terminées.
//
// Chaque lecture fait aussi la veille des lots qui tournent, et fait partir la
// suivante de la file si la place est libre : tant que quelqu'un regarde, rien
// n'attend la veille planifiée.

// Le démarrage de la suivante (téléversement compris) tient dans cette durée.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const workshopId = req.nextUrl.searchParams.get('workshopId');
  if (!workshopId) return NextResponse.json({ ok: false, error: 'Requête invalide' }, { status: 400 });
  if (!(await requireManager(workshopId))) return NextResponse.json({ ok: false, error: 'Droits insuffisants' }, { status: 403 });

  const followed = (req.nextUrl.searchParams.get('follow') ?? '')
    .split(',')
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 12);

  const before = await listRequests(workshopId, followed);
  const running = before.filter((r) => r.state === 'running' && r.importId).map((r) => r.importId as string);
  const dispatches = (await Promise.all(running.map((importId) => watch({ importId })))).flat();
  // Relancer les tâches et démarrer la suivante de la file (qui téléverse les
  // documents) se fait APRÈS la réponse : la lecture reste instantanée.
  const origin = req.nextUrl.origin;
  const starting = before.some((r) => r.state === 'starting');
  after(async () => {
    await followUp(dispatches);
    if (starting) await promoteNext(workshopId, origin);
  });

  // Une génération que la veille vient de refermer se relit avec son issue.
  const requests = dispatches.some((d) => d.finished) ? await listRequests(workshopId, followed) : before;
  // Le travail est écrit en tâche de fond, où l'on ne peut pas revalider : on le
  // fait ici, quand une génération suivie est finie et que l'écran va se relire.
  if (requests.some((r) => r.state !== 'running' && r.state !== 'queued' && r.state !== 'starting')) revalidateWorkshop();
  return NextResponse.json({ ok: true, requests });
}
