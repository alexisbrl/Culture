// Le radar : ce qu'il reste à poser au membre qui travaille.
//
// Il répond à une seule question — « combien de questions inédites et à portée
// reste-t-il à CE membre, notion par notion et niveau par niveau ? » — et c'est
// elle qui déclenche la recharge automatique. Lexique : notion (produit, code)
// = brick (base), voir CLAUDE.md §1.
//
// ── Pour qui l'on mesure ────────────────────────────────────────────────────
//
// Pour le membre qui lance l'exercice, et lui seul (arbitré le 29/08/2026).
// Mesurer le membre le plus démuni de l'atelier remplirait le stock de
// quelqu'un d'autre et laisserait celui qui a la page ouverte sans question.
// La recharge qu'il déclenche profite ensuite à tous, puisque les questions
// créées sont neuves pour tout le monde.
//
// ── Pourquoi le compte se fait en base ──────────────────────────────────────
//
// Le calcul croise toutes les notions du chapitre avec toutes les questions qui
// les mobilisent. À la cible du produit (2 000 notions et 100 000 questions par
// atelier), le faire ici voudrait dire rapatrier des centaines de milliers de
// lignes à chaque exercice. La mesure vit donc dans la fonction Postgres
// `parcours_radar` (docs/migrations/2026-08-29-tirage-en-base.sql pour sa forme
// actuelle) ; ce module ne porte que les règles produit — le seuil et la cible
// — et la lecture.
//
// ── Ce qu'un « couple » désigne ─────────────────────────────────────────────
//
// Un couple, c'est **une notion et un niveau de Bloom** : « la photosynthèse au
// niveau appliquer ». C'est l'unité de stock, parce que c'est l'unité de ce
// qu'on sait demander à l'IA. Le stock ne se compte qu'aux niveaux de la
// FRONTIÈRE du membre — ceux qu'il lui reste à conquérir, de son niveau + 1
// jusqu'à sa portée. Ce qu'il a déjà acquis n'a pas besoin d'être réapprovisionné.
//
// ── Le piège que ce module existe pour éviter ───────────────────────────────
//
// Une question qui vise « notion 1, niveau 2 » NE COMPTE PAS pour ce couple si
// elle mobilise par ailleurs une notion hors de portée du membre : la grappe se
// pose d'un bloc, donc elle est indisponible **en entier**. C'est pourquoi le
// stock ne peut pas se compter question par question ni notion par notion, et
// pourquoi il est propre à chaque membre — deux membres du même atelier n'ont
// pas le même stock devant eux.

import { getSupabaseServerClient } from '@/lib/supabase';
import { BLOOM_REACH, toBloomLevel, type BloomLevel } from '@/lib/workshops/examTypes';

/** Stock visé sur un couple après une recharge (règle produit, 29/08/2026). */
export const RADAR_TARGET = 4;

/** À ce nombre de questions disponibles ou en dessous, on recharge. Un seul
 *  couple sous le seuil suffit à déclencher, et la recharge remet alors TOUS
 *  les couples du chapitre à la cible — sinon on rechargerait un exercice sur
 *  deux. */
export const RADAR_TRIGGER = 1;

/** Une ligne du radar : un couple (notion, niveau) à la frontière du membre. */
export type RadarRow = {
  notionId: string;
  bloomLevel: BloomLevel;
  /** Questions encore disponibles pour ce membre sur ce couple. */
  available: number;
  /** Combien de membres ont ce couple à leur frontière — toujours 1 tant qu'on
   *  mesure un membre à la fois. Gardé parce que la base sait aussi balayer un
   *  atelier entier, ce qui servira le jour où l'on préparera le stock à
   *  l'avance plutôt qu'à l'ouverture d'un exercice. */
  members: number;
};

export type RadarShortage = RadarRow & {
  /** Combien de questions il manque pour atteindre la cible. */
  missing: number;
};

/** Les couples à recharger, du plus démuni au moins démuni. Fonction pure : la
 *  règle de déclenchement se relit et se teste sans base. */
export function shortages(rows: RadarRow[]): RadarShortage[] {
  return rows
    .filter((row) => row.available <= RADAR_TRIGGER)
    .map((row) => ({ ...row, missing: Math.max(0, RADAR_TARGET - row.available) }))
    .sort((a, b) => b.missing - a.missing || b.members - a.members);
}

/** Y a-t-il de quoi déclencher une recharge sur ce chapitre ? */
export function needsRefill(rows: RadarRow[]): boolean {
  return rows.some((row) => row.available <= RADAR_TRIGGER);
}

/** Lecture brute du radar d'un chapitre pour un membre — tous les couples de sa
 *  frontière, y compris ceux qui ne manquent de rien. */
export async function readRadar(
  workshopId: string,
  chapterId: string,
  userId: string
): Promise<RadarRow[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc('parcours_radar', {
    p_workshop: workshopId,
    p_chapter: chapterId,
    p_reach: BLOOM_REACH,
    p_user: userId,
  });

  if (error) {
    console.error('readRadar error:', error);
    return [];
  }

  return (data ?? []).map((row: { brick_id: string; bloom_level: number; available_min: number; members: number }) => ({
    notionId: row.brick_id,
    bloomLevel: toBloomLevel(row.bloom_level),
    available: row.available_min,
    members: row.members,
  }));
}

/** Ce qu'il faudrait faire produire pour ce membre, sur ce chapitre, maintenant.
 *  Liste vide = rien à recharger. */
export async function chapterShortages(
  workshopId: string,
  chapterId: string,
  userId: string
): Promise<RadarShortage[]> {
  return shortages(await readRadar(workshopId, chapterId, userId));
}
