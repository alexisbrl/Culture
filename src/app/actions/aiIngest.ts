'use server';

import { requireManager } from '@/lib/authz';
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
  | { ok: false; error: string };

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
  questions: number;
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
  if (fileIds.length === 0) return { ok: false, error: 'Aucun fichier sélectionné' };

  try {
    const { importId, documents } = await run.prepareIngestion(workshopId, ctx.userId, fileIds, { scope });
    return { ok: true, importId, documents };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
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

/** Passe 4 — les questions d'UN LOT de notions d'un chapitre. Le contexte vient
 *  du bouton par lequel l'utilisateur est entré, jamais du modèle.
 *
 *  Le nombre de lots (`batches`) n'est connu qu'ici : le client appelle l'indice
 *  0, le lit dans la réponse, et rappelle pour les suivants. */
export async function ingestChapterQuestions(
  workshopId: string,
  importId: string,
  chapter: { id: string; name: string },
  context: 'parcours' | 'exam',
  batchIndex = 0,
  /** Part du plafond de questions réservée à CET appel. Indispensable dès que
   *  le client lance plusieurs lots en parallèle : sans elle, chacun croirait
   *  disposer du plafond entier (voir `run.ingestChapterQuestions`). */
  budgetShare?: number,
): Promise<QuestionPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestChapterQuestions(workshopId, ctx.userId, importId, chapter, context, batchIndex, { budgetShare });
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

/** Ce qu'il faut pour afficher — ou non — le bandeau d'annulation. Renvoie
 *  `null` quand il n'y a rien à proposer : aucun import, ou lot déjà annulé,
 *  expiré, ou modifié depuis. */
export async function getImportBanner(workshopId: string): Promise<ImportBanner | null> {
  if (!(await requireManager(workshopId))) return null;

  try {
    const importId = await imports.latestImportId(workshopId);
    if (!importId) return null;

    const summary = await imports.getImportSummary(workshopId, importId);
    if (summary.state !== 'cancellable') return null;

    return {
      importId,
      state: summary.state,
      chapters: summary.chapters,
      notions: summary.notions,
      questions: summary.questions,
    };
  } catch {
    // Le bandeau est un confort : s'il échoue, il ne doit pas empêcher la page
    // de s'afficher.
    return null;
  }
}

export async function cancelWorkshopImport(
  workshopId: string,
  importId: string,
): Promise<{ ok: true; chapters: number; notions: number; questionGroups: number } | { ok: false; error: string }> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
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
