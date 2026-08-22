// Ce que chaque passe reçoit en entrée — module PUR, sans réseau ni base.
//
// Ces règles décidaient jusqu'ici du coût de l'ingestion sans être écrites nulle
// part : elles étaient dispersées entre l'orchestration (`run.ts`) et le
// fournisseur (`providers/claude.ts`), donc intestables. Les réunir ici les rend
// vérifiables sans clé API — et c'est le seul endroit où lire « qu'est-ce qui
// part au modèle, et pourquoi ».

import type { PreparedDocument } from './providers/types';

export type IngestPass = 'chapters' | 'notions' | 'questions';

/** Les documents qu'une passe reçoit.
 *
 *  **La passe questions n'en reçoit aucun** (§16.3, §16.21). Une notion est
 *  autoportante par construction — c'est la définition qu'en donne la passe 2 —
 *  et ce qui manque pour les niveaux supérieurs de Bloom n'est pas le cours mais
 *  les notions voisines du même chapitre. Renvoyer le corpus pour rédiger une
 *  question sur une phrase de 280 caractères, c'est ce qui a coûté ~20 $ pour
 *  zéro question le 22/08/2026 : à l'échelle du corpus de test, ~287 $ de
 *  lectures de cache contre ~8,50 $ sans les documents.
 *
 *  Posée en garde côté fournisseur, et pas seulement à l'appel : un appelant
 *  distrait ne doit pas pouvoir rouvrir le robinet. */
export function documentsForPass(pass: IngestPass, prepared: PreparedDocument[]): PreparedDocument[] {
  return pass === 'questions' ? [] : prepared;
}

/** Combien de notions par appel de la passe questions.
 *
 *  Ni une (le contexte du chapitre serait renvoyé autant de fois qu'il y a de
 *  notions), ni tout le chapitre (`MAX_TOKENS` est à 32 000 et une notion à la
 *  volumétrie cible pèse ~2 400 tokens de sortie : un chapitre de 25 notions
 *  tronquerait la réponse, donc la perdrait, §16.2). Dix est le compromis. */
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

// ─── Le marqueur de cache ────────────────────────────────────────────────────
//
// Le cache existait pour répondre à « on renvoie le même cours 25 fois ». Une
// fois qu'on cesse de le faire (T3), il ne reste presque rien à mettre en
// cache — et **un marqueur posé sur un contenu jamais relu coûte 1,25× au lieu
// de 1×**, soit une perte sèche de 25 % sur cet appel (§16.17).
//
// L'exception est réelle : un PDF qui porte plusieurs chapitres est relu une
// fois par chapitre à la passe notions. Là, le cache paie.

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
// Si la seconde réponse dépasse encore, **on écrit ce qu'elle donne** et on
// continue.

/** Au-delà, on soupçonne un découpage en sous-parties plutôt qu'en chapitres.
 *  Nombre ABSOLU, jamais rapporté au nombre de documents : un cours de 8
 *  chapitres peut tenir dans un seul PDF (§16.18). */
export const MAX_PLAUSIBLE_CHAPTERS = 12;

export function needsChapterRetry(chapterCount: number): boolean {
  return chapterCount > MAX_PLAUSIBLE_CHAPTERS;
}

/** Enchaîne **au plus deux** appels de la passe chapitres.
 *
 *  L'appelant fournit l'appel (`attempt`) et sait compter ses chapitres
 *  (`countOf`) : cette fonction ne connaît ni le fournisseur ni la base, ce qui
 *  la rend testable avec un fournisseur factice. Elle ne lève jamais pour un
 *  nombre trop élevé — la seconde réponse fait foi quelle qu'elle soit. */
export async function withChapterRetry<R>(
  attempt: (retry: { previousCount: number } | undefined) => Promise<R>,
  countOf: (result: R) => number,
): Promise<{ result: R; attempts: number }> {
  const first = await attempt(undefined);
  const count = countOf(first);
  if (!needsChapterRetry(count)) return { result: first, attempts: 1 };

  // Une seule relance, jamais deux : on ne compte pas le résultat de celle-ci.
  const second = await attempt({ previousCount: count });
  return { result: second, attempts: 2 };
}
