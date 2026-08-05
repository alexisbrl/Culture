# Chantier en cours

**Feuille de route :** docs/chantiers/2026-08-05-refonte-ui-design-system.md
**Branche :** feat/refonte-ui-design-system
**PR :** (à renseigner)
**Démarré le :** 2026-08-05

---

<!--
Fichier sentinelle du système de chantiers autonomes.

C'est la PREMIÈRE et parfois la SEULE chose que lit `/chantier-run` quand une
routine le réveille. Il existe pour qu'un réveil sans travail à faire coûte un
seul appel d'outil au lieu d'une exploration complète du projet.

Deux états possibles, et deux seulement :

  1. Aucun chantier actif — la ligne sous le titre contient exactement `AUCUN`.
     `/chantier-run` s'arrête aussitôt.

  2. Un chantier actif — remplacer `AUCUN` par ce bloc :

         **Feuille de route :** docs/chantiers/AAAA-MM-JJ-slug.md
         **Branche :** feat/slug
         **PR :** https://github.com/alexisbrl/Culture/pull/NN
         **Démarré le :** AAAA-MM-JJ

Un seul chantier actif à la fois : c'est ce fichier qui le garantit.
Il est écrit par `/chantier` au cadrage, et remis à `AUCUN` par `/chantier-run`
quand toutes les tâches sont cochées.
-->
