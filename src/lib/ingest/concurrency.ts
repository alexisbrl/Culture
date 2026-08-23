// Exécution en parallèle, bornée — module PUR, sans réseau ni base.
//
// L'ingestion enchaînait ses appels un par un : sur un import de 4 chapitres et
// 76 notions, ça fait ~13 appels à la file, chacun avec sa réflexion, soit
// plusieurs minutes d'attente devant une barre qui ne bouge pas. Le modèle n'y
// est pour rien — c'est l'orchestration qui était sérielle.

/** Combien d'appels au modèle en vol en même temps.
 *
 *  Ni 1 (le comportement d'avant), ni « tout » : une rafale de dix appels part
 *  en limitation de débit, et une erreur 429 au milieu d'un import coûte plus
 *  cher en confusion que le temps qu'elle fait gagner. Quatre est le compromis —
 *  il divise l'attente par ~4 tout en restant loin des seuils. */
export const INGEST_CONCURRENCY = 4;

/** Concurrence de la passe QUESTIONS, plus large — et ce n'est pas un réglage
 *  timide faute d'avoir osé.
 *
 *  Ces appels ne partagent rien : la passe ne porte aucun document, donc aucun
 *  cache de prompt à amorcer, et chaque lot écrit ses propres questions. Rien
 *  n'empêcherait, en théorie, de tous les lancer d'un coup. Trois plafonds réels
 *  s'y opposent, et aucun n'est le modèle :
 *
 *  1. **Le navigateur.** Chaque lot est une server action, donc une requête HTTP
 *     vers notre propre serveur. En HTTP/1.1 — ce qu'est `next dev` en local —
 *     un navigateur ouvre ~6 connexions par origine : au-delà, les appels font
 *     la queue **chez nous**, sans que rien ne le signale. En HTTP/2 (Vercel),
 *     la limite monte à ~100 flux.
 *  2. **Le quota du fournisseur**, en requêtes ET en tokens par minute. Un
 *     dépassement n'échoue pas franchement : le SDK réessaie tout seul (429 et
 *     5xx, deux fois, avec attente). Une rafale trop large se paie donc en
 *     attente invisible, pas en erreur — le pire des deux mondes pour diagnostiquer.
 *  3. **Les fonctions serveur.** Chaque appel occupe une invocation le temps de
 *     la réponse du modèle, soit des dizaines de secondes.
 *
 *  Douze tient sous les trois. Au-delà, on n'accélère plus : on empile. */
export const QUESTIONS_CONCURRENCY = 12;

/** `Promise.all` avec un plafond d'appels simultanés, **et l'ordre préservé**.
 *
 *  L'ordre du résultat suit celui de l'entrée, jamais celui des réponses : les
 *  lots de questions sont écrits en base par leur propre appel, mais tout ce qui
 *  est compté ou affiché ensuite (rejets, totaux) doit rester reproductible d'un
 *  import à l'autre.
 *
 *  `onSettled` est appelé après **chaque** élément terminé, pour la progression :
 *  avec des appels concurrents, il n'y a plus « l'élément en cours », seulement
 *  un nombre d'éléments faits — c'est la seule chose qu'on puisse honnêtement
 *  afficher.
 *
 *  La première erreur interrompt : elle remonte à l'appelant, et les tâches
 *  déjà lancées finissent sans que leur résultat soit utilisé. On ne tente pas
 *  d'annuler ce qui est en vol — un appel au modèle déjà parti est déjà payé,
 *  l'interrompre ne rembourse rien. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
  onSettled?: (done: number, total: number) => void,
): Promise<R[]> {
  if (limit < 1) throw new Error(`Concurrence invalide : ${limit}`);
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  // Autant de « fils » que la limite, qui se servent dans la même file. Un fil
  // qui finit tôt reprend aussitôt du travail : c'est ce qui évite qu'un lot
  // lent bloque les suivants, contrairement à un découpage en tranches fixes.
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
      done += 1;
      onSettled?.(done, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
