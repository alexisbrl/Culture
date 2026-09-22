// Le sort des notions existantes — module PUR, sans réseau ni base.
//
// L'étape chapitres statue sur chaque notion existante (docs/architecture.md
// §7.6) : un chapitre visible, « hors programme », ou « à vérifier ». Le
// silence n'est pas une réponse : une notion qu'elle ne mentionne pas est
// OUBLIÉE. Ce module range chaque notion dans l'un de ces cas, mesure la part
// des oubliées pour décider de continuer, relancer ou annuler, et dresse la
// liste de la seconde vérification — tout ce qui n'est pas rangé dans un
// chapitre visible repasse devant l'étape notions, qui, elle, voit les images.
//
// Rien ici ne peut effacer une notion existante : le pire qu'une étape puisse
// faire est de la sortir du programme, et encore seulement après la seconde
// vérification.

/** À partir de cette part d'oubliées (incluse), on relance l'étape chapitres. */
export const RELAUNCH_THRESHOLD = 0.1;
/** Après la relance, à partir de cette part d'oubliées (incluse), la mise à
 *  jour est annulée sans rien écrire. */
export const CANCEL_THRESHOLD = 0.25;
/** Une notion isolée ne déclenche jamais rien : il en faut au moins autant
 *  d'oubliées pour qu'un seuil puisse jouer. */
export const MIN_FORGOTTEN_TO_ACT = 2;

/** Ce que l'étape chapitres peut répondre pour une notion existante. */
export type NotionVerdict =
  | { notionId: string; verdict: 'chapter'; chapterRef: string }
  | { notionId: string; verdict: 'out' }
  | { notionId: string; verdict: 'check' };

/** Le cas d'une notion existante après l'étape chapitres. */
export type NotionStanding =
  | { kind: 'placed'; chapterRef: string }
  /** Hors programme : jugée non couverte, ou laissée dans un chapitre écarté. */
  | { kind: 'out' }
  /** Introuvable dans le texte — elle peut venir d'une image. */
  | { kind: 'check' }
  /** La réponse n'en dit rien. Seul cas qui compte pour les seuils. */
  | { kind: 'forgotten' };

export interface ExistingNotion {
  id: string;
  /** Son chapitre avant la génération, `null` si elle n'en a pas. */
  chapterId: string | null;
}

export interface ChapterLayout {
  /** Chapitres au programme à l'issue de l'étape : neufs, et existants non écartés. */
  visible: ReadonlySet<string>;
  /** Chapitres existants mis au rang 0 par l'étape. */
  dropped: ReadonlySet<string>;
}

/**
 * Le cas de chaque notion existante.
 *
 * - Un verdict sur une notion inconnue est ignoré.
 * - Deux verdicts pour la même notion : le premier fait foi.
 * - Un chapitre visible → rangée ; un chapitre écarté → hors programme ; un
 *   chapitre inconnu → le verdict est ignoré, la notion est donc oubliée.
 * - Silence : oubliée — sauf si son chapitre actuel est écarté, auquel cas elle
 *   y est laissée et sort avec lui (hors programme).
 */
export function classifyNotions(
  notions: readonly ExistingNotion[],
  verdicts: readonly NotionVerdict[],
  layout: ChapterLayout,
): Map<string, NotionStanding> {
  const known = new Set(notions.map((n) => n.id));
  const said = new Map<string, NotionStanding>();
  for (const v of verdicts) {
    if (!known.has(v.notionId) || said.has(v.notionId)) continue;
    if (v.verdict === 'out') said.set(v.notionId, { kind: 'out' });
    else if (v.verdict === 'check') said.set(v.notionId, { kind: 'check' });
    else if (layout.visible.has(v.chapterRef)) said.set(v.notionId, { kind: 'placed', chapterRef: v.chapterRef });
    else if (layout.dropped.has(v.chapterRef)) said.set(v.notionId, { kind: 'out' });
  }

  const out = new Map<string, NotionStanding>();
  for (const notion of notions) {
    const standing = said.get(notion.id);
    if (standing) out.set(notion.id, standing);
    else if (notion.chapterId && layout.dropped.has(notion.chapterId)) out.set(notion.id, { kind: 'out' });
    else out.set(notion.id, { kind: 'forgotten' });
  }
  return out;
}

/** Remplace, pour les seules notions relancées, leur cas par celui de la
 *  relance. Une notion que la relance oublie encore reste oubliée. */
export function mergeRelaunch(
  first: ReadonlyMap<string, NotionStanding>,
  relaunch: ReadonlyMap<string, NotionStanding>,
): Map<string, NotionStanding> {
  const merged = new Map(first);
  for (const [id, standing] of relaunch) {
    if (merged.get(id)?.kind === 'forgotten') merged.set(id, standing);
  }
  return merged;
}

export function forgottenIds(standings: ReadonlyMap<string, NotionStanding>): string[] {
  return [...standings].filter(([, s]) => s.kind === 'forgotten').map(([id]) => id);
}

/** Part des oubliées parmi les notions existantes (0 s'il n'y en a aucune). */
export function forgottenShare(standings: ReadonlyMap<string, NotionStanding>): number {
  if (standings.size === 0) return 0;
  return forgottenIds(standings).length / standings.size;
}

export type ThresholdDecision = 'continue' | 'relaunch' | 'cancel';

/**
 * Que faire après l'étape chapitres ?
 *
 * Premier passage : `relaunch` à partir de 10 %, sinon `continue`.
 * Après la relance : `cancel` à partir de 25 %, sinon `continue` — on ne relance
 * jamais deux fois. Dans les deux cas, une seule oubliée ne déclenche rien.
 */
export function thresholdDecision(
  standings: ReadonlyMap<string, NotionStanding>,
  attempt: 'first' | 'relaunch',
): ThresholdDecision {
  if (forgottenIds(standings).length < MIN_FORGOTTEN_TO_ACT) return 'continue';
  const share = forgottenShare(standings);
  if (attempt === 'first') return share >= RELAUNCH_THRESHOLD ? 'relaunch' : 'continue';
  return share >= CANCEL_THRESHOLD ? 'cancel' : 'continue';
}

/** L'étiquette d'une notion dans la seconde vérification. */
export type RecheckLabel = 'forgotten' | 'check' | 'out';

export interface RecheckNotion {
  notionId: string;
  label: RecheckLabel;
}

/** La seconde vérification : toute notion qui n'est pas rangée dans un chapitre
 *  visible, étiquetée selon son cas. Elle part dans CHAQUE appel de l'étape
 *  notions. Les notions d'un chapitre écarté en entier y sont toutes. */
export function recheckList(standings: ReadonlyMap<string, NotionStanding>): RecheckNotion[] {
  const out: RecheckNotion[] = [];
  for (const [notionId, s] of standings) {
    if (s.kind !== 'placed') out.push({ notionId, label: s.kind });
  }
  return out;
}
