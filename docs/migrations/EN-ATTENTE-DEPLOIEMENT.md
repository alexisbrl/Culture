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
