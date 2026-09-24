// Le relais : une fonction serveur qui lance les suivantes.
//
// Chaque tâche d'une génération tourne dans SA propre fonction serveur, pour
// tenir dans la limite de durée de l'hébergeur (300 s par appel). Celle qui se
// termine lance elle-même les tâches prêtes en appelant notre propre route —
// sans attendre qu'elles finissent, seulement qu'elles soient reçues.
//
// ─── Qui a le droit d'appeler la route des tâches ────────────────────────────
//
// Personne d'autre que nous : il n'y a pas d'utilisateur derrière un relais, donc
// pas de session. Chaque appel porte une signature de l'identifiant de la tâche,
// calculée avec un secret du serveur — le secret lui-même ne voyage jamais. Une
// signature valide ne permet que d'exécuter une tâche DÉJÀ rangée en base, par
// une action qui a fait le contrôle d'accès en amont.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Le relais n'attend que la RÉCEPTION : la route répond dès qu'elle a pris la
 *  tâche, et travaille ensuite. Au-delà, on abandonne — la veille reprendra ce
 *  qui n'a pas démarré. */
const DISPATCH_TIMEOUT_MS = 10_000;

function secret(): string {
  // Un secret dédié s'il existe ; sinon la clé de service de la base, présente
  // partout où le serveur tourne. Elle ne sert ici que de clé de signature.
  const key = process.env.INGEST_TASK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Aucun secret pour signer les tâches de génération');
  return key;
}

export function taskToken(taskId: string): string {
  return createHmac('sha256', secret()).update(`ingest-task:${taskId}`).digest('hex');
}

export function isValidTaskToken(taskId: string, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const expected = Buffer.from(taskToken(taskId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Lance les tâches données, toutes ensemble. **Ne lève jamais** : un relais
 *  perdu n'est pas une panne, la veille le rattrape. */
export async function dispatchTasks(baseUrl: string, taskIds: readonly string[]): Promise<void> {
  await Promise.all(
    taskIds.map(async (taskId) => {
      try {
        await fetch(`${baseUrl}/api/ingest/task`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskId, token: taskToken(taskId) }),
          signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
        });
      } catch (error) {
        console.warn('[ingest] relais non transmis, la veille le reprendra :', taskId, error instanceof Error ? error.message : error);
      }
    }),
  );
}
