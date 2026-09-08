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

import {
  DEFAULT_BLOOM_LEVEL,
  DEFAULT_FILE_TYPES,
  FILE_TYPE_KEYS,
  MATCH_SPLIT_MAX,
  MATCH_SPLIT_MIN,
  MAX_CHOICES,
  MAX_LIST_ANSWERS,
  MAX_PAIRS,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  MAX_TEXT_LINES,
  matchPairs,
  parseResponseType,
  parseTableCellKey,
  tableCellKey,
  toMatchChoice,
  type QuestionTypeOptions,
  type ResponseType,
} from '@/lib/workshops/examTypes';
import { NOTION_TITLE_MAX } from '@/lib/workshops/notions';

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
  /** L'architecture du programme : chaque chapitre avec son rang, 0 pour ceux
   *  que le cours ne couvre plus. Un chapitre absent d'ici garde sa place. */
  chapterOrder: PlanChapterRank[];
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
  // Une notion n'a plus qu'UN texte depuis le 19/08/2026. La borne est
  // IMPORTÉE et non recopiée : une notion écrite par l'IA et une notion saisie
  // à la main sont la même chose, et deux nombres jumeaux finissent toujours
  // par diverger.
  title: z.string().trim().min(1).max(NOTION_TITLE_MAX),
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
  // ⚠️ **Aucune question générée n'est en « réponse unique »** (01/09/2026).
  // Le type n'est plus offert au modèle, mais un import ou un fournisseur sans
  // sortie contrainte peut encore l'envoyer : on le replie ici, une fois, plutôt
  // que de laisser un cas à traiter dans chaque consommateur. Rien n'est perdu —
  // une question à une seule bonne réponse s'affiche simplement en cases.
  return (parsed === 'qcs' ? 'qcm' : parsed) satisfies ResponseType;
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

/** Réglages de type, tels qu'une source extérieure peut les envoyer.
 *
 *  Deux formes sont acceptées pour les cases justes d'une grille, et ce n'est
 *  pas de la complaisance :
 *
 *    • `tableCorrect` — par ligne, les index des colonnes justes. C'est la forme
 *      DEMANDÉE au modèle (voir `wireSchema.ts`) : elle se lit à voix haute et
 *      ne se rate pas.
 *    • `tableChecked` — les clés « ligne-colonne » réellement stockées. C'est la
 *      forme qu'enverra un import qui recopie un atelier existant.
 *
 *  Les deux disent exactement la même chose : mapping fondé, donc réparation
 *  (règle en tête de fichier). Quand les deux sont là, `tableChecked` fait foi —
 *  c'est la forme native. */
const typeOptionsSchema = z
  .object({
    tableRows: z.array(z.string()).optional(),
    tableCols: z.array(z.string()).optional(),
    tableChecked: z.array(z.string()).optional(),
    tableCorrect: z.array(z.array(z.coerce.number().int().min(0))).optional(),
    tableUnique: z.boolean().optional(),
    tableShuffleRows: z.boolean().optional(),
    listNumbered: z.boolean().optional(),
    listExpected: z.coerce.number().int().min(1).optional(),
    matchSplit: z.coerce.number().min(MATCH_SPLIT_MIN).max(MATCH_SPLIT_MAX).optional(),
    fileTypes: z.array(z.string()).optional(),
    fileUrl: z.string().optional(),
  })
  .optional();

