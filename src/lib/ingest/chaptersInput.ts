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
import { imagePages, sliceChapters, usableSpan, type ChapterBounds } from './slicing';

export const PDF_MIME = 'application/pdf';

export function isPdf(mimeType: string): boolean {
  return mimeType === PDF_MIME;
}

export function isPlainText(mimeType: string): boolean {
  return mimeType.startsWith('text/');
}

/** Le texte d'un document, page par page. `pages = null` : document qu'on ne
 *  sait pas lire, dont `text` porte ce qu'on en a (rien, le plus souvent). */
export interface DocumentText {
  fileId: string;
  fileName: string;
  pageCount: number | null;
  pages: string[] | null;
  text: string | null;
}

/** Taille visée d'une page de document texte, en caractères. */
export const TEXT_PAGE_CHARS = 3000;

/**
 * Les pages d'un document TEXTE (texte brut, document écrit par l'IA). **Fonction
 * pure** : l'étape chapitres et l'étape notions la rejouent sur les mêmes octets,
 * et doivent tomber sur les mêmes pages.
 *
 * ⚠️ Sans pages, un document texte ne se découpait pas : chaque chapitre qui le
 * citait le recevait EN ENTIER, et réécrivait le cours sous son titre. Constaté
 * le 06/10/2026 : un cours de l'IA sur les Bernoulli, quatre chapitres, 173
 * paires de redites à trancher et cinq minutes d'attente.
 *
 * **Un document titré se coupe sur ses titres, et seulement là** : un titre de
 * niveau 1 ou 2 ouvre une page, quelle que soit la longueur de la précédente. Le
 * document de l'IA s'écrit partie par partie (`bodyFromParts`) : une partie y est
 * donc exactement une page, et un chapitre tombe pile sur ses parties. Un texte
 * sans aucun titre se coupe entre deux paragraphes, au-delà de
 * `TEXT_PAGE_CHARS` ; un paragraphe plus long qu'une page reste entier.
 */
export function textPages(text: string): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const isHeading = (p: string) => /^#{1,2}\s/.test(p);
  const titled = paragraphs.some(isHeading);
  const pages: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    const cut = titled ? isHeading(paragraph) : size + paragraph.length > TEXT_PAGE_CHARS;
    if (current.length > 0 && cut) {
      pages.push(current.join('\n\n'));
      current = [];
      size = 0;
    }
    current.push(paragraph);
    size += paragraph.length;
  }
  if (current.length > 0) pages.push(current.join('\n\n'));
  return pages;
}

/** Les pages choisies d'un document texte, chacune sous son marqueur relatif à
 *  l'extrait — c'est ce numéro que l'étape notions rend, comme pour un PDF. */
export function textExtract(pages: readonly string[], wanted: readonly number[]): string {
  return wanted
    .filter((p) => p >= 1 && p <= pages.length)
    .map((p, i) => `[page ${i + 1}]\n${pages[p - 1]}`)
    .join('\n\n');
}

/** Lit le texte d'un document du lot. Un format qu'on ne sait pas lire rend
 *  un document vide plutôt qu'une erreur : il ne fera que manquer au découpage. */
export async function readDocumentText(doc: SourceDocument): Promise<DocumentText> {
  if (isPdf(doc.mimeType)) {
    const { pageCount, pages } = await readPdfText(doc.bytes);
    return { fileId: doc.fileId, fileName: doc.fileName, pageCount, pages, text: null };
  }
  if (isPlainText(doc.mimeType)) {
    const pages = textPages(new TextDecoder('utf-8').decode(doc.bytes));
    if (pages.length > 0) return { fileId: doc.fileId, fileName: doc.fileName, pageCount: pages.length, pages, text: null };
  }
  return { fileId: doc.fileId, fileName: doc.fileName, pageCount: null, pages: null, text: '' };
}

/** Le nom sous lequel les pages en image d'un document sont jointes. Il dit
 *  lesquelles, pour que le modèle relie chaque image à son marqueur de page. */
export function imageDocumentName(fileName: string, pages: readonly number[]): string {
  return `${fileName} — pages ${pages.join(', ')} en image`;
}

/** La place d'un document dans la numérotation du lot : ses pages y portent
 *  les numéros `offset + 1` à `offset + pageCount`. */
export interface LotDocument {
  fileId: string;
  offset: number;
  pageCount: number;
}

/**
 * **Une seule numérotation pour tout le lot** (06/10/2026) : les pages se suivent
 * d'un document à l'autre, et un numéro désigne une seule page. L'étape
 * chapitres ne cite plus que des numéros — jamais un nom de document, qu'on
 * devait relier au bon fichier et que deux fichiers homonymes rendaient
 * ambigu. Un document sans pages lisibles n'a aucun numéro : il ne peut pas
 * être cité, donc personne ne le reçoit. **Fonction pure.**
 */
export function lotLayout(documents: readonly DocumentText[]): LotDocument[] {
  const layout: LotDocument[] = [];
  let offset = 0;
  for (const doc of documents) {
    const pageCount = doc.pages?.length ?? 0;
    layout.push({ fileId: doc.fileId, offset, pageCount });
    offset += pageCount;
  }
  return layout;
}

