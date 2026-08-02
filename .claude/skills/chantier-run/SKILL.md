---
name: chantier-run
description: Exécuter en autonomie le chantier en cours. Lit docs/chantiers/EN-COURS.md ; s'il n'y a aucun chantier actif, s'arrête immédiatement. Sinon, enchaîne les tâches non cochées de la feuille de route jusqu'à épuisement du quota, en commitant après chacune. Déclenché par les routines planifiées, sans supervision humaine.
---

# Exécuter le chantier en cours

Tu tournes **sans supervision**, probablement la nuit. Alexis ne lira le résultat que dans plusieurs heures. Deux conséquences : tu ne peux jamais lui poser de question, et tout ce que tu ne commites pas est perdu.

## Étape 0 — La sentinelle, avant TOUT le reste

**Ta toute première action est de lire `docs/chantiers/EN-COURS.md`. Rien d'autre avant.**

Ne lis pas `CLAUDE.md`, n'explore pas le code, ne lance aucune commande. Ce fichier existe précisément pour qu'un réveil inutile coûte un seul appel d'outil.

- S'il contient `AUCUN` → réponds **une seule phrase** (« Aucun chantier en cours, rien à faire. ») et **arrête-toi immédiatement**. N'ouvre aucun autre fichier.
- Sinon → il te donne le chemin de la feuille de route et la branche. Continue.

## Étape 1 — Se remettre en contexte

1. Lis la feuille de route en entier — objectif, décisions arrêtées, hors périmètre, zones interdites, sources de vérité, journal.
2. Lis `CLAUDE.md`, et les `.claude/rules/*.md` correspondant à la zone que tu vas toucher.
3. Place-toi sur la branche du chantier : `git checkout <branche> && git pull`.
4. Vérifie que l'arbre est propre. S'il traîne des modifications non commitées d'une exécution précédente interrompue, **inspecte-les avant tout** : soit elles complètent une tâche et tu la finis, soit elles sont incohérentes et tu les jettes (`git checkout -- .`). Ne construis jamais par-dessus un état douteux.

## Étape 2 — Enchaîner les tâches

Prends **la première tâche non cochée** dont les dépendances sont satisfaites. Pas de limite de tâches par exécution : avance autant que le quota le permet.

Pour chaque tâche, dans cet ordre :

1. **Implémenter**, en respectant les règles du projet (i18n dans `fr.json` *et* `en.json`, logique métier dans `src/lib/<domaine>/`, `requireMember`/`requireManager`/`requireOwner` en tête des server actions, revalidation à scope étroit, couleurs via `src/lib/theme.ts`, icônes Lucide uniquement).
2. **`npm run lint`** — doit passer sans erreur.
3. **`npm run build`** — obligatoire, `tsc --noEmit` ne suffit pas (piège Turbopack, `CLAUDE.md` §1).
4. **Si la tâche touche l'UI** : lance le serveur de dev via `preview_start`, ouvre la page concernée, compare au rendu attendu décrit dans la source de vérité, vérifie la console. Une tâche UI n'est pas terminée tant que tu n'as pas *vu* le résultat.
5. **Vérifier le critère d'acceptation** de la tâche, littéralement, tel qu'il est écrit.
6. **Commiter** — format Conventional Commits, en français, comme le reste du dépôt.
7. **Mettre à jour la feuille de route** : cocher la case, ajouter une ligne au journal (date, tâche, hash du commit, note utile). Commiter ce fichier aussi.
8. **Pousser** (`git push`).
9. Passer à la tâche suivante.

**Ne groupe jamais plusieurs tâches dans un commit.** Le commit par tâche est ce qui rend l'absence de limite sûre : une coupure brutale de quota ne coûte alors que la tâche en cours.

## Étape 3 — Quand tout est coché

1. Passe la PR de draft à *ready for review*.
2. Écris un récapitulatif dans la description de la PR : ce qui a été fait, les décisions prises en autonomie, les tâches bloquées.
3. Remets `docs/chantiers/EN-COURS.md` à `AUCUN`, commit, push.
4. Arrête-toi. **Ne merge jamais dans `main`.**

## Face à un imprévu

**Ambiguïté** → prends l'option la plus raisonnable au regard des décisions déjà arrêtées, **consigne-la dans « Décisions prises en autonomie »** avec ton raisonnement, et continue. Ne t'arrête jamais pour attendre une réponse : personne ne lira avant des heures.

**Tâche qui échoue** → deux tentatives sérieuses maximum. Après quoi, inscris-la dans « Tâches bloquées » avec le motif précis et ce que tu as essayé, laisse la case décochée, et **passe à la tâche suivante non bloquée**. Ne t'acharne pas : tu brûlerais le quota d'une nuit sur un seul point dur.

**`npm run build` casse et tu n'arrives pas à réparer** → reviens à l'état stable (`git reset --hard HEAD`), marque la tâche bloquée, continue ailleurs. Ne laisse jamais la branche dans un état qui ne build pas.

**Tâche hors périmètre ou en zone interdite** → ne la fais pas, même si elle semble utile. Note la suggestion dans « Décisions prises en autonomie » pour qu'Alexis tranche.

## Interdits absolus

- **Merger dans `main`** — jamais, sous aucun prétexte.
- **Migration DB destructive** (suppression/renommage de colonne ou table, changement de type) — la base est partagée avec la production, une migration prend effet immédiatement (`CLAUDE.md` §1). Ajouter une colonne est permis ; retirer quoi que ce soit ne l'est pas en autonomie.
- **Toucher aux zones interdites** listées dans la feuille de route.
- **Committer `.env.local`** ou un quelconque secret.
- **Pousser du code qui ne build pas.**
- **Inventer** une API, une signature ou un comportement de librairie : va lire le code ou la doc.
