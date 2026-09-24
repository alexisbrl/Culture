# Chantier : génération par chapitres

**Branche :** feat/generation-par-chapitres
**PR :** https://github.com/alexisbrl/Culture/pull/58
**Cadré le :** 2026-09-22

## Objectif
Mettre le code de la génération par IA en conformité avec `docs/architecture.md` §7 pour les étapes 0 à 3. Le gros du travail porte sur les étapes 1 et 2 : le code tourne encore sur l'ancien enchaînement (notions document par document → chapitres → passe de rangement séparée → questions, avec cache de prompt), alors que la cible est : étape 1 chapitres sur texte seul avec bornes de pages et verdict sur chaque notion existante → découpe des PDF → étape 2 notions par chapitre avec seconde vérification → questions d'un chapitre dès qu'il est prêt, et vérification finale des redites en parallèle.

## Critère de réussite global
- Une génération sur un atelier qui a déjà du contenu suit l'ordre cible : l'étape 1 ne reçoit que du texte (sauf les pages pauvres en texte, envoyées aussi en image), l'étape 2 part un appel par chapitre sur les seules pages de ce chapitre, les questions d'un chapitre partent dès que son étape 2 est finie, et il n'y a plus de passe de rangement ni de marqueur de cache.
- Toutes les règles de `docs/architecture.md` §7.2 à §7.6 (hors lecture des scans au dépôt) et §7.10 sont appliquées par le code ; celles qui décident d'écritures en base ou de découpage sont couvertes par des tests unitaires.
- `npm run lint`, `npm run test:unit` et `npm run build` passent.
- `docs/architecture.md` §7 décrit exactement ce que fait le code ; `docs/backlog.md` n'a plus l'item « Passer la génération à l'architecture par tranches » (hors ses deux sous-items maintenus, voir Hors périmètre).

## Décisions arrêtées avec Alexis
Toutes sont déjà écrites dans `docs/architecture.md` — **c'est lui la source de vérité** ; ce qui suit n'en est que le rappel pour se repérer.
- **Remplacement direct** de l'ancien enchaînement, sans réglage de bascule ni double version. Alexis testera sur de vrais cours avant de fusionner.
- **Étape 1 : trois réponses par notion existante** — un chapitre visible, « hors programme », « à vérifier » (introuvable dans le texte, peut venir d'une image). Le silence = « oubliée ». Ne pas retrouver une notion dans le texte n'est jamais un motif de « hors programme » (§7.6).
- **Seconde vérification** : toute notion non rangée dans un chapitre visible — oubliée, à vérifier, hors programme, y compris chaque notion d'un chapitre écarté en entier — part dans CHAQUE appel de l'étape 2, étiquetée selon son cas (§7.6).
- **Seuils 10 % / 25 %** : ne comptent QUE les oubliées (§7.6).
- **Non réclamée à l'étape 2** : oubliée ou à vérifier → ne bouge pas ; hors programme → reste dans son chapitre s'il est écarté, passe **sans chapitre** (`chapter_id = null`) s'il reste visible. Une notion existante n'est jamais effacée par une génération (§7.6).
- **Redites entre chapitres** : quand tous les chapitres ont fini l'étape 2, le site repère les paires suspectes (nouvelle notion ↔ notion d'un autre chapitre) et UN appel les tranche (« redite ou pas »), en parallèle des questions. Toujours la nouvelle qui s'efface, garanti par le code ; ses questions déjà écrites sont rattachées à la notion qui reste (§7.6, table §7.2).
- **Questions dès qu'un chapitre est prêt**, l'existant arrêté à l'ouverture du lot, la part du plafond d'import réservée chapitre par chapitre (§7.2).
- **Étape 0 lancée depuis l'examen** : n'écrit pas de document (§7.4) — déjà le cas dans le code, à préserver.
- **Chantier lancé avant son trimestre** (T1 2027) sur décision explicite d'Alexis, sans déplacer l'item du backlog.

