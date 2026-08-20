import { describe, expect, it } from 'vitest';

import { parsePlan, planSchema } from '@/lib/ingest/planSchema';

// Le contrat d'entrée de l'ingestion. Deux propriétés à tenir, et elles tirent
// en sens opposé :
//   • ne jamais laisser passer ce qui produirait une question fausse ;
//   • ne jamais perdre 160 questions parce qu'une seule est mauvaise.
// Les tests couvrent les deux, plus la frontière entre « réparer » et
// « rejeter » — c'est elle qui est facile à déplacer par inadvertance.

const question = (over: Record<string, unknown> = {}) => ({
  content: 'Quelle est la capitale de la France ?',
  responseType: 'qcm',
  choices: ['Paris', 'Lyon'],
  correctChoices: [0],
  bloomLevel: 1,
  ...over,
});

const group = (over: Record<string, unknown> = {}) => ({
  ref: 'g1',
  context: 'parcours',
  questions: [question()],
  ...over,
});

describe('planSchema — sortie contrainte du modèle', () => {
  it('accepte un plan minimal et remplit les défauts', () => {
    const parsed = planSchema.parse({ groups: [group()] });
    expect(parsed.chapters).toEqual([]);
    expect(parsed.notions).toEqual([]);
    expect(parsed.groups[0].questions[0].answer).toBe('');
    expect(parsed.groups[0].questions[0].notionRefs).toEqual([]);
    expect(parsed.groups[0].questions[0].textLines).toBe(4);
  });

  it('refuse un contexte inventé', () => {
    expect(planSchema.safeParse({ groups: [group({ context: 'devoir' })] }).success).toBe(false);
  });
});

describe('parsePlan — réparer', () => {
  it('ramène un ancien nom de type sur son remplaçant', () => {
    const plan = parsePlan({ groups: [group({ questions: [question({ responseType: 'sondage' })] })] });
    expect(plan.groups[0].questions[0].responseType).toBe('qcm');
    expect(plan.discarded).toEqual([]);
  });

  it('ramène les niveaux de Bloom 5 et 6 sur 4', () => {
    // L'échelle est passée de 6 à 4 niveaux : « créer » reste le plus exigeant,
    // on ne le rétrograde pas au niveau 1.
    const plan = parsePlan({ groups: [group({ questions: [question({ bloomLevel: 6 })] })] });
    expect(plan.groups[0].questions[0].bloomLevel).toBe(4);
  });

  it('accepte un entier écrit en texte', () => {
    const plan = parsePlan({ groups: [group({ questions: [question({ bloomLevel: '3' })] })] });
    expect(plan.groups[0].questions[0].bloomLevel).toBe(3);
  });
});

describe('parsePlan — rejeter', () => {
  it('écarte une question au type de réponse inventé, et le dit', () => {
    const plan = parsePlan({ groups: [group({ questions: [question({ responseType: 'vrai_faux' })] })] });
    expect(plan.groups).toEqual([]);
    expect(plan.discarded).toHaveLength(1);
    expect(plan.discarded[0].kind).toBe('question');
    expect(plan.discarded[0].reason).toContain('vrai_faux');
  });

  it('écarte une question sans énoncé', () => {
    const plan = parsePlan({ groups: [group({ questions: [question({ content: '   ' })] })] });
    expect(plan.groups).toEqual([]);
    expect(plan.discarded[0].reason).toContain('énoncé vide');
  });

  it('écarte un niveau de Bloom sans mapping fondé', () => {
    // 0 et 7 ne veulent rien dire ; « difficile » non plus. Contrairement à la
    // lecture (`toBloomLevel`), on ne les replie pas sur 1.
    for (const bloomLevel of [0, 7, 'difficile', null]) {
      const plan = parsePlan({ groups: [group({ questions: [question({ bloomLevel })] })] });
      expect(plan.groups, `bloomLevel=${JSON.stringify(bloomLevel)}`).toEqual([]);
    }
  });

  it('écarte un groupe sans question', () => {
    const plan = parsePlan({ groups: [group({ questions: [] })] });
    expect(plan.groups).toEqual([]);
    expect(plan.discarded[0].reason).toContain('groupe sans question');
  });

  it('écarte les références en double plutôt que d’en écraser une', () => {
    const plan = parsePlan({
      chapters: [{ ref: 'ch1', name: 'Un' }, { ref: 'ch1', name: 'Deux' }],
    });
    expect(plan.chapters).toHaveLength(1);
    expect(plan.chapters[0].name).toBe('Un'); // le premier gagne
    expect(plan.discarded[0].reason).toContain('double');
  });

  it('n’écarte QUE l’élément fautif — le reste du lot survit', () => {
    // La propriété qui compte : un plan de 160 questions ne se perd pas pour une.
    const plan = parsePlan({
      groups: [
        group({ ref: 'g1' }),
        group({ ref: 'g2', questions: [question({ responseType: 'vrai_faux' })] }),
        group({ ref: 'g3' }),
      ],
    });
    expect(plan.groups.map((g) => g.ref)).toEqual(['g1', 'g3']);
    expect(plan.discarded).toHaveLength(1);
    expect(plan.discarded[0].ref).toBe('g2');
  });
});

