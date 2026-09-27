import { describe, expect, it, vi } from 'vitest';

import {
  NEAR_DUPLICATE,
  dropNearDuplicates,
  dropRepeatedQuestions,
  flagSimilar,
  judgeRedites,
  judgedDuplicates,
  questionFingerprint,
  rediteCandidates,
  resolveRedites,
  type RediteNotion,
  SIMILAR_ENOUGH_TO_ASK,
  proximity,
  significantWords,
} from '@/lib/ingest/duplicates';

// Le filet anti-doublon. Testé parce qu'il tranche sur du contenu produit par
// une entrée non fiable ET qu'un faux positif fait perdre du contenu
// pédagogique réel (CLAUDE.md §7, les deux critères).
//
// ⚠️ **Les paires ci-dessous sont réelles.** Elles viennent du premier import
// d'histoire après l'inversion (23/08/2026) : ce sont exactement les deux
// redites qui sont passées malgré la consigne, et les deux voisines légitimes
// qu'il ne faut surtout pas confondre avec elles. Si le seuil bouge un jour,
// c'est ce fichier qui dira ce que ça coûte.

const CHIFFRES_ANCIENNE =
  "Au XVI° siècle, on produit 150 millions d'exemplaires pour 20 millions de titres, contre 20 millions d'exemplaires pour 30 000 titres au XV° siècle.";
const CHIFFRES_NOUVELLE =
  "À la fin du XVe siècle : 30 000 titres imprimés correspondent à 20 millions d'exemplaires ; au XVIe siècle : 20 millions de titres pour 150 millions d'exemplaires.";

const LIVRE_ANCIENNE =
  "Les améliorations du livre au XVI° siècle (dimensions réduites, lettres romaines, une colonne, pas d'enluminures, papier moins cher) augmentent la production et la diffusion.";
const LIVRE_NOUVELLE =
  "Les améliorations du livre au XVIe siècle (format réduit, lettres romaines, une colonne, abandon de l'enluminure, papier moins cher) augmentent production et diffusion.";

const PIC_CORPS_BEAU = "Selon Pic de la Mirandole, l'homme est beau et parfait par son corps.";
const PIC_CORPS_CARRE =
  "Selon Pic de la Mirandole, l'homme est parfait car son corps s'inscrit dans un carré (perfection spirituelle) et un cercle (divinité).";

const AUTEURS_ROMAINS =
  "Les auteurs romains que les humanistes doivent connaître sont César et Tite-Live.";
const AUTEURS_GRECS =
  "Les écrivains et philosophes que les humanistes doivent connaître sont Ovide, Virgile, Cicéron, Plutarque et Plaute.";

describe('significantWords', () => {
  it('ignore accents, ponctuation et mots vides', () => {
    const words = significantWords("L'humanisme est une réaction à l'angoisse.");
    expect(words.has('humanism')).toBe(true);
    expect(words.has('reaction')).toBe(true);
    expect(words.has('angoiss')).toBe(true);
    expect(words.has('est')).toBe(false);
    expect(words.has('une')).toBe(false);
  });

  it('rapproche singulier et pluriel', () => {
    expect(significantWords('enluminures')).toEqual(significantWords('enluminure'));
    expect(significantWords('réduites')).toEqual(significantWords('réduit'));
  });

  it('rapproche les deux écritures d’un numéro de siècle', () => {
    // « XVI° » contre « XVIe » : à lui seul, ce détail suffisait à faire passer
    // deux phrases identiques pour différentes.
    expect(significantWords('XVIe')).toEqual(significantWords('XVI'));
    expect(significantWords('XVe')).toEqual(significantWords('XV'));
  });

  it('garde les chiffres — ce sont les mots les plus discriminants', () => {
    expect(significantWords('150 millions').has('150')).toBe(true);
  });
});

