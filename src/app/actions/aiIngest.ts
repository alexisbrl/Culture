'use server';

import { headers } from 'next/headers';

import { requireImportManager, requireManager } from '@/lib/authz';
import { dispatchTasks } from '@/lib/ingest/dispatch';
import { errorMessage as message } from '@/lib/ingest/failure';
import * as journal from '@/lib/ingest/journal';
import * as lock from '@/lib/ingest/lock';
import { BUSY_ERROR } from '@/lib/ingest/lock';
import * as orchestrator from '@/lib/ingest/orchestrator';
import * as run from '@/lib/ingest/run';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as imports from '@/lib/workshops/imports';

// Logique métier : voir @/lib/ingest/orchestrator et @/lib/workshops/imports.
// Ces wrappers ne portent que l'authz Clerk et la revalidation Next.js. Types
// redéclarés localement (un fichier `'use server'` ne peut pas réexporter un
// type importé — piège Turbopack, voir docs/architecture.md annexe A).
//
// ─── Droits ──────────────────────────────────────────────────────────────────
//
// Génération ET annulation : propriétaire OU gestionnaire (décision du
// 20/08/2026). Même niveau que la gestion des notions et des fichiers sources
// dont elles sont issues — celui qui peut écrire le programme à la main peut le
// faire écrire par l'IA, et le retirer.
//
// ─── L'écran lance, le serveur enchaîne ──────────────────────────────────────
//
// Une génération ne vit plus dans l'onglet (docs/architecture.md §7.11) : l'action
// de lancement ouvre le lot et range la première tâche, puis le serveur enchaîne
// seul. L'avancement se lit par la route `/api/ingest/status` — pas par une
// action : les actions d'un même onglet passent une par une, et une lecture
// répétée bloquerait le reste de l'écran.

export type PlanIssue = {
  kind: 'chapter' | 'notion' | 'assignment' | 'question' | 'verdict';
  ref?: string;
  reason: string;
};

export type ImportBanner = {
  importId: string;
  state: 'cancellable' | 'empty' | 'expired' | 'modified';
  /** La génération tourne encore, sur le serveur : ce qu'on compte est ce
   *  qu'elle a écrit jusqu'ici. */
  running: boolean;
  /** La génération s'est arrêtée avant la fin (serveur perdu, tâche coupée
   *  deux fois). Ce qu'elle a écrit est là, mais ce n'est pas un résultat
   *  voulu : le bandeau le dit au lieu de l'annoncer comme un import réussi.
   *  Voir `interruptedAmong` (@/lib/ingest/lock). */
  interrupted: boolean;
  chapters: number;
  notions: number;
  /** Les questions du lot, séparées selon l'écran qui les montre : le bandeau
   *  du programme n'annonce pas les questions parties à l'examen, et
   *  réciproquement (28/08/2026). */
  parcoursQuestions: number;
  examQuestions: number;
};

export type StartGenerationResult =
  | { ok: true; importId: string }
  /** `reason: 'busy'` = une génération tourne déjà sur cet atelier (voir
   *  @/lib/ingest/lock). L'écran a sa propre phrase pour ce cas-là : le message
   *  brut ne serait pas traduit. */
  | { ok: false; error: string; reason?: 'busy' };

/** Où joindre ce serveur : c'est à lui que les tâches de la génération se
 *  relaient. Lu sur la requête plutôt que dans une variable d'environnement — le
 *  même code tourne en local et en ligne, sur la même base. */
async function ownOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Lance une génération : ouvre le lot, téléverse les documents, range la
 *  première tâche et la lance. Rend la main aussitôt — la suite se fait sur le
 *  serveur, que l'onglet reste ouvert ou non.
 *
 *  Ce que l'écran décide (le contexte, les étapes, le total d'examen) voyage
 *  tel quel : ce sont des choix d'orchestration, pas des droits — le contrôle
 *  d'accès est fait ici, et chaque étape revérifie ce qui la concerne. */
export async function startWorkshopGeneration(
  workshopId: string,
  input: {
    fileIds: string[];
    context: 'parcours' | 'exam';
    withResource: boolean;
    needsProgram: boolean;
    visibleNotions: number;
    examTarget: number;
    hint: string;
    origin: string;
  },
): Promise<StartGenerationResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const { importId, dispatch } = await orchestrator.startGeneration(workshopId, ctx.userId, {
      fileIds: Array.isArray(input.fileIds) ? input.fileIds.filter((id) => typeof id === 'string') : [],
      context: input.context === 'exam' ? 'exam' : 'parcours',
      withResource: input.withResource === true,
      needsProgram: input.needsProgram === true,
      visibleNotions: Number.isFinite(input.visibleNotions) ? input.visibleNotions : 0,
      examTarget: Number.isFinite(input.examTarget) ? input.examTarget : 0,
      hint: typeof input.hint === 'string' ? input.hint.slice(0, 600) : '',
      origin: typeof input.origin === 'string' ? input.origin : null,
      baseUrl: await ownOrigin(),
    });
    await dispatchTasks(dispatch.baseUrl, dispatch.taskIds);
    return { ok: true, importId };
  } catch (error) {
    const detail = message(error);
    if (detail === BUSY_ERROR) return { ok: false, error: detail, reason: 'busy' };
    return { ok: false, error: detail };
  }
}

