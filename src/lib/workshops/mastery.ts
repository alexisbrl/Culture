// Progression du parcours — maîtrise d'une notion par un utilisateur.
// Module pur (pas de `'use server'`, pas de `auth()`, pas de revalidation) :
// les wrappers vivent dans app/actions/parcoursExercise.ts et
// app/actions/parcoursProgress.ts. Lexique : notion (produit, code) = brick
// (base), voir CLAUDE.md §1.
//
// ── Le modèle (arrêté avec le produit le 06/08/2026) ────────────────────────
//
// Chaque couple (utilisateur × notion) porte un `score` entier de 0 à 40 :
// 10 points par niveau de la taxonomie de Bloom atteint, 4 niveaux utiles.
//
// Une question porte un niveau de Bloom VISÉ (`exam_questions.bloom_level`,
// 1..6) dont on tire une CIBLE `T = 10 × min(bloom, 4)`. Une bonne réponse
// rapproche le score de cette cible sans jamais la dépasser :
//
//     gain = floor( min( T − score , (T − score) × 0,4 + 1,5 ) )   si score < T
//     gain = 0                                                     sinon
//
// C'est un rattrapage exponentiel plafonné. Le terme proportionnel fait qu'une
// question difficile rapporte beaucoup quand on part de bas et plus rien quand
// on l'a dépassée ; le bonus fixe garantit qu'on atteint la cible en un nombre
// fini de réponses (3 réponses pour une cible 10, 5 pour une cible 30). Le
// `floor` garde des scores entiers. Une mauvaise réponse ne retire RIEN : le
// score est monotone, une notion travaillée ne régresse jamais.
//
// Le plafond par cible est structurant : une question « mémoriser » ne peut
// pas prouver qu'on sait analyser, donc un chapitre qui n'a que des questions
// de Bloom 1 plafonne ses notions à 10 points.
//
// ── L'avancement affiché ────────────────────────────────────────────────────
//
// L'avancement se lit sur le score EXACT (pas sur le niveau), et sature à 30 :
// les 3 premiers niveaux valent 100 %, le 4e est du bonus.
//
//     avancement d'une notion = min(score, 30) / 30
//     avancement d'un chapitre = Σ min(score, 30) / (30 × nombre de notions)
//
// ⚠️ Une question n'alimente que les notions qui lui sont explicitement
// reliées (`exam_question_bricks`). Une question sans notion reliée ne fait
// donc progresser aucune barre — c'est le maillon à alimenter côté contenu.

import { getSupabaseServerClient } from '@/lib/supabase';

export const POINTS_PER_LEVEL = 10;
/** 4 niveaux de Bloom utiles → score maximum de 40. */
export const MAX_LEVEL = 4;
export const MASTERY_MAX = MAX_LEVEL * POINTS_PER_LEVEL;
/** Seuls les 3 premiers niveaux comptent pour un avancement de 100 %. */
export const COMPLETION_SCORE = 3 * POINTS_PER_LEVEL;
export const CATCHUP_RATE = 0.4;
export const FLAT_BONUS = 1.5;

/** Cible de score d'une question, d'après son niveau de Bloom visé (1..6). */
export function questionTarget(bloomLevel: number): number {
  const level = Math.min(Math.max(Math.round(bloomLevel), 1), MAX_LEVEL);
  return level * POINTS_PER_LEVEL;
}

/** Points rapportés par une bonne réponse — voir le modèle en tête de fichier. */
export function masteryGain(score: number, target: number): number {
  if (score >= target) return 0;
  const room = target - score;
  return Math.floor(Math.min(room, room * CATCHUP_RATE + FLAT_BONUS));
}

/** Niveau de Bloom atteint, dérivé du score (colonne `bloom_level`). */
export function masteryLevel(score: number): number {
  return Math.min(MAX_LEVEL, Math.floor(score / POINTS_PER_LEVEL));
}

/** Avancement d'une notion, de 0 à 1. */
export function notionCompletion(score: number): number {
  return Math.min(score, COMPLETION_SCORE) / COMPLETION_SCORE;
}

/** Moyenne des avancements d'un ensemble de notions, en pourcentage entier. */
function percentOf(scores: number[]): number {
  if (scores.length === 0) return 0;
  const total = scores.reduce((sum, s) => sum + Math.min(s, COMPLETION_SCORE), 0);
  return Math.round((total / (COMPLETION_SCORE * scores.length)) * 100);
}

