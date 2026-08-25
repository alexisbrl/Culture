// Le contrat d'un « plan » produit par une source extérieure (IA, import, future
// API), et sa lecture défensive.
//
// ─── Ce que décrit un plan ───────────────────────────────────────────────────
//
//   { chapters: [...], notions: [...], assignments: [...], groups: [...] }
//
// avec des **clés de référence locales** (`ref`) et non des identifiants : une
// source extérieure ne peut pas connaître des identifiants qui n'existent pas
// encore, et ne doit surtout pas pouvoir en imposer (elle viserait des lignes
// existantes). Les `ref` sont résolues en identifiants réels à l'écriture.
//
// ─── La règle qui gouverne tout ce fichier ───────────────────────────────────
//
//   On RÉPARE ce qui a un mapping fondé ; on REJETTE ce qui n'en a pas.
//
//   • `sondage` → `qcm`, `ordre` → `liste` : anciens noms d'un type qui existe
//     toujours sous une autre forme. Le sens est préservé → réparation.
//   • Bloom 5 ou 6 → 4 : l'échelle est passée de 6 à 4 niveaux, « créer » reste
//     le plus exigeant → réparation.
//   • `vrai_faux` : aucun mapping fondé. Le replier sur `textuelle` donnerait un
//     vrai/faux rendu en champ de texte libre, avec des propositions devenues
//     inutiles — une question SILENCIEUSEMENT FAUSSE, pire qu'une question
//     absente → rejet.
//
// ─── Rejeter, oui, mais quoi ? ───────────────────────────────────────────────
//
// **Jamais le lot entier.** Un plan de 160 questions ne doit pas être perdu
// parce que l'une d'elles est malformée. `parsePlan` lit donc chaque élément
// séparément et rend deux journaux :
//
//   • `discarded` — l'élément est inexploitable, il est écarté (et compté) ;
//   • `adjusted`  — l'élément est conservé, mais quelque chose a été corrigé.
//
// Les deux sont remontés à l'utilisateur (« 3 questions écartées : type de
// réponse non reconnu ») : une correction silencieuse serait pire que le
// problème qu'elle règle.

import { z } from 'zod';

import { parseResponseType, type ResponseType } from '@/lib/workshops/examTypes';

// ─── Journaux ────────────────────────────────────────────────────────────────

export type PlanIssue = {
  /** Ce qui est concerné, pour un message lisible. */
  kind: 'chapter' | 'notion' | 'assignment' | 'question';
  /** La clé locale fournie par la source, quand elle en a fourni une. */
  ref?: string;
  reason: string;
};

/** Ce qui existe DÉJÀ dans l'atelier, transmis au modèle à chaque appel pour
 *  qu'il complète au lieu de dupliquer (§8 du plan d'ingestion). Une référence
 *  du plan peut donc désigner soit un élément qu'il crée, soit un élément déjà
 *  en base — dans ce dernier cas c'est son identifiant réel qui sert de `ref`.
 *
 *  Sans ce paramètre, une question rattachée à une notion existante verrait son
 *  lien retiré comme « inconnu » : le modèle ne pourrait jamais qu'ajouter des
 *  îlots, jamais enrichir le programme en place. */
export type ExistingRefs = {
  chapterIds?: Iterable<string>;
  notionIds?: Iterable<string>;
};

export type ParsedPlan = {
  chapters: PlanChapter[];
  notions: PlanNotion[];
  /** Notions existantes à ranger — ne crée rien, ne détruit rien. */
  assignments: PlanAssignment[];
  /** Chapitres EXISTANTS que le nouveau cours ne couvre plus. Sortent du
   *  programme avec ce qu'ils contiennent ; rien n'est effacé, et un clic les
   *  restaure. */
  discardChapters: PlanDiscard[];
  groups: PlanGroup[];
  /** Éléments écartés : inexploitables. */
  discarded: PlanIssue[];
  /** Éléments conservés, mais corrigés — jamais en silence. */
  adjusted: PlanIssue[];
};

// ─── Formes validées ─────────────────────────────────────────────────────────

const refSchema = z.string().trim().min(1).max(64);

