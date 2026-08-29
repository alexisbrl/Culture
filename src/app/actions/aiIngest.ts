'use server';

import { requireManager } from '@/lib/authz';
import * as lock from '@/lib/ingest/lock';
import { BUSY_ERROR } from '@/lib/ingest/lock';
import * as run from '@/lib/ingest/run';
import { revalidateWorkshop } from '@/lib/revalidate';
import * as imports from '@/lib/workshops/imports';

// Logique métier : voir @/lib/ingest/run et @/lib/workshops/imports. Ces
// wrappers ne portent que l'authz Clerk et la revalidation Next.js. Types
// redéclarés localement (un fichier `'use server'` ne peut pas réexporter un
// type importé — piège Turbopack, cf. .claude/rules/server-architecture.md).
//
// ─── Droits ──────────────────────────────────────────────────────────────────
//
// Génération ET annulation : propriétaire OU gestionnaire (décision du
// 20/08/2026). Même niveau que la gestion des notions et des fichiers sources
// dont elles sont issues — celui qui peut écrire le programme à la main peut le
// faire écrire par l'IA, et le retirer.
//
// ─── Une action = une unité bornée ───────────────────────────────────────────
//
// Chaque fonction ci-dessous fait UN appel au modèle. C'est le client qui les
// enchaîne, ce qui évite d'avoir à tenir une fonction serveur ouverte pendant
// plusieurs minutes (§5.4 du plan). **Appeler dans l'ordre, et grouper par
// passe** : toutes les notions, puis toutes les questions — le cache de prompt
// est propre à chaque schéma de sortie, alterner le ferait manquer à chaque
// fois (§5.2).

export type PlanIssue = {
  kind: 'chapter' | 'notion' | 'assignment' | 'question';
  ref?: string;
  reason: string;
};

export type ChapterStructureResult =
  | {
      ok: true;
      chapters: { id: string; name: string }[];
      discarded: PlanIssue[];
      adjusted: PlanIssue[];
    }
  | { ok: false; error: string };

export type AssignPassResult =
  | {
      ok: true;
      assigned: number;
      /** Questions en sommeil récupérées plutôt que réécrites. */
      recycled: number;
      batches: number;
      discarded: PlanIssue[];
      adjusted: PlanIssue[];
    }
  | { ok: false; error: string };

export type PrepareIngestionResult =
  | { ok: true; importId: string; documents: number }
  /** `reason: 'busy'` = une génération tourne déjà sur cet atelier (voir
   *  @/lib/ingest/lock). L'écran a sa propre phrase pour ce cas-là : le message
   *  brut ne serait pas traduit. */
  | { ok: false; error: string; reason?: 'busy' };

export type NotionPassResult =
  | { ok: true; written: number; discarded: PlanIssue[]; adjusted: PlanIssue[]; documents: number }
  | { ok: false; error: string };

export type QuestionPassResult =
  | { ok: true; written: number; discarded: PlanIssue[]; adjusted: PlanIssue[]; batches: number }
  | { ok: false; error: string };

export type ImportBanner = {
  importId: string;
  state: 'cancellable' | 'empty' | 'expired' | 'modified';
  chapters: number;
  notions: number;
  /** Les questions du lot, séparées selon l'écran qui les montre : le bandeau
   *  du programme n'annonce pas les questions parties à l'examen, et
   *  réciproquement (28/08/2026). */
  parcoursQuestions: number;
  examQuestions: number;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Erreur inattendue';
}

/** Étape 0 — ouvre le lot et téléverse les documents chez le fournisseur.
 *
 *  Elle reste **séparée** du lancement, alors que l'estimation de coût qui l'avait
 *  justifiée a été retirée (22/08/2026) : c'est cette découpe qui garantit qu'un
 *  import ne téléverse jamais deux fois le même corpus. Les fichiers vivent
 *  ensuite chez le fournisseur sous leur identifiant, et chaque passe les cite
 *  au lieu de les renvoyer. */
export async function prepareWorkshopIngestion(
  workshopId: string,
  fileIds: string[],
  scope: Record<string, unknown> = {},
): Promise<PrepareIngestionResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };
  // Aucun fichier est un cas VALIDE depuis le 24/08/2026 : ajouter des questions
  // à une liste ne relit pas le cours, donc ne téléverse rien. C'est le dialogue
  // qui exige un document quand la génération en demande un.

  try {
    const { importId, documents } = await run.prepareIngestion(workshopId, ctx.userId, fileIds, { scope });
    return { ok: true, importId, documents };
  } catch (error) {
    const detail = message(error);
    if (detail === BUSY_ERROR) return { ok: false, error: detail, reason: 'busy' };
    return { ok: false, error: detail };
  }
}

/** Le signe de vie de l'onglet qui pilote une génération, toutes les 30 s.
 *
 *  C'est ce battement — et lui seul — qui empêche un second lancement sur le
 *  même atelier. S'il s'arrête (onglet fermé, machine éteinte), le verrou expire
 *  et l'atelier redevient disponible : voir @/lib/ingest/lock pour le pourquoi
 *  d'un verrou qui s'oublie de lui-même. */
export async function beatWorkshopImport(workshopId: string, importId: string): Promise<void> {
  if (!(await requireManager(workshopId))) return;
  await lock.beatImport(importId);
}

/** Referme un lot piloté : terminé, arrêté ou en erreur. Relâche le verrou tout
 *  de suite, au lieu d'attendre son expiration. */
export async function closeWorkshopImport(workshopId: string, importId: string): Promise<void> {
  if (!(await requireManager(workshopId))) return;
  await lock.closeImport(importId);
}

/** Passe 1 — les notions d'UN document.
 *
 *  Les notions naissent sans chapitre : à ce stade il n'en existe aucun. C'est
 *  la passe suivante qui les range (feuille de route « notions d'abord »). */
