// Implémentation Claude de `PlanProvider`.
//
// C'est le SEUL fichier du pipeline qui connaisse un fournisseur. Tout ce qui
// vient après — validation, résolution des références, écriture — l'ignore
// (docs/ai-ingestion-plan.md §4).
//
// ─── Les quatre choix d'appel, et pourquoi ───────────────────────────────────
//
// • **Files API** — le document est téléversé une fois puis référencé par son
//   identifiant. Sans elle, chaque passe renverrait le cours entier : le cache
//   de prompt évite de le *repayer* en tokens, jamais de le *renvoyer* en
//   octets.
// • **Cache de prompt** — posé sur le dernier bloc stable (les documents), donc
//   sur tout ce qui précède : système + documents. Ce qui varie d'un appel à
//   l'autre (l'existant de l'atelier, la consigne de la passe) vient APRÈS, et
//   ne casse donc pas le préfixe. TTL 1 h : une ingestion s'étale sur plusieurs
//   minutes, les 5 minutes par défaut ne suffiraient pas.
// • **Sortie structurée** — le modèle ne peut produire que du conforme au
//   schéma. `parsePlan` reste le contrôle à la réception : la contrainte porte
//   sur la génération, pas sur ce qu'on accepte d'écrire en base.
// • **Réflexion** — découper un cours en notions est un vrai travail de
//   raisonnement, pas une extraction mécanique. Sa forme dépend du modèle
//   retenu, et ce n'est pas cosmétique : voir `tuningFor`.

import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import {
  chaptersInstruction,
  userHintBlock,
  existingContentBlock,
  assignInstruction,
  notionsInstruction,
  examInstruction,
  questionsInstruction,
  systemPrompt,
  type ExistingContent,
  type ExistingScope,
} from '@/lib/ingest/prompt';
import { documentsForPass, shouldCacheDocuments } from '@/lib/ingest/passInput';
import {
  wireAssignmentsOutput,
  wireChaptersOutput,
  wireExamGroupsOutput,
  wireGroupsOutput,
  wireNotionsOutput,
} from '@/lib/ingest/wireSchema';

import type {
  IngestScope,
  PlanProvider,
  PreparedDocument,
  ProviderResult,
  SourceDocument,
} from './types';

const FILES_BETA = 'files-api-2025-04-14';

/** Généreux : une passe « questions » sur un gros chapitre produit un JSON long,
 *  et une réponse tronquée est une réponse perdue. Le streaming évite que ce
 *  plafond ne se paie en délai d'attente HTTP. */
const MAX_TOKENS = 32_000;

// ─── Le modèle, par passe ────────────────────────────────────────────────────
//
// Il était en dur (`claude-opus-5`) sur les trois passes. Deux raisons de le
// rendre paramétrable (§16.20) :
//
// 1. **Le gradient va à l'envers de l'intuition.** Le découpage en chapitres est
//    le jugement le plus structurant du pipeline — un mauvais découpage
//    empoisonne les deux passes suivantes — et il ne coûte qu'UN appel. Rédiger
//    des QCM de mémorisation sur une notion déjà extraite est la tâche la plus
//    mécanique et la plus répétée. Modèle fort là où c'est structurant et rare,
//    économique là où c'est mécanique et massif.
// 2. **La passe questions est dominée par la SORTIE**, pas l'entrée : 5 $/M sur
//    Haiku contre 25 $ sur Opus, soit ~15 $ contre ~76 $ sur 3 M de tokens
//    produits. C'est là que le choix de modèle rapporte le plus.
//
// Méthode arrêtée avec Alexis : Haiku 4.5 partout, on ne monte en gamme que là
// où il se révèle insuffisant.
//
// ─── Il s'est révélé insuffisant sur le programme (30/08/2026) ───────────────
//
// Le même cours passé deux fois a donné 125 notions d'un côté et 209 de l'autre.
// L'écart lui-même n'est pas le problème — c'est un découpage deux fois plus
// fin, pas du contenu inventé. Ce qui l'est : les doublons littéraux restés
// dans un atelier alors que la consigne demande explicitement de comparer les
// FAITS et non les phrases, les notions que le rangement laisse de côté sans
// rien en dire, et une granularité qui dérive jusqu'au détail sans intérêt.
// Trois défaillances de JUGEMENT, pas d'exécution.
//
// Les trois passes du programme montent donc sur Sonnet 5. Y compris les
// chapitres, malgré leur air de simple mise en boîtes : c'est la décision la
// plus structurante de la chaîne et elle ne coûte **qu'un appel** — le meilleur
// rapport qualité/prix du pipeline (point 1 ci-dessus, appliqué pour de bon).
//
// Les deux passes de questions restent sur Haiku : c'est là que le volume de
// sortie explose (point 2), et le résultat est jugé satisfaisant en l'état.
//
// Ordre de grandeur mesuré sur une génération complète : ~0,55 € en tout-Haiku,
// ~0,80 € dans la répartition ci-dessous, ~1,10 € en tout-Sonnet, ~2,80 € en
// tout-Opus. À ce niveau, le modèle se choisit sur la qualité ; la question du
// coût se rouvrira quand il y aura des utilisateurs.
//
// ⚠️ **Un seul changement à la fois.** La consigne d'extraction n'est pas
// retouchée en même temps, exprès : sans ça, on ne saurait pas à quoi
// attribuer la différence au prochain test.

