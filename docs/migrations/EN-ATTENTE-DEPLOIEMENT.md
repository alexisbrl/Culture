# En attente de déploiement

> **Point d'entrée unique** de tout ce qui doit être appliqué en base **une fois
> le code en ligne**, et de rien d'autre. Un simple « qu'est-ce qui reste à faire
> maintenant que c'est déployé ? » doit se répondre en lisant ce seul fichier.
>
> Si la section « À appliquer » ne contient que `AUCUN`, il n'y a rien à faire.

## Pourquoi ce fichier existe

La base Supabase (`hhkmrejjksjpfetwefju`) est partagée par le code local **et**
le code déployé sur scellow.com. Une migration prend effet immédiatement, un
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

- **19/08/2026 — Question sans titre : suppression de `exam_questions.title`**
  (`2026-08-19-question-sans-titre.sql`). Plus rien ne permettait de saisir ce
  titre depuis le passage à l'éditeur en ligne ; il ne restait que d'anciennes
  valeurs, qui masquaient l'énoncé dans les listes. Le code ne le lit ni ne
  l'écrit plus. **Prérequis** : branche mergée et **déployée** — `title` figure
  encore dans `GROUP_COLUMNS` en production, donc dans tous les `select` de
  questions. À appliquer avec la suppression de `chapter_id` ci-dessous : même
  table, même prérequis, une seule régénération de `database.types.ts`.

- **19/08/2026 — Question sans chapitre : suppression de `exam_questions.chapter_id`**
  (`2026-08-19-question-sans-chapitre.sql`). Le chapitre d'une question de
  parcours se déduit maintenant des notions qu'elle mobilise ; la colonne n'est
  plus ni lue ni écrite. **Prérequis** : branche mergée et **déployée** — la
  colonne figure encore dans `GROUP_COLUMNS` en production, donc dans tous les
  `select` de questions (banque d'examen comprise), et sa disparition les ferait
  échouer en bloc. Le fichier contient d'abord un `select` de contrôle : il
  compte les questions dont le rattachement manuel va être perdu sans qu'aucune
  notion rangée ne prenne le relais — celles-là ne seront plus tirées tant
  qu'on ne leur aura pas relié une notion rangée dans un chapitre.

- **19/08/2026 — Notion à texte unique : suppression de `workshop_bricks.content`**
  (`2026-08-19-notion-texte-unique.sql`, phase 2). Une notion n'a plus qu'un
  texte, porté par `title` ; `content` n'est plus ni lu ni écrit par le code.
  **Prérequis** : la branche `feat/infobulles-maison` doit être **mergée et
  déployée** — le code en ligne lit encore `content` dans le `select` de
  `listNotions`, et une colonne disparue y ferait échouer le select entier,
  donc une page paramètres sans aucune notion, sans erreur visible.
  **Phase 1 du même fichier (recoller les descriptions au titre) : à appliquer
  tout de suite**, elle ne casse rien en ligne — et tant qu'elle ne l'est pas,
  les descriptions déjà saisies n'apparaissent plus nulle part.

- **15/08/2026 — `exam_questions.context` : défaut à `'parcours'`** (`2026-08-15-context-defaut-parcours.sql`) :
  bascule le `DEFAULT` de la colonne de `'exam'` à `'parcours'`. Règle métier :
  un groupe est toujours d'un côté ou de l'autre, et à défaut il va dans le
  parcours. Non destructif, aucune ligne existante touchée.
  **Prérequis** : le code qui passe le contexte explicitement des deux côtés
  (`saveQuestion(..., 'exam')` côté banque, paramètre `context` devenu
  obligatoire dans `lib/workshops/exam.ts`) doit être **déployé**. Avant ça, la
  banque d'examen en production s'en remet encore à ce `DEFAULT` et créerait des
  questions de parcours sans aucune erreur.

- **11/08/2026 — Groupes de questions, phase contract** (`2026-08-11-groupes-de-questions-contract.sql`) :
  supprime les 14 colonnes de contenu de `exam_questions` (`content`,
  `response_type`, `answer`, `choices`, `correct_choices`, `shuffle_choices`,
  `text_lines`, `type_options`, `expectations`, `bloom_level`, `parts`,
  `answer_optional`, `difficulty`, `duration`) et l'ancienne table de jonction
  `exam_question_bricks`. La ligne `exam_questions` ne porte plus que le GROUPE
  (titre, image, audio, libellés, chapitre) ; chaque question est une ligne de
  `exam_question_items`, reprise par la phase expand déjà appliquée.
  **Le plus destructif du lot** : tant que scellow.com sert l'ancien code, ces
  colonnes sont sa seule source de vérité. Vérifier le prérequis inscrit en tête
  du fichier SQL (0 groupe sans question principale) avant d'appliquer, puis
  régénérer `src/lib/database.types.ts`.

- **11/08/2026 — Retrait de `exam_questions.question_type`** (`2026-08-11-drop-question-type.sql`) :
  colonne devenue morte — le type de question a été remplacé par deux pièces
  jointes indépendantes (`image_key`, `audio_key`, voir `QuestionMedia` dans
  `src/lib/workshops/examTypes.ts`). Migration de suppression (contract) : à
  appliquer seulement une fois `feat/...` mergée dans `main` et déployée sur
  Vercel — pas avant.

---

## Appliqué / sans objet

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
  (`textuel`/`visuel`/`audio`) par deux pièces jointes indépendantes — voir
  l'entrée « À appliquer » ci-dessus pour le nettoyage de la colonne
  `question_type`, désormais morte.
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
  **aucune migration prévue, jamais**. La normalisation se fait à la lecture
  (`toResponseType()` dans `src/lib/workshops/examTypes.ts`) et la nouvelle
  valeur se réécrit au premier enregistrement de la question. Rien à nettoyer en
  base.
