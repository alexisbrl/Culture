// L'orchestration : enchaîner les passes, une **unité bornée** à la fois.
//
// ─── Pourquoi trois fonctions et non une ─────────────────────────────────────
//
// Une ingestion complète, c'est 1 + N + N appels au modèle, soit plusieurs
// minutes. Aucune fonction serveur ne tient ça. Plutôt que de rallonger le
// délai, on rend la question sans objet (§5.4) : chaque fonction ci-dessous
// fait **un seul appel au modèle et écrit sa part**, et c'est le client qui
// enchaîne. La barre de progression est gratuite, et un chapitre en échec se
// rejoue seul.
//
// ─── L'ordre d'appel n'est pas libre ─────────────────────────────────────────
//
//   ingestDocumentNotions(×D) → pour chaque DOCUMENT, écrit ses NOTIONS
//   ingestChapters            → écrit les CHAPITRES et Y RANGE les notions
//   ingestChapterQuestions(×M)→ pour chaque LOT DE NOTIONS, écrit ses QUESTIONS
//
// ⚠️ **Les deux premières ont été inversées le 23/08/2026** (feuille de route
// docs/chantiers/2026-08-23-notions-dabord.md). Les notions sont le cœur d'un
// atelier, les chapitres ne sont que des boîtes : décider les boîtes en premier
// rendait toute mise à jour impossible, le modèle ne pouvant pas reconnaître un
// chapitre existant sous un découpage redécoupé.
//
// L'unité de la passe 3 est le **lot de ~10 notions**, pas le chapitre : à la
// volumétrie cible, un chapitre entier dépasserait `MAX_TOKENS` et la réponse
// serait tronquée, donc perdue (§16.2). Le nombre de lots n'étant connu qu'une
// fois les notions écrites, chaque appel le renvoie (`batches`) et le client
// boucle jusque-là.
//
// **Grouper les appels par passe**, comme ci-dessus, et non chapitre par
// chapitre : le cache de prompt est propre à chaque schéma de sortie (mesuré le
// 20/08/2026, §5.2), donc alterner notions/questions le ferait manquer à chaque
// fois. Sur douze chapitres, c'est la différence entre ~3 $ et ~11 $.
//
// ─── Ce qui circule entre les appels ─────────────────────────────────────────
//
// Rien, ou presque : l'état vit en base. `ai_imports.file_ids` porte les
// poignées de documents déjà remises au fournisseur — sans quoi chaque appel
// re-téléverserait le cours entier —, et les chapitres écrits portent déjà leur
// identifiant réel, qui sert de référence aux passes suivantes.

import { readObject } from '@/lib/storage';
import { getSupabaseServerClient } from '@/lib/supabase';

import {
  addImportUsage,
  applyAssignments,
  createImport,
  insertChapters,
  insertGroups,
  insertNotions,
  loadExistingRefs,
} from './ingest';
import { dropNearDuplicates, findExistingMatch } from './duplicates';
import { batchNotions, withChapterRetry } from './passInput';
import { parsePlan, type PlanIssue } from './planSchema';
import { releaseDocuments } from './release';
import { MAX_QUESTIONS_PER_IMPORT, type ExistingContent } from './prompt';
import { createClaudeProvider, type ModelId } from './providers/claude';
import { createDeepSeekProvider } from './providers/deepseek';
import type { PlanProvider, PreparedDocument } from './providers/types';

export type IngestContext = 'parcours' | 'exam';

export type PrepareResult = {
  importId: string;
  /** Nombre de documents du lot — le client sait ainsi combien d'appels la
   *  passe notions demande, sans avoir à relire la base. */
  documents: number;
  /** Taille du corpus en tokens, `null` si le fournisseur n'a pas su compter. */
  corpusTokens: number | null;
};