describe('proximity — les valeurs mesurées sur un cours réel', () => {
  it('les mêmes chiffres lus à l’envers sont reconnus', () => {
    expect(proximity(CHIFFRES_ANCIENNE, CHIFFRES_NOUVELLE)).toBeGreaterThanOrEqual(NEAR_DUPLICATE);
  });

  it('la même phrase avec des synonymes est reconnue', () => {
    expect(proximity(LIVRE_ANCIENNE, LIVRE_NOUVELLE)).toBeGreaterThanOrEqual(NEAR_DUPLICATE);
  });

  it('deux faits DISTINCTS sur le même auteur restent distincts', () => {
    // Le cas le plus proche du seuil parmi ceux qu'il faut garder : c'est lui
    // qui interdit de le baisser.
    expect(proximity(PIC_CORPS_BEAU, PIC_CORPS_CARRE)).toBeLessThan(NEAR_DUPLICATE);
  });

  it('deux listes d’auteurs différentes ne se ressemblent pas', () => {
    expect(proximity(AUTEURS_ROMAINS, AUTEURS_GRECS)).toBeLessThan(0.4);
  });

  it('une notion est identique à elle-même, et étrangère à n’importe quoi', () => {
    expect(proximity(LIVRE_ANCIENNE, LIVRE_ANCIENNE)).toBe(1);
    expect(proximity(LIVRE_ANCIENNE, 'La Loire est le plus long fleuve de France.')).toBeLessThan(0.2);
    expect(proximity('', LIVRE_ANCIENNE)).toBe(0);
  });
});

describe('dropNearDuplicates', () => {
  const titleOf = (n: { title: string }) => n.title;

  it('écarte la redite et garde le reste', () => {
    const { kept, dropped } = dropNearDuplicates(
      [{ title: CHIFFRES_NOUVELLE }, { title: PIC_CORPS_CARRE }],
      [CHIFFRES_ANCIENNE, PIC_CORPS_BEAU],
      titleOf,
    );
    expect(kept).toEqual([{ title: PIC_CORPS_CARRE }]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].matched).toBe(CHIFFRES_ANCIENNE);
  });

  it('dit POURQUOI elle écarte, pas seulement combien', () => {
    // Le message à l'utilisateur doit pouvoir nommer la notion qui fait doublon.
    const { dropped } = dropNearDuplicates([{ title: LIVRE_NOUVELLE }], [LIVRE_ANCIENNE], titleOf);
    expect(dropped[0].matched).toBe(LIVRE_ANCIENNE);
    expect(dropped[0].proximity).toBeGreaterThanOrEqual(NEAR_DUPLICATE);
  });

  it('écarte aussi deux formulations d’un même fait DANS le lot', () => {
    // Sans ça, un document qui redit deux fois la même chose passerait entier :
    // rien en base ne s'y oppose puisque rien n'a encore été écrit.
    const { kept, dropped } = dropNearDuplicates(
      [{ title: LIVRE_ANCIENNE }, { title: LIVRE_NOUVELLE }],
      [],
      titleOf,
    );
    expect(kept).toEqual([{ title: LIVRE_ANCIENNE }]);
    expect(dropped).toHaveLength(1);
  });

  it('ne touche à rien quand l’atelier est vide et le lot sain', () => {
    const lot = [{ title: AUTEURS_ROMAINS }, { title: AUTEURS_GRECS }];
    expect(dropNearDuplicates(lot, [], titleOf)).toEqual({ kept: lot, dropped: [] });
  });

  it('retient la correspondance la PLUS proche, pas la première venue', () => {
    const { dropped } = dropNearDuplicates(
      [{ title: LIVRE_NOUVELLE }],
      ['Les améliorations du livre augmentent la diffusion.', LIVRE_ANCIENNE],
      titleOf,
      0.3,
    );
    expect(dropped[0].matched).toBe(LIVRE_ANCIENNE);
  });

  it('un lot vide ne rend rien et ne lève pas', () => {
    expect(dropNearDuplicates([], [LIVRE_ANCIENNE], titleOf)).toEqual({ kept: [], dropped: [] });
  });
});

