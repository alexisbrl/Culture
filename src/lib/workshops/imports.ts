// Imports IA : étiquetage des lignes produites, et annulation d'un lot.
//
// ─── Le modèle, en une phrase ────────────────────────────────────────────────
//
// Une ligne sans `import_id` a été saisie à la main ; une ligne avec vient de ce
// lot. Annuler, c'est supprimer les lignes portant l'étiquette — les questions
// emportent leurs `exam_question_items` et leurs liens de notions par cascade.
//
// Ça sert bien au-delà de la panne : annuler un import qui a *techniquement
// réussi* mais dont l'IA a mal compris le document. C'est pourquoi l'écriture
// n'a pas besoin d'être atomique (docs/ai-ingestion-plan.md §10).
//
// ─── Ce fichier est le plus dangereux du chantier ────────────────────────────
//
// Il contient la seule suppression de masse de l'application. Si `importId`
// arrivait vide ou indéfini, un constructeur de requête pourrait laisser tomber
// le filtre et vider les tables — chapitres et notions SAISIS À LA MAIN
// compris. D'où trois précautions, dans cet ordre :
//
//   1. `assertImportId` refuse tout ce qui n'est pas un uuid — avant la moindre
//      requête ;
//   2. chaque suppression est **doublement filtrée** (`import_id` ET
//      `workshop_id`), pour qu'un identifiant valide venu d'un autre atelier ne
//      puisse rien atteindre ici ;
//   3. l'éligibilité est calculée AVANT, et l'annulation refusée si le lot n'y
//      répond pas.
//
// Les deux premières sont des fonctions pures, testées (tests/unit/imports.test.ts).

import { getSupabaseServerClient } from '@/lib/supabase';

/** Délai au-delà duquel un import ne s'annule plus. Passé ce point, l'atelier a
 *  vécu : ce qui a été généré fait partie du travail. */
export const IMPORT_CANCEL_WINDOW_HOURS = 24;

export type ImportRowDates = { createdAt: string; updatedAt: string };

export type ImportCancelState =
  /** Annulable : dans le délai, et rien n'a été touché. */
  | 'cancellable'
  /** Aucune ligne ne porte cette étiquette — lot déjà annulé, ou inconnu. */
  | 'empty'
  /** Passé le délai de 24 h. */
  | 'expired'
  /** Au moins une ligne du lot a été modifiée depuis l'import. */
  | 'modified';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Garde-fou de la suppression de masse. Lève sur tout ce qui n'est pas un uuid
 *  — `undefined`, chaîne vide, `'null'`, identifiant tronqué. Sans lui, une
 *  valeur vide transformerait « supprime les lignes de ce lot » en « supprime
 *  toutes les lignes ». */
export function assertImportId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`Identifiant d'import invalide : ${JSON.stringify(value)}`);
  }
  return value;
}

/** Peut-on encore annuler ce lot ?
 *
 *  L'ordre des vérifications n'est pas indifférent : le **délai** est la
 *  condition extérieure (passé 24 h, la question de la modification ne se pose
 *  plus), la **modification** vient ensuite car c'est la plus actionnable à
 *  afficher (« tu y as touché depuis »).
 *
 *  « Modifié » se lit `updated_at > created_at`, **sans tolérance** : les deux
 *  colonnes ont `default now()`, et `now()` étant l'heure de début de
 *  transaction en Postgres, un INSERT qui les omet toutes les deux leur donne
 *  une valeur strictement identique. C'est ce qui permet de se passer d'une
 *  marge de quelques secondes — laquelle finirait immanquablement par mentir
 *  dans un sens ou dans l'autre.
 *
 *  ⚠️ Corollaire pour l'écriture d'ingestion : elle doit **omettre** `updated_at`
 *  et non l'écrire, contrairement à `questionToRow` aujourd'hui
 *  (`src/lib/workshops/exam.ts`). Sans ça, tout import naîtrait « déjà
 *  modifié » et le bouton d'annulation ne s'afficherait jamais. */
export function importCancelState(rows: ImportRowDates[], now: Date = new Date()): ImportCancelState {
  if (rows.length === 0) return 'empty';

  const oldest = Math.min(...rows.map((r) => new Date(r.createdAt).getTime()));
  const deadline = oldest + IMPORT_CANCEL_WINDOW_HOURS * 3600_000;
  if (now.getTime() > deadline) return 'expired';

  const touched = rows.some((r) => new Date(r.updatedAt).getTime() > new Date(r.createdAt).getTime());
  if (touched) return 'modified';

  return 'cancellable';
}

