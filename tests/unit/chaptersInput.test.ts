import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  composeChaptersInput,
  imageDocumentName,
  resolveDocumentName,
} from '@/lib/ingest/chaptersInput';
import { readPdfText } from '@/lib/ingest/pdf';
import type { PreparedDocument, SourceDocument } from '@/lib/ingest/providers/types';
import { MIN_PAGE_TEXT_CHARS } from '@/lib/ingest/slicing';

// Ce que reçoit l'étape chapitres (docs/architecture.md §7.2) : le texte seul,
// et en image les SEULES pages pauvres en texte. Une image envoyée pour rien
// multiplie la facture ; une image manquante fait rater une frontière de
// chapitre. Les PDF sont fabriqués en mémoire, le fournisseur est factice.

const RICH = 'Le cycle de l eau comprend evaporation condensation et precipitations. '.repeat(
  Math.ceil(MIN_PAGE_TEXT_CHARS / 50),
);

async function makePdf(texts: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = doc.addPage([2000, 400]);
    // Une ligne par tranche de 150 caractères, pour rester dans la page.
    for (let i = 0; i * 150 < text.length; i++) {
      page.drawText(text.slice(i * 150, (i + 1) * 150), { x: 10, y: 380 - i * 12, size: 8, font });
    }
  }
  return doc.save();
}

function source(fileId: string, fileName: string, bytes: Uint8Array, mimeType = 'application/pdf'): SourceDocument {
  return { fileId, key: `k/${fileId}`, fileName, mimeType, bytes };
}

/** Un fournisseur factice qui retient ce qu'on lui remet. */
function fakeProvider() {
  const received: SourceDocument[] = [];
  return {
    received,
    prepare: async (docs: SourceDocument[]): Promise<PreparedDocument[]> => {
      received.push(...docs);
      return docs.map((d, i) => ({ fileId: d.fileId, key: d.key, fileName: d.fileName, mimeType: d.mimeType, ref: `file_${i}` }));
    },
  };
}

describe('composeChaptersInput', () => {
  it('un cours dont toutes les pages ont du texte ne part qu’en texte : aucune image', async () => {
    const provider = fakeProvider();
    const input = await composeChaptersInput(
      [source('d1', 'cours.pdf', await makePdf([RICH, RICH, RICH]))],
      provider.prepare,
    );
    expect(provider.received).toEqual([]);
    expect(input.images).toEqual([]);
    expect(input.pageCounts).toEqual({ d1: 3 });
    expect(input.text).toContain('=== Document « cours.pdf » ===');
    expect(input.text).toContain('[page 1]');
    expect(input.text).toContain('[page 3]');
  });

  it('seules les pages pauvres en texte partent en image, dans un PDF qui ne contient qu’elles', async () => {
    const provider = fakeProvider();
    const input = await composeChaptersInput(
      [source('d1', 'cours.pdf', await makePdf([RICH, 'Schema', RICH, '']))],
      provider.prepare,
    );
    expect(provider.received).toHaveLength(1);
    const [image] = provider.received;
    expect(image.fileName).toBe(imageDocumentName('cours.pdf', [2, 4]));
    const { pageCount, pages } = await readPdfText(image.bytes);
    expect(pageCount).toBe(2);
    expect(pages[0]).toContain('Schema');
    expect(input.images).toHaveLength(1);
    // Le texte signale où trouver chaque page en image.
    expect(input.text).toMatch(/\[page 2\] \(peu de texte : cette page est jointe en image .*, page 1\)/);
    expect(input.text).toMatch(/\[page 4\] \(peu de texte : .*, page 2\)/);
    expect(input.text).toMatch(/\[page 1\]\n/);
  });

  it('un document texte part en texte, sans pages ni image', async () => {
    const provider = fakeProvider();
    const input = await composeChaptersInput(
      [source('t1', 'notes.md', new TextEncoder().encode('# Notes\nLa photosynthese.'), 'text/markdown')],
      provider.prepare,
    );
    expect(provider.received).toEqual([]);
    expect(input.pageCounts).toEqual({ t1: null });
    expect(input.text).toContain('La photosynthese.');
  });

  it('plusieurs documents : chacun sous son nom, les pages en image de chacun à part', async () => {
    const provider = fakeProvider();
    const input = await composeChaptersInput(
      [
        source('d1', 'a.pdf', await makePdf([RICH])),
        source('d2', 'b.pdf', await makePdf(['', RICH])),
      ],
      provider.prepare,
    );
    expect(provider.received.map((d) => d.fileId)).toEqual(['d2']);
    expect(input.fileNames).toEqual({ d1: 'a.pdf', d2: 'b.pdf' });
    expect(input.text.indexOf('« a.pdf »')).toBeLessThan(input.text.indexOf('« b.pdf »'));
  });
});

describe('resolveDocumentName', () => {
  const names = { d1: 'Cours.pdf', d2: 'Annexe.pdf' };

  it('ignore la casse et les espaces', () => {
    expect(resolveDocumentName('  cours.PDF ', names)).toBe('d1');
  });

  it('un nom inconnu ne désigne rien', () => {
    expect(resolveDocumentName('autre.pdf', names)).toBeNull();
  });

  it('avec un seul document, c’est forcément lui', () => {
    expect(resolveDocumentName('n’importe quoi', { d1: 'Cours.pdf' })).toBe('d1');
  });
});
