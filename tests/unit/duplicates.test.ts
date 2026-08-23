import { describe, expect, it } from 'vitest';

import {
  NEAR_DUPLICATE,
  dropNearDuplicates,
  findExistingMatch,
  flagSimilar,
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

describe('findExistingMatch — le doublon de CHAPITRE se redirige, il ne s’écarte pas', () => {
  const chapitres = [
    { id: 'c1', name: "L'Europe, foyer de peuplement et d'émigration" },
    { id: 'c2', name: "La citoyenneté et l'Empire à Rome du I° au III° siècle après JC" },
    { id: 'c3', name: "Les hommes de la Renaissance et l'humanisme" },
  ];
  const nameOf = (c: { name: string }) => c.name;

  it('reconnaît un chapitre existant proposé sous une forme raccourcie', () => {
    const found = findExistingMatch("L'Europe, foyer de peuplement", chapitres, nameOf);
    expect(found?.match.id).toBe('c1');
  });

  it('ne confond pas deux chapitres réellement distincts du même cours', () => {
    expect(findExistingMatch("L'élargissement du monde du XV° au XVI° siècle", chapitres, nameOf)).toBeNull();
    expect(findExistingMatch('La Révolution française', chapitres, nameOf)).toBeNull();
  });

  it('rend l’élément entier, parce que l’appelant a besoin de son identifiant', () => {
    // C'est toute la différence avec les notions : un chapitre en double n'est
    // pas jeté, sa référence est redirigée vers celui qui existe — sinon les
    // notions qu'on venait de lui affecter se retrouveraient orphelines.
    const found = findExistingMatch("Les hommes de la Renaissance et l'humanisme", chapitres, nameOf);
    expect(found?.match).toEqual(chapitres[2]);
    expect(found?.proximity).toBe(1);
  });

  it('retient le plus proche quand deux existants s’en rapprochent', () => {
    const found = findExistingMatch("L'Europe, foyer de peuplement et d'émigration", [
      { id: 'a', name: "L'Europe" },
      { id: 'b', name: "L'Europe, foyer de peuplement et d'émigration" },
    ], nameOf, 0.2);
    expect(found?.match.id).toBe('b');
  });

  it('ne trouve rien dans une liste vide', () => {
    expect(findExistingMatch('Un chapitre', [], nameOf)).toBeNull();
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
