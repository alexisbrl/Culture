// Suppression d'un libellé AVEC les questions qui le portent (27/09/2026).
//
// Opération destructrice par lot sur des questions saisies à la main : c'est
// exactement le cas que CLAUDE.md §7 veut couvert par un test
// (`tests/unit/labelDeletion.test.ts`). Le client est donc reçu en paramètre —
// le test lui passe un double, jamais la vraie base, partagée avec la
// production.
//
// Toute question qui porte le libellé part, quels que soient ses autres
// libellés (arbitrage d'Alexis du 27/09/2026). Le retrait des questions des
// examens enregistrés se fait à part, par l'appelant, comme pour la
// suppression d'une question seule.

import type { getSupabaseServerClient } from '@/lib/supabase';

type Client = ReturnType<typeof getSupabaseServerClient>;

/** Identifiants des questions qui portent le libellé. */
export function questionsCarryingLabel(questions: readonly { id: string; pools: readonly string[] }[], poolId: string): string[] {
  return questions.filter((q) => q.pools.includes(poolId)).map((q) => q.id);
}

/** Supprime d'abord les questions, puis le libellé : si la première étape
 *  échoue, le libellé reste, et rien n'a disparu sans qu'on le sache. Chaque
 *  suppression est bornée à l'atelier — un identifiant venu du client ne peut
 *  pas viser la question d'un autre atelier. */
export async function deletePoolWithQuestions(
  supabase: Client,
  workshopId: string,
  poolId: string,
  questionIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(questionIds.filter((id) => id.length > 0))];
  if (ids.length > 0) {
    const { error } = await supabase.from('exam_questions').delete().eq('workshop_id', workshopId).in('id', ids);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from('exam_pools').delete().eq('workshop_id', workshopId).eq('id', poolId);
  if (error) throw new Error(error.message);
}

/** Ce que coûterait la suppression, pour la fenêtre de confirmation : les
 *  questions qui partiraient, celles d'entre elles présentes dans un examen
 *  enregistré, et le nombre de ces examens. */
export type LabelImpact = { questions: number; inExams: number; exams: number };
