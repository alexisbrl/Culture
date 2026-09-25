// Ce que chaque passe reçoit en entrée — module PUR, sans réseau ni base.
//
// Ces règles décidaient jusqu'ici du coût de l'ingestion sans être écrites nulle
// part : elles étaient dispersées entre l'orchestration (`run.ts`) et le
// fournisseur (`providers/claude.ts`), donc intestables. Les réunir ici les rend
// vérifiables sans clé API — et c'est le seul endroit où lire « qu'est-ce qui
// part au modèle, et pourquoi ».

import type { BloomLevel } from '@/lib/workshops/examTypes';

import type { QuestionDemand } from './demand';
import { EXAM_GROUP_SIZE, EXAM_QUESTIONS_PER_CALL, MAX_QUESTIONS_PER_IMPORT, examGroupedCount } from './prompt';
import type { PreparedDocument } from './providers/types';

export type IngestPass = 'resource' | 'chapters' | 'notions' | 'questions' | 'exam' | 'redites';

/** Les documents qu'une passe reçoit.
 *
 *  **Les passes de questions n'en reçoivent aucun** (docs/architecture.md §7.2) :
 *  une notion est autoportante par construction, et ce qui manque pour les
 *  niveaux supérieurs n'est pas le cours mais les notions voisines du chapitre.
 *  Les chapitres et les notions reçoivent ce qu'on leur a préparé — les pages
 *  pauvres en texte pour l'une, les pages du chapitre pour l'autre.
 *
 *  Posée en garde côté fournisseur, et pas seulement à l'appel : un appelant
 *  distrait ne doit pas pouvoir rouvrir le robinet. */
export function documentsForPass(
  pass: IngestPass,
  prepared: PreparedDocument[],
  /** L'étape 0 écrit-elle ? Décidé en amont (docs/architecture.md §7.4) : tout
   *  le corpus si oui, rien sinon. */
  write?: boolean,
): PreparedDocument[] {
  // L'étape 0 ne lit que pour écrire, et rien par défaut.
  if (pass === 'resource') return write ? prepared : [];

  // Les questions, l'examen et les redites travaillent sur des notions, pas
  // sur le cours.
  if (pass === 'questions' || pass === 'exam' || pass === 'redites') return [];

  return prepared;
}

// ─── Le découpage de la passe PARCOURS : des appels de huit questions ───────
//
// Jusqu'au 22/09/2026, on découpait par lots de DIX NOTIONS, quel que soit le
// nombre de questions qu'elles demandaient : un appel en écrivait de 2 à 48, et
// l'attente suivait — jusqu'à quatre minutes et demie pour le plus gros, alors
// que les appels partent en parallèle et que c'est le plus long qu'on attend.
//
// On découpe désormais la DEMANDE, en appels de huit questions, comme l'examen
// découpe son budget (arbitrage d'Alexis du 22/09/2026). Trois règles :
//
//   1. **Des appels pleins, le dernier s'ajuste** — le nombre d'appels est le
//      plus petit possible ;
//   2. **Les questions d'une notion restent ensemble** autant que la place le
//      permet : on remplit dans l'ordre du chapitre, notion après notion ;
//   3. **Une notion qui déborde est coupée entre ses niveaux**, ceux-ci étant
//      rangés dans l'ordre : chaque morceau porte des niveaux différents, donc
//      des questions de nature différente. Deux appels parallèles ne se voient
//      pas ; c'est ce qui les empêche de se répéter.
//
// ⚠️ Un morceau au MÊME niveau reste possible (une notion qui demande plus de
// huit questions de niveau 1). C'est rare — un chapitre neuf de deux notions —,
// et accepté : on ne met pas en série pour ce cas (arbitrage du 22/09/2026).

/** Nombre de questions par appel de la passe parcours. Environ 600 tokens de
 *  sortie par question, réflexion comprise : un appel plein répond en une
 *  demi-minute (mesuré au journal de bord, 09/2026). */
