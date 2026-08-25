// Le schéma DONNÉ AU MODÈLE, distinct de celui qui lit sa réponse.
//
// ─── Pourquoi deux schémas et non un ─────────────────────────────────────────
//
// `planSchema.ts` répare (`sondage` → `qcm`, Bloom 6 → 4) : il contient donc des
// *transformations*, et une transformation ne se convertit pas en JSON Schema —
// or c'est un JSON Schema qu'on envoie au fournisseur pour contraindre sa sortie.
//
// Les deux ne font pas le même travail, et c'est tant mieux :
//
//   • ICI, on décrit ce qu'on VEUT : strict, aucune valeur héritée, aucun type
//     qu'on ne saurait pas remplir. Le modèle ne peut alors produire que du
//     conforme (sortie contrainte).
//   • LÀ-BAS (`parsePlan`), on lit ce qui ARRIVE : plus tolérant, parce qu'un
//     import, une API future ou un fournisseur sans sortie structurée native
//     n'offrent aucune garantie.
//
// Le second accepte donc un sur-ensemble du premier. Ce n'est pas une
// divergence, c'est la différence entre une commande et un contrôle à la
// réception.
//
// ─── Types de réponse : volontairement restreints (décision du 20/08/2026) ───
//
// Le modèle ne génère que les types **complets sans réglages**. Un `tableau`
// porte ses lignes, ses colonnes et ses cases correctes dans `type_options` : en
// générer un sans ces réglages produirait une grille VIDE, à refaire entièrement
// à la main — ce qui annule le bénéfice de la génération. On ajoutera les autres
// types un par un, quand on saura modéliser leurs réglages.

import { z } from 'zod';

/** Les types de réponse que l'IA a le droit de produire.
 *
 *  ⚠️ `qcs` et `qcm` sont **le même type pour l'utilisateur** : le menu de
 *  l'éditeur n'affiche que « QCM » (`RESPONSE_TYPE_ORDER` ne contient pas `qcs`),
 *  et la pastille « réponse unique » bascule de l'un à l'autre. Ils portent
 *  d'ailleurs le même libellé en fr comme en en. Les exposer séparément ici est
 *  correct — c'est bien la valeur stockée — mais le prompt doit dire qu'il
 *  s'agit d'une OPTION et non de deux types, sinon un modèle qui alterne les
 *  deux croit varier alors que l'utilisateur voit un mur de QCM. */
export const GENERATED_RESPONSE_TYPES = ['qcs', 'qcm', 'textuelle', 'liste'] as const;

export const wireQuestionSchema = z.object({
  content: z.string().describe("L'énoncé de la question, tel qu'il sera lu par le candidat."),
  responseType: z
    .enum(GENERATED_RESPONSE_TYPES)
    .describe(
      "Trois types seulement, du point de vue du candidat : QCM (propositions à cocher — « qcs » si une seule est correcte, « qcm » si plusieurs le sont : c'est la même chose à ses yeux), « textuelle » (réponse rédigée), « liste » (plusieurs réponses courtes).",
    ),
  choices: z
    .array(z.string())
    .describe('Propositions, pour qcs et qcm uniquement. Tableau vide pour les autres types.'),
  correctChoices: z
    .array(z.number().int())
    .describe('Index (à partir de 0) des propositions correctes, pour qcs et qcm uniquement.'),
  answer: z
    .string()
    .describe('Réponse attendue pour textuelle et liste. Chaîne vide pour qcs et qcm.'),
  expectations: z
    .string()
    .describe("Critères de correction : ce qui est attendu, ce qui est accepté. Peut être vide."),
  bloomLevel: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe('Niveau visé : 1 mémoriser, 2 comprendre, 3 appliquer, 4 analyser ou créer.'),
  notionRefs: z
    .array(z.string())
    .describe('Références des notions que cette question fait travailler. Au moins une.'),
});

export const wireGroupSchema = z.object({
  ref: z.string().describe('Clé locale unique de ce groupe dans ce plan.'),
  questions: z
    .array(wireQuestionSchema)
    .describe("Les questions du groupe. Une seule dans la plupart des cas ; plusieurs si elles partagent le même support."),
});

export const wireChapterSchema = z.object({
  ref: z.string().describe('Clé locale unique de ce chapitre dans ce plan.'),
  name: z.string().describe('Nom du chapitre, 120 caractères maximum.'),
  sourceDocument: z
    .string()
    .describe("Nom du document où ce chapitre commence. Chaîne vide si tu ne peux pas le dire."),
  pageStart: z
    .number()
    .int()
    .describe('Première page approximative du chapitre dans ce document. 0 si tu ne peux pas le dire.'),
  pageEnd: z
    .number()
    .int()
    .describe('Dernière page approximative du chapitre. 0 si tu ne peux pas le dire.'),
});

