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
 *  ⚠️ **« Modifié » se mesure APRÈS la fin de l'import, pas après la naissance
 *  de chaque ligne** (29/08/2026). La règle lisait `updated_at > created_at`,
 *  ce qui marchait tant qu'un import écrivait chaque ligne une fois pour toutes.
 *  Depuis l'inversion des étages (23/08/2026), ce n'est plus vrai : une notion
 *  naît SANS chapitre à la première passe, et c'est le rangement — le même
 *  import, quelques minutes plus tard — qui la range. Elle porte donc
 *  `updated_at > created_at` du seul fait de l'import qui l'a créée, et **tout
 *  import qui range une notion neuve se déclarait lui-même « modifié » : le
 *  bandeau d'annulation ne s'affichait plus jamais.**
 *
 *  La référence est donc la **dernière écriture du lot** (le plus récent des
 *  `created_at`). Ce qui bouge après elle est une main humaine ; ce qui bouge
 *  avant est l'import en train de se faire. Pas de marge de tolérance : les
 *  deux colonnes ont `default now()`, et `now()` étant l'heure de début de
 *  transaction en Postgres, un INSERT qui les omet toutes les deux leur donne
 *  une valeur strictement identique.
 *
 *  Angle mort assumé : une modification faite à la main **pendant** que l'import
 *  écrit encore passe inaperçue. Personne n'édite une question au milieu d'une
 *  génération, et l'alternative — refuser l'annulation dès qu'une ligne bouge —
 *  revient à ne jamais l'offrir.
 *
 *  ⚠️ Corollaire pour l'écriture d'ingestion : elle doit **omettre** `updated_at`
 *  et non l'écrire, contrairement à `questionToRow` aujourd'hui
 *  (`src/lib/workshops/exam.ts`). */
export function importCancelState(rows: ImportRowDates[], now: Date = new Date()): ImportCancelState {
  if (rows.length === 0) return 'empty';

  const created = rows.map((r) => new Date(r.createdAt).getTime());
  const oldest = Math.min(...created);
  const deadline = oldest + IMPORT_CANCEL_WINDOW_HOURS * 3600_000;
  if (now.getTime() > deadline) return 'expired';

  // La fin de l'import : sa dernière ligne écrite.
  const finished = Math.max(...created);
  const touched = rows.some((r) => new Date(r.updatedAt).getTime() > finished);
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
  /** Le même total, **coupé selon l'écran où on le voit** (28/08/2026). Un import
   *  ne produit jamais les deux : le contexte des questions vient du bouton par
   *  lequel on est entré (voir `groupSchema`, `src/lib/ingest/planSchema.ts`).
   *  Un total unique faisait donc afficher « 87 questions ajoutées » au-dessus
   *  d'une liste de parcours qui n'en avait pas reçu une seule. */
  parcoursQuestions: number;
  examQuestions: number;
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

  // `context` est demandé à part plutôt qu'ajouté aux colonnes de la boucle : il
  // n'existe que sur les groupes, et une liste de colonnes qui varie d'une table
  // à l'autre n'est plus analysable par le typage de PostgREST.
  const [results, groupRows] = await Promise.all([
    Promise.all(
      TAGGED_TABLES.map(({ table }) =>
        supabase
          .from(table)
          .select('id, created_at, updated_at')
          .eq('workshop_id', workshopId)
          .eq('import_id', importId),
      ),
    ),
    supabase
      .from('exam_questions')
      .select('id, context')
      .eq('workshop_id', workshopId)
      .eq('import_id', importId),
  ]);

  if (groupRows.error) throw new Error(groupRows.error.message);
  // Les groupes rangés par destination — un lot ne remplit jamais les deux.
  const groupIds: Record<'parcours' | 'exam', string[]> = { parcours: [], exam: [] };
  for (const row of groupRows.data ?? []) {
    groupIds[row.context === 'exam' ? 'exam' : 'parcours'].push(row.id as string);
  }

  const counts = { chapters: 0, notions: 0, questionGroups: 0 };
  const rows: ImportRowDates[] = [];

  results.forEach(({ data, error }, i) => {
    if (error) throw new Error(error.message);
    counts[TAGGED_TABLES[i].key] = (data ?? []).length;
    for (const row of data ?? []) rows.push({ createdAt: row.created_at, updatedAt: row.updated_at });
  });

  // Les questions liées ne portent pas d'étiquette (elles suivent leur groupe) :
  // il faut donc les compter à part pour annoncer un nombre qui corresponde à ce
  // que l'utilisateur voit. On compte en base plutôt que de rapatrier les lignes :
  // un gros import dépasserait la pagination par défaut, et le total mentirait.
  const countItems = async (ids: string[]): Promise<number> => {
    if (ids.length === 0) return 0;
    const { count, error } = await supabase
      .from('exam_question_items')
      .select('id', { count: 'exact', head: true })
      .in('group_id', ids);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [parcoursQuestions, examQuestions] = await Promise.all([
    countItems(groupIds.parcours),
    countItems(groupIds.exam),
  ]);

  return {
    state: importCancelState(rows),
    ...counts,
    questions: parcoursQuestions + examQuestions,
    parcoursQuestions,
    examQuestions,
  };
}

/** Les imports de l'atelier encore DANS LE DÉLAI, du plus récent au plus ancien.
 *
 *  ⚠️ **Plusieurs, et pas seulement le dernier** (28/08/2026). Le bandeau ne
 *  montrait que le lot le plus récent : trois essais de suite dans la même
 *  heure, et les deux premiers devenaient inannulables faute d'être affichés,
 *  alors que le délai courait encore pour eux. Or c'est précisément quand on
 *  enchaîne les essais qu'on veut pouvoir revenir en arrière.
 *
 *  Le filtre de date se fait ICI, en base : remonter des lots périmés pour les
 *  écarter ensuite coûterait une lecture complète par lot (`getImportSummary`).
 *  Le plafond, lui, borne le coût d'un atelier très actif ; au-delà, ce sont
 *  les plus anciens qu'on laisse tomber, jamais les récents. */
export async function recentImportIds(workshopId: string, limit = 8): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - IMPORT_CANCEL_WINDOW_HOURS * 3600_000).toISOString();
  const { data, error } = await supabase
    .from('ai_imports')
    .select('id')
    .eq('workshop_id', workshopId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
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
