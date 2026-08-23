import { describe, expect, it } from 'vitest';

import {
  assignInstruction,
  bloomInstruction,
  chaptersInstruction,
  DEFAULT_BLOOM_DISTRIBUTION,
  existingContentBlock,
  MAX_QUESTIONS_PER_IMPORT,
  notionsInstruction,
  PLAUSIBLE_CHAPTERS,
  questionsInstruction,
  questionsPerNotion,
  systemPrompt,
  type BloomDistribution,
  type ExistingContent,
} from '@/lib/ingest/prompt';
import { GENERATED_RESPONSE_TYPES, wireGroupsOutput, wireNotionsOutput } from '@/lib/ingest/wireSchema';

const empty: ExistingContent = { chapters: [], notions: [], questions: [] };

describe('systemPrompt — stabilité (condition du cache)', () => {
  it('est strictement identique d’un appel à l’autre', () => {
    // Le cache de prompt est un préfixe : une date, un identifiant ou un
    // compteur glissé ici le ferait manquer à chaque appel, et on paierait le
    // document en entier une fois par chapitre.
    expect(systemPrompt()).toBe(systemPrompt());
  });

  it('ne contient ni date ni identifiant', () => {
    const s = systemPrompt();
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(s).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe('existingContentBlock — compléter, pas dupliquer', () => {
  it('le dit clairement quand l’atelier est vide', () => {
    expect(existingContentBlock(empty, { pass: 'chapters' })).toContain('vide');
    expect(existingContentBlock(empty, { pass: 'notions' })).toContain('aucune notion');
    expect(existingContentBlock(empty, { pass: 'questions', notionIds: ['n1'] })).toContain('vide');
  });

  it('transmet les identifiants réels, qui servent de références', () => {
    // C'est ce qui permet à une question de se rattacher à une notion DÉJÀ en
    // base plutôt que d'en créer un doublon.
    const block = existingContentBlock(
      {
        chapters: [{ id: 'ch-uuid', name: 'Les fleuves' }],
        notions: [{ id: 'n-uuid', title: 'La Loire est le plus long fleuve de France', chapterId: 'ch-uuid' }],
        questions: [{ content: 'Quel est le plus long fleuve de France ?', notionIds: ['n-uuid'] }],
      },
      { pass: 'questions', notionIds: ['n-uuid'] },
    );
    expect(block).toContain('Quel est le plus long fleuve de France ?');
    expect(block).toMatch(/complètes|recrées/);
  });
});

describe('existingContentBlock — la portée, poste de coût numéro un (§16.3)', () => {
  const atelier: ExistingContent = {
    chapters: [
      { id: 'ch1', name: 'Les fleuves' },
      { id: 'ch2', name: 'Les montagnes' },
    ],
    notions: [
      { id: 'n1', title: 'La Loire est le plus long fleuve de France', chapterId: 'ch1' },
      { id: 'n2', title: 'La Seine traverse Paris', chapterId: 'ch1' },
      { id: 'n3', title: 'Le mont Blanc culmine à 4 806 m', chapterId: 'ch2' },
      { id: 'n4', title: 'Notion orpheline', chapterId: null },
    ],
    questions: [
      { content: 'Énoncé sur la Loire', notionIds: ['n1'] },
      { content: 'Énoncé sur la Seine', notionIds: ['n2'] },
      { content: 'Énoncé sur le mont Blanc', notionIds: ['n3'] },
      { content: 'Énoncé sans notion', notionIds: [] },
    ],
  };

  it('passe chapitres : les chapitres ET les notions — mais jamais les énoncés', () => {
    // Depuis l'inversion, cette passe ne nomme plus seulement des boîtes : elle
    // RÉPARTIT. La liste des notions est son entrée principale.
    const block = existingContentBlock(atelier, { pass: 'chapters' });
    expect(block).toContain('Les fleuves');
    expect(block).toContain('Les montagnes');
    expect(block).toContain('La Loire');
    // Les énoncés restent dehors : ils pèsent ~75 000 tokens et n'aident en
    // rien à ranger une notion (§16.3).
    expect(block).not.toContain('Énoncé');
  });

  it('passe notions : TOUTES les notions de l’atelier, chapitre ou pas', () => {
    // Depuis l'inversion du 23/08/2026, la passe travaille document par document
    // et n'a aucun chapitre de référence : le filtre par chapitre n'aurait plus
    // de sens, et surtout il laisserait recréer ailleurs ce qui existe ici.
    const block = existingContentBlock(atelier, { pass: 'notions' });
    expect(block).toContain('La Loire');
    expect(block).toContain('La Seine');
    expect(block).toContain('mont Blanc');
    expect(block).toContain('orpheline');
    // Les énoncés, eux, restent hors de portée : c'est le poste de coût nº 1.
    expect(block).not.toContain('Énoncé');
  });

  it('passe questions : les énoncés des notions données, aucun autre', () => {
    // Le critère de T1 : ce qui coûtait ~75 000 tokens par appel à 2 160
    // énoncés n'en pèse plus que quelques milliers.
    const block = existingContentBlock(atelier, { pass: 'questions', notionIds: ['n1'] });
    expect(block).toContain('Énoncé sur la Loire');
    expect(block).not.toContain('Énoncé sur la Seine');
    expect(block).not.toContain('Énoncé sur le mont Blanc');
    // Ni les notions ni les chapitres : la consigne les porte déjà.
    expect(block).not.toContain('ch1');
  });

  it('passe questions : une question sans notion n’est jamais transmise', () => {
    // Conséquence assumée de §16.3 — elle n'est protégée du doublon par rien,
    // et n'est de toute façon tirée par aucun exercice (§11).
    const block = existingContentBlock(atelier, { pass: 'questions', notionIds: ['n1', 'n2', 'n3'] });
    expect(block).not.toContain('Énoncé sans notion');
  });
});

describe('instructions de passe', () => {
  it('la passe notions cible UN document et ne range dans aucun chapitre', () => {
    const instruction = notionsInstruction({ fileName: 'Chapitre 3.pdf' });
    expect(instruction).toContain('Chapitre 3.pdf');
    expect(instruction).toContain('280');
    // Le rangement est le travail de la passe suivante, et la consigne le dit.
    expect(instruction).toMatch(/Ne range rien/);
  });

  it('la passe notions donne le critère OBJECTIF de réutilisation', () => {
    // « Est-ce mieux formulé ? » ferait doubler l'atelier à chaque import : le
    // modèle répond oui presque à chaque fois. « Apporte-t-elle un fait
    // vérifiable de plus ? » se tranche.
    const instruction = notionsInstruction({ fileName: 'cours.pdf' });
    expect(instruction).toMatch(/FAIT VÉRIFIABLE DE PLUS/);
    expect(instruction).toMatch(/RÉUTILISE/);
    expect(instruction).not.toMatch(/mieux formulé/);
  });

  it('la passe questions liste les notions à couvrir et rappelle le budget', () => {
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire…' }, { id: 'n2', title: 'La Seine…' }],
      budget: 12,
    });
    expect(instruction).toContain('n1');
    expect(instruction).toContain('n2');
    expect(instruction).toContain('12');
  });

  it('la passe questions donne les notions voisines en contexte, sans les interroger', () => {
    // Elle ne reçoit plus les documents (§16.3) : les voisines du chapitre sont
    // ce qui remplace le cours pour les niveaux 3 et 4 de Bloom (§16.21).
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire est le plus long fleuve de France' }],
      neighbours: [{ id: 'n2', title: 'La Seine traverse Paris' }],
      budget: 12,
    });
    expect(instruction).toContain('La Seine traverse Paris');
    expect(instruction).toMatch(/contexte/i);
    // La voisine est un contexte, pas une cible : sa référence n'est pas donnée,
    // le modèle ne peut donc pas y rattacher une question.
    expect(instruction).not.toContain('n2');
  });

  it('sans voisine, la passe questions ne mentionne aucun contexte', () => {
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire…' }],
      budget: 12,
    });
    expect(instruction).not.toMatch(/Autres notions du même chapitre/);
  });

  it('la passe questions dit ce qu’une question sans notion implique', () => {
    // C'est le seul endroit où le modèle peut l'apprendre : rien côté serveur ne
    // l'y oblige (une question sans notion reste permise).
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'X' },
      notions: [{ id: 'n1', title: 'Y' }],
      budget: 4,
    });
    expect(instruction).toMatch(/jamais posée/);
  });

  it('la passe chapitres SITUE les chapitres et ne range rien', () => {
    // Le rangement est une passe à part depuis le 24/08/2026 : ranger 500
    // notions dans une seule réponse dépasserait le plafond de sortie.
    const instruction = chaptersInstruction([], [{ id: 'n1', title: 'La Loire est le plus long fleuve' }]);
    expect(instruction).toMatch(/Situe chaque chapitre/);
    expect(instruction).toMatch(/Tu ne ranges rien ici/);
    // Les notions restent visibles : elles disent ce que le cours contient.
    expect(instruction).toContain('La Loire');
    expect(instruction).not.toMatch(/question/i);
  });
});