/** La génération en cours sur cet atelier, s'il y en a une : l'écran la
 *  retrouve quand on rouvre la fenêtre, au lieu de proposer d'en lancer une
 *  autre qui serait refusée. */
export async function getLiveGeneration(workshopId: string): Promise<string | null> {
  if (!(await requireManager(workshopId))) return null;
  return orchestrator.liveGenerationOf(workshopId);
}

/** Les imports encore annulables, du plus récent au plus ancien. Liste vide
 *  quand il n'y a rien à proposer : aucun import récent, ou lots déjà annulés,
 *  expirés, ou modifiés depuis.
 *
 *  Plusieurs et non plus un seul depuis le 28/08/2026 : voir `recentImportIds`. */
export async function getImportBanners(workshopId: string): Promise<ImportBanner[]> {
  if (!(await requireManager(workshopId))) return [];

  try {
    const [recent, live] = await Promise.all([
      imports.recentImportIds(workshopId),
      orchestrator.liveGenerationOf(workshopId),
    ]);
    // La génération en cours a toujours son bandeau, même avant d'avoir écrit
    // quoi que ce soit : c'est lui qui dit, à qui revient sur l'atelier, qu'elle
    // tourne encore.
    const ids = live && !recent.includes(live) ? [live, ...recent] : recent;
    // Les deux lectures sont indépendantes → en parallèle (règle N+1). Le
    // relevé des lots interrompus est une seule requête pour toute la liste,
    // pas une par lot.
    const [summaries, interrupted] = await Promise.all([
      Promise.all(
        ids.map(async (importId) => ({ importId, summary: await imports.getImportSummary(workshopId, importId) })),
      ),
      lock.interruptedAmong(ids),
    ]);

    return summaries
      .filter(({ importId, summary }) => summary.state === 'cancellable' || importId === live)
      .map(({ importId, summary }) => ({
        importId,
        state: summary.state,
        running: importId === live,
        interrupted: importId !== live && interrupted.has(importId),
        chapters: summary.chapters,
        notions: summary.notions,
        parcoursQuestions: summary.parcoursQuestions,
        examQuestions: summary.examQuestions,
      }));
  } catch {
    // Le bandeau est un confort : s'il échoue, il ne doit pas empêcher la page
    // de s'afficher.
    return [];
  }
}

export async function cancelWorkshopImport(
  workshopId: string,
  importId: string,
): Promise<{ ok: true; chapters: number; notions: number; questionGroups: number } | { ok: false; error: string }> {
  const ctx = await requireImportManager(workshopId, importId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    // Annuler, c'est en avoir fini avec ce lot : le verrou tombe, sans attendre
    // son expiration. Posé AVANT le reste — une annulation refusée (lot déjà
    // annulé, délai dépassé) ne laisse pas pour autant une génération en cours.
    await lock.closeImport(importId);
    // Une génération arrêtée par quelqu'un n'est pas une génération en panne :
    // les mélanger fausserait le taux d'échec dans les deux sens.
    await journal.markOutcome(importId, 'stopped');

    const result = await imports.cancelImport(workshopId, importId);
    if (!result.cancelled) {
      const reasons: Record<string, string> = {
        empty: 'Cet import a déjà été annulé',
        expired: 'Passé 24 h, un import ne peut plus être annulé',
        modified: 'Un élément de cet import a été modifié depuis : il ne peut plus être annulé d’un bloc',
      };
      return { ok: false, error: reasons[result.reason] ?? 'Annulation impossible' };
    }

    // Le lot est retiré : ses documents n'ont plus de raison d'être chez le
    // fournisseur (§16.8). APRÈS l'annulation, jamais avant — une annulation
    // refusée doit laisser l'import intact, documents compris. La ligne
    // `ai_imports` est conservée par `cancelImport`, les poignées sont donc
    // encore là. Un échec de suppression est journalisé, jamais remonté.
    await run.releaseImportDocuments(importId);

    revalidateWorkshop();
    return { ok: true, chapters: result.chapters, notions: result.notions, questionGroups: result.questionGroups };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
