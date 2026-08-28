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
// ─── Types de réponse : tous, avec leurs réglages (25/08/2026) ───────────────
//
// Le modèle n'a longtemps eu droit qu'aux types **complets sans réglages** —
// QCM, réponse rédigée, liste. Un tableau porte ses lignes, ses colonnes et ses
// cases justes ; une mise en paires porte ses appariements ; rien sur le fil ne
// les transportait, et l'écriture les enregistrait vides : un tableau généré
// serait arrivé en grille VIDE, à refaire entièrement à la main.
//
// Le fil les transporte désormais, et les huit types du menu sont ouverts. Deux
// principes règlent la forme de ce qui suit :
//
//   • **Les réglages sont FACULTATIFS.** L'écrasante majorité des questions sont
//     des QCM ou des réponses rédigées, qui n'en ont aucun ; les rendre
//     obligatoires ferait payer à chacune les champs vides de toutes les autres,
//     sur chaque appel de chaque import. Les sorties structurées d'Anthropic
//     acceptent des propriétés non requises — le SDK recopie `required` tel quel
//     au lieu d'y verser toutes les propriétés (`transformJSONSchema`).
//   • **Le modèle décrit ce qu'il veut dire, pas ce que la base stocke.** Les
//     paires voyagent en `{ left, right }`, les cases justes d'une grille en
//     index de colonnes ligne par ligne. L'encodage réel (« gauche :: droite »,
//     clés « ligne-colonne ») est reconstruit à la lecture par `parsePlan` :
//     faire fabriquer une chaîne à séparateur par un modèle est un piège gratuit,
//     et il se paierait en questions écartées.
//
// ─── Deux jeux de types, selon l'endroit où la question va vivre ─────────────
//
// Le DÉPÔT DE FICHIER et l'ÉNONCÉ SANS RÉPONSE n'existent qu'à l'examen : dans
// l'entraînement, la copie n'est relue par personne, et une question qui attend
// un livrable ne ferait jamais progresser la notion qu'elle vise. Le DESSIN, lui,
// est ouvert des deux côtés — sur bien des notions, tracer le schéma est
// justement la façon de réviser.

import { z } from 'zod';

import { FILE_TYPE_KEYS } from '@/lib/workshops/examTypes';

/** Les types de réponse que l'IA a le droit de produire dans le PARCOURS.
 *
 *  ⚠️ `qcs` et `qcm` sont **le même type pour l'utilisateur** : le menu de
 *  l'éditeur n'affiche que « QCM » (`RESPONSE_TYPE_ORDER` ne contient pas `qcs`),
 *  et la pastille « réponse unique » bascule de l'un à l'autre. Ils portent
 *  d'ailleurs le même libellé en fr comme en en. Les exposer séparément ici est
 *  correct — c'est bien la valeur stockée — mais le prompt doit dire qu'il
 *  s'agit d'une OPTION et non de deux types, sinon un modèle qui alterne les
 *  deux croit varier alors que l'utilisateur voit un mur de QCM. */
export const PARCOURS_RESPONSE_TYPES = [
  'qcs', 'qcm', 'textuelle', 'liste', 'tableau', 'matching', 'dessin',
] as const;

/** À l'examen, deux de plus : le dépôt de fichier et l'énoncé sans réponse
 *  attendue (une consigne, un préambule, une question dont on ne veut que la
 *  place sur la copie). Les deux supposent un correcteur humain — ils n'ont donc
 *  rien à faire dans l'entraînement. */
export const EXAM_RESPONSE_TYPES = [...PARCOURS_RESPONSE_TYPES, 'fichier', 'sans_reponse'] as const;

/** Réglages propres au type de réponse. Tous facultatifs : une question qui n'en
 *  a pas besoin n'écrit rien.
 *
 *  Sous-ensemble volontaire de `QuestionTypeOptions` : n'y figure que ce qu'un
 *  modèle peut décider À PARTIR DU COURS. La largeur de colonne d'une paire, la
 *  numérotation d'une liste, le mélange des lignes d'un tableau sont des choix
 *  de mise en page — ils gardent leur défaut, et l'auteur les règle à l'œil. */
