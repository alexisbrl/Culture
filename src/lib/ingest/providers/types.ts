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

/** Un document **déjà remis au fournisseur**, désigné par une poignée opaque.
 *
 *  C'est ce qui permet de ne téléverser qu'une fois : une ingestion enchaîne un
 *  appel pour les chapitres puis deux par chapitre, et sans cette étape le cours
 *  repartirait en entier à chaque fois. Le cache de prompt évite de le *repayer*
 *  en tokens, jamais de le *renvoyer* en octets — sur un cours de 25 Mo et douze
 *  chapitres, la différence est de l'ordre de 600 Mo téléversés.
 *
 *  `ref` est **opaque** : un identifiant de fichier chez Claude, autre chose
 *  ailleurs. L'appelant ne l'interprète pas, il se contente de le conserver
 *  (`ai_imports.file_ids`) pour que les passes suivantes le réutilisent. */
export type PreparedDocument = {
  key: string;
  fileName: string;
  mimeType: string;
  ref: string;
};

/** Ce qu'on demande au modèle. Une passe à la fois : on ne lui fait jamais
 *  produire le programme entier d'un coup (§5.1). */
export type IngestScope =
  | {
      pass: 'chapters';
      /** Présent au SECOND essai seulement : le nombre de chapitres rendu au
       *  premier, que la consigne rappelle au modèle (§16.18). */
      retry?: { previous: string[] };
    }
  | {
      pass: 'notions';
      chapter: { id: string; name: string };
      /** Combien d'appels de cette passe partagent les mêmes documents — c'est
       *  le nombre de chapitres de l'import. Sert **uniquement** à décider si le
       *  marqueur de cache est rentable (§16.17) : à un seul chapitre, il serait
       *  une perte sèche de 25 %. */
      plannedCalls?: number;
    }
  | {
      pass: 'questions';
      chapter: { id: string; name: string };
      /** Les notions à faire travailler par ce lot de questions. */
      notions: { id: string; title: string }[];
      /** Les AUTRES notions du même chapitre, en contexte seulement (§16.21).
       *  C'est ce qui remplace le cours : la notion suffit pour les niveaux 1 et
       *  2 de Bloom, ses voisines apportent ce qu'il faut pour les niveaux 3 et
       *  4. Quelques milliers de tokens, contre 680 000 pour le corpus. */
      neighbours: { id: string; title: string }[];
      budget: number;
    };

/** Ce que rend un fournisseur : la sortie brute — **non validée**, c'est le rôle
 *  de `parsePlan` — et ce que l'appel a coûté. */
export type ProviderResult = {
  plan: unknown;
  usage: {
    /** Tokens facturés plein tarif — ni mis en cache, ni lus depuis le cache. */
    inputTokens: number;
    outputTokens: number;
    /** Tokens **écrits** dans le cache. Un document volumineux atterrit ici au
     *  premier appel : sans cette mesure, on croit à tort que l'appel n'a
     *  presque rien coûté en entrée.
     *
     *  ⚠️ **Le tarif dépend du TTL, et l'écart est de 60 %** : une écriture
     *  coûte **2× l'entrée en TTL 1 h**, 1,25× en TTL 5 minutes (le défaut, et
     *  ce que le code utilise depuis §16.17). Seuil de rentabilité :
     *  3 lectures en TTL 1 h, 2 en TTL 5 minutes — en dessous, poser un
     *  marqueur coûte plus cher que ne pas en poser. */
    cacheCreationTokens: number;
    /** Tokens **servis** par le cache (~0,1×). À zéro d'un appel à l'autre alors
     *  que le document ne change pas, un invalidateur traîne dans le préfixe
     *  (§5.2) — et on paie l'écriture du cache à chaque fois au lieu de la
     *  lecture. */
    cachedTokens: number;
  };
};

export type PlanProvider = {
  /** Nom court, pour la journalisation et le suivi de coût. */
  readonly name: string;

  /** Remet les documents au fournisseur, **une fois pour toute l'ingestion**.
   *  Chez Claude : un téléversement vers la Files API. Chez un fournisseur sans
   *  stockage : une simple mise en forme, les octets restant portés par la
   *  poignée. */
  prepare(documents: SourceDocument[]): Promise<PreparedDocument[]>;

  /** Combien de tokens le corpus occupera-t-il en entrée.
   *
   *  ⚠️ TEMPORAIRE — phase de test : sert à annoncer un coût avant de dépenser
   *  (§16.15). Chez Claude, `countTokens` est **gratuit** et a ses propres
   *  limites de débit (vérifié le 22/08/2026). Un fournisseur incapable de
   *  compter peut renvoyer `null` : on affichera « inconnu » plutôt que de
   *  bloquer. */
  countCorpus(documents: PreparedDocument[]): Promise<number | null>;

  /** Rend les documents au fournisseur — l'inverse de `prepare`.
   *
   *  ⚠️ **Rien ne s'efface tout seul** : chez Claude, un fichier téléversé
   *  persiste sous le compte jusqu'à suppression explicite, et un nouveau
   *  téléversement n'efface pas les anciens (§16.8). L'opération est gratuite.
   *  Passer par `releaseDocuments` (`src/lib/ingest/release.ts`) plutôt que
   *  d'appeler ceci directement : un ménage raté ne doit jamais faire échouer
   *  ce qu'il accompagne. */
  release(documents: PreparedDocument[]): Promise<void>;

  documentToPlan(
    documents: PreparedDocument[],
    existing: ExistingContent,
    scope: IngestScope,
  ): Promise<ProviderResult>;
};
