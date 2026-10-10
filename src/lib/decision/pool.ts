// Combien de questions fermées envoyer à la fois — un réglage qui s'adapte seul.
// 10/10/2026, idée d'Alexis retravaillée.
//
// ─── Pourquoi pas un nombre fixe ─────────────────────────────────────────────
//
// Jev est tout jeune : sa capacité bouge. Le 08/10/2026, il a refusé pour
// saturation à dix demandes simultanées ; deux jours plus tard, quarante
// passaient sans un refus. Un nombre fixe est donc soit trop prudent (on
// attend pour rien), soit trop hardi (on se fait refuser), et il faut revenir
// le régler à chaque évolution du service.
//
// ─── La règle : monter doucement, reculer franchement ────────────────────────
//
// On part de `start` demandes en vol. Chaque série réussie de la taille du
// plafond le relève d'une unité ; une réponse « saturé » le divise par deux.
// C'est le réglage des connexions réseau : il trouve seul la capacité du
// moment, et la suit quand elle monte. Rien n'est perdu sur un refus : le
// décideur a déjà répondu par son relais (`withFallback`) ; le refus ne sert
// qu'à ralentir.
//
// Une réponse libère sa place aussitôt : la demande suivante part sans
// attendre le reste de la série. Par-dessus, un débit plafond : jamais plus de
// `ratePerSecond` départs par seconde (`JEV_REQUESTS_PER_SECOND`, ci-dessous).

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ LIMITE DE DÉBIT DE JEV — À REGARDER EN PREMIER SI JEV SE MET À REFUSER
// ═════════════════════════════════════════════════════════════════════════════
//
// Ce que TypeSafe annonce pour notre compte, TOUTES générations confondues
// (page « Models », relue le 08/10/2026) : 80 demandes et 100 000 jetons par
// seconde, limites « ajustées dynamiquement », plus hautes sur offre négociée.
// Jev sortait alors de son lancement : ces chiffres peuvent bouger, dans un
// sens comme dans l'autre, sans prévenir.
//
// On plafonne à 50 par seconde, pas à 80 : la marge couvre une autre
// génération qui tournerait au même moment.
//
// Ce plafond n'est tenu QUE génération par génération : le réglage vit dans
// UNE fonction serveur, et deux générations simultanées sur deux ateliers ont
// chacune le leur — à elles deux, jusqu'à 100 départs par seconde. Accepté
// (décision d'Alexis du 10/10/2026) : deux générations au même instant sont
// rares, toutes deux au plafond plus encore, et une demande refusée n'est pas
// perdue — DeepSeek y répond à la place (`withFallback`). On y perd du temps,
// pas un résultat.
//
// Les signes que cette limite est devenue un goulot : au journal, des refus
// « saturé » nombreux à l'étape des redites, ou une part croissante de
// réponses venues de DeepSeek plutôt que de Jev. Les remèdes, du plus simple
// au plus lourd : demander à TypeSafe une limite plus haute ; baisser ce
// plafond ; coordonner les fonctions entre elles par un compteur partagé (en
// base ou dans un cache).
// ═════════════════════════════════════════════════════════════════════════════

/** Départs par seconde au plus, pour UNE génération — lire l'encadré ⚠️
 *  ci-dessus avant d'y toucher. */
export const JEV_REQUESTS_PER_SECOND = 50;

export type PoolOptions = {
  /** Demandes en vol au départ. */
  start: number;
  /** Demandes en vol au plus, quoi qu'il arrive. */
  max: number;
  /** Départs par seconde au plus. */
  ratePerSecond: number;
};

/** Départ à 15 demandes en vol (Alexis, 10/10/2026). Chaque tri repart de là :
 *  rien n'est retenu d'une génération à l'autre, ni entre ateliers. */
export const JEV_POOL: PoolOptions = { start: 15, max: JEV_REQUESTS_PER_SECOND, ratePerSecond: JEV_REQUESTS_PER_SECOND };

/** Traite chaque élément par `run`, au plus `limit` à la fois, `limit`
 *  s'adaptant à ce que `run` signale. Rend les résultats dans l'ordre des
 *  éléments. `run` ne doit pas lever : c'est à lui de dire ce que vaut un
 *  échec. */
export async function adaptiveMap<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<{ value: R; congested: boolean }>,
  options: PoolOptions,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<{ results: R[]; finalLimit: number; congestions: number }> {
  const results = new Array<R>(items.length);
  const spacing = 1000 / options.ratePerSecond;
  let limit = Math.max(1, Math.min(options.start, options.max));
  let inFlight = 0;
  let next = 0;
  let streak = 0;
  let congestions = 0;
  let lastStart = -Infinity;

  return new Promise((resolve) => {
    if (items.length === 0) {
      resolve({ results, finalLimit: limit, congestions });
      return;
    }
    let done = 0;
    let scheduling = false;

    const launch = async () => {
      if (scheduling) return;
      scheduling = true;
      while (next < items.length && inFlight < limit) {
        const wait = lastStart + spacing - now();
        if (wait > 0) await sleep(wait);
        lastStart = now();
        const index = next++;
        inFlight += 1;
        void run(items[index]).then(({ value, congested }) => {
          results[index] = value;
          inFlight -= 1;
          done += 1;
          if (congested) {
            congestions += 1;
            streak = 0;
            limit = Math.max(1, Math.floor(limit / 2));
          } else if (++streak >= limit) {
            streak = 0;
            limit = Math.min(options.max, limit + 1);
          }
          if (done === items.length) resolve({ results, finalLimit: limit, congestions });
          else void launch();
        });
      }
      scheduling = false;
    };
    void launch();
  });
}
