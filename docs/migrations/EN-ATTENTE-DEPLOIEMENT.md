# En attente de déploiement

> **Point d'entrée unique** de tout ce qui doit être appliqué en base **une fois
> le code en ligne**, et de rien d'autre. Un simple « qu'est-ce qui reste à faire
> maintenant que c'est déployé ? » doit se répondre en lisant ce seul fichier.
>
> Si la section « À appliquer » ne contient que `AUCUN`, il n'y a rien à faire.

## Pourquoi ce fichier existe

La base Supabase (`hhkmrejjksjpfetwefju`) est partagée par le code local **et**
le code déployé sur get-culture.com. Une migration prend effet immédiatement, un
changement de code seulement après `push → PR → merge → déploiement Vercel`.

Les migrations **additives** (ajouter une colonne, une table) sont donc appliquées
tout de suite : le code en ligne les ignore. Les migrations **restrictives**
(supprimer, renommer, resserrer une contrainte, changer un type) doivent attendre
que le code qui utilisait l'ancienne forme ne soit plus en ligne — sinon la
production casse, souvent en silence (beaucoup de `select` ne lisent que
`{ data }` et ignorent `{ error }`). Voir `CLAUDE.md` §1, règle expand/contract,
et l'incident du 22/06/2026 dans `docs/changelog.md`.

## Mode d'emploi

1. Vérifier que la branche concernée est bien **mergée dans `main` et déployée**
   (Vercel, pas seulement la PR).
2. Appliquer les fichiers SQL listés ci-dessous, dans l'ordre.
3. Régénérer `src/lib/database.types.ts` si le schéma a changé.
4. **Cocher/retirer l'entrée de ce fichier** et laisser une ligne dans
   `docs/changelog.md`.

---

## À appliquer

AUCUN

---

## Appliqué / sans objet

- **31/08/2026 — `parcours_asked.answer_ms` et `parcours_asked.correct` supprimées**
  (`alter table public.parcours_asked drop column answer_ms, drop column correct;`),
  après le déploiement en production de la PR #49 (Vercel `READY` sur `440982f`,
  `get-culture.com` aliasé dessus). Le rythme ne vit plus que dans la colonne
  `answers`, une entrée par question répondue.
  - ⚠️ **Le prérequis noté ici jusqu'au 31/08/2026 était faux, et l'erreur vaut
    d'être gardée.** On attendait que les lignes d'avant `answers` sortent de la
    fenêtre de lecture du rythme, comme si le blocage était une question de
    DONNÉES. Il était de CODE : `recentAnswerPace` **nommait** les deux colonnes
    dans son `select`, et l'écriture les tenait à jour. Les supprimer sur ce
    prérequis-là aurait cassé la lecture du rythme quelle que soit l'ancienneté
    des lignes, et **en silence** — ce `select` ignore délibérément son erreur
    pour ne jamais faire échouer une correction qu'un membre vient de demander.
  - **La règle à retenir : un prérequis de suppression se vérifie sur ce que le
    code NOMME, jamais seulement sur ce que les lignes contiennent.** L'origine
    de l'erreur était une note de référence périmée (`.claude/rules/server-architecture.md`),
    corrigée dans la même PR — une note fausse est plus dangereuse qu'une note
    absente, on la croit sur parole au lieu d'aller voir.
  - Aucune ligne n'a été supprimée : la ligne qu'on croyait bloquante ne
    bloquait rien.

- **31/08/2026 — `2026-08-28-bloom-uniquement-par-notion.sql`, étape 2 appliquée**
  (`alter table public.exam_question_items drop column bloom_level;`), après le
  déploiement en production de la PR #48 (Vercel `READY` sur `b420b0e`). Deux
  vérifications avant de supprimer, à refaire telles quelles pour toute
  suppression du même genre : (1) plus aucune écriture n'alimentait la colonne —
  l'insertion des énoncés ne la mentionne plus ; (2) les **108 énoncés dont le
  niveau n'existait qu'ici n'avaient aucune notion attachée**, donc aucun couple
  question ↔ notion n'a perdu son niveau (592 liens, tous renseignés). Un énoncé
  sans notion ne porte pas de couple : son niveau n'avait plus de sens dans le
  nouveau modèle. `src/lib/database.types.ts` mis à jour.

- **30/08/2026 — `2026-08-30-rythme-par-question.sql` appliquée le jour même.**
  Purement additive (`parcours_asked.answers`, jsonb, défaut `[]`) : le code en
  ligne l'ignore, les lignes existantes valent tableau vide et restent lues par
  les colonnes qu'elle remplace. `src/lib/database.types.ts` régénéré.

- **29/08/2026 — `2026-08-29-une-generation-a-la-fois.sql` appliquée le jour
  même.** Purement additive (`ai_imports.beat_at`, `ai_imports.closed_at`, un
  index partiel) : le code en ligne les ignore, rien à attendre.
  `src/lib/database.types.ts` régénéré dans la foulée.

