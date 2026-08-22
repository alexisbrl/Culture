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
// • **Réflexion adaptative + effort élevé** — découper un cours en notions est
//   un vrai travail de raisonnement, pas une extraction mécanique.

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
import { documentsForPass } from '@/lib/ingest/passInput';
import { wireChaptersOutput, wireGroupsOutput, wireNotionsOutput } from '@/lib/ingest/wireSchema';

import type {
  IngestScope,
  PlanProvider,
  PreparedDocument,
  ProviderResult,
  SourceDocument,
} from './types';

const MODEL = 'claude-opus-5';
const FILES_BETA = 'files-api-2025-04-14';

/** Généreux : une passe « questions » sur un gros chapitre produit un JSON long,
 *  et une réponse tronquée est une réponse perdue. Le streaming évite que ce
 *  plafond ne se paie en délai d'attente HTTP. */
const MAX_TOKENS = 32_000;

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

export function createClaudeProvider(apiKey = process.env.ANTHROPIC_API_KEY): PlanProvider {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante');
  const client = new Anthropic({ apiKey });

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

    async documentToPlan(
      documents: PreparedDocument[],
      existing: ExistingContent,
      scope: IngestScope,
    ): Promise<ProviderResult> {
      // Dernière barrière avant la facture : la passe questions ne reçoit aucun
      // document, quoi qu'on lui passe (§16.3). Sans documents, aucun bloc
      // `document` n'est posé — donc aucun marqueur de cache non plus.
      const sent = documentsForPass(scope.pass, documents);

      // ⚠️ ORDRE CRITIQUE. Le cache est un préfixe : les documents d'abord (le
      // même à chaque appel), l'existant et la consigne ensuite. Inverser
      // reviendrait à ne jamais toucher le cache.
      const content: Anthropic.Beta.BetaContentBlockParam[] = sent.map((doc, i) => ({
        type: 'document',
        source: { type: 'file', file_id: doc.ref },
        title: doc.fileName,
        // Le marqueur ne va que sur le DERNIER document : il met en cache tout
        // ce qui le précède, système compris.
        ...(i === sent.length - 1 ? { cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } } : {}),
      }));

      content.push({ type: 'text', text: existingContentBlock(existing, existingScopeFor(scope)) });
      content.push({ type: 'text', text: instructionFor(scope, sent.map((doc) => doc.fileName)) });

      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: [FILES_BETA],
        system: [{ type: 'text', text: systemPrompt() }],
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
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
