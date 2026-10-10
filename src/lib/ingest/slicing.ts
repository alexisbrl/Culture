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
}

export interface SlicingResult {
  chapters: ChapterSlice[];
  /** Documents qu'aucune borne ne couvrait : aucun chapitre ne les reçoit.
   *  Pour le compte-rendu. */
  uncoveredDocuments: string[];
}

/** Clampe un intervalle au document. `null` s'il est inexploitable : borne
 *  absente, 0, inversée, ou entièrement hors du document. Un intervalle qui
 *  dépasse seulement la fin est ramené à la dernière page — élargir, pas jeter. */
export function usableSpan(span: PageSpan, pageCount: number): { from: number; to: number } | null {
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
 *   proche AVANT elle, **dans le même document**. Une page qui précède toute
 *   page couverte de son document n'a pas de chapitre précédent : personne ne
 *   la reçoit (souvent une page de titre, ou l'en-tête du document de l'IA).
 * - Chapitre sans aucune borne exploitable : il ne reçoit rien. Il n'arrive
 *   pas jusqu'ici — un chapitre sans page sort du programme dès l'étape
 *   chapitres (§7.6). Lui donner le cours entier, comme on le faisait, lui
 *   faisait réécrire tout le cours sous son titre.
 * - Document que rien ne couvre : personne ne le reçoit, et c'est rendu au
 *   compte-rendu. L'envoyer en entier à chaque chapitre, comme on le faisait,
 *   recréait la même duplication (06/10/2026).
 */
export function sliceChapters(
  chapters: readonly ChapterBounds[],
  documents: readonly SliceDocument[],
): SlicingResult {
  const docById = new Map(documents.map((d) => [d.id, d]));
  // pages[chapitre][document] = ensemble des pages ; `null` = document entier.
  const pages = chapters.map(() => new Map<string, Set<number> | null>());

  chapters.forEach((chapter, ci) => {
    for (const span of chapter.spans) {
      const doc = docById.get(span.documentId);
      if (!doc) continue;
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
  });

  const uncoveredDocuments: string[] = [];
  for (const doc of documents) {
    const covering = chapters
      .map((_, ci) => ci)
      .filter((ci) => pages[ci].has(doc.id));
    if (covering.length === 0) {
      uncoveredDocuments.push(doc.id);
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
    let previous: number | undefined;
    for (let p = 1; p <= doc.pageCount; p++) {
      if (owner[p] !== undefined) {
        previous = owner[p] as number;
        continue;
      }
      if (previous !== undefined) (pages[previous].get(doc.id) as Set<number>).add(p);
    }
  }

  return {
    chapters: chapters.map((chapter, ci) => ({
      key: chapter.key,
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

// ─── Un chapitre trop long : ses pages en deux moitiés ───────────────────────

/**
 * Coupe les pages d'un chapitre en deux moitiés égales, dans l'ordre du cours
 * — pour la reprise d'un chapitre dont l'appel a dépassé la durée d'une tâche
 * (Alexis, 10/10/2026). Un document pris en entier dont on connaît le nombre
 * de pages se coupe comme les autres ; un document sans pages (texte, document
 * de l'IA) ne se coupe pas, et rejoint la moitié la plus légère.
 *
 * Rend deux listes, ou une seule quand il n'y a rien à couper (une page, un
 * seul document sans pages) : l'appel repart alors entier.
 *
 * Si deux moitiés ne suffisent plus un jour (des moitiés elles-mêmes coupées,
 * au journal), c'est ici qu'on passerait à trois ou quatre parts.
 */
export function halveSlices(
  slices: readonly DocumentSlice[],
  pageCounts: Readonly<Record<string, number | null>>,
): DocumentSlice[][] {
  const pages: { documentId: string; page: number }[] = [];
  const whole: DocumentSlice[] = [];
  for (const slice of slices) {
    const count = pageCounts[slice.documentId] ?? null;
    const list = slice.pages ?? (count !== null ? Array.from({ length: count }, (_, i) => i + 1) : null);
    if (list === null) whole.push({ documentId: slice.documentId, pages: null });
    else for (const page of list) pages.push({ documentId: slice.documentId, page });
  }
  if (pages.length + whole.length < 2) return [slices.map((s) => ({ ...s }))];

  const cut = Math.ceil(pages.length / 2);
  const halves = [pages.slice(0, cut), pages.slice(cut)].map((part) => {
    const out: DocumentSlice[] = [];
    for (const { documentId, page } of part) {
      const last = out[out.length - 1];
      if (last && last.documentId === documentId) (last.pages as number[]).push(page);
      else out.push({ documentId, pages: [page] });
    }
    return out;
  });
  // Les documents sans pages, un à un, vers la moitié qui a le moins à lire.
  const weight = halves.map((h) => h.reduce((sum, s) => sum + (s.pages?.length ?? 0), 0));
  for (const doc of whole) {
    const lighter = weight[0] <= weight[1] ? 0 : 1;
    halves[lighter].push(doc);
    weight[lighter] += Math.max(1, ...weight);
  }
  return halves.filter((h) => h.length > 0);
}
