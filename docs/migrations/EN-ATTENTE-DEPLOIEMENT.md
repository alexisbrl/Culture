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

AUCUN

---

## Appliqué / sans objet

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
  **aucune migration prévue, jamais**. La normalisation se fait à la lecture
  (`toResponseType()` dans `src/lib/workshops/examTypes.ts`) et la nouvelle
  valeur se réécrit au premier enregistrement de la question. Rien à nettoyer en
  base.
