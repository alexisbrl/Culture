// Le contrat des opérations sur le programme d'un atelier.
//
// Feuille de route : docs/chantiers/2026-08-23-notions-dabord.md (T2).
//
// ─── Ce que ce module est ────────────────────────────────────────────────────
//
// Le catalogue FERMÉ des opérations qu'une source extérieure — l'IA aujourd'hui,
// un chat demain, une API un jour — peut demander sur le programme d'un atelier.
// Rien d'autre n'est exprimable : il n'existe aucune opération « modifier une
// notion », « supprimer un chapitre » ou « fusionner ». Ce n'est pas une
// convention qu'on se donne, c'est le type qui l'interdit.
//
//   L'IA CRÉE et (DÉS)ATTRIBUE. Elle ne supprime pas, ne réécrit pas.
//
// La réversibilité en découle : rien n'étant jamais écrasé, tout retour en
// arrière est une ré-attribution. Le cas fondateur est dans la feuille de route
// (§2, « Napoléon ») — une notion enrichie n'est pas modifiée, elle est créée à
// côté et l'ancienne part sans chapitre.
//
// ─── Pourquoi le découpage est aussi fin ─────────────────────────────────────
//
// Parce que LA FINESSE DES OPÉRATIONS EST LA FINESSE DES DROITS. Ces mêmes
// opérations seront déclenchées depuis un chat, par des utilisateurs qui n'ont
// pas les mêmes droits. Un bloc « mets à jour l'atelier » ne serait pas
// autorisable finement ; « ranger une notion dans un chapitre » l'est.
//
// ─── Les deux axes d'autorisation ────────────────────────────────────────────
//
// Chaque opération porte DEUX restrictions, et il faut les deux :
//
//   • `role`   — le rang minimum dans l'atelier (src/lib/authz.ts).
//   • `actors` — QUI a le droit de la demander. Ce n'est pas la même question.
//                Cacher un chapitre est réservé à l'IA : non par méfiance, mais
//                parce que l'interface n'offre pas de bouton « cacher ». Le
//                restaurer est ouvert aux deux — l'utilisateur remet ce qu'il
//                veut garder, l'IA défait un import annulé.
//
// ⚠️ Le rôle n'est JAMAIS un paramètre venu de la conversation. Il est relu à
// l'exécution, sur le compte connecté, à chaque tour — voir la revue des sept
// trous dans la feuille de route (§2).

import type { WorkshopRole } from '@/lib/authz';

// ─── Auteurs ─────────────────────────────────────────────────────────────────

/** Qui demande l'opération.
 *
 *  `system` n'est pas un utilisateur privilégié : c'est le ménage que l'import
 *  fait sur son propre travail (voir `planImportCleanup`). Il n'est exposé ni à
 *  l'IA ni à l'interface, et c'est ce qui borne la seule suppression du
 *  système. */
export type OperationActor = 'ai' | 'human' | 'system';

// ─── Le catalogue fermé ──────────────────────────────────────────────────────