export const QUESTIONS_PER_PARCOURS_CALL = 8;

/** Découpe une demande en appels de `perCall` questions au plus.
 *
 *  `order` est l'ordre des notions du chapitre : il fait foi, et il doit être
 *  **stable d'un appel à l'autre** — le client rappelle l'action une fois par
 *  appel, et chacun doit retrouver la même découpe. Une notion de la demande
 *  absente de `order` est ignorée (elle n'est pas dans ce chapitre). */
export function packDemand(
  demand: readonly QuestionDemand[],
  order: readonly string[],
  perCall = QUESTIONS_PER_PARCOURS_CALL,
): QuestionDemand[][] {
  if (perCall < 1) throw new Error(`Taille d'appel invalide : ${perCall}`);

  // Deux entrées du même couple (notion × niveau) s'additionnent.
  const counts = new Map<string, Map<BloomLevel, number>>();
  for (const item of demand) {
    if (item.count <= 0) continue;
    const levels = counts.get(item.notionId) ?? new Map<BloomLevel, number>();
    levels.set(item.bloomLevel, (levels.get(item.bloomLevel) ?? 0) + item.count);
    counts.set(item.notionId, levels);
  }

  const calls: QuestionDemand[][] = [];
  let current: QuestionDemand[] = [];
  let room = perCall;
  for (const notionId of order) {
    const levels = counts.get(notionId);
    if (!levels) continue;
    for (const bloomLevel of [...levels.keys()].sort((a, b) => a - b)) {
      let left = levels.get(bloomLevel) as number;
      while (left > 0) {
        const take = Math.min(left, room);
        current.push({ notionId, bloomLevel, count: take });
        left -= take;
        room -= take;
        if (room === 0) { calls.push(current); current = []; room = perCall; }
      }
    }
  }
  if (current.length > 0) calls.push(current);
  return calls;
}

/** Un appel parcours sans demande chiffrée — une consigne libre : des notions
 *  à couvrir et un budget, le modèle choisit où frapper. */
export type FreeParcoursCall<T> = { notions: T[]; budget: number };

/** Le cas de la consigne libre : aucune demande par notion, un budget pour le
 *  chapitre. Même taille d'appel que la demande chiffrée ; les notions se
 *  répartissent en tranches contiguës, comme le programme d'un examen. Jamais
 *  plus d'appels que de notions : un appel sans notion n'aurait rien à couvrir. */
export function planFreeParcoursCalls<T>(
  notions: readonly T[],
  total: number,
  perCall = QUESTIONS_PER_PARCOURS_CALL,
): FreeParcoursCall<T>[] {
  const safe = Math.max(0, Math.floor(total));
  if (safe === 0 || notions.length === 0) return [];
  const count = Math.min(Math.ceil(safe / perCall), notions.length);
  const budgets = splitBudget(safe, count);
  const sizes = splitBudget(notions.length, count);
  let cursor = 0;
  return sizes.map((size, i) => {
    const slice = notions.slice(cursor, cursor + size);
    cursor += size;
    return { notions: slice, budget: budgets[i] };
  });
}

// ─── Ce qu'un appel de la passe questions voit du chapitre ───────────────────
//
// La passe ne reçoit aucun document : ce sont les autres notions du chapitre qui
// remplacent le cours, et les questions déjà écrites qui l'empêchent de se
// répéter. Deux plafonds, pour qu'un gros chapitre ne fasse pas grossir l'appel
// sans limite.

/** Notions du chapitre transmises en contexte, celles du lot comprises. Un
 *  intitulé pèse ~40 tokens : 150 notions en font ~6 000. */
export const QUESTION_CONTEXT_NOTIONS = 150;

/** Questions existantes transmises contre la redite, toutes notions de l'appel
 *  confondues (~30 tokens chacune, ~9 000 au plafond). C'est le poste qui grandit
 *  avec l'atelier : une notion peut accumuler des centaines d'énoncés. */