describe('flagSimilar — signaler, pas trancher', () => {
  it('remonte les paires assez proches pour mériter une question', () => {
    const flagged = flagSimilar(
      [{ id: 'n1', title: CHIFFRES_NOUVELLE }],
      [{ title: CHIFFRES_ANCIENNE }, { title: AUTEURS_ROMAINS }],
      (c) => c.title,
      (o) => o.title,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].other.title).toBe(CHIFFRES_ANCIENNE);
  });

  it('signale BIEN PLUS largement que le seuil qui décide', () => {
    // C'est tout le déplacement du 24/08/2026 : un seuil qui tranche doit être
    // sévère (une erreur coûte du contenu), un seuil qui signale peut être
    // généreux (une erreur coûte trois mots dans une consigne). Les deux
    // notions « Pic de la Mirandole » sont sous le seuil de décision — donc
    // jamais écartées — mais au-dessus de celui du signalement.
    expect(proximity(PIC_CORPS_BEAU, PIC_CORPS_CARRE)).toBeLessThan(NEAR_DUPLICATE);
    expect(proximity(PIC_CORPS_BEAU, PIC_CORPS_CARRE)).toBeGreaterThanOrEqual(SIMILAR_ENOUGH_TO_ASK);

    const flagged = flagSimilar(
      [{ id: 'n1', title: PIC_CORPS_CARRE }],
      [{ title: PIC_CORPS_BEAU }],
      (c) => c.title,
      (o) => o.title,
    );
    expect(flagged).toHaveLength(1);
  });

  it('classe les paires les plus proches d’abord', () => {
    const flagged = flagSimilar(
      [{ id: 'n1', title: LIVRE_NOUVELLE }],
      [{ title: PIC_CORPS_BEAU }, { title: LIVRE_ANCIENNE }],
      (c) => c.title,
      (o) => o.title,
      0.1,
    );
    expect(flagged[0].other.title).toBe(LIVRE_ANCIENNE);
  });

  it('rend une notion plusieurs fois si elle ressemble à plusieurs autres', () => {
    // On ne choisit pas pour le modèle : il voit toutes les paires.
    const flagged = flagSimilar(
      [{ id: 'n1', title: LIVRE_NOUVELLE }],
      [{ title: LIVRE_ANCIENNE }, { title: 'Les améliorations du livre augmentent la diffusion.' }],
      (c) => c.title,
      (o) => o.title,
      0.2,
    );
    expect(flagged).toHaveLength(2);
  });

  it('ne signale rien quand rien ne se ressemble', () => {
    expect(flagSimilar(
      [{ id: 'n1', title: AUTEURS_ROMAINS }],
      [{ title: LIVRE_ANCIENNE }],
      (c) => c.title,
      (o) => o.title,
    )).toEqual([]);
  });
});

// ─── Un examen ne recopie pas l'entraînement ─────────────────────────────────
//
// Testé ici parce que c'est le contrat d'une entrée non fiable — ce que le
// modèle vient d'écrire — et parce que la règle décide de ce qui est INSCRIT en
// banque d'examen. Une erreur de bord retire des questions qu'on a payées.
describe('dropRepeatedQuestions', () => {
  const q = (content: string) => ({ content });

  it('laisse passer une question qui ne redit rien', () => {
    const groups = [{ questions: [q('Quelle est la capitale du Pérou ?')] }];
    const { kept, removed } = dropRepeatedQuestions(groups, ['Combien font cinq plus deux ?']);
    expect(kept).toEqual(groups);
    expect(removed).toEqual([]);
  });

  it('retire une question isolée qui recopie une question d’entraînement', () => {
    const seen = ['Quelle est la capitale du Pérou ?'];
    const { kept, removed } = dropRepeatedQuestions([{ questions: [q('Quelle est la capitale du Pérou ?')] }], seen);
    expect(kept).toEqual([]);
    expect(removed).toHaveLength(1);
    expect(removed[0].other).toBe(seen[0]);
  });

  it('emporte tout le groupe quand c’est sa PREMIÈRE question qui recopie', () => {
    // La première pose le décor : la garder seule au rebut laisserait les
    // suivantes renvoyer à une situation absente.
    const groups = [{ questions: [q('Quelle est la capitale du Pérou ?'), q('Quel fleuve la traverse ?')] }];
    const { kept, removed } = dropRepeatedQuestions(groups, ['Quelle est la capitale du Pérou ?']);
    expect(kept).toEqual([]);
    expect(removed).toHaveLength(2);
  });

  it('ne retire que la question fautive quand elle n’est pas la première', () => {
    const groups = [{ questions: [q('Observe ce relevé de températures.'), q('Combien font cinq plus deux ?')] }];
    const { kept, removed } = dropRepeatedQuestions(groups, ['Combien font cinq plus deux ?']);
    expect(kept).toHaveLength(1);
    expect(kept[0].questions).toEqual([q('Observe ce relevé de températures.')]);
    expect(removed).toHaveLength(1);
  });

  it('ne fait rien quand il n’y a pas encore de questions d’entraînement', () => {
    const groups = [{ questions: [q('Quelle est la capitale du Pérou ?')] }];
    expect(dropRepeatedQuestions(groups, []).kept).toEqual(groups);
  });

  // ─── Les trois faux positifs que le seuil des titres produisait ───────────
  //
  // Mesures réelles au 25/08/2026, sur le recouvrement de mots signifiants :
  // 0,67 · 0,80 · 0,80. À 0,70 (le seuil des titres), les deux derniers étaient
  // écartés — deux questions payées, légitimes, jetées en silence. C'est ce qui
  // a fait passer la recopie à 0,95.
  it('garde deux calculs qui ne diffèrent que par un nombre', () => {
    const groups = [{ questions: [q('Combien fait la somme 7 + 13 ?')] }];
    expect(dropRepeatedQuestions(groups, ['Combien fait la somme 7 + 23 ?']).kept).toHaveLength(1);
  });

  it('garde un énoncé long qui ne diffère que par une valeur', () => {
    const groups = [{ questions: [q('Un train part de Lyon à 14 h et roule 3 heures : à quelle heure arrive-t-il ?')] }];
    const seen = ['Un train part de Lyon à 14 h et roule 5 heures : à quelle heure arrive-t-il ?'];
    expect(dropRepeatedQuestions(groups, seen).kept).toHaveLength(1);
  });

  it('garde une reformulation de la même question', () => {
    // Reposer autrement une question du parcours est légitime en examen : on
    // vérifie que la notion est comprise, pas qu'elle est mémorisée.
    const groups = [{ questions: [q('Cite les trois causes principales de la Première Guerre mondiale selon le cours.')] }];
    const seen = ['Cite les trois causes majeures de la Première Guerre mondiale selon le cours.'];
    expect(dropRepeatedQuestions(groups, seen).kept).toHaveLength(1);
  });

  it('écarte le mot à mot, y compris sous une ponctuation différente', () => {
    const groups = [{ questions: [q('Quelle est la capitale du Pérou ?')] }];
    expect(dropRepeatedQuestions(groups, ['Quelle est la capitale du Pérou.']).kept).toHaveLength(0);
  });
});

