# Source de vérité visuelle — refonte UI Culture

> Bundle de handoff exporté depuis Claude Design le 05/08/2026, déposé ici comme
> maquette de référence du chantier
> `docs/chantiers/2026-08-05-refonte-ui-design-system.md`. Versionné pour qu'un
> agent qui clone le dépôt à froid, sans session claude.ai, dispose de la maquette
> complète et **fonctionnelle**.
>
> **Ces fichiers ne sont jamais compilés ni importés par l'application.** Ils sont
> de la documentation. Ne pas les brancher dans `next.config`, ni les copier dans
> `public/`, ni les importer depuis `src/`.

## Projet d'origine

- Projet Claude Design : `5a4a1789-7b99-42ff-bcc8-8fd4d723c700` (« Redesign application web et mobile »)
- URL : https://claude.ai/design/p/5a4a1789-7b99-42ff-bcc8-8fd4d723c700?file=App+Culture.dc.html
- Design system : `culture-design-system-9fd2c08f-6694-4ff2-a9da-5c9b435463bb`
- Relecture à distance si besoin : outil `DesignSync`, `method: get_file`,
  `projectId` ci-dessus. **Attention : l'API plafonne à 256 Kio et tronque
  `App Culture.dc.html`** — c'est précisément pourquoi le bundle est archivé ici.
  Préférer toujours la copie locale.

## Contenu

| Chemin | Rôle |
|---|---|
| `App-Culture.dc.html` | **La maquette.** Prototype interactif des 9 écrans de l'app connectée, complet (3 750 lignes). Renommé depuis `App Culture.dc.html` pour retirer l'espace ; rien ne pointe vers son nom. |
| `support.js` | Runtime Claude Design. **Indispensable au rendu** : sans lui le prototype n'affiche rien. |
| `_ds/culture-design-system-…/tokens/*.css` | Les tokens : `colors`, `typography`, `spacing`, `fonts`, `base`, `_compat`. |
| `_ds/culture-design-system-…/_ds_bundle.js` | Composants React compilés du design system (Button, Card, Input, Pill, Badge, Tag, Avatar, Icon, IconButton, ProgressBar, Tabs, StatCard, Checkbox, Radio, SegmentedControl, ArrosoirMeter). |
| `_ds/culture-design-system-…/readme.md` | La doctrine du design system : voix, casse, métaphore botanique, fondations visuelles, iconographie. |
| `screenshots/` | Captures des itérations de design. |
| `uploads/refonte-ui-culture.md` | Le cahier de refonte du 12/07/2026 (méthode, lots, mode dense, checklist de revue). |
| `HANDOFF.md` | Le README d'origine du bundle Claude Design. Ses chemins ne valent plus (le bundle a été déplacé ici), sa consigne de fond reste juste : **recréer le rendu au pixel près, sans copier la structure interne du prototype**. |

> Les autres images de `uploads/` (croquis, inspirations, captures de travail — 18 Mo)
> sont ignorées par git : le prototype n'en référence aucune. Elles restent sur le
> disque d'Alexis.

## Comment lire la maquette

Le format `.dc.html` est du HTML avec quatre balises propres à Claude Design :

- `{{expression}}` — valeur calculée. Le calcul est dans le `<script>` final
  (`class Component extends DCLogic`), à partir de la ligne 1934.
- `<sc-if value="{{cond}}" hint-placeholder-val="{{true|false}}">` — bloc
  conditionnel. `hint-placeholder-val` indique la valeur retenue par défaut dans
  l'éditeur : c'est ce qui permet de repérer quelle variante est celle choisie
  quand plusieurs cohabitent. **Attention, ce n'est qu'un indice** : pour le
  générateur d'examen il pointe encore vers une variante abandonnée (voir plus bas).
- `<sc-for list="{{liste}}" as="x">` — répétition. Le contenu de la liste est dans
  le `<script>`.