const wireTypeOptionsSchema = z.object({
  tableRows: z
    .array(z.string())
    .optional()
    .describe('tableau — libellés des LIGNES de la grille, de haut en bas.'),
  tableCols: z
    .array(z.string())
    .optional()
    .describe('tableau — libellés des COLONNES de la grille, de gauche à droite.'),
  tableCorrect: z
    .array(z.array(z.number().int()))
    .optional()
    .describe(
      'tableau — les cases à cocher : une entrée par ligne, dans le même ordre que tableRows, contenant les index (à partir de 0) des colonnes justes de cette ligne. Tableau vide pour une ligne sans case juste.',
    ),
  tableUnique: z
    .boolean()
    .optional()
    .describe('tableau — vrai si chaque ligne n’admet qu’UNE seule case cochée (classer chaque élément dans une catégorie).'),
  fileTypes: z
    .array(z.enum(FILE_TYPE_KEYS))
    .optional()
    .describe('fichier — familles de formats acceptées. Omettre pour les accepter toutes.'),
});

/** Le schéma d'une question, pour un jeu de types donné. Une fonction et non
 *  deux schémas recopiés : parcours et examen ne diffèrent QUE par la liste des
 *  types ouverts, et deux copies divergeraient au premier ajout de champ. */
function questionSchemaFor<T extends readonly [string, ...string[]]>(types: T) {
  return z.object({
    content: z.string().describe("L'énoncé de la question, tel qu'il sera lu par le candidat."),
    responseType: z
      .enum(types)
      .describe(
        "Comment le candidat répond. « qcs »/« qcm » : propositions à cocher (une seule juste, ou plusieurs — c'est la même chose à ses yeux). « textuelle » : réponse rédigée. « liste » : plusieurs réponses courtes. « tableau » : grille de cases à cocher. « matching » : relier deux colonnes. « dessin » : tracer un schéma. « fichier » : déposer un document. « sans_reponse » : aucune réponse attendue.",
      ),
    choices: z
      .array(z.string())
      .describe(
        'Selon le type : les propositions pour qcs et qcm, les réponses attendues pour liste. Tableau vide pour tous les autres types.',
      ),
    correctChoices: z
      .array(z.number().int())
      .describe('Index (à partir de 0) des propositions correctes, pour qcs et qcm uniquement.'),
    pairs: z
      .array(
        z.object({
          left: z.string().describe("L'élément, colonne de gauche."),
          right: z.string().describe('Sa correspondance, colonne de droite.'),
        }),
      )
      .optional()
      .describe(
        "matching — les paires attendues, chacune écrite déjà appariée. Elles seront présentées mélangées au candidat : n'essaie pas de les brouiller toi-même.",
      ),
    typeOptions: wireTypeOptionsSchema
      .optional()
      .describe("Réglages du type de réponse. À omettre pour les types qui n'en ont pas."),
    answer: z
      .string()
      .describe(
        'Réponse attendue, rédigée, pour textuelle. Pour dessin et fichier, ce qui est attendu du candidat. Chaîne vide partout ailleurs.',
      ),
    expectations: z
      .string()
      .describe("Critères de correction : ce qui est attendu, ce qui est accepté. Peut être vide."),
    // ⚠️ Le niveau est porté par CHAQUE notion, et non par la question
    // (28/08/2026) : une même question peut faire restituer une notion et en
    // faire analyser une autre. Écris donc l'énoncé, regarde ce qu'il mobilise,
    // et dis pour chaque notion ce qu'il en demande.
    notions: z
      .array(
        z.object({
          ref: z.string().describe("Référence d'une notion que cette question fait travailler."),
          bloomLevel: z
            .number()
            .int()
            .min(1)
            .max(4)
            .describe(
              'Ce que la question demande de CETTE notion-là : 1 mémoriser, 2 comprendre, 3 appliquer, 4 analyser ou créer.',
            ),
        }),
      )
      .describe('Les notions que cette question fait travailler, chacune avec son niveau. Au moins une.'),
  });
}

