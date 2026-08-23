'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

/** Intervalle par défaut entre deux relectures d'une même donnée. Assez court
 *  pour qu'une demande d'adhésion apparaisse « comme un mail » sans qu'on
 *  rafraîchisse, assez long pour ne pas transformer chaque onglet ouvert en
 *  générateur d'appels serveur. */
const DEFAULT_INTERVAL_MS = 30_000;

/** Deux relectures ne peuvent pas se suivre de plus près que ça. `focus` et
 *  `visibilitychange` se déclenchent tous les deux quand on revient sur
 *  l'onglet : sans ce plancher, un simple retour lancerait deux appels. */
const MIN_GAP_MS = 1_000;

/** Garde une donnée serveur à jour sans que l'utilisateur ait à rafraîchir.
 *
 *  Le principe retenu pour tout le site (22/08/2026) : **sondage léger + reprise
 *  immédiate au retour sur l'onglet**. Pas de push temps réel — toute la base
 *  est lue exclusivement côté serveur avec la service role key, la RLS est
 *  active sans aucune policy (`.claude/rules/server-architecture.md`), et
 *  écouter Supabase depuis le navigateur voudrait dire percer ce modèle. Ici,
 *  on rappelle simplement la server action qui servait déjà au premier
 *  chargement : rien de nouveau côté serveur, rien de nouveau côté sécurité.
 *
 *  Ce que ça donne concrètement : au maximum `intervalMs` de retard quand
 *  l'onglet est au premier plan, et **instantané** dès qu'on y revient — ce qui
 *  est le moment où l'on regarde, donc le seul qui compte vraiment.
 *
 *  **On ne sonde pas un onglet caché.** L'intervalle est démonté quand la page
 *  passe en arrière-plan et remonté au retour, précédé d'une relecture. Un
 *  onglet oublié pendant la nuit ne coûte donc rien.
 *
 *  ## Ce que ce hook ne doit PAS servir à rafraîchir
 *
 *  Tout ce que l'utilisateur est en train de manipuler. Une donnée qui se
 *  réordonne sous les doigts fait perdre la ligne qu'on visait. Précédent posé
 *  en règle : la répartition « dans le groupe / autres membres » des paramètres
 *  d'atelier reste figée tant qu'on ne change pas de groupe, et cocher une case
 *  ne fait pas sauter la ligne d'une liste à l'autre — c'est voulu, et un
 *  sondage ne doit pas le défaire. Sonder ce qui **arrive** (demandes,
 *  invitations, notifications), pas ce qu'on **édite**.
 *
 *  ## Les deux pièges, tenus par le hook lui-même
 *
 *  1. *Une réponse en vol ne doit pas ressusciter ce qu'on vient de traiter.*
 *     Accepter une demande la retire de la liste ; une lecture partie AVANT cet
 *     appel peut revenir après, avec la demande encore dedans. D'où
 *     `invalidate()` : à appeler après toute modification locale réussie, il
 *     périme toute réponse déjà partie. Sans lui, la ligne réapparaîtrait
 *     quelques secondes après avoir été traitée.
 *  2. *Jamais deux lectures en parallèle.* Une lecture lente ne doit pas se
 *     faire doubler par la suivante — la plus ancienne pourrait arriver en
 *     dernier et écraser la plus fraîche.
 *
 *  `fetcher` et `apply` sont lus dans des références tenues à jour à chaque
 *  rendu : l'appelant peut passer des fonctions fléchées écrites sur place sans
 *  que l'intervalle soit démonté et remonté à chaque rendu (même motif que
 *  `useDismissOnOutsideClick`).
 *
 *  Une lecture qui échoue est journalisée et sans autre conséquence : c'est un
 *  rafraîchissement d'agrément, il ne doit jamais casser la page ni vider une
 *  liste déjà affichée.
 *
 *  ```tsx
 *  const requests = useLiveData(() => getJoinRequests(workshopId), setJoinRequests);
 *  // …après une modification locale réussie :
 *  requests.invalidate();
 *  ```
 *
 *  @param fetcher  la lecture serveur, typiquement la server action déjà utilisée au premier chargement
 *  @param apply    reçoit le résultat ; c'est lui qui pose l'état
 *  @param options  `intervalMs` (défaut 30 s) et `enabled` (défaut vrai — à faux, rien n'est lu du tout)
 */
export function useLiveData<T>(
  fetcher: () => Promise<T>,
  apply: (data: T) => void,
  options: { intervalMs?: number; enabled?: boolean } = {},
): { refresh: () => void; invalidate: () => void } {
  const { intervalMs = DEFAULT_INTERVAL_MS, enabled = true } = options;

  const fetcherRef = useRef(fetcher);
  const applyRef = useRef(apply);
  useEffect(() => {
    fetcherRef.current = fetcher;
    applyRef.current = apply;
  });

  // Jeton de fraîcheur : toute réponse partie sous un jeton périmé est jetée
  // (cf. piège 1). `invalidate()` l'incrémente, et le démontage aussi — une
  // réponse qui arrive après ne doit poser aucun état.
  const epochRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastRunRef = useRef(0);

  // La lecture elle-même. Stable pour toute la vie du composant : elle ne lit
  // que des références, donc elle n'a jamais à être redéfinie — ce qui évite
  // aussi de démonter et remonter l'intervalle à chaque rendu.
  const run = useCallback(async () => {
    if (inFlightRef.current) return;                       // piège 2
    const now = Date.now();
    if (now - lastRunRef.current < MIN_GAP_MS) return;     // `focus` + `visibilitychange`
    lastRunRef.current = now;
    inFlightRef.current = true;
    const epoch = epochRef.current;
    try {
      const data = await fetcherRef.current();
      if (epoch === epochRef.current) applyRef.current(data);   // piège 1
    } catch (err) {
      console.error('rafraîchissement en direct échoué', err);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const invalidate = useCallback(() => { epochRef.current += 1; }, []);
  const refresh = useCallback(() => { void run(); }, [run]);
  const control = useMemo(() => ({ refresh, invalidate }), [refresh, invalidate]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;

    // On ne sonde pas un onglet caché : l'intervalle n'existe que pendant que
    // la page est visible, et revenir dessus relit tout de suite.
    function arm() {
      if (timer !== undefined) return;
      timer = window.setInterval(() => { void run(); }, intervalMs);
    }
    function disarm() {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.hidden) { disarm(); return; }
      void run();
      arm();
    }
    function onFocus() { void run(); }

    void run();
    if (!document.hidden) arm();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      // Le jeton avance au démontage : ce qui est encore en vol ne posera rien.
      epochRef.current += 1;
      disarm();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, intervalMs, run]);

  return control;
}