export async function ingestDocumentNotions(
  workshopId: string,
  importId: string,
  documentIndex: number,
): Promise<NotionPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestDocumentNotions(workshopId, ctx.userId, importId, documentIndex);
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Passe 2 — écrit les chapitres, et les SITUE dans le cours.
 *
 *  Elle ne range rien : ranger 500 notions dans une seule réponse dépasserait le
 *  plafond de sortie. Le rangement est une passe à part, découpée en lots. */
export async function ingestWorkshopChapters(
  workshopId: string,
  importId: string,
): Promise<ChapterStructureResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestChapters(workshopId, ctx.userId, importId);
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Passe 3 — le rangement d'UN LOT de notions.
 *
 *  Le nombre de lots n'est connu qu'ici : le client appelle l'indice 0, le lit
 *  dans la réponse, et rappelle pour les suivants. */
export async function ingestWorkshopAssignments(
  workshopId: string,
  importId: string,
  batchIndex = 0,
): Promise<AssignPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestAssignments(workshopId, ctx.userId, importId, batchIndex);
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** La fin de l'import : cacher les chapitres que l'import a vidés, effacer ce
 *  qu'il a créé et jamais rangé.
 *
 *  ⚠️ **Après le dernier lot de rangement, jamais avant** : à mi-parcours,
 *  toutes les notions sont encore sans chapitre et le ménage les emporterait
 *  toutes. Ne renvoie pas d'erreur — c'est du ménage, il ne doit pas faire
 *  échouer un import réussi. */
export async function finishWorkshopIngestion(
  workshopId: string,
  importId: string,
): Promise<{ hidden: number; removed: number }> {
  if (!(await requireManager(workshopId))) return { hidden: 0, removed: 0 };

  const result = await run.finishIngestion(workshopId, importId);
  revalidateWorkshop();
  return {
    hidden: result.hidden.length,
    removed: result.removedChapters + result.removedNotions,
  };
}

/** Passe 4a — les questions d'ENTRAÎNEMENT d'un lot de notions d'un chapitre.
 *
 *  Le nombre de lots (`batches`) n'est connu qu'ici : le client appelle l'indice
 *  0, le lit dans la réponse, et rappelle pour les suivants. `batches: 0` veut
 *  dire qu'il n'y avait rien à écrire — chapitre sans notion, ou notions déjà
 *  pourvues de leur stock. */
export async function ingestParcoursQuestions(
  workshopId: string,
  importId: string,
  chapter: { id: string; name: string },
  batchIndex = 0,
  /** Part du plafond de questions réservée à CET appel. Indispensable dès que
   *  le client lance plusieurs lots en parallèle : sans elle, chacun croirait
   *  disposer du plafond entier (voir `run.ingestParcoursQuestions`). */
  budgetShare?: number,
): Promise<QuestionPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestParcoursQuestions(workshopId, ctx.userId, importId, chapter, batchIndex, { budgetShare });
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Passe 4b — les questions d'EXAMEN d'une tranche du programme.
 *
 *  Rien de commun avec la précédente sinon le format de sortie : elle ne compte
 *  pas par notion mais rend un nombre total de questions pour tout le programme,
 *  chacune croisant plusieurs notions (§ examen, 24/08/2026). Le nombre de
 *  tranches se lit dans la réponse du premier appel, comme partout ailleurs. */
export async function ingestWorkshopExamQuestions(
  workshopId: string,
  importId: string,
  sliceIndex = 0,
  budgetShare?: number,
  /** Remplace le nombre de questions demandé au lancement. Sert au RATTRAPAGE :
   *  quand des questions ont été écartées, on redemande le manque et rien de
   *  plus — sans quoi un examen de 40 en rendrait 34 sans le dire. */
  target?: number,
): Promise<QuestionPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestExamQuestions(workshopId, ctx.userId, importId, sliceIndex, { budgetShare, target });
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Rend les documents au fournisseur, une fois qu'aucune passe n'en a plus
 *  besoin — c'est-à-dire dès la fin de la passe notions (T3 : la passe questions
 *  ne les reçoit plus).
 *
 *  Rien ne s'efface tout seul chez le fournisseur (§16.8), et un ménage raté ne
 *  doit jamais faire échouer l'import : cette action ne renvoie donc pas
 *  d'erreur, juste ce qui s'est passé. */
export async function releaseWorkshopImportFiles(
  workshopId: string,
  importId: string,
): Promise<{ released: boolean }> {
  if (!(await requireManager(workshopId))) return { released: false };
  return { released: await run.releaseImportDocuments(importId) };
}

/** Les imports encore annulables, du plus récent au plus ancien. Liste vide
 *  quand il n'y a rien à proposer : aucun import récent, ou lots déjà annulés,
 *  expirés, ou modifiés depuis.
 *
 *  Plusieurs et non plus un seul depuis le 28/08/2026 : voir `recentImportIds`. */
export async function getImportBanners(workshopId: string): Promise<ImportBanner[]> {
  if (!(await requireManager(workshopId))) return [];

  try {
    const ids = await imports.recentImportIds(workshopId);
    const summaries = await Promise.all(
      ids.map(async (importId) => ({ importId, summary: await imports.getImportSummary(workshopId, importId) })),
    );

    return summaries
      .filter(({ summary }) => summary.state === 'cancellable')
      .map(({ importId, summary }) => ({
        importId,
        state: summary.state,
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
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    // Annuler, c'est en avoir fini avec ce lot : le verrou tombe, sans attendre
    // son expiration. Posé AVANT le reste — une annulation refusée (lot déjà
    // annulé, délai dépassé) ne laisse pas pour autant une génération en cours.
    await lock.closeImport(importId);

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