- **19/08/2026 — Tout le retard de migrations soldé après le déploiement de la
  PR #40** (`7532c78`, production Vercel `READY`). Les six entrées ci-dessous
  attendaient toutes le même prérequis — que le code déployé n'utilise plus les
  objets visés — levé d'un coup par ce déploiement. Ordre suivi : sauvegarde
  JSON des 121 lignes d'`exam_questions` **hors du repo** (il est public), puis
  phase 1 des notions (données), puis les suppressions, puis régénération de
  `src/lib/database.types.ts`, `npm run typecheck` + `lint` + `build` au vert.
  - `2026-08-19-notion-texte-unique.sql` **phase 1** : 4 notions avaient une
    description, recollée à leur titre (1 dépasse désormais 280 caractères et
    devra être raccourcie à sa prochaine modification).
  - `2026-08-11-groupes-de-questions-contract.sql` : prérequis vérifié à 0
    groupe sans question principale ; les 14 colonnes de contenu supprimées et
    la table `exam_question_bricks` retirée (son unique lien vérifié comme
    repris dans `exam_question_item_bricks`).
  - `2026-08-11-drop-question-type.sql` : colonne `question_type` supprimée.
  - `2026-08-19-question-sans-titre.sql` : colonne `title` supprimée — 46
    questions portaient encore un titre figé et affichent désormais leur énoncé.
  - `2026-08-19-question-sans-chapitre.sql` : colonne `chapter_id` supprimée.
    22 questions de parcours portaient un rattachement manuel, dont **21 sans
    aucune notion rangée dans un chapitre** : elles ne sont tirées par aucun
    exercice tant qu'on ne leur aura pas relié une telle notion. C'était déjà le
    cas avant la migration (le code déployé passe par les notions) ; ce que la
    suppression fait perdre, c'est la trace du rattachement d'origine —
    conservée dans la sauvegarde JSON.
  - `2026-08-19-notion-texte-unique.sql` **phase 2** : colonne
    `workshop_bricks.content` supprimée.
  - `2026-08-15-context-defaut-parcours.sql` : `exam_questions.context` a
    désormais `'parcours'` pour défaut (vérifié en base).

  État final d'`exam_questions` : `id, workshop_id, pools, exam_ids, created_at,
  updated_at, context, image_key, audio_key` — le groupe, et rien d'autre.


- **11/08/2026 — Groupes de questions, phase expand**
  (`2026-08-11-groupes-de-questions-expand.sql`) : additive, appliquée
  directement. Crée `exam_question_items` (une ligne par question, `sort_order`
  0 = principale, contrainte `bloom_level` 1..4 et unicité `(group_id,
  sort_order)`) et `exam_question_item_bricks` (notions par question), puis
  reprend l'existant : 106 groupes → 109 questions, 0 groupe sans question
  principale, 1 lien de notion repris. Le code en ligne ignore ces tables et
  continue de lire les anciennes colonnes ; leur suppression est la phase
  contract ci-dessus.

- **11/08/2026 — `exam_questions.image_key` / `audio_key`** (pièces jointes
  d'énoncé, `2026-08-11-add-question-media-keys.sql`) : additive, appliquée
  directement. Remplace le concept de « type de question »
  (`textuel`/`visuel`/`audio`) par deux pièces jointes indépendantes. La colonne
  `question_type`, devenue morte, a été supprimée le 19/08/2026 (voir l'entrée
  en tête de cette section).
- **10/08/2026 — Bloom ramené à 4 niveaux** (`2026-08-09-bloom-4-niveaux.sql`) :
  appliquée après le merge de `feat/progression-parcours` (PR #32) et le
  déploiement production Vercel. Contraintes `exam_questions_bloom_level_check`
  (1..4) et `brick_mastery_bloom_level_check` (0..4) vérifiées en base ;
  0 ligne à migrer. `database.types.ts` inchangé (une contrainte check ne
  modifie pas les types générés).

- **09/08/2026 — `exam_questions.expectations`** (texte des « attendus ») :
  additive, appliquée directement.
- **09/08/2026 — `exam_questions.type_options`** (jsonb des réglages par type de
  réponse) : additive, appliquée directement.
- **09/08/2026 — types de réponse retirés** (`sondage`, `ordre`, `fill_blank`) :
  aucune migration de *données* n'a été nécessaire. La normalisation se faisait à
  la lecture (`toResponseType()` dans `src/lib/workshops/examTypes.ts`) et la
  nouvelle valeur se réécrivait au premier enregistrement de la question ; au
  19/08/2026, plus aucune ligne ne portait d'ancienne valeur.
  **Décision revue le 19/08/2026** : le laisser *possible* ne suffisait pas —
  voir l'entrée « Types de réponse verrouillés en base » ci-dessous, qui ajoute
  la contrainte manquante.

- **19/08/2026 — Types de réponse verrouillés en base**
  (`2026-08-19-types-de-reponse-verrouilles.sql`) : contrainte
  `exam_question_items_response_type_check` limitant `response_type` aux 9 types
  actuels. Appliquée **directement** malgré son caractère restrictif : le
  contrôle de conformité renvoyait 0 sur 130 lignes (les valeurs héritées avaient
  déjà été normalisées par la reprise du 11/08), et aucun chemin d'écriture du
  code déployé ne peut produire autre chose — toute `Question` passe par
  `toResponseType` en lecture, et l'éditeur ne propose que `RESPONSE_TYPE_ORDER`.
  Décision du jour : il ne doit plus être *possible* qu'un ancien type
  (`sondage`, `ordre`, `fill_blank`, `audio`…) existe en base. ⚠️ L'ajout d'un
  nouveau type de réponse au produit devra mettre à jour cette contrainte dans la
  même migration que le code.

- **20/08/2026 — Étiquetage des imports IA** (`2026-08-20-import-id-et-ai-imports.sql`) :
  **expand pure**, appliquée directement — table `ai_imports`, colonne
  `import_id` (nullable, FK `on delete set null`) sur `workshop_chapters`,
  `workshop_bricks` et `exam_questions`, plus des index partiels. Rien n'est
  supprimé ni renommé, le code déployé ignore ces colonnes. `database.types.ts`
  régénéré. Mécanisme vérifié en base : un import simulé produit bien
  `created_at = updated_at` sur les trois tables (condition de l'annulation), et
  la suppression par double filtre `import_id` + `workshop_id` n'a touché aucune
  ligne manuelle.