export const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** ⚠️ **Fenêtre de contexte — contrainte DURE, sans rapport avec la qualité.**
 *  Un corpus qui dépasse la fenêtre ne donne pas un mauvais résultat : l'appel
 *  est purement **refusé**, et aucun réglage ne le contourne. Le corpus du
 *  22/08/2026 fait 680 000 tokens, soit 3,4× la fenêtre de Haiku. */
const CONTEXT_WINDOW: Record<ModelId, number> = {
  [MODELS.haiku]: 200_000,
  [MODELS.sonnet]: 1_000_000,
  [MODELS.opus]: 1_000_000,
};

/** Ce que la mesure du corpus NE COMPTE PAS, et qu'il faut donc lui réserver.
 *
 *  `countCorpus` mesure le socle système et les documents. L'appel réel de la
 *  passe chapitres porte en plus **tout le contexte de l'atelier** : ses
 *  chapitres, la consigne libre, et surtout **la liste de toutes ses notions**,
 *  qui est l'entrée principale de cette passe. Un titre pèse ~40 tokens ; au
 *  plafond de 2 000 notions par atelier, ça fait ~80 000 tokens que la mesure
 *  ignore. Sans cette réserve, un corpus déclaré « tout juste bon » ferait
 *  refuser l'appel — après téléversement, donc trop tard.
 *
 *  100 000 : les 80 000 du pire cas, plus de quoi loger chapitres et consigne. */
const WORKSHOP_CONTEXT_RESERVE = 100_000;

/** Le plus gros corpus qu'on sache LIRE, tous modèles confondus (25/08/2026).
 *
 *  Ce n'est pas un réglage de coût, c'est un mur : la plus grande fenêtre dont
 *  on dispose est d'un million de tokens, elle porte l'entrée ET la sortie.
 *  Deux réserves s'y taillent avant qu'on parle de corpus :
 *
 *    • `MAX_TOKENS` pour la réponse — **le raisonnement compris** : les tokens
 *      de réflexion sont prélevés sur ce budget, pas ajoutés à côté (voir
 *      `tuningFor`, dont le budget de réflexion reste inférieur à `max_tokens`) ;
 *    • `WORKSHOP_CONTEXT_RESERVE` pour ce que la mesure ne voit pas.
 *
 *  ⚠️ Il ne borne QUE la passe chapitres — la seule qui reçoive tout le corpus
 *  d'un coup. La passe notions travaille document par document, la fenêtre s'y
 *  applique par document ; les passes suivantes ne reçoivent aucun document. Le
 *  jour où le découpage séquentiel du cours existera, ce plafond tombera. */
export const MAX_CORPUS_TOKENS = 1_000_000 - MAX_TOKENS - WORKSHOP_CONTEXT_RESERVE;

/** Le modèle voulu pour chaque passe : Sonnet 5 sur le programme, Haiku 4.5 sur
 *  les questions (voir le bloc ci-dessus pour le pourquoi et les coûts). */