describe('questionFingerprint — la recopie, pas la parenté', () => {
  it('ignore l’ordre des mots, la ponctuation, les accents et la casse', () => {
    expect(questionFingerprint('Quelle est la capitale du Pérou ?')).toBe(questionFingerprint('du PEROU, la capitale est quelle.'));
  });

  it('un mot de différence suffit à distinguer', () => {
    expect(questionFingerprint('Combien fait 7 + 13 ?')).not.toBe(questionFingerprint('Combien fait 7 + 23 ?'));
  });

  it('un énoncé sans mot porteur n’a pas d’empreinte, et ne recopie rien', () => {
    expect(questionFingerprint('?')).toBe('');
    expect(dropRepeatedQuestions([{ questions: [{ content: '?' }] }], ['!']).kept).toHaveLength(1);
  });

  it('compare chaque question aux seuls énoncés qu’on lui désigne', () => {
    const groups = [{ questions: [{ content: 'Quelle est la capitale du Pérou ?', notion: 'n1' }] }];
    const pool: Record<string, string[]> = { n1: [], n2: ['Quelle est la capitale du Pérou ?'] };
    expect(dropRepeatedQuestions(groups, (q) => pool[q.notion]).kept).toHaveLength(1);
    expect(dropRepeatedQuestions(groups, () => pool.n2).kept).toHaveLength(0);
  });
});

