// Le radar : ce qu'il reste à poser, et à qui.
//
// Il répond à une seule question — « combien de questions inédites et à portée
// reste-t-il, notion par notion et niveau par niveau ? » — et c'est elle qui
// déclenche la recharge automatique. Lexique : notion (produit, code) = brick
// (base), voir CLAUDE.md §1.
//
// ── Pourquoi le compte se fait en base ──────────────────────────────────────
//
// Le calcul croise TOUS les membres de l'atelier avec toutes les notions du
// chapitre et toutes les questions qui les mobilisent. À la cible du produit
// (2 000 notions et 100 000 questions par atelier), le faire ici voudrait dire
// rapatrier des centaines de milliers de lignes à chaque exercice. La mesure
// vit donc dans la fonction Postgres `parcours_radar`
// (docs/migrations/2026-08-29-radar-des-questions-disponibles.sql) ; ce module
// ne porte que les règles produit — le seuil et la cible — et la lecture.
//
// ── Ce qu'un « couple » désigne ─────────────────────────────────────────────
//
// Un couple, c'est **une notion et un niveau de Bloom** : « la photosynthèse au
// niveau appliquer ». C'est l'unité de stock, parce que c'est l'unité de ce
// qu'on sait demander à l'IA. Le stock ne se compte qu'aux niveaux de la
// FRONTIÈRE d'un membre — ceux qu'il lui reste à conquérir, de son niveau + 1
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
import { toBloomLevel, type BloomLevel } from '@/lib/workshops/examTypes';
import { BLOOM_REACH } from '@/lib/workshops/parcoursDraw';

/** Stock visé sur un couple après une recharge (règle produit, 29/08/2026). */
export const RADAR_TARGET = 4;

/** En dessous ou à ce nombre de questions disponibles, on recharge. Un seul
 *  couple sous le seuil suffit à déclencher, et la recharge remet alors TOUS
 *  les couples du chapitre à la cible — sinon on rechargerait une fois sur deux,
 *  à chaque exercice. */
export const RADAR_TRIGGER = 1;

/** Une ligne du radar : un couple (notion, niveau) à la frontière d'au moins un
 *  membre du chapitre. */
export type RadarRow = {
  notionId: string;
  bloomLevel: BloomLevel;
  /** Stock du membre le PLUS démuni sur ce couple. C'est lui qui décide : une
   *  question créée pour lui sert aussi à tous les autres, jamais l'inverse. */
  available: number;
  /** Combien de membres ont ce couple à leur frontière. */
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

/** Lecture brute du radar d'un chapitre — tous les couples à la frontière d'au
 *  moins un membre, y compris ceux qui ne manquent de rien. */
export async function readRadar(workshopId: string, chapterId: string): Promise<RadarRow[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc('parcours_radar', {
    p_workshop: workshopId,
    p_chapter: chapterId,
    p_reach: BLOOM_REACH,
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

/** Ce qu'il faudrait faire produire pour ce chapitre, maintenant. Liste vide =
 *  rien à recharger. */
export async function chapterShortages(workshopId: string, chapterId: string): Promise<RadarShortage[]> {
  return shortages(await readRadar(workshopId, chapterId));
}