export type ChapterStructureResult = {
  chapters: { id: string; name: string }[];
  /** Combien de notions ont été rangées. */
  assigned: number;
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type ChapterPassResult = {
  written: number;
  discarded: PlanIssue[];
  adjusted: PlanIssue[];
};

export type NotionPassResult = ChapterPassResult & {
  /** Nombre total de documents de ce lot — le client boucle jusque-là. Rendu
   *  par chaque appel plutôt que supposé : lui seul relit la base. */
  documents: number;
};

export type QuestionPassResult = ChapterPassResult & {
  /** Nombre total de lots de notions pour ce chapitre. Le client rappelle
   *  l'action pour les indices 1..batches-1. `0` = chapitre sans notion. */
  batches: number;
};

// ─── Trois chargeurs, un par passe ───────────────────────────────────────────
//
// Il n'y en avait qu'un, qui lisait l'atelier entier pour les trois passes. Ce
// n'était pas seulement du gaspillage de requête : tout ce qu'il rapportait
// partait au modèle, facturé plein tarif, à chaque appel (§16.3). Chaque
// chargeur ci-dessous est donc **borné par un filtre**, et rend un
// `ExistingContent` volontairement partiel — la portée du bloc (`ExistingScope`)
// jetterait de toute façon le reste.

const EMPTY: ExistingContent = { chapters: [], notions: [], questions: [] };

/** Passe 1 — les chapitres existants. Seul chargeur sans filtre plus étroit que
 *  l'atelier : la passe raisonne justement sur l'ensemble du programme. */
async function loadExistingChapters(workshopId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('workshop_chapters')
    .select('id, name')
    .eq('workshop_id', workshopId)
    .order('position');
  if (error) throw new Error(error.message);

  return { ...EMPTY, chapters: (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })) };
}

/** TOUTES les notions de l'atelier — servent à deux passes, pour deux raisons.
 *
 *  • Passe notions : ne pas recréer ce qui existe déjà. Le filtre par chapitre
 *    d'avant l'inversion n'a plus de sens — la passe travaille document par
 *    document, elle n'a aucun chapitre de référence, et une notion peut très
 *    bien exister ailleurs dans l'atelier.
 *  • Passe chapitres : c'est la liste de ce qu'elle range. Son entrée
 *    principale, pas un supplément.
 *
 *  L'ordre est **stable** (création puis identifiant) : sans ça, deux appels
 *  successifs verraient la même liste dans deux ordres, ce qui suffit à faire
 *  varier une réponse et à faire manquer un cache. */
async function loadAllNotions(workshopId: string): Promise<ExistingContent> {
  const supabase = getSupabaseServerClient();
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data, error } = await supabase
    .from('workshop_bricks')
    .select('id, title, chapter_id')
    .eq('workshop_id', workshopId)
    .order('created_at')
    .order('id');
  if (error) throw new Error(error.message);

  return {
    ...EMPTY,
    notions: (data ?? []).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      chapterId: (n.chapter_id as string | null) ?? null,
    })),
  };
}

/** Passe 3 — les énoncés portant sur **les seules notions traitées**. On part de
 *  la table de liens, pas des questions : c'est elle qui porte le filtre. */
async function loadNotionQuestions(notionIds: string[]): Promise<ExistingContent> {
  if (notionIds.length === 0) return EMPTY;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('exam_question_item_bricks')
    .select('item_id, brick_id, exam_question_items!inner(content)')
    .in('brick_id', notionIds);
  if (error) throw new Error(error.message);

  // Une question reliée à deux des notions demandées ne doit apparaître qu'une
  // fois : on regroupe par question, pas par lien.
  const byItem = new Map<string, { content: string; notionIds: string[] }>();
  for (const row of data ?? []) {
    const itemId = row.item_id as string;
    const item = row.exam_question_items as unknown as { content: string } | null;
    const entry = byItem.get(itemId) ?? { content: item?.content ?? '', notionIds: [] };
    entry.notionIds.push(row.brick_id as string);
    byItem.set(itemId, entry);
  }

  return { ...EMPTY, questions: [...byItem.values()] };
}

/** Les documents déjà remis au fournisseur pour ce lot. Les poignées sont
 *  conservées dans `ai_imports.file_ids` précisément pour que les 24 appels
 *  suivants ne re-téléversent rien. */
async function preparedOf(importId: string): Promise<PreparedDocument[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('file_ids').eq('id', importId).single();
  if (error || !data) throw new Error(error?.message ?? 'import introuvable');
  return (data.file_ids as PreparedDocument[]) ?? [];
}

/** La taille du corpus mesurée à la préparation. Elle décide du modèle (§16.20)
 *  et vit dans `ai_imports.scope`, du jsonb libre — aucune colonne à ajouter. */
async function corpusTokensOf(importId: string): Promise<number | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  if (error || !data) return null;
  const value = (data.scope as { corpusTokens?: unknown } | null)?.corpusTokens;
  return typeof value === 'number' ? value : null;
}