/** ⚠️ Une notion naît SANS chapitre (feuille de route « notions d'abord », §3).
 *
 *  Le champ `chapterRef` a disparu d'ici le 23/08/2026 : au moment où les
 *  notions sont extraites, aucun chapitre n'existe encore. Le rangement est une
 *  instruction séparée (`wireAssignmentSchema`), ce qui est exactement le
 *  contrat des opérations — créer et attribuer sont deux gestes distincts
 *  (`src/lib/program/operations.ts`). */
export const wireNotionSchema = z.object({
  ref: z.string().describe('Clé locale unique de cette notion dans ce plan.'),
  title: z
    .string()
    .describe("La notion en UNE phrase de 280 caractères maximum, autoportante et vérifiable."),
  page: z
    .number()
    .int()
    .describe("Page du document d'où vient cette notion. 0 si tu ne peux pas la déterminer."),
});

/** Ranger une notion dans un chapitre.
 *
 *  `notionRef` désigne une notion qui EXISTE DÉJÀ — celles qu'on vient
 *  d'extraire des documents comme celles que l'atelier portait avant. C'est ce
 *  qui rend la mise à jour possible : réorganiser un atelier, c'est n'émettre
 *  que des affectations. */
export const wireAssignmentSchema = z.object({
  notionRef: z
    .string()
    .describe("Identifiant de la notion à ranger, recopié tel quel depuis la liste des notions fournie."),
  chapterRef: z
    .string()
    .describe(
      "Référence du chapitre où la ranger, parmi ceux de cette réponse. Chaîne vide pour laisser la notion hors du programme (elle reste consultable, sans chapitre).",
    ),
});

// Une sortie par passe : on ne demande jamais au modèle de produire le programme
// entier d'un coup (docs/ai-ingestion-plan.md §5.1).
//
// ⚠️ **Les chapitres et le rangement sont DEUX passes** (24/08/2026). Elles ont
// d'abord été fondues en un seul appel — le modèle nommait et rangeait d'un
// coup — et ça ne tient pas à l'échelle : ranger 500 notions, c'est produire 500
// lignes dans une seule réponse, bien au-delà du plafond de sortie. La réponse
// serait tronquée, donc perdue. C'est le mur qu'a déjà rencontré la passe
// questions, et la parade est la même : des lots.
//
// On ne peut pas découper en lots un appel qui doit AUSSI décider de la
// structure, puisque la structure ne se décide qu'une fois. La séparation n'est
// donc pas une alternative aux appels multiples : c'est ce qui les autorise.
//
// Bénéfice au passage : nommer les chapitres demande le cours, les ranger non —
// la passe rangement se passe donc entièrement des documents.
/** Un chapitre EXISTANT que le nouveau cours ne couvre plus (25/08/2026).
 *
 *  ⚠️ **C'est une déclaration POSITIVE, jamais une absence.** On aurait pu
 *  demander l'architecture complète et écarter tout ce qui n'y figure pas :
 *  l'oubli d'une ligne aurait alors retiré une partie du programme. Ici, oublier
 *  ne fait rien — le chapitre reste. C'est la seule forme où la panne la plus
 *  banale d'un modèle (omettre un élément d'une longue liste) est inoffensive. */
export const wireDiscardSchema = z.object({
  ref: z
    .string()
    .describe("Identifiant d'un chapitre DÉJÀ EXISTANT, recopié tel quel depuis la liste de l'atelier. Jamais un chapitre de cette réponse."),
  reason: z
    .string()
    .describe("En quelques mots, pourquoi le cours ne le couvre plus. S'affiche à l'utilisateur."),
});

export const wireChaptersOutput = z.object({
  chapters: z.array(wireChapterSchema),
  discardChapters: z.array(wireDiscardSchema),
});
export const wireAssignmentsOutput = z.object({ assignments: z.array(wireAssignmentSchema) });
export const wireNotionsOutput = z.object({ notions: z.array(wireNotionSchema) });
export const wireGroupsOutput = z.object({ groups: z.array(wireGroupSchema) });

export type WireChaptersOutput = z.infer<typeof wireChaptersOutput>;
export type WireAssignmentsOutput = z.infer<typeof wireAssignmentsOutput>;
export type WireNotionsOutput = z.infer<typeof wireNotionsOutput>;
export type WireGroupsOutput = z.infer<typeof wireGroupsOutput>;
