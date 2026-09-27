// Le filet anti-doublon — celui qui ne dépend pas du modèle.
//
// Feuille de route : docs/chantiers/2026-08-23-notions-dabord.md (T4).
//
// ─── Pourquoi la consigne ne suffit pas ──────────────────────────────────────
//
// Premier import réel après l'inversion (23/08/2026, cours d'histoire) : sur 37
// notions produites pour un chapitre qui en portait déjà 20, deux redites
// franches sont passées malgré une consigne explicite.
//
//   • « Au XVI° siècle, on produit 150 millions d'exemplaires pour 20 millions
//     de titres, contre 20 millions d'exemplaires pour 30 000 titres au XV° »
//     et « À la fin du XVe siècle : 30 000 titres imprimés correspondent à
//     20 millions d'exemplaires ; au XVIe siècle : 20 millions de titres pour
//     150 millions d'exemplaires » — **les mêmes chiffres, lus à l'envers**.
//   • « dimensions réduites […] pas d'enluminures » et « format réduit […]
//     abandon de l'enluminure » — **la même phrase, avec des synonymes**.
//
// Le mode d'échec est net : le modèle applique bien le critère quand le contenu
// diffère, et le rate quand l'ancienne notion dit la même chose dans un ORDRE
// différent — il ne la reconnaît pas dans la liste. Aucune consigne ne fermera
// ça complètement ; un filtre mécanique, si.
//
// ─── Ce que ce module fait, et ce qu'il ne fait pas ──────────────────────────
//
// Il écarte une notion **candidate** avant sa création. Il ne supprime rien, ne
// modifie rien, et ne touche jamais à ce qui est en base — le contrat des
// opérations est intact (`src/lib/program/operations.ts`).
//
// ⚠️ **Il est volontairement conservateur.** Un faux positif perd du contenu
// pédagogique réel, ce qui est plus grave qu'un doublon qu'on supprime en deux
// clics. D'où un seuil haut, mesuré sur des cas réels (voir `NEAR_DUPLICATE`),
// et un rejet toujours journalisé — jamais silencieux.

/** Mots vides français : ils gonflent la ressemblance de deux phrases qui n'ont
 *  rien à voir. Liste courte et fermée — un vrai lexique serait du bruit ici. */
const STOPWORDS = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'elle', 'en', 'et', 'eux',
  'il', 'ils', 'je', 'la', 'le', 'les', 'leur', 'lui', 'ma', 'mais', 'me', 'meme', 'mes', 'moi',
  'mon', 'ne', 'nos', 'notre', 'nous', 'on', 'ou', 'par', 'pas', 'plus', 'moins', 'pour', 'qu',
  'que', 'qui', 'sa', 'se', 'ses', 'son', 'sur', 'ta', 'te', 'tes', 'toi', 'ton', 'tu', 'un',
  'une', 'vos', 'votre', 'vous', 'c', 'd', 'j', 'l', 'm', 'n', 's', 't', 'y', 'est', 'sont',
  'etre', 'ete', 'avoir', 'ainsi', 'comme', 'donc', 'entre', 'leurs', 'aussi',
]);

/** Réduit un mot à sa forme comparable.
 *
 *  Radicalisation **minimale et assumée** : on retire le pluriel puis le `e`
 *  final. Ça rapproche « réduites » de « réduit », « enluminures » de
 *  « enluminure » — et, effet décisif ici, « XVIe » de « XVI » : les numéros de
 *  siècle écrits tantôt « XVI° » tantôt « XVIe » suffisaient à faire passer deux
 *  phrases identiques pour différentes. */
function stem(word: string): string {
  const singular = word.replace(/(?:eaux|aux|x|s)$/, '');
  return singular.length > 2 ? singular.replace(/e$/, '') : singular;
}

/** Les mots porteurs de sens d'un texte : sans accents, sans ponctuation, sans
 *  mots vides, radicalisés. **Les chiffres sont conservés** — ce sont les
 *  éléments les plus discriminants d'une notion, et ceux que le modèle réordonne
 *  le plus volontiers. */
export function significantWords(text: string): Set<string> {
  const words = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length > 1 || /^[0-9]$/.test(w));

  return new Set(words);
}

/** Part de mots porteurs communs aux deux textes (indice de Jaccard), entre 0
 *  et 1. Fonction pure et exportée pour être mesurable seule : c'est elle qui
 *  justifie le seuil. */
