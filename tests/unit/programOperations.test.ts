import { describe, expect, it } from 'vitest';

import {
  allowedOperations,
  authorizeOperations,
  isOperationAllowed,
  OPERATION_RULES,
  planImportCleanup,
  type ImportProduce,
  type OperationKind,
  type ProgramOperation,
} from '@/lib/program/operations';

// Le contrat des opérations sur le programme (feuille de route
// docs/chantiers/2026-08-23-notions-dabord.md, T2).
//
// Pourquoi ce module est testé alors que la discipline du projet est de ne pas
// tout tester (CLAUDE.md §7) : les deux critères sont réunis. C'est le contrat
// d'une entrée non fiable (l'IA, demain un chat), et il gouverne une opération
// qui peut détruire des données saisies à la main.

describe('catalogue des opérations', () => {
  it('cacher un chapitre est réservé à l’IA — l’utilisateur n’a aucun bouton pour le faire', () => {
    expect(isOperationAllowed('hide_chapter', 'ai', 'manager')).toBe(true);
    expect(isOperationAllowed('hide_chapter', 'human', 'manager')).toBe(false);
    expect(isOperationAllowed('hide_chapter', 'human', 'owner')).toBe(false);
  });

  it('restaurer est ouvert aux deux — l’IA doit pouvoir défaire un import annulé', () => {
    expect(isOperationAllowed('restore_chapter', 'human', 'manager')).toBe(true);
    expect(isOperationAllowed('restore_chapter', 'ai', 'manager')).toBe(true);
  });

  it('un candidat ne peut RIEN, quel que soit le demandeur', () => {
    expect(allowedOperations('human', 'member')).toEqual([]);
    expect(allowedOperations('ai', 'member')).toEqual([]);
  });

  it('un propriétaire a au moins tout ce qu’un gestionnaire a', () => {
    const manager = allowedOperations('human', 'manager');
    const owner = allowedOperations('human', 'owner');
    for (const kind of manager) expect(owner).toContain(kind);
  });

  it('aucune opération n’est ouverte à tous les auteurs par inadvertance', () => {
    // La table est exhaustive (Record sur OperationKind) : ce test garde le
    // sens, pas la forme — une opération ne doit jamais arriver sans auteur.
    for (const [kind, rule] of Object.entries(OPERATION_RULES)) {
      expect(rule.actors.length, kind).toBeGreaterThan(0);
      expect(rule.role, kind).not.toBe('member');
    }
  });

  it('la recharge automatique passe par la MÊME opération que la création', () => {
    // Plan d'ingestion §16.6 : seul le critère d'entrée change (quelles notions),
    // jamais l'opération. `system` n'a le droit que de celle-là.
    expect(allowedOperations('system', 'manager')).toEqual(['create_questions']);
  });
});

describe('authorizeOperations', () => {
  const ops: ProgramOperation[] = [
    { kind: 'create_notion', title: 'Date de naissance de Napoléon' },
    { kind: 'hide_chapter', chapterId: 'c1' },
    { kind: 'assign_notion', notionId: 'n1', chapterId: 'c2' },
  ];

  it('garde ce qui est permis et refuse le reste — sans perdre le lot', () => {
    const { allowed, refused } = authorizeOperations(ops, 'human', 'manager');
    expect(allowed.map((o) => o.kind)).toEqual(['create_notion', 'assign_notion']);
    expect(refused).toEqual([{ kind: 'hide_chapter', reason: 'actor_not_allowed' }]);
  });

  it('refuse tout à un candidat, avec le bon motif', () => {
    const { allowed, refused } = authorizeOperations(ops, 'ai', 'member');
    expect(allowed).toEqual([]);
    expect(refused.every((r) => r.reason === 'role_too_low')).toBe(true);
  });

  it('refuse une opération hors catalogue au lieu de la laisser passer', () => {
    const forged = [{ kind: 'delete_notion', notionId: 'n1' }] as unknown as ProgramOperation[];
    const { allowed, refused } = authorizeOperations(forged, 'ai', 'owner');
    expect(allowed).toEqual([]);
    expect(refused).toEqual([{ kind: 'delete_notion', reason: 'unknown_operation' }]);
  });

  it('un catalogue vide ne rend rien et ne lève pas', () => {
    expect(authorizeOperations([], 'ai', 'manager')).toEqual({ allowed: [], refused: [] });
  });
});

