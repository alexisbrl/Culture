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
