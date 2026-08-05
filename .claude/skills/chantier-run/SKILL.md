---
name: chantier-run
description: Exécuter en autonomie le chantier en cours. Lit docs/chantiers/EN-COURS.md ; s'il n'y a aucun chantier actif, s'arrête immédiatement. Sinon, enchaîne les tâches non cochées de la feuille de route jusqu'à épuisement du quota, en commitant après chacune. Déclenché par les routines planifiées, sans supervision humaine.
---

# Exécuter le chantier en cours

Tu tournes **sans supervision**, probablement la nuit. Alexis ne lira le résultat que dans plusieurs heures. Deux conséquences : tu ne peux jamais lui poser de question, et tout ce que tu ne commites pas est perdu.

## Autonomie totale — la règle qui prime sur toutes les autres

**Personne ne répondra. Jamais.** Une exécution qui s'arrête pour demander quelque chose est une exécution perdue : elle attend dans le vide jusqu'au réveil d'Alexis, et le quota de la nuit part en fumée.

- **N'utilise jamais `AskUserQuestion`.** Ni pour choisir entre deux options, ni pour confirmer, ni pour signaler. C'est l'outil interdit de ce mode.
- **Ne termine jamais ton tour sur une question**, même rhétorique, même « je propose X, tu confirmes ? ». Si tu t'apprêtes à écrire un point d'interrogation à Alexis, c'est que tu dois prendre la décision toi-même.
- **Ne t'arrête pas devant une action irréversible** prévue par la feuille de route (suppression de fichier, renommage, `git reset --hard` de récupération). Ce qui est cadré est autorisé. Ce qui ne l'est pas est hors périmètre, donc à ne pas faire — pas à faire valider.
- **Tout ce que tu décides, tu l'écris.** Une décision non consignée dans la feuille de route n'existe pas : au réveil, Alexis ne dispose que de ce fichier et du `git log`.

Face à un choix non tranché, applique cette échelle :

| Nature du choix | Ce que tu fais |
|---|---|
| **Détail d'implémentation** (nom de variable, ordre de deux blocs, valeur d'espacement non précisée) | Tu tranches, tu continues. Inutile de le consigner. |
| **Choix visible mais réversible** (libellé d'un bouton, icône Lucide retenue, structure d'un composant) | Tu prends l'option la plus cohérente avec les décisions déjà arrêtées, tu la consignes dans **« Décisions prises en autonomie »** avec ton raisonnement en une ou deux phrases, tu continues. |
| **Choix structurant** (change le modèle de données, le périmètre, une règle produit, ou contredit une décision déjà arrêtée avec Alexis) | Tu **ne le tranches pas**. Tu inscris la tâche dans **« Tâches mises de côté »** avec les options envisagées et ta recommandation, tu laisses la case décochée, et tu **passes à la tâche suivante**. |

Le réflexe par défaut est **décider et documenter**, pas mettre de côté : une tâche écartée est une tâche qui n'avance pas. Ne réserve la mise de côté qu'aux choix qu'Alexis regretterait de te voir trancher seul.

## Étape 0 — La sentinelle, avant TOUT le reste

**Ta toute première action est de lire `docs/chantiers/EN-COURS.md`. Rien d'autre avant.**

Ne lis pas `CLAUDE.md`, n'explore pas le code, ne lance aucune commande. Ce fichier existe précisément pour qu'un réveil inutile coûte un seul appel d'outil.

