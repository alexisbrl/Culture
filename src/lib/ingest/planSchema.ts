// Le contrat d'un « plan » produit par une source extérieure (IA, import, future
// API), et sa lecture défensive.
//
// ─── Ce que décrit un plan ───────────────────────────────────────────────────
//
//   { chapters: [...], notions: [...], groups: [...] }
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
  kind: 'chapter' | 'notion' | 'question';
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
});

const notionSchema = z.object({
  ref: refSchema,
  // Une notion n'a plus qu'UN texte depuis le 19/08/2026 (280 caractères).
  title: z.string().trim().min(1).max(280), // NOTION_TITLE_MAX
  chapterRef: refSchema.optional(),
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

export type PlanChapter = z.infer<typeof chapterSchema>;
export type PlanNotion = z.infer<typeof notionSchema>;
export type PlanQuestion = z.infer<typeof questionSchema>;
export type PlanGroup = z.infer<typeof groupSchema>;

/** Le schéma du plan complet — utilisé tel quel comme **sortie contrainte** du
 *  modèle (le fournisseur ne peut alors produire que du conforme), et rejoué en
 *  validation à la réception. Deux usages, une seule définition. */
export const planSchema = z.object({
  chapters: z.array(chapterSchema).default([]),
  notions: z.array(notionSchema).default([]),
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
 *  Trois passes, dans cet ordre — chacune s'appuie sur ce que la précédente a
 *  retenu, ce qui est aussi la raison pour laquelle une référence pendante se
 *  détecte ici et pas dans le schéma :
 *
 *    1. chapitres  → un dictionnaire de `ref` connues ;
 *    2. notions    → une référence de chapitre inconnue est RETIRÉE (la notion
 *       reste, « sans chapitre » est un état légal — c'est même le sas prévu
 *       pour l'ingestion, voir docs/product-spec.md) ;
 *    3. groupes    → une référence de notion inconnue est retirée de la
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

  // 3. Groupes de questions
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

  return { chapters, notions, groups, discarded, adjusted };
}