export type ProgramOperation =
  /** Crée un chapitre. Une boîte, rien de plus — elle ne porte aucune notion à
   *  la création : c'est `assign_notion` qui les y range. */
  | { kind: 'create_chapter'; name: string; position: number }
  /** Crée une notion. Elle naît SANS chapitre ; l'affectation est une opération
   *  distincte, et c'est ce qui rend le rangement rejouable. */
  | { kind: 'create_notion'; title: string }
  /** Range une notion dans un chapitre, ou l'en sort (`chapterId: null`).
   *  Sortir une notion est la seule façon de l'écarter du programme : elle
   *  garde son contenu, ses questions et la progression déjà acquise. */
  | { kind: 'assign_notion'; notionId: string; chapterId: string | null }
  /** Demande la rédaction de questions POUR CES NOTIONS.
   *
   *  Une seule opération pour deux besoins qu'on aurait pu croire distincts —
   *  la génération à l'import et la recharge quand le stock d'une notion
   *  s'épuise (plan d'ingestion §16.6). Seul le critère d'entrée change : les
   *  notions d'un chapitre qu'on vient d'importer, ou les notions à court de
   *  questions. L'opération, elle, est la même. */
  | { kind: 'create_questions'; notionIds: string[] }
  /** Rattache une question existante à des notions actives.
   *
   *  C'est le recyclage : une question accrochée à une notion écartée dort, et
   *  redevient utilisable si elle correspond à une notion active. L'énoncé
   *  n'est JAMAIS réécrit — s'il ne colle pas, on crée une question et
   *  l'ancienne reste où elle est. */
  | { kind: 'attach_question'; questionItemId: string; notionIds: string[] }
  /** Écarte un chapitre : lui et ses notions sortent du programme, mais restent
   *  consultables sous les chapitres visibles. Réservé à l'IA — l'interface
   *  n'offre aucun moyen de cacher un chapitre à la main. */
  | { kind: 'hide_chapter'; chapterId: string }
  /** Remet un chapitre caché dans le programme — le bouton « restaurer ».
   *
   *  Ouvert aux deux : l'utilisateur restaure ce qu'il veut garder, et l'IA doit
   *  pouvoir le faire aussi, ne serait-ce que pour défaire un import annulé.
   *  L'asymétrie avec `hide_chapter` n'est donc pas une règle de sécurité, c'est
   *  une décision d'interface — on n'offre pas de bouton « cacher ». */
  | { kind: 'restore_chapter'; chapterId: string };

export type OperationKind = ProgramOperation['kind'];

// ─── Qui peut quoi ───────────────────────────────────────────────────────────

export type OperationRule = {
  /** Rang minimum requis dans l'atelier. */
  role: WorkshopRole;
  /** Auteurs autorisés à la demander. */
  actors: readonly OperationActor[];
};

/** La table d'autorisation. Exhaustive par construction : `Record` sur
 *  `OperationKind` fait échouer la compilation à l'ajout d'une opération dont on
 *  aurait oublié de dire qui a le droit de la demander. C'est délibéré — un
 *  oubli ici serait une opération ouverte à tous. */
export const OPERATION_RULES: Record<OperationKind, OperationRule> = {
  create_chapter: { role: 'manager', actors: ['ai', 'human'] },
  create_notion: { role: 'manager', actors: ['ai', 'human'] },
  assign_notion: { role: 'manager', actors: ['ai', 'human'] },
  create_questions: { role: 'manager', actors: ['ai', 'human', 'system'] },
  attach_question: { role: 'manager', actors: ['ai', 'human'] },
  hide_chapter: { role: 'manager', actors: ['ai'] },
  restore_chapter: { role: 'manager', actors: ['ai', 'human'] },
};

const ROLE_RANK: Record<WorkshopRole, number> = { owner: 3, manager: 2, member: 1 };

/** Le catalogue à exposer à un demandeur donné.
 *
 *  ⚠️ À RECONSTRUIRE À CHAQUE TOUR de conversation, jamais à mettre en cache au
 *  début : un gestionnaire rétrogradé en cours de discussion doit perdre ses
 *  opérations dans la seconde. Un catalogue mémorisé est une élévation de
 *  privilège à retardement.
 *
 *  Sa raison d'être n'est pas la sécurité — `authorizeOperation` s'en charge —
 *  mais l'honnêteté : l'IA doit répondre « vous n'avez pas ce droit » au lieu de
 *  proposer une action qui échouera. */
export function allowedOperations(actor: OperationActor, role: WorkshopRole): OperationKind[] {
  return (Object.keys(OPERATION_RULES) as OperationKind[]).filter((kind) =>
    isOperationAllowed(kind, actor, role),
  );
}

export function isOperationAllowed(
  kind: OperationKind,
  actor: OperationActor,
  role: WorkshopRole,
): boolean {
  const rule = OPERATION_RULES[kind];
  if (!rule) return false;
  if (!rule.actors.includes(actor)) return false;
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[rule.role];
}

