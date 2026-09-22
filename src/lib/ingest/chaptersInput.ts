// Ce que reçoit l'étape chapitres — sans base, et sans réseau autre que la
// remise des pages en image au fournisseur, passée en paramètre.
//
// L'étape chapitres ne lit que le TEXTE du cours (docs/architecture.md §7.2) :
// trouver où commence un chapitre est un travail de structure, pas de lecture
// d'illustrations. Une exception, décidée page par page : une page pauvre en
// texte part AUSSI en image, parce que rater une frontière de chapitre coûte
// bien plus que quelques milliers de jetons. Ces pages voyagent dans un petit
// PDF qui ne contient qu'elles.

import { extractPdfPages, readPdfText } from './pdf';
import type { PreparedDocument, SourceDocument } from './providers/types';
import { imagePages, sliceChapters, type ChapterBounds } from './slicing';

export const PDF_MIME = 'application/pdf';

export function isPdf(mimeType: string): boolean {
  return mimeType === PDF_MIME;
}

export function isPlainText(mimeType: string): boolean {
  return mimeType.startsWith('text/');
}

/** Le texte d'un document, page par page. `pages = null` : document sans pages
 *  (texte brut, document de l'IA), dont `text` porte le contenu entier. */
export interface DocumentText {
  fileId: string;
  fileName: string;
  pageCount: number | null;
  pages: string[] | null;
  text: string | null;
}

/** Lit le texte d'un document du lot. Un format qu'on ne sait pas lire rend
 *  un document vide plutôt qu'une erreur : il ne fera que manquer au découpage. */
export async function readDocumentText(doc: SourceDocument): Promise<DocumentText> {
  if (isPdf(doc.mimeType)) {
    const { pageCount, pages } = await readPdfText(doc.bytes);
    return { fileId: doc.fileId, fileName: doc.fileName, pageCount, pages, text: null };
  }
  const text = isPlainText(doc.mimeType) ? new TextDecoder('utf-8').decode(doc.bytes) : '';
  return { fileId: doc.fileId, fileName: doc.fileName, pageCount: null, pages: null, text };
}

/** Le nom sous lequel les pages en image d'un document sont jointes. Il dit
 *  lesquelles, pour que le modèle relie chaque image à son marqueur de page. */
export function imageDocumentName(fileName: string, pages: readonly number[]): string {
  return `${fileName} — pages ${pages.join(', ')} en image`;
}

/** Le texte du cours tel que le lit l'étape chapitres : chaque document sous
 *  son nom, chaque page sous son marqueur « [page N] ». */
export function corpusText(documents: readonly DocumentText[], images: ReadonlyMap<string, number[]>): string {
  const parts: string[] = [];
  for (const doc of documents) {
    parts.push(`=== Document « ${doc.fileName} » ===`);
    if (doc.pages === null) {
      parts.push(doc.text?.trim() || '(document vide)');
      continue;
    }
    const inImage = images.get(doc.fileId) ?? [];
    doc.pages.forEach((text, i) => {
      const page = i + 1;
      const k = inImage.indexOf(page);
      const note = k >= 0
        ? ` (peu de texte : cette page est jointe en image dans « ${imageDocumentName(doc.fileName, inImage)} », page ${k + 1})`
        : '';
      parts.push(`[page ${page}]${note}`);
      if (text.trim()) parts.push(text.trim());
    });
  }
  return parts.join('\n');
}

export interface ChaptersInput {
  /** Le texte de tout le cours, avec ses marqueurs de page. */
  text: string;
  /** Les pages pauvres en texte, remises au fournisseur en image. À rendre au
   *  fournisseur une fois l'appel fait. */
  images: PreparedDocument[];
  /** Le nombre de pages de chaque document (`null` : document sans pages). */
  pageCounts: Record<string, number | null>;
  /** Le nom de chaque document, pour relier une borne rendue à son document. */
  fileNames: Record<string, string>;
}

/**
 * Compose l'entrée de l'étape chapitres. Seules les pages pauvres en texte
 * partent en image, dans un PDF qui ne contient qu'elles ; un document dont
 * toutes les pages ont assez de texte ne part qu'en texte.
 */
export async function composeChaptersInput(
  documents: readonly SourceDocument[],
  prepare: (documents: SourceDocument[]) => Promise<PreparedDocument[]>,
): Promise<ChaptersInput> {
  const texts = await Promise.all(documents.map(readDocumentText));
  const images = new Map<string, number[]>();
  const toSend: SourceDocument[] = [];

  for (const [i, doc] of documents.entries()) {
    const pages = texts[i].pages;
    if (!pages) continue;
    const poor = imagePages(pages);
    if (poor.length === 0) continue;
    const bytes = await extractPdfPages(doc.bytes, poor);
    if (!bytes) continue;
    images.set(doc.fileId, poor);
    toSend.push({
      fileId: doc.fileId,
      key: doc.key,
      fileName: imageDocumentName(doc.fileName, poor),
      mimeType: PDF_MIME,
      bytes,
    });
  }

  return {
    text: corpusText(texts, images),
    images: toSend.length > 0 ? await prepare(toSend) : [],
    pageCounts: Object.fromEntries(texts.map((t) => [t.fileId, t.pageCount])),
    fileNames: Object.fromEntries(texts.map((t) => [t.fileId, t.fileName])),
  };
}