- `<x-import component-from-global-scope="CultureDesignSystem_9fd2c0.Button">` —
  instanciation d'un composant du design system.

Repérage rapide des écrans, par `data-screen-label` :

| Ligne | Écran |
|---|---|
| 179 | Dashboard |
| 268 | Jardin *(hors périmètre du chantier)* |
| 412 | Parcours |
| 532 | Exercice |
| 688 | Générateur d'examen |
| 1319 | Générateur de cours *(état vide V2)* |
| 1325 | Profil |
| 1400 | Analyse *(état vide V2)* |
| 1408 | Réglages atelier |

La coquille (barre du haut, bandeau d'atelier, barre d'onglets du bas) est autour :
lignes 57–176 et 1859–1931. Tous les styles sont **inline dans le markup** — c'est
la source de vérité pour reproduire un écran au pixel près.

## Variantes figées

Le prototype embarque plusieurs variantes d'un même écran, pilotées par les
propriétés déclarées dans `data-props` (ligne 1933). **Celles retenues pour le
chantier** (défauts enregistrés dans le fichier, confirmés par Alexis le 05/08/2026) :

| Réglage | Valeur retenue |
|---|---|
| Version de l'app | `V2 · sans accueil` |
| Couleurs | `V1 · crème (actuelle)` |
| Typographie | `V1 · Source Serif 4 + Hanken Grotesk` — **mais le chantier n'utilise que la sans**, voir la feuille de route |
| Navigation ordinateur | `barre du haut` |
| Style du groupe d'onglets d'atelier | `encadré` |
| Emplacement des filtres | `toujours visible` |
| Paramètres avancés (éditeur d'examen) | `V1 · vert doux` |
| Aperçu impression | `false` |

Pour le **générateur d'examen**, le fichier contient trois variantes de mise en page
de la colonne gauche. Celle retenue est **`banqueOngletsLarge` — « onglets pleine
largeur (dans l'encadré) »** (ligne 797) : deux onglets mi-largeur (« mes examens » /
« questions ») en tête de la colonne, coins hauts arrondis, filet sous les onglets,
onglet actif teinté vert. Les variantes `banqueAccordeon` (ligne 696) et
`banqueOnglets` (ligne 751) sont d'anciens essais **abandonnés** — les ignorer,
**même si `banqueAccordeon` porte encore `hint-placeholder-val="{{true}}"`**. La
disposition générale reste « banque et feuille côte à côte » (`examOptB`, seule
présente dans le markup).

Pour le **parcours**, la variante retenue est **`vueChapitres`** (ligne 490) :
`parcoursPref` est figé à `'chapitres (liste + progression)'` (ligne 2203).
`vueSerre` (434) et `vueParcelle` (466) sont ignorées. Corollaire : `showBriquesLine`
(ligne 2793) vaut `false`, donc la ligne « N notions acquises sur M » n'est pas rendue.

## ⚠️ Ne pas se fier aux `hint-placeholder-val`

Ce sont des indices d'éditeur, **pas la valeur d'exécution**. Deux fois au moins ils
mentent : `banqueAccordeon` porte `{{true}}` alors que le getter vaut `false`, et
`vueSerre` porte `{{true}}` alors que la vue rendue est `vueChapitres`. **La vérité
est dans les getters du `<script>` final** (à partir de la ligne 1934) : y chercher
le nom de la condition (`grep -n "vueSerre\|banqueAccordeon" App-Culture.dc.html`)
avant de choisir une variante.

Le prototype se rend correctement en local, ce qui reste le moyen le plus sûr de
lever un doute :

```bash
npx --yes serve docs/design -l 4321
```

puis ouvrir `http://localhost:4321/App-Culture.dc.html`. Une entrée `maquette` est
déjà déclarée dans `.claude/launch.json` (non versionné) pour le faire via l'outil
de prévisualisation. Les erreurs `<svg> attribute viewBox: Expected number,
"{{atBarVB}}"` dans la console sont normales : ce sont les gabarits avant hydratation.
