'use server';

import { requireManager } from '@/lib/authz';
// ⚠️ TEMPORAIRE — phase de test : ces deux imports partent avec l'estimation.
import { estimateIngestionCost } from '@/lib/ingest/cost';
import { PASS_MODELS } from '@/lib/ingest/providers/claude';
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

export type PlanIssue = { kind: 'chapter' | 'notion' | 'question'; ref?: string; reason: string };

export type StartIngestionResult =
  | { ok: true; chapters: { id: string; name: string }[]; discarded: PlanIssue[]; adjusted: PlanIssue[] }
  | { ok: false; error: string };

/** ⚠️ TEMPORAIRE — phase de test (voir `src/lib/ingest/cost.ts`). */
export type PrepareIngestionResult =
  | { ok: true; importId: string; corpusTokens: number | null; estimatedUsd: number | null }
  | { ok: false; error: string };

export type ChapterPassResult =
  | { ok: true; written: number; discarded: PlanIssue[]; adjusted: PlanIssue[] }
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

/** Étape 0 — ouvre le lot, téléverse les documents, et **annonce le coût**.
 *
 *  ⚠️ **TEMPORAIRE — phase de test.** L'estimation existe parce qu'un import
 *  réel a coûté ~20 $ sans produire une question (§16.15) ; elle disparaîtra
 *  avec `src/lib/ingest/cost.ts`. Le téléversement, lui, reste : c'est la
 *  découpe qui rend l'estimation possible sans téléverser deux fois. */
export async function prepareWorkshopIngestion(
  workshopId: string,
  fileIds: string[],
  scope: Record<string, unknown> = {},
): Promise<PrepareIngestionResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };
  if (fileIds.length === 0) return { ok: false, error: 'Aucun fichier sélectionné' };

  try {
    const { importId, corpusTokens } = await run.prepareIngestion(workshopId, ctx.userId, fileIds, { scope });
    const estimatedUsd =
      corpusTokens === null
        ? null
        : estimateIngestionCost({
            corpusTokens,
            models: PASS_MODELS,
            withNotions: scope.notions !== false,
            withQuestions: scope.questions !== false,
          }).usd;
    return { ok: true, importId, corpusTokens, estimatedUsd };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Passe 1 — écrit les chapitres, à partir du lot déjà préparé. */
export async function startWorkshopIngestion(
  workshopId: string,
  importId: string,
): Promise<StartIngestionResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.startIngestion(workshopId, ctx.userId, importId);
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Passe 2 — les notions d'un chapitre. */
export async function ingestChapterNotions(
  workshopId: string,
  importId: string,
  chapter: { id: string; name: string },
  /** Nombre de chapitres de l'import — sert uniquement à décider si le marqueur
   *  de cache est rentable (§16.17), jamais au contenu produit. */
  plannedCalls = 1,
): Promise<ChapterPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestChapterNotions(workshopId, ctx.userId, importId, chapter, plannedCalls);
    revalidateWorkshop();
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/** Passe 3 — les questions d'UN LOT de notions d'un chapitre. Le contexte vient
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
): Promise<QuestionPassResult> {
  const ctx = await requireManager(workshopId);
  if (!ctx) return { ok: false, error: 'Droits insuffisants' };

  try {
    const result = await run.ingestChapterQuestions(workshopId, ctx.userId, importId, chapter, context, batchIndex);
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
