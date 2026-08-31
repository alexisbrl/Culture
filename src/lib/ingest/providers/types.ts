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
  /** Identifiant du fichier dans l'atelier (`workshop_files.id`).
   *
   *  ⚠️ **C'est LUI qui identifie un document, jamais son nom.** Un nom ne
   *  distingue pas « cours.pdf » de « cours.pdf » remis à jour — le cas le plus
   *  fréquent — alors que l'identifiant change dès que le fichier est remplacé,
   *  et survit à un simple renommage. Tout ce qui doit savoir « est-ce encore le
   *  même document ? » se fonde là-dessus (voir la provenance des notions). */
  fileId: string;
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
  /** Voir `SourceDocument.fileId` : l'identité d'un document, ce n'est pas son
   *  nom. Conservé dans `ai_imports.file_ids` avec le reste. */
  fileId: string;
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
      /** Les notions à répartir — TOUTES celles de l'atelier, celles que la
       *  passe précédente vient d'extraire comme celles qu'il portait déjà.
       *
       *  C'est l'entrée principale de la passe depuis l'inversion du
       *  23/08/2026 : elle ne nomme plus seulement des boîtes, elle dit ce
       *  qu'on met dedans. */
      notions: { id: string; title: string }[];
      /** Présent au SECOND essai seulement : le nombre de chapitres rendu au
       *  premier, que la consigne rappelle au modèle (§16.18). */
      retry?: { previous: string[] };
    }
  | {
      pass: 'notions';
      /** Le document traité par CET appel — l'unité de travail de la passe.
       *
       *  Un appel par document, et chacun ne reçoit que le sien : le corpus ne
       *  part donc qu'une fois au total, au lieu d'une fois par chapitre. Il
       *  n'y a plus rien à mettre en cache, et c'est moins cher que le cache
       *  qu'on remplace. */
      document: { index: number; fileName: string };
    }
  | {
      /** Le RANGEMENT : où va chaque notion. Passe séparée de « chapitres »
       *  depuis le 24/08/2026 — voir `wireSchema.ts` pour le pourquoi.
       *
       *  Elle ne reçoit **aucun document** : nommer les chapitres demande le
       *  cours, les ranger non. Ce qui remplace le cours, ce sont deux nombres —
       *  la page d'où vient la notion, et les pages que couvre le chapitre. */
      pass: 'assign';
      /** Les notions de CE lot, avec leur provenance quand on l'a. */
      notions: {
        id: string;
        title: string;
        sourceDocument?: string | null;
        page?: number | null;
        /** Le chapitre où elle se trouve AUJOURD'HUI, s'il y en a un.
         *
         *  ⚠️ Sans lui, le modèle range chaque notion de zéro à chaque import —
         *  y compris celles que l'utilisateur a placées à la main, qu'il
         *  défaisait donc en silence. Limite connue et assumée : on sait dire où
         *  une notion est, pas QUI l'y a mise. Une notion rangée par l'IA puis
         *  déplacée à la main est indiscernable d'une notion jamais touchée. */
        currentChapterId?: string | null;
      }[];
      /** TOUS les chapitres du programme — le lot doit pouvoir ranger n'importe où. */
      chapters: {
        id: string;
        name: string;
        sourceDocument?: string | null;
        pageStart?: number | null;
        pageEnd?: number | null;
      }[];
      /** Les ressemblances repérées **mécaniquement** entre une notion de ce lot
       *  et une notion déjà présente. Le calcul ne décide rien : il signale, et
       *  c'est le modèle qui tranche si la ressemblance est justifiée (une
       *  notion voisine mais distincte) ou non (une redite, à laisser sans
       *  chapitre). */
      similar: { notionId: string; other: string; proximity: number }[];
    }
  | {
      pass: 'questions';
      chapter: { id: string; name: string };
      /** Les notions à faire travailler par ce lot de questions. `want` porte la
       *  DEMANDE : ce qu'il faut produire sur cette notion, niveau par niveau
       *  (voir @/lib/ingest/demand). Absent quand une consigne libre laisse le
       *  modèle choisir. */
      notions: { id: string; title: string; want?: { bloomLevel: 1 | 2 | 3 | 4; count: number }[] }[];
      /** Les AUTRES notions du même chapitre, en contexte seulement (§16.21).
       *  C'est ce qui remplace le cours : la notion suffit pour les niveaux 1 et
       *  2 de Bloom, ses voisines apportent ce qu'il faut pour les niveaux 3 et
       *  4. Quelques milliers de tokens, contre 680 000 pour le corpus. */
      neighbours: { id: string; title: string }[];
      budget: number;
      /** Combien de questions manquent à chaque notion pour atteindre son stock
       *  visé. Absent quand la notion part de zéro. */
      missing?: Record<string, number>;
      /** Nom et description de l'atelier : le seul indice de niveau (§ examen,
       *  24/08/2026). */
      workshop?: { name: string; description?: string | null } | null;
    }
  | {
      /** L'EXAMEN. Passe distincte de `questions` depuis le 24/08/2026, parce
       *  que rien n'y est pareil sauf le format de sortie : elle ne compte pas
       *  par notion mais rend un nombre TOTAL de questions pour le programme,
       *  chacune croisant plusieurs notions, dont un tiers en groupes qui
       *  s'enchaînent.
       *
       *  Comme la passe questions, elle ne reçoit **aucun document**. */
      pass: 'exam';
      /** La tranche de programme couverte par cet appel, dans l'ordre du cours. */
      chapters: { id: string; name: string; notions: { id: string; title: string }[] }[];
      /** Nombre de questions à écrire dans CET appel. */
      budget: number;
      workshop?: { name: string; description?: string | null } | null;
    };

/** Ce que rend un fournisseur : la sortie brute — **non validée**, c'est le rôle
 *  de `parsePlan` — et ce que l'appel a coûté. */
export type ProviderResult = {
  plan: unknown;
  /** La réponse a-t-elle été **coupée au plafond de sortie** ?
   *
   *  Un JSON tronqué ne se relit pas : l'appel entier est perdu, et sans ce
   *  drapeau il l'est **en silence** — zéro question écrite, aucun écart à
   *  signaler, un compte-rendu qui ne dit rien. L'appelant en fait une ligne du
   *  compte-rendu (28/08/2026). */
  truncated?: boolean;
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