describe('planImportCleanup', () => {
  const IMPORT = 'imp-1';

  it('efface ce que CET import a créé et que personne n’a rangé', () => {
    const produce: ImportProduce = {
      chapters: [{ id: 'c-new', importId: IMPORT }],
      notions: [{ id: 'n-orphan', chapterId: null, importId: IMPORT }],
    };
    expect(planImportCleanup(produce, IMPORT)).toEqual({
      chapterIds: ['c-new'],
      notionIds: ['n-orphan'],
    });
  });

  it('ne touche JAMAIS à ce qui existait avant, même écarté', () => {
    // Une notion mise « sans chapitre » par un import précédent est une décision
    // prise et consultable — pas du déchet.
    const produce: ImportProduce = {
      chapters: [{ id: 'c-old', importId: 'imp-0' }],
      notions: [
        { id: 'n-old-orphan', chapterId: null, importId: 'imp-0' },
        { id: 'n-manual', chapterId: null, importId: null },
      ],
    };
    expect(planImportCleanup(produce, IMPORT)).toEqual({ chapterIds: [], notionIds: [] });
  });

  it('conserve un chapitre VIDÉ qui existait avant — il porte peut-être un titre écrit à la main', () => {
    const produce: ImportProduce = {
      chapters: [{ id: 'c-old-empty', importId: 'imp-0' }],
      notions: [],
    };
    expect(planImportCleanup(produce, IMPORT).chapterIds).toEqual([]);
  });

  it('conserve ce que l’import a créé ET rangé', () => {
    const produce: ImportProduce = {
      chapters: [{ id: 'c-new', importId: IMPORT }],
      notions: [{ id: 'n-new', chapterId: 'c-new', importId: IMPORT }],
    };
    expect(planImportCleanup(produce, IMPORT)).toEqual({ chapterIds: [], notionIds: [] });
  });

  it('un chapitre de cet import reste s’il héberge une notion venue d’ailleurs', () => {
    const produce: ImportProduce = {
      chapters: [{ id: 'c-new', importId: IMPORT }],
      notions: [{ id: 'n-old', chapterId: 'c-new', importId: 'imp-0' }],
    };
    expect(planImportCleanup(produce, IMPORT).chapterIds).toEqual([]);
  });

  it('appelé entre deux passes, il effacerait TOUT le travail — le piège documenté', () => {
    // Les notions naissent à la passe ① sans chapitre et ne sont rangées qu'à la
    // passe ②. Ce test ne valide pas un comportement souhaitable : il fige la
    // raison pour laquelle l'appel n'a lieu qu'à la fin de l'import.
    const midImport: ImportProduce = {
      chapters: [],
      notions: [
        { id: 'n1', chapterId: null, importId: IMPORT },
        { id: 'n2', chapterId: null, importId: IMPORT },
      ],
    };
    expect(planImportCleanup(midImport, IMPORT).notionIds).toEqual(['n1', 'n2']);
  });

  it('un import qui n’a rien produit ne propose rien', () => {
    expect(planImportCleanup({ chapters: [], notions: [] }, IMPORT)).toEqual({
      chapterIds: [],
      notionIds: [],
    });
  });
});

describe('le catalogue est fermé', () => {
  it('ne contient aucune opération de suppression ni de réécriture', () => {
    const kinds = Object.keys(OPERATION_RULES) as OperationKind[];
    for (const kind of kinds) {
      expect(kind).not.toMatch(/delete|remove|update|rewrite|merge/);
    }
  });
});