/** Les modèles dont la fenêtre s'est révélée trop petite pour CE corpus.
 *
 *  Un refus coûte un aller-retour ; le mémoriser fait qu'on ne le paie qu'une
 *  fois pour tout le lot. C'est nécessaire parce que **chaque appel est une
 *  server action distincte** — la passe notions en fait une par chapitre — donc
 *  un fournisseur neuf à chaque fois, sans mémoire de ce que le précédent a
 *  appris. Vit dans `ai_imports.scope`, du jsonb libre : aucune migration.
 *
 *  On enregistre le MODÈLE écarté, pas un booléen « corpus trop gros » : trop
 *  gros pour qui ? La fenêtre est une propriété du modèle, et le jour où
 *  `PASS_MODELS` change, un booléen mentirait tandis que cette liste reste vraie. */
/** La consigne libre de l'utilisateur, saisie au lancement et rangée dans le
 *  `scope` de l'import — donc relue par CHAQUE passe, y compris celles qui
 *  s'exécutent dans des server actions ultérieures. */
async function userHintOf(importId: string): Promise<string | undefined> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  if (error || !data) return undefined;
  const value = (data.scope as { hint?: unknown } | null)?.hint;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Le fournisseur choisi au lancement pour la passe QUESTIONS.
 *
 *  Seule cette passe est concernée : elle ne reçoit aucun document, donc rien
 *  n'y dépend de la lecture des PDF, que DeepSeek ne sait pas faire (voir
 *  `providers/deepseek.ts`). Les passes chapitres et notions restent sur Claude
 *  quoi qu'il arrive — le choix ne leur est même pas proposé.
 *
 *  Repli sur Claude à la moindre valeur inattendue : une chaîne inconnue rangée
 *  dans le `scope` ne doit pas faire échouer un import. */
async function questionsProviderOf(importId: string): Promise<'claude' | 'deepseek'> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  return (data?.scope as { questionsProvider?: unknown } | null)?.questionsProvider === 'deepseek'
    ? 'deepseek'
    : 'claude';
}

async function oversizeModelsOf(importId: string): Promise<ModelId[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  if (error || !data) return [];
  const value = (data.scope as { oversizeModels?: unknown } | null)?.oversizeModels;
  return Array.isArray(value) ? value.filter((m): m is ModelId => typeof m === 'string') : [];
}

/** Ajoute un modèle à cette liste, sans écraser le reste du `scope`.
 *
 *  Lecture-modification-écriture : deux appels concurrents pourraient se
 *  chevaucher, mais le client enchaîne les passes une par une, et le pire cas
 *  (une écriture perdue) ne coûte qu'un aller-retour de plus. */
async function recordOversizeModel(importId: string, model: ModelId): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('ai_imports').select('scope').eq('id', importId).single();
  const scope = (data?.scope as Record<string, unknown> | null) ?? {};
  const current = Array.isArray(scope.oversizeModels) ? (scope.oversizeModels as string[]) : [];
  if (current.includes(model)) return;
  await supabase
    .from('ai_imports')
    .update({ scope: { ...scope, oversizeModels: [...current, model] } })
    .eq('id', importId);
}

/** `parsePlan`, mais qui **dit ce qu'il jette**.
 *
 *  Les rejets étaient jusqu'ici renvoyés au client et nulle part ailleurs : une
 *  passe qui écarte tout produisait « 0 question » sans laisser la moindre trace
 *  côté serveur, donc rien à examiner après coup (constaté le 22/08/2026 sur un
 *  import qui a rendu 4 chapitres, 76 notions et zéro question). Le motif exact
 *  existe pourtant — `planSchema` le formule — il ne sortait simplement pas.
 *
 *  On journalise les cinq premiers : assez pour reconnaître un motif répété,
 *  pas assez pour noyer la sortie sur un plan entièrement invalide. */
function parsePlanLogged(pass: string, raw: unknown, refs: Parameters<typeof parsePlan>[1]) {
  const plan = parsePlan(raw, refs);
  if (plan.discarded.length > 0) {
    const apercu = plan.discarded.slice(0, 5).map((i) => `${i.kind}${i.ref ? ` (${i.ref})` : ''} : ${i.reason}`);
    console.warn(`[ingest] passe ${pass} : ${plan.discarded.length} élément(s) écarté(s) — ${apercu.join(' | ')}`);
  }
  if (plan.adjusted.length > 0) {
    console.info(`[ingest] passe ${pass} : ${plan.adjusted.length} élément(s) corrigé(s)`);
  }
  return plan;
}