describe('chaptersInstruction — N documents, UN SEUL cours (§16.15)', () => {
  const sept = ['Chapitre 1.pdf', 'Chapitre 2.pdf', 'Chapitre 3.pdf', 'Chapitre 4.pdf', 'Chapitre 5.pdf', 'Chapitre 6.pdf', 'Annexes.pdf'];

  it('nomme les documents reçus', () => {
    // Sans eux, le modèle ne sait pas ce qu'il tient : le test réel du
    // 22/08/2026 a rendu 28 chapitres pour 7 fichiers nommés « Chapitre N.pdf ».
    const instruction = chaptersInstruction(sept);
    for (const name of sept) expect(instruction).toContain(name);
  });

  it('dit que l’ensemble forme un seul cours, à découper globalement', () => {
    const instruction = chaptersInstruction(sept);
    expect(instruction).toContain('UN SEUL cours');
    expect(instruction).toContain('7 documents');
    expect(instruction).toMatch(/ENSEMBLE globalement/);
    expect(instruction).toMatch(/document n’est pas un chapitre|document n'est pas un chapitre/);
  });

  it('donne la borne 3 à 8, explicitement souple', () => {
    const instruction = chaptersInstruction(sept);
    expect(instruction).toContain(String(PLAUSIBLE_CHAPTERS.min));
    expect(instruction).toContain(String(PLAUSIBLE_CHAPTERS.max));
    expect(instruction).toMatch(/indication et non une limite/);
  });

  it('un document unique n’est pas annoncé au pluriel', () => {
    const instruction = chaptersInstruction(['Cours SVT.pdf']);
    expect(instruction).toContain('Cours SVT.pdf');
    expect(instruction).toContain('un seul document');
    expect(instruction).not.toContain('1 documents');
  });

  it('la relance REND son découpage au modèle et lui demande de le juger', () => {
    // Elle ne remplace pas la consigne : l'API est sans état, le second appel
    // ne voit pas le premier (§16.8).
    const previous = Array.from({ length: 28 }, (_, i) => `Partie ${i + 1}`);
    const instruction = chaptersInstruction(sept, [], { previous });
    // Les noms, pas seulement le nombre : c'est ce qui rend le jugement possible.
    expect(instruction).toContain('28 parties');
    expect(instruction).toContain('1. Partie 1');
    expect(instruction).toContain('28. Partie 28');
    expect(instruction).toMatch(/SOUS-PARTIES/);
    expect(instruction).toContain('CHAPITRES');
    // Et surtout : reconduire à l'identique doit être annoncé comme valide.
    expect(instruction).toMatch(/Reconduis-le tel quel/);
    expect(instruction).toMatch(/ne le refais pas par principe/);
  });

  it('sans relance, la consigne n’en dit pas un mot', () => {
    expect(chaptersInstruction(sept)).not.toMatch(/SOUS-PARTIES/);
  });

  it('sans nom de fichier, la consigne reste utilisable', () => {
    const instruction = chaptersInstruction();
    expect(instruction).toContain('CHAPITRES');
    expect(instruction).toContain(String(PLAUSIBLE_CHAPTERS.max));
  });
});

describe('wireSchema — ce qu’on autorise le modèle à produire', () => {
  it('n’ouvre que les types de réponse complets sans réglages', () => {
    // `tableau` porte ses lignes, colonnes et cases correctes dans type_options :
    // en générer un sans ces réglages donnerait une grille vide (décision du
    // 20/08/2026).
    expect([...GENERATED_RESPONSE_TYPES]).toEqual(['qcs', 'qcm', 'textuelle', 'liste']);
    expect(GENERATED_RESPONSE_TYPES).not.toContain('tableau');
  });

  it('refuse un type de réponse hors de cette liste', () => {
    const result = wireGroupsOutput.safeParse({
      groups: [{ ref: 'g1', questions: [{ content: 'Q', responseType: 'tableau', choices: [], correctChoices: [], answer: '', expectations: '', bloomLevel: 1, notionRefs: ['n1'] }] }],
    });
    expect(result.success).toBe(false);
  });

  it('refuse un niveau de Bloom hors 1–4 dès la contrainte de sortie', () => {
    const question = { content: 'Q', responseType: 'qcm', choices: [], correctChoices: [], answer: '', expectations: '', notionRefs: ['n1'] };
    expect(wireGroupsOutput.safeParse({ groups: [{ ref: 'g1', questions: [{ ...question, bloomLevel: 6 }] }] }).success).toBe(false);
    expect(wireGroupsOutput.safeParse({ groups: [{ ref: 'g1', questions: [{ ...question, bloomLevel: 3 }] }] }).success).toBe(true);
  });

  it('une notion naît SANS chapitre, et porte sa page', () => {
    // Au moment où les notions sont extraites, aucun chapitre n'existe encore.
    // Le rangement est une passe séparée — et c'est la PAGE qui lui permet de se
    // passer du cours.
    expect(wireNotionsOutput.safeParse({ notions: [{ ref: 'n1', title: 'T' }] }).success).toBe(false);
    expect(wireNotionsOutput.safeParse({ notions: [{ ref: 'n1', title: 'T', page: 12 }] }).success).toBe(true);
  });
});

describe('volumétrie — répartition de Bloom paramétrable (§16.1)', () => {
  it('le défaut est 8 / 4 / 0 / 0, soit 12 questions par notion', () => {
    expect(DEFAULT_BLOOM_DISTRIBUTION).toEqual({ 1: 8, 2: 4, 3: 0, 4: 0 });
    expect(questionsPerNotion()).toBe(12);
  });

  it('le plafond de débit est à 300 le temps des tests', () => {
    // Garde-fou volontairement bas : c'est la seule barrière contre une boucle
    // qui part en vrille (§16.2).
    expect(MAX_QUESTIONS_PER_IMPORT).toBe(300);
  });

  it('un niveau à zéro n’apparaît pas dans l’instruction', () => {
    const instruction = bloomInstruction();
    expect(instruction).toContain('8 de niveau 1');
    expect(instruction).toContain('4 de niveau 2');
    expect(instruction).not.toMatch(/niveau 3/);
    expect(instruction).not.toMatch(/niveau 4/);
  });

  it('changer la répartition change l’instruction produite', () => {
    const autre: BloomDistribution = { 1: 2, 2: 0, 3: 5, 4: 1 };
    const instruction = bloomInstruction(autre);
    expect(instruction).toContain('2 de niveau 1');
    expect(instruction).toContain('5 de niveau 3');
    expect(instruction).toContain('1 de niveau 4');
    expect(instruction).not.toMatch(/niveau 2/);
    expect(instruction).toContain('8 questions par notion');
    expect(instruction).not.toBe(bloomInstruction());
  });

  it('la passe questions reprend la répartition qu’on lui donne', () => {
    const instruction = questionsInstruction({
      chapter: { id: 'ch1', name: 'Les fleuves' },
      notions: [{ id: 'n1', title: 'La Loire…' }],
      budget: 300,
      distribution: { 1: 3, 2: 0, 3: 0, 4: 0 },
    });
    expect(instruction).toContain('3 de niveau 1');
    expect(instruction).not.toContain('8 de niveau 1');
  });

  it('une répartition entièrement à zéro ne demande rien', () => {
    expect(bloomInstruction({ 1: 0, 2: 0, 3: 0, 4: 0 })).toMatch(/aucune question/i);
    expect(questionsPerNotion({ 1: 0, 2: 0, 3: 0, 4: 0 })).toBe(0);
  });
});

describe('assignInstruction — la page range, elle ne juge pas', () => {
  const base = {
    notions: [{ id: 'n1', title: 'La Loire est le plus long fleuve de France.', sourceDocument: 'cours.pdf', page: 12 }],
    chapters: [{ id: 'c1', name: 'Les fleuves', sourceDocument: 'cours.pdf', pageStart: 10, pageEnd: 20 }],
    similar: [],
  };

  it('donne la provenance de chaque notion et la plage de chaque chapitre', () => {
    const instruction = assignInstruction(base);
    expect(instruction).toContain('cours.pdf, page 12');
    expect(instruction).toContain('pages ~10 à ~20');
  });

  it('dit explicitement que le CONTENU prime sur la page', () => {
    // Sans cette phrase, le modèle range au numéro et cesse de lire la notion :
    // on obtiendrait des rangements plausibles mais faux, donc invisibles.
    const instruction = assignInstruction(base);
    expect(instruction).toMatch(/indication, pas une règle/);
    expect(instruction).toMatch(/c'est le contenu qui décide/i);
  });

  it('interdit de conclure « pages différentes, donc notions différentes »', () => {
    // Un cours énonce souvent le même fait deux fois — introduction puis
    // conclusion. Les deux extractions n'en font qu'une seule notion.
    const instruction = assignInstruction({
      ...base,
      similar: [{ notionId: 'n1', other: 'Le plus long fleuve français est la Loire.', proximity: 0.7 }],
    });
    expect(instruction).toMatch(/ne prouve JAMAIS que deux notions sont différentes/);
  });

  it('ne parle de ressemblances que s’il y en a', () => {
    expect(assignInstruction(base)).not.toMatch(/RESSEMBLANCES/);
    expect(
      assignInstruction({ ...base, similar: [{ notionId: 'n1', other: 'Autre', proximity: 0.5 }] }),
    ).toMatch(/RESSEMBLANCES REPÉRÉES/);
  });

  it('dit au modèle que le calcul ne juge rien — c’est lui qui tranche', () => {
    const instruction = assignInstruction({
      ...base,
      similar: [{ notionId: 'n1', other: 'Autre', proximity: 0.5 }],
    });
    expect(instruction).toMatch(/Ce calcul ne juge rien/);
    expect(instruction).toMatch(/FAIT VÉRIFIABLE DE PLUS/);
  });

  it('se passe de provenance sans broncher', () => {
    // Les notions d'avant le 24/08/2026 n'en ont pas, et une page périmée est
    // retirée avant d'arriver ici.
    const instruction = assignInstruction({
      notions: [{ id: 'n1', title: 'Une notion sans provenance.' }],
      chapters: [{ id: 'c1', name: 'Un chapitre' }],
      similar: [],
    });
    // La ligne de la notion ne porte aucune provenance entre crochets — le mot
    // « page » reste ailleurs, dans l'explication générale.
    expect(instruction).toContain('- n1 — Une notion sans provenance.');
    expect(instruction).not.toContain('Une notion sans provenance. [');
  });

  it('dit où la notion se trouve déjà — comme une information, pas une consigne', () => {
    // L'IA DOIT pouvoir déplacer une notion existante, y compris rangée à la
    // main : le rangement actuel l'informe, il ne le lie pas. Il sert surtout
    // quand la notion n'a plus de provenance — c'est alors le seul indice.
    const instruction = assignInstruction({
      ...base,
      notions: [{ ...base.notions[0], currentChapterId: 'c1' }],
    });
    expect(instruction).toContain('(actuellement dans c1)');
    expect(instruction).toMatch(/une information, pas une consigne/);
    expect(instruction).toMatch(/aucune provenance/);
    // Et surtout : rien qui en fasse un argument décisif.
    expect(instruction).not.toMatch(/sauf raison de la déplacer/);
  });

  it('ne dit rien de son chapitre quand elle n’en a pas', () => {
    // La mention n'apparaît que sur la LIGNE de la notion : l'explication
    // générale, elle, parle forcément de « actuellement dans ».
    expect(assignInstruction(base)).not.toContain('(actuellement dans');
  });
  it('le dit quand il n’y a aucun chapitre où ranger', () => {
    const instruction = assignInstruction({ notions: base.notions, chapters: [], similar: [] });
    expect(instruction).toMatch(/Aucun chapitre n'existe/);
  });
});