export const PASS_MODELS: Record<IngestScope['pass'], ModelId> = {
  chapters: MODELS.sonnet,
  notions: MODELS.sonnet,
  // Le rangement passait pour la tâche la plus mécanique du pipeline — croiser
  // une page et une liste de chapitres. À l'usage, c'en est une de jugement :
  // une notion que le modèle ne sait pas placer reste sans chapitre pour
  // toujours, personne ne la réexamine, et rien ne le signale. D'où Sonnet.
  assign: MODELS.sonnet,
  questions: MODELS.haiku,
  exam: MODELS.haiku,
};

/** Le repli quand la fenêtre du modèle voulu ne suffit pas. Sonnet 5 et non
 *  Opus 5 : même fenêtre d'un million, trois fois moins cher en entrée. */
export const OVERSIZE_FALLBACK: ModelId = MODELS.sonnet;

/** (modèle souhaité, taille du corpus) → modèle retenu. **Fonction pure.**
 *
 *  On réserve `MAX_TOKENS` sur la fenêtre : elle porte l'entrée ET la sortie,
 *  et une réponse tronquée est une réponse perdue.
 *
 *  N'est appelée que lorsque la taille est **connue**. Une taille inconnue ne
 *  passe plus par ici : on essaie le modèle voulu et on reprend sur
 *  `OVERSIZE_FALLBACK` si l'appel est refusé (voir `isContextWindowOverflow`). */
export function selectModel(wanted: ModelId, corpusTokens: number): ModelId {
  const usable = CONTEXT_WINDOW[wanted] - MAX_TOKENS;
  if (corpusTokens <= usable) return wanted;
  // Jamais d'escalade au-delà du repli : s'il ne suffit pas non plus, c'est le
  // corpus qui est hors normes, et le découpage séquentiel est un autre sujet.
  return OVERSIZE_FALLBACK;
}

/** Le modèle retenu pour UN appel, tout compris. **Fonction pure**, et le seul
 *  endroit où cette décision se prend.
 *
 *  Trois entrées, dans l'ordre où elles font autorité :
 *
 *  1. **Aucun document ⇒ le modèle voulu, sans condition.** Une passe qui ne
 *     porte pas les documents ne lit rien du corpus : sa fenêtre n'est pas en
 *     jeu. C'est le cas de la passe questions (`documentsForPass`), qui garde
 *     donc Haiku **même après** que le cours entier l'a fait refuser sur les
 *     passes précédentes — ce n'est pas un effet de bord, c'est la conséquence
 *     directe d'avoir cessé de lui envoyer les documents.
 *  2. **Un refus déjà constaté vaut mesure.** Il a coûté un aller-retour ; on
 *     ne le repaie pas, et il prime sur une taille estimée.
 *  3. **Taille connue ⇒ on tranche ; inconnue ⇒ on essaie.** Renoncer d'avance
 *     sur une taille inconnue revenait à n'utiliser Haiku jamais, la mesure
 *     étant toujours absente (voir `isContextWindowOverflow`). */
export function modelForCall(
  wanted: ModelId,
  documentCount: number,
  corpusTokens?: number,
  oversize: readonly ModelId[] = [],
): ModelId {
  if (documentCount === 0) return wanted;
  if (oversize.includes(wanted)) return OVERSIZE_FALLBACK;
  if (corpusTokens === undefined) return wanted;
  return selectModel(wanted, corpusTokens);
}

/** Le seul refus qui justifie de reprendre sur un modèle à plus grande fenêtre :
 *  le corpus ne tient pas dans celle du modèle essayé. **Fonction pure.**
 *
 *  Volontairement étroite. Un `400` veut dire « requête invalide », ce qui
 *  recouvre aussi bien un corpus trop gros qu'une erreur de notre part — et
 *  `tuningFor` documente précisément une de ces erreurs : la forme de réflexion
 *  d'Opus envoyée à Haiku est refusée sur **tous** les appels. Reprendre sur
 *  n'importe quel `400` ferait donc passer chaque import sur Sonnet en silence,
 *  en donnant l'apparence du bon fonctionnement. On ne reconnaît que la fenêtre,
 *  et tout le reste remonte.
 *
 *  Les formulations acceptées sont celles de l'API (« prompt is too long: 285000
 *  tokens > 200000 maximum », « input length and max_tokens exceed context
 *  limit »). Si elles changent, le repli cesse d'agir et l'erreur remonte
 *  telle quelle : on perd la reprise, jamais la vérité. */
