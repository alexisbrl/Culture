import { describe, expect, it } from 'vitest';

import {
  CANCEL_THRESHOLD,
  RELAUNCH_THRESHOLD,
  classifyNotions,
  mergeRelaunch,
  recheckList,
  thresholdDecision,
  type ChapterLayout,
  type ExistingNotion,
  type NotionStanding,
  type NotionVerdict,
} from '@/lib/ingest/verdicts';

// Le sort des notions existantes après l'étape chapitres (docs/architecture.md
// §7.6). Ces règles décident quelles notions sortent du programme et quand une
// génération est annulée : une erreur ici déplace ou cache le travail d'un
// professeur sans que rien ne le signale.

const layout: ChapterLayout = {
  visible: new Set(['c1', 'c2', 'new1']),
  dropped: new Set(['old']),
};

function standings(counts: { forgotten: number; placed?: number; check?: number; out?: number }) {
  const map = new Map<string, NotionStanding>();
  let i = 0;
  for (let k = 0; k < counts.forgotten; k++) map.set(`n${i++}`, { kind: 'forgotten' });
  for (let k = 0; k < (counts.placed ?? 0); k++) map.set(`n${i++}`, { kind: 'placed', chapterRef: 'c1' });
  for (let k = 0; k < (counts.check ?? 0); k++) map.set(`n${i++}`, { kind: 'check' });
  for (let k = 0; k < (counts.out ?? 0); k++) map.set(`n${i++}`, { kind: 'out' });
  return map;
}

describe('classifyNotions', () => {
  const notions: ExistingNotion[] = [
    { id: 'a', chapterId: 'c1' },
    { id: 'b', chapterId: 'c1' },
    { id: 'c', chapterId: 'c2' },
    { id: 'd', chapterId: 'old' },
    { id: 'e', chapterId: 'old' },
    { id: 'f', chapterId: null },
    { id: 'g', chapterId: 'c2' },
  ];

  it('range chaque notion selon son verdict', () => {
    const verdicts: NotionVerdict[] = [
      { notionId: 'a', verdict: 'chapter', chapterRef: 'new1' },
      { notionId: 'b', verdict: 'out' },
      { notionId: 'c', verdict: 'check' },
      { notionId: 'd', verdict: 'chapter', chapterRef: 'c2' },
    ];
    const r = classifyNotions(notions, verdicts, layout);
    expect(r.get('a')).toEqual({ kind: 'placed', chapterRef: 'new1' });
    expect(r.get('b')).toEqual({ kind: 'out' });
    expect(r.get('c')).toEqual({ kind: 'check' });
    expect(r.get('d')).toEqual({ kind: 'placed', chapterRef: 'c2' });
  });

  it('le silence vaut « oubliée »', () => {
    const r = classifyNotions(notions, [], layout);
    expect(r.get('a')).toEqual({ kind: 'forgotten' });
    expect(r.get('f')).toEqual({ kind: 'forgotten' });
  });

  it('laissée dans un chapitre écarté : hors programme, qu’on le dise ou non', () => {
    const r = classifyNotions(
      notions,
      [{ notionId: 'e', verdict: 'chapter', chapterRef: 'old' }],
      layout,
    );
    expect(r.get('d')).toEqual({ kind: 'out' });
    expect(r.get('e')).toEqual({ kind: 'out' });
  });

  it('une référence inconnue est ignorée', () => {
    const r = classifyNotions(
      notions,
      [
        { notionId: 'zzz', verdict: 'out' },
        { notionId: 'g', verdict: 'chapter', chapterRef: 'nowhere' },
      ],
      layout,
    );
    expect(r.has('zzz')).toBe(false);
    expect(r.get('g')).toEqual({ kind: 'forgotten' });
    expect(r.size).toBe(notions.length);
  });

  it('deux verdicts pour la même notion : le premier fait foi', () => {
    const r = classifyNotions(
      notions,
      [
        { notionId: 'a', verdict: 'check' },
        { notionId: 'a', verdict: 'out' },
      ],
      layout,
    );
    expect(r.get('a')).toEqual({ kind: 'check' });
  });
});

