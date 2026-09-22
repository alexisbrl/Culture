import { describe, expect, it } from 'vitest';

import {
  CANCEL_THRESHOLD,
  RELAUNCH_THRESHOLD,
  classifyNotions,
  finalFates,
  guardDrops,
  mergeRelaunch,
  recheckList,
  revalidateClaims,
  strandedNotions,
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

describe('guardDrops — jamais tous', () => {
  it('écarter tous les chapitres visibles : rien n’est appliqué', () => {
    expect(guardDrops(['a', 'b'], ['a', 'b'])).toEqual({ dropped: [], blocked: true });
    expect(guardDrops(['a', 'b'], ['b', 'a', 'a'])).toEqual({ dropped: [], blocked: true });
  });

  it('en écarter une partie : appliqué', () => {
    expect(guardDrops(['a', 'b', 'c'], ['a', 'c'])).toEqual({ dropped: ['a', 'c'], blocked: false });
  });

  it('une référence inconnue ne compte pas', () => {
    expect(guardDrops(['a', 'b'], ['a', 'zzz'])).toEqual({ dropped: ['a'], blocked: false });
  });

  it('atelier sans chapitre : rien à garder', () => {
    expect(guardDrops([], [])).toEqual({ dropped: [], blocked: false });
  });
});

describe('finalFates', () => {
  const fateLayout: ChapterLayout = { visible: new Set(['c1', 'c2', 'c3']), dropped: new Set(['old']) };
  const programOrder = ['c1', 'c2', 'c3'];

  function run(
    notions: ExistingNotion[],
    standingsList: [string, NotionStanding][],
    claims: [string, string[]][] = [],
  ) {
    return finalFates({
      notions,
      standings: new Map(standingsList),
      layout: fateLayout,
      programOrder,
      claims: new Map(claims),
    });
  }

  it('rangée à l’étape chapitres : dans son chapitre', () => {
    const { fates } = run([{ id: 'a', chapterId: 'c1' }], [['a', { kind: 'placed', chapterRef: 'c2' }]]);
    expect(fates).toEqual([{ notionId: 'a', chapterId: 'c2', moved: true, reason: 'placed' }]);
  });

  it('réclamée par un seul chapitre : elle y va', () => {
    const { fates, arbitrations } = run(
      [{ id: 'a', chapterId: 'old' }],
      [['a', { kind: 'out' }]],
      [['a', ['c3']]],
    );
    expect(fates[0]).toMatchObject({ chapterId: 'c3', moved: true, reason: 'claimed' });
    expect(arbitrations).toEqual([]);
  });

  it('départage : son chapitre actuel s’il est parmi les demandeurs', () => {
    const { fates, arbitrations } = run(
      [{ id: 'a', chapterId: 'c3' }],
      [['a', { kind: 'forgotten' }]],
      [['a', ['c1', 'c3']]],
    );
    expect(fates[0]).toMatchObject({ chapterId: 'c3', moved: false, reason: 'arbitrated' });
    expect(arbitrations).toEqual([{ notionId: 'a', claimants: ['c1', 'c3'], chosen: 'c3', rule: 'current' }]);
  });

  it('départage : sinon le premier dans l’ordre du programme, quel que soit l’ordre d’arrivée', () => {
    const a = run([{ id: 'a', chapterId: 'old' }], [['a', { kind: 'check' }]], [['a', ['c3', 'c2']]]);
    const b = run([{ id: 'a', chapterId: 'old' }], [['a', { kind: 'check' }]], [['a', ['c2', 'c3']]]);
    expect(a.fates[0].chapterId).toBe('c2');
    expect(b).toEqual(a);
    expect(a.arbitrations[0].rule).toBe('firstInProgram');
  });

  it('réclamée seulement par des chapitres irrecevables : ne bouge pas, et c’est dit', () => {
    const { fates, arbitrations } = run(
      [{ id: 'a', chapterId: 'c1' }],
      [['a', { kind: 'check' }]],
      [['a', ['old', 'zzz']]],
    );
    expect(fates[0]).toMatchObject({ chapterId: 'c1', moved: false, reason: 'stays' });
    expect(arbitrations[0]).toMatchObject({ chosen: null, rule: 'none' });
  });

  it('non réclamée, oubliée ou à vérifier : ne bouge pas', () => {
    const { fates } = run(
      [{ id: 'a', chapterId: 'c1' }, { id: 'b', chapterId: 'old' }],
      [['a', { kind: 'forgotten' }], ['b', { kind: 'check' }]],
    );
    expect(fates.map((f) => [f.chapterId, f.moved])).toEqual([['c1', false], ['old', false]]);
  });

  it('non réclamée, hors programme : reste dans un chapitre écarté, sans chapitre sinon', () => {
    const { fates } = run(
      [{ id: 'a', chapterId: 'old' }, { id: 'b', chapterId: 'c1' }, { id: 'c', chapterId: null }],
      [['a', { kind: 'out' }], ['b', { kind: 'out' }], ['c', { kind: 'out' }]],
    );
    expect(fates[0]).toMatchObject({ chapterId: 'old', moved: false });
    expect(fates[1]).toMatchObject({ chapterId: null, moved: true, reason: 'unplaced' });
    expect(fates[2]).toMatchObject({ chapterId: null, moved: false });
  });

  it('aucun chemin n’efface une notion existante', () => {
    // Toutes les combinaisons de cas, de chapitre actuel et de réclamations :
    // chaque notion en entrée ressort une fois, avec un chapitre ou sans, jamais
    // autre chose.
    const kinds: NotionStanding[] = [
      { kind: 'placed', chapterRef: 'c2' },
      { kind: 'out' },
      { kind: 'check' },
      { kind: 'forgotten' },
    ];
    const currents = ['c1', 'old', null, 'zzz'];
    const claimSets = [[], ['c1'], ['c2', 'c3'], ['old'], ['zzz', 'c3']];
    const notions: ExistingNotion[] = [];
    const standingsList: [string, NotionStanding][] = [];
    const claims: [string, string[]][] = [];
    let i = 0;
    for (const kind of kinds) for (const current of currents) for (const set of claimSets) {
      const id = `n${i++}`;
      notions.push({ id, chapterId: current });
      standingsList.push([id, kind]);
      claims.push([id, set]);
    }
    const { fates } = run(notions, standingsList, claims);
    expect(fates.map((f) => f.notionId)).toEqual(notions.map((n) => n.id));
    for (const f of fates) {
      expect(Object.keys(f).sort()).toEqual(['chapterId', 'moved', 'notionId', 'reason']);
      expect(f.chapterId === null || typeof f.chapterId === 'string').toBe(true);
    }
  });
});

describe('revalidateClaims — ce qui revient de l’écran n’est pas fiable', () => {
  const allowed = { chapters: new Set(['c1', 'c2']), notions: new Set(['n1', 'n2']) };

  it('garde les réclamations recevables, fusionnées par notion', () => {
    const r = revalidateClaims(
      [
        { chapterId: 'c1', notionIds: ['n1', 'n2'] },
        { chapterId: 'c2', notionIds: ['n1', 'n1'] },
      ],
      allowed,
    );
    expect(r.claims).toEqual(new Map([['n1', ['c1', 'c2']], ['n2', ['c1']]]));
    expect(r.ignored).toBe(0);
  });

  it('une notion d’un autre atelier, ou hors seconde vérification, est ignorée et comptée', () => {
    const r = revalidateClaims([{ chapterId: 'c1', notionIds: ['autre-atelier', 'n1'] }], allowed);
    expect(r.claims).toEqual(new Map([['n1', ['c1']]]));
    expect(r.ignored).toBe(1);
  });

  it('un chapitre caché ou hors de ce lot est ignoré et compté', () => {
    const r = revalidateClaims(
      [
        { chapterId: 'cache', notionIds: ['n1'] },
        { chapterId: 'autre-lot', notionIds: ['n2'] },
      ],
      allowed,
    );
    expect(r.claims.size).toBe(0);
    expect(r.ignored).toBe(2);
  });

  it('une entrée mal formée ne fait rien tomber', () => {
    const r = revalidateClaims(
      [{ chapterId: 'c1', notionIds: [42 as unknown as string, 'n2'] }],
      allowed,
    );
    expect(r.claims).toEqual(new Map([['n2', ['c1']]]));
    expect(r.ignored).toBe(1);
  });
});

describe('strandedNotions', () => {
  it('ne retient que les notions restées faute de mieux dans un chapitre', () => {
    expect(
      strandedNotions([
        { notionId: 'a', chapterId: 'c1', moved: false, reason: 'stays' },
        { notionId: 'b', chapterId: null, moved: false, reason: 'stays' },
        { notionId: 'c', chapterId: 'c2', moved: true, reason: 'claimed' },
        { notionId: 'd', chapterId: null, moved: true, reason: 'unplaced' },
      ]),
    ).toEqual(['a']);
  });
});