export function proximity(a: string, b: string): number {
  return setProximity(significantWords(a), significantWords(b));
}

/** La même mesure sur des mots déjà extraits. Les boucles qui comparent une
 *  liste à une autre extraient chaque texte UNE fois, puis comparent : extraire
 *  à chaque comparaison refaisait le même travail des milliers de fois. */
function setProximity(wa: ReadonlySet<string>, wb: ReadonlySet<string>): number {
  if (wa.size === 0 || wb.size === 0) return 0;
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let shared = 0;
  for (const w of small) if (large.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared);
}

/** Le seuil au-delà duquel deux notions disent la même chose.
 *
 *  **Mesuré, pas choisi au jugé** (cours d'histoire, 23/08/2026) :
 *
 *  | Paire | Proximité | Verdict attendu |
 *  |---|---|---|
 *  | les améliorations du livre, avec synonymes | **0,82** | doublon |
 *  | les chiffres de l'imprimerie, lus à l'envers | **0,67** | doublon |
 *  | — seuil — | 0,60 | |
 *  | les deux notions « Pic de la Mirandole » (corps beau / corps inscrit dans un carré) | **0,43** | à GARDER |
 *  | les auteurs romains vs les écrivains grecs à connaître | **0,20** | à garder |
 *
 *  Le vide entre 0,43 et 0,67 est large, et le seuil se pose au milieu : 0,07 de
 *  marge sous le doublon le plus discret, 0,17 au-dessus de la voisine légitime
 *  la plus proche. Le monter perdrait les chiffres de l'imprimerie ; le baisser
 *  mangerait les deux notions « Pic de la Mirandole », qui portent bien deux
 *  faits distincts — et c'est l'erreur la plus coûteuse des deux. */
export const NEAR_DUPLICATE = 0.6;

/** Le seuil à partir duquel on POSE LA QUESTION au modèle, au lieu de trancher.
 *
 *  ⚠️ **Il n'a pas le même rôle que `NEAR_DUPLICATE`, et c'est pour ça qu'il est
 *  bien plus bas.** Un seuil qui décide doit être sévère : une erreur coûte du
 *  contenu pédagogique réel. Un seuil qui ne fait que signaler peut être
 *  généreux — un signalement de trop ne coûte que quelques mots dans une
 *  consigne, et le modèle l'écarte en le lisant.
 *
 *  C'est le déplacement décidé le 24/08/2026 : le calcul repère la ressemblance,
 *  le modèle juge si elle est justifiée. Chacun à ce qu'il sait faire — comparer
 *  des mots pour l'un, comprendre deux phrases pour l'autre.
 *
 *  **0,40 est calé pour attraper le cas limite**, pas pour rester prudent : les
 *  deux notions « Pic de la Mirandole » du cours d'histoire mesurent 0,43. Elles
 *  portent bien deux faits distincts — c'est justement pour ça qu'on veut les
 *  soumettre : le calcul ne peut pas le savoir, le modèle si. Un seuil qui ne
 *  les verrait pas ne servirait qu'aux cas déjà évidents. */
export const SIMILAR_ENOUGH_TO_ASK = 0.4;

/** Les paires à soumettre au jugement du modèle.
 *
 *  Ne rend RIEN d'autre qu'une liste : aucune décision n'est prise ici. Une
 *  notion peut apparaître plusieurs fois si elle ressemble à plusieurs autres —
 *  le modèle les verra toutes, ce qui vaut mieux que d'en choisir une pour lui. */
export function flagSimilar<A, B>(
  candidates: readonly A[],
  others: readonly B[],
  titleOfCandidate: (a: A) => string,
  titleOfOther: (b: B) => string,
  threshold = SIMILAR_ENOUGH_TO_ASK,
): { candidate: A; other: B; proximity: number }[] {
  const flagged: { candidate: A; other: B; proximity: number }[] = [];
  const otherWords = others.map((other) => significantWords(titleOfOther(other)));
  for (const candidate of candidates) {
    const words = significantWords(titleOfCandidate(candidate));
    others.forEach((other, i) => {
      const score = setProximity(words, otherWords[i]);
      if (score >= threshold) flagged.push({ candidate, other, proximity: score });
    });
  }
  return flagged.sort((a, b) => b.proximity - a.proximity);
}

