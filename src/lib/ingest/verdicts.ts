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

// ─── Le garde-fou « jamais tous » ────────────────────────────────────────────

/**
 * Les chapitres réellement écartés. Écarter CHAQUE chapitre encore au programme
 * en un seul import n'est presque jamais une décision — une consigne mal lue,
 * un document déposé par erreur (§7.6). On n'applique alors rien, et
 * `blocked` permet de le dire au compte-rendu. Le cas légitime se fait en deux
 * fois. Une référence qui n'est pas un chapitre visible existant est ignorée.
 */
export function guardDrops(
  visibleExistingIds: readonly string[],
  droppedRefs: readonly string[],
): { dropped: string[]; blocked: boolean } {
  const visible = new Set(visibleExistingIds);
  const dropped = [...new Set(droppedRefs)].filter((ref) => visible.has(ref));
  if (visible.size > 0 && dropped.length >= visible.size) return { dropped: [], blocked: true };
  return { dropped, blocked: false };
}

// ─── Le sort final, après l'étape notions ────────────────────────────────────

export interface Arbitration {
  notionId: string;
  /** Les chapitres qui la réclamaient, dans l'ordre du programme. */
  claimants: string[];
  /** Le chapitre retenu, `null` si elle ne bouge pas. */
  chosen: string | null;
  rule: 'current' | 'firstInProgram' | 'none';
}

/** Où une notion existante finit. Il n'existe pas d'autre sort : aucune de ces
 *  règles ne sait effacer une notion. `chapterId = null` : sans chapitre, hors
 *  programme mais intacte — un gestionnaire peut la replacer. */
export interface NotionFate {
  notionId: string;
  chapterId: string | null;
  /** Vrai si le chapitre change. */
  moved: boolean;
  reason: 'placed' | 'claimed' | 'arbitrated' | 'stays' | 'unplaced';
}

export interface FateInput {
  notions: readonly ExistingNotion[];
  standings: ReadonlyMap<string, NotionStanding>;
  layout: ChapterLayout;
  /** Les chapitres visibles, dans l'ordre du programme. */
  programOrder: readonly string[];
  /** Pour chaque notion de la seconde vérification, les chapitres qui l'ont
   *  réclamée à l'étape notions (références déjà revalidées). */
  claims: ReadonlyMap<string, readonly string[]>;
}

/**
 * Le sort de chaque notion existante, une fois toutes les étapes notions finies.
 *
 * - Rangée à l'étape chapitres : dans son chapitre.
 * - Réclamée par un seul chapitre visible : elle y va.
 * - Réclamée par plusieurs : son chapitre actuel s'il en est, sinon le premier
 *   dans l'ordre du programme — indépendant de l'ordre d'arrivée des réponses.
 *   Chaque départage est rendu pour le compte-rendu.
 * - Non réclamée : oubliée ou à vérifier, elle ne bouge pas ; hors programme,
 *   elle reste dans un chapitre écarté et passe sans chapitre si le sien est
 *   resté visible.
 */
export function finalFates(input: FateInput): { fates: NotionFate[]; arbitrations: Arbitration[] } {
  const { notions, standings, layout, programOrder, claims } = input;
  const rank = new Map(programOrder.map((id, i) => [id, i]));
  const fates: NotionFate[] = [];
  const arbitrations: Arbitration[] = [];

  const fate = (n: ExistingNotion, chapterId: string | null, reason: NotionFate['reason']): NotionFate => ({
    notionId: n.id,
    chapterId,
    moved: chapterId !== n.chapterId,
    reason,
  });

  for (const notion of notions) {
    const standing = standings.get(notion.id) ?? { kind: 'forgotten' as const };
    if (standing.kind === 'placed') {
      fates.push(fate(notion, standing.chapterRef, 'placed'));
      continue;
    }

    const claimants = [...new Set(claims.get(notion.id) ?? [])]
      .filter((c) => layout.visible.has(c) && rank.has(c))
      .sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));

    if (claimants.length === 1) {
      fates.push(fate(notion, claimants[0], 'claimed'));
      continue;
    }
    if (claimants.length > 1) {
      const current = notion.chapterId && claimants.includes(notion.chapterId) ? notion.chapterId : null;
      const chosen = current ?? claimants[0];
      arbitrations.push({
        notionId: notion.id,
        claimants,
        chosen,
        rule: current ? 'current' : 'firstInProgram',
      });
      fates.push(fate(notion, chosen, 'arbitrated'));
      continue;
    }
    if ((claims.get(notion.id) ?? []).length > 0) {
      // Réclamée, mais par aucun chapitre recevable : elle ne bouge pas.
      arbitrations.push({ notionId: notion.id, claimants: [], chosen: null, rule: 'none' });
    }

    if (standing.kind === 'out' && notion.chapterId && layout.visible.has(notion.chapterId)) {
      fates.push(fate(notion, null, 'unplaced'));
    } else {
      fates.push(fate(notion, notion.chapterId, 'stays'));
    }
  }

  return { fates, arbitrations };
}

// ─── Les réclamations, revalidées ────────────────────────────────────────────

export interface ChapterClaims {
  chapterId: string;
  notionIds: readonly string[];
}

/**
 * Les réclamations de l'étape notions, telles que l'écran les renvoie à la
 * finalisation. Elles transitent par le navigateur : ce sont des données non
 * fiables, qu'on revalide une à une avant d'écrire quoi que ce soit (§7.9).
 * Une réclamation n'est retenue que si le chapitre est au programme de CE lot
 * et encore visible, et si la notion est une notion de la seconde
 * vérification de CE lot — donc de cet atelier. Le reste est ignoré et compté.
 */
export function revalidateClaims(
  claims: readonly ChapterClaims[],
  allowed: { chapters: ReadonlySet<string>; notions: ReadonlySet<string> },
): { claims: Map<string, string[]>; ignored: number } {
  const out = new Map<string, string[]>();
  let ignored = 0;
  for (const claim of claims) {
    for (const notionId of claim.notionIds) {
      if (typeof notionId !== 'string' || typeof claim.chapterId !== 'string'
        || !allowed.chapters.has(claim.chapterId) || !allowed.notions.has(notionId)) {
        ignored += 1;
        continue;
      }
      const list = out.get(notionId) ?? [];
      if (!list.includes(claim.chapterId)) list.push(claim.chapterId);
      out.set(notionId, list);
    }
  }
  return { claims: out, ignored };
}

/** Les notions que personne n'a su placer et qui restent où elles étaient :
 *  elles ne font plus vivre leur chapitre (§7.6, « le chapitre suit ses
 *  notions »). */
export function strandedNotions(fates: readonly NotionFate[]): string[] {
  return fates.filter((f) => f.reason === 'stays' && f.chapterId !== null).map((f) => f.notionId);
}
