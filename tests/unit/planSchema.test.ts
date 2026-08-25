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

// ─── Les affectations : ranger, sans rien créer ni détruire ──────────────────
//
// C'est le geste par lequel un import réorganise un atelier existant (feuille de
// route docs/chantiers/2026-08-23-notions-dabord.md, §2). Il ne peut RIEN faire
// d'autre que déplacer une notion d'une boîte à une autre — et c'est ce que ces
// tests figent.

describe('affectations — le seul geste qui touche à l’existant', () => {
  const existing = { chapterIds: ['ch-existant'], notionIds: ['n-existante'] };

  it('range une notion existante dans un chapitre que le plan vient de créer', () => {
    const plan = parsePlan(
      {
        chapters: [{ ref: 'ch1', name: 'Athlétisme 1940-1990' }],
        assignments: [{ notionRef: 'n-existante', chapterRef: 'ch1' }],
      },
      existing,
    );
    expect(plan.assignments).toEqual([{ notionRef: 'n-existante', chapterRef: 'ch1' }]);
    expect(plan.discarded).toEqual([]);
  });

  it('un chapitre vide sort la notion du programme — un état légal, pas une erreur', () => {
    const plan = parsePlan({ assignments: [{ notionRef: 'n-existante', chapterRef: '' }] }, existing);
    expect(plan.assignments).toEqual([{ notionRef: 'n-existante', chapterRef: undefined }]);
    expect(plan.discarded).toEqual([]);
  });

  it('ÉCARTE une affectation qui vise une notion inconnue — elle ne peut rien créer', () => {
    // Sans ça, la passe chapitres pourrait faire apparaître du contenu qu'aucun
    // document n'a produit.
    const plan = parsePlan(
      { chapters: [{ ref: 'ch1', name: 'Un' }], assignments: [{ notionRef: 'inventée', chapterRef: 'ch1' }] },
      existing,
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.discarded[0]).toMatchObject({ kind: 'assignment', ref: 'inventée' });
  });

  it('un chapitre inconnu laisse la notion OÙ ELLE EST, il ne la sort pas du programme', () => {
    // Le repli « sans chapitre » serait une perte silencieuse sur une faute de
    // frappe. Ne rien faire est le seul comportement sûr.
    const plan = parsePlan({ assignments: [{ notionRef: 'n-existante', chapterRef: 'ch-jamais-vu' }] }, existing);
    expect(plan.assignments).toEqual([]);
    expect(plan.discarded[0].reason).toMatch(/laissée où elle est/);
  });

  it('deux affectations pour la même notion : la première fait foi', () => {
    // Appliquer la seconde ferait dépendre le résultat de l'ordre d'un tableau.
    const plan = parsePlan(
      {
        chapters: [{ ref: 'ch1', name: 'Un' }, { ref: 'ch2', name: 'Deux' }],
        assignments: [
          { notionRef: 'n-existante', chapterRef: 'ch1' },
          { notionRef: 'n-existante', chapterRef: 'ch2' },
        ],
      },
      existing,
    );
    expect(plan.assignments).toEqual([{ notionRef: 'n-existante', chapterRef: 'ch1' }]);
    expect(plan.discarded).toHaveLength(1);
  });

  it('range aussi une notion que CE plan vient de créer', () => {
    // Le cas de l'import complet : les notions naissent à la passe précédente,
    // mais un plan qui porterait les deux doit rester cohérent.
    const plan = parsePlan({
      chapters: [{ ref: 'ch1', name: 'Un' }],
      notions: [{ ref: 'n1', title: 'La Loire est le plus long fleuve de France' }],
      assignments: [{ notionRef: 'n1', chapterRef: 'ch1' }],
    });
    expect(plan.assignments).toEqual([{ notionRef: 'n1', chapterRef: 'ch1' }]);
  });

  it('une affectation malformée est écartée seule, le reste du plan survit', () => {
    const plan = parsePlan(
      {
        chapters: [{ ref: 'ch1', name: 'Un' }],
        assignments: [{ chapterRef: 'ch1' }, { notionRef: 'n-existante', chapterRef: 'ch1' }],
      },
      existing,
    );
    expect(plan.assignments).toHaveLength(1);
    expect(plan.chapters).toHaveLength(1);
    expect(plan.discarded).toHaveLength(1);
  });

  it('un plan sans affectations n’en invente pas', () => {
    expect(parsePlan({}).assignments).toEqual([]);
    expect(planSchema.parse({}).assignments).toEqual([]);
  });
});

