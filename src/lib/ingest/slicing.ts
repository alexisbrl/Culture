// Découpage du cours par chapitre — module PUR, sans réseau ni base.
//
// L'étape chapitres dit OÙ commence et finit chaque chapitre ; ce module en
// déduit les pages que recevra chacun à l'étape notions (docs/architecture.md
// §7.2 et §7.3). Une seule règle gouverne tout le reste : **en cas de doute,
// élargir.** Un chevauchement ne coûte que des jetons ; une page perdue produit
// une notion manquante que rien ne signale.
//
// Il décide aussi, page par page, si une page part en texte seul ou aussi en
// image — jamais document par document : une moyenne cacherait la moitié
// scannée d'un cours à moitié saisi.

/** Sous ce nombre de caractères (espaces exclus), une page est « pauvre en
 *  texte » et part aussi en image. Une page pauvre n'est pas forcément un scan,
 *  mais rater une frontière de chapitre coûte bien plus que quelques jetons. */
export const MIN_PAGE_TEXT_CHARS = 200;

/** Un intervalle de pages d'un document, bornes incluses, numéros à partir de 1. */
export interface PageSpan {
  documentId: string;
  from: number;
  to: number;
}

/** Les bornes rendues par l'étape chapitres pour un chapitre. Un chapitre
 *  éclaté a plusieurs intervalles, éventuellement dans plusieurs documents. */
export interface ChapterBounds {
  key: string;
  spans: PageSpan[];
}

/** Un document du lot. `pageCount = null` : document sans pages (texte,
 *  document de l'IA) — sa seule tranche possible est le document entier. */
export interface SliceDocument {
  id: string;
  pageCount: number | null;
}

/** Ce qu'un chapitre recevra d'un document. `pages = null` : le document
 *  entier (document sans pages). Sinon, les pages dans l'ordre du document. */
export interface DocumentSlice {
  documentId: string;
  pages: number[] | null;
}

export interface ChapterSlice {
  key: string;
  slices: DocumentSlice[];
  /** Vrai si le chapitre n'avait aucune borne exploitable et reçoit des
   *  documents entiers — plus cher, jamais faux, et dit au compte-rendu. */
  wholeDocumentFallback: boolean;
}

export interface SlicingResult {
  chapters: ChapterSlice[];
  /** Documents qu'aucune borne ne couvrait : ils partent en entier dans
   *  chaque chapitre plutôt que de disparaître. Pour le compte-rendu. */
  uncoveredDocuments: string[];
}

/** Clampe un intervalle au document. `null` s'il est inexploitable : borne
 *  absente, 0, inversée, ou entièrement hors du document. Un intervalle qui
 *  dépasse seulement la fin est ramené à la dernière page — élargir, pas jeter. */
function usableSpan(span: PageSpan, pageCount: number): { from: number; to: number } | null {
  const { from, to } = span;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 1 || to < from || from > pageCount) return null;
  return { from, to: Math.min(to, pageCount) };
}

/**
 * Pages de chaque chapitre, dans l'ordre du programme reçu.
 *
 * - Chevauchement : les deux chapitres gardent la page.
 * - Page orpheline : rattachée au chapitre qui couvre la page couverte la plus
 *   proche AVANT elle ; au premier chapitre du document si elle précède tout.
 * - Chapitre sans aucune borne exploitable : les documents qu'il désignait en
 *   entier, ou tous les documents s'il n'en désignait aucun de connu.
 * - Document que rien ne couvre : en entier dans chaque chapitre.
 */
export function sliceChapters(
  chapters: readonly ChapterBounds[],
  documents: readonly SliceDocument[],
): SlicingResult {
  const docById = new Map(documents.map((d) => [d.id, d]));
  // pages[chapitre][document] = ensemble des pages ; `null` = document entier.
  const pages = chapters.map(() => new Map<string, Set<number> | null>());
  const fallback = chapters.map(() => false);

  chapters.forEach((chapter, ci) => {
    const named = new Set<string>();
    for (const span of chapter.spans) {
      const doc = docById.get(span.documentId);
      if (!doc) continue;
      named.add(doc.id);
      if (doc.pageCount === null) {
        pages[ci].set(doc.id, null);
        continue;
      }
      const usable = usableSpan(span, doc.pageCount);
      if (!usable) continue;
      let set = pages[ci].get(doc.id);
      if (set === null) continue;
      if (!set) {
        set = new Set<number>();
        pages[ci].set(doc.id, set);
      }
      for (let p = usable.from; p <= usable.to; p++) set.add(p);
    }
    if (pages[ci].size === 0) {
      fallback[ci] = true;
      const targets = named.size > 0 ? [...named] : documents.map((d) => d.id);
      for (const id of targets) pages[ci].set(id, null);
    }
  });

  const uncoveredDocuments: string[] = [];
  for (const doc of documents) {
    const covering = chapters
      .map((_, ci) => ci)
      .filter((ci) => pages[ci].has(doc.id));
    if (covering.length === 0) {
      uncoveredDocuments.push(doc.id);
      chapters.forEach((_, ci) => pages[ci].set(doc.id, null));
      continue;
    }
    if (doc.pageCount === null) continue;
    // Un chapitre qui a ce document en entier couvre déjà tout.
    const partial = covering.filter((ci) => pages[ci].get(doc.id) !== null);
    if (partial.length < covering.length) continue;

    // Pour chaque page couverte, le premier chapitre (ordre du programme) qui la couvre.
    const owner: (number | undefined)[] = new Array(doc.pageCount + 1);
    for (const ci of partial) {
      for (const p of pages[ci].get(doc.id) as Set<number>) {
        if (owner[p] === undefined) owner[p] = ci;
      }
    }
    const firstCovered = owner.findIndex((o, p) => p >= 1 && o !== undefined);
    let previous = owner[firstCovered] as number;
    for (let p = 1; p <= doc.pageCount; p++) {
      if (owner[p] !== undefined) {
        previous = owner[p] as number;
        continue;
      }
      (pages[previous].get(doc.id) as Set<number>).add(p);
    }
  }

  return {
    chapters: chapters.map((chapter, ci) => ({
      key: chapter.key,
      wholeDocumentFallback: fallback[ci],
      slices: documents
        .filter((d) => pages[ci].has(d.id))
        .map((d) => {
          const set = pages[ci].get(d.id);
          return { documentId: d.id, pages: set ? [...set].sort((a, b) => a - b) : null };
        }),
    })),
    uncoveredDocuments,
  };
}

/** Une page est-elle pauvre en texte, donc à envoyer aussi en image ? */
export function isTextPoor(pageText: string): boolean {
  return pageText.replace(/\s+/g, '').length < MIN_PAGE_TEXT_CHARS;
}

/** Pages (numéros à partir de 1) qui partent aussi en image, décidées une par une. */
export function imagePages(pageTexts: readonly string[]): number[] {
  const out: number[] = [];
  pageTexts.forEach((text, i) => {
    if (isTextPoor(text)) out.push(i + 1);
  });
  return out;
}