/** Ramène les intervalles du lot, tels que l'étape chapitres les rend, aux pages
 *  de chaque document. Un intervalle à cheval sur deux documents se coupe en
 *  deux ; ce qui tombe hors du lot est ignoré. Le document est désigné par son
 *  identifiant. **Fonction pure.** */
export function localizeSpans(
  spans: readonly { from: number; to: number }[],
  layout: readonly LotDocument[],
): { document: string; from: number; to: number }[] {
  const out: { document: string; from: number; to: number }[] = [];
  for (const span of spans) {
    if (!Number.isInteger(span.from) || !Number.isInteger(span.to) || span.to < span.from) continue;
    for (const doc of layout) {
      const from = Math.max(span.from, doc.offset + 1);
      const to = Math.min(span.to, doc.offset + doc.pageCount);
      if (from <= to) out.push({ document: doc.fileId, from: from - doc.offset, to: to - doc.offset });
    }
  }
  return out;
}

/** Le texte du cours tel que le lit l'étape chapitres : chaque document sous
 *  son nom, chaque page sous son marqueur « [page N] », numéroté à la suite sur
 *  tout le lot (`lotLayout`). */
export function corpusText(documents: readonly DocumentText[], images: ReadonlyMap<string, number[]>): string {
  const layout = lotLayout(documents);
  const parts: string[] = [];
  documents.forEach((doc, d) => {
    parts.push(`=== Document « ${doc.fileName} » ===`);
    if (doc.pages === null) {
      parts.push('(document illisible : il ne sera lu par aucun chapitre)');
      return;
    }
    const inImage = images.get(doc.fileId) ?? [];
    doc.pages.forEach((text, i) => {
      const page = i + 1;
      const k = inImage.indexOf(page);
      const note = k >= 0
        ? ` (peu de texte : cette page est jointe en image dans « ${imageDocumentName(doc.fileName, inImage)} », page ${k + 1})`
        : '';
      parts.push(`[page ${layout[d].offset + page}]${note}`);
      if (text.trim()) parts.push(text.trim());
    });
  });
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
  /** Le nom de chaque document, pour le compte-rendu et la consigne. */
  fileNames: Record<string, string>;
  /** La numérotation unique du lot, pour ramener les bornes rendues aux pages
   *  de chaque document (`localizeSpans`). */
  layout: LotDocument[];
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
    // Une page de texte n'a pas d'image : il n'y a rien à montrer en plus.
    if (!pages || !isPdf(doc.mimeType)) continue;
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
    layout: lotLayout(texts),
  };
}

/** Relie le nom de document rendu par le modèle à un document du lot. La casse
 *  et les espaces ne comptent pas ; un nom inconnu ne désigne rien — sauf s'il
 *  n'y a qu'un document, qui est alors forcément celui-là. */
export function resolveDocumentName(name: string, fileNames: Readonly<Record<string, string>>): string | null {
  // L'identifiant d'un document du lot le désigne sans ambiguïté : c'est ce
  // que portent les bornes depuis la numérotation unique (`localizeSpans`).
  if (Object.hasOwn(fileNames, name)) return name;
  const wanted = name.trim().toLowerCase();
  const entries = Object.entries(fileNames);
  const found = entries.find(([, fileName]) => fileName.trim().toLowerCase() === wanted);
  if (found) return found[0];
  return entries.length === 1 ? entries[0][0] : null;
}

/** Les chapitres de la réponse qui occupent au moins une page du cours.
 *
 *  C'est ce qui décide qu'un chapitre est au programme (§7.6) : sans page, il
 *  n'y est pas — un chapitre existant sort, un chapitre neuf n'est pas créé.
 *  Une borne compte si elle désigne un document du lot et tombe dans ses pages ;
 *  un document sans pages (texte, document de l'IA) compte dès qu'il est
 *  désigné, puisque sa seule tranche possible est lui-même. */
export function chaptersWithPages(
  bounds: readonly { ref: string; spans: readonly { document: string; from: number; to: number }[] }[],
  pageCounts: Readonly<Record<string, number | null>>,
  fileNames: Readonly<Record<string, string>>,
): Set<string> {
  const out = new Set<string>();
  for (const chapter of bounds) {
    const paged = chapter.spans.some((span) => {
      const documentId = resolveDocumentName(span.document, fileNames);
      if (!documentId || !(documentId in pageCounts)) return false;
      const count = pageCounts[documentId];
      return count === null || usableSpan({ documentId, from: span.from, to: span.to }, count) !== null;
    });
    if (paged) out.add(chapter.ref);
  }
  return out;
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
  if (!mine) return { documents: [], uploaded: [], extracts: [] };

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
    const wanted = slice.pages as number[];
    const raw = await readBytes(doc);
    // Un document texte se découpe sur les mêmes pages que l'étape chapitres a
    // lues (`textPages`), et repart en texte.
    const bytes = isPlainText(doc.mimeType)
      ? new TextEncoder().encode(textExtract(textPages(new TextDecoder('utf-8').decode(raw)), wanted))
      : await extractPdfPages(raw, wanted);
    if (!bytes || bytes.length === 0) continue;
    const name = `${doc.fileName} — pages ${pageRanges(wanted)}`;
    const mimeType = isPlainText(doc.mimeType) ? doc.mimeType : PDF_MIME;
    const source: SourceDocument = { fileId: doc.fileId, key: doc.key, fileName: name, mimeType, bytes };
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