// ─── L'architecture : la seule décision du plan qui RETIRE du programme ──────
//
// Testé parce que c'est le contrat d'une entrée non fiable et que la faute
// possible est la plus chère du lot : retirer du programme une partie que
// personne n'a demandé à retirer. Trois invariants tiennent tout — une
// référence inconnue ne fait rien, une référence de la réponse elle-même ne
// peut pas être écartée, et ne rien dire d'un chapitre le laisse en place.
describe('parsePlan — architecture du programme', () => {
  it('retient le rang d’un chapitre qui existe en base', () => {
    const plan = parsePlan(
      { chapterOrder: [{ ref: 'c1', rank: 2 }] },
      { chapterIds: ['c1'] },
    );
    expect(plan.chapterOrder).toEqual([{ ref: 'c1', rank: 2, reason: '' }]);
  });

  it('retient un rang 0 avec sa raison', () => {
    const plan = parsePlan(
      { chapterOrder: [{ ref: 'c1', rank: 0, reason: 'plus traité' }] },
      { chapterIds: ['c1'] },
    );
    expect(plan.chapterOrder).toEqual([{ ref: 'c1', rank: 0, reason: 'plus traité' }]);
  });

  it('ignore une référence inconnue, et le dit', () => {
    const plan = parsePlan({ chapterOrder: [{ ref: 'inventé', rank: 0 }] }, { chapterIds: ['c1'] });
    expect(plan.chapterOrder).toEqual([]);
    expect(plan.discarded.some((d) => d.ref === 'inventé')).toBe(true);
  });

  it('refuse d’écarter un chapitre créé dans la même réponse', () => {
    // Sans quoi une référence neuve — que rien ne situe en base — pourrait
    // retirer du programme.
    const plan = parsePlan(
      { chapters: [{ ref: 'ch1', name: 'Nouveau' }], chapterOrder: [{ ref: 'ch1', rank: 0 }] },
      { chapterIds: ['c1'] },
    );
    expect(plan.chapterOrder).toEqual([]);
  });

  it('accepte de RANGER un chapitre créé dans la même réponse', () => {
    const plan = parsePlan(
      { chapters: [{ ref: 'ch1', name: 'Nouveau' }], chapterOrder: [{ ref: 'ch1', rank: 1 }] },
      { chapterIds: ['c1'] },
    );
    expect(plan.chapterOrder).toEqual([{ ref: 'ch1', rank: 1, reason: '' }]);
  });

  it('ne fait rien quand le modèle ne dit rien', () => {
    // L'invariant qui rend l'omission inoffensive : ne rien dire ne retire rien
    // et ne déplace rien.
    expect(parsePlan({ chapters: [] }, { chapterIds: ['c1', 'c2'] }).chapterOrder).toEqual([]);
  });

  it('ne compte qu’une fois une référence répétée', () => {
    const plan = parsePlan(
      { chapterOrder: [{ ref: 'c1', rank: 1 }, { ref: 'c1', rank: 0 }] },
      { chapterIds: ['c1'] },
    );
    expect(plan.chapterOrder).toEqual([{ ref: 'c1', rank: 1, reason: '' }]);
  });
});

// ─── Les types à réglages, ouverts au modèle le 25/08/2026 ───────────────────
//
// Avant cette date, l'ingestion ne savait produire que les trois types qui ne
// demandent aucun réglage : `type_options` partait vide en base, si bien qu'un
// tableau généré serait arrivé en grille blanche. Ces tests tiennent les deux
// bouts du contrat : une grille impossible tombe SEULE (sans emporter son
// groupe), et une grille valable arrive sur la forme réellement stockée.

