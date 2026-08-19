// La frontière d'abstraction entre l'application et le fournisseur de modèle.
//
// ─── Ce qu'on isole n'est PAS « appeler un modèle » ──────────────────────────
//
// Changer de fournisseur n'est pas un changement d'URL (§4 du plan). Claude lit
// un PDF nativement — chaque page lui est envoyée comme IMAGE en plus du texte,
// ce qui préserve tableaux, schémas et encadrés qu'une extraction texte aplatit.
// Un fournisseur sans lecture PDF devra soit extraire le texte (et perdre les
// tableaux), soit rendre les pages en images pour un modèle de vision.
//
// La frontière utile est donc « transformer un document en plan », pas « envoyer
// un message ». Tout ce qui vient après — validation, résolution des références,
// écriture — est identique quel que soit le fournisseur, parce que le contrat de
// sortie (`planSchema.ts`) est défini indépendamment de lui.
//
// Trajectoire prévue : Claude, puis DeepSeek (coût), puis modèles open-source
// auto-hébergés.

import type { ExistingContent } from '@/lib/ingest/prompt';

/** Un document source, déjà lu depuis le stockage de l'atelier. */
export type SourceDocument = {
  /** Clé de stockage (`workshop_files.storage_path`), pour la traçabilité. */
  key: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

/** Ce qu'on demande au modèle. Une passe à la fois : on ne lui fait jamais
 *  produire le programme entier d'un coup (§5.1). */
export type IngestScope =
  | { pass: 'chapters' }
  | { pass: 'notions'; chapter: { id: string; name: string } }
  | {
      pass: 'questions';
      chapter: { id: string; name: string };
      notions: { id: string; title: string }[];
      budget: number;
    };

/** Ce que rend un fournisseur : la sortie brute — **non validée**, c'est le rôle
 *  de `parsePlan` — et ce que l'appel a coûté. */
export type ProviderResult = {
  plan: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Tokens servis par le cache de prompt. À zéro d'un appel à l'autre, un
     *  invalidateur silencieux traîne dans le préfixe (§5.2). */
    cachedTokens: number;
  };
};

export type PlanProvider = {
  /** Nom court, pour la journalisation et le suivi de coût. */
  readonly name: string;
  documentToPlan(
    documents: SourceDocument[],
    existing: ExistingContent,
    scope: IngestScope,
  ): Promise<ProviderResult>;
};