const chapterSchema = z.object({
  ref: refSchema,
  name: z.string().trim().min(1).max(120), // CHAPTER_NAME_MAX
  position: z.number().int().min(0).optional(),
  // Provenance : sur quelles pages ce chapitre court, à peu près. C'est ce qui
  // permet à la passe RANGEMENT de se passer du cours (§ migration du
  // 24/08/2026). Toujours facultatif — un chapitre écrit à la main n'en a pas,
  // et un modèle qui ne sait pas doit pouvoir se taire plutôt qu'inventer.
  sourceDocument: z.string().trim().max(255).optional(),
  pageStart: z.coerce.number().int().min(0).optional(),
  pageEnd: z.coerce.number().int().min(0).optional(),
});

const notionSchema = z.object({
  ref: refSchema,
  // Une notion n'a plus qu'UN texte depuis le 19/08/2026 (280 caractères).
  title: z.string().trim().min(1).max(280), // NOTION_TITLE_MAX
  chapterRef: refSchema.optional(),
  // D'où elle vient. Le document est ajouté par l'appelant (il sait lequel il
  // traite) ; la page vient du modèle, qui seul l'a sous les yeux.
  sourceDocument: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(0).optional(),
});

/** Ranger une notion existante dans un chapitre — ou l'en sortir.
 *
 *  C'est l'opération `assign_notion` du catalogue
 *  (`src/lib/program/operations.ts`), exprimée sur le fil. Une affectation ne
 *  crée rien et ne détruit rien : c'est le seul geste par lequel un import
 *  réorganise un atelier existant, et il est réversible par nature.
 *
 *  `chapterRef` vide (ou absent) = **sans chapitre**, un état légal et voulu :
 *  la notion garde son contenu, ses questions et la progression acquise, elle
 *  sort simplement du programme. */
