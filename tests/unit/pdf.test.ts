import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { countPdfPages, extractPdfPages, normalizePageList, readPdfText } from '@/lib/ingest/pdf';

// Le découpage physique du cours (docs/architecture.md §7.3). Perdre une page
// produit une notion manquante que rien ne signale : c'est le pire mode de
// défaillance du système, d'où ces tests. Les PDF sont fabriqués en mémoire.

async function makePdf(texts: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = doc.addPage([400, 400]);
    page.drawText(text, { x: 40, y: 300, size: 18, font });
  }
  return doc.save();
}

const TEXTS = ['Premiere page alpha', 'Deuxieme page bravo', 'Troisieme page charlie'];

describe('readPdfText', () => {
  it('rend le texte de chaque page à son index', async () => {
    const { pageCount, pages } = await readPdfText(await makePdf(TEXTS));
    expect(pageCount).toBe(3);
    expect(pages).toHaveLength(3);
    pages.forEach((text, i) => expect(text).toContain(TEXTS[i]));
  });

  it('laisse le tampon utilisable par l’appelant après lecture', async () => {
    const bytes = await makePdf(TEXTS);
    await readPdfText(bytes);
    expect(await countPdfPages(bytes)).toBe(3);
  });
});

describe('extractPdfPages', () => {
  it('rend un PDF des seules pages 2–3, avec leur texte', async () => {
    const sliced = await extractPdfPages(await makePdf(TEXTS), [2, 3]);
    expect(sliced).not.toBeNull();
    const { pageCount, pages } = await readPdfText(sliced!);
    expect(pageCount).toBe(2);
    expect(pages[0]).toContain(TEXTS[1]);
    expect(pages[1]).toContain(TEXTS[2]);
  });

  it('ignore une page hors bornes et les doublons', async () => {
    const sliced = await extractPdfPages(await makePdf(TEXTS), [3, 7, 0, 3, 1]);
    const { pageCount, pages } = await readPdfText(sliced!);
    expect(pageCount).toBe(2);
    expect(pages[0]).toContain(TEXTS[2]);
    expect(pages[1]).toContain(TEXTS[0]);
  });

  it('rend null si aucune page demandée n’existe', async () => {
    expect(await extractPdfPages(await makePdf(TEXTS), [9])).toBeNull();
  });
});

describe('normalizePageList', () => {
  it('garde l’ordre demandé, sans doublon ni page hors bornes', () => {
    expect(normalizePageList([2, 2, 5, 1, -1, 1.5, 3], 3)).toEqual([2, 1, 3]);
  });
});