/** Combien de questions ce lot a-t-il déjà produites ? Le plafond porte sur
 *  l'import entier, pas sur un chapitre (§9). */
async function questionsWritten(importId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('exam_questions').select('id').eq('import_id', importId);
  if (error) throw new Error(error.message);
  const groupIds = (data ?? []).map((r) => r.id as string);
  if (groupIds.length === 0) return 0;

  const { count, error: countError } = await supabase
    .from('exam_question_items')
    .select('id', { count: 'exact', head: true })
    .in('group_id', groupIds);
  if (countError) throw new Error(countError.message);
  return count ?? 0;
}

/** Ouvre le lot : téléverse les documents **une fois pour toutes**, compte le
 *  corpus, et s'arrête là.
 *
 *  ⚠️ **L'ordre compte, et c'est le piège de cette découpe.** Pour estimer avant
 *  de lancer, les documents doivent déjà être chez le fournisseur — un
 *  téléversement est gratuit, un appel au modèle ne l'est pas. D'où deux
 *  fonctions au lieu d'une : celle-ci prépare et mesure, `startIngestion`
 *  **réutilise** les poignées. On ne téléverse jamais deux fois.
 *
 *  Le comptage est ⚠️ TEMPORAIRE — phase de test (voir `cost.ts`) ; le reste,
 *  non : le téléversement et la création du lot ont toujours eu lieu ici. */
export async function prepareIngestion(
  workshopId: string,
  actorId: string,
  fileIds: string[],
  options: { provider?: PlanProvider; scope?: Record<string, unknown> } = {},
): Promise<PrepareResult> {
  const provider = options.provider ?? createClaudeProvider();
  const supabase = getSupabaseServerClient();

  const { data: files, error } = await supabase
    .from('workshop_files')
    .select('id, name, mime_type, storage_path')
    .eq('workshop_id', workshopId)
    .in('id', fileIds);
  if (error) throw new Error(error.message);
  if (!files || files.length === 0) throw new Error('Aucun fichier exploitable pour la génération');

  const documents = await Promise.all(
    files.map(async (f) => {
      const bytes = await readObject(f.storage_path as string);
      if (!bytes) throw new Error(`Fichier illisible : ${f.name}`);
      return {
        key: f.storage_path as string,
        fileName: f.name as string,
        mimeType: f.mime_type as string,
        bytes,
      };
    }),
  );

  const prepared = await provider.prepare(documents);
  const corpusTokens = await provider.countCorpus(prepared);

  // Les poignées sont enregistrées AVANT le premier appel au modèle : si celui-ci
  // échoue, on ne perd pas le téléversement. La taille du corpus voyage dans
  // `scope` — c'est du jsonb libre, aucune migration nécessaire — parce que la
  // passe chapitres en a besoin pour choisir son modèle (§16.20).
  const importId = await createImport(workshopId, actorId, {
    scope: { ...(options.scope ?? {}), corpusTokens },
    fileIds: prepared as unknown as string[],
  });

  return { importId, documents: prepared.length, corpusTokens };
}

/** Passe 2 — écrit les CHAPITRES **et y range les notions**.
 *
 *  Anciennement `startIngestion`, et anciennement première : depuis le
 *  23/08/2026 elle passe après l'extraction des notions (feuille de route
 *  « notions d'abord », §3). Ce n'est pas un détail d'ordonnancement — c'est ce
 *  qui rend une mise à jour possible. Au niveau du chapitre, le modèle ne peut
 *  pas reconnaître qu'un « athlétisme 1950-2000 » et un « athlétisme 1940-1990 »
 *  sont la même boîte redécoupée, et il en créerait quatre.
 *
 *  Un seul appel, et il porte les documents : sans le cours, le modèle invente
 *  des intitulés au lieu de reprendre ceux du document, et ne sait pas d'où
 *  viennent les notions qu'on lui demande de répartir.
 *
 *  C'est aussi le seul moment du pipeline qui voit **toutes** les notions d'un
 *  coup — donc le seul où les redites entre deux documents peuvent se repérer.
 *  La réponse reste dans le contrat : on en range une, l'autre reste sans
 *  chapitre, et le ménage de fin d'import s'en occupe si personne ne l'a créée
 *  avant cet import. */