export type DuplicateVerdict<T> = {
  kept: T[];
  /** Les écartées, avec la notion existante qui les rend redondantes — pour que
   *  le message à l'utilisateur dise POURQUOI, jamais seulement combien. */
  dropped: { candidate: T; matched: string; proximity: number }[];
};

/** Écarte les candidates qui redisent une notion déjà présente.
 *
 *  `existing` couvre l'atelier entier **et** ce que les documents précédents du
 *  même import viennent d'écrire : deux documents traités en parallèle ne se
 *  voient pas, c'est donc ici que leur recouvrement se règle.
 *
 *  Une candidate retenue rejoint `existing` pour les suivantes — sans quoi trois
 *  formulations d'un même fait dans un seul document passeraient toutes. */
export function dropNearDuplicates<T>(
  candidates: readonly T[],
  existing: readonly string[],
  titleOf: (candidate: T) => string,
  threshold = NEAR_DUPLICATE,
): DuplicateVerdict<T> {
  const kept: T[] = [];
  const dropped: DuplicateVerdict<T>['dropped'] = [];
  const seen = existing.map((text) => ({ text, words: significantWords(text) }));

  for (const candidate of candidates) {
    const title = titleOf(candidate);
    const words = significantWords(title);

    let best: { matched: string; proximity: number } | null = null;
    for (const other of seen) {
      const score = setProximity(words, other.words);
      if (score >= threshold && (!best || score > best.proximity)) {
        best = { matched: other.text, proximity: score };
      }
    }

    if (best) dropped.push({ candidate, matched: best.matched, proximity: best.proximity });
    else {
      kept.push(candidate);
      seen.push({ text: title, words });
    }
  }

  return { kept, dropped };
}

// ─── Une liste ne recopie pas l'autre ────────────────────────────────────────
//
// La ressemblance ENTRE QUESTIONS n'est pas un défaut à l'intérieur d'une même
// liste : on n'apprend pas une addition en la posant une seule fois. Elle en
// devient un dès qu'on franchit la frontière — une question d'entraînement qui
// réapparaît telle quelle dans un examen évalue ce qu'on vient de réviser, donc
// n'évalue rien.
//
// ⚠️ **Ça se vérifie ICI, jamais dans le prompt.** Donner au modèle la liste
// d'entraînement entière pour qu'il l'évite, c'est reverser à chaque appel les
// ~75 000 tokens qu'on a passé un chantier à retirer (§16.3). Le calcul, lui,
// est local et gratuit.

export type RepeatedQuestion = { content: string; other: string };

/** L'empreinte d'un énoncé : son texte exact, à la casse, aux accents, aux
 *  espaces et à la ponctuation près. Deux énoncés de même empreinte sont une
 *  RECOPIE — et seule la recopie est cherchée ici.
 *
 *  ⚠️ **Deux questions très ressemblantes sont deux questions.** « Combien font
 *  8 − 5 » et « combien font 5 − 8 » partagent tous leurs mots et n'ont rien de
 *  commun pédagogiquement : l'ordre des mots, les chiffres et les symboles
 *  mathématiques comptent donc, et un mot de différence suffit à distinguer.
 *
 *  Elle se compare en une seule recherche, quel que soit le nombre d'énoncés
 *  déjà écrits — c'est ce qui permet de tout comparer. Un énoncé vide n'a pas
 *  d'empreinte, et ne recopie rien. */
export function questionFingerprint(content: string): string {
  return content
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[^\p{L}\p{N}+\-×*/÷=<>≤≥%^]+/gu, ' ')
    .trim();
}

/** Retire d'un lot de groupes les questions qui recopient un énoncé déjà écrit
 *  ailleurs.
 *
 *  `seen` : les énoncés à éviter, ou, pour chaque question, ceux qui la
 *  concernent — l'appelant restreint alors la comparaison aux seuls énoncés qui
 *  partagent une notion au même niveau.
 *
 *  ⚠️ **Un groupe amputé de sa PREMIÈRE question ne survit pas.** C'est elle qui
 *  pose le décor dont les suivantes dépendent (il n'y a pas d'énoncé commun,
 *  décision du 24/08/2026) : retirer la première et garder les autres
 *  produirait des questions qui renvoient à une situation absente. Le groupe
 *  part donc en entier — sauf s'il ne comptait qu'elle, où il n'y a rien de
 *  plus à perdre. */