export type ImportSummary = {
  state: ImportCancelState;
  chapters: number;
  notions: number;
  /** Nombre de GROUPES — une carte dans la liste de questions. */
  questionGroups: number;
  /** Nombre de QUESTIONS, questions liées comprises. C'est ce chiffre-là qu'on
   *  annonce à l'utilisateur (« 87 questions ajoutées »), et c'est aussi celui
   *  que compte l'ingestion : les deux doivent dire la même chose, sans quoi le
   *  bandeau d'annulation contredirait le message de fin d'import. */
  questions: number;
};

// Les trois tables étiquetables, dans l'ordre INVERSE de leur création. C'est
// l'ordre de suppression : les questions d'abord (elles s'appuient sur les
// notions), les notions ensuite, les chapitres en dernier. Les contraintes le
// permettraient dans n'importe quel ordre (`cascade` et `set null` sont en
// place) ; suivre l'ordre inverse évite simplement de faire transiter les
// données par des états intermédiaires incohérents.
const TAGGED_TABLES = [
  { table: 'exam_questions', key: 'questionGroups' },
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  { table: 'workshop_bricks', key: 'notions' },
  { table: 'workshop_chapters', key: 'chapters' },
] as const;

async function loadTaggedDates(workshopId: string, importId: string): Promise<ImportRowDates[]> {
  const supabase = getSupabaseServerClient();

  const results = await Promise.all(
    TAGGED_TABLES.map(({ table }) =>
      supabase
        .from(table)
        .select('created_at, updated_at')
        .eq('workshop_id', workshopId)
        .eq('import_id', importId),
    ),
  );

  const rows: ImportRowDates[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const row of data ?? []) rows.push({ createdAt: row.created_at, updatedAt: row.updated_at });
  }
  return rows;
}

/** État d'un import et volume de ce qu'il a produit — de quoi afficher le
 *  bandeau « 3 chapitres, 42 notions et 87 questions ajoutés · Annuler ». */
export async function getImportSummary(workshopId: string, importId: string): Promise<ImportSummary> {
  assertImportId(importId);
  const supabase = getSupabaseServerClient();

  const results = await Promise.all(
    TAGGED_TABLES.map(({ table }) =>
      supabase
        .from(table)
        .select('id, created_at, updated_at')
        .eq('workshop_id', workshopId)
        .eq('import_id', importId),
    ),
  );

  const counts = { chapters: 0, notions: 0, questionGroups: 0 };
  const rows: ImportRowDates[] = [];
  const groupIds: string[] = [];

  results.forEach(({ data, error }, i) => {
    if (error) throw new Error(error.message);
    const table = TAGGED_TABLES[i];
    counts[table.key] = (data ?? []).length;
    for (const row of data ?? []) {
      rows.push({ createdAt: row.created_at, updatedAt: row.updated_at });
      if (table.table === 'exam_questions') groupIds.push(row.id as string);
    }
  });

  // Les questions liées ne portent pas d'étiquette (elles suivent leur groupe) :
  // il faut donc les compter à part pour annoncer un nombre qui corresponde à ce
  // que l'utilisateur voit.
  let questions = 0;
  if (groupIds.length > 0) {
    const { count, error } = await supabase
      .from('exam_question_items')
      .select('id', { count: 'exact', head: true })
      .in('group_id', groupIds);
    if (error) throw new Error(error.message);
    questions = count ?? 0;
  }

  return { state: importCancelState(rows), ...counts, questions };
}

export type CancelImportResult =
  | { cancelled: true; chapters: number; notions: number; questionGroups: number }
  | { cancelled: false; reason: Exclude<ImportCancelState, 'cancellable'> };

/** Annule un import : supprime tout ce qu'il a produit, et rien d'autre.
 *
 *  La ligne `ai_imports` elle-même est **conservée** — elle reste la trace de ce
 *  qui a été tenté, de quand, par qui et à quel coût (quotas, ré-ingestion,
 *  débogage). Un lot annulé se relit donc à l'état `empty` : plus aucune ligne
 *  ne porte son étiquette. C'est ce qui évite d'avoir à stocker un statut. */
export async function cancelImport(workshopId: string, importId: string): Promise<CancelImportResult> {
  assertImportId(importId);

  const rows = await loadTaggedDates(workshopId, importId);
  const state = importCancelState(rows);
  if (state !== 'cancellable') return { cancelled: false, reason: state };

  const supabase = getSupabaseServerClient();
  const deleted = { chapters: 0, notions: 0, questionGroups: 0 };

  // Séquentiel et non `Promise.all` : l'ordre inverse de création n'a de sens
  // que s'il est respecté.
  for (const { table, key } of TAGGED_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .delete()
      // Double filtre volontaire : l'étiquette ET l'atelier. Un identifiant
      // valide venu d'un autre atelier ne peut donc rien supprimer ici.
      .eq('workshop_id', workshopId)
      .eq('import_id', importId)
      .select('id');
    if (error) throw new Error(error.message);
    deleted[key] = (data ?? []).length;
  }

  return { cancelled: true, ...deleted };
}
