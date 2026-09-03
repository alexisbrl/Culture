// Ce que chaque passe reçoit en entrée — module PUR, sans réseau ni base.
//
// Ces règles décidaient jusqu'ici du coût de l'ingestion sans être écrites nulle
// part : elles étaient dispersées entre l'orchestration (`run.ts`) et le
// fournisseur (`providers/claude.ts`), donc intestables. Les réunir ici les rend
// vérifiables sans clé API — et c'est le seul endroit où lire « qu'est-ce qui
// part au modèle, et pourquoi ».

import type { PreparedDocument } from './providers/types';

export type IngestPass = 'chapters' | 'notions' | 'assign' | 'questions' | 'exam';

/** Les documents qu'une passe reçoit.
 *
 *  **La passe questions n'en reçoit aucun** (§16.3, §16.21). Une notion est
 *  autoportante par construction — c'est la définition qu'en donne la passe 2 —
 *  et ce qui manque pour les niveaux supérieurs de Bloom n'est pas le cours mais
 *  les notions voisines du même chapitre. Renvoyer le corpus pour rédiger une
 *  question sur une notion d’une phrase, c'est ce qui a coûté ~20 $ pour
 *  zéro question le 22/08/2026 : à l'échelle du corpus de test, ~287 $ de
 *  lectures de cache contre ~8,50 $ sans les documents.
 *
 *  Posée en garde côté fournisseur, et pas seulement à l'appel : un appelant
 *  distrait ne doit pas pouvoir rouvrir le robinet. */
export function documentsForPass(
  pass: IngestPass,
  prepared: PreparedDocument[],
  /** Index du document à traiter — **obligatoire pour la passe notions**, qui
   *  travaille document par document depuis l'inversion du 23/08/2026. */
  documentIndex?: number,
): PreparedDocument[] {
  // Ni le rangement ni les questions ne reçoivent de document : le premier
  // travaille sur des pages et des titres, les seconds sur des notions (§16.3).
  // La passe examen suit exactement la même règle — elle lit le programme, pas
  // le cours.
  if (pass === 'questions' || pass === 'exam' || pass === 'assign') return [];

  // La passe notions ne reçoit QUE son document. C'est l'unité de travail qui
  // remplace le chapitre : elle ne demande aucun jugement au modèle, elle est
  // stable d'un import à l'autre, et elle parallélise sans amorçage.
  //
  // Effet de bord heureux : le corpus n'est plus envoyé qu'UNE fois au total sur
  // cette passe, au lieu d'une fois par chapitre. C'est moins cher qu'une
  // lecture de cache — voir `shouldCacheDocuments`.
  if (pass === 'notions') {
    if (documentIndex === undefined) {
      throw new Error('documentsForPass: la passe notions exige un index de document');
    }
    const document = prepared[documentIndex];
    return document ? [document] : [];
  }

  // La passe chapitres, elle, les reçoit TOUS : sans le cours, le modèle invente
  // des intitulés au lieu de reprendre ceux du document, et ne sait pas d'où
  // viennent les notions qu'on lui demande de répartir.
  return prepared;
}

/** Combien de notions par appel de la passe questions.
 *
 *  Ni une (le contexte du chapitre serait renvoyé autant de fois qu'il y a de
 *  notions), ni tout le chapitre (`MAX_TOKENS` est à 32 000 et une notion à la
 *  volumétrie cible pèse ~2 400 tokens de sortie : un chapitre de 25 notions
 *  tronquerait la réponse, donc la perdrait, §16.2). Dix est le compromis. */
// ─── Ce que « aucun chapitre » veut dire, et pour qui ────────────────────────
//
// Le modèle n'a qu'une façon de dire « nulle part » : un chapitre vide. Cette
// réponse recouvre deux situations qui n'ont rien à voir, et c'est NOUS qui les
// distinguons — jamais lui. Règle arrêtée le 25/08/2026, ici parce qu'elle
// décide d'écritures en base et qu'une règle qui décide d'écritures se teste.

export type UnplacedSplit = {
  /** Les redites — le modèle a tranché une ressemblance en faveur de l'autre.
   *  Elles sortent du programme, sans chapitre : c'est le seul état d'où le
   *  bouton « restaurer » ne peut pas les ramener par surprise. */
  setAside: string[];
  /** Les notions restées faute de mieux : le modèle n'a rien trouvé, elles
   *  GARDENT leur chapitre. Il sera écarté avec elles dedans s'il ne reste que
   *  ça — ce qui rend l'import lisible au lieu de disperser son contenu. */
  stranded: string[];
  /** Les rangements à réellement écrire : ceux qui nomment un chapitre, plus
   *  ceux qui vident une notion qui n'avait déjà rien. Les « restées » en sont
   *  absentes — on ne réécrit pas ce qu'on veut laisser tel quel. */
  effective: { notionRef: string; chapterRef?: string }[];
};

/** Répartit les notions que le modèle n'a rangées nulle part.
 *
 *  ⚠️ `redites` ne contient QUE des notions dont la ressemblance lui a été
 *  soumise. Une notion qu'il n'a jamais eu à juger ne peut pas être écartée par
 *  accident : dans le doute, elle reste où elle est. C'est ce qui distingue une
 *  décision d'un oubli, et c'est ce qui borne la seule suppression du système
 *  (`planImportCleanup`). */
