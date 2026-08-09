---
name: chantier
description: Cadrer un chantier de développement autonome. Lit le projet, interroge l'utilisateur jusqu'à zéro ambiguïté, puis produit une feuille de route exécutable sans supervision par /chantier-run. À utiliser quand l'utilisateur veut lancer un gros chantier (nouvelle feature, refonte, audit, intégration) qu'un agent devra mener seul pendant plusieurs jours.
---

# Cadrer un chantier autonome

Cette commande produit **la seule chose qui sera lue** par l'agent d'exécution pendant qu'Alexis dort. L'agent d'exécution démarre à froid, sans aucun souvenir de cette conversation : **tout ce qui n'est pas écrit dans la feuille de route n'existe pas.**

C'est une séance de cadrage d'1 à 2 h. Ne la bâcle pas. Une ambiguïté non levée ici, c'est potentiellement une nuit entière de travail dans la mauvaise direction.

## Phase 0 — Vérifier qu'aucun chantier n'est en cours

Lis `docs/chantiers/EN-COURS.md`. **Un seul chantier actif à la fois.**

S'il en contient déjà un, arrête-toi et demande à Alexis ce qu'il veut faire : reprendre celui-là, l'archiver comme terminé, ou l'abandonner pour le remplacer. N'écrase jamais un chantier actif sans son accord explicite.

## Phase 1 — S'imprégner du projet

Avant la moindre question, lis :

- `CLAUDE.md` en entier (règles absolues, conventions, workflow Git)
- `docs/product-spec.md` — périmètre MVP, ce qui est hors-scope
- `docs/backlog.md` — dette connue, un item ouvert peut recouper le chantier
- `docs/changelog.md` — si le chantier touche une zone sensible, comprends son historique
- Les `.claude/rules/*.md` pertinents pour la zone visée
- **Le code réel de la zone concernée** — pas une supposition sur sa structure

Si le chantier repose sur une source externe (une maquette, un document de conception, un export Claude Design), **exige le fichier et lis-le**. Ne cadre jamais un chantier sur une source que tu n'as pas ouverte.

## Phase 2 — Interroger jusqu'à zéro ambiguïté

Pose tes questions par salves via `AskUserQuestion`. Alexis a explicitement demandé qu'il ne reste **aucune** ambiguïté — c'est le cœur de la valeur de cette commande. Enchaîne les salves tant qu'il reste un point flou. Mieux vaut une question de trop qu'une nuit perdue.

Ce qui doit impérativement être tranché avant d'écrire quoi que ce soit :

- **Périmètre exact** — et surtout ce qui est explicitement *hors* périmètre.
- **Critère de réussite global** — à quoi Alexis reconnaîtra que le chantier est réussi.
- **Zones interdites** — fichiers, dossiers, fonctionnalités auxquels l'agent ne doit pas toucher.
- **Source de vérité visuelle** si c'est un chantier UI — sur quoi l'agent calque son rendu.
- **Migrations DB** — s'il y en a, rappeler la règle expand/contract de `CLAUDE.md` §1. Une migration destructive est **interdite** en autonomie.
- **i18n** — toute chaîne visible doit passer par next-intl, dans `fr.json` **et** `en.json`.
- **Arbitrages techniques structurants** — les trancher maintenant, pas à 3 h du matin.

Ne suppose jamais à la place d'Alexis sur un point structurant. En revanche, sur un détail d'implémentation sans conséquence, prends la décision toi-même et signale-la, plutôt que de noyer la séance sous des questions triviales.

## Phase 3 — Découper en tâches atomiques

Chaque tâche doit respecter ces contraintes, sans exception :

- **= exactement un commit.** Si ça n'entre pas dans un commit cohérent, c'est deux tâches.
- **Critère d'acceptation vérifiable par l'agent seul**, sans avis humain. « Le formulaire est joli » est inacceptable. « `npm run build` passe et la page `/fr/pricing` affiche 3 cartes tarifaires alignées sur la maquette » est acceptable.
- **Autoportante** — elle nomme les fichiers concernés. L'agent ne doit pas avoir à deviner où aller.
- **Ordonnée** — les dépendances entre tâches sont explicites.

Vise des tâches de taille comparable. Une tâche trop grosse est le principal facteur d'échec : si elle est interrompue par la fin du quota, tout son travail non commité est perdu.

## Phase 4 — Relire avec Alexis

Présente-lui le découpage **avant** d'écrire le fichier. C'est son dernier point de contrôle avant plusieurs jours d'autonomie. Laisse-le ajouter, retirer, réordonner.

## Phase 5 — Écrire et armer le chantier

1. Crée la branche depuis `main` à jour : `git checkout main && git pull && git checkout -b feat/<slug>`.
2. Écris `docs/chantiers/<AAAA-MM-JJ>-<slug>.md` selon le gabarit ci-dessous.
3. Mets à jour `docs/chantiers/EN-COURS.md` avec le chemin du fichier et le nom de la branche.
4. Commit et push les deux fichiers.
5. Ouvre une **PR en draft** vers `main`, et note son URL dans la feuille de route.
6. Rappelle à Alexis que les routines prendront le relais, et que rien ne sera mergé dans `main` sans lui.

## Gabarit de feuille de route

```markdown
# Chantier : <nom>

**Branche :** feat/<slug>
**PR :** <URL>
**Cadré le :** <AAAA-MM-JJ>

## Objectif
<2-3 phrases. Ce qu'on veut obtenir et pourquoi.>

## Critère de réussite global
<À quoi Alexis reconnaîtra que c'est réussi.>

## Décisions arrêtées avec Alexis
- <décision> — <raison>

## Hors périmètre
- <ce qu'on ne fait pas dans ce chantier>

## Zones interdites
- <fichiers/dossiers auxquels ne pas toucher, et pourquoi>

## Sources de vérité
- <maquette, doc, fichier de référence — chemin ou URL>

## Tâches

- [ ] **T1 — <titre>**
  - Critère d'acceptation : <vérifiable sans humain>
  - Fichiers : <chemins>
  - Dépend de : <rien | T-x>

- [ ] **T2 — <titre>**
  - ...

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
```

## Règles absolues du cadrage

- **Aucune supposition** sur l'API d'une lib, la structure d'un fichier ou le comportement du code : va vérifier dans le code ou la doc (`CLAUDE.md` §1).
- Le chantier doit respecter le périmètre MVP (`docs/product-spec.md`). Si Alexis demande du hors-MVP, signale-le-lui avant de cadrer.
- Une feuille de route qui contient « voir la discussion » ou « comme convenu » est **ratée** : l'agent d'exécution n'a pas accès à cette discussion.
