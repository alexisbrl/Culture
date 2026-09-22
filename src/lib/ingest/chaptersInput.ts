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
import { imagePages } from './slicing';

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