export async function ingestChapters(
  workshopId: string,
  actorId: string,
  importId: string,
  options: { provider?: PlanProvider } = {},
): Promise<ChapterStructureResult> {
  const [corpusTokens, oversizeModels, userHint] = await Promise.all([
    corpusTokensOf(importId), oversizeModelsOf(importId), userHintOf(importId),
  ]);
  const provider = options.provider ?? createClaudeProvider({
    corpusTokens: corpusTokens ?? undefined,
    oversizeModels,
    userHint,
    onOversize: (model) => recordOversizeModel(importId, model),
  });
  const prepared = await preparedOf(importId);

  const [chaptersOnly, notionsOnly, refs] = await Promise.all([
    loadExistingChapters(workshopId),
    loadAllNotions(workshopId),
    loadExistingRefs(workshopId),
  ]);
  const existing: ExistingContent = { ...chaptersOnly, notions: notionsOnly.notions };
  const toArrange = notionsOnly.notions.map((n) => ({ id: n.id, title: n.title }));

  // Un découpage trop fin est le multiplicateur de tout ce qui suit (§16.15) :
  // au-delà du seuil, on relance UNE fois — une VÉRIFICATION, pas une
  // correction imposée. Si la seconde réponse dépasse encore, on écrit ce
  // qu'elle donne : jamais de blocage, jamais de troisième appel, et surtout
  // aucune validation humaine (§16.18).
  const { result: plan } = await withChapterRetry(
    async (retry) => {
      const attempt = await provider.documentToPlan(prepared, existing, {
        pass: 'chapters',
        notions: toArrange,
        retry,
      });
      // Les deux essais sont facturés : les deux sont comptés.
      await addImportUsage(importId, attempt.usage);
      return parsePlanLogged('chapitres', attempt.plan, refs);
    },
    (parsed) => parsed.chapters.length,
    (parsed) => parsed.chapters.map((c) => c.name),
  );

  // ⚠️ **Un chapitre proposé en double est REDIRIGÉ, jamais écarté.**
  //
  // `insertChapters` écrivait tout ce que le modèle rendait, sans rien comparer
  // à l'existant : la consigne était le seul rempart (fragilité repérée le
  // 22/08/2026). Le même outil de ressemblance que pour les notions ferme le
  // trou — mais la conduite à tenir n'est pas la même. Écarter une notion en
  // double ne coûte rien, rien n'en dépend encore ; écarter un CHAPITRE
  // orphelinerait toutes les notions qu'on venait de lui affecter. On ne le crée
  // donc pas, et sa référence pointe vers le chapitre existant : les
  // affectations atterrissent au bon endroit sans le savoir.
  const reused = new Map<string, string>();
  const fresh = plan.chapters.filter((c) => {
    const found = findExistingMatch(c.name, chaptersOnly.chapters, (ch) => ch.name);
    if (!found) return true;
    reused.set(c.ref, found.match.id);
    // Jamais silencieux : l'utilisateur doit pouvoir constater la fusion.
    plan.adjusted.push({
      kind: 'chapter',
      ref: c.ref,
      reason: `chapitre déjà présent (« ${found.match.name} ») — notions rangées dedans plutôt que dans un doublon`,
    });
    return false;
  });

  const created = new Map([...(await insertChapters(workshopId, actorId, importId, fresh)), ...reused]);

  // ⚠️ Les affectations sont appliquées APRÈS l'insertion : elles désignent les
  // chapitres par leur référence locale (`ch1`), qui n'a d'identifiant réel
  // qu'une fois la ligne écrite. `created` fait la traduction ; une référence
  // qui n'y figure pas est déjà un identifiant existant, et passe telle quelle.
  const assigned = await applyAssignments(workshopId, plan.assignments, created);

  return {
    // Seuls les chapitres RÉELLEMENT créés sont comptés : un doublon redirigé
    // vers un chapitre existant n'est pas une création, et l'annoncer comme
    // telle ferait croire à un programme qui a doublé de taille.
    chapters: fresh.map((c) => ({ id: created.get(c.ref) ?? c.ref, name: c.name })),
    assigned,
    discarded: plan.discarded,
    adjusted: plan.adjusted,
  };
}