export const QUESTION_CONTEXT_EXISTING = 300;

/** Les autres notions du chapitre, en contexte seulement.
 *
 *  **TOUT le chapitre, et pas seulement les notions que la demande vise.** Une
 *  recharge ou un démarrage ne visent souvent qu'une partie du chapitre (24
 *  questions de démarrage sur un chapitre de 150 notions n'en visent que 24) ; ne
 *  montrer que celles-là priverait le modèle du contexte qui situe ses questions,
 *  et le laisserait écrire sur la notion voisine sans le savoir.
 *
 *  Au-delà du plafond, les notions visées passent d'abord, puis les autres ;
 *  l'ordre du chapitre est conservé dans ce qui est gardé. */
export function contextNotions<T extends { id: string }>(
  chapter: readonly T[],
  batch: ReadonlySet<string>,
  targeted: ReadonlySet<string>,
  cap = QUESTION_CONTEXT_NOTIONS,
): T[] {
  const others = chapter.filter((n) => !batch.has(n.id));
  const room = Math.max(0, cap - batch.size);
  const kept = new Set(
    [...others.filter((n) => targeted.has(n.id)), ...others.filter((n) => !targeted.has(n.id))]
      .slice(0, room)
      .map((n) => n.id),
  );
  return others.filter((n) => kept.has(n.id));
}

/** Une question déjà écrite sur une ou plusieurs notions du lot. */
export type ExistingQuestion = {
  content: string;
  notionIds: string[];
  /** Le niveau de Bloom que la question vise, pour chacune de ses notions. */
  levels: Record<string, number | null>;
  /** Date d'écriture (ISO) — à niveau égal, les plus récentes passent d'abord :
   *  ce sont celles que le modèle vient d'écrire, donc celles qu'il risque le
   *  plus de reproduire. */
  createdAt: string;
};

/** Écart entre le niveau d'une question et les niveaux demandés sur sa notion.
 *  Aucun niveau demandé (consigne libre) : toutes se valent. Niveau inconnu : en
 *  dernier. */
function levelDistance(level: number | null, wanted: readonly number[]): number {
  if (wanted.length === 0) return 0;
  if (level === null) return Number.MAX_SAFE_INTEGER;
  return Math.min(...wanted.map((w) => Math.abs(w - level)));
}

/** Les questions existantes à montrer au modèle, sous le plafond.
 *
 *  **Priorité au niveau demandé** : pour une question demandée au niveau 2, les
 *  questions de niveau 2 d'abord, puis celles des niveaux voisins (1 et 3), puis
 *  le 4 — c'est au niveau visé que la redite menace. À niveau égal, les plus
 *  récentes.
 *
 *  **Réparti entre les notions du lot**, à tour de rôle : chacune reçoit sa part,
 *  et la part d'une notion qui a peu de questions revient aux autres. Une question
 *  reliée à deux notions du lot n'est comptée qu'une fois. */
