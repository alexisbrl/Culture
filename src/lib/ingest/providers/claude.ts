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
  existingContentBlock,
  notionsInstruction,
  questionsInstruction,
  systemPrompt,
  type ExistingContent,
  type ExistingScope,
} from '@/lib/ingest/prompt';
import { documentsForPass, shouldCacheDocuments } from '@/lib/ingest/passInput';
import { wireChaptersOutput, wireGroupsOutput, wireNotionsOutput } from '@/lib/ingest/wireSchema';

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

/** Le modèle voulu pour chaque passe. Haiku 4.5 partout : c'est l'hypothèse à
 *  tester, pas une conclusion (§16.20). */
export const PASS_MODELS: Record<IngestScope['pass'], ModelId> = {
  chapters: MODELS.haiku,
  notions: MODELS.haiku,
  questions: MODELS.haiku,
};

/** Le repli quand la fenêtre du modèle voulu ne suffit pas. Sonnet 5 et non
 *  Opus 5 : même fenêtre d'un million, trois fois moins cher en entrée. */
export const OVERSIZE_FALLBACK: ModelId = MODELS.sonnet;

/** (modèle souhaité, taille du corpus) → modèle retenu. **Fonction pure.**
 *
 *  On réserve `MAX_TOKENS` sur la fenêtre : elle porte l'entrée ET la sortie,
 *  et une réponse tronquée est une réponse perdue. Une taille inconnue se passe
 *  en `Infinity` — on bascule alors par prudence, un appel refusé coûtant un
 *  aller-retour pour rien. */
export function selectModel(wanted: ModelId, corpusTokens: number): ModelId {
  const usable = CONTEXT_WINDOW[wanted] - MAX_TOKENS;
  if (corpusTokens <= usable) return wanted;
  // Jamais d'escalade au-delà du repli : s'il ne suffit pas non plus, c'est le
  // corpus qui est hors normes, et le découpage séquentiel est un autre sujet.
  return OVERSIZE_FALLBACK;
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
      return chaptersInstruction(fileNames, scope.retry);
    case 'notions':
      return notionsInstruction(scope.chapter);
    case 'questions':
      return questionsInstruction({
        chapter: scope.chapter,
        notions: scope.notions,
        neighbours: scope.neighbours,
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
      return { pass: 'notions', chapterId: scope.chapter.id };
    case 'questions':
      return { pass: 'questions', notionIds: scope.notions.map((n) => n.id) };
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
      // Un appel par chapitre, tous sur les mêmes documents.
      return scope.plannedCalls ?? 1;
    case 'questions':
      // Aucun document depuis T3 : rien à mettre en cache.
      return 0;
  }
}

function outputSchemaFor(scope: IngestScope) {
  switch (scope.pass) {
    case 'chapters':
      return wireChaptersOutput;
    case 'notions':
      return wireNotionsOutput;
    case 'questions':
      return wireGroupsOutput;
  }
}

export type ClaudeProviderOptions = {
  apiKey?: string;
  /** Taille mesurée du corpus, en tokens (`messages.countTokens`). Absente, on
   *  la traite comme inconnue et on bascule par prudence sur le modèle à grande
   *  fenêtre : un appel refusé pour dépassement est un aller-retour perdu. */
  corpusTokens?: number;
  /** Modèle voulu par passe, pour pouvoir en essayer un autre sans toucher au
   *  code (§16.20). */
  models?: Partial<Record<IngestScope['pass'], ModelId>>;
};

export function createClaudeProvider(options: ClaudeProviderOptions | string = {}): PlanProvider {
  const opts = typeof options === 'string' ? { apiKey: options } : options;
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante');
  const client = new Anthropic({ apiKey });

  const wantedFor = (pass: IngestScope['pass']): ModelId => opts.models?.[pass] ?? PASS_MODELS[pass];

  return {
    name: 'claude',

    async prepare(documents: SourceDocument[]): Promise<PreparedDocument[]> {
      return Promise.all(
        documents.map(async (doc) => {
          const uploaded = await client.beta.files.upload({
            file: await toFile(Buffer.from(doc.bytes), doc.fileName, { type: doc.mimeType }),
            betas: [FILES_BETA],
          });
          return { key: doc.key, fileName: doc.fileName, mimeType: doc.mimeType, ref: uploaded.id };
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
      const sent = documentsForPass(scope.pass, documents);

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

      content.push({ type: 'text', text: existingContentBlock(existing, existingScopeFor(scope)) });
      content.push({ type: 'text', text: instructionFor(scope, sent.map((doc) => doc.fileName)) });

      // Une passe sans document ne lit rien du corpus : sa taille ne la contraint
      // pas, et Haiku y reste possible quelle que soit celle du cours.
      const wanted = wantedFor(scope.pass);
      const model = sent.length === 0 ? wanted : selectModel(wanted, opts.corpusTokens ?? Number.POSITIVE_INFINITY);
      if (model !== wanted) {
        // Trace demandée : la bascule est silencieuse sinon, et on croirait
        // mesurer Haiku alors qu'on mesure Sonnet.
        console.info(
          `[ingest] passe ${scope.pass} : ${wanted} écarté (corpus ${opts.corpusTokens ?? 'inconnu'} tokens), bascule sur ${model}`,
        );
      }
      const tuning = tuningFor(model);

      const stream = client.beta.messages.stream({
        model,
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
      });

      const message = await stream.finalMessage();

      const text = message.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        // Volontairement NON validé ici : `parsePlan` est le contrôle à la
        // réception, et il doit voir la sortie telle qu'elle est arrivée.
        plan: safeJson(text),
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
