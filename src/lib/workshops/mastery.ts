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
 * Crédite les notions d'une question après une bonne réponse. Retourne `true`
 * si au moins un score a bougé (l'appelant revalide alors le cache de l'atelier
 * pour que les barres se mettent à jour).
 *
 * Les notions et le niveau de Bloom sont fournis par l'appelant, qui les a lus
 * côté serveur (`gradeParcoursAnswer`) — jamais reçus du client. Chaque question
 * d'un groupe a les siennes, la principale comme les liées : il n'y a plus de
 * relecture par identifiant de question ici, la correction connaît déjà tout.
 */
export async function rewardAnsweredQuestion(
  workshopId: string,
  userId: string,
  target: { notionIds: string[]; bloomLevel: number }
): Promise<boolean> {
  return await creditNotions(workshopId, userId, target.notionIds, target.bloomLevel);
}

async function creditNotions(
  workshopId: string,
  userId: string,
  linkedIds: string[],
  bloomLevel: number
): Promise<boolean> {
  const supabase = getSupabaseServerClient();

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

  const target = questionTarget(bloomLevel);
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

/** Scores de maîtrise d'un membre sur un lot de notions. Une notion absente du
 *  résultat n'a jamais été travaillée : elle vaut 0, et c'est à l'appelant de le
 *  lire ainsi plutôt que d'écrire des zéros en base.
 *
 *  Sert au tirage du parcours (`drawParcoursQuestion`), qui décide de ce qu'une
 *  question a le droit de demander d'après ce qui est déjà atteint. */
export async function getNotionScores(
  userId: string,
  notionIds: string[]
): Promise<Record<string, number>> {
  if (notionIds.length === 0) return {};

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('brick_mastery')
    .select('brick_id, score')
    .eq('user_id', userId)
    .in('brick_id', notionIds);

  if (error) {
    console.error('getNotionScores error:', error);
    return {};
  }

  const scores: Record<string, number> = {};
  for (const row of data ?? []) scores[row.brick_id as string] = row.score as number;
  return scores;
}

export type ParcoursProgress = {
  /** Avancement de l'atelier entier, 0-100, sur ses notions **rangées dans un
   *  chapitre** — voir `getParcoursProgress` pour la raison. */
  workshopPercent: number;
  /** Avancement par chapitre, 0-100. Un chapitre sans notion vaut 0. */
  chapterPercent: Record<string, number>;
};

/** Avancement d'un utilisateur sur un atelier, pour les barres de l'onglet parcours. */
export async function getParcoursProgress(workshopId: string, userId: string): Promise<ParcoursProgress> {
  const supabase = getSupabaseServerClient();

  // Deux lectures indépendantes → en parallèle (règle N+1).
  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const [{ data: notions, error }, { data: chapterRows }] = await Promise.all([
    supabase.from('workshop_bricks').select('id, chapter_id').eq('workshop_id', workshopId),
    supabase.from('workshop_chapters').select('id, hidden').eq('workshop_id', workshopId),
  ]);

  if (error) {
    console.error('getParcoursProgress error:', error);
    return { workshopPercent: 0, chapterPercent: {} };
  }

  // Les chapitres cachés sont hors du parcours (29/08/2026) : aucun exercice ne
  // s'y lance, donc leurs notions ne peuvent plus progresser. Les compter dans
  // l'avancement de l'atelier plafonnerait la barre sous 100 % sans que le
  // membre puisse voir ce qui manque — exactement le travers corrigé le
  // 19/08/2026 pour les notions sans chapitre.
  const hiddenChapters = new Set(
    (chapterRows ?? []).filter((c) => c.hidden === true).map((c) => c.id as string),
  );

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

  // Les notions SANS chapitre ne comptent nulle part (19/08/2026). Elles
  // comptaient auparavant dans l'avancement de l'atelier, alors qu'aucun
  // exercice ne peut les faire progresser : le tirage se fait par chapitre
  // (`drawParcoursQuestion`) et elles n'ont pas de pot. Une seule notion laissée
  // hors chapitre plafonnait donc la barre de l'atelier sous 100 %, sans que le
  // membre puisse voir ce qui manque ni y remédier. « Sans chapitre » reste un
  // sas côté gestion (notion créée à la volée, chapitre supprimé, ingestion IA
  // à venir) : ce qui y attend n'est pas encore du programme.
  const byChapter = new Map<string, number[]>();
  const rangees: number[] = [];
  for (const notion of all) {
    const chapterId = notion.chapter_id as string | null;
    if (!chapterId || hiddenChapters.has(chapterId)) continue;
    const score = scores.get(notion.id as string) ?? 0;
    rangees.push(score);
    const list = byChapter.get(chapterId) ?? [];
    list.push(score);
    byChapter.set(chapterId, list);
  }

  const chapterPercent: Record<string, number> = {};
  for (const [chapterId, list] of byChapter) chapterPercent[chapterId] = percentOf(list);

  return {
    // `percentOf` rend 0 sur une liste vide : un atelier dont aucune notion
    // n'est rangée affiche donc 0 %, comme un atelier sans notion du tout.
    workshopPercent: percentOf(rangees),
    chapterPercent,
  };
}

// ⚠️ MÉCANISME DE TEST TEMPORAIRE — à retirer avant la mise en service.
//
// Remet à zéro la progression d'UN utilisateur sur UN atelier, pour pouvoir
// rejouer indéfiniment les mêmes questions pendant la mise au point du parcours
// sans avoir à en créer de nouvelles. Même esprit que l'allowlist Premium de
// `core.ts` : un bloc isolé, facile à supprimer d'un seul tenant.
//
// Périmètre volontairement étroit : les seules lignes touchées sont celles de
// CET utilisateur sur les notions de CET atelier. Un `delete` sur `user_id`
// seul effacerait sa progression sur tous ses autres ateliers.
//
// L'historique des questions déjà répondues (`parcours_asked`) se purge en même
// temps, mais depuis le wrapper `resetMyParcoursProgress` : il vit dans exam.ts,
// qui lit déjà la maîtrise d'ici — l'appeler ici ferait tourner les deux modules
// en rond.
export async function resetUserMastery(
  workshopId: string,
  userId: string
): Promise<{ success: boolean; cleared: number; error?: string }> {
  const supabase = getSupabaseServerClient();

  // table encore nommée bricks en base — renommage différé, voir docs/backlog.md
  const { data: notions, error } = await supabase
    .from('workshop_bricks')
    .select('id')
    .eq('workshop_id', workshopId);

  if (error) {
    console.error('resetUserMastery notions error:', error);
    return { success: false, cleared: 0, error: error.message };
  }

  const ids = (notions ?? []).map((n) => n.id as string);
  // Aucune notion dans l'atelier : rien à effacer, et surtout pas de `in()` vide
  // — PostgREST le traduirait par un filtre qui ne restreint rien.
  if (ids.length === 0) return { success: true, cleared: 0 };

  const { data: deleted, error: deleteError } = await supabase
    .from('brick_mastery')
    .delete()
    .eq('user_id', userId)
    .in('brick_id', ids)
    .select('id');

  if (deleteError) {
    console.error('resetUserMastery delete error:', deleteError);
    return { success: false, cleared: 0, error: deleteError.message };
  }

  return { success: true, cleared: (deleted ?? []).length };
}
