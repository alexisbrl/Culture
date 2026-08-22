# Chantier : réduire drastiquement le coût de l'ingestion IA

**Branche :** `feat/cout-ingestion-ia`
**PR :** https://github.com/alexisbrl/Culture/pull/45
**Cadré le :** 2026-08-22

> ⚠️ **Branche partie de `docs/revision-ingestion-volume`, pas de `main`.** C'est
> délibéré : toute la spécification de ce chantier vit au §16 de
> `docs/ai-ingestion-plan.md`, qui n'est pas encore mergé dans `main`. La PR de ce
> chantier contiendra donc aussi les deux commits de documentation. C'est cohérent
> — c'est le même corps de travail — mais ne t'en étonne pas.

## Objectif

L'ingestion IA fonctionne mais coûte un ordre de grandeur de trop. Un test réel
le 22/08/2026 a coûté **~20 $ sans produire une seule question**. La cause n'est
pas le modèle : on renvoie le cours entier (680 000 tokens) à chaque appel, y
compris pour rédiger des questions sur une notion de 280 caractères qui se suffit
à elle-même. Ce chantier restreint ce que chaque passe reçoit, rend la volumétrie
et le modèle paramétrables, et pose deux garde-fous.

Projection : sur le corpus de test, la passe questions serait passée de **~287 $ à
~8,50 $**.

## Critère de réussite global

Les trois commandes passent, dans cet ordre :

```
npm run lint        # 0 erreur (les warnings « React Compiler » préexistants sont normaux)
npm run typecheck
npm run build       # obligatoire — tsc seul ne détecte pas les casses Turbopack
npm run test:unit
```

**Et** un test unitaire avec fournisseur factice prouve que la passe questions ne
reçoit **aucun document** et que son entrée reste bornée.

Le gain réel ne sera constaté qu'au prochain import réel d'Alexis, qui n'a plus de
crédit API. **Ce n'est pas ton problème : ne cherche jamais à appeler l'API.**

## Décisions arrêtées avec Alexis

- **Répartition Bloom par défaut : 8 / 4 / 0 / 0** — 8 questions de niveau 1,
  4 de niveau 2, aucune de niveau 3 ni 4. Les niveaux supérieurs relèveront de la
  recharge automatique, hors de ce chantier (§16.1).
- **`MAX_QUESTIONS_PER_IMPORT` : 300**, le temps des tests. Paramétrable.
- **Relance de la passe chapitres au-delà de 12 chapitres.** Borne souple annoncée
  au modèle : 3 à 8. **Une seule relance, jamais deux.**
- **Modèle par défaut : Haiku 4.5 sur les trois passes**, avec **bascule
  automatique vers Sonnet 5** si le corpus dépasse la fenêtre de Haiku (200 K
  tokens), journalisée.
- **Passe questions par lots de ~10 notions** (pas une notion par appel) : le
  contexte du chapitre est alors envoyé une fois pour dix notions.
- **Estimation de coût bloquante** avant le premier appel, à confirmer d'un clic.
  **Marquée temporaire dans le code** — phase de test uniquement.
- **Suppression des fichiers chez le fournisseur à l'annulation ET en fin
  d'import réussi.**
- **TTL de cache : 5 minutes**, et marqueur posé uniquement si le document sert à
  plus d'un appel (§16.17).

### Deux refus produit, non négociables

1. **Aucune validation humaine entre deux passes. Jamais.** Alexis l'a refusé
   explicitement : ça casse la magie du produit (§16.18). L'estimation de coût de
   T10 n'y contrevient pas — elle se produit **avant** que le premier appel parte,
   pas entre deux passes. Si une tâche te semble exiger un arbitrage humain en
   cours d'ingestion, **c'est que la tâche est mal comprise** : relis le §16.18.
2. **Aucun plafond de dépense.** Seule l'estimation avant lancement.

## Hors périmètre

Rien de ce qui suit ne doit être commencé, même si ça paraît naturel :

- **La file d'attente serveur** et tout ce qui exécuterait des appels hors du
  navigateur. Écarté du travail autonome pour une raison précise : il s'agit d'une
  boucle qui dépense de l'argent toute seule, et une erreur de bornage ne
  s'interrompt pas d'elle-même.
- **Le parallélisme et le préchauffage `max_tokens: 0`** (§16.5) — après mesure.
- **La recharge automatique** (§16.19) et la **génération paresseuse** (§16.7).
- **Le changement de fournisseur** (DeepSeek ou autre). Ne crée pas
  `providers/deepseek.ts`.
- **Les versions d'examen par graine** (§16.12) et le **générateur d'examen**
  (§16.10, §16.11).
