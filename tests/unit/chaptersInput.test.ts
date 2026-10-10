import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  chaptersWithPages,
  composeChapterSlices,
  composeChaptersInput,
  pageRanges,
  sourcePageOf,
  imageDocumentName,
  resolveDocumentName,
  TEXT_PAGE_CHARS,
  textExtract,
  textPages,
  corpusText,
  localizeSpans,
  lotLayout,
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

  it('un document texte part en texte, avec ses pages et sans image', async () => {
    const provider = fakeProvider();
    const input = await composeChaptersInput(
      [source('t1', 'notes.md', new TextEncoder().encode('# Notes\nLa photosynthese.\n\n## Partie 2\nLa respiration.'), 'text/markdown')],
      provider.prepare,
    );
    expect(provider.received).toEqual([]);
    expect(input.pageCounts).toEqual({ t1: 2 });
    expect(input.text).toContain('[page 2]');
    expect(input.text).toContain('La photosynthese.');
  });
});

describe('textPages — les pages d’un document texte', () => {
  it('un titre de niveau 1 ou 2 ouvre une page, pas un titre plus fin', () => {
    expect(textPages('# A\nun\n\n### a1\ndeux\n\n## B\ntrois')).toEqual(['# A\nun\n\n### a1\ndeux', '## B\ntrois']);
  });

  it('coupe entre deux paragraphes au-delà de la taille visée, jamais au milieu', () => {
    const long = 'x'.repeat(TEXT_PAGE_CHARS - 10);
    expect(textPages(`${long}\n\nsuite assez longue`)).toEqual([long, 'suite assez longue']);
    expect(textPages('y'.repeat(TEXT_PAGE_CHARS * 2))).toHaveLength(1);
  });

  it('les mêmes octets donnent les mêmes pages, fins de ligne comprises', () => {
    expect(textPages('# A\r\nun\r\n\r\n# B\r\ndeux')).toEqual(textPages('# A\nun\n\n# B\ndeux'));
  });

  it('un texte vide n’a aucune page', () => {
    expect(textPages('  \n\n ')).toEqual([]);
  });

  it('un extrait renumérote ses pages et ignore une page hors du document', () => {
    expect(textExtract(['p1', 'p2', 'p3'], [2, 3, 9])).toBe('[page 1]\np2\n\n[page 2]\np3');
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

// Ce qui décide qu'un chapitre est au programme (§7.6) : sans page, il sort.
describe('chaptersWithPages', () => {
  const names = { d1: 'Cours.pdf', t1: 'Notes.md' };
  const counts = { d1: 10, t1: null };
  const at = (ref: string, ...spans: [string, number, number][]) =>
    ({ ref, spans: spans.map(([document, from, to]) => ({ document, from, to })) });

  it('garde un chapitre qui occupe au moins une page du cours', () => {
    expect(chaptersWithPages([at('a', ['Cours.pdf', 3, 5])], counts, names)).toEqual(new Set(['a']));
  });

  it('écarte un chapitre sans bornes, ou aux bornes inexploitables', () => {
    const out = chaptersWithPages(
      [at('vide'), at('zero', ['Cours.pdf', 0, 0]), at('hors', ['Cours.pdf', 40, 45]), at('inconnu', ['Autre.pdf', 1, 2])],
      counts,
      names,
    );
    expect(out).toEqual(new Set());
  });

  it('un document sans pages compte dès qu’il est désigné', () => {
    expect(chaptersWithPages([at('a', ['Notes.md', 1, 1])], counts, names)).toEqual(new Set(['a']));
  });

  it('une seule borne exploitable suffit', () => {
    expect(chaptersWithPages([at('a', ['Cours.pdf', 0, 0], ['Cours.pdf', 9, 12])], counts, names)).toEqual(new Set(['a']));
  });
});

describe('composeChapterSlices — les seules pages du chapitre (§7.3)', () => {
  const prepared = (fileId: string, fileName: string, mimeType = 'application/pdf'): PreparedDocument => ({
    fileId, key: `k/${fileId}`, fileName, mimeType, ref: `whole_${fileId}`,
  });

  async function setup() {
    const texts = Array.from({ length: 10 }, (_, i) => `Page numero ${i + 1} du cours`);
    const bytes = new Map([['d1', await makePdf(texts)]]);
    const readBytes = async (doc: PreparedDocument) => bytes.get(doc.fileId) as Uint8Array;
    return { readBytes };
  }

  const chapters = [
    { key: 'c1', spans: [{ documentId: 'd1', from: 1, to: 4 }] },
    { key: 'c2', spans: [{ documentId: 'd1', from: 5, to: 7 }] },
    { key: 'c3', spans: [{ documentId: 'd1', from: 9, to: 10 }] },
  ];

  it('le fournisseur ne reçoit que les pages du chapitre, orpheline comprise', async () => {
    const { readBytes } = await setup();
    const provider = fakeProvider();
    const input = await composeChapterSlices('c2', chapters, { d1: 10 }, [prepared('d1', 'cours.pdf')], readBytes, provider.prepare);

    expect(provider.received).toHaveLength(1);
    const { pageCount, pages } = await readPdfText(provider.received[0].bytes);
    // Pages 5 à 7, plus la page 8 que personne ne réclamait : elle revient au
    // chapitre qui la précède.
    expect(pageCount).toBe(4);
    expect(pages[0]).toContain('Page numero 5');
    expect(pages[3]).toContain('Page numero 8');
    expect(input.extracts).toEqual([{ documentId: 'd1', name: 'cours.pdf — pages 5 à 8', pages: [5, 6, 7, 8] }]);
    expect(input.uploaded).toHaveLength(1);
    expect(input.documents).toEqual(input.uploaded);
  });

  it('un chapitre sans borne ne reçoit rien, et rien n’est téléversé', async () => {
    const { readBytes } = await setup();
    const provider = fakeProvider();
    const input = await composeChapterSlices(
      'c4',
      [...chapters, { key: 'c4', spans: [] }],
      { d1: 10 },
      [prepared('d1', 'cours.pdf')],
      readBytes,
      provider.prepare,
    );
    expect(provider.received).toEqual([]);
    expect(input.documents).toEqual([]);
    expect(input.extracts).toEqual([]);
  });

  it('un document texte part en entier', async () => {
    const { readBytes } = await setup();
    const provider = fakeProvider();
    const notes = prepared('t1', 'notes.md', 'text/markdown');
    const input = await composeChapterSlices(
      'c1',
      [{ key: 'c1', spans: [{ documentId: 't1', from: 1, to: 1 }] }],
      { t1: null },
      [notes],
      readBytes,
      provider.prepare,
    );
    expect(provider.received).toEqual([]);
    expect(input.documents).toEqual([notes]);
  });

  it('les pages lues dans l’extrait sont rendues à leur page du cours', () => {
    const extract = { documentId: 'd1', name: 'x', pages: [5, 6, 7, 8] };
    expect(sourcePageOf([extract], 2)).toEqual({ documentId: 'd1', page: 6 });
    expect(sourcePageOf([extract], 0)).toEqual({ documentId: 'd1', page: undefined });
    expect(sourcePageOf([extract, extract], 2)).toBeNull();
  });

  it('pageRanges', () => {
    expect(pageRanges([3, 4, 5, 9])).toBe('3 à 5, 9');
    expect(pageRanges([2])).toBe('2');
  });
});

describe('la numérotation unique du lot', () => {
  const docs = [
    { fileId: 'a', fileName: 'a.pdf', pageCount: 3, pages: ['1', '2', '3'], text: null },
    { fileId: 'x', fileName: 'x.docx', pageCount: null, pages: null, text: '' },
    { fileId: 'b', fileName: 'b.md', pageCount: 2, pages: ['4', '5'], text: null },
  ];

  it('les pages se suivent d’un document à l’autre ; un document illisible n’a aucun numéro', () => {
    expect(lotLayout(docs)).toEqual([
      { fileId: 'a', offset: 0, pageCount: 3 },
      { fileId: 'x', offset: 3, pageCount: 0 },
      { fileId: 'b', offset: 3, pageCount: 2 },
    ]);
  });

  it('un intervalle se rend à ses documents, coupé en deux s’il est à cheval', () => {
    const layout = lotLayout(docs);
    expect(localizeSpans([{ from: 2, to: 4 }], layout)).toEqual([
      { document: 'a', from: 2, to: 3 },
      { document: 'b', from: 1, to: 1 },
    ]);
    expect(localizeSpans([{ from: 5, to: 9 }], layout)).toEqual([{ document: 'b', from: 2, to: 2 }]);
  });

  it('ce qui tombe hors du lot, ou à l’envers, est ignoré', () => {
    const layout = lotLayout(docs);
    expect(localizeSpans([{ from: 8, to: 9 }, { from: 3, to: 1 }, { from: 0, to: 0 }], layout)).toEqual([]);
  });

  it('le texte du cours porte les numéros du lot', () => {
    const text = corpusText(docs, new Map());
    expect(text).toContain('[page 4]\n4');
    expect(text).toContain('(document illisible : il ne sera lu par aucun chapitre)');
  });
});
