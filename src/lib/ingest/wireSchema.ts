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
});

export const wireNotionSchema = z.object({
  ref: z.string().describe('Clé locale unique de cette notion dans ce plan.'),
  title: z
    .string()
    .describe("La notion en UNE phrase de 280 caractères maximum, autoportante et vérifiable."),
  chapterRef: z.string().describe("Référence du chapitre auquel elle appartient."),
});

// Une sortie par passe : on ne demande jamais au modèle de produire le programme
// entier d'un coup (docs/ai-ingestion-plan.md §5.1).
export const wireChaptersOutput = z.object({ chapters: z.array(wireChapterSchema) });
export const wireNotionsOutput = z.object({ notions: z.array(wireNotionSchema) });
export const wireGroupsOutput = z.object({ groups: z.array(wireGroupSchema) });

export type WireChaptersOutput = z.infer<typeof wireChaptersOutput>;
export type WireNotionsOutput = z.infer<typeof wireNotionsOutput>;
export type WireGroupsOutput = z.infer<typeof wireGroupsOutput>;
