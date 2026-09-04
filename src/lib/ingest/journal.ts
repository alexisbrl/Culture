// Le journal de bord des générations — ce qu'on saura après coup.
//
// Né le 04/09/2026 d'une panne banale : le fournisseur était saturé en pleine
// mise à jour d'un atelier, et rien ne permettait de dire si ça arrivait une
// fois par mois ou trois fois par jour. Les journaux du serveur montrent la
// panne du moment ; ils ne se comptent pas.
//
// ─── Deux niveaux, et un seul principe ───────────────────────────────────────
//
//   • une ligne par GÉNÉRATION — sur `ai_imports`, qui portait déjà les tokens,
//     le périmètre demandé et la consigne : on y ajoute son issue et d'où venait
//     la commande ;
//   • une ligne par ÉTAPE — ici (`ai_import_events`) : ce qu'elle a coûté, ce
//     qu'elle a produit, et pourquoi elle a échoué le cas échéant.
//
// Le principe : **la cause vient d'une liste fermée**, doublée de la phrase
// brute du fournisseur. On compte les codes, on lit les phrases. Une cause en
// texte libre ne se compte pas, et un journal qui ne se compte pas ne répond à
// aucune question.
//
// Trois règles qui expliquent la forme du code :
//
// 1. **Écrire dans le journal ne doit jamais faire échouer ce qu'il observe.**
//    Toute fonction d'écriture avale ses erreurs — au pire il manque une ligne,
//    jamais une génération.
// 2. **Des comptes et des motifs, jamais du contenu.** Le journal répond à
//    « combien, à quelle fréquence, combien de temps, pour quel prix » ; jamais
//    à « qu'est-ce qu'il y avait dans le cours ».
// 3. **Le classement des pannes est PUR** (`classifyFailure`, `isTransient`) :
//    c'est lui qui décide s'il faut relancer, il se teste donc sans base et sans
//    réseau.

import { getSupabaseServerClient } from '@/lib/supabase';

import { BUSY_ERROR, CLOSED_ERROR } from './lock';

/** Les étapes qui appellent un modèle. Le téléversement et le ménage de fin n'y
 *  figurent pas : ils ne coûtent pas de tokens et ne peuvent pas être relancés
 *  au sens où on l'entend ici. */
export type StepName = 'chapters' | 'notions' | 'assign' | 'questions' | 'exam';

/** La liste FERMÉE des causes. En ajouter une se fait ici et nulle part
 *  ailleurs — c'est ce qui garantit qu'un décompte par cause reste exhaustif.
 *
 *  • `overloaded`   — le fournisseur est saturé. Passager par excellence.
 *  • `unavailable`  — il est injoignable ou en panne (réseau, 5xx).
 *  • `rate_limited` — on tape sa limite de débit.
 *  • `oversize`     — le cours ne tient pas dans la fenêtre du modèle. Rien de
 *                     passager là-dedans : relancer à l'identique échouera pareil.
 *  • `truncated`    — la réponse a été coupée au plafond de sortie. L'appel a
 *                     RÉUSSI et a été facturé ; c'est son résultat qui est perdu.
 *  • `unreadable`   — la réponse est arrivée mais ne se lit pas.
 *  • `closed`       — le lot a été annulé pendant que l'appel était en vol. Ce
 *                     n'est pas une panne : c'est une annulation qui a marché.
 *  • `unknown`      — tout le reste. Une part qui grossit est le signal qu'il
 *                     manque une entrée à cette liste. */
export type FailureCause =
  | 'overloaded'
  | 'unavailable'
  | 'rate_limited'
  | 'oversize'
  | 'truncated'
  | 'unreadable'
  | 'closed'
  | 'unknown';

/** D'où vient la commande. Liste fermée elle aussi, et pour la même raison : on
 *  veut pouvoir dire « les générations lancées depuis les ressources échouent
 *  deux fois plus », ce qu'une chaîne libre ne permettrait jamais.
 *
 *  Les quatre premières sont des boutons ; `refill` est la recharge automatique,
 *  qui tourne en fond sans que personne l'ait demandée — la distinguer est
 *  indispensable, elle n'a ni le même volume ni le même fournisseur. */
export type GenerationOrigin =
  | 'settings-files'
  | 'settings-notions'
  | 'questions-parcours'
  | 'questions-exam'
  | 'refill';

/** L'issue d'une génération entière. `null` en base — donc absente d'ici — veut
 *  dire qu'elle n'a jamais été refermée : onglet fermé, machine éteinte,
 *  serveur perdu. C'est l'interruption, et elle se déduit de ce silence plutôt
 *  que de s'écrire, puisque personne n'est là pour l'écrire. */
export type ImportOutcome = 'finished' | 'stopped' | 'failed';

/** Le code HTTP d'une erreur de fournisseur, quel que soit le SDK qui la porte.
 *  On lit la propriété plutôt que d'importer le SDK : ce module doit rester
 *  vrai pour Claude comme pour DeepSeek, et testable sans ni l'un ni l'autre. */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/** Range une panne dans la liste fermée. **Fonction pure.**
 *
 *  L'ordre compte : le code HTTP fait foi quand il existe, le texte ne sert que
 *  de second recours. Un fournisseur peut changer ses formulations du jour au
 *  lendemain ; il ne change pas ses codes. */