- S'il contient `AUCUN` → réponds **une seule phrase** (« Aucun chantier en cours, rien à faire. ») et **arrête-toi immédiatement**. N'ouvre aucun autre fichier.
- **S'il n'existe pas** (branche sur laquelle il n'a pas encore été mergé, dépôt différent) → même chose : signale-le en une phrase et arrête-toi. Ne pars jamais chercher un chantier ailleurs, et ne crée pas le fichier.
- Sinon → il te donne le chemin de la feuille de route et la branche. Continue.

## Étape 1 — Se remettre en contexte

1. Lis la feuille de route — mais **pas en entier**. Une feuille de route grossit à chaque tâche : son journal et ses décisions finissent par peser plus lourd que le cadrage lui-même, et les relire intégralement à chaque réveil consomme un contexte que tu n'auras plus pour travailler. Lis :
   - **tout ce qui précède `## Tâches`** (objectif, critère de réussite, sources de vérité, décisions arrêtées, hors périmètre, zones interdites, règles d'exécution) — c'est le cadrage, il est court et il est obligatoire ;
   - **la tâche que tu vas faire**, et elle seule ;
   - **les 3 dernières entrées du journal** et **la fin de « Décisions prises en autonomie »**, pour savoir où en était la session précédente ;
   - **« Tâches bloquées » et « Tâches mises de côté » en entier** — courtes par construction, et elles t'évitent de refaire une tentative déjà perdue.

   N'ouvre le reste que si la tâche en cours t'y renvoie explicitement.
2. Lis `CLAUDE.md`, et les `.claude/rules/*.md` correspondant à la zone que tu vas toucher.
3. **Garde-fou anti-collision — avant tout `git checkout`.** Les routines tournent dans le répertoire de travail d'Alexis, qui peut très bien être en train d'y coder au moment où tu te réveilles. Donc : **si l'arbre contient des modifications non commitées alors que tu n'es pas déjà sur la branche du chantier, arrête-toi immédiatement** en expliquant pourquoi. Ce sont selon toute vraisemblance ses modifications en cours. Ne les jette jamais, ne stash rien, et ne change pas de branche sous ses pieds — la prochaine routine reprendra le travail.
4. Sinon, place-toi sur la branche du chantier : `git checkout <branche> && git pull`.
5. Si tu es **déjà** sur la branche du chantier avec des modifications non commitées, elles proviennent d'une exécution précédente interrompue : **inspecte-les avant tout**. Soit elles complètent la tâche en cours et tu la finis, soit elles sont incohérentes et tu les jettes (`git checkout -- .`). Ne construis jamais par-dessus un état douteux.

## Étape 2 — Enchaîner les tâches

Prends **la première tâche non cochée** dont les dépendances sont satisfaites. Pas de limite de tâches par exécution : avance autant que le quota le permet.

Pour chaque tâche, dans cet ordre :

1. **Implémenter**, en respectant les règles du projet (i18n dans `fr.json` *et* `en.json`, logique métier dans `src/lib/<domaine>/`, `requireMember`/`requireManager`/`requireOwner` en tête des server actions, revalidation à scope étroit, couleurs via `src/lib/theme.ts`, icônes Lucide uniquement).
2. **`npm run lint`** — doit passer sans erreur.
3. **`npm run build`** — obligatoire, `tsc --noEmit` ne suffit pas (piège Turbopack, `CLAUDE.md` §1).
4. **Si la tâche touche l'UI** : lance le serveur de dev via `preview_start`, ouvre la page concernée, compare au rendu attendu décrit dans la source de vérité, vérifie la console. Une tâche UI n'est pas terminée tant que tu n'as pas *vu* le résultat.

   **⚠️ Page derrière une authentification.** Le navigateur intégré (`preview_start` / `mcp__Claude_Browser__*`) n'a **aucune session** : sur une app protégée, il ne verra jamais que l'écran de connexion. Utilise alors **Claude in Chrome** (`mcp__claude-in-chrome__*`), qui pilote le vrai navigateur d'Alexis avec ses sessions ouvertes :

   - `preview_start` reste le moyen de **lancer le serveur** (jamais `npm run dev` via Bash) ;
   - la **consultation** passe ensuite par `mcp__claude-in-chrome__navigate` vers `http://localhost:<port>/…`, puis `read_page`, `computer` (capture), `read_console_messages`, `resize_window` pour le rendu téléphone ;
   - `list_connected_browsers` en premier si tu n'es pas sûr que Chrome réponde.

   Si Chrome n'est pas joignable, ou si la page redirige quand même vers la connexion : **une seule tentative**, puis repli sur `build` + `lint`, tâche terminée, et une mention dans le journal (« rendu non vérifié — <motif> »). Ne dépense jamais plus d'un essai là-dessus, et surtout **n'en fais jamais un motif d'arrêt de session** : une tâche non vérifiée visuellement reste une tâche livrée.
5. **Vérifier le critère d'acceptation** de la tâche, littéralement, tel qu'il est écrit.
6. **Commiter** — format Conventional Commits, en français, comme le reste du dépôt.
7. **Mettre à jour la feuille de route** : cocher la case, ajouter une ligne au journal (date, tâche, hash du commit, note utile). Commiter ce fichier aussi.
8. **Pousser** (`git push`).
9. Passer à la tâche suivante.

**Ne groupe jamais plusieurs tâches dans un commit.** Le commit par tâche est ce qui rend l'absence de limite sûre : une coupure brutale de quota ne coûte alors que la tâche en cours.

### Écrire court dans la feuille de route

Le journal et les décisions sont relus à chaque réveil, pour toute la durée du chantier : ce que tu écris long, tu le repaies à chaque session.

- **Journal : une ligne.** `date — Tx — <hash> — <ce qui a été fait, et le seul détail qui resservira>.` Pas de paragraphe, pas de justification — le commit porte déjà le détail.
- **Décision en autonomie : 3 phrases maximum.** Le choix, l'option retenue, la raison. Rien d'autre. Si tu as besoin de plus, c'est que la décision était structurante et qu'elle avait sa place dans « Tâches mises de côté ».
- Ne recopie jamais dans la feuille de route ce que `git log`, `git diff` ou le code disent déjà.

### Ne t'arrête pas en chemin

Enchaîne les tâches **sans marquer de pause et sans rédiger de bilan intermédiaire**. Un récapitulatif de fin de session est du contexte dépensé à ne rien produire : la seule synthèse qui compte est celle de l'étape 3, quand tout est coché.

Tu ne t'arrêtes que pour l'une de ces trois raisons, et aucune autre :

1. **Toutes les tâches sont cochées** → étape 3.
2. **Plus aucune tâche ne peut avancer** (tout le reste est bloqué, mis de côté, ou en attente d'une dépendance non satisfaite).
3. **Le contexte ou le quota est réellement épuisé** — pas « la session est longue », pas « la prochaine tâche a l'air délicate ».

En particulier : **la difficulté d'une tâche n'est pas un motif d'arrêt.** Une tâche jugée risquée se traite avec méthode — la lire en entier, ouvrir les fichiers concernés, faire le changement minimal, valider — ou, si le risque vient d'un choix non tranché, se met de côté selon l'échelle ci-dessus. Dans les deux cas tu **passes à la tâche suivante** ensuite. S'arrêter devant la difficulté laisse le point dur à la session d'après, qui l'abordera avec exactement les mêmes informations et le même dilemme : le chantier n'avance plus.

## Étape 3 — Quand tout est coché

Tant qu'il reste une tâche décochée — y compris bloquée ou mise de côté — le chantier n'est **pas** terminé : la sentinelle reste en place et la prochaine routine réessaiera. Ne passe à cette étape que si toutes les cases sont cochées.

1. Passe la PR de draft à *ready for review*.
2. Écris un récapitulatif dans la description de la PR : ce qui a été fait, les décisions prises en autonomie, les tâches bloquées, les tâches mises de côté.
3. Remets `docs/chantiers/EN-COURS.md` à `AUCUN`, commit, push.
4. Arrête-toi. **Ne merge jamais dans `main`.**

Si tout ce qui reste est bloqué ou mis de côté et qu'aucune tâche ne peut plus avancer : **ne clos pas le chantier**. Pousse l'état à jour, écris une ligne de synthèse dans le journal, et arrête-toi. C'est à Alexis d'arbitrer.

## Face à un imprévu

**Ambiguïté** → applique l'échelle de la section « Autonomie totale » ci-dessus : tranche et documente dans la quasi-totalité des cas, ne mets de côté que le choix vraiment structurant. Ne t'arrête jamais pour attendre une réponse : personne ne lira avant des heures.

**Une autorisation te manque** → tu tournes en mode sans prompt ; si un outil est malgré tout refusé, c'est un `deny` délibéré (migration de base, `push --force`, `push` sur `main`, zone interdite). Ne cherche pas à le contourner par un autre chemin : c'est un garde-fou, pas un obstacle. Consigne le refus dans « Tâches mises de côté » et passe à la suite.

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