describe('types à réglages — la question tombe, jamais le lot', () => {
  const grid = (typeOptions: Record<string, unknown>) =>
    question({ responseType: 'tableau', choices: [], correctChoices: [], typeOptions });

  it('reconstruit la grille et les cases justes à partir des index de colonnes', () => {
    const plan = parsePlan({
      groups: [group({ questions: [grid({ tableRows: ['Chat', 'Truite'], tableCols: ['Mammifère', 'Poisson'], tableCorrect: [[0], [1]] })] })],
    });
    expect(plan.groups[0].questions[0].typeOptions).toEqual({
      tableRows: ['Chat', 'Truite'],
      tableCols: ['Mammifère', 'Poisson'],
      tableChecked: ['0-0', '1-1'],
    });
  });

  it('écarte une grille sans lignes ni colonnes, et son groupe avec elle', () => {
    // Une grille vide n'est pas « incomplète » : c'est un espace blanc que
    // personne ne peut afficher ni corriger.
    const plan = parsePlan({ groups: [group({ questions: [grid({})] })] });
    expect(plan.groups).toEqual([]);
    expect(plan.discarded[0].reason).toContain('tableau sans lignes');
  });

  it('n’écarte QUE la question fautive quand le groupe en porte d’autres', () => {
    const plan = parsePlan({ groups: [group({ questions: [question(), grid({})] })] });
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].questions).toHaveLength(1);
    expect(plan.discarded).toHaveLength(1);
  });

  it('retire une case juste hors de la grille, sans perdre la question', () => {
    const plan = parsePlan({
      groups: [group({ questions: [grid({ tableRows: ['A'], tableCols: ['X'], tableCorrect: [[0, 4]] })] })],
    });
    expect(plan.groups[0].questions[0].typeOptions.tableChecked).toEqual(['0-0']);
    expect(plan.adjusted[0].reason).toContain('hors de la grille');
  });

  it('« une seule case par ligne » ne garde que la première de chaque ligne', () => {
    const plan = parsePlan({
      groups: [group({ questions: [grid({ tableRows: ['A'], tableCols: ['X', 'Y'], tableCorrect: [[0, 1]], tableUnique: true })] })],
    });
    expect(plan.groups[0].questions[0].typeOptions.tableChecked).toEqual(['0-0']);
  });

  it('encode les paires sur la forme stockée « gauche :: droite »', () => {
    const plan = parsePlan({
      groups: [group({ questions: [question({
        responseType: 'matching', choices: [], correctChoices: [],
        pairs: [{ left: 'Paris', right: 'France' }, { left: 'Rome', right: 'Italie' }],
      })] })],
    });
    expect(plan.groups[0].questions[0].choices).toEqual(['Paris :: France', 'Rome :: Italie']);
  });

  it('écarte une mise en paires qui n’en compte qu’une', () => {
    // Une seule paire ne se choisit pas : l'affichage donne la réponse.
    const plan = parsePlan({
      groups: [group({ questions: [question({
        responseType: 'matching', choices: [], correctChoices: [], pairs: [{ left: 'Paris', right: 'France' }],
      })] })],
    });
    expect(plan.groups).toEqual([]);
    expect(plan.discarded[0].reason).toContain('moins de deux paires');
  });

  it('la liste garde ses réponses attendues et compte ce qu’elle attend', () => {
    const plan = parsePlan({
      groups: [group({ questions: [question({ responseType: 'liste', choices: ['Foie', '  ', 'Reins'], correctChoices: [] })] })],
    });
    const q = plan.groups[0].questions[0];
    expect(q.choices).toEqual(['Foie', 'Reins']);
    expect(q.typeOptions.listExpected).toBe(2);
  });

  it('le dépôt de fichier accepte tous les formats quand rien n’est demandé', () => {
    const plan = parsePlan({
      groups: [group({ questions: [question({ responseType: 'fichier', choices: [], correctChoices: [], typeOptions: { fileTypes: ['pdf', 'parchemin'] } })] })],
    });
    expect(plan.groups[0].questions[0].typeOptions.fileTypes).toEqual(['pdf']);
    expect(plan.adjusted[0].reason).toContain('format de fichier inconnu');
  });

  it('un QCM sans bonne réponse, ou à une seule proposition, est écarté', () => {
    // Personne ne peut vouloir ça : c'est une question qu'on ne peut pas
    // répondre, pas un choix pédagogique discutable.
    expect(parsePlan({ groups: [group({ questions: [question({ correctChoices: [] })] })] }).groups).toEqual([]);
    expect(parsePlan({ groups: [group({ questions: [question({ choices: ['Paris'] })] })] }).groups).toEqual([]);
  });

  it('une bonne réponse qui pointe hors de la liste est retirée, pas la question', () => {
    const plan = parsePlan({ groups: [group({ questions: [question({ correctChoices: [0, 9] })] })] });
    expect(plan.groups[0].questions[0].correctChoices).toEqual([0]);
    expect(plan.adjusted[0].reason).toContain('hors de la liste');
  });

  it('« réponse unique » ne retient qu’une bonne réponse', () => {
    const plan = parsePlan({ groups: [group({ questions: [question({ responseType: 'qcs', correctChoices: [1, 0] })] })] });
    expect(plan.groups[0].questions[0].correctChoices).toEqual([0]);
  });
});