export function isContextWindowOverflow(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError) || error.status !== 400) return false;
  const text = String(error.message ?? '').toLowerCase();
  if (text.includes('prompt is too long')) return true;
  if (text.includes('exceed') && text.includes('context')) return true;
  return text.includes('context') && text.includes('too long');
}

/** Les réglages d'appel dépendent du modèle, et pas cosmétiquement.
 *
 *  ⚠️ **Haiku 4.5 est antérieur à la réflexion adaptative** : `output_config.effort`
 *  y est **refusé (400)**, et la réflexion s'y règle par `budget_tokens`, qui doit
 *  rester inférieur à `max_tokens`. Envoyer à Haiku la forme utilisée pour Opus
 *  ferait échouer **tous** les appels, pas seulement les gros. */
function tuningFor(model: ModelId): {
  thinking: Anthropic.Beta.BetaThinkingConfigParam;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
} {
  if (model === MODELS.haiku) {
    return { thinking: { type: 'enabled', budget_tokens: 8_000 } };
  }
  return { thinking: { type: 'adaptive' }, effort: 'high' };
}

function instructionFor(scope: IngestScope, fileNames: string[]): string {
  switch (scope.pass) {
    case 'chapters':
      // Les noms de fichiers sont dans la consigne, pas seulement dans les blocs
      // `document` : c'est là que le modèle peut apprendre qu'ils forment un
      // seul cours (§16.15).
      return chaptersInstruction(fileNames, scope.notions, scope.retry);
    case 'notions':
      return notionsInstruction(scope.document);
    case 'assign':
      return assignInstruction({
        notions: scope.notions,
        chapters: scope.chapters,
        similar: scope.similar,
      });
    case 'questions':
      return questionsInstruction({
        chapter: scope.chapter,
        workshop: scope.workshop,
        notions: scope.notions.map((n) => ({ ...n, missing: scope.missing?.[n.id] })),
        neighbours: scope.neighbours,
        budget: scope.budget,
      });
    case 'exam':
      return examInstruction({
        workshop: scope.workshop,
        chapters: scope.chapters,
        budget: scope.budget,
      });
  }
}

/** La portée de la passe, traduite en portée du bloc « existant » (§16.3). Le
 *  fournisseur est le seul à connaître les deux formes : le prompt ignore les
 *  documents, la passe ignore le rendu. */
function existingScopeFor(scope: IngestScope): ExistingScope {
  switch (scope.pass) {
    case 'chapters':
      return { pass: 'chapters' };
    case 'notions':
      return { pass: 'notions' };
    case 'assign':
      return { pass: 'assign' };
    case 'questions':
      return { pass: 'questions', notionIds: scope.notions.map((n) => n.id) };
    case 'exam':
      // La liste d'examen ENTIÈRE, et non les questions des notions de la
      // tranche : une question d'examen croise plusieurs notions, et la tranche
      // suivante piochera dans les mêmes chapitres. Le chargeur
      // (`loadExamQuestions`) rend déjà exactement ce qu'il faut — la portée ne
      // doit donc rien retirer de plus.
      return { pass: 'exam' };
  }
}

/** Combien d'appels partagent les mêmes documents, pour cette passe.
 *
 *  ⚠️ Rappel de §16.22 : un préfixe trop court ne se met **pas** en cache, et
 *  sans erreur — 4 096 tokens minimum sur Haiku 4.5, 1 024 sur Sonnet 5. Un
 *  marqueur posé sur un petit corpus peut donc n'avoir aucun effet. */
function documentUsesOf(scope: IngestScope): number {
  switch (scope.pass) {
    case 'chapters':
      // Un seul appel sur ce préfixe (deux si relance, mais on ne le sait pas
      // d'avance et une relance reste l'exception).
      return 1;
    case 'notions':
      // Un appel par DOCUMENT, et chacun ne porte que le sien : aucun préfixe
      // commun, donc rien à relire. Le corpus part une fois en tout.
      return 1;
    case 'assign':
    case 'questions':
    case 'exam':
      // Aucun document : rien à mettre en cache.
      return 0;
  }
}

