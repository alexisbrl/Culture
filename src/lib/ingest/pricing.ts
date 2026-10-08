// Ce que coûte un appel au modèle — 08/10/2026.
//
// Les deux fournisseurs facturent exactement « jetons × prix », et chaque appel
// qui aboutit rend ses jetons exacts : le coût calculé ici est donc le coût
// RÉEL, au centime, pour tout appel qui a répondu. Seul un appel coupé en route
// (limite de durée du serveur) échappe à la mesure ; sa sortie est alors estimée
// au débit du modèle (`estimateOutputTokens`), et la ligne le dit.
//
// **Fonctions pures**, sans base ni réseau : le journal les appelle à
// l'écriture de chaque ligne, et elles se testent seules.
//
// ⚠️ **Les prix changent.** Ils sont figés ici à la date de relecture, et le
// coût est écrit avec la ligne : changer un prix ne réécrit pas le passé, ce
// qui est voulu. Un modèle absent de la grille donne `null` — jamais 0 — pour
// qu'un appel non chiffré se voie (`unpriced_calls` dans `ai_generation_costs`).

import type { StepUsage } from './journal';

/** Dollars hors taxe par million de jetons. */
type Rates = {
  input: number;
  output: number;
  /** Lecture du cache (Anthropic : `cache_read_input_tokens`). */
  cacheRead: number;
  /** Écriture du cache, durée de vie de 5 minutes. */
  cacheWrite: number;
};

/** Anthropic — grille relue le 08/10/2026. La clé est le début de l'identifiant
 *  du modèle : un identifiant daté (`claude-haiku-4-5-20251001`) s'y retrouve. */
const ANTHROPIC: readonly (readonly [string, Rates])[] = [
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
];

/** DeepSeek Flash, heures creuses — page des tarifs relue le 08/10/2026. Les
 *  heures pleines coûtent le double (`isDeepSeekPeak`). Pas d'écriture de cache :
 *  DeepSeek met en cache tout seul, sans la facturer. */
const DEEPSEEK_FLASH_OFF_PEAK: Rates = { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0 };

/** Heures pleines DeepSeek : 01h–04h et 06h–10h UTC, du lundi au vendredi.
 *  ⚠️ Les jours fériés chinois sont en heures creuses ; on ne les connaît pas,
 *  donc ces jours-là le coût calculé est un peu au-dessus du réel. */
export function isDeepSeekPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

function ratesFor(provider: string | null | undefined, model: string | null | undefined, at: Date): Rates | null {
  if (!model) return null;
  // Jev (TypeSafe) : l'entrée seule est facturée, 0,042 $ le million (08/10/2026).
  // Reconnu au modèle et non au fournisseur : quand Jev est saturé, Haiku
  // répond à sa place sous le même nom de décideur.
  if (model.startsWith('jev')) return { input: 0.042, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (provider === 'deepseek') {
    // `deepseek-flash`, et l'ancien nom `deepseek-v4-flash` servi au même prix.
    if (!model.includes('flash')) return null;
    const factor = isDeepSeekPeak(at) ? 2 : 1;
    const r = DEEPSEEK_FLASH_OFF_PEAK;
    return { input: r.input * factor, output: r.output * factor, cacheRead: r.cacheRead * factor, cacheWrite: 0 };
  }
  const entry = ANTHROPIC.find(([prefix]) => model === prefix || model.startsWith(`${prefix}-`));
  return entry ? entry[1] : null;
}

/** Le coût d'un appel en dollars HT, ou `null` si le modèle n'est pas chiffré.
 *
 *  ⚠️ Les deux fournisseurs ne comptent pas l'entrée de la même façon :
 *  • Anthropic : `input_tokens` EXCLUT ce qui est lu ou écrit en cache ;
 *  • DeepSeek : `prompt_tokens` INCLUT les jetons trouvés en cache.
 *  `at` : le début de l'appel — il fixe les heures pleines chez DeepSeek. */
export function callCostUsd(
  provider: string | null | undefined,
  model: string | null | undefined,
  usage: StepUsage,
  at: Date,
): number | null {
  const rates = ratesFor(provider, model, at);
  if (!rates) return null;
  const freshInput =
    provider === 'deepseek' ? Math.max(0, usage.inputTokens - usage.cachedTokens) : usage.inputTokens;
  const total =
    freshInput * rates.input +
    usage.cachedTokens * rates.cacheRead +
    usage.cacheCreationTokens * rates.cacheWrite +
    usage.outputTokens * rates.output;
  return Number((total / 1_000_000).toFixed(6));
}

/** Débit de sortie par défaut, en jetons par seconde, quand le journal n'a pas
 *  encore assez d'appels du modèle pour le mesurer. Mesuré le 07/10/2026 :
 *  ~118 j/s pour Sonnet 5 (dix appels de notions), ~250 j/s pour DeepSeek Flash. */
export function defaultOutputRate(provider: string | null | undefined): number {
  return provider === 'deepseek' ? 250 : 118;
}

/** La sortie d'un appel coupé : son débit × le temps qu'il a vécu.
 *  ⚠️ Une estimation, et une estimation haute : le débit inclut la réflexion,
 *  facturée comme sortie, et le temps vécu inclut l'attente du premier jeton. */
export function estimateOutputTokens(livedMs: number, tokensPerSecond: number): number {
  if (!(livedMs > 0) || !(tokensPerSecond > 0)) return 0;
  return Math.round((livedMs / 1000) * tokensPerSecond);
}

/** L'entrée d'un appel dont on ne connaît que la taille en caractères
 *  (DeepSeek ne la compte qu'en répondant). ~3 caractères par jeton sur du
 *  français mêlé de JSON — une estimation, dite comme telle. */
export function estimateInputTokens(chars: number): number {
  return chars > 0 ? Math.round(chars / 3) : 0;
}
