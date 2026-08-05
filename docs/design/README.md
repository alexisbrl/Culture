# Source de vérité visuelle — refonte UI Culture

> Archive locale des fichiers Claude Design qui servent de maquette de référence au
> chantier `docs/chantiers/2026-08-05-refonte-ui-design-system.md`. Déposée ici le
> 05/08/2026 pour qu'un agent qui démarre à froid, sans navigateur ni session
> claude.ai, puisse lire la maquette sans dépendre du réseau.
>
> **Ces fichiers ne sont jamais compilés ni importés par l'application.** Ils sont
> de la documentation. Ne pas les brancher dans `next.config`, ni les copier dans
> `public/`, ni les importer depuis `src/`.

## Projet d'origine

- Projet Claude Design : `5a4a1789-7b99-42ff-bcc8-8fd4d723c700`
- URL : https://claude.ai/design/p/5a4a1789-7b99-42ff-bcc8-8fd4d723c700?file=App+Culture.dc.html
- Design system : `culture-design-system-9fd2c08f-6694-4ff2-a9da-5c9b435463bb`
- Outil de relecture : `DesignSync` (`method: get_file`, `projectId` ci-dessus). Le
  projet contient aussi `uploads/refonte-ui-culture.md` (le cahier de refonte du
  12/07/2026) et un dossier `screenshots/` — non archivés ici, à récupérer via
  `DesignSync` si besoin.

## Contenu

| Fichier | Rôle |
|---|---|
| `App-Culture.dc.html` | La maquette. Prototype interactif des 9 écrans de l'app connectée. |
| `_ds_bundle.js` | Composants React compilés du design system (Button, Card, Input, Pill, Badge, Tag, Avatar, Icon, IconButton, ProgressBar, Tabs, StatCard, Checkbox, Radio, SegmentedControl, ArrosoirMeter). Utile pour lire les styles exacts d'un composant. |
| `tokens/colors.css` | Palette complète (surfaces crème, vert héros, tan, encre, fonctionnelles) + alias sémantiques. |
| `tokens/typography.css` | Familles, graisses, échelle 7 niveaux, rôles typographiques. |
| `tokens/spacing.css` | Espacements 4 px, rayons, ombres, motion, layout. |
| `tokens/fonts.css` | Import Google Fonts d'origine. |
| `tokens/base.css` | Couche de base du design system. |
| `tokens/_compat.css` | Alias des anciens noms de rampes vers la palette resserrée. |

## ⚠️ `App-Culture.dc.html` est tronqué

L'API de lecture plafonne à 256 Kio. Ce qui est présent et ce qui manque :

- **Présent et complet — le markup des 9 écrans** (lignes 1 à 1932, jusqu'au
  `</x-dc>` fermant). Chaque écran est repérable par son attribut
  `data-screen-label` : `Dashboard`, `Jardin`, `Parcours`, `Exercice`,
  `Générateur d'examen`, `Générateur de cours`, `Profil`, `Analyse`,
  `Réglages atelier`. Tous les styles sont inline dans le markup — c'est la
  source de vérité pour reproduire un écran au pixel près.
- **Présent — le bloc `state`** de la classe `Component` (données initiales,
  onglets actifs, variantes sélectionnées).
- **Manquant — la fin du `<script>`** : le reste des données mock et **tous les
  getters calculés**. Conséquence pratique : les listes pilotées par une boucle
  (`<sc-for list="{{regNav}}">`, `<sc-for list="{{profilSettings}}">`) ne
  révèlent pas leurs libellés. Pour ces cas, se rabattre sur le contenu réel de
  l'application existante, ou consulter `screenshots/` via `DesignSync`.

## Comment lire la maquette

Le format `.dc.html` est du HTML avec trois balises propres à Claude Design :

- `{{expression}}` — valeur calculée. Le nom est parlant (`{{atelierName}}`,
  `{{heroPct}}`) ; le calcul lui-même est dans la partie tronquée.
- `<sc-if value="{{cond}}" hint-placeholder-val="{{true|false}}">` — bloc
  conditionnel. **`hint-placeholder-val` indique la valeur retenue par défaut**
  dans l'éditeur : c'est ce qui permet de savoir quelle variante est celle
  choisie quand plusieurs cohabitent dans le fichier.
- `<sc-for list="{{liste}}" as="x">` — répétition.
- `<x-import component-from-global-scope="CultureDesignSystem_9fd2c0.Button">` —
  instanciation d'un composant du design system (voir `_ds_bundle.js`).

## Variantes figées

Le prototype embarque plusieurs variantes d'un même écran. **Celles retenues pour
le chantier** (défauts enregistrés dans le fichier, confirmés le 05/08/2026) :

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

Pour le **générateur d'examen**, le fichier contient trois variantes de mise en
page de la colonne gauche. Celle retenue est **`banqueOngletsLarge` — « onglets
pleine largeur (dans l'encadré) »** : deux onglets mi-largeur (« mes examens » /
« questions ») en tête de la colonne, coins hauts arrondis, filet sous les
onglets, onglet actif teinté vert. Les variantes `banqueAccordeon` et
`banqueOnglets` sont d'anciens essais **abandonnés** — les ignorer, même si
`banqueAccordeon` porte encore `hint-placeholder-val="{{true}}"`. La disposition
générale reste « banque et feuille côte à côte » (`examOptB`, seule présente dans
le markup).