export function classifyFailure(error: unknown): FailureCause {
  const message = messageOf(error);
  if (message === CLOSED_ERROR || message === BUSY_ERROR) return 'closed';

  const status = statusOf(error);
  if (status === 529) return 'overloaded';
  if (status === 429) return 'rate_limited';
  if (status !== undefined && status >= 500) return 'unavailable';

  const text = message.toLowerCase();
  if (text.includes('overloaded')) return 'overloaded';
  // La fenêtre : mêmes formulations que `isContextWindowOverflow`, qui décide
  // du repli sur un modèle plus large. Ici on ne décide de rien, on nomme.
  if (text.includes('prompt is too long') || text.includes('exceed context limit')) return 'oversize';
  // Une panne réseau n'a pas de code : `fetch failed`, `ECONNRESET`, `timeout`.
  if (text.includes('fetch failed') || text.includes('econnreset') || text.includes('timeout')) {
    return 'unavailable';
  }
  return 'unknown';
}

/** Une panne passagère est celle qu'un simple délai peut suffire à effacer.
 *  **Fonction pure**, et c'est elle qui autorise la relance automatique.
 *
 *  ⚠️ Ce qui n'est PAS passager ne se relance jamais : un cours trop volumineux
 *  le sera encore dans trois secondes, une réponse illisible le sera tout autant,
 *  et une annulation doit rester une annulation. Relancer là-dessus, c'est payer
 *  deux fois le même échec. */
export function isTransient(cause: FailureCause): boolean {
  return cause === 'overloaded' || cause === 'unavailable' || cause === 'rate_limited';
}

/** **Une seule relance**, décision d'Alexis du 03/09/2026. Le plafond est
 *  volontairement bas : on trace d'abord, on affinera sur des chiffres — le
 *  journal dira combien de relances ont réellement sauvé une génération.
 *
 *  Le délai n'est pas un réglage cosmétique : sans lui, la seconde tentative
 *  part dans la même seconde que la première et retombe sur la même saturation. */
export const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3_000;

export type Attempted<T> = { result: T; attempts: number; durationMs: number };

/** Appelle le modèle, et **relance une fois** si la panne est passagère.
 *
 *  Rend le nombre d'essais réellement faits : c'est ce que le journal enregistre,
 *  et c'est la seule façon de savoir plus tard si une relance de plus vaudrait
 *  le coup. La durée mesurée couvre TOUS les essais, délai d'attente compris —
 *  c'est ce que l'utilisateur, lui, a attendu. */
export async function withRetry<T>(
  call: () => Promise<T>,
  onRetry?: (cause: FailureCause, error: unknown) => void,
): Promise<Attempted<T>> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return { result: await call(), attempts: attempt, durationMs: Date.now() - started };
    } catch (error) {
      const cause = classifyFailure(error);
      if (attempt >= MAX_ATTEMPTS || !isTransient(cause)) throw error;
      onRetry?.(cause, error);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

export type StepUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cachedTokens: number;
};

export type StepLog = {
  importId: string;
  workshopId: string;
  step: StepName;
  /** Indice du document ou du lot traité. Absent quand l'étape est unique. */
  batch?: number;
  attempt?: number;
  provider?: string;
  model?: string;
  status: 'ok' | 'failed';
  /** Renseignée sur un échec — mais aussi sur une réussite DÉGRADÉE : une
   *  réponse coupée est un appel qui a réussi, qu'on a payé, et dont le
   *  résultat est perdu. C'est exactement ce qu'on veut pouvoir compter. */
  cause?: FailureCause;
  message?: string;
  durationMs?: number;
  usage?: StepUsage;
  /** Des COMPTES et des motifs — jamais un titre, un énoncé ou un extrait. */
  produced?: Record<string, unknown>;
};

/** Écrit une ligne d'étape. **Ne lève jamais** : le journal observe, il n'a pas
 *  le droit de faire échouer ce qu'il observe. */
export async function logStep(entry: StepLog): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from('ai_import_events').insert({
      import_id: entry.importId,
      workshop_id: entry.workshopId,
      step: entry.step,
      batch: entry.batch ?? null,
      attempt: entry.attempt ?? 1,
      provider: entry.provider ?? null,
      model: entry.model ?? null,
      status: entry.status,
      cause: entry.cause ?? null,
      // La phrase brute est bornée : un fournisseur peut renvoyer une page
      // entière, et le journal n'est pas fait pour la stocker.
      message: entry.message ? entry.message.slice(0, 500) : null,
      duration_ms: entry.durationMs ?? null,
      input_tokens: entry.usage?.inputTokens ?? 0,
      output_tokens: entry.usage?.outputTokens ?? 0,
      cache_creation_tokens: entry.usage?.cacheCreationTokens ?? 0,
      cached_tokens: entry.usage?.cachedTokens ?? 0,
      produced: entry.produced ?? {},
    });
    if (error) console.warn('[journal] étape non enregistrée :', error.message);
  } catch (error) {
    console.warn('[journal] étape non enregistrée :', error instanceof Error ? error.message : error);
  }
}

/** Enregistre l'issue d'une génération entière. **Ne lève jamais.**
 *
 *  ⚠️ **La première issue écrite gagne.** L'écran referme le lot dès qu'il
 *  aboutit ou qu'il échoue, et d'autres chemins peuvent repasser derrière ;
 *  écraser un `failed` par un `finished` de politesse effacerait précisément ce
 *  qu'on cherche à compter. */
export async function markOutcome(importId: string, outcome: ImportOutcome): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from('ai_imports')
      .update({ outcome, finished_at: new Date().toISOString() })
      .eq('id', importId)
      .is('outcome', null);
    if (error) console.warn('[journal] issue non enregistrée :', error.message);
  } catch (error) {
    console.warn('[journal] issue non enregistrée :', error instanceof Error ? error.message : error);
  }
}