function outputSchemaFor(scope: IngestScope) {
  switch (scope.pass) {
    case 'chapters':
      return wireChaptersOutput;
    case 'notions':
      return wireNotionsOutput;
    case 'assign':
      return wireAssignmentsOutput;
    case 'questions':
      return wireGroupsOutput;
    // Deux types de plus à l'examen — le dépôt de fichier et l'énoncé sans
    // réponse attendue, qui supposent tous deux un correcteur humain
    // (EXAM_RESPONSE_TYPES).
    case 'exam':
      return wireExamGroupsOutput;
  }
}

export type ClaudeProviderOptions = {
  apiKey?: string;
  /** Taille mesurée du corpus, en tokens. Absente, on ne renonce pas au modèle
   *  voulu : on l'essaie, et on ne bascule que si la fenêtre est réellement
   *  dépassée. En pratique elle est toujours absente depuis le retrait de
   *  l'estimation de coût — le comptage de tokens n'accepte pas les documents
   *  désignés par `file_id`. Le paramètre reste : il évite un aller-retour
   *  perdu le jour où une mesure fiable existera. */
  corpusTokens?: number;
  /** Modèle voulu par passe, pour pouvoir en essayer un autre sans toucher au
   *  code (§16.20). */
  models?: Partial<Record<IngestScope['pass'], ModelId>>;
  /** Modèles dont la fenêtre s'est **déjà** révélée trop petite pour ce corpus,
   *  lors d'un appel précédent du même import. Un refus est une mesure : une
   *  fois qu'on l'a payé, on ne le repaie pas. Sans ça, chaque appel de la passe
   *  notions (une server action par chapitre, donc un fournisseur neuf à chaque
   *  fois) redemanderait à Haiku un corpus dont on sait déjà qu'il ne rentre
   *  pas — un aller-retour perdu par chapitre. */
  oversizeModels?: readonly ModelId[];
  /** Consigne libre écrite par l'utilisateur dans le dialogue. Posée en tête de
   *  la consigne de CHAQUE passe : elle peut porter sur le découpage comme sur
   *  la façon de rédiger les notions ou les questions. */
  userHint?: string;
  /** Appelé quand un modèle vient de refuser le corpus faute de fenêtre.
   *  L'appelant décide quoi en faire — le fournisseur, lui, ne connaît pas la
   *  base. `run.ts` s'en sert pour l'écrire dans le lot d'import. */
  onOversize?: (model: ModelId) => void | Promise<void>;
};