export function pickExistingQuestions(
  questions: readonly ExistingQuestion[],
  /** Les notions du lot, avec les niveaux demandés sur chacune (vide = aucun). */
  targets: ReadonlyMap<string, readonly number[]>,
  cap = QUESTION_CONTEXT_EXISTING,
): ExistingQuestion[] {
  if (cap <= 0) return [];

  const queues = [...targets].map(([notionId, wanted]) =>
    questions
      .filter((q) => q.notionIds.includes(notionId))
      .map((q) => ({ q, distance: levelDistance(q.levels[notionId] ?? null, wanted) }))
      .sort((a, b) => a.distance - b.distance || b.q.createdAt.localeCompare(a.q.createdAt))
      .map(({ q }) => q),
  );

  const picked = new Set<ExistingQuestion>();
  const cursors = queues.map(() => 0);
  let progressed = true;
  while (picked.size < cap && progressed) {
    progressed = false;
    for (let i = 0; i < queues.length && picked.size < cap; i++) {
      while (cursors[i] < queues[i].length && picked.has(queues[i][cursors[i]])) cursors[i]++;
      if (cursors[i] < queues[i].length) {
        picked.add(queues[i][cursors[i]++]);
        progressed = true;
      }
    }
  }
  return [...picked];
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

// ─── La FORME de l'examen, décidée AVANT le premier appel (06/09/2026) ───────
//
// Jusqu'ici chaque appel recevait le même budget et la même consigne : « environ
// 60 % de tes questions en groupes ». Sur un appel de cinq questions, ça faisait
// trois questions à grouper — donc un groupe de trois, et rien d'autre, à chaque
// appel et pour tout l'examen. La proportion était tenue à la question près, la
// VARIÉTÉ était perdue : un examen de quarante questions n'était qu'une suite de
// triplets, et aucun groupe ne pouvait dépasser la taille d'un appel.
//
// La répartition se calcule donc une fois pour l'examen ENTIER, et chaque appel
// reçoit une forme HOMOGÈNE : ou bien il n'écrit que des groupes, ou bien il
// n'écrit que des questions isolées. Le modèle n'a plus rien à répartir.
//
// ⚠️ **Ce qui est fixé, c'est la NATURE d'un appel et son budget — jamais les
// tailles de ses groupes** (arbitrage d'Alexis, 06/09/2026). Dicter « 4+2 » ou
// « 3+3 » interdirait un groupe de six là où l'utilisateur en demande un, et
// c'est son examen. On conseille donc une taille usuelle et on laisse composer.
// Un appel qui rendrait « 5+1 » laisse une question seule : ce n'est pas une
// faute, c'est un enchaînement cohérent préféré à un compte juste.
//
// ⚠️ **Et le découpage ne sert pas non plus à fabriquer de la variété.** Faire
// varier la taille des appels pour que le modèle compose autrement a été essayé
// puis écarté le jour même : un appel ne réfléchit pas, il exécute — et une
// place rognée casserait une demande de l'utilisateur (« un enchaînement de six
// questions ») sans que rien ne le dise. La règle est donc la plus bête
// possible : **des appels pleins, et le dernier s'ajuste** pour que le compte
// tombe juste. La variété d'un examen est le travail du modèle.
//
// Conséquence directe, et c'est elle qui compte à l'écran : le plan étant connu
// d'avance, plus aucun appel n'a besoin de partir seul pour révéler le nombre
// des autres. Toute la passe part en une vague.

/** Un appel de la passe examen : un budget, et la forme de ce budget. */
export type ExamCall = {
  /** Nombre de questions à écrire dans cet appel. */
  budget: number;
  /** `true` = toutes ses questions vont dans des groupes (à lui de les composer) ;
   *  `false` = que des questions isolées, sans le moindre enchaînement. */
  grouped: boolean;
};

/** Découpe un budget en appels : des appels PLEINS, et le dernier s'ajuste.
 *
 *  Rien de plus, et c'est délibéré (voir la note en tête de section) : le
 *  découpage sert à ne pas tronquer une réponse, pas à souffler au modèle ce
 *  qu'il doit composer.
 *
 *  `min` est la plus petite taille qu'un appel puisse avoir un sens : deux pour
 *  un appel groupé — un « groupe » d'une question n'existe pas —, une pour un
 *  appel de questions isolées. Un dernier appel trop court prend donc à son
 *  prédécesseur au lieu d'abandonner une question en chemin. */
export function callBudgets(total: number, perCall = EXAM_QUESTIONS_PER_CALL, min = 1): number[] {
  const safe = Math.max(0, Math.floor(total));
  if (safe < min) return [];
  const out: number[] = [];
  let left = safe;
  while (left > perCall) { out.push(perCall); left -= perCall; }
  if (left >= min) out.push(left);
  else if (left > 0 && out.length > 0) {
    // Le reste ne ferait pas un appel : on rogne le précédent pour que le
    // dernier atteigne le minimum. Les deux restent sous le plafond.
    const previous = out.pop() as number;
    out.push(previous + left - min, min);
  }
  return out;
}

/** Le plan d'un examen : la liste ordonnée de ses appels.
 *
 *  L'ordre est celui du COURS — le premier appel couvre le début du programme —
 *  et les appels isolés sont répartis entre les appels groupés plutôt que mis à
 *  la suite : autrement, le début du cours n'aurait que des enchaînements et sa
 *  fin que des questions seules. */
export function planExamCalls(total: number, perCall = EXAM_QUESTIONS_PER_CALL): ExamCall[] {
  const safeTotal = Math.max(0, Math.floor(total));
  if (safeTotal === 0) return [];

  // Un budget groupé trop court pour un seul groupe part en questions isolées :
  // demander « un groupe d'une question » n'aurait aucun sens.
  const wanted = examGroupedCount(safeTotal);
  const grouped = wanted >= EXAM_GROUP_SIZE.min ? wanted : 0;
  const solo = safeTotal - grouped;

  const groupedCalls: ExamCall[] = callBudgets(grouped, perCall, EXAM_GROUP_SIZE.min)
    .map((budget) => ({ budget, grouped: true }));

  const soloCalls: ExamCall[] = callBudgets(solo, perCall)
    .map((budget) => ({ budget, grouped: false }));

  if (groupedCalls.length === 0) return soloCalls;
  if (soloCalls.length === 0) return groupedCalls;

  const plan: ExamCall[] = [];
  let next = 0;
  for (let i = 0; i < groupedCalls.length; i += 1) {
    plan.push(groupedCalls[i]);
    const upTo = Math.round(((i + 1) * soloCalls.length) / groupedCalls.length);
    while (next < upTo) { plan.push(soloCalls[next]); next += 1; }
  }
  while (next < soloCalls.length) { plan.push(soloCalls[next]); next += 1; }
  return plan;
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

// ─── La part du plafond d'import, chapitre par chapitre (§7.2) ──────────────
//
// Les questions d'un chapitre partent dès que SON étape notions est finie, sans
// attendre les autres. Sans réservation, les premiers chapitres arrivés
// consommeraient le fusible entier et les derniers n'auraient rien. Chaque
// chapitre a donc sa part, fixée à l'avance (`chapterStartBudgets`), et ne
// puise que dans elle ; la somme des parts ne dépasse jamais le plafond.

export type BudgetLedger = {
  /** Réserve jusqu'à `asked` questions pour un appel de ce chapitre, et rend
   *  ce qui a été accordé — 0 si sa part est épuisée. */
  reserve(chapterId: string, asked: number): number;
  /** Rend au chapitre ce qu'un appel avait réservé sans l'écrire. */
  release(chapterId: string, unused: number): void;
  /** Ce qui est réservé ou écrit, tous chapitres confondus. */
  readonly total: number;
};

export function createBudgetLedger(
  shares: ReadonlyMap<string, number>,
  pool: number = MAX_QUESTIONS_PER_IMPORT,
): BudgetLedger {
  const used = new Map<string, number>();
  let total = 0;
  return {
    reserve(chapterId, asked) {
      const left = Math.min((shares.get(chapterId) ?? 0) - (used.get(chapterId) ?? 0), pool - total);
      const granted = Math.max(0, Math.min(Math.floor(asked), left));
      if (granted > 0) {
        used.set(chapterId, (used.get(chapterId) ?? 0) + granted);
        total += granted;
      }
      return granted;
    },
    release(chapterId, unused) {
      const back = Math.max(0, Math.min(Math.floor(unused), used.get(chapterId) ?? 0));
      used.set(chapterId, (used.get(chapterId) ?? 0) - back);
      total -= back;
    },
    get total() {
      return total;
    },
  };
}