- **La vectorisation** sous toutes ses formes (§16.21). N'installe pas `pgvector`.
- **Le balayage périodique** des fichiers orphelins (la suppression ciblée de T11
  suffit).

## Zones interdites

- **Toute migration Supabase.** Aucune n'est nécessaire — vérifié au cadrage : la
  répartition Bloom vit dans le prompt, `bloom_level` accepte déjà 1 à 6, et
  `file_ids` existe sur `ai_imports`. Le hook `chantier-guard` les bloque de toute
  façon pendant un chantier. Si tu crois en avoir besoin, **c'est un signal que tu
  t'égares** : consigne-le dans « Tâches mises de côté ».
- **`src/lib/workshops/exam.ts`** — la conversion stockage ↔ `Question`, le
  fichier le plus délicat du projet, et sans rapport avec ce chantier.
- **L'import `a9d456ec-5982-4f5c-be2e-fd57a5cbb10f`** dans `ai_imports` : ne
  l'annule pas, ne le modifie pas. Il sert de cas de test futur.
- **Le Jardin** (`src/app/[locale]/garden/`) et les sections de Paramètres autres
  que Ressources et Chapitre & Notion.
- **`src/lib/database.types.ts`** — généré, jamais édité à la main.

## Sources de vérité

- **`docs/ai-ingestion-plan.md` §16 en entier** — c'est LA source. Les §16.15 à
  §16.23 corrigent plusieurs points des §16.1 à §16.14 ; en cas de contradiction,
  **les sections les plus hautes en numéro font foi**.
- `CLAUDE.md` §1 (règles absolues) et §7 (tests).
- `.claude/rules/server-architecture.md` — pattern `lib/` + wrapper, piège
  Turbopack sur les re-exports de type dans un fichier `'use server'`.
- `.claude/rules/i18n.md` — pour T10, seule tâche qui touche à l'interface.
- Le code existant : `src/lib/ingest/` (5 fichiers + `providers/`),
  `src/app/actions/aiIngest.ts`, `src/components/ai/AiGenerationDialog.tsx`.

## Rappels de méthode

- **Un commit par tâche, sans exception.** C'est la seule protection contre une
  coupure de quota : ce qui n'est pas commité est perdu.
- **Aucun test ne touche au réseau ni à Supabase** (`CLAUDE.md` §7). Les tests
  utilisent un **fournisseur factice** implémentant `PlanProvider` — `run.ts`
  accepte déjà `options.provider`, c'est prévu pour ça.
- **Toute chaîne visible passe par next-intl, dans `fr.json` ET `en.json`.**
  Concerne uniquement T10.
- Après deux échecs sur une tâche, **passe à la suivante** et consigne dans
  « Tâches bloquées ».

## Tâches

- [ ] **T1 — Donner une portée au bloc « existant »**
  - `existingContentBlock` reçoit une portée et ne rend que ce que la passe
    utilise : les chapitres seuls en passe chapitres, les notions du chapitre
    traité en passe notions, les énoncés des seules notions traitées en passe
    questions.
  - Conséquence assumée et voulue : **les questions sans notion ne sont jamais
    transmises**, donc jamais protégées du doublon (§16.3).
  - Critère d'acceptation : un test prouve qu'en passe questions le bloc contient
    les énoncés des notions données et **aucun** énoncé rattaché à une autre
    notion ; `npm run test:unit` passe.
  - Fichiers : `src/lib/ingest/prompt.ts`, `tests/unit/prompt.test.ts`
  - Dépend de : rien

- [ ] **T2 — Restreindre les chargeurs**
  - `loadExistingContent` (aujourd'hui une seule fonction qui lit tout l'atelier)
    devient trois chargeurs, un par passe, alignés sur les portées de T1.
  - Critère d'acceptation : aucun chargeur ne fait plus de `select` sans filtre de
    chapitre ou de notion, hors passe chapitres ; `npm run build` passe.
  - Fichiers : `src/lib/ingest/run.ts`
  - Dépend de : T1

- [ ] **T3 — La passe questions ne reçoit plus les documents**
  - `ingestChapterQuestions` cesse d'appeler `preparedOf` : le fournisseur reçoit
    un tableau de documents **vide**. `claude.ts` doit alors ne poser aucun bloc
    `document` ni aucun marqueur de cache.
  - À la place, le prompt reçoit les notions traitées **et leurs voisines du même
    chapitre** (§16.21) — c'est ce qui remplace le cours pour les niveaux
    supérieurs de Bloom.
  - Critère d'acceptation : un test avec fournisseur factice capture l'appel et
    vérifie qu'en passe questions `documents.length === 0`.
  - Fichiers : `src/lib/ingest/run.ts`, `src/lib/ingest/providers/claude.ts`,
    `src/lib/ingest/providers/types.ts`, `tests/unit/`
  - Dépend de : T2