const questionSchema = z.object({
  // Un énoncé d'au moins un caractère — même règle qu'à la saisie manuelle
  // (décision du 19/08/2026, voir src/lib/workshops/questionIntegrity.ts).
  content: z.string().trim().min(1, { message: 'énoncé vide' }),
  responseType: responseTypeSchema,
  answer: z.string().default(''),
  choices: z.array(z.string()).default([]),
  correctChoices: z.array(z.number().int().min(0)).default([]),
  shuffleChoices: z.boolean().default(false),
  textLines: z.number().int().min(1).max(MAX_TEXT_LINES).default(4),
  expectations: z.string().default(''),
  /** Le niveau vit sur le lien vers la notion (28/08/2026) : une question peut
   *  faire restituer l'une et analyser l'autre. C'est la forme demandée au
   *  modèle (`wireSchema.ts`). */
  notions: z.array(z.object({ ref: refSchema, bloomLevel: bloomSchema })).default([]),
  /** L'ancienne forme — un niveau pour la question, une liste de références —
   *  reste acceptée. Le mapping est fondé (toutes les notions au niveau de la
   *  question), donc réparation et non rejet : un modèle qui répond dans la
   *  forme d'avant ne doit pas faire perdre tout un lot. Voir la règle en tête
   *  de fichier. */
  bloomLevel: bloomSchema.optional(),
  notionRefs: z.array(refSchema).optional(),
  // Réglages propres au type — voir `resolveQuestion` pour ce qui en est fait.
  typeOptions: typeOptionsSchema,
  /** matching — les paires déjà appariées, forme demandée au modèle. Converties
   *  en `choices` (« gauche :: droite ») par `resolveQuestion` : c'est
   *  l'encodage stocké, et le fabriquer soi-même est un piège qu'on n'a aucune
   *  raison de tendre à une source extérieure. */
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).optional(),
});

const groupSchema = z.object({
  ref: refSchema,
  /** ⚠️ **Le modèle ne le fournit PAS, et ne doit pas le fournir** (§8) : le
   *  contexte vient du bouton par lequel l'utilisateur est entré, et
   *  `wireSchema.ts` ne le demande donc dans aucune des deux formes de sortie.
   *  Il a pourtant été exigé ici jusqu'au 28/08/2026 — tous les groupes étaient
   *  écartés à la validation, quel que soit le fournisseur, et une génération
   *  n'écrivait plus une seule question. Les tests ne l'ont pas vu : leurs
   *  fixtures le posaient toutes.
   *
   *  Il reste accepté s'il arrive, et le repli vaut ce que vaut l'entrée la plus
   *  courante ; les deux passes de questions l'écrasent aussitôt après. */
  context: z.enum(['parcours', 'exam']).default('parcours'),
  // Au moins une question : un groupe vide n'a pas de sens et ne doit jamais
  // atteindre la base (même invariant que `fromGroup`, questionGroup.ts).
  questions: z.array(questionSchema).min(1, { message: 'groupe sans question' }),
});

const chapterRankSchema = z.object({
  ref: refSchema,
  rank: z.coerce.number().int().min(0),
  reason: z.string().trim().default(''),
});

// ─── Ce qu'un type de réponse exige pour fonctionner ─────────────────────────
//
// Chaque type porte sa réponse dans un champ différent, et plusieurs ne veulent
// rien dire sans leurs réglages. Une grille sans lignes ni colonnes n'est pas
// une grille « incomplète » : c'est un espace blanc que personne ne peut
// afficher, corriger, ni même réparer à la main sans tout ressaisir. La règle du
// fichier s'applique donc telle quelle — on répare ce qui a un mapping fondé
// (des index de colonnes en clés de cases, des paires en `choices`), on écarte
// ce qui ne peut pas exister.
//
// ⚠️ **Ici, l'unité écartée est la QUESTION, pas le groupe.** C'est le seul
// endroit du fichier où la distinction se pose : une grille vide au milieu d'un
// groupe de trois questions ne doit pas emporter les deux autres. Un groupe dont
// toutes les questions tombent est écarté à son tour — un groupe vide n'atteint
// jamais la base (invariant de `fromGroup`).

/** Une question du plan, RÉSOLUE : ses réglages sont ceux qui seront stockés, et
 *  la forme d'échange (`pairs`, `tableCorrect`) a disparu. C'est cette forme-là
 *  que voit l'écriture, jamais celle du fil. */