export function dropRepeatedQuestions<G extends { questions: readonly { content: string }[] }>(
  groups: readonly G[],
  seen: readonly string[] | ((question: G['questions'][number]) => readonly string[]),
): { kept: G[]; removed: RepeatedQuestion[] } {
  const index = (texts: readonly string[]) => {
    const byPrint = new Map<string, string>();
    for (const text of texts) {
      const print = questionFingerprint(text);
      if (print && !byPrint.has(print)) byPrint.set(print, text);
    }
    return byPrint;
  };
  const shared = typeof seen === 'function' ? null : index(seen);
  if (shared && shared.size === 0) return { kept: [...groups], removed: [] };

  const copyOf = (question: G['questions'][number]): string | null => {
    const print = questionFingerprint(question.content);
    if (!print) return null;
    const pool = shared ?? index((seen as (q: G['questions'][number]) => readonly string[])(question));
    return pool.get(print) ?? null;
  };

  const kept: G[] = [];
  const removed: RepeatedQuestion[] = [];

  for (const group of groups) {
    const copies = group.questions.map(copyOf);
    if (copies[0] && group.questions.length > 1) {
      group.questions.forEach((q, i) => removed.push({ content: q.content, other: copies[i] ?? (copies[0] as string) }));
      continue;
    }

    const questions = group.questions.filter((q, i) => {
      const copy = copies[i];
      if (!copy) return true;
      removed.push({ content: q.content, other: copy });
      return false;
    });
    if (questions.length > 0) kept.push({ ...group, questions });
  }

  return { kept, removed };
}

// ─── Les doublons de notions, jugés à la fin (docs/architecture.md §7.6) ────
//
// L'étape notions d'un chapitre ne voit que son chapitre : si elle recrée une
// notion qui vit dans un autre, rien ne le lui dit. Une fois tous les chapitres
// passés, le site repère les paires suspectes, un seul appel les tranche, et
// ces fonctions encadrent l'appel : ce qu'on lui soumet, et ce qu'on fait de sa
// réponse.

/** Au-delà, les paires les moins proches ne sont pas soumises : un appel qui
 *  ne répond que « redite ou pas » n'a pas à devenir un second import. */
export const MAX_REDITE_PAIRS = 300;

export interface RediteNotion {
  id: string;
  title: string;
  chapterId: string | null;
  /** Créée par la génération en cours. */
  fresh: boolean;
  /** Date de création (ISO) : entre deux anciennes, la plus récente reste. */
  createdAt: string;
}

export interface ReditePair {
  a: RediteNotion;
  b: RediteNotion;
  proximity: number;
}

/** Les paires suspectes, les plus proches d'abord, plafonnées. Toute paire
 *  assez proche est soumise, SAUF une paire qui compte une notion neuve dans le
 *  même chapitre que l'autre : l'étape notions de ce chapitre l'a déjà jugée,
 *  elle avait la liste sous les yeux. Deux anciennes du même chapitre, elles,
 *  n'ont jamais été jugées par personne. */
export function rediteCandidates(
  notions: readonly RediteNotion[],
  limit = MAX_REDITE_PAIRS,
): ReditePair[] {
  const words = notions.map((n) => significantWords(n.title));
  const pairs: ReditePair[] = [];
  for (let i = 0; i < notions.length; i++) {
    for (let j = i + 1; j < notions.length; j++) {
      const [a, b] = [notions[i], notions[j]];
      if ((a.fresh || b.fresh) && a.chapterId === b.chapterId) continue;
      const score = setProximity(words[i], words[j]);
      if (score >= SIMILAR_ENOUGH_TO_ASK) pairs.push({ a, b, proximity: score });
    }
  }
  return pairs.sort((x, y) => y.proximity - x.proximity).slice(0, limit);
}

/** Ce qu'on fait d'une paire jugée redite.
 *
 *  - `merge` : `remove` est effacée ; ses questions et la progression des
 *    élèves passent d'abord sur `keep`, qui rejoint `moveTo` si c'est un autre
 *    chapitre que le sien.
 *  - `unplace` : `notion` sort du programme, sans chapitre, intacte — rien ne
 *    lui est retiré, rien n'est transféré. */
export type RediteAction =
  | { kind: 'merge'; remove: string; keep: string; moveTo: string | null }
  | { kind: 'unplace'; notion: string; keep: string };