export function splitUnplaced(
  assignments: readonly { notionRef: string; chapterRef?: string }[],
  redites: ReadonlySet<string>,
  /** Où chaque notion se trouve aujourd'hui. Absente ou `null` = nulle part,
   *  donc rien à préserver. */
  currentChapters: ReadonlyMap<string, string | null>,
): UnplacedSplit {
  const setAside: string[] = [];
  const stranded: string[] = [];

  for (const a of assignments) {
    if (a.chapterRef) continue;
    if (redites.has(a.notionRef)) setAside.push(a.notionRef);
    else if (currentChapters.get(a.notionRef)) stranded.push(a.notionRef);
  }

  const left = new Set(stranded);
  return {
    setAside,
    stranded,
    effective: assignments.filter((a) => a.chapterRef || !left.has(a.notionRef)),
  };
}

export const NOTIONS_PER_QUESTION_BATCH = 10;

/** Découpe les notions d'un chapitre en lots de travail.
 *
 *  L'ordre reçu est conservé et fait foi : l'appelant doit le rendre stable
 *  d'un appel à l'autre, sinon deux lots successifs se recouvriraient — le
 *  client rappelle la même action une fois par lot. */
export function batchNotions<T>(notions: T[], size = NOTIONS_PER_QUESTION_BATCH): T[][] {
  if (size < 1) throw new Error(`Taille de lot invalide : ${size}`);
  const batches: T[][] = [];
  for (let i = 0; i < notions.length; i += size) batches.push(notions.slice(i, i + size));
  return batches;
}

// ─── Le découpage de la passe EXAMEN ─────────────────────────────────────────
//
// L'examen ne travaille pas notion par notion : il reçoit un budget de questions
// pour TOUT le programme (§ examen, 24/08/2026). Ce qu'on découpe n'est donc pas
// la matière mais le budget — et la matière suit, pour que deux appels ne
// puissent pas écrire deux fois la même question sur la même partie du cours.
//
// Le découpage est CONTIGU, dans l'ordre du cours : chaque appel reçoit une
// tranche de programme d'un seul tenant. C'est ce qui permet à une question de
// croiser plusieurs notions voisines — un découpage qui panacherait les
// chapitres rendrait ce croisement absurde.

/** Le budget d'un appel, tranche par tranche.
 *
 *  Le reste va aux PREMIÈRES tranches : elles couvrent le début du cours, qui
 *  est la partie qu'un examen a le plus de chances d'évaluer. */