/** Rend au fournisseur les documents d'un lot. Appelée à **deux** moments : à
 *  l'annulation d'un import, et en fin d'import réussi — une fois la passe
 *  notions terminée, plus aucune passe n'a besoin des documents (conséquence
 *  directe de T3). Ne lève jamais. */
export async function releaseImportDocuments(
  importId: string,
  options: { provider?: PlanProvider } = {},
): Promise<boolean> {
  try {
    const prepared = await preparedOf(importId);
    const provider = options.provider ?? createClaudeProvider();
    return await releaseDocuments(provider, prepared);
  } catch (error) {
    // Même un import introuvable ou une clé API manquante ne doit pas remonter :
    // on ne fait ici que du ménage.
    console.warn('[ingest] documents non rendus :', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Passe 1, pour UN document. Les notions naissent **sans chapitre** : à ce
 *  stade il n'en existe aucun, et c'est la passe suivante qui les range.
 *
 *  Le document est l'unité de travail parce qu'elle ne demande aucun jugement au
 *  modèle, qu'elle est stable d'un import à l'autre, et qu'elle parallélise sans
 *  amorçage — il n'y a plus de cache à amorcer, chaque appel ne portant que son
 *  propre document.
 *
 *  ⚠️ Limite connue et acceptée : un document unique et énorme retombe sur un
 *  seul appel. À traiter le jour où le cas se présente, pas avant. */
export async function ingestDocumentNotions(
  workshopId: string,
  actorId: string,
  importId: string,
  documentIndex: number,
  options: { provider?: PlanProvider } = {},
): Promise<NotionPassResult> {
  // Ni `corpusTokens` ni `oversizeModels` ici, et c'est délibéré : cet appel ne
  // porte qu'UN document, pas le corpus. Hériter du refus mesuré sur l'ensemble
  // ferait basculer sur un modèle plus cher une charge qui tient largement dans
  // la fenêtre du modèle économique. Un document réellement trop gros sera
  // refusé pour ce qu'il est, à son propre appel.
  const userHint = await userHintOf(importId);
  const provider = options.provider ?? createClaudeProvider({ userHint });

  const prepared = await preparedOf(importId);
  const document = prepared[documentIndex];
  if (!document) {
    return { written: 0, discarded: [], adjusted: [], documents: prepared.length };
  }

  // TOUTES les notions de l'atelier, pas celles d'un chapitre : c'est le
  // mécanisme anti-doublon, et c'est le point critique du dispositif. Un modèle
  // qui recrée sous d'autres mots ce qui existe déjà fait gonfler l'atelier à
  // chaque import.
  const existing = await loadAllNotions(workshopId);
  const result = await provider.documentToPlan(prepared, existing, {
    pass: 'notions',
    document: { index: documentIndex, fileName: document.fileName },
  });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlanLogged('notions', result.plan, refs);

  // ⚠️ **Le filet anti-doublon, et il se relit ICI, pas plus haut.** L'existant
  // transmis au modèle a été lu AVANT l'appel ; entre-temps, les autres
  // documents du même import ont pu écrire leurs propres notions — ils tournent
  // en parallèle et ne se voient pas. Une relecture juste avant l'écriture est
  // le seul moment où le recouvrement entre documents est visible.
  //
  // La consigne ne suffit pas : mesuré sur un import réel, le modèle laisse
  // passer les redites qui réordonnent les mêmes faits (voir `duplicates.ts`).
  const before = await loadAllNotions(workshopId);
  const { kept, dropped } = dropNearDuplicates(
    plan.notions,
    before.notions.map((n) => n.title),
    (n) => n.title,
  );

  // `new Map()` : aucun chapitre à résoudre, et le schéma n'en propose plus.
  const created = await insertNotions(workshopId, actorId, importId, kept, new Map());

  return {
    written: created.size,
    // Les redites rejoignent le journal des écartés : l'utilisateur voit
    // combien, et laquelle faisait doublon. Jamais un filtrage silencieux.
    discarded: [
      ...plan.discarded,
      ...dropped.map((d) => ({
        kind: 'notion' as const,
        ref: d.candidate.ref,
        reason: `redit une notion existante (« ${d.matched.slice(0, 80)}… »)`,
      })),
    ],
    adjusted: plan.adjusted,
    documents: prepared.length,
  };
}

/** Passe 3, pour UN LOT de notions d'un chapitre. Les notions du lot lui sont
 *  fournies avec leurs identifiants réels : chaque question naît donc reliée,
 *  sans qu'on ait à l'imposer par une règle. */
export async function ingestChapterQuestions(
  workshopId: string,
  actorId: string,
  importId: string,
  chapter: { id: string; name: string },
  context: IngestContext,
  batchIndex = 0,
  options: { provider?: PlanProvider; budgetShare?: number } = {},
): Promise<QuestionPassResult> {
  const [userHint, choice] = await Promise.all([userHintOf(importId), questionsProviderOf(importId)]);
  const provider = options.provider
    ?? (choice === 'deepseek' ? createDeepSeekProvider({ userHint }) : createClaudeProvider({ userHint }));
  const supabase = getSupabaseServerClient();

  // L'ordre doit être **stable d'un appel à l'autre** : le client rappelle cette
  // action une fois par lot, et un ordre flottant ferait se recouvrir deux lots.
  const { data: notionRows, error } = await supabase
    .from('workshop_bricks')
    .select('id, title')
    .eq('workshop_id', workshopId)
    .eq('chapter_id', chapter.id)
    .order('created_at')
    .order('id');
  if (error) throw new Error(error.message);

  const all = (notionRows ?? []).map((n) => ({ id: n.id as string, title: n.title as string }));
  // Un chapitre sans notion ne produit rien : une question sans notion ne serait
  // tirée par aucun exercice (§11).
  if (all.length === 0) return { written: 0, discarded: [], adjusted: [], batches: 0 };

  const batches = batchNotions(all);
  const notions = batches[batchIndex];
  if (!notions) return { written: 0, discarded: [], adjusted: [], batches: batches.length };

  // ⚠️ **Le plafond ne tient plus tout seul dès que les appels sont parallèles.**
  // Il se calcule à partir de ce qui est DÉJÀ écrit : quatre appels lancés
  // ensemble lisent le même compteur, se croient chacun seuls, et peuvent donc
  // écrire quatre fois le plafond. D'où la part que l'appelant impose — lui seul
  // sait combien d'appels il a en vol. On garde le minimum des deux : le serveur
  // reste l'autorité (un client qui demanderait 10 000 ne les obtiendrait pas),
  // la part n'est qu'une restriction supplémentaire.
  const alreadyWritten = await questionsWritten(importId);
  const budget = Math.min(MAX_QUESTIONS_PER_IMPORT - alreadyWritten, options.budgetShare ?? Number.POSITIVE_INFINITY);
  if (budget <= 0) return { written: 0, discarded: [], adjusted: [], batches: batches.length };

  // Les autres notions du chapitre, en contexte seulement (§16.21) : c'est ce
  // qui remplace le cours pour les niveaux supérieurs de Bloom.
  const inBatch = new Set(notions.map((n) => n.id));
  const neighbours = all.filter((n) => !inBatch.has(n.id));

  // Aucun document : la passe travaille sur les notions, pas sur le cours
  // (§16.3). C'est le poste d'économie principal de tout le chantier — on ne
  // téléverse rien, on ne relit rien, on ne paie donc rien pour le corpus.
  const existing = await loadNotionQuestions(notions.map((n) => n.id));
  const result = await provider.documentToPlan([], existing, {
    pass: 'questions',
    chapter,
    notions,
    neighbours,
    budget,
  });
  await addImportUsage(importId, result.usage);

  const refs = await loadExistingRefs(workshopId);
  const plan = parsePlanLogged('questions', result.plan, refs);

  // Le contexte n'est pas demandé au modèle : il est imposé par le bouton par
  // lequel l'utilisateur est entré (liste du parcours ou banque d'examen, §8).
  const groups = plan.groups.map((g) => ({ ...g, context }));

  // Le plafond est appliqué ICI et pas seulement suggéré au modèle : la
  // volumétrie relève du prompt, mais le plafond de débit est une garantie.
  const capped: typeof groups = [];
  let remaining = budget;
  for (const group of groups) {
    if (remaining <= 0) break;
    const questions = group.questions.slice(0, remaining);
    remaining -= questions.length;
    capped.push({ ...group, questions });
  }

  const written = await insertGroups(workshopId, importId, capped, new Map());
  return { written, discarded: plan.discarded, adjusted: plan.adjusted, batches: batches.length };
}
