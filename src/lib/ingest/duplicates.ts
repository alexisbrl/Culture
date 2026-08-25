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
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;

  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
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

/** Le seuil pour un NOM DE CHAPITRE, plus haut que pour une notion.
 *
 *  Un titre est court : deux titres partagent peu de mots, donc la moindre
 *  ressemblance pèse lourd dans l'indice. « L'Europe, foyer de peuplement » et
 *  « L'Europe, foyer de peuplement et d'émigration » atteignent 0,75, tandis que
 *  deux chapitres réellement distincts d'un même cours tombent sous 0,2 — l'écart
 *  est encore plus net que pour les notions, ce qui autorise un seuil sévère.
 *
 *  Sévère est ici le bon réglage **parce que l'erreur n'est pas symétrique** :
 *  fusionner deux chapitres distincts mélangerait leurs notions, ce qui se
 *  répare mal ; laisser passer un doublon de chapitre se corrige d'un
 *  glisser-déposer. */
export const NEAR_DUPLICATE_TITLE = 0.7;

/** L'élément existant que ce titre redit, s'il y en a un.
 *
 *  Rend l'ÉLÉMENT et non le titre, parce que l'appelant a besoin de son
 *  identifiant : un chapitre proposé en double n'est pas écarté, il est
 *  **redirigé** vers celui qui existe (voir `ingestChapters`). Écarter suffirait
 *  pour une notion — rien n'en dépend encore — mais orphelinerait toutes les
 *  notions qu'on venait de lui affecter. */
export function findExistingMatch<T>(
  title: string,
  existing: readonly T[],
  titleOf: (item: T) => string,
  threshold = NEAR_DUPLICATE_TITLE,
): { match: T; proximity: number } | null {
  let best: { match: T; proximity: number } | null = null;
  for (const item of existing) {
    const score = proximity(title, titleOf(item));
    if (score >= threshold && (!best || score > best.proximity)) best = { match: item, proximity: score };
  }
  return best;
}

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
  for (const candidate of candidates) {
    const title = titleOfCandidate(candidate);
    for (const other of others) {
      const score = proximity(title, titleOfOther(other));
      if (score >= threshold) flagged.push({ candidate, other, proximity: score });
    }
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
  const seen = [...existing];

  for (const candidate of candidates) {
    const title = titleOf(candidate);

    let best: { matched: string; proximity: number } | null = null;
    for (const other of seen) {
      const score = proximity(title, other);
      if (score >= threshold && (!best || score > best.proximity)) {
        best = { matched: other, proximity: score };
      }
    }

    if (best) dropped.push({ candidate, matched: best.matched, proximity: best.proximity });
    else {
      kept.push(candidate);
      seen.push(title);
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

export type RepeatedQuestion = { content: string; other: string; proximity: number };

/** Retire d'un lot de groupes les questions qui redisent un énoncé déjà écrit
 *  ailleurs.
 *
 *  ⚠️ **Un groupe amputé de sa PREMIÈRE question ne survit pas.** C'est elle qui
 *  pose le décor dont les suivantes dépendent (il n'y a pas d'énoncé commun,
 *  décision du 24/08/2026) : retirer la première et garder les autres
 *  produirait des questions qui renvoient à une situation absente. Le groupe
 *  part donc en entier — sauf s'il ne comptait qu'elle, où il n'y a rien de
 *  plus à perdre.
 *
 *  Le seuil est celui des titres, et sévère volontairement : ce qu'on cherche
 *  ici, c'est la RECOPIE, pas la parenté. Deux questions qui travaillent le même
 *  fait sous deux angles doivent passer. */
export function dropRepeatedQuestions<G extends { questions: readonly { content: string }[] }>(
  groups: readonly G[],
  seen: readonly string[],
  threshold = NEAR_DUPLICATE_TITLE,
): { kept: G[]; removed: RepeatedQuestion[] } {
  if (seen.length === 0) return { kept: [...groups], removed: [] };

  const kept: G[] = [];
  const removed: RepeatedQuestion[] = [];

  for (const group of groups) {
    const verdicts = group.questions.map((q) => findExistingMatch(q.content, seen, (c) => c, threshold));
    const firstIsRepeat = verdicts[0] !== null && verdicts[0] !== undefined;

    if (firstIsRepeat && group.questions.length > 1) {
      for (let i = 0; i < group.questions.length; i += 1) {
        const found = verdicts[i];
        removed.push({
          content: group.questions[i].content,
          other: found ? found.match : (verdicts[0]?.match ?? ''),
          proximity: found?.proximity ?? verdicts[0]?.proximity ?? 1,
        });
      }
      continue;
    }

    const questions = group.questions.filter((q, i) => {
      const found = verdicts[i];
      if (!found) return true;
      removed.push({ content: q.content, other: found.match, proximity: found.proximity });
      return false;
    });
    if (questions.length > 0) kept.push({ ...group, questions });
  }

  return { kept, removed };
}