/**
 * Crédite les notions reliées à une question après une bonne réponse.
 * Retourne `true` si au moins un score a bougé (l'appelant revalide alors le
 * cache de l'atelier pour que les barres se mettent à jour).
 */
export async function rewardCorrectAnswer(
  workshopId: string,
  userId: string,
  questionId: string
): Promise<boolean> {
  const supabase = getSupabaseServerClient();

  const [{ data: question }, { data: links }] = await Promise.all([
    supabase
      .from('exam_questions')
      .select('bloom_level')
      .eq('id', questionId)
      .eq('workshop_id', workshopId)
      .maybeSingle(),
    // table de jonction encore nommée bricks en base — renommage différé, voir docs/backlog.md
    supabase.from('exam_question_bricks').select('brick_id').eq('question_id', questionId),
  ]);

  if (!question) return false;

  const linkedIds = (links ?? []).map((l) => l.brick_id as string);
  if (linkedIds.length === 0) return false;

  // Les notions reliées sont re-filtrées sur l'atelier : la jonction ne porte
  // pas de workshop_id, on ne veut pas créditer la notion d'un autre atelier.
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: owned } = await supabase
    .from('workshop_bricks')
    .select('id')
    .eq('workshop_id', workshopId)
    .in('id', linkedIds);

  const brickIds = (owned ?? []).map((b) => b.id as string);
  if (brickIds.length === 0) return false;

  const { data: existing, error } = await supabase
    .from('brick_mastery')
    .select('brick_id, score')
    .eq('user_id', userId)
    .in('brick_id', brickIds);

  if (error) {
    console.error('rewardCorrectAnswer read error:', error);
    return false;
  }

  const scores = new Map<string, number>();
  for (const row of existing ?? []) scores.set(row.brick_id as string, row.score as number);

  const target = questionTarget((question.bloom_level as number) ?? 1);
  const rows = brickIds
    .map((brickId) => {
      const score = scores.get(brickId) ?? 0;
      const gain = masteryGain(score, target);
      return gain > 0
        ? {
            user_id: userId,
            brick_id: brickId,
            score: score + gain,
            bloom_level: masteryLevel(score + gain),
            updated_at: new Date().toISOString(),
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return false;

  const { error: upsertError } = await supabase
    .from('brick_mastery')
    .upsert(rows, { onConflict: 'user_id,brick_id' });

  if (upsertError) {
    console.error('rewardCorrectAnswer upsert error:', upsertError);
    return false;
  }

  return true;
}

export type ParcoursProgress = {
  /** Avancement de l'atelier entier, 0-100 (toutes ses notions, rangées ou non). */
  workshopPercent: number;
  /** Avancement par chapitre, 0-100. Un chapitre sans notion vaut 0. */
  chapterPercent: Record<string, number>;
};

/** Avancement d'un utilisateur sur un atelier, pour les barres de l'onglet parcours. */
export async function getParcoursProgress(workshopId: string, userId: string): Promise<ParcoursProgress> {
  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notions, error } = await supabase
    .from('workshop_bricks')
    .select('id, chapter_id')
    .eq('workshop_id', workshopId);

  if (error) {
    console.error('getParcoursProgress error:', error);
    return { workshopPercent: 0, chapterPercent: {} };
  }

  const all = notions ?? [];
  if (all.length === 0) return { workshopPercent: 0, chapterPercent: {} };

  const { data: mastery, error: masteryError } = await supabase
    .from('brick_mastery')
    .select('brick_id, score')
    .eq('user_id', userId)
    .in(
      'brick_id',
      all.map((n) => n.id as string)
    );

  if (masteryError) console.error('getParcoursProgress mastery error:', masteryError);

  const scores = new Map<string, number>();
  for (const row of mastery ?? []) scores.set(row.brick_id as string, row.score as number);

  const byChapter = new Map<string, number[]>();
  for (const notion of all) {
    const chapterId = notion.chapter_id as string | null;
    if (!chapterId) continue;
    const list = byChapter.get(chapterId) ?? [];
    list.push(scores.get(notion.id as string) ?? 0);
    byChapter.set(chapterId, list);
  }

  const chapterPercent: Record<string, number> = {};
  for (const [chapterId, list] of byChapter) chapterPercent[chapterId] = percentOf(list);

  return {
    workshopPercent: percentOf(all.map((n) => scores.get(n.id as string) ?? 0)),
    chapterPercent,
  };
}