export function createClaudeProvider(options: ClaudeProviderOptions | string = {}): PlanProvider {
  const opts = typeof options === 'string' ? { apiKey: options } : options;
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante');
  const client = new Anthropic({ apiKey });

  const wantedFor = (pass: IngestScope['pass']): ModelId => opts.models?.[pass] ?? PASS_MODELS[pass];

  // Enrichi en cours de route par les refus de CE fournisseur, en plus de ceux
  // que l'appelant a retrouvés du lot d'import.
  const oversize = new Set<ModelId>(opts.oversizeModels ?? []);

  return {
    name: 'claude',

    async prepare(documents: SourceDocument[]): Promise<PreparedDocument[]> {
      return Promise.all(
        documents.map(async (doc) => {
          const uploaded = await client.beta.files.upload({
            file: await toFile(Buffer.from(doc.bytes), doc.fileName, { type: doc.mimeType }),
            betas: [FILES_BETA],
          });
          return { fileId: doc.fileId, key: doc.key, fileName: doc.fileName, mimeType: doc.mimeType, ref: uploaded.id };
        }),
      );
    },

    async release(documents: PreparedDocument[]): Promise<void> {
      // En parallèle : ce sont des suppressions indépendantes, gratuites, et on
      // ne veut pas allonger une annulation de N allers-retours séquentiels.
      await Promise.all(documents.map((doc) => client.beta.files.delete(doc.ref, { betas: [FILES_BETA] })));
    },

    // ⚠️ TEMPORAIRE — phase de test (voir `src/lib/ingest/cost.ts`).
    async countCorpus(documents: PreparedDocument[]): Promise<number | null> {
      if (documents.length === 0) return 0;
      try {
        // Compté avec le modèle de la passe chapitres : c'est celle qui lit tout
        // le corpus, et donc celle dont la fenêtre décide de la bascule.
        const counted = await client.beta.messages.countTokens({
          model: wantedFor('chapters'),
          betas: [FILES_BETA],
          system: [{ type: 'text', text: systemPrompt() }],
          messages: [
            {
              role: 'user',
              content: documents.map((doc) => ({
                type: 'document' as const,
                source: { type: 'file' as const, file_id: doc.ref },
                title: doc.fileName,
              })),
            },
          ],
        });
        return counted.input_tokens;
      } catch (error) {
        // Un comptage raté ne doit jamais empêcher une ingestion : on l'annonce
        // comme inconnu, la bascule de modèle jouera par prudence.
        console.warn('[ingest] comptage du corpus impossible :', error instanceof Error ? error.message : error);
        return null;
      }
    },

    async documentToPlan(
      documents: PreparedDocument[],
      existing: ExistingContent,
      scope: IngestScope,
    ): Promise<ProviderResult> {
      // Dernière barrière avant la facture : la passe questions ne reçoit aucun
      // document, quoi qu'on lui passe (§16.3). Sans documents, aucun bloc
      // `document` n'est posé — donc aucun marqueur de cache non plus.
      const sent = documentsForPass(scope.pass, documents, scope.pass === 'notions' ? scope.document.index : undefined);

      // Poser un marqueur sur un contenu jamais relu coûte 25 % de plus que ne
      // rien poser (§16.17). On ne le pose donc que si les mêmes documents
      // servent à plus d'un appel — en pratique, la passe notions d'un import à
      // plusieurs chapitres.
      const cacheable = shouldCacheDocuments(documentUsesOf(scope));

      // ⚠️ ORDRE CRITIQUE. Le cache est un préfixe : les documents d'abord (le
      // même à chaque appel), l'existant et la consigne ensuite. Inverser
      // reviendrait à ne jamais toucher le cache.
      const content: Anthropic.Beta.BetaContentBlockParam[] = sent.map((doc, i) => ({
        type: 'document',
        source: { type: 'file', file_id: doc.ref },
        title: doc.fileName,
        // Le marqueur ne va que sur le DERNIER document : il met en cache tout
        // ce qui le précède, système compris. TTL par défaut (5 minutes) : le
        // TTL d'une heure se justifiait quand une ingestion s'étalait sur des
        // dizaines d'appels sur le même cours, et son écriture coûte 2× l'entrée
        // au lieu de 1,25× (§16.16).
        ...(cacheable && i === sent.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));

      // ⚠️ **Un bloc de texte VIDE fait échouer l'appel entier**, avec un 400
      // « text content blocks must be non-empty » que rien ne rattrape — l'API
      // les refuse, elle ne les ignore pas. Le cas n'est pas théorique : la passe
      // RANGEMENT n'a par construction rien à mettre dans le bloc « ce qui
      // existe déjà » (ses notions et ses chapitres voyagent dans sa consigne,
      // les répéter doublerait la facture), si bien qu'elle échouait à tous les
      // coups — donc tout import qui range des notions (29/08/2026).
      //
      // Le filtre est posé ici, à l'endroit où les blocs sont assemblés, et non
      // dans `existingContentBlock` : c'est la liste envoyée qui doit être
      // valide, quelle que soit la raison pour laquelle un bloc est vide.
      const existingBlock = existingContentBlock(existing, existingScopeFor(scope));
      if (existingBlock.trim()) content.push({ type: 'text', text: existingBlock });
      // ⚠️ La consigne de l'utilisateur est collée en tête de l'instruction, donc
      // APRÈS le marqueur de cache : elle varie d'un import à l'autre et n'a
      // rien à faire dans le préfixe stable (voir l'en-tête de `prompt.ts`).
      const instructionBlock = userHintBlock(opts.userHint) + instructionFor(scope, sent.map((doc) => doc.fileName));
      if (instructionBlock.trim()) content.push({ type: 'text', text: instructionBlock });

      const wanted = wantedFor(scope.pass);
      // Taille connue : on tranche sans appeler (fonction pure, gratuite).
      // Taille inconnue : on **essaie** le modèle voulu au lieu de renoncer.
      // C'est l'inverse du choix initial, et pour une raison mesurée : la taille
      // était TOUJOURS inconnue (le comptage de tokens n'accepte pas les
      // documents désignés par `file_id`, cf. le retrait de l'estimation de coût
      // le 22/08/2026), si bien que la prudence s'appliquait à tous les imports
      // et que le « Haiku partout » de PASS_MODELS n'était jamais respecté sur
      // les passes qui portent les documents. Le prix d'un essai raté est **un
      // aller-retour**, pas des tokens : un dépassement de fenêtre est refusé
      // avant toute inférence, et les documents sont déjà chez le fournisseur,
      // donc la requête refusée ne transporte que des identifiants.
      const model = modelForCall(wanted, sent.length, opts.corpusTokens, [...oversize]);
      if (model !== wanted) {
        // Trace demandée : la bascule est silencieuse sinon, et on croirait
        // mesurer Haiku alors qu'on mesure Sonnet.
        const cause = oversize.has(wanted) ? 'refus déjà constaté' : `corpus ${opts.corpusTokens} tokens`;
        console.info(`[ingest] passe ${scope.pass} : ${wanted} écarté (${cause}), bascule sur ${model}`);
      }

      const call = (id: ModelId) => {
        const tuning = tuningFor(id);
        return client.beta.messages.stream({
          model: id,
          max_tokens: MAX_TOKENS,
          betas: [FILES_BETA],
          system: [{ type: 'text', text: systemPrompt() }],
          thinking: tuning.thinking,
          output_config: {
            // `effort` est absent sur Haiku 4.5 : il y est refusé (voir `tuningFor`).
            ...(tuning.effort ? { effort: tuning.effort } : {}),
            format: zodOutputFormat(outputSchemaFor(scope)),
          },
          messages: [{ role: 'user', content }],
        }).finalMessage();
      };

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await call(model);
      } catch (error) {
        // **Un seul motif de reprise, et il est étroit : la fenêtre.** Ne jamais
        // élargir aux 400 en général — `tuningFor` documente qu'une mauvaise
        // forme de réflexion envoyée à Haiku est refusée sur *tous* les appels,
        // gros comme petits ; un repli sur 400 quelconque masquerait ce bug en
        // faisant passer chaque import sur Sonnet sans que rien ne le dise.
        if (model === OVERSIZE_FALLBACK || !isContextWindowOverflow(error)) throw error;
        console.info(
          `[ingest] passe ${scope.pass} : ${model} a refusé le corpus (fenêtre dépassée), reprise sur ${OVERSIZE_FALLBACK}`,
        );
        // Retenu tout de suite, et pour tout le lot : les appels suivants iront
        // droit au repli. Une écriture ratée ne coûte que des allers-retours
        // perdus — jamais l'import, qui continue.
        oversize.add(model);
        try {
          await opts.onOversize?.(model);
        } catch (err) {
          console.warn('[ingest] refus de fenêtre non mémorisé :', err instanceof Error ? err.message : err);
        }
        message = await call(OVERSIZE_FALLBACK);
      }

      const text = message.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        // Volontairement NON validé ici : `parsePlan` est le contrôle à la
        // réception, et il doit voir la sortie telle qu'elle est arrivée.
        plan: safeJson(text),
        // Même mesure que chez DeepSeek : une réponse arrêtée par le plafond de
        // sortie rend un JSON incomplet, donc perdu. On le dit.
        truncated: message.stop_reason === 'max_tokens',
        usage: {
          inputTokens: message.usage.input_tokens ?? 0,
          outputTokens: message.usage.output_tokens ?? 0,
          cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
          cachedTokens: message.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

/** Une sortie illisible ne doit pas faire tomber l'ingestion par une exception
 *  de bas niveau : elle devient un plan vide, que `parsePlan` traitera comme
 *  tel — plan vide, journal d'écarts, et l'utilisateur voit qu'il n'a rien
 *  obtenu plutôt qu'une pile d'erreur. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