## Décisions techniques prises au cadrage (non soumises à Alexis)
- Lecture et découpe des PDF : ajouter les dépendances `unpdf` (extraction du texte page par page, compatible fonctions serverless) et `pdf-lib` (découpe par pages). Vérifier leur API dans `node_modules` avant de coder — ne rien supposer.
- Une page « pauvre en texte » part aussi en image en l'envoyant comme un mini-PDF de cette seule page (le modèle lit un PDF en texte + image). Le seuil est une constante nommée dans le module de découpage.
- Modèles : `sonnet` pour l'étape 1, l'étape 2 et l'appel des redites (dans `PASS_MODELS`, `src/lib/ingest/providers/claude.ts`).
- **Un appel au modèle par action serveur** quand il risque d'être long : la fonction serveur est limitée à 300 s sur le plan gratuit. En particulier, la relance de l'étape 1 (seuil 10 %) est une action distincte, appelée par l'écran.
- Les réclamations de l'étape 2 (quelle notion de la seconde vérification chaque chapitre réclame) sont **rendues à l'écran** par chaque action et **renvoyées à l'action de finalisation**, qui revalide chaque référence (notion et chapitre de CET atelier) avant d'écrire. Raison : `ai_imports.scope` est écrit en lecture-modification-écriture (item de backlog), des lots parallèles s'y écraseraient ; et une table dédiée demanderait une migration, interdite ici.
- Une notion rattrapée par départage en finalisation n'a pas de questions dans ce lot : la recharge automatique s'en chargera. Assumé.
- Documents qui ne sont pas des PDF (texte, document de l'IA en Markdown) : pas de pages, donc leur « tranche » est le document entier (§7.3, règle 3).

## Hors périmètre
- **La lecture des scans au dépôt** (§7.2, fin) — sous-item du backlog maintenu. Sans elle, les pages sans texte partent en image.
- **L'examen limité à une partie du programme** — sous-item du backlog maintenu, des points restent à trancher. Ne pas toucher à `sliceProgram` / `planExamCalls` au-delà de ce qu'exige la tâche T10.
- Les plafonds de 1 000 notions et 100 000 questions par atelier (items T4 2026 du backlog).
- Le rattrapage des éléments écartés par `parsePlan` (item de backlog).
- Le compte-rendu en langage de développeur et la barre de progression (items de backlog) : on garde l'affichage existant, en l'adaptant seulement aux nouvelles étapes.
- Toute migration de base.

## Zones interdites
- **Base de données** : aucune migration, aucune écriture de `src/lib/database.types.ts` (le hook de chantier les bloque de toute façon). Si une tâche en exige une : écrire le SQL dans `docs/migrations/<date>-<sujet>.sql`, l'inscrire dans `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md`, et mettre la tâche dans « Tâches mises de côté ».
- Le Jardin (`src/app/[locale]/garden/`), l'onglet examen (`src/app/[locale]/workshops/[id]/tabs/examen/`), le parcours et le tirage (`src/lib/workshops/exam.ts`, sauf lecture), la recharge automatique (`src/lib/ingest/refill.ts`, `src/app/api/parcours/refill/`) sauf si une signature partagée change.
- Le fournisseur DeepSeek (`src/lib/ingest/providers/deepseek.ts`) : il doit continuer de servir les passes de questions ; n'y toucher que pour suivre un changement de signature.

## Sources de vérité
- `docs/architecture.md` §7 (en entier) et §8 (journal de bord) — **lire §7 en entier avant T1**.
- `CLAUDE.md` §1 et §5 (règles), §7 (tests : jamais de réseau ni de Supabase dans un test).
- Le code actuel : `src/lib/ingest/` (surtout `run.ts`, `prompt.ts`, `wireSchema.ts`, `planSchema.ts`, `passInput.ts`, `ingest.ts`, `duplicates.ts`, `providers/claude.ts`), `src/app/actions/aiIngest.ts`, `src/components/ai/AiGenerationDialog.tsx`, `src/lib/program/operations.ts`.
- Traductions : `messages/fr.json` et `messages/en.json`, espace `ai`.

## Règles de travail propres à ce chantier
- Chaque tâche : `npm run lint`, `npm run test:unit` et `npm run build` passent avant le commit.
- Toute nouvelle chaîne visible passe par next-intl, dans `fr.json` ET `en.json`.
- Toute fonction pure qui décide d'une écriture en base, d'un découpage de pages ou d'un seuil a ses tests dans `tests/unit/` (critères de `CLAUDE.md` §7). Aucun test ne touche au réseau ni à Supabase.
- Les seuils (10 %, 25 %, borne d'une notion isolée, seuil de texte par page) vivent dans des constantes nommées, jamais en dur au milieu du code.
- Le journal de bord (§8) : chaque appel au modèle garde sa ligne ; une nouvelle étape reçoit un nom d'étape, et la cause d'un échec reste dans la liste fermée.
- Les commentaires du code décrivent la cible et ses raisons, jamais l'historique (« avant, on faisait… »).

## Tâches

- [x] **T1 — Lire et découper un PDF**
  - Ajouter `unpdf` et `pdf-lib`. Nouveau module pur `src/lib/ingest/pdf.ts` : (a) texte de chaque page d'un PDF (tableau indexé par page, à partir de 1) ; (b) nombre de pages ; (c) nouveau PDF ne contenant que les pages demandées, dans l'ordre, sans doublon.
  - Critère d'acceptation : `tests/unit/pdf.test.ts` fabrique en mémoire, avec `pdf-lib`, un PDF de 3 pages portant un texte distinct par page, et vérifie : le texte de chaque page est rendu à son index ; la découpe des pages 2–3 rend un PDF de 2 pages dont le texte est celui des pages 2 et 3 ; une page demandée hors bornes est ignorée. Lint, tests et build passent.
  - Fichiers : `package.json`, `src/lib/ingest/pdf.ts`, `tests/unit/pdf.test.ts`
  - Dépend de : rien

- [x] **T2 — Règles de découpage des chapitres (§7.2, §7.3)**
  - Module pur `src/lib/ingest/slicing.ts` : (a) à partir des bornes rendues par l'étape 1 (par chapitre : document + un ou plusieurs intervalles de pages) et du nombre de pages de chaque document, calculer les pages de chaque chapitre — chevauchement : les deux gardent la page ; page orpheline : rattachée au chapitre précédent dans l'ordre du document (au premier chapitre si elle précède tout) ; chapitre sans borne exploitable (absente, 0, inversée, hors document) : le document entier, avec un drapeau pour le compte-rendu ; (b) décider page par page « texte seul » ou « texte + image » selon une constante `MIN_PAGE_TEXT_CHARS`.
  - Critère d'acceptation : `tests/unit/slicing.test.ts` couvre chevauchement, trou, page avant le premier chapitre, chapitre éclaté en deux intervalles, bornes absentes/inversées/hors document, et le choix texte/image d'un document mi-saisi mi-scanné (la décision est bien par page). Lint, tests et build passent.
  - Fichiers : `src/lib/ingest/slicing.ts`, `tests/unit/slicing.test.ts`
  - Dépend de : rien

- [x] **T3 — Verdicts de l'étape 1 et seuils (§7.6)**
  - Module pur `src/lib/ingest/verdicts.ts` : (a) à partir de la réponse de l'étape 1 et de la liste des notions existantes, classer chaque notion en « rangée dans un chapitre visible », « hors programme », « à vérifier », « oubliée » (absente de la réponse ; une notion laissée dans un chapitre mis au rang 0 = hors programme ; référence inconnue ignorée) ; (b) calculer la part des oubliées et rendre la décision `continuer` / `relancer` / `annuler`, avec les constantes nommées `RELAUNCH_THRESHOLD = 0.10`, `CANCEL_THRESHOLD = 0.25` (inclusifs) et la borne « une notion isolée ne déclenche jamais rien » ; la décision après relance n'offre plus que `continuer` / `annuler` ; (c) construire la liste de seconde vérification avec l'étiquette de chaque notion.
  - Critère d'acceptation : `tests/unit/verdicts.test.ts` couvre chaque classement, les seuils exactement à 10 % et 25 %, la notion isolée, le fait que « à vérifier » et « hors programme » ne comptent pas, et l'inclusion de toutes les notions d'un chapitre écarté dans la seconde vérification. Lint, tests et build passent.
  - Fichiers : `src/lib/ingest/verdicts.ts`, `tests/unit/verdicts.test.ts`
  - Dépend de : rien

- [x] **T4 — Sort final des notions (§7.6)**
  - Dans `src/lib/ingest/verdicts.ts` (ou un voisin pur) : (a) départage d'une notion réclamée par plusieurs chapitres — son chapitre actuel s'il est parmi eux, sinon le premier dans l'ordre du programme, sinon elle ne bouge pas ; chaque arbitrage produit une entrée de compte-rendu ; (b) sort d'une notion non réclamée — oubliée/à vérifier : ne bouge pas ; hors programme : reste si son chapitre est écarté, `chapter_id = null` s'il reste visible ; (c) aucune de ces règles ne peut effacer une notion existante ; (d) garde « jamais tous » : si la réponse écarte tous les chapitres existants, rien n'est appliqué (réutiliser la garde existante si elle existe dans `run.ts`/`ingest.ts`, en la déplaçant dans le module pur).
  - Critère d'acceptation : tests unitaires de chaque cas, dont un test qui vérifie qu'aucun chemin ne rend une suppression de notion existante. Lint, tests et build passent.
  - Fichiers : `src/lib/ingest/verdicts.ts`, `tests/unit/verdicts.test.ts`
  - Dépend de : T3

- [x] **T5 — Nouvelle forme de réponse et consigne de l'étape 1**
  - `src/lib/ingest/wireSchema.ts` et `src/lib/ingest/planSchema.ts` : la réponse de l'étape chapitres porte, par chapitre, son rang (0 = écarté) et ses bornes (document + un ou plusieurs intervalles) ; et un verdict par notion existante (chapitre / hors programme / à vérifier). `src/lib/ingest/prompt.ts` : la consigne de l'étape chapitres dit qu'elle lit le texte seul, qu'elle statue sur CHAQUE notion existante avec ces trois réponses, que ne pas retrouver une notion dans le texte impose « à vérifier » et jamais « hors programme », qu'une partie qui se resserre se règle en créant un chapitre et en écartant l'ancien (§7.6). La relance (seuil 10 %) a sa propre variante, qui ne porte que sur les notions oubliées.
  - Critère d'acceptation : `tests/unit/planSchema.test.ts` et `tests/unit/prompt.test.ts` mis à jour : une réponse valide est lue avec bornes multiples et verdicts ; une valeur de verdict inconnue est écartée et comptée ; la consigne contient la règle « introuvable dans le texte ⇒ à vérifier ». Lint, tests et build passent.
  - Fichiers : `src/lib/ingest/wireSchema.ts`, `src/lib/ingest/planSchema.ts`, `src/lib/ingest/prompt.ts`, tests associés
  - Dépend de : T3

- [x] **T6 — Étape 1 branchée : texte seul, bornes, verdicts, seuils**
  - `ingestChapters` (`src/lib/ingest/run.ts`) : lit le texte de chaque PDF avec `pdf.ts`, envoie le texte seul (plus un mini-PDF des seules pages pauvres en texte, selon `slicing.ts`), avec tous les chapitres et **toutes les notions existantes** ; applique création de chapitres, rangs, ordre tout-ou-rien et garde « jamais tous » ; enregistre bornes et verdicts dans le lot d'import (écriture unique, pas de concurrence à cette étape) ; rend à l'écran la décision de seuil. Nouvelle action de relance (`src/app/actions/aiIngest.ts`, wrapper fin avec `requireManager`) qui ne redemande que les oubliées ; à 25 % après relance, la mise à jour est annulée sans rien écrire et l'écran reçoit une cause pour prévenir l'utilisateur. La vérification de l'échelle du découpage (`withChapterRetry`, trop fin et trop grossier) est conservée.
  - Critère d'acceptation : le journal enregistre l'étape et ses jetons ; aucune image de page à texte suffisant ne part (vérifiable par un test unitaire de la fonction qui compose l'entrée de l'étape, avec un fournisseur factice) ; lint, tests et build passent.
  - Fichiers : `src/lib/ingest/run.ts`, `src/lib/ingest/providers/claude.ts`, `src/lib/ingest/passInput.ts`, `src/app/actions/aiIngest.ts`, tests
  - Dépend de : T1, T2, T5

- [x] **T7 — Étape 2 par chapitre, avec seconde vérification**
  - Nouvelle fonction (dans `run.ts`) + action serveur : pour UN chapitre, découpe ses pages (`slicing.ts` + `pdf.ts`), remet la tranche au fournisseur, envoie la tranche (texte et images), les notions qui lui sont attribuées et la liste de seconde vérification étiquetée ; crée les nouvelles notions directement dans ce chapitre (le filtre mécanique `findExistingMatch`/`dropNearDuplicates` de `duplicates.ts` reste) ; rend à l'écran les notions de seconde vérification qu'il réclame. Libère la tranche remise au fournisseur en fin d'appel. `documentsForPass` reflète la nouvelle règle.
  - Critère d'acceptation : tests unitaires de la composition de l'entrée (un fournisseur factice reçoit les seules pages du chapitre et la liste étiquetée) ; lint, tests et build passent.
  - Fichiers : `src/lib/ingest/run.ts`, `src/lib/ingest/passInput.ts`, `src/lib/ingest/prompt.ts`, `src/app/actions/aiIngest.ts`, tests
  - Dépend de : T6

- [x] **T8 — Finalisation : départage, sans chapitre, ménage**
  - L'action de finalisation reçoit de l'écran les réclamations de tous les chapitres, **revalide chaque référence** (notion et chapitre de cet atelier, chapitre visible), applique départage et sort final (T4), efface les notions NEUVES restées sans chapitre (ménage existant, `planImportCleanup`), cache les chapitres qui ne gardent que des notions non placées (`hideEmptyChapters` avec `stranded`), et écrit les arbitrages au compte-rendu.
  - Critère d'acceptation : test unitaire de la revalidation (une référence d'un autre atelier ou d'un chapitre caché est ignorée et comptée) ; lint, tests et build passent.
  - Fichiers : `src/lib/ingest/run.ts`, `src/lib/ingest/ingest.ts`, `src/app/actions/aiIngest.ts`, tests
  - Dépend de : T4, T7

- [x] **T9 — Vérification finale des redites**
  - Une fois toutes les étapes 2 finies : `flagSimilar` (`duplicates.ts`) entre les notions neuves de ce lot et les notions des AUTRES chapitres ; s'il y a des paires, UN appel (nouvelle étape `redites` : schéma, consigne « redite ou pas », `PASS_MODELS`) ; pour chaque redite confirmée, seule la notion NEUVE s'efface — la règle est une fonction pure testée qui ne peut rendre que la candidate —, ses questions déjà écrites sont rattachées à l'autre (`reattachQuestions`). Pas d'appel si aucune paire. Nouvelle action serveur, appelée par l'écran en parallèle des questions.
  - Critère d'acceptation : test unitaire garantissant qu'une notion préexistante n'est jamais rendue comme « à effacer », même si le modèle la désigne ; test « aucune paire ⇒ aucun appel » ; lint, tests et build passent. Ferme l'item de backlog « Une ancienne notion peut sortir du programme ».
  - Fichiers : `src/lib/ingest/duplicates.ts`, `src/lib/ingest/run.ts`, `src/lib/ingest/prompt.ts`, `src/lib/ingest/wireSchema.ts`, `src/lib/ingest/providers/claude.ts`, `src/app/actions/aiIngest.ts`, tests
  - Dépend de : T7

- [x] **T10 — Questions dès qu'un chapitre est prêt**
  - Le plan d'appels de questions se calcule par chapitre (`countParcoursCalls`) dès la fin de SON étape 2, sur l'existant arrêté à l'ouverture du lot (`parcoursQuestionCountsByLevel`, `importOpenedAt`) ; la part du plafond d'import (`budgetShare`) est réservée chapitre par chapitre pour que la somme ne dépasse jamais `MAX_QUESTIONS_PER_IMPORT`. Côté examen, ne rien changer d'autre que ce qui casserait.
  - Critère d'acceptation : test unitaire de la réservation : des chapitres qui démarrent dans un ordre quelconque ne dépassent jamais le plafond, et chacun reçoit sa part ; lint, tests et build passent.
  - Fichiers : `src/lib/ingest/passInput.ts`, `src/lib/ingest/run.ts`, `src/app/actions/aiIngest.ts`, tests
  - Dépend de : T7

- [x] **T11 — L'écran de génération suit le nouvel ordre**
  - `src/components/ai/AiGenerationDialog.tsx` : étape 0 (si consigne) → étape 1 → relance si demandée → annulation avec message si demandée → étape 2 de tous les chapitres en parallèle (`mapWithConcurrency`, `INGEST_CONCURRENCY`), chacun enchaînant ses questions dès qu'il a fini → quand toutes les étapes 2 sont finies : vérification des redites en parallèle des questions restantes → finalisation. Nouvelles chaînes (relance, annulation, redites) dans `messages/fr.json` ET `messages/en.json`, espace `ai`. Le battement du verrou (`beatWorkshopImport`) et l'annulation existante sont préservés.
  - Critère d'acceptation : lint, tests et build passent ; aucune chaîne en dur ; l'écran n'appelle plus aucune action de l'ancien enchaînement.
  - Fichiers : `src/components/ai/AiGenerationDialog.tsx`, `messages/fr.json`, `messages/en.json`
  - Dépend de : T6, T7, T8, T9, T10

- [x] **T12 — Suppression de l'ancien enchaînement**
  - Retirer : la passe notions document par document (`ingestDocumentNotions` et son action), la passe de rangement (`ingestAssignments`, `assign` dans `IngestPass`, `PASS_MODELS`, consigne `assignInstruction`, schémas, `NOTIONS_PER_ASSIGN_BATCH`), le cache de prompt (`shouldCacheDocuments` et marqueurs), et leurs tests devenus sans objet. Tout ce qui reste utile (ex. `splitUnplaced`) est soit réutilisé par T4/T8, soit supprimé.
  - Critère d'acceptation : `grep -rn "ingestAssignments\|assignInstruction\|shouldCacheDocuments\|NOTIONS_PER_ASSIGN_BATCH" src tests` ne rend rien ; lint, tests et build passent.
  - Fichiers : `src/lib/ingest/*`, `src/app/actions/aiIngest.ts`, `tests/unit/*`
  - Dépend de : T11

- [x] **T13 — Relecture des étapes 0 et 3 contre l'architecture**
  - Pour chaque règle de `docs/architecture.md` §7.4, §7.5, §7.7 (hors portée d'examen), §7.9 et §7.10, vérifier le code (`run.ts`, `prompt.ts`, `resource.ts`, `passInput.ts`, `demand.ts`, `duplicates.ts`). Consigner la liste (règle → où elle est tenue, ou écart) dans la section « Journal » de ce fichier. Corriger dans ce commit les écarts qui tiennent en une petite modification testée ; mettre les autres dans « Tâches mises de côté » avec une recommandation.
  - Critère d'acceptation : chaque règle de ces sections apparaît dans la liste ; lint, tests et build passent.
  - Fichiers : ceux cités, et ce fichier
  - Dépend de : T12

- [x] **T14 — Essai réel sur un atelier jetable**
  - Démarrer le site (`preview_start`, configuration `culture` de `.claude/launch.json`), créer ou réutiliser un atelier nommé « Test chantier génération », y déposer un petit PDF de quelques pages, lancer UNE génération. **Si l'appel au modèle échoue pour une raison de clé ou d'accès (clé invalide, expirée, crédit épuisé), ne pas insister** : noter l'échec au journal et cocher la tâche — Alexis vérifiera lui-même. Sinon, vérifier à l'écran que des chapitres, des notions rangées et des questions apparaissent, et que le bandeau d'annulation s'affiche. Au plus deux générations au total. Ne jamais toucher un autre atelier.
  - Critère d'acceptation : une ligne au journal décrivant le résultat (succès avec les chiffres affichés, ou échec d'accès) ; commit de ce fichier.
  - Fichiers : ce fichier
  - Dépend de : T13

- [x] **T15 — Documents à jour**
  - `docs/architecture.md` §7 : vérifier qu'il décrit exactement le code livré (et rien de l'ancien enchaînement) ; consigner en annexe, très brièvement, un piège rencontré s'il y en a eu. `docs/backlog.md` : retirer l'item « Passer la génération à l'architecture par tranches » en gardant ses deux sous-items (lecture des scans au dépôt, examen limité à une partie) remontés en items autonomes au T1 2027 ; retirer « Aucun plafond sur le nombre d'appels de la passe rangement » et « Une ancienne notion peut sortir du programme » ; ajouter tout écart mis de côté. Respecter la règle du backlog (`CLAUDE.md` §1) : renvoyer aux documents, ne pas recopier.
  - Critère d'acceptation : aucune mention de la passe de rangement ni du cache de prompt comme mécanisme actuel dans `docs/architecture.md` ; lint, tests et build passent.
  - Fichiers : `docs/architecture.md`, `docs/backlog.md`
  - Dépend de : T14

## Journal
<!-- Append-only. Une ligne par tâche terminée : date, tâche, commit, note. -->
- 2026-09-22 — T1 — df07b7d — `pdf.ts` : `readPdfText` (via `extractText` d'unpdf sur une copie du tampon), `countPdfPages`, `extractPdfPages` (pages 1-based, hors bornes ignorées, `null` si rien).
- 2026-09-22 — T2 — 4e5175d — `slicing.ts` : `sliceChapters` (bornes → pages par chapitre, `pages: null` = document entier) et `imagePages` (`MIN_PAGE_TEXT_CHARS = 200`, espaces exclus).
- 2026-09-22 — T3 — 38ea356 — `verdicts.ts` : `classifyNotions`, `mergeRelaunch`, `thresholdDecision` (`MIN_FORGOTTEN_TO_ACT = 2`), `recheckList`.
- 2026-09-22 — T4 — d5315fe — `verdicts.ts` : `guardDrops` (garde « jamais tous », déjà branchée dans `ingestChapters`) et `finalFates` (départage + sort des non réclamées, rend aussi les arbitrages).
- 2026-09-22 — T5 — da476d2 — bornes dans `chapterOrder[].spans` (document par NOM, pages d'après des marqueurs « [page N] » que T6 doit insérer dans le texte), `notionVerdicts` ; `ParsedPlan.chapterBounds`/`notionVerdicts` ; `chaptersRelaunchInstruction` + `wireChaptersRelaunchOutput` ; le bloc « existant » de l'étape chapitres porte désormais toutes les notions. Transitoire : l'ancien rangement ne reçoit plus de pages de chapitre jusqu'à T12.
- 2026-09-22 — T6 — 7cebd45 — `chaptersInput.ts` (texte + mini-PDF des pages pauvres, remis via `provider.prepare`, rendus en fin d'appel) ; `ingestChapters` n'écrit rien sur `relaunch` (réponse gardée dans `scope.stage1Pending`), `ingestChaptersRelaunch` + action `relaunchWorkshopChapters` ; à l'écriture, `scope.stage1` = chapitres visibles en ordre avec bornes résolues en `documentId`, `standings`, `before`, `pageCounts`. Les notions rangées franchement sont déplacées dès l'étape 1. Étape journal `chapters-relaunch`.
- 2026-09-22 — T7 — 6bde3b8 — `ingestChapterNotions` + action `ingestWorkshopChapterNotions(chapterId)` ; `composeChapterSlices` (extraits téléversés puis rendus, document entier réutilisé tel quel) ; sortie `{ notions, claimed }` ; variante `'chapter' in scope` de la passe notions (l'ancienne par document reste jusqu'à T12).
- 2026-09-22 — T8 — babbe6f — `finishIngestion(workshopId, importId, claims)` : `revalidateClaims` (chapitre du lot ET visible, notion de la seconde vérification du lot) → `finalFates` → `applyAssignments` des seuls sorts décidés après l'étape 1 → `hideEmptyChapters(strandedNotions)` → ménage existant. L'action `finishWorkshopIngestion` prend `claims` et rend `adjusted`.
- 2026-09-22 — T9 — c5e5037 — `rediteCandidates` / `judgeRedites` / `rediteRemovals` (duplicates.ts), passe et étape journal `redites` (Sonnet), `ingestRedites` + action `checkWorkshopRedites` ; une notion effacée voit d'abord ses questions rattachées (les liens partent ensuite en cascade avec elle).
- 2026-09-22 — T10 — f7ef8e8 — `createBudgetLedger(parts = chapterStartBudgets)` dans passInput (pur, importable par l'écran) ; le serveur calculait déjà le plan d'un chapitre sur SES notions et l'existant figé à l'ouverture du lot — rien à y changer. Le branchement à l'écran est pour T11.
- 2026-09-22 — T11 — 1b35783 — `generate()` réécrit : étape 0 → chapitres (relance / annulation `cancelledForgotten`) → notions de tous les chapitres (`INGEST_CONCURRENCY`), chacun lançant ses questions (registre de parts) → redites en parallèle des questions restantes → `finishWorkshopIngestion(claims)`. L'examen attend la fin des étapes notions, inchangé sinon. Clés `progress.notionsDocuments` et `progress.assign` retirées. Rendu non vérifié à l'écran ici — l'essai réel est T14.
- 2026-09-22 — T12 — 54096fe — retirés : passe notions par document (+ action), passe `assign` (fonction, action, consigne, schéma de sortie, modèle, étape journal), cache de prompt, `splitUnplaced`/`batchNotions`, index de document de `documentsForPass`. Le grep du critère ne rend rien. Gardé : `assignments` dans `parsePlan` (contrat générique d'un plan, hors étapes du modèle).
- 2026-09-22 — T13 — 1814941 — relecture ; un seul écart, corrigé : un échec d'appel à l'étape 0 faisait échouer la génération (§7.4) → `ingestResource` rend « rien écrit » sauf annulation (non testable sans base : relu, lint et build). Règle → où elle est tenue :
  - §7.4 déclenchée seulement par une consigne → écran (`withResource`) + serveur (`rawHintOf` vide ⇒ rien) · trois gestes → `wireResourceOutput` · nombre d'examen seulement à l'examen → `examQuestionCount` rendu si `context === 'exam'` · depuis l'examen : ni document, ni catalogue, ni second tour → `isExam` dans `resourceStep` + `wireResourceOutputExam` · un seul document de l'IA → colonne `generated` + `writeGeneratedFile` · en-tête posée par le code → `composeDocument` · noms d'abord, tout le corpus si elle écrit → `granted` · consigne = donnée, retrait silencieux mais journalisé → `RESOURCE_SYSTEM` + `partieEcartee` au journal · consigne réécrite fait autorité même vide → `userHintOf` (`'instruction' in scope`) · ne fait jamais échouer → **corrigé**.
  - §7.5 ordre d'autorité, fidélité > exhaustivité, expliciter ≠ ajouter, document faisant foi même fictif, existant = matière → `SYSTEM` (prompt.ts) · QCM : fausses par rapport à la notion, pas de « toutes/aucune », pas de forme négative au parcours → consigne `qcm` de `responseTypeLines` · temps de réponse → table des durées par niveau (prompt.ts) · notion lue seule, réutiliser sur les faits → `NOTION_RULES` · titre de l'atelier = déduction → `workshopBlock`.
  - §7.7 (hors portée d'examen) 24 questions de niveau 1 par chapitre neuf → `CHAPTER_START_QUESTIONS` · total d'examen 1–200, 40 par défaut → `EXAM_QUESTIONS_RANGE`, `DEFAULT_EXAM_QUESTIONS` · 8 par appel parcours, 6 examen → `QUESTIONS_PER_PARCOURS_CALL`, `EXAM_QUESTIONS_PER_CALL` · forme homogène par appel, groupés répartis → `planExamCalls` · tailles de groupe conseillées une fois, groupes d'abord, décor dans la 1re question → `examInstruction` · pas de recopie entraînement → examen, seuil strict → `dropRepeatedQuestions` (`VERBATIM_REPEAT`) · rattrapage une fois → écran (`catchUp`) · aucune similarité vérifiée entre questions → aucun appel de `proximity` sur les questions hors recopie.
  - §7.9 intégrité refusée à l'écriture (notion inconnue ou d'un autre atelier, niveau hors bornes, type inventé, groupe vide, énoncé vide) → `parsePlan` / `resolveQuestion` · réparer (anciens types, Bloom 5–6) vs rejeter → `responseTypeSchema`, `bloomSchema` · écarter et compter → `discarded` · saisie manuelle refusée d'un bloc → `questionIntegrity.ts` · validation stricte avant normalisation → ordre `parsePlan` puis écriture · question sans notion permise → `notions` par défaut `[]`.
  - §7.10 déclenchée au lancement d'un exercice, après la question, survit à l'onglet → route `parcours/refill` (`after()`) · couples en manque du membre, tout le chapitre remis à la cible → `chapterShortages` · plafond, délai de garde, trace → `MAX_REFILL_QUESTIONS`, `REFILL_COOLDOWN_MS`, `createImport` · seuils absolus un cran au-dessus → `parcoursRadar` · une seule forme de demande → `QuestionDemand` · plafond sur les notions secondaires → consigne questions + `demand.ts` · contexte = tout le chapitre (150), existant plafonné à 300 par proximité de niveau, récence, tour de rôle → `contextNotions`, `pickExistingQuestions` · la recharge ne bat jamais → lot sans `beat_at`.
- 2026-09-22 — T14 — (pas de commit de code) — **essai NON réalisé, échec d'accès** : `preview_start` est refusé aux sessions planifiées (« nobody is present to approve the command »), et aucun serveur local ne tournait (ports 3000 et 3001 muets). Aucun atelier n'a été créé ni touché. ⚠️ **À faire par Alexis avant de fusionner** : un atelier « Test chantier génération », un petit PDF de quelques pages, une génération — vérifier chapitres, notions rangées, questions, bandeau d'annulation, et dans le journal les étapes `chapters`, `notions` (une par chapitre), `redites`. Un PDF d'essai de 4 pages (cycle de l'eau / fleuves, dont une page pauvre en texte) peut se régénérer avec `pdf-lib`.
- 2026-09-22 — T15 — c9f8ce9 — §7.6 ne présente plus le rangement comme mécanisme actuel ; annexe I (tampon PDF détaché, rien d'écrit avant le seuil). Backlog : item « par tranches » remplacé par « tester sur de vrais cours, puis fusionner » (avec le risque redites/questions), ses deux sous-items remontés au T1 2027, les deux items T4 retirés.

## Décisions prises en autonomie
<!-- L'agent y consigne ses arbitrages de nuit. Alexis les relit au réveil. -->
- **Document que rien ne couvre** (aucune borne de l'étape 1 ne le désigne) : il part en entier dans CHAQUE chapitre, et c'est signalé au compte-rendu. Retenu parce que l'architecture dit « en cas de doute, élargir » et qu'une page perdue est le pire défaut ; plus cher, mais rare.
- **Seuil de page pauvre en texte : 200 caractères hors espaces** (`MIN_PAGE_TEXT_CHARS`), soit deux ou trois lignes — une page de titre part donc aussi en image, ce qui est voulu (§7.2).
- **Verdict « chapitre » vers un chapitre inconnu** : ignoré, la notion compte donc comme oubliée (et pèse dans les seuils). Même règle que partout ailleurs — une référence inconnue ne décide rien.
- **Silence sur une notion d'un chapitre écarté** : vaut « hors programme », pas « oubliée » (elle y est laissée, §7.6) — elle ne pèse donc pas dans les seuils, et repasse quand même en seconde vérification.
- **« Rien n'est écrit » avant la décision de seuil** : l'étape 1 n'écrit chapitres, rangs et déplacements qu'une fois la décision `continue` acquise (au premier passage ou après relance). Sinon l'annulation à 25 % aurait laissé des chapitres créés.
- **Notions d'un chapitre déjà caché avant la génération** : ni montrées à l'étape 1, ni jugées — elles sont déjà hors programme, et §7.6 dit que l'étape ne voit que les chapitres visibles.
- **Notions rangées franchement à l'étape 1** : déplacées tout de suite (et non à la finalisation), pour que l'étape notions et les questions de leur chapitre les voient.
- **Filtre mécanique de l'étape 2** : une notion neuve trop proche d'une notion du chapitre ou de la seconde vérification n'est pas écrite ; si elle redit une notion de la seconde vérification, celle-ci est comptée comme réclamée par le chapitre.
- **Provenance d'une notion neuve** (document, page) : posée seulement quand le chapitre n'a qu'un extrait ; avec plusieurs, on ne sait pas lequel, et elle reste vide plutôt que fausse.
- **Redites : au plus 300 paires soumises** (`MAX_REDITE_PAIRS`), les plus proches d'abord — l'appel ne doit pas devenir un second import. Une paire de deux notions neuves n'est soumise qu'une fois.
- **Échec de la vérification des redites** : ne fait pas échouer la génération (l'erreur est ajoutée au compte-rendu) — c'est un nettoyage, le programme est déjà écrit.
- **Risque accepté, à surveiller en T14** : la vérification des redites tourne en même temps que les questions ; si une question en vol vise une notion que la vérification vient d'effacer, son écriture peut échouer. Le cas suppose une notion neuve à la fois redite et en cours de questionnement ; si le journal le montre, faire attendre la finalisation plutôt que les questions.

## Tâches bloquées
<!-- Tâches abandonnées après 2 échecs, avec le motif et ce qui a été tenté. -->

## Tâches mises de côté
<!-- Tâches non tentées parce que le choix à faire était trop structurant pour être
     tranché en autonomie : options envisagées, recommandation, raison de ne pas
     avoir tranché. Ne pas confondre avec « Tâches bloquées » (échec technique). -->
