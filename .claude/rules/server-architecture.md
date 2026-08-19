---
paths:
  - "src/app/actions/**/*.ts"
  - "src/lib/**/*.ts"
  - "src/app/api/**/*.ts"
  - "src/proxy.ts"
---

# Architecture serveur — préparer une future API sans la construire maintenant

Objectif : chaque domaine (`workshops`, `examen`, `profile`…) doit pouvoir un jour être exposé via une route API publique (`POST /api/v1/workshops/:id/members`) **sans dupliquer sa logique**. Ça se prépare **dès l'écriture**, pas en audit ultérieur.

## Le pattern lib/ + wrapper (obligatoire pour tout nouveau domaine)

- La logique métier (requêtes Supabase, règles métier) va directement dans `src/lib/<domaine>/…` — un module **pur** : pas de `'use server'`, pas de `auth()` Clerk, pas de `revalidatePath`. Il prend des identités déjà résolues en paramètres (ex. `actor: { userId, role }`) et retourne des résultats simples (`{ success, error? }` ou des données).
- Le fichier `'use server'` dans `app/actions/` reste un **wrapper fin** : authz (`requireMember`/`requireManager`/`requireOwner` de `src/lib/authz.ts`) → appel au module `lib/` → `revalidateWorkshop()`/`revalidateDashboard()` (`src/lib/revalidate.ts`) si succès.
- Ce qui répond à « qui a le droit ? » reste dans le wrapper (à côté de `requireOwner`). Ce qui répond à « qu'est-ce qui se passe ensuite ? » va dans `lib/`.
- Exception : les préoccupations de transport HTTP pur (ex. extraire un `File` d'un `FormData`) restent dans le wrapper — une future API recevrait le fichier différemment, mais devrait appliquer les mêmes règles de validation (celles-ci vivent dans `lib/`).
- Exemples de référence à copier : `src/lib/workshops/members.ts`, `src/lib/workshops/core.ts`, `src/lib/workshops/lifecycle.ts`, `src/lib/workshops/files.ts`, `src/lib/workshops/exam.ts`.
- Un type métier utilisé à la fois par l'UI et une server action (ex. `Question`, `ExamConfig`) est défini dans `src/lib/<domaine>/…` (ex. `src/lib/workshops/examTypes.ts`), jamais dans un composant puis réexporté vers l'action serveur.

### ⚠️ Piège Turbopack — re-export de type dans un fichier `'use server'`

Un fichier `'use server'` ne peut pas faire `export type { X } from '@/lib/...'` ni `import type { X } from '@/lib/...'; export type { X };` — Turbopack traite ces re-exports comme des exports de valeur lors de l'analyse des server actions et le **build échoue** (`Export X doesn't exist in target module`), alors que `tsc --noEmit` et `next lint` ne détectent rien. **D'où la règle : valider par `npm run build`, jamais seulement `tsc --noEmit`.** Solution : redéclarer le type localement dans le fichier `'use server'` (structurellement identique, pas d'import-export). Un `import type { X } from '@/lib/...'` **sans** ré-export (juste pour typer une variable locale) reste, lui, valide.

## Contrôle d'accès — `src/lib/authz.ts`

Point d'entrée unique des droits d'atelier. Exporte `WorkshopRole` (`owner` > `manager` > `member`, `ROLE_RANK`), `requireWorkshopRole(workshopId, minRole)` et les raccourcis `requireMember`/`requireManager`/`requireOwner` (renvoient `{ userId, role } | null`) + `assertManager` (lève). **Toute server action agissant sur un atelier appelle l'un de ces helpers en tête** — une server action `'use server'` est une URL POST publique, le garde de la page ne protège rien côté serveur. Règles de rang : on ne peut agir que sur un membre de rang strictement inférieur au sien, jamais sur le propriétaire, jamais promouvoir au-dessus de son propre rang.

## Revalidation de cache — `src/lib/revalidate.ts`

Point d'entrée unique après une mutation. `revalidateWorkshop()` (page atelier + paramètres + session) et `revalidateDashboard()` (mes ateliers / rejoints / corbeille / recherche). **Ne jamais écrire `revalidatePath('/', 'layout')`** — invalide toute l'app. Appeler l'un et/ou l'autre selon ce qui change réellement.

> **Piège Next 16 :** `revalidatePath` opère sur la structure de fichiers de route, pas l'URL — avec le segment i18n `[locale]`, il faut passer le pattern (`/[locale]/workshops/[id]`) + le `type`, jamais un chemin concret (`/fr/workshops/<uuid>` ne matche rien).

## Modèle de sécurité Supabase — RLS « server-only »

Toute la base est accédée **exclusivement côté serveur** via la service role key (`getSupabaseServerClient`, `src/lib/supabase.ts`), qui bypass la RLS. Aucune table n'est lue/écrite depuis le client avec la clé anon. Conséquence : **toutes les tables ont la RLS activée, sans aucune policy** — c'est normal et voulu, à ne PAS « corriger » en ajoutant des policies (inutile tant que l'accès reste 100% server-side). Si un jour un accès client avec la clé anon est ajouté, il faudra alors écrire des policies pour les tables concernées.

## Types Supabase générés — `src/lib/database.types.ts`

**Généré** (MCP Supabase `generate_typescript_types` ou `supabase gen types typescript --project-id hhkmrejjksjpfetwefju`) — ne jamais l'éditer à la main, le régénérer après chaque migration. Les types métier de `src/lib/supabase.ts` (`Workshop`, `WorkshopMember`…) en dérivent (`Tables<'workshops'>`…) pour ne pas diverger des colonnes réelles. Le client Supabase lui-même reste non typé (`createClient` sans generic) — voir `docs/backlog.md` pour le chantier de typage complet.

## Questions d'examen : groupe, questions, vues

Trois formes coexistent volontairement — ne pas les confondre ni en réintroduire une quatrième :

- **En base** : `exam_questions` = le GROUPE (titre, image, audio, libellés, chapitre) ; `exam_question_items` = une ligne par question, ordonnée par `sort_order` (0 = principale), avec ses contraintes ; `exam_question_item_bricks` = les notions, reliées à la QUESTION. La question principale reprend l'identifiant de son groupe — c'est ce qui garde valides les clés de barème (`ExamConfig.weighting`), les sections d'examen et les brouillons.
- **Vers l'extérieur** (IA, future API) : `QuestionGroup` (`src/lib/workshops/questionGroup.ts`), symétrique — `{ …commun…, questions: [...] }`, au moins une. Toute entrée non fiable passe par `normalizeGroupInput`.
- **Dans l'interface** : `Question` (question principale + `parts`), la vue qu'édite l'éditeur.

La conversion entre la forme stockée et `Question` est **confinée à `src/lib/workshops/exam.ts`** (`rowToQuestion`, `questionToRow`, `itemRowsOf`, `syncQuestionItems`). Aucun composant, aucune autre fonction de `lib/` ne doit lire ou écrire les tables directement : c'est ce qui a permis de changer le stockage sans toucher à l'UI, et ce qui permettra de le refaire.

Les écritures de questions sont **différentielles** (upsert des lignes voulues, suppression des seules lignes disparues) : une question liée garde sa ligne et ses liens de notions d'une édition à l'autre. Ne pas revenir à un « tout effacer puis tout réinsérer », qui perdrait les liens et pourrait laisser un groupe sans question.

## Ajouter (ou retirer) un type de réponse — la liste complète

Un type de réponse (`ResponseType`) touche **onze endroits**, dont deux qui échouent en silence si on les oublie. Faire la liste dans l'ordre :

1. **`src/lib/workshops/examTypes.ts`** — l'union `ResponseType` **et** le tableau `RESPONSE_TYPES` (le second sert de garde à `parseResponseType`, il ne se déduit pas du premier : TypeScript disparaît à l'exécution).
2. **La contrainte en base** — `exam_question_items_response_type_check` (posée le 19/08/2026, voir `docs/migrations/2026-08-19-types-de-reponse-verrouilles.sql`). ⚠️ **Dans la même migration que le déploiement du code** : ajoutée trop tard, toute question du nouveau type est rejetée en base ; retirée trop tôt sur un type supprimé, les questions existantes deviennent non enregistrables.
3. **`parseResponseType`** — si le nouveau type *remplace* un ancien, ajouter le `case` de mapping. Rappel de la règle (`docs/ai-ingestion-plan.md` §7) : on ne mappe que ce qui a un sens équivalent ; sans mapping fondé, l'ancien type doit être rejeté, pas replié sur `textuelle`.
4. **`RESPONSE_TYPE_ORDER`** (`tabs/examen/questionFields.tsx`) — l'ordre du menu de l'éditeur. Un type absent d'ici est **inutilisable dans l'interface tout en étant valide partout ailleurs** : c'est le premier oubli silencieux.
5. **`CHOICE_BASED`** (même fichier) — seulement si le type se répond par une liste de propositions (`qcs`, `qcm`, `matching`).
6. **`RESPONSE_TYPE_V2`** (même fichier) — pour afficher le type comme « bientôt » sans le rendre sélectionnable.
7. **Les champs de saisie** — `QuestionFields` (`questionFields.tsx`) : le formulaire propre au type.
8. **La feuille A4** — `tabs/examen/examShared.tsx` : le rendu sur la copie imprimée.
9. **L'exercice du parcours** — `exercise/[chapterId]/ExerciseClient.tsx` (zone de réponse côté candidat) **et** `toExerciseTypeOptions` dans `lib/workshops/exam.ts`, qui transmet les réglages en **liste blanche**. Second oubli silencieux : un réglage non listé n'arrive jamais au candidat, sans la moindre erreur (cf. `tableShuffleRows`, `docs/backlog.md`).
10. **La correction** — `gradeParcoursAnswer` (`lib/workshops/exam.ts`) : sans règle, le type renvoie `correct: null` et ne fait jamais progresser la maîtrise (`docs/backlog.md`).
11. **i18n** — la clé `responseType.<type>` dans `messages/fr.json` **et** `messages/en.json`, plus `shufflesAnswerItems` (`examTypes.ts`) si l'ordre des éléments de réponse doit être mélangé.

Le contrat exposé à l'extérieur (`QuestionGroup`, `normalizeGroupInput`) n'a rien à changer : il s'appuie sur `parseResponseType`/`toResponseType`. En revanche, **le schéma Zod de l'ingestion IA reprendra l'énumération** — à mettre à jour aussi le jour venu (`docs/ai-ingestion-plan.md` §7).

## Énoncé obligatoire

Une question doit avoir **au moins un caractère d'énoncé**, la principale comme chaque question liée (décision produit du 19/08/2026). Tenu à trois niveaux : `canSave` dans `InlineQuestionEditor.tsx` (bouton désactivé + infobulle), `assertStatements` dans `src/lib/workshops/questionIntegrity.ts` (refus serveur), et rien en base — la colonne a un défaut `''`, volontairement conservé pour ne pas casser les ré-écritures de masse.

Le refus serveur porte sur **`saveQuestion` seulement** (création/modification), jamais sur `saveQuestions` : une ré-écriture de masse (suppression d'un libellé, d'une question) ne touche pas aux énoncés, et échouer sur le contenu d'une question sans rapport ferait avorter une opération qui n'a rien demandé. Un refus annule **tout** l'enregistrement, jamais seulement l'énoncé fautif : conserver l'ancien texte et enregistrer le reste serait une réparation silencieuse.

## Éviter les requêtes N+1

Ne jamais boucler un appel réseau (Clerk `getUser`, envoi d'email…) dans une server action — utiliser un appel batch (`clerkClient().users.getUserList({ userId: [...] })`) ou `Promise.all`. Regrouper les requêtes Supabase indépendantes en `Promise.all` (voir `getExamBankData`, `getUserWorkshops`).

## Storage — `src/lib/storage.ts`

Point d'entrée unique du stockage de fichiers, provider-agnostic. En base, on stocke uniquement des **clés/chemins d'objet** (`buildWorkshopFileKey`), jamais une URL de provider — les URLs sont générées à la demande (`UploadTicket`, `createSignedUploadUrl`/`createSignedDownloadUrl`). Le client fait lui-même le `PUT` direct vers le stockage (XHR pour la progression d'upload). Une migration future vers un autre provider (ex. S3) ne devrait toucher que ce fichier — jamais appeler un SDK de provider directement ailleurs dans le code.

## Nettoyage planifié — `pg_cron`

La suppression définitive des ateliers en corbeille (> 7 jours) est une tâche planifiée **côté base** (`pg_cron`, job `cleanup-expired-trashed-workshops`, tous les jours à 03:00 UTC) — pas du code applicatif, donc invisible en lisant le repo (pour l'auditer : `select * from cron.job` côté Supabase). Ne jamais réintroduire un nettoyage dans un chemin de lecture chaud (ex. `getUserWorkshops`). Limite connue : le plan Supabase Free met le projet en pause après ~1 semaine d'inactivité, pendant laquelle `pg_cron` ne tourne pas.

## Session unique par compte

Un webhook Clerk `session.created` (`src/app/api/webhooks/clerk/route.ts`) révoque toutes les autres sessions actives de l'utilisateur à chaque nouvelle connexion — empêche un compte d'être connecté sur deux appareils simultanément. Configuration requise : endpoint Clerk abonné à `session.created` + `CLERK_WEBHOOK_SIGNING_SECRET`. Limite connue : ne fonctionne que si l'onglet de la victime est ouvert (détection au rafraîchissement du token Clerk, < ~1 min) ; onglet fermé → déconnexion silencieuse au prochain accès.

## Atelier Premium — irréversibilité et mécanisme de test

Trigger Postgres `trg_prevent_workshop_premium_downgrade` empêche `is_premium` de repasser à `false` — garantie posée au niveau base, valable même via SQL direct ou un futur bug applicatif.

**⚠️ `activateWorkshopPremium` contient un mécanisme de test temporaire à retirer avant Stripe** : allowlist admin par email (`PREMIUM_TEST_ADMIN_EMAILS`) + mot de passe en dur (`PREMIUM_TEST_ACTIVATION_PASSWORD`). Voir `docs/backlog.md` pour le plan de remplacement par un flux post-paiement réel. Ne jamais étendre ce mécanisme de test — il doit rester facile à supprimer d'un bloc.

## Fichiers découpés (`ExamenTab.tsx`, `SettingsClient.tsx`)

Les deux plus gros composants ont été éclatés en sous-modules sans changement de comportement : `tabs/examen/{examShared,HistoryContent,BankContent,GeneratorContent}.tsx` et `settings/{settingsShared,MembersSection,FilesSection,PremiumSection,BricksSection}.tsx`. **Les sections de Paramètres sont montées en permanence** (toggle `display:'contents'`/`'none'`, pas de montage conditionnel `{active && <Section/>}`) — c'est volontaire, ça préserve l'état entre onglets (upload en cours, mises à jour optimistes des membres). Ne pas repasser en montage conditionnel sans réfléchir aux régressions que ça réintroduirait.

Pattern de découpage à réutiliser pour tout futur fichier surdimensionné : tranches verbatim (pas de réécriture), un module `xShared` pour types/constantes/helpers/petits composants, un fichier par responsabilité, validé par `tsc --noEmit` + `next build`.
