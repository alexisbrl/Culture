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

/** Concurrence de la passe QUESTIONS — **50 depuis le 22/09/2026** (12 avant).
 *
 *  Ces appels ne partagent rien : la passe ne porte aucun document, et chaque
 *  appel écrit ses propres questions. 50 couvre les plus gros cas en une seule
 *  vague (un atelier de seize chapitres à trois appels, un examen de 200
 *  questions à six par appel). On garde un plafond pour une seule raison :
 *  borner une boucle emballée, qui dépenserait seule.
 *
 *  Les plafonds réels, vérifiés le 22/09/2026, sont tous loin au-dessus :
 *
 *  1. **Le navigateur.** Chaque appel est une server action, donc une requête
 *     HTTP vers notre serveur. En ligne (HTTP/2), ~100 flux par origine. En
 *     local (`next dev`, HTTP/1.1), ~6 connexions : au-delà, les appels y font la
 *     queue **chez nous**, sans que rien ne le signale — c'est normal en
 *     développement, pas en production.
 *  2. **Le fournisseur.** DeepSeek : 2 500 requêtes simultanées **par compte**,
 *     donc partagées entre tous les utilisateurs, relevables gratuitement sur
 *     demande ; au-delà, une erreur 429. Anthropic plafonne en requêtes et en
 *     tokens par minute selon le palier du compte.
 *  3. **L'hébergeur.** Jusqu'à 30 000 exécutions simultanées sur l'offre
 *     actuelle : un appel qui attend le modèle n'en bloque aucun autre.
 *
 *  ⚠️ **Ces appels passent par une route d'API, jamais par des server actions**
 *  (`app/api/ingest`). Le navigateur envoie les server actions une par une :
 *  lancées « à 50 », elles s'exécutaient en file — constaté au journal le
 *  24/09/2026, chaque appel démarrant à la seconde où finissait le précédent. */
export const QUESTIONS_CONCURRENCY = 50;

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