const assignmentSchema = z.object({
  notionRef: refSchema,
  chapterRef: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/** Type de réponse : les anciens noms sont réparés, un nom inventé est rejeté.
 *  `parseResponseType` porte déjà exactement cette distinction — on ne la
 *  réécrit pas ici, sous peine de la voir diverger. */
const responseTypeSchema = z.unknown().transform((value, ctx) => {
  const parsed = parseResponseType(value);
  if (parsed === null) {
    ctx.addIssue({ code: 'custom', message: `type de réponse inconnu : ${JSON.stringify(value)}` });
    return z.NEVER;
  }
  return parsed satisfies ResponseType;
});

/** Bloom : 5 et 6 sont ramenés à 4 (mapping fondé, l'échelle a été réduite).
 *  Tout le reste — 0, 7, du texte — n'a pas de mapping et fait échouer la
 *  question. On n'utilise donc PAS `toBloomLevel`, qui replie n'importe quoi
 *  sur 1 : c'est le bon comportement en lecture, pas à l'écriture. */
const bloomSchema = z.coerce
  .number()
  .int({ message: 'niveau de Bloom non entier' })
  .min(1, { message: 'niveau de Bloom hors bornes' })
  .max(6, { message: 'niveau de Bloom hors bornes' })
  .transform((n) => Math.min(n, 4) as 1 | 2 | 3 | 4);

const questionSchema = z.object({
  // Un énoncé d'au moins un caractère — même règle qu'à la saisie manuelle
  // (décision du 19/08/2026, voir src/lib/workshops/questionIntegrity.ts).
  content: z.string().trim().min(1, { message: 'énoncé vide' }),
  responseType: responseTypeSchema,
  answer: z.string().default(''),
  choices: z.array(z.string()).default([]),
  correctChoices: z.array(z.number().int().min(0)).default([]),
  shuffleChoices: z.boolean().default(false),
  textLines: z.number().int().min(1).max(40).default(4),
  expectations: z.string().default(''),
  bloomLevel: bloomSchema,
  notionRefs: z.array(refSchema).default([]),
});

const groupSchema = z.object({
  ref: refSchema,
  context: z.enum(['parcours', 'exam']),
  // Au moins une question : un groupe vide n'a pas de sens et ne doit jamais
  // atteindre la base (même invariant que `fromGroup`, questionGroup.ts).
  questions: z.array(questionSchema).min(1, { message: 'groupe sans question' }),
});

const discardSchema = z.object({
  ref: refSchema,
  reason: z.string().trim().default(''),
});

export type PlanDiscard = z.infer<typeof discardSchema>;
export type PlanChapter = z.infer<typeof chapterSchema>;
export type PlanAssignment = z.infer<typeof assignmentSchema>;
export type PlanNotion = z.infer<typeof notionSchema>;
export type PlanQuestion = z.infer<typeof questionSchema>;
export type PlanGroup = z.infer<typeof groupSchema>;

/** Le schéma du plan complet — utilisé tel quel comme **sortie contrainte** du
 *  modèle (le fournisseur ne peut alors produire que du conforme), et rejoué en
 *  validation à la réception. Deux usages, une seule définition. */
export const planSchema = z.object({
  chapters: z.array(chapterSchema).default([]),
  discardChapters: z.array(discardSchema).default([]),
  notions: z.array(notionSchema).default([]),
  assignments: z.array(assignmentSchema).default([]),
  groups: z.array(groupSchema).default([]),
});

// ─── Lecture défensive ───────────────────────────────────────────────────────

function firstMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'forme invalide';
  const path = issue.path.join('.');
  return path ? `${path} : ${issue.message}` : issue.message;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function refOf(raw: unknown): string | undefined {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return typeof r.ref === 'string' ? r.ref : undefined;
}

/** Lit un plan venu de n'importe où, sans jamais lui faire confiance et sans
 *  jamais tout perdre pour un élément fautif.
 *
 *  Quatre passes, dans cet ordre — chacune s'appuie sur ce que la précédente a
 *  retenu, ce qui est aussi la raison pour laquelle une référence pendante se
 *  détecte ici et pas dans le schéma :
 *
 *    1. chapitres  → un dictionnaire de `ref` connues ;
 *    2. notions    → une référence de chapitre inconnue est RETIRÉE (la notion
 *       reste, « sans chapitre » est un état légal — c'est même le sas prévu
 *       pour l'ingestion, voir docs/product-spec.md) ;
 *    3. affectations → ranger une notion existante ; une référence inconnue,
 *       de notion comme de chapitre, écarte l'affectation sans rien changer.
 *    4. groupes    → une référence de notion inconnue est retirée de la
 *       question ; la question, elle, est conservée.
 *
 *  Pourquoi retirer la référence plutôt qu'écarter l'élément : écarter perdrait
 *  du contenu pédagogique réel à cause d'une clé mal recopiée, alors que le
 *  rattachement, lui, se refait en deux clics. L'écart est journalisé dans
 *  `adjusted` — il n'est pas silencieux. */
export function parsePlan(raw: unknown, existing: ExistingRefs = {}): ParsedPlan {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const discarded: PlanIssue[] = [];
  const adjusted: PlanIssue[] = [];

  // 1. Chapitres — les références connues comprennent CELLES DÉJÀ EN BASE : un
  //    plan complète l'existant, il ne le recrée pas (§8 du plan d'ingestion).
  const chapters: PlanChapter[] = [];
  const chapterRefs = new Set<string>(existing.chapterIds ?? []);
  for (const item of asArray(root.chapters)) {
    const result = chapterSchema.safeParse(item);
    if (!result.success) {
      discarded.push({ kind: 'chapter', ref: refOf(item), reason: firstMessage(result.error) });
      continue;
    }
    if (chapterRefs.has(result.data.ref)) {
      discarded.push({ kind: 'chapter', ref: result.data.ref, reason: 'référence en double' });
      continue;
    }
    chapterRefs.add(result.data.ref);
    chapters.push(result.data);
  }

  // 1 bis. Les chapitres à ÉCARTER — et la seule règle qui compte : la
  //        référence doit désigner un chapitre QUI EXISTE. Un modèle qui nomme
  //        une référence de sa propre réponse, ou une référence inventée,
  //        retirerait du programme quelque chose que personne ne peut situer.
  //        Dans le doute on ne fait rien : écarter est une perte, pas écarter
  //        n'en est pas une.
  const discardChapters: PlanDiscard[] = [];
  const known = new Set<string>(existing.chapterIds ?? []);
  const alreadyDiscarded = new Set<string>();
  for (const item of asArray(root.discardChapters)) {
    const result = discardSchema.safeParse(item);
    if (!result.success) {
      discarded.push({ kind: 'chapter', ref: refOf(item), reason: firstMessage(result.error) });
      continue;
    }
    const { ref } = result.data;
    if (!known.has(ref)) {
      discarded.push({ kind: 'chapter', ref, reason: 'chapitre à écarter inconnu — ignoré' });
      continue;
    }
    if (alreadyDiscarded.has(ref)) continue;
    alreadyDiscarded.add(ref);
    discardChapters.push(result.data);
  }

  // 2. Notions — idem : une question peut viser une notion déjà en base.
  const notions: PlanNotion[] = [];
  const notionRefs = new Set<string>(existing.notionIds ?? []);
  for (const item of asArray(root.notions)) {
    const result = notionSchema.safeParse(item);
    if (!result.success) {
      discarded.push({ kind: 'notion', ref: refOf(item), reason: firstMessage(result.error) });
      continue;
    }
    const notion = result.data;
    if (notionRefs.has(notion.ref)) {
      discarded.push({ kind: 'notion', ref: notion.ref, reason: 'référence en double' });
      continue;
    }
    if (notion.chapterRef && !chapterRefs.has(notion.chapterRef)) {
      adjusted.push({
        kind: 'notion',
        ref: notion.ref,
        reason: `chapitre inconnu (${notion.chapterRef}) — notion rangée « sans chapitre »`,
      });
      delete notion.chapterRef;
    }
    notionRefs.add(notion.ref);
    notions.push(notion);
  }

  // 3. Affectations — ranger une notion QUI EXISTE DÉJÀ.
  //
  //    Contrairement aux notions ci-dessus, `notionRef` doit être une référence
  //    CONNUE : une affectation ne peut rien créer. Une notion inconnue est donc
  //    écartée, jamais « réparée » en création — c'est la règle du fichier (on ne
  //    répare que ce qui a un mapping fondé), et c'est ce qui empêche la passe
  //    chapitres d'inventer du contenu qu'aucun document n'a produit.
  //
  //    Un chapitre inconnu est écarté aussi, et surtout PAS ramené à « sans
  //    chapitre » : ce serait sortir une notion du programme sur une faute de
  //    frappe, c'est-à-dire la perte silencieuse qu'on cherche à rendre
  //    impossible. Ne rien faire laisse la notion là où elle est.
  const assignments: PlanAssignment[] = [];
  const assigned = new Set<string>();
  for (const item of asArray(root.assignments)) {
    const result = assignmentSchema.safeParse(item);
    if (!result.success) {
      discarded.push({ kind: 'assignment', reason: firstMessage(result.error) });
      continue;
    }
    const assignment = result.data;
    if (!notionRefs.has(assignment.notionRef)) {
      discarded.push({
        kind: 'assignment',
        ref: assignment.notionRef,
        reason: 'notion inconnue — une affectation ne crée rien',
      });
      continue;
    }
    if (assignment.chapterRef && !chapterRefs.has(assignment.chapterRef)) {
      discarded.push({
        kind: 'assignment',
        ref: assignment.notionRef,
        reason: `chapitre inconnu (${assignment.chapterRef}) — notion laissée où elle est`,
      });
      continue;
    }
    // Deux affectations pour la même notion : la première fait foi. Appliquer la
    // seconde ferait dépendre le résultat de l'ordre d'un tableau JSON.
    if (assigned.has(assignment.notionRef)) {
      discarded.push({
        kind: 'assignment',
        ref: assignment.notionRef,
        reason: 'notion déjà rangée dans ce plan',
      });
      continue;
    }
    assigned.add(assignment.notionRef);
    assignments.push(assignment);
  }

  // 4. Groupes de questions
  const groups: PlanGroup[] = [];
  const groupRefs = new Set<string>();
  for (const item of asArray(root.groups)) {
    const result = groupSchema.safeParse(item);
    if (!result.success) {
      discarded.push({ kind: 'question', ref: refOf(item), reason: firstMessage(result.error) });
      continue;
    }
    const group = result.data;
    if (groupRefs.has(group.ref)) {
      discarded.push({ kind: 'question', ref: group.ref, reason: 'référence en double' });
      continue;
    }

    for (const question of group.questions) {
      const unknown = question.notionRefs.filter((ref) => !notionRefs.has(ref));
      if (unknown.length > 0) {
        adjusted.push({
          kind: 'question',
          ref: group.ref,
          reason: `notion inconnue retirée (${unknown.join(', ')})`,
        });
        question.notionRefs = question.notionRefs.filter((ref) => notionRefs.has(ref));
      }
    }

    groupRefs.add(group.ref);
    groups.push(group);
  }

  return { chapters, notions, assignments, groups, discardChapters, discarded, adjusted };
}