/** Relie le nom de document rendu par le modèle à un document du lot. La casse
 *  et les espaces ne comptent pas ; un nom inconnu ne désigne rien — sauf s'il
 *  n'y a qu'un document, qui est alors forcément celui-là. */
export function resolveDocumentName(name: string, fileNames: Readonly<Record<string, string>>): string | null {
  const wanted = name.trim().toLowerCase();
  const entries = Object.entries(fileNames);
  const found = entries.find(([, fileName]) => fileName.trim().toLowerCase() === wanted);
  if (found) return found[0];
  return entries.length === 1 ? entries[0][0] : null;
}

// ─── Étape 2 : les pages d'UN chapitre ────────────────────────────────────────

/** Un extrait joint à l'étape notions : son nom, et les pages du cours qu'il
 *  contient dans l'ordre (`null` : le document entier). */
export interface ChapterExtract {
  documentId: string;
  name: string;
  pages: number[] | null;
}

export interface ChapterSlicesInput {
  /** Ce qui part au modèle, dans l'ordre des documents. */
  documents: PreparedDocument[];
  /** Les extraits remis au fournisseur pour CET appel — à rendre ensuite. Les
   *  documents entiers, déjà chez lui pour tout le lot, n'y sont pas. */
  uploaded: PreparedDocument[];
  extracts: ChapterExtract[];
  /** Le chapitre n'avait aucune borne exploitable : il reçoit des documents
   *  entiers, et c'est dit au compte-rendu. */
  wholeDocumentFallback: boolean;
}

/** « 3 à 5, 9 » plutôt que « 3, 4, 5, 9 » : le nom d'un extrait reste lisible. */
export function pageRanges(pages: readonly number[]): string {
  const parts: string[] = [];
  let start = pages[0];
  for (let i = 1; i <= pages.length; i++) {
    if (pages[i] === pages[i - 1] + 1) continue;
    const end = pages[i - 1];
    parts.push(start === end ? `${start}` : `${start} à ${end}`);
    start = pages[i];
  }
  return parts.join(', ');
}

/**
 * Les pages d'un chapitre, prêtes à partir (§7.3). Le découpage suit les
 * bornes de TOUS les chapitres — une page orpheline revient au chapitre qui la
 * précède —, puis seules les pages de celui-ci sont extraites et remises au
 * fournisseur. Un document pris en entier réutilise la remise faite pour tout
 * le lot, sans rien téléverser.
 */
export async function composeChapterSlices(
  chapterId: string,
  chapters: readonly ChapterBounds[],
  pageCounts: Readonly<Record<string, number | null>>,
  prepared: readonly PreparedDocument[],
  readBytes: (doc: PreparedDocument) => Promise<Uint8Array>,
  prepare: (documents: SourceDocument[]) => Promise<PreparedDocument[]>,
): Promise<ChapterSlicesInput> {
  const sliced = sliceChapters(
    chapters,
    prepared.map((d) => ({ id: d.fileId, pageCount: pageCounts[d.fileId] ?? null })),
  );
  const mine = sliced.chapters.find((c) => c.key === chapterId);
  if (!mine) return { documents: [], uploaded: [], extracts: [], wholeDocumentFallback: false };

  const byId = new Map(prepared.map((d) => [d.fileId, d]));
  const documents: (PreparedDocument | SourceDocument)[] = [];
  const extracts: ChapterExtract[] = [];
  const toUpload: SourceDocument[] = [];

  for (const slice of mine.slices) {
    const doc = byId.get(slice.documentId);
    if (!doc) continue;
    const count = pageCounts[doc.fileId] ?? null;
    const whole = slice.pages === null || (count !== null && slice.pages.length === count);
    if (whole) {
      documents.push(doc);
      extracts.push({ documentId: doc.fileId, name: doc.fileName, pages: null });
      continue;
    }
    const bytes = await extractPdfPages(await readBytes(doc), slice.pages as number[]);
    if (!bytes) continue;
    const name = `${doc.fileName} — pages ${pageRanges(slice.pages as number[])}`;
    const source: SourceDocument = { fileId: doc.fileId, key: doc.key, fileName: name, mimeType: PDF_MIME, bytes };
    toUpload.push(source);
    documents.push(source);
    extracts.push({ documentId: doc.fileId, name, pages: slice.pages as number[] });
  }

  const uploaded = toUpload.length > 0 ? await prepare(toUpload) : [];
  const handed = new Map(toUpload.map((s, i) => [s, uploaded[i]]));
  return {
    documents: documents.map((d) => ('ref' in d ? d : (handed.get(d) as PreparedDocument))),
    uploaded,
    extracts,
    wholeDocumentFallback: mine.wholeDocumentFallback,
  };
}

/** Une page lue dans un extrait, rendue à sa page du cours. Ne se résout que
 *  s'il n'y a qu'un extrait : avec plusieurs, on ne sait pas duquel elle vient,
 *  et une provenance fausse est pire qu'une provenance absente. */
export function sourcePageOf(
  extracts: readonly ChapterExtract[],
  page: number | undefined,
): { documentId: string; page: number | undefined } | null {
  if (extracts.length !== 1) return null;
  const [extract] = extracts;
  if (!page || page < 1) return { documentId: extract.documentId, page: undefined };
  if (extract.pages === null) return { documentId: extract.documentId, page };
  return { documentId: extract.documentId, page: extract.pages[page - 1] };
}