/**
 * Les gestes qu'appellent les paires jugées redites. Trois cas :
 *
 * - **deux neuves** : celle du chapitre qui vient le premier au programme reste,
 *   l'autre s'efface ;
 * - **une neuve, une ancienne** : la NEUVE reste — c'est la formulation du cours
 *   d'aujourd'hui —, elle récupère les questions et la progression de
 *   l'ancienne, qui s'efface, et elle prend la place qui vient la première au
 *   programme des deux ;
 * - **deux anciennes** : la plus récente reste où elle est, l'autre sort du
 *   programme, sans rien perdre.
 *
 * Tout est **recalculé ici** à partir de l'état de l'atelier, jamais pris de la
 * paire telle qu'elle arrive : une paire inconnue, une notion qui n'est plus au
 * programme ou deux titres qui ne se ressemblent pas assez pour avoir été
 * soumis sont ignorés. Une notion ne sert qu'à une paire : la première
 * appliquée (la plus proche) la fige.
 */
export function resolveRedites(
  duplicates: readonly { a: string; b: string }[],
  notions: ReadonlyMap<string, RediteNotion>,
  programOrder: readonly string[],
): { actions: RediteAction[]; ignored: number } {
  const rank = new Map(programOrder.map((id, i) => [id, i]));
  const rankOf = (n: RediteNotion) => (n.chapterId !== null ? rank.get(n.chapterId) : undefined) ?? Number.MAX_SAFE_INTEGER;
  const earlier = (x: RediteNotion, y: RediteNotion) => (rankOf(y) < rankOf(x) ? y : x);

  const candidates = duplicates.flatMap((d) => {
    const a = notions.get(d.a);
    const b = notions.get(d.b);
    if (!a || !b || a.id === b.id) return [];
    if (!a.chapterId || !b.chapterId || !rank.has(a.chapterId) || !rank.has(b.chapterId)) return [];
    const score = proximity(a.title, b.title);
    return score >= SIMILAR_ENOUGH_TO_ASK ? [{ a, b, score }] : [];
  });
  let ignored = duplicates.length - candidates.length;

  const locked = new Set<string>();
  const actions: RediteAction[] = [];
  for (const { a, b } of candidates.sort((x, y) => y.score - x.score)) {
    if (locked.has(a.id) || locked.has(b.id)) {
      ignored += 1;
      continue;
    }
    locked.add(a.id);
    locked.add(b.id);

    if (a.fresh && b.fresh) {
      const keep = earlier(a, b);
      actions.push({ kind: 'merge', keep: keep.id, remove: keep === a ? b.id : a.id, moveTo: null });
    } else if (a.fresh || b.fresh) {
      const [fresh, old] = a.fresh ? [a, b] : [b, a];
      const place = earlier(fresh, old).chapterId;
      actions.push({ kind: 'merge', keep: fresh.id, remove: old.id, moveTo: place !== fresh.chapterId ? place : null });
    } else {
      const recent = a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id) ? a : b;
      actions.push({ kind: 'unplace', keep: recent.id, notion: recent === a ? b.id : a.id });
    }
  }
  return { actions, ignored };
}

/** Les paires que le modèle a jugées redites, lues dans sa réponse. Une réponse
 *  sur une paire inconnue, en double ou mal formée est ignorée. */
export function judgedDuplicates(
  pairs: readonly ReditePair[],
  answers: readonly { pair: number; duplicate: boolean }[],
): { a: string; b: string }[] {
  const answered = new Set<number>();
  const out: { a: string; b: string }[] = [];
  for (const answer of answers) {
    if (!answer.duplicate || !Number.isInteger(answer.pair) || answered.has(answer.pair)) continue;
    answered.add(answer.pair);
    const pair = pairs[answer.pair];
    if (pair) out.push({ a: pair.a.id, b: pair.b.id });
  }
  return out;
}

/** Soumet les paires au modèle — **et ne l'appelle pas s'il n'y en a aucune**. */
export async function judgeRedites(
  pairs: readonly ReditePair[],
  ask: (pairs: readonly ReditePair[]) => Promise<{ pair: number; duplicate: boolean }[]>,
): Promise<{ pair: number; duplicate: boolean }[]> {
  if (pairs.length === 0) return [];
  return ask(pairs);
}