export type AuthorizationFailure = {
  kind: string;
  reason: 'unknown_operation' | 'actor_not_allowed' | 'role_too_low';
};

/** Filtre une liste d'opérations proposées : garde celles que ce demandeur peut
 *  réellement faire, et rend le motif de chaque refus.
 *
 *  On ne rejette PAS le lot entier sur un refus — même règle que `parsePlan`
 *  (`src/lib/ingest/planSchema.ts`) : un plan de 160 opérations ne doit pas être
 *  perdu parce que l'une d'elles dépasse les droits. Les refus sont remontés,
 *  jamais avalés en silence.
 *
 *  ⚠️ Ce filtre ne remplace pas le contrôle d'accès à l'écriture. Il dit ce qui
 *  est *demandable* ; `requireManager` reste appelé au moment d'écrire. */
export function authorizeOperations(
  operations: readonly ProgramOperation[],
  actor: OperationActor,
  role: WorkshopRole,
): { allowed: ProgramOperation[]; refused: AuthorizationFailure[] } {
  const allowed: ProgramOperation[] = [];
  const refused: AuthorizationFailure[] = [];

  for (const op of operations) {
    const rule = OPERATION_RULES[op.kind];
    if (!rule) {
      refused.push({ kind: op.kind, reason: 'unknown_operation' });
      continue;
    }
    if (!rule.actors.includes(actor)) {
      refused.push({ kind: op.kind, reason: 'actor_not_allowed' });
      continue;
    }
    if ((ROLE_RANK[role] ?? 0) < ROLE_RANK[rule.role]) {
      refused.push({ kind: op.kind, reason: 'role_too_low' });
      continue;
    }
    allowed.push(op);
  }

  return { allowed, refused };
}

// ─── Le ménage de fin d'import ───────────────────────────────────────────────

/** Ce que l'import a produit, tel qu'on le relit en base à la fin. */
export type ImportProduce = {
  chapters: { id: string; importId: string | null }[];
  notions: { id: string; chapterId: string | null; importId: string | null }[];
};

export type ImportCleanup = {
  chapterIds: string[];
  notionIds: string[];
};

/** La SEULE suppression autorisée du système, et elle est bornée par
 *  construction.
 *
 *  Ce que CET import a créé et qui n'a trouvé aucune place à l'arrivée est du
 *  déchet : personne ne l'a jamais vu, aucune progression ne s'y accroche. Une
 *  notion née d'un document et qu'aucun chapitre n'a reprise, un chapitre créé
 *  puis resté vide — on efface.
 *
 *  Deux conditions, et il faut LES DEUX :
 *    1. `importId` correspond à cet import — donc ce qui existait avant est
 *       hors d'atteinte, quoi qu'il arrive ;
 *    2. rien n'y est rattaché à la fin.
 *
 *  ⚠️ À N'APPELER QU'À LA FIN DE L'IMPORT, jamais entre deux passes. Les notions
 *  naissent à la passe ① et ne sont rangées qu'à la passe ② : un ménage en fin
 *  de passe ① les supprimerait TOUTES. C'est le piège de cette fonction, et
 *  c'est pour ça qu'elle prend un `importId` explicite plutôt que de deviner.
 *
 *  À ne pas confondre avec le chapitre VIDÉ (feuille de route §5) : celui-là
 *  existait avant l'import, porte peut-être un titre écrit à la main, et on le
 *  conserve. C'est exactement ce que la condition sur `importId` distingue. */
export function planImportCleanup(produce: ImportProduce, importId: string): ImportCleanup {
  const notionIds = produce.notions
    .filter((n) => n.importId === importId && n.chapterId === null)
    .map((n) => n.id);

  const occupied = new Set(
    produce.notions.filter((n) => n.chapterId !== null).map((n) => n.chapterId as string),
  );

  const chapterIds = produce.chapters
    .filter((c) => c.importId === importId && !occupied.has(c.id))
    .map((c) => c.id);

  return { chapterIds, notionIds };
}