describe('parsePlan — références pendantes', () => {
  it('range la notion « sans chapitre » quand le chapitre est inconnu, et le signale', () => {
    const plan = parsePlan({
      chapters: [{ ref: 'ch1', name: 'Les fleuves' }],
      notions: [{ ref: 'n1', title: 'La Loire', chapterRef: 'ch-inexistant' }],
    });
    // La notion survit : « sans chapitre » est un état légal, et perdre du
    // contenu pédagogique pour une clé mal recopiée serait pire.
    expect(plan.notions).toHaveLength(1);
    expect(plan.notions[0].chapterRef).toBeUndefined();
    expect(plan.discarded).toEqual([]);
    expect(plan.adjusted[0].reason).toContain('sans chapitre');
  });

  it('retire d’une question la notion inconnue, sans toucher aux autres', () => {
    const plan = parsePlan({
      notions: [{ ref: 'n1', title: 'La Loire' }],
      groups: [group({ questions: [question({ notionRefs: ['n1', 'n-inexistante'] })] })],
    });
    expect(plan.groups[0].questions[0].notionRefs).toEqual(['n1']);
    expect(plan.adjusted[0].reason).toContain('n-inexistante');
  });

  it('conserve une question dont TOUTES les notions étaient inconnues', () => {
    // Elle ne sera tirée par aucun exercice tant qu'on ne lui en relie pas une —
    // état permis (§11 du plan), et signalé.
    const plan = parsePlan({ groups: [group({ questions: [question({ notionRefs: ['x'] })] })] });
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].questions[0].notionRefs).toEqual([]);
    expect(plan.adjusted).toHaveLength(1);
  });
});

describe('parsePlan — compléter l’existant', () => {
  const existing = {
    chapterIds: ['ch-existant-en-base'],
    notionIds: ['n-existante-en-base'],
  };

  it('accepte une question rattachée à une notion DÉJÀ en base', () => {
    // Sans ça, le modèle ne pourrait qu'ajouter des îlots : il ne pourrait
    // jamais accrocher une nouvelle question à une notion existante.
    const plan = parsePlan(
      { groups: [group({ questions: [question({ notionRefs: ['n-existante-en-base'] })] })] },
      existing,
    );
    expect(plan.groups[0].questions[0].notionRefs).toEqual(['n-existante-en-base']);
    expect(plan.adjusted).toEqual([]);
  });

  it('accepte une nouvelle notion rangée dans un chapitre DÉJÀ en base', () => {
    const plan = parsePlan(
      { notions: [{ ref: 'n1', title: 'La Loire', chapterRef: 'ch-existant-en-base' }] },
      existing,
    );
    expect(plan.notions[0].chapterRef).toBe('ch-existant-en-base');
    expect(plan.adjusted).toEqual([]);
  });

  it('écarte une notion qui tenterait de recréer une notion existante', () => {
    // Le modèle doit référencer l'existant, pas le dupliquer.
    const plan = parsePlan(
      { notions: [{ ref: 'n-existante-en-base', title: 'Doublon' }] },
      existing,
    );
    expect(plan.notions).toEqual([]);
    expect(plan.discarded[0].reason).toContain('double');
  });
});

describe('parsePlan — entrée franchement hostile', () => {
  it('ne lève jamais, quoi qu’on lui donne', () => {
    for (const raw of [null, undefined, 42, 'un plan', [], { groups: 'oui' }, { chapters: [null, 3] }]) {
      expect(() => parsePlan(raw)).not.toThrow();
    }
  });

  it('rend un plan vide plutôt qu’un plan douteux', () => {
    const plan = parsePlan(null);
    expect(plan.chapters).toEqual([]);
    expect(plan.notions).toEqual([]);
    expect(plan.groups).toEqual([]);
  });

  it('ignore les champs qu’il ne connaît pas au lieu de les recopier', () => {
    // Une source ne doit pas pouvoir glisser un `id` ou un `import_id`.
    const plan = parsePlan({ chapters: [{ ref: 'ch1', name: 'Un', id: 'ligne-existante' }] });
    expect(plan.chapters[0]).not.toHaveProperty('id');
  });
});