describe('thresholdDecision', () => {
  it('premier passage : relance à 10 % exactement, pas en dessous', () => {
    expect(RELAUNCH_THRESHOLD).toBe(0.1);
    expect(thresholdDecision(standings({ forgotten: 2, placed: 18 }), 'first')).toBe('relaunch');
    expect(thresholdDecision(standings({ forgotten: 2, placed: 19 }), 'first')).toBe('continue');
  });

  it('après relance : annule à 25 % exactement, pas en dessous', () => {
    expect(CANCEL_THRESHOLD).toBe(0.25);
    expect(thresholdDecision(standings({ forgotten: 8, placed: 24 }), 'relaunch')).toBe('cancel');
    expect(thresholdDecision(standings({ forgotten: 7, placed: 25 }), 'relaunch')).toBe('continue');
  });

  it('ne relance jamais deux fois', () => {
    expect(thresholdDecision(standings({ forgotten: 3, placed: 17 }), 'relaunch')).toBe('continue');
  });

  it('le premier passage n’annule jamais directement', () => {
    expect(thresholdDecision(standings({ forgotten: 10, placed: 0 }), 'first')).toBe('relaunch');
  });

  it('une notion isolée ne déclenche rien, même à 100 %', () => {
    expect(thresholdDecision(standings({ forgotten: 1 }), 'first')).toBe('continue');
    expect(thresholdDecision(standings({ forgotten: 1, placed: 1 }), 'relaunch')).toBe('continue');
  });

  it('« à vérifier » et « hors programme » ne comptent pas', () => {
    expect(thresholdDecision(standings({ forgotten: 0, check: 50, out: 50 }), 'first')).toBe('continue');
    expect(thresholdDecision(standings({ forgotten: 1, check: 9, out: 9, placed: 0 }), 'first')).toBe('continue');
  });

  it('atelier vide : rien à mesurer', () => {
    expect(thresholdDecision(new Map(), 'first')).toBe('continue');
  });
});

describe('mergeRelaunch', () => {
  it('ne remplace que les oubliées', () => {
    const first = new Map<string, NotionStanding>([
      ['a', { kind: 'forgotten' }],
      ['b', { kind: 'out' }],
      ['c', { kind: 'forgotten' }],
    ]);
    const relaunch = new Map<string, NotionStanding>([
      ['a', { kind: 'placed', chapterRef: 'c1' }],
      ['b', { kind: 'placed', chapterRef: 'c1' }],
      ['c', { kind: 'forgotten' }],
    ]);
    const merged = mergeRelaunch(first, relaunch);
    expect(merged.get('a')).toEqual({ kind: 'placed', chapterRef: 'c1' });
    expect(merged.get('b')).toEqual({ kind: 'out' });
    expect(merged.get('c')).toEqual({ kind: 'forgotten' });
  });
});

describe('recheckList', () => {
  it('reprend tout ce qui n’est pas rangé, avec son étiquette', () => {
    const r = classifyNotions(
      [
        { id: 'a', chapterId: 'c1' },
        { id: 'b', chapterId: 'c1' },
        { id: 'c', chapterId: 'c1' },
        { id: 'd', chapterId: 'c1' },
      ],
      [
        { notionId: 'a', verdict: 'chapter', chapterRef: 'c1' },
        { notionId: 'b', verdict: 'out' },
        { notionId: 'c', verdict: 'check' },
      ],
      layout,
    );
    expect(recheckList(r)).toEqual([
      { notionId: 'b', label: 'out' },
      { notionId: 'c', label: 'check' },
      { notionId: 'd', label: 'forgotten' },
    ]);
  });

  it('toutes les notions d’un chapitre écarté en entier y sont', () => {
    const notions = [
      { id: 'x', chapterId: 'old' },
      { id: 'y', chapterId: 'old' },
      { id: 'z', chapterId: 'old' },
    ];
    const r = classifyNotions(notions, [{ notionId: 'x', verdict: 'check' }], layout);
    expect(recheckList(r).map((n) => n.notionId).sort()).toEqual(['x', 'y', 'z']);
  });
});
