// Implémentation DeepSeek de `PlanProvider` — **les passes de QUESTIONS
// uniquement** : l'entraînement et l'examen, qui ne lisent que des notions.
//
// ─── Pourquoi seulement celles-là ────────────────────────────────────────────
//
// Claude lit un PDF nativement : chaque page lui part en image en plus du texte,
// ce qui préserve tableaux, schémas et encadrés. DeepSeek n'a pas d'équivalent —
// ni lecture de PDF, ni stockage de fichiers. L'y porter supposerait d'extraire
// nous-mêmes le texte et d'aplatir tout ce qui n'est pas du texte : sur un cours
// de SVT ou d'histoire, ce sont précisément les schémas et les cartes qui
// portent la matière.
//
// Les passes de questions, elles, **ne reçoivent aucun document** (`documentsForPass`) :
// elle travaille sur des notions déjà extraites, c'est-à-dire du texte court.
// Rien ne s'y perd. Et c'est la passe la plus répétée du pipeline — un appel par
// lot de dix notions — donc celle où le prix unitaire compte le plus. On gagne
// donc sur le poste dominant sans rien concéder à la lecture (choix du
// 22/08/2026).
//
// Toute autre passe est **refusée explicitement** plutôt que servie dégradée :
// un fournisseur qui accepterait une passe qu'il ne sait pas faire produirait un
// programme silencieusement amputé.

import { z } from 'zod';

import {
  existingContentBlock,
  examInstruction,
  questionsInstruction,
  systemPrompt,
  userHintBlock,
  type ExistingContent,
} from '@/lib/ingest/prompt';
import { wireExamGroupsOutput, wireGroupsOutput } from '@/lib/ingest/wireSchema';

import type { IngestScope, PlanProvider, PreparedDocument, ProviderResult } from './types';

const API_URL = 'https://api.deepseek.com/chat/completions';

/** `deepseek-chat` et non `deepseek-reasoner` : rédiger des questions sur une
 *  notion déjà extraite est une tâche de production, pas de raisonnement long.
 *  Le modèle de raisonnement coûterait sa réflexion sur chacun des ~10 lots d'un
 *  import, pour un gain qui n'est pas établi. */
export const DEEPSEEK_MODEL = 'deepseek-chat';

/** Même plafond que côté Claude : un lot de dix notions à la volumétrie cible
 *  produit un JSON long, et une réponse tronquée est une réponse perdue. */
const MAX_TOKENS = 8_192;

/** La forme attendue, **dérivée du schéma Zod** et non recopiée à la main.
 *
 *  DeepSeek n'a pas de sortie structurée au sens d'Anthropic : son mode JSON
 *  garantit du JSON *valide*, pas du JSON *conforme*. La forme doit donc être
 *  décrite dans le prompt — et la dériver de `wireGroupsOutput` est ce qui
 *  empêche les deux de diverger le jour où le schéma bouge. `parsePlan` reste
 *  de toute façon le contrôle à la réception, exactement comme chez Claude. */
function shapeBlock(pass: 'questions' | 'exam'): string {
  // L'examen ouvre deux types de réponse de plus (EXAM_RESPONSE_TYPES). Servir
  // la même forme aux deux passes les lui cachait, là où Claude les reçoit.
  const schema = z.toJSONSchema(pass === 'exam' ? wireExamGroupsOutput : wireGroupsOutput, { io: 'output' });
  return `Réponds en JSON, et uniquement en JSON. Il doit valider ce schéma :

${JSON.stringify(schema, null, 2)}

Aucun texte avant ou après le JSON.`;
}

type DeepSeekOptions = {
  apiKey?: string;
  model?: string;
  /** Consigne libre de l'utilisateur, posée en tête comme chez Claude. */
  userHint?: string;
};

function unsupported(what: string): never {
  throw new Error(
    `DeepSeek ne sert que la passe questions : ${what} suppose de lire les documents, ce qu'il ne sait pas faire.`,
  );
}

export function createDeepSeekProvider(options: DeepSeekOptions = {}): PlanProvider {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY manquante');
  const model = options.model ?? DEEPSEEK_MODEL;

  return {
    name: 'deepseek',

    // Les trois opérations liées aux documents n'ont pas de sens ici. Elles
    // lèvent au lieu de renvoyer du vide : un appelant qui se tromperait de
    // fournisseur doit s'en apercevoir tout de suite, pas produire un import
    // sans chapitres et se demander pourquoi.
    async prepare(): Promise<PreparedDocument[]> {
      return unsupported('le téléversement des documents');
    },
    async countCorpus(): Promise<number | null> {
      return null;
    },
    async release(): Promise<void> {
      // Rien à rendre : ce fournisseur n'a jamais rien reçu.
    },

    async documentToPlan(
      documents: PreparedDocument[],
      existing: ExistingContent,
      scope: IngestScope,
    ): Promise<ProviderResult> {
      // Les deux passes de questions — entraînement et examen — travaillent sur
      // des notions déjà extraites, jamais sur le cours. Toutes les autres
      // supposent de lire les documents.
      if (scope.pass !== 'questions' && scope.pass !== 'exam') return unsupported(`la passe ${scope.pass}`);
      if (documents.length > 0) return unsupported('un appel portant des documents');

      const instruction =
        scope.pass === 'exam'
          ? examInstruction({
              workshop: scope.workshop,
              chapters: scope.chapters,
              budget: scope.budget,
            })
          : questionsInstruction({
              chapter: scope.chapter,
              workshop: scope.workshop,
              notions: scope.notions.map((n) => ({ ...n, missing: scope.missing?.[n.id] })),
              neighbours: scope.neighbours,
              budget: scope.budget,
            });

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          // Le mode JSON de DeepSeek exige que le prompt mentionne « json » —
          // `shapeBlock` le fait, et c'est aussi lui qui porte la forme.
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt() },
            {
              role: 'user',
              content: [
                userHintBlock(options.userHint),
                existingContentBlock(
                  existing,
                  scope.pass === 'exam'
                    ? { pass: 'exam' }
                    : { pass: 'questions', notionIds: scope.notions.map((n) => n.id) },
                ),
                instruction,
                shapeBlock(scope.pass),
              ].join('\n\n'),
            },
          ],
        }),
      });

      if (!response.ok) {
        // Le corps porte le motif réel (quota, clé, modèle inconnu) : le perdre
        // ferait d'une erreur diagnosticable un « 400 » opaque.
        const body = await response.text().catch(() => '');
        throw new Error(`DeepSeek ${response.status} : ${body.slice(0, 400)}`);
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
      };
      const text = payload.choices?.[0]?.message?.content ?? '';

      return {
        // Volontairement NON validé ici : `parsePlan` est le contrôle à la
        // réception, et il doit voir la sortie telle qu'elle est arrivée.
        plan: safeJson(text),
        usage: {
          inputTokens: payload.usage?.prompt_tokens ?? 0,
          outputTokens: payload.usage?.completion_tokens ?? 0,
          // DeepSeek met en cache tout seul, sans marqueur à poser : il n'y a
          // donc jamais d'écriture de cache à facturer, seulement des lectures.
          cacheCreationTokens: 0,
          cachedTokens: payload.usage?.prompt_cache_hit_tokens ?? 0,
        },
      };
    },
  };
}

/** Une réponse illisible ne doit pas lever ici : `parsePlan` sait déjà écarter
 *  un plan informe et le dire, alors qu'une exception ferait échouer le lot
 *  entier sans laisser de motif. */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
