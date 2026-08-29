// Une génération à la fois, par atelier — 29/08/2026.
//
// ─── Le problème ─────────────────────────────────────────────────────────────
//
// L'enchaînement des passes vit dans le NAVIGATEUR (voir l'en-tête de
// `src/components/ai/AiGenerationDialog.tsx`) : rien n'empêchait d'ouvrir un
// second onglet sur le même atelier et d'y lancer une seconde génération. Les
// deux écrivent alors les mêmes chapitres et les mêmes notions en même temps, et
// le ménage de fin de l'une (`finishIngestion`) peut cacher les chapitres que
// l'autre vient tout juste de remplir. Le résultat n'est pas « deux fois plus de
// contenu » : c'est un programme incohérent, et deux fois la facture.
//
// **Sur deux ateliers différents, on ne bloque rien.** Il n'y a là aucune
// écriture partagée — seul le débit vers le fournisseur l'est, et il se régule
// tout seul (voir `concurrency.ts`). Interdire aurait été une gêne sans contrepartie.
//
// ─── Un signe de vie, pas un verrou ──────────────────────────────────────────
//
// Un booléen posé par un onglet qui meurt brutalement (plantage, coupure,
// machine éteinte) ne se relâche jamais : l'atelier resterait bloqué sans que
// personne puisse rien y faire, et sans même savoir pourquoi. Le verrou est donc
// un BATTEMENT rafraîchi par l'onglet qui travaille, et il expire de lui-même.
//
// Deux façons de le relâcher, et les deux comptent :
//   • `closed_at` — la fin propre (terminé, arrêté, en erreur). Immédiate.
//   • l'expiration — plus de battement depuis `LIVE_TIMEOUT_MS`. Le filet.
//
// Les lots de RECHARGE automatique n'ont jamais de battement (`live: false`) :
// ils tournent en tâche de fond, l'utilisateur n'en sait rien, et lui refuser un
// lancement à cause d'eux serait incompréhensible.

import { getSupabaseServerClient } from '@/lib/supabase';

/** Sans battement depuis ce délai, le lot est tenu pour abandonné.
 *
 *  Le choix se joue entre deux ennuis : trop court, un onglet momentanément
 *  ralenti perd son verrou et une seconde génération peut partir par-dessus ;
 *  trop long, un onglet fermé brutalement bloque l'atelier pour rien. L'onglet
 *  bat toutes les 30 s (`AiGenerationDialog`), donc deux minutes laissent passer
 *  trois battements manqués d'affilée avant de conclure. */
export const LIVE_TIMEOUT_MS = 2 * 60 * 1000;

/** Le refus, sous une forme que l'appelant peut RECONNAÎTRE — et non une phrase
 *  à afficher. Le message vu par l'utilisateur est traduit côté écran (clé
 *  `ai.busy`) : `lib/` ne connaît pas la langue de qui regarde. */
export const BUSY_ERROR = 'INGEST_BUSY';

/** Le lot vivant de cet atelier, s'il y en a un — sinon `null`.
 *
 *  ⚠️ Sur erreur de lecture, on répond `null` : on ne sait pas, et refuser un
 *  lancement sur une base incertaine serait la pire des réponses (l'utilisateur
 *  n'aurait aucun moyen de s'en sortir). Le risque symétrique — deux générations
 *  simultanées — suppose que la base soit en panne au même instant. */
export async function liveImportOf(workshopId: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - LIVE_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from('ai_imports')
    .select('id')
    .eq('workshop_id', workshopId)
    .is('closed_at', null)
    .gte('beat_at', since)
    .order('beat_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('liveImportOf error:', error);
    return null;
  }
  return (data ?? [])[0]?.id ?? null;
}

/** Le battement de l'onglet qui pilote un lot. **Ne lève jamais** : un battement
 *  perdu ne doit pas interrompre une génération en cours — au pire le verrou
 *  expire, et le seul effet est qu'un second lancement redevient possible. */
export async function beatImport(importId: string): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    // `closed_at is null` : un lot déjà refermé ne se ranime pas. Sans ce
    // filtre, un appel en retard rouvrirait un verrou que personne ne tient.
    const { error } = await supabase
      .from('ai_imports')
      .update({ beat_at: new Date().toISOString() })
      .eq('id', importId)
      .is('closed_at', null);
    if (error) console.error('beatImport error:', error);
  } catch (err) {
    console.error('beatImport error:', err);
  }
}

/** Referme un lot : la génération est terminée, arrêtée ou en échec. **Ne lève
 *  jamais** — c'est un relâchement de verrou, et l'expiration reste derrière. */
export async function closeImport(importId: string): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from('ai_imports')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', importId);
    if (error) console.error('closeImport error:', error);
  } catch (err) {
    console.error('closeImport error:', err);
  }
}
