// Une question ne s'écrit que sur des notions qui existent — 08/10/2026.
//
// Une génération de questions ne verrouille pas le programme
// (@/lib/workshops/programLock) : l'utilisateur peut supprimer une notion
// pendant qu'on lui écrit des questions. Ces questions-là ne doivent pas
// apparaître — ni rattachées à une notion disparue (la base le refuserait, et
// tout le lot tombait avec), ni rattachées à rien.
//
// **Fonction pure** : c'est le contrat d'une entrée non fiable (la sortie du
// modèle, croisée avec l'état de la base), donc testée seule.

type GroupShape = { questions: readonly { notions: readonly { ref: string }[] }[] };

/** Garde les groupes dont CHAQUE question a au moins une notion, et dont
 *  chaque notion résout vers une notion vivante. Un groupe se garde entier ou
 *  pas du tout : une question principale sans ses sous-questions, ou
 *  l'inverse, n'aurait plus de sens. */
export function groupsWithLiveNotions<G extends GroupShape>(
  groups: readonly G[],
  resolveRef: (ref: string) => string | null,
  live: ReadonlySet<string>,
): { kept: G[]; dropped: number } {
  const kept: G[] = [];
  let dropped = 0;
  for (const group of groups) {
    const alive = group.questions.length > 0 && group.questions.every((question) =>
      question.notions.length > 0 &&
      question.notions.every((notion) => {
        const id = resolveRef(notion.ref);
        return id !== null && live.has(id);
      }));
    if (alive) kept.push(group);
    else dropped += 1;
  }
  return { kept, dropped };
}