export const wireQuestionSchema = questionSchemaFor(PARCOURS_RESPONSE_TYPES);
export const wireExamQuestionSchema = questionSchemaFor(EXAM_RESPONSE_TYPES);

/** Un groupe, pour un jeu de types donné. Même raison que ci-dessus de passer
 *  par une fonction : la seule différence entre les deux est la liste des types
 *  ouverts à ses questions. */
function groupSchemaFor<Q extends z.ZodTypeAny>(questionSchema: Q) {
  return z.object({
    ref: z.string().describe('Clé locale unique de ce groupe dans ce plan.'),
    questions: z
      .array(questionSchema)
      .describe("Les questions du groupe. Une seule dans la plupart des cas ; plusieurs si elles partagent le même support."),
  });
}

export const wireGroupSchema = groupSchemaFor(wireQuestionSchema);
export const wireExamGroupSchema = groupSchemaFor(wireExamQuestionSchema);

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
/** L'ARCHITECTURE du programme après cet import (25/08/2026) : chaque chapitre
 *  avec son rang, et le rang 0 pour ceux que le cours ne couvre plus.
 *
 *  ⚠️ **Le rang 0 est une déclaration POSITIVE, jamais une absence.** On aurait
 *  pu écarter tout ce qui ne figure pas dans la liste : l'oubli d'une ligne
 *  aurait alors amputé le programme, et omettre un élément d'une longue liste
 *  est la panne la plus banale d'un modèle. Ici, un chapitre absent de la liste
 *  garde sa place et reste — l'oubli ne coûte rien.
 *
 *  Demander le rang de CHACUN plutôt qu'une simple liste d'écartés n'est pas
 *  cosmétique : ça oblige à statuer sur chaque chapitre existant, là où une
 *  liste d'écartés se remplit au gré de ce que le modèle remarque. */
export const wireChapterRankSchema = z.object({
  ref: z
    .string()
    .describe("Un chapitre : soit l'identifiant d'un chapitre DÉJÀ EXISTANT recopié tel quel, soit la référence d'un chapitre de cette réponse."),
  rank: z
    .number()
    .int()
    .min(0)
    .describe("Sa place dans le programme, à partir de 1 et dans l'ordre du cours. 0 signifie que le cours ne le couvre plus : il sort du programme, avec ce qu'il contient. Réservé aux chapitres existants."),
  reason: z
    .string()
    .describe("Uniquement pour un rang 0 : en quelques mots, pourquoi le cours ne le couvre plus. S'affiche à l'utilisateur. Chaîne vide sinon."),
});

export const wireChaptersOutput = z.object({
  chapters: z.array(wireChapterSchema),
  chapterOrder: z.array(wireChapterRankSchema),
});
export const wireAssignmentsOutput = z.object({ assignments: z.array(wireAssignmentSchema) });
export const wireNotionsOutput = z.object({ notions: z.array(wireNotionSchema) });
export const wireGroupsOutput = z.object({ groups: z.array(wireGroupSchema) });
/** Même sortie, jeu de types de l’examen — voir EXAM_RESPONSE_TYPES. */
export const wireExamGroupsOutput = z.object({ groups: z.array(wireExamGroupSchema) });

export type WireChaptersOutput = z.infer<typeof wireChaptersOutput>;
export type WireAssignmentsOutput = z.infer<typeof wireAssignmentsOutput>;
export type WireNotionsOutput = z.infer<typeof wireNotionsOutput>;
export type WireGroupsOutput = z.infer<typeof wireGroupsOutput>;