// Les doublons entre notions, jugés à la fin (§7.6). Testé parce que la règle
// EFFACE des notions — y compris une ancienne, après transfert de ses questions
// et de la progression des élèves — sur la foi d'une réponse du modèle.
describe('redites (§7.6)', () => {
  const n = (id: string, title: string, chapterId: string | null, fresh: boolean, createdAt = '2026-09-01'): RediteNotion =>
    ({ id, title, chapterId, fresh, createdAt });
  const LOIRE = 'La Loire est le plus long fleuve de France avec 1 012 km';
  const LOIRE_BIS = 'Avec 1 012 km, la Loire est le plus long fleuve de France';
  const SEINE = 'La Seine se jette dans la Manche au Havre';
  const order = ['c1', 'c2', 'c3'];

  describe('rediteCandidates', () => {
    it('soumet chaque paire proche une fois, les plus proches d’abord', () => {
      const pairs = rediteCandidates([n('old', LOIRE, 'c1', false), n('new1', LOIRE_BIS, 'c2', true), n('new2', SEINE, 'c2', true)]);
      expect(pairs.map((p) => [p.a.id, p.b.id])).toEqual([['old', 'new1']]);
    });

    it('ne soumet pas une notion neuve face à une notion de son propre chapitre — déjà jugée à l’étape notions', () => {
      expect(rediteCandidates([n('old', LOIRE, 'c2', false), n('new', LOIRE_BIS, 'c2', true)])).toEqual([]);
    });

    it('soumet deux anciennes, même dans un seul chapitre : personne ne les a jamais jugées', () => {
      expect(rediteCandidates([n('a', LOIRE, 'c1', false), n('b', LOIRE_BIS, 'c1', false)])).toHaveLength(1);
    });

    it('respecte le plafond', () => {
      const notions = [n('a', LOIRE, 'c1', false), n('b', LOIRE_BIS, 'c2', true), n('c', LOIRE, 'c3', true)];
      expect(rediteCandidates(notions, 1)).toHaveLength(1);
    });
  });

  describe('judgeRedites / judgedDuplicates', () => {
    const pairs = rediteCandidates([n('old', LOIRE, 'c1', false), n('new', LOIRE_BIS, 'c2', true)]);

    it('aucune paire ⇒ aucun appel', async () => {
      const ask = vi.fn(async () => [{ pair: 0, duplicate: true }]);
      expect(await judgeRedites([], ask)).toEqual([]);
      expect(ask).not.toHaveBeenCalled();
    });

    it('des paires ⇒ un seul appel', async () => {
      const ask = vi.fn(async () => [{ pair: 0, duplicate: true }]);
      await judgeRedites(pairs, ask);
      expect(ask).toHaveBeenCalledTimes(1);
    });

    it('ne retient que les « redite », une fois, sur une paire connue', () => {
      const answers = [0, 0, 7, -1, 1.5].map((pair) => ({ pair, duplicate: true }));
      expect(judgedDuplicates(pairs, [...answers, { pair: 0, duplicate: false }])).toEqual([{ a: 'old', b: 'new' }]);
      expect(judgedDuplicates(pairs, [{ pair: 0, duplicate: false }])).toEqual([]);
    });
  });

  describe('resolveRedites', () => {
    const resolve = (duplicates: { a: string; b: string }[], notions: RediteNotion[]) =>
      resolveRedites(duplicates, new Map(notions.map((x) => [x.id, x])), order);

    it('deux neuves : celle du chapitre qui vient le premier reste', () => {
      const out = resolve([{ a: 'n3', b: 'n1' }], [n('n3', LOIRE, 'c3', true), n('n1', LOIRE_BIS, 'c1', true)]);
      expect(out.actions).toEqual([{ kind: 'merge', keep: 'n1', remove: 'n3', moveTo: null }]);
    });

    it('une neuve et une ancienne : la neuve reste, et prend la place la plus haute', () => {
      const out = resolve([{ a: 'old', b: 'new' }], [n('old', LOIRE, 'c1', false), n('new', LOIRE_BIS, 'c3', true)]);
      expect(out.actions).toEqual([{ kind: 'merge', keep: 'new', remove: 'old', moveTo: 'c1' }]);
    });

    it('une neuve déjà plus haut que l’ancienne : elle ne bouge pas', () => {
      const out = resolve([{ a: 'old', b: 'new' }], [n('old', LOIRE, 'c3', false), n('new', LOIRE_BIS, 'c1', true)]);
      expect(out.actions).toEqual([{ kind: 'merge', keep: 'new', remove: 'old', moveTo: null }]);
    });

    it('deux anciennes : la plus récente reste, l’autre sort sans rien perdre', () => {
      const out = resolve(
        [{ a: 'older', b: 'newer' }],
        [n('older', LOIRE, 'c1', false, '2026-01-01'), n('newer', LOIRE_BIS, 'c1', false, '2026-06-01')],
      );
      expect(out.actions).toEqual([{ kind: 'unplace', keep: 'newer', notion: 'older' }]);
    });

    it('ignore une paire inconnue, hors programme, ou trop éloignée pour avoir été soumise', () => {
      const out = resolve(
        [{ a: 'old', b: 'zzz' }, { a: 'old', b: 'hidden' }, { a: 'old', b: 'seine' }, { a: 'old', b: 'old' }],
        [n('old', LOIRE, 'c1', false), n('hidden', LOIRE_BIS, 'ailleurs', true), n('seine', SEINE, 'c2', true)],
      );
      expect(out).toEqual({ actions: [], ignored: 4 });
    });

    it('une notion ne sert qu’à une paire : la plus proche la fige', () => {
      const out = resolve(
        [{ a: 'old', b: 'bis' }, { a: 'old', b: 'ter' }],
        [n('old', LOIRE, 'c1', false), n('bis', LOIRE, 'c2', true), n('ter', LOIRE_BIS, 'c3', true)],
      );
      expect(out.actions).toEqual([{ kind: 'merge', keep: 'bis', remove: 'old', moveTo: 'c1' }]);
      expect(out.ignored).toBe(1);
    });
  });
});
