// Lecture et découpe d'un PDF — module PUR, sans réseau ni base.
//
// Deux gestes, et les deux servent le découpage du cours (docs/architecture.md
// §7.2 et §7.3) : l'étape chapitres ne lit que le TEXTE de chaque page, et
// l'étape notions ne reçoit que les PAGES de son chapitre. On coupe le PDF par
// pages, jamais le texte par caractères : une page coupée garde ses images,
// donc ses tableaux et ses schémas.
//
// Les numéros de page sont ceux d'un lecteur : ils commencent à 1.

import { PDFDocument } from 'pdf-lib';
import { extractText } from 'unpdf';

export interface PdfText {
  /** Nombre de pages du document. */
  pageCount: number;
  /** Texte de chaque page : `pages[n - 1]` est le texte de la page n. */
  pages: string[];
}

/** Texte de chaque page d'un PDF. Une page sans couche de texte rend `''`. */
export async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js peut détacher le tampon qu'on lui donne : on lui en passe une copie,
  // pour que l'appelant puisse encore découper le même document ensuite.
  const { totalPages, text } = await extractText(bytes.slice(), { mergePages: false });
  const pages = Array.from({ length: totalPages }, (_, i) => text[i] ?? '');
  return { pageCount: totalPages, pages };
}

/** Nombre de pages d'un PDF, sans en lire le texte. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Nettoie une liste de pages demandées : dans les bornes, sans doublon, dans
 *  l'ordre où on les a demandées. Une page hors bornes est ignorée — jamais une
 *  erreur : des bornes fausses élargissent, elles ne font pas échouer (§7.3). */
export function normalizePageList(pages: readonly number[], pageCount: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1 || p > pageCount || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** Nouveau PDF ne contenant que les pages demandées, dans l'ordre demandé.
 *  Rend `null` si aucune page demandée n'existe dans le document. */
export async function extractPdfPages(
  bytes: Uint8Array,
  pages: readonly number[],
): Promise<Uint8Array | null> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const wanted = normalizePageList(pages, source.getPageCount());
  if (wanted.length === 0) return null;
  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, wanted.map((p) => p - 1));
  for (const page of copied) out.addPage(page);
  return out.save();
}