- [ ] **T4 — Passe questions par lots de ~10 notions**
  - L'unité de travail passe du chapitre au **lot de notions**. Le dialogue boucle
    sur les lots.
  - Critère d'acceptation : un chapitre de 25 notions produit **exactement 3
    appels** (10, 10, 5), vérifié par test avec fournisseur factice.
  - Note : la barre de progression devient plus grossière (une étape par lot au
    lieu d'une par chapitre). C'est accepté.
  - Fichiers : `src/lib/ingest/run.ts`, `src/components/ai/AiGenerationDialog.tsx`
  - Dépend de : T3

- [ ] **T5 — Volumétrie paramétrable**
  - `QUESTIONS_PER_NOTION` (aujourd'hui `4`) devient une **répartition par niveau
    de Bloom**, défaut `{1: 8, 2: 4, 3: 0, 4: 0}`. `MAX_QUESTIONS_PER_IMPORT`
    passe de `50` à `300`.
  - `questionsInstruction` reflète la répartition au lieu de la phrase actuelle
    « 4 questions par notion, une par niveau ».
  - Critère d'acceptation : un test change la répartition et vérifie que
    l'instruction produite change en conséquence ; un niveau à `0` n'apparaît pas
    dans l'instruction.
  - Fichiers : `src/lib/ingest/prompt.ts`, `tests/unit/prompt.test.ts`
  - Dépend de : rien (peut se faire avant T1 si besoin)

- [ ] **T6 — Consigne chapitres : N documents = UN SEUL cours**
  - `chaptersInstruction` reçoit la liste des noms de fichiers et dit
    explicitement que **l'ensemble forme un seul cours** à découper globalement —
    pas un cours par document. Elle donne aussi l'ordre de grandeur souple :
    typiquement **3 à 8 chapitres**, davantage pour un programme annuel, **sans en
    faire une contrainte** (le modèle doit pouvoir en sortir si c'est justifié).
  - Contexte : l'instruction actuelle dit « Découpe **le** document » au singulier
    alors qu'il en reçoit sept, nommés « Chapitre 1.pdf » à « Chapitre 6.pdf ».
    C'est l'origine directe des 28 chapitres (§16.15).
  - Critère d'acceptation : un test vérifie que l'instruction contient les noms de
    fichiers fournis, la mention d'un cours unique, et la borne 3-8.
  - Fichiers : `src/lib/ingest/prompt.ts`, `src/lib/ingest/providers/claude.ts`,
    `tests/unit/prompt.test.ts`
  - Dépend de : rien

- [ ] **T7 — Relance automatique au-delà de 12 chapitres**
  - Si la passe 1 rend plus de **12** chapitres, `startIngestion` relance **une
    seule fois** avec une instruction resserrée qui rappelle le nombre obtenu et
    demande de reconsidérer si certains chapitres ne sont pas des sous-parties.
    Si la seconde réponse dépasse encore, **on écrit ce qu'elle donne** et on
    continue : jamais de blocage, jamais de troisième appel.
  - Critère d'acceptation : fournisseur factice rendant 28 puis 6 → 6 chapitres
    écrits, 2 appels. Rendant 28 deux fois → 28 écrits, 2 appels, aucune
    exception levée.
  - Fichiers : `src/lib/ingest/run.ts`, `src/lib/ingest/prompt.ts`, `tests/unit/`
  - Dépend de : T6

- [ ] **T8 — Modèle paramétrable par passe + bascule automatique**
  - `MODEL` (constante en dur) devient une configuration par passe, défaut
    **Haiku 4.5** partout. Si le corpus dépasse la fenêtre du modèle choisi
    (200 000 tokens pour Haiku 4.5), bascule automatique sur **Sonnet 5**, avec
    une trace journalisée.
  - Documente la contrainte en commentaire : ce n'est **pas** une question de
    qualité, l'appel serait purement refusé.
  - Critère d'acceptation : la fonction de sélection est **pure** et testée —
    (modèle souhaité, taille du corpus) → modèle retenu ; 300 000 tokens avec
    Haiku demandé rend Sonnet 5.
  - Fichiers : `src/lib/ingest/providers/claude.ts`, `tests/unit/`
  - Dépend de : rien

- [ ] **T9 — TTL 5 minutes et marqueur de cache conditionnel**
  - Le TTL passe de `1h` à 5 minutes (défaut, donc `cache_control` sans `ttl`). Le
    marqueur n'est posé que si le document servira à **plus d'un appel** — sinon
    c'est une perte sèche de 25 % sur cet appel (§16.17).
  - Critère d'acceptation : la décision est une fonction pure testée ; un document
    utilisé une seule fois ne reçoit pas de marqueur.
  - Fichiers : `src/lib/ingest/providers/claude.ts`, `tests/unit/`
  - Dépend de : T3

- [ ] **T10 — Estimation de coût bloquante avant lancement**
  - ⚠️ **Piège d'ordonnancement, à ne pas rater** : pour estimer avant de lancer,
    les documents doivent déjà être chez le fournisseur. Découpe donc
    `startIngestion` en **deux** actions : une préparation (téléversement via
    `prepare`, comptage via `messages.countTokens`, création du lot par
    `createImport` qui conserve les `file_ids`), puis le lancement de la passe
    chapitres qui **réutilise** ces `file_ids`. **Ne téléverse jamais deux fois.**
  - `countTokens` est **gratuit** et a ses propres limites de débit — vérifié le
    22/08/2026.
  - Le dialogue affiche taille du corpus et coût estimé, et attend un clic.
  - **Marque le tout `// TEMPORAIRE — phase de test` en commentaire**, avec la
    raison : ce garde-fou doit pouvoir être retiré d'un bloc.
  - Chaînes visibles en next-intl, `fr.json` **et** `en.json`.
  - Critère d'acceptation : `npm run build` passe ; le calcul du coût estimé est
    une fonction pure testée ; aucune chaîne codée en dur dans le composant.
  - Fichiers : `src/lib/ingest/run.ts`, `src/app/actions/aiIngest.ts`,
    `src/components/ai/AiGenerationDialog.tsx`, `messages/fr.json`,
    `messages/en.json`, `tests/unit/`
  - Dépend de : T8

- [ ] **T11 — Suppression des fichiers chez le fournisseur**
  - `PlanProvider` gagne une méthode `release(documents: PreparedDocument[])`.
    Chez Claude : `client.beta.files.delete`. Ces opérations sont **gratuites**.
  - Appelée à **deux** moments : à l'annulation d'un import
    (`cancelWorkshopImport`) et **en fin d'import réussi** — une fois la passe
    notions terminée, plus aucune passe n'a besoin des documents (conséquence
    directe de T3).
  - Un échec de suppression ne doit **jamais** faire échouer l'annulation ni
    l'import : journaliser et continuer.
  - Critère d'acceptation : test avec fournisseur factice — `release` est appelé
    avec les bonnes poignées dans les deux cas, et une exception levée par
    `release` ne remonte pas.
  - Fichiers : `src/lib/ingest/providers/types.ts`,
    `src/lib/ingest/providers/claude.ts`, `src/lib/workshops/imports.ts`,
    `src/lib/ingest/run.ts`, `src/app/actions/aiIngest.ts`, `tests/unit/`
  - Dépend de : T4

- [ ] **T12 — Corriger le tarif d'écriture de cache**
  - Une écriture de cache en TTL 1 h coûte **2× le prix d'entrée (10 $/M)**, pas
    1,25× (6,25 $/M) qui est le tarif du TTL 5 minutes.
  - **Deux endroits, pas un** : le §9 de `docs/ai-ingestion-plan.md` (tableau de
    coût et projections) **et** le commentaire de `cacheCreationTokens` dans
    `src/lib/ingest/providers/types.ts`, qui dit « facturés ~1,25× ».
  - Mentionne le seuil de rentabilité : 3 lectures en TTL 1 h, 2 en TTL 5 min.
  - Critère d'acceptation : plus aucune occurrence de « 1,25 » ni de « 6,25 »
    associée à une écriture de cache dans le dépôt.
  - Fichiers : `docs/ai-ingestion-plan.md`, `src/lib/ingest/providers/types.ts`
  - Dépend de : rien

## Journal
<!-- Append-only. Une ligne par tâche terminée : date, tâche, commit, note. -->

## Décisions prises en autonomie
<!-- L'agent y consigne ses arbitrages de nuit. Alexis les relit au réveil. -->

## Tâches bloquées
<!-- Tâches abandonnées après 2 échecs, avec le motif et ce qui a été tenté. -->

## Tâches mises de côté
<!-- Tâches non tentées parce que le choix à faire était trop structurant pour être
     tranché en autonomie : options envisagées, recommandation, raison de ne pas
     avoir tranché. Ne pas confondre avec « Tâches bloquées » (échec technique). -->