export function splitBudget(total: number, slices: number): number[] {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeSlices = Math.max(1, Math.floor(slices));
  const base = Math.floor(safeTotal / safeSlices);
  const remainder = safeTotal % safeSlices;
  return Array.from({ length: safeSlices }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** En combien d'appels un budget se découpe. */
export function examSliceCount(budget: number, perCall: number): number {
  if (perCall < 1) throw new Error(`Taille d'appel invalide : ${perCall}`);
  return Math.max(1, Math.ceil(Math.max(0, budget) / perCall));
}

export type ProgramChapter<T> = { id: string; name: string; notions: T[] };

/** Découpe le programme en tranches contiguës d'un poids de notions comparable.
 *
 *  ⚠️ **Un chapitre peut être coupé en deux**, et c'est voulu : sinon un
 *  chapitre de 300 notions et un de 5 recevraient le même budget de questions,
 *  et l'examen serait bâti sur la structure du cours plutôt que sur sa matière.
 *  Le nombre de notions est la seule mesure de poids dont on dispose sans
 *  relire le cours.
 *
 *  Un chapitre coupé apparaît dans les deux tranches, avec ses notions
 *  respectives : le modèle voit toujours à quel chapitre appartient ce qu'il
 *  lit. */
export function sliceProgram<T>(chapters: ProgramChapter<T>[], slices: number): ProgramChapter<T>[][] {
  const safeSlices = Math.max(1, Math.floor(slices));
  const flat = chapters.flatMap((c) => c.notions.map((notion) => ({ chapter: c, notion })));
  if (flat.length === 0) return [];

  // Jamais plus de tranches que de notions : une tranche vide coûterait un appel
  // au modèle pour rien.
  const count = Math.min(safeSlices, flat.length);
  const sizes = splitBudget(flat.length, count);

  const result: ProgramChapter<T>[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    const window = flat.slice(cursor, cursor + size);
    cursor += size;

    const grouped: ProgramChapter<T>[] = [];
    for (const { chapter, notion } of window) {
      const last = grouped[grouped.length - 1];
      if (last && last.id === chapter.id) last.notions.push(notion);
      else grouped.push({ id: chapter.id, name: chapter.name, notions: [notion] });
    }
    result.push(grouped);
  }
  return result;
}

// ─── Le marqueur de cache ────────────────────────────────────────────────────
//
// Le cache existait pour répondre à « on renvoie le même cours 25 fois ». Une
// fois qu'on cesse de le faire (T3), il ne reste presque rien à mettre en
// cache — et **un marqueur posé sur un contenu jamais relu coûte 1,25× au lieu
// de 1×**, soit une perte sèche de 25 % sur cet appel (§16.17).
//
// **Depuis l'inversion des passes (23/08/2026), il ne reste PLUS AUCUN cas où le
// marqueur paie sur les documents**, et c'est une bonne nouvelle :
//
//   • passe notions  — un appel par document, chacun ne portant que le sien :
//     aucun préfixe commun, donc rien à relire. Le corpus part une fois en tout,
//     ce qui est moins cher qu'une écriture suivie de lectures ;
//   • passe chapitres — un seul appel, donc aucune relecture par définition ;
//   • passe questions — aucun document du tout (§16.3).
//
// La fonction reste : elle est le garde qui évite qu'on repose un marqueur par
// réflexe le jour où une passe redeviendra multi-appels sur le même contenu.

/** Le marqueur ne se pose que si le contenu sert à **plus d'un appel**.
 *
 *  Seuil de rentabilité en TTL 5 minutes : 2 lectures (1,25× + 0,1× contre 2×).
 *  En dessous, on paie l'écriture pour rien. */
export function shouldCacheDocuments(documentUses: number): boolean {
  return documentUses > 1;
}

// ─── La relance de la passe chapitres ────────────────────────────────────────
//
// Le nombre de chapitres est **le multiplicateur de tout ce qui suit** : 28 au
// lieu de 6, c'est ×4,7 sur les passes notions et questions (§16.15). C'est le
// paramètre le plus rentable à surveiller, et un appel de plus en économise des
// centaines.
//
// Ce que ce mécanisme n'est PAS : un point d'arrêt. Aucune validation humaine
// n'intervient entre deux passes, jamais — refus produit explicite (§16.18).
//
// Ce n'est pas non plus une CORRECTION imposée. Le second appel reçoit le
// découpage proposé et la consigne de l'utilisateur, et on lui demande de le
// **vérifier** : s'il est justifié — un programme annuel, un cours découpé en
// thèmes eux-mêmes subdivisés —, il le reconduit tel quel. On ne rabote un
// découpage que lorsqu'il est effectivement trop fin (22/08/2026).

/** Au-delà, on soupçonne un découpage en sous-parties plutôt qu'en chapitres.
 *  Nombre ABSOLU, jamais rapporté au nombre de documents : un cours de 8
 *  chapitres peut tenir dans un seul PDF (§16.18). */
export const MAX_PLAUSIBLE_CHAPTERS = 16;

/** En deçà, on soupçonne l'inverse : un découpage pris sur les grands
 *  regroupements du cours là où les unités qu'ils contiennent portaient le
 *  contenu. Un cours entier en deux chapitres entasse tout dans deux boîtes,
 *  et le rangement n'a plus rien à distinguer (31/08/2026). */
export const MIN_PLAUSIBLE_CHAPTERS = 3;

/** ⚠️ **`chapterCount` est la taille du PROGRAMME qui résulte de la réponse**,
 *  et non le nombre de chapitres nouveaux (01/09/2026). Les deux coïncident au
 *  premier import ; sur une mise à jour, non : « 1 chapitre nouveau » à côté de
 *  12 conservés n'est pas un découpage en une partie, alors qu'un cours
 *  entièrement redécoupé met les anciens à 0 et retombe bien sous le seuil.
 *
 *  C'est ce qui permet au seuil bas de valoir **à chaque import** sans se
 *  déclencher à tort : on ne sait jamais d'avance si un cours a été changé de
 *  fond en comble, et un programme entier réduit à deux boîtes doit être
 *  vérifié, que ce soit sa première version ou sa dixième. */
export function needsChapterRetry(chapterCount: number): boolean {
  return chapterCount > MAX_PLAUSIBLE_CHAPTERS || chapterCount < MIN_PLAUSIBLE_CHAPTERS;
}

/** Enchaîne **au plus deux** appels de la passe chapitres.
 *
 *  L'appelant fournit l'appel (`attempt`) et sait compter ses chapitres
 *  (`countOf`) : cette fonction ne connaît ni le fournisseur ni la base, ce qui
 *  la rend testable avec un fournisseur factice. Elle ne lève jamais pour un
 *  nombre trop élevé — la seconde réponse fait foi quelle qu'elle soit. */
export async function withChapterRetry<R>(
  attempt: (retry: { previous: string[] } | undefined) => Promise<R>,
  countOf: (result: R) => number,
  namesOf: (result: R) => string[],
): Promise<{ result: R; attempts: number }> {
  const first = await attempt(undefined);
  const count = countOf(first);
  if (!needsChapterRetry(count)) return { result: first, attempts: 1 };

  // Une seule relance, jamais deux : on ne compte pas le résultat de celle-ci.
  // Les NOMS partent, pas seulement le nombre : sans eux, le modèle ne peut pas
  // juger si « 32 » recouvre 32 sous-parties d'un même thème ou 32 sujets
  // réellement distincts — il ne saurait qu'obéir.
  const second = await attempt({ previous: namesOf(first) });
  return { result: second, attempts: 2 };
}