export type PlanQuestion = {
  content: string;
  responseType: ResponseType;
  answer: string;
  choices: string[];
  correctChoices: number[];
  shuffleChoices: boolean;
  textLines: number;
  expectations: string;
  /** Les notions travaillées, chacune avec le niveau que CETTE question demande
   *  d'elle. Seule forme du niveau : une question n'en a pas à elle. */
  notions: { ref: string; bloomLevel: 1 | 2 | 3 | 4 }[];
  typeOptions: QuestionTypeOptions;
};

type QuestionInput = z.infer<typeof questionSchema>;

type ResolvedQuestion = {
  question?: PlanQuestion;
  /** Conservée, mais corrigée — jamais en silence. */
  adjusted: string[];
  /** Écartée : avec ce qui a été fourni, ce type ne peut pas fonctionner. */
  discard?: string;
};

/** Les entrées non vides, débarrassées de leurs espaces. À réserver aux listes
 *  dont l'INDEX NE SIGNIFIE RIEN : filtrer les propositions d'un QCM décalerait
 *  `correctChoices` et changerait la bonne réponse. */
function nonEmpty(values: string[] | undefined): string[] {
  return (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
}

/** Met une question sur sa forme stockable, selon son type de réponse. */
export function resolveQuestion(raw: QuestionInput): ResolvedQuestion {
  const adjusted: string[] = [];
  const opts = raw.typeOptions ?? {};
  const notions = notionsOf(raw, adjusted);
  const type = raw.responseType;

  let choices: string[] = raw.choices;
  let correctChoices: number[] = raw.correctChoices;
  const typeOptions: QuestionTypeOptions = {};

  switch (type) {
    case 'qcm': {
      // Les propositions ne sont NI filtrées NI retriées : `correctChoices`
      // désigne des positions, et toute retouche de la liste déplacerait la
      // bonne réponse sans que rien ne le dise. Une proposition vide fait donc
      // tomber la question au lieu d'être discrètement retirée.
      if (raw.choices.length < 2) return { adjusted, discard: 'QCM à moins de deux propositions' };
      if (raw.choices.some((c) => !c.trim())) return { adjusted, discard: 'QCM à proposition vide' };

      // Le plafond coupe par la FIN, seul endroit où l'on sache que les index
      // de `correctChoices` restent valides pour tout ce qu'on garde.
      if (raw.choices.length > MAX_CHOICES) {
        adjusted.push(`plus de ${MAX_CHOICES} propositions — les suivantes sont retirées`);
        choices = raw.choices.slice(0, MAX_CHOICES);
      }

      const unique = [...new Set(raw.correctChoices)];
      const inside = unique.filter((i) => i < choices.length);
      if (inside.length < unique.length) adjusted.push('bonne réponse hors de la liste des propositions — retirée');
      if (inside.length === 0) return { adjusted, discard: 'QCM sans bonne réponse' };

      correctChoices = inside.sort((a, b) => a - b);
      break;
    }

    case 'liste': {
      // Pour une liste, `choices` porte les RÉPONSES ATTENDUES et non des
      // propositions à cocher : leur ordre est indifférent, filtrer les vides ne
      // casse donc rien.
      choices = nonEmpty(raw.choices);
      if (choices.length === 0) return { adjusted, discard: 'liste sans réponse attendue' };
      if (choices.length > MAX_LIST_ANSWERS) {
        adjusted.push(`plus de ${MAX_LIST_ANSWERS} réponses attendues — les suivantes sont retirées`);
        choices = choices.slice(0, MAX_LIST_ANSWERS);
      }
      correctChoices = [];
      typeOptions.listExpected = Math.max(1, Math.min(opts.listExpected ?? choices.length, choices.length));
      if (opts.listNumbered !== undefined) typeOptions.listNumbered = opts.listNumbered;
      break;
    }

    case 'matching': {
      // `pairs` d'abord (forme demandée au modèle), à défaut l'encodage stocké.
      const source = raw.pairs && raw.pairs.length > 0 ? raw.pairs : matchPairs(raw.choices);
      const pairs = source
        .map((p) => ({ left: (p.left ?? '').trim(), right: (p.right ?? '').trim() }))
        .filter((p) => p.left.length > 0 && p.right.length > 0);
      if (pairs.length < source.length) adjusted.push('paire à un seul côté — retirée');
      // Une seule paire n'est pas un exercice d'appariement : il n'y a rien à
      // choisir, la réponse est donnée par l'affichage.
      if (pairs.length < 2) return { adjusted, discard: 'mise en paires : moins de deux paires complètes' };
      if (pairs.length > MAX_PAIRS) {
        adjusted.push(`plus de ${MAX_PAIRS} paires — les suivantes sont retirées`);
        pairs.length = MAX_PAIRS;
      }

      choices = pairs.map((p) => toMatchChoice(p.left, p.right));
      correctChoices = [];
      if (opts.matchSplit !== undefined) typeOptions.matchSplit = opts.matchSplit;
      break;
    }

    case 'tableau': {
      const rows = nonEmpty(opts.tableRows);
      const cols = nonEmpty(opts.tableCols);
      if (rows.length === 0 || cols.length === 0) {
        return { adjusted, discard: 'tableau sans lignes ou sans colonnes' };
      }
      // Couper AVANT de relire les cases justes : `inside` les borne ensuite sur
      // la grille effectivement conservée.
      if (rows.length > MAX_TABLE_ROWS) {
        adjusted.push(`plus de ${MAX_TABLE_ROWS} lignes — les suivantes sont retirées`);
        rows.length = MAX_TABLE_ROWS;
      }
      if (cols.length > MAX_TABLE_COLS) {
        adjusted.push(`plus de ${MAX_TABLE_COLS} colonnes — les suivantes sont retirées`);
        cols.length = MAX_TABLE_COLS;
      }
      typeOptions.tableRows = rows;
      typeOptions.tableCols = cols;

      // `tableChecked` fait foi quand il est là : c'est la forme native.
      const declared = opts.tableChecked
        ? opts.tableChecked.map(parseTableCellKey).filter((c) => c !== null)
        : (opts.tableCorrect ?? []).flatMap((columns, row) => columns.map((col) => ({ row, col })));
      const inside = declared.filter((c) => c.row < rows.length && c.col < cols.length);
      if (inside.length < declared.length) adjusted.push('case juste hors de la grille — retirée');

      if (opts.tableUnique) {
        typeOptions.tableUnique = true;
        // Une seule case par ligne : les suivantes de la même ligne tombent.
        const kept = new Map<number, string>();
        for (const cell of inside) {
          if (!kept.has(cell.row)) kept.set(cell.row, tableCellKey(cell.row, cell.col));
        }
        if (kept.size < inside.length) adjusted.push('« une seule case par ligne » : cases en trop retirées');
        typeOptions.tableChecked = [...kept.values()];
      } else {
        typeOptions.tableChecked = [...new Set(inside.map((c) => tableCellKey(c.row, c.col)))];
      }

      // Toujours mélangées, comme les propositions d'un QCM : une grille dont
      // les lignes tombent dans l'ordre du cours se répond de mémoire.
      typeOptions.tableShuffleRows = true;
      choices = [];
      correctChoices = [];
      break;
    }

    case 'fichier': {
      const asked = nonEmpty(opts.fileTypes).map((f) => f.toLowerCase());
      const families = [...new Set(asked)].filter((f) => (FILE_TYPE_KEYS as readonly string[]).includes(f));
      if (families.length < new Set(asked).size) adjusted.push('format de fichier inconnu — retiré');
      // Aucun format demandé : on les accepte tous. C'est à l'auteur de
      // restreindre, pas à l'absence de consigne de tout fermer.
      typeOptions.fileTypes = families.length > 0 ? families : DEFAULT_FILE_TYPES;
      if (opts.fileUrl) typeOptions.fileUrl = opts.fileUrl;
      choices = [];
      correctChoices = [];
      break;
    }

    case 'textuelle':
    case 'dessin':
    case 'sans_reponse':
      // Ces trois-là n'ont ni proposition ni réglage : ce qui traînerait dans
      // `choices` viendrait d'un aller-retour entre types et n'aurait plus de
      // sens ici.
      choices = [];
      correctChoices = [];
      break;
  }

  return {
    adjusted,
    question: {
      content: raw.content,
      responseType: type,
      answer: raw.answer,
      choices,
      correctChoices,
      // ⚠️ **Imposé, jamais demandé au modèle** (01/09/2026). L'ordre dans lequel
      // il énumère ses propositions suit celui du cours, et la bonne réponse
      // tombe alors toujours au même endroit. C'est un réglage d'affichage : il
      // n'a rien à coûter de jetons, et rien à dépendre d'une réponse.
      shuffleChoices: type === 'qcm' ? true : raw.shuffleChoices,
      textLines: raw.textLines,
      expectations: raw.expectations,
      notions,
      typeOptions,
    },
  };
}

/** Les notions de la question, chacune avec son niveau — quelle que soit la
 *  forme reçue. La forme demandée fait foi ; l'ancienne (un niveau pour la
 *  question) est repliée dessus, ce qui est exactement ce qu'elle voulait dire.
 *  Un doublon de référence ne garde que son premier niveau : deux niveaux pour
 *  une même notion sur une même question n'ont pas de sens, et le lien est
 *  unique en base. */
function notionsOf(raw: QuestionInput, adjusted: string[]): { ref: string; bloomLevel: 1 | 2 | 3 | 4 }[] {
  const seen = new Map<string, 1 | 2 | 3 | 4>();
  for (const notion of raw.notions) if (!seen.has(notion.ref)) seen.set(notion.ref, notion.bloomLevel);

  const legacy = (raw.notionRefs ?? []).filter((ref) => !seen.has(ref));
  if (legacy.length > 0) {
    const level = raw.bloomLevel ?? DEFAULT_BLOOM_LEVEL;
    adjusted.push(
      `niveau de Bloom donné pour la question et non par notion : les ${legacy.length} notion(s) concernées prennent le niveau ${level}`,
    );
    for (const ref of legacy) seen.set(ref, level);
  }

  return [...seen].map(([ref, bloomLevel]) => ({ ref, bloomLevel }));
}

export type PlanChapterRank = z.infer<typeof chapterRankSchema>;
export type PlanChapter = z.infer<typeof chapterSchema>;
export type PlanAssignment = z.infer<typeof assignmentSchema>;
export type PlanNotion = z.infer<typeof notionSchema>;
/** Un groupe, ses questions déjà résolues (voir `resolveQuestion`). */
export type PlanGroup = {
  ref: string;
  context: 'parcours' | 'exam';
  questions: PlanQuestion[];
};

/** Le schéma du plan complet — utilisé tel quel comme **sortie contrainte** du
 *  modèle (le fournisseur ne peut alors produire que du conforme), et rejoué en
 *  validation à la réception. Deux usages, une seule définition. */
export const planSchema = z.object({
  chapters: z.array(chapterSchema).default([]),
  chapterOrder: z.array(chapterRankSchema).default([]),
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
    // ⚠️ **Corrigé, pas écarté** (29/08/2026). Le modèle redéclare volontiers
    // les chapitres qui existent déjà au lieu de se contenter de les citer :
    // sur un atelier de quatre chapitres, une mise à jour affichait
    // « Écarté (4) — référence en double » et laissait croire à une perte. Rien
    // n'est perdu — le chapitre existe, c'est le doublon qu'on ignore.
    if (chapterRefs.has(result.data.ref)) {
      adjusted.push({
        kind: 'chapter',
        ref: result.data.ref,
        reason: 'chapitre déjà présent — celui de l’atelier est conservé, le doublon ignoré',
      });
      continue;
    }
    chapterRefs.add(result.data.ref);
    chapters.push(result.data);
  }

  // 1 bis. L'ARCHITECTURE : le rang de chaque chapitre, 0 pour ceux que le
  //        cours ne couvre plus. Deux règles, et elles bornent tout ce que
  //        cette réponse peut détruire :
  //
  //        • la référence doit désigner un chapitre QUI EXISTE, ou un chapitre
  //          de cette même réponse. Une référence inventée ne situe rien ;
  //        • **le rang 0 n'est recevable que pour un chapitre existant.** Créer
  //          un chapitre puis l'écarter dans le même souffle n'a aucun sens, et
  //          ouvrirait un chemin où une référence neuve retire du programme.
  //
  //        Dans le doute on ne fait rien : écarter est une perte, ne pas
  //        écarter n'en est pas une.
  const chapterOrder: PlanChapterRank[] = [];
  const known = new Set<string>(existing.chapterIds ?? []);
  const fromThisPlan = new Set(chapters.map((c) => c.ref));
  const ranked = new Set<string>();
  for (const item of asArray(root.chapterOrder)) {
    const result = chapterRankSchema.safeParse(item);
    if (!result.success) {
      discarded.push({ kind: 'chapter', ref: refOf(item), reason: firstMessage(result.error) });
      continue;
    }
    const { ref, rank } = result.data;
    if (!known.has(ref) && !fromThisPlan.has(ref)) {
      discarded.push({ kind: 'chapter', ref, reason: 'chapitre inconnu dans l’ordre du programme — ignoré' });
      continue;
    }
    if (rank === 0 && !known.has(ref)) {
      discarded.push({ kind: 'chapter', ref, reason: 'un chapitre de cette réponse ne peut pas être écarté — ignoré' });
      continue;
    }
    if (ranked.has(ref)) continue;
    ranked.add(ref);
    chapterOrder.push(result.data);
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
    // Même raison que pour les chapitres : la notion existe, c'est le doublon
    // qu'on ignore. Rien n'est perdu, donc rien n'est « écarté ».
    if (notionRefs.has(notion.ref)) {
      adjusted.push({
        kind: 'notion',
        ref: notion.ref,
        reason: 'notion déjà présente — celle de l’atelier est conservée, le doublon ignoré',
      });
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

  // 4. Groupes de questions — et, dans chaque groupe, question par question.
  //
  //    Deux niveaux d’écart, et ils ne disent pas la même chose : la FORME du
  //    groupe est jugée d’un bloc (une clé en double, un groupe sans question),
  //    tandis qu’un type de réponse impossible à remplir n’écarte que SA
  //    question — voir `resolveQuestion`.
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

    const questions: PlanQuestion[] = [];
    for (const raw of group.questions) {
      const resolved = resolveQuestion(raw);
      for (const reason of resolved.adjusted) adjusted.push({ kind: 'question', ref: group.ref, reason });
      if (!resolved.question) {
        discarded.push({ kind: 'question', ref: group.ref, reason: resolved.discard ?? 'question inexploitable' });
        continue;
      }

      const unknown = resolved.question.notions.filter((n) => !notionRefs.has(n.ref));
      if (unknown.length > 0) {
        adjusted.push({
          kind: 'question',
          ref: group.ref,
          reason: `notion inconnue retirée (${unknown.map((n) => n.ref).join(', ')})`,
        });
        resolved.question.notions = resolved.question.notions.filter((n) => notionRefs.has(n.ref));
      }
      questions.push(resolved.question);
    }

    // Toutes les questions du groupe sont tombées : le groupe tombe avec elles.
    // Un groupe vide ne doit jamais atteindre la base (invariant de `fromGroup`),
    // et l’écart est déjà consigné question par question — inutile de le répéter.
    if (questions.length === 0) continue;

    groupRefs.add(group.ref);
    groups.push({ ref: group.ref, context: group.context, questions });
  }

  return { chapters, notions, assignments, groups, chapterOrder, discarded, adjusted };
}
