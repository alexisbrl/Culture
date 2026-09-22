import { describe, expect, it } from 'vitest';

import {
  MIN_PAGE_TEXT_CHARS,
  imagePages,
  isTextPoor,
  sliceChapters,
  type ChapterBounds,
} from '@/lib/ingest/slicing';

// Le découpage décide quelles pages voit chaque chapitre à l'étape notions.
// Une page perdue est une notion manquante que rien ne signale — le pire mode
// de défaillance du système (docs/architecture.md §7.3). Chaque règle
// « élargir plutôt que perdre » a donc son test.

const DOC = { id: 'd1', pageCount: 10 };

function pagesOf(result: ReturnType<typeof sliceChapters>, key: string, doc = 'd1') {
  const chapter = result.chapters.find((c) => c.key === key)!;
  return chapter.slices.find((s) => s.documentId === doc)?.pages;
}

function span(from: number, to: number, documentId = 'd1') {
  return { documentId, from, to };
}

describe('sliceChapters', () => {
  it('découpe des bornes jointives telles quelles', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 4)] }, { key: 'b', spans: [span(5, 10)] }],
      [DOC],
    );
    expect(pagesOf(r, 'a')).toEqual([1, 2, 3, 4]);
    expect(pagesOf(r, 'b')).toEqual([5, 6, 7, 8, 9, 10]);
    expect(r.uncoveredDocuments).toEqual([]);
  });

  it('chevauchement : les deux chapitres gardent la page', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 5)] }, { key: 'b', spans: [span(5, 10)] }],
      [DOC],
    );
    expect(pagesOf(r, 'a')).toContain(5);
    expect(pagesOf(r, 'b')).toContain(5);
  });

  it('trou : les pages orphelines vont au chapitre précédent', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 3)] }, { key: 'b', spans: [span(7, 10)] }],
      [DOC],
    );
    expect(pagesOf(r, 'a')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pagesOf(r, 'b')).toEqual([7, 8, 9, 10]);
  });

  it('pages avant le premier chapitre : rattachées au premier', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(3, 6)] }, { key: 'b', spans: [span(7, 10)] }],
      [DOC],
    );
    expect(pagesOf(r, 'a')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('le premier « dans l’ordre du document », pas du programme', () => {
    // Le programme range b avant a, mais c'est a qui ouvre le document.
    const r = sliceChapters(
      [{ key: 'b', spans: [span(7, 10)] }, { key: 'a', spans: [span(3, 6)] }],
      [DOC],
    );
    expect(pagesOf(r, 'a')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pagesOf(r, 'b')).toEqual([7, 8, 9, 10]);
  });

  it('chapitre éclaté en deux intervalles', () => {
    const r = sliceChapters(
      [
        { key: 'a', spans: [span(1, 2), span(6, 7)] },
        { key: 'b', spans: [span(3, 5), span(8, 10)] },
      ],
      [DOC],
    );
    expect(pagesOf(r, 'a')).toEqual([1, 2, 6, 7]);
    expect(pagesOf(r, 'b')).toEqual([3, 4, 5, 8, 9, 10]);
  });

  it('aucune page n’est perdue, quelles que soient les bornes', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(2, 2)] }, { key: 'b', spans: [span(9, 9)] }],
      [DOC],
    );
    const all = new Set([...(pagesOf(r, 'a') ?? []), ...(pagesOf(r, 'b') ?? [])]);
    expect([...all].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each<[string, ChapterBounds['spans']]>([
    ['absentes', []],
    ['à zéro', [span(0, 0)]],
    ['inversées', [span(8, 3)]],
    ['hors document', [span(40, 45)]],
  ])('bornes %s : le document entier, signalé', (_, spans) => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 10)] }, { key: 'b', spans }],
      [DOC],
    );
    const b = r.chapters.find((c) => c.key === 'b')!;
    expect(b.wholeDocumentFallback).toBe(true);
    expect(pagesOf(r, 'b')).toBeNull();
    expect(r.chapters.find((c) => c.key === 'a')!.wholeDocumentFallback).toBe(false);
  });

  it('borne qui dépasse la fin : ramenée à la dernière page', () => {
    const r = sliceChapters([{ key: 'a', spans: [span(8, 99)] }], [DOC]);
    expect(pagesOf(r, 'a')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.chapters[0].wholeDocumentFallback).toBe(false);
  });

  it('bornes inexploitables sur un document désigné : ce document seul', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 5)] }, { key: 'b', spans: [span(0, 0, 'd2')] }],
      [DOC, { id: 'd2', pageCount: 4 }],
    );
    const b = r.chapters.find((c) => c.key === 'b')!;
    expect(b.slices).toEqual([{ documentId: 'd2', pages: null }]);
  });

  it('document que rien ne couvre : en entier dans chaque chapitre', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 10)] }],
      [DOC, { id: 'd2', pageCount: 4 }],
    );
    expect(r.uncoveredDocuments).toEqual(['d2']);
    expect(pagesOf(r, 'a', 'd2')).toBeNull();
  });

  it('document sans pages : sa tranche est le document entier', () => {
    const r = sliceChapters(
      [{ key: 'a', spans: [span(1, 1, 'txt')] }],
      [{ id: 'txt', pageCount: null }],
    );
    expect(pagesOf(r, 'a', 'txt')).toBeNull();
    expect(r.chapters[0].wholeDocumentFallback).toBe(false);
  });

  it('ignore un document inconnu', () => {
    const r = sliceChapters([{ key: 'a', spans: [span(1, 10), span(1, 3, 'zzz')] }], [DOC]);
    expect(r.chapters[0].slices.map((s) => s.documentId)).toEqual(['d1']);
  });
});

describe('texte seul ou texte + image, page par page', () => {
  const rich = 'x'.repeat(MIN_PAGE_TEXT_CHARS);
  const poor = 'x'.repeat(MIN_PAGE_TEXT_CHARS - 1);

  it('seuil exact : une page à MIN_PAGE_TEXT_CHARS part en texte seul', () => {
    expect(isTextPoor(rich)).toBe(false);
    expect(isTextPoor(poor)).toBe(true);
  });

  it('les espaces ne comptent pas', () => {
    expect(isTextPoor(' \n'.repeat(MIN_PAGE_TEXT_CHARS))).toBe(true);
  });

  it('document mi-saisi mi-scanné : seules les pages scannées partent en image', () => {
    // Moyenne au-dessus du seuil, et pourtant la moitié du cours est scannée.
    const pages = [rich + rich + rich, rich + rich, '', '', rich];
    expect(imagePages(pages)).toEqual([3, 4]);
  });
});
