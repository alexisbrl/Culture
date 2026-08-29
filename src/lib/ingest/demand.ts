// Ce qu'on demande à l'IA de produire, exprimé en couples (notion × niveau).
//
// ── Il n'y a qu'UNE façon de demander des questions ─────────────────────────
//
// On en distinguait trois — les 25 d'un chapitre neuf, la recharge d'un stock
// épuisé, la demande libre d'un gestionnaire. Elles ont la même forme : une
// liste de couples avec un nombre pour chacun. Ce qui change, c'est qui remplit
// le formulaire (arbitrage du 29/08/2026) :
//
//   • chapitre neuf  → `demandForChapterStart` : 25 questions de niveau 1,
//     réparties sur les notions du chapitre ;
//   • recharge       → `demandFromShortages` : ce que le radar déclare en manque ;
//   • demande libre  → pas de demande du tout. Une consigne écrite à la main ne
//     dit rien du stock de chaque notion ; on envoie large et c'est le modèle qui
//     choisit (voir `ingestParcoursQuestions`).
//
// ── La règle du plafond sur les notions secondaires ─────────────────────────
//
// Une question écrite pour combler « notion X, niveau N » doit être POSABLE au
// membre qui l'a déclenchée. Or une question ne se pose que si toutes ses
// notions sont à sa portée : il suffirait qu'elle mobilise une notion voisine à
// un niveau plus élevé pour qu'elle reste indisponible, et le manque persisterait
// malgré la dépense.
//
// On ne demande pas pour autant à l'IA de n'utiliser qu'une seule notion : elle
// tairait les autres pour respecter la consigne, et on perdrait la seule chose
// qui nous intéresse — la vérité sur ce que la question fait travailler. La
// consigne est donc un PLAFOND : les autres notions sont déclarées librement,
// mais aucune au-dessus du niveau de la notion principale.
//
// Filet, si le modèle dépasse quand même : la question est conservée — c'est du
// contenu valide — elle ne compte simplement pas pour le couple visé, et le
// radar redemandera. Aucune pression à mentir, aucun rejet.

import { BLOOM_LEVELS, type BloomLevel } from '@/lib/workshops/examTypes';

/** Combien de questions un chapitre reçoit à sa création : de quoi tenir deux
 *  exercices (12 niveaux chacun) au niveau 1. */
export const CHAPTER_START_QUESTIONS = 25;

/** Plafond d'une recharge automatique, en questions. Garde-fou de dépense : la
 *  recharge n'est déclenchée par personne, donc rien d'autre ne l'arrête. Ce qui
 *  n'est pas produit reste en manque, et la recharge suivante le reprendra. */
export const MAX_REFILL_QUESTIONS = 60;

/** Un couple à pourvoir : cette notion, à ce niveau, en tant d'exemplaires. */
export type QuestionDemand = {
  notionId: string;
  bloomLevel: BloomLevel;
  count: number;
};

/** Les 25 questions de niveau 1 d'un chapitre neuf, réparties au plus juste sur
 *  ses notions. Avec plus de notions que de questions, les dernières n'en
 *  reçoivent aucune : c'est assumé — la recharge les pourvoira dès qu'un membre
 *  les atteindra, et payer 25 questions par notion d'un chapitre que personne
 *  n'a encore ouvert serait le gaspillage que tout ce mécanisme évite. */
export function demandForChapterStart(
  notionIds: string[],
  total = CHAPTER_START_QUESTIONS
): QuestionDemand[] {
  if (notionIds.length === 0 || total <= 0) return [];

  const base = Math.floor(total / notionIds.length);
  const extra = total % notionIds.length;

  return notionIds
    .map((notionId, index) => ({
      notionId,
      bloomLevel: 1 as BloomLevel,
      count: base + (index < extra ? 1 : 0),
    }))
    .filter((demand) => demand.count > 0);
}

/** Ce que le radar déclare en manque, tel quel. */
export function demandFromShortages(
  shortages: { notionId: string; bloomLevel: BloomLevel; missing: number }[]
): QuestionDemand[] {
  return shortages
    .filter((s) => s.missing > 0)
    .map((s) => ({ notionId: s.notionId, bloomLevel: s.bloomLevel, count: s.missing }));
}

/** Ramène une demande sous un plafond, en servant les couples dans l'ordre reçu
 *  — donc les plus démunis d'abord, le radar les ayant déjà triés. */
export function capDemand(demand: QuestionDemand[], max: number): QuestionDemand[] {
  if (max <= 0) return [];

  const out: QuestionDemand[] = [];
  let left = max;
  for (const item of demand) {
    if (left <= 0) break;
    const count = Math.min(item.count, left);
    left -= count;
    out.push({ ...item, count });
  }
  return out;
}

/** Total demandé, toutes notions et tous niveaux confondus. */
export function demandTotal(demand: QuestionDemand[]): number {
  return demand.reduce((sum, item) => sum + item.count, 0);
}

/** Les notions concernées, sans doublon, dans l'ordre d'apparition. */
export function demandNotionIds(demand: QuestionDemand[]): string[] {
  return [...new Set(demand.map((item) => item.notionId))];
}

/** La demande vue notion par notion — la forme qu'attend le prompt. Les niveaux
 *  d'une même notion sont fusionnés (deux entrées « niveau 1 » s'additionnent)
 *  et rendus dans l'ordre des niveaux, pour que la consigne se lise. */
export function demandByNotion(
  demand: QuestionDemand[]
): Map<string, { bloomLevel: BloomLevel; count: number }[]> {
  const byNotion = new Map<string, Map<BloomLevel, number>>();

  for (const item of demand) {
    if (item.count <= 0) continue;
    const levels = byNotion.get(item.notionId) ?? new Map<BloomLevel, number>();
    levels.set(item.bloomLevel, (levels.get(item.bloomLevel) ?? 0) + item.count);
    byNotion.set(item.notionId, levels);
  }

  const out = new Map<string, { bloomLevel: BloomLevel; count: number }[]>();
  for (const [notionId, levels] of byNotion) {
    out.set(
      notionId,
      BLOOM_LEVELS.filter((level) => (levels.get(level) ?? 0) > 0).map((level) => ({
        bloomLevel: level,
        count: levels.get(level) as number,
      }))
    );
  }
  return out;
}
