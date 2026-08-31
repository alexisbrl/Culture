// La recharge automatique : reconstituer le stock de questions d'un chapitre
// pendant qu'un membre travaille.
//
// ── Qui la déclenche, et quand ──────────────────────────────────────────────
//
// Le lancement d'un exercice, et rien d'autre (29/08/2026). C'est le seul moment
// où l'on sait à la fois QUI travaille et SUR QUOI — les deux dont le radar a
// besoin. Elle part APRÈS que la question est partie à l'écran : le membre
// n'attend jamais après elle, et elle survit à la fermeture de l'onglet (une
// fonction serveur vit jusqu'à 300 s sur le plan gratuit de l'hébergeur, une
// recharge tient largement dedans).
//
// ── Ce qu'elle fait produire ────────────────────────────────────────────────
//
// Ce que le radar déclare en manque, pour le membre qui lance : des couples
// (notion × niveau) avec un nombre pour chacun. Un seul couple sous le seuil
// suffit à déclencher, et on remet alors TOUS les couples du chapitre à la
// cible — sinon on rechargerait un exercice sur deux.
//
// ── Trois garde-fous, parce que personne ne la surveille ────────────────────
//
// C'est le seul appel payant du produit que ni gestionnaire ni membre ne décide.
// D'où :
//   1. un PLAFOND par recharge (`MAX_REFILL_QUESTIONS`) — ce qui n'est pas
//      produit reste en manque, et la recharge suivante le reprendra ;
//   2. un DÉLAI DE GARDE : deux exercices lancés coup sur coup ne déclenchent
//      qu'une recharge, et une recharge qui vient d'échouer ne repart pas en
//      boucle ;
//   3. une TRACE : chaque recharge ouvre un lot d'import comme n'importe quelle
//      génération, donc son coût est compté et son contenu reste annulable.

import { getSupabaseServerClient } from '@/lib/supabase';
import { chapterShortages } from '@/lib/workshops/parcoursRadar';
import { createImport } from './ingest';
import { ingestParcoursQuestions } from './run';
import { MAX_REFILL_QUESTIONS, capDemand, demandFromShortages, demandTotal } from './demand';

/** Deux exercices lancés dans la foulée ne rechargent qu'une fois. Assez long
 *  pour couvrir un exercice entier, assez court pour qu'un membre qui revient
 *  plus tard trouve un stock reconstitué. */
export const REFILL_COOLDOWN_MS = 10 * 60 * 1000;

/** Au-delà, on rend la main : la fonction serveur a une durée de vie bornée, et
 *  ce qui reste en manque sera repris au prochain lancement d'exercice. */
const REFILL_DEADLINE_MS = 200_000;

export type RefillOutcome = {
  /** Une recharge a-t-elle été lancée ? `false` = rien ne manquait, ou une
   *  recharge trop récente tient déjà le terrain. */
  triggered: boolean;
  /** Questions réellement écrites. */
  written: number;
  /** Le lot d'import ouvert, pour la trace et l'annulation. */
  importId?: string;
};

/** Une recharge a-t-elle déjà eu lieu récemment sur ce chapitre ? */
async function rechargedRecently(workshopId: string, chapterId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - REFILL_COOLDOWN_MS).toISOString();

  const { data, error } = await supabase
    .from('ai_imports')
    .select('id')
    .eq('workshop_id', workshopId)
    .eq('scope->>refillChapter', chapterId)
    .gte('created_at', since)
    .limit(1);

  if (error) {
    // On ne sait pas : on s'abstient. Rater une recharge coûte une question de
    // moins ; en lancer une de trop coûte de l'argent.
    console.error('rechargedRecently error:', error);
    return true;
  }
  return (data ?? []).length > 0;
}

/**
 * Recharge le chapitre si le radar en signale le besoin, pour le membre qui
 * vient de lancer un exercice.
 *
 * Ne lève jamais : c'est une tâche de fond, déclenchée par personne. Un échec
 * doit se voir dans les journaux, pas casser l'exercice en cours.
 */
export async function refillChapter(
  workshopId: string,
  chapterId: string,
  userId: string
): Promise<RefillOutcome> {
  try {
    const shortages = await chapterShortages(workshopId, chapterId, userId);
    if (shortages.length === 0) return { triggered: false, written: 0 };

    if (await rechargedRecently(workshopId, chapterId)) return { triggered: false, written: 0 };

    const demand = capDemand(demandFromShortages(shortages), MAX_REFILL_QUESTIONS);
    if (demandTotal(demand) === 0) return { triggered: false, written: 0 };

    const supabase = getSupabaseServerClient();
    const { data: chapterRow, error } = await supabase
      .from('workshop_chapters')
      .select('id, name, hidden')
      .eq('workshop_id', workshopId)
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // Un chapitre caché est sorti du parcours (29/08/2026) : plus aucun exercice
    // ne s'y lance, donc recharger son stock serait de l'argent dépensé pour des
    // questions que personne ne verra. Le tirage refuse déjà en amont — ce filet
    // couvre le cas où un chapitre est écarté pendant qu'une recharge est en
    // vol, la recharge étant lancée en tâche de fond après la réponse.
    if (!chapterRow || chapterRow.hidden === true) return { triggered: false, written: 0 };

    const chapter = { id: chapterRow.id as string, name: chapterRow.name as string };

    // Le lot est ouvert AVANT le premier appel : c'est lui qui tient le délai de
    // garde, donc il doit exister même si la génération échoue ensuite.
    const importId = await createImport(workshopId, userId, {
      scope: { refillChapter: chapterId, demand: demandTotal(demand) },
    });

    const deadline = Date.now() + REFILL_DEADLINE_MS;
    let written = 0;
    let batchIndex = 0;
    let batches = 1;

    while (batchIndex < batches && Date.now() < deadline) {
      const result = await ingestParcoursQuestions(workshopId, userId, importId, chapter, batchIndex, {
        demand,
      });
      batches = result.batches;
      written += result.written;
      batchIndex += 1;
    }

    console.info('[parcours] recharge', { workshopId, chapterId, userId, importId, written });
    return { triggered: true, written, importId };
  } catch (err) {
    console.error('refillChapter error:', err);
    return { triggered: false, written: 0 };
  }
}
