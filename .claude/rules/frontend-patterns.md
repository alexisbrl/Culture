---
paths:
  - "src/**/*.tsx"
  - "src/**/*.css"
---

# Patterns UI & pièges React/CSS récurrents

## Design tokens

Toujours utiliser les tokens de `src/lib/theme.ts` (`palette`, `ink(alpha)`, `radius`, `shadow`) pour les couleurs de marque dans un `style={{}}` — jamais de hex en dur. `theme.ts` doit rester synchronisé avec les variables CSS de `globals.css` (`--primary`…) utilisées par les classes Tailwind. Icônes : exclusivement `lucide-react` (règle absolue, voir `CLAUDE.md` §1).

## Layout plein écran sous `[locale]/layout.tsx`

Le layout empile un header (hauteur réelle 65px = `h-16` + `border-b` 1px) puis `<main className="flex-1">`. **Ne jamais utiliser `100vh`/`min-h-screen` brut** sur le conteneur racine d'une page — utiliser `calc(100vh - 65px)`, sinon on ajoute systématiquement 65px de trop par rapport à la fenêtre.

## Pattern « modifications non enregistrées »

Pour les pages de formulaire sans bouton « enregistrer » permanent : un état `formValues` (objet unique regroupant tous les champs éditables) comparé à un `savedSnapshot` (`useState(formValues)` initial) via `JSON.stringify` pour calculer `isDirty`. Si `isDirty`, une barre flottante « enregistrer » apparaît, et un listener global (`document.addEventListener('click', ..., true)`, capture phase) intercepte tout clic sur un `<a>` interne pour ouvrir une modale de confirmation (sauf clic modifié/molette/`target="_blank"`/ancre `#`) plutôt que de naviguer directement. Un handler `beforeunload` (avec un ref pour éviter les closures obsolètes) couvre la fermeture d'onglet/rechargement. Limite connue : la navigation `popstate` (bouton retour du navigateur) n'est pas interceptée. Pour ajouter un champ à un formulaire existant qui utilise ce pattern : ajouter sa clé dans `formValues` (donc dans `savedSnapshot`) et l'inclure dans l'appel de sauvegarde — `isDirty` et la barre suivent automatiquement.

Référence : `src/app/[locale]/workshops/[id]/settings/SettingsClient.tsx`.

## Modale de confirmation (pattern à réutiliser)

Carte crème `borderRadius: 20`, icône d'avertissement, titre/description centrés, actions en bas (« Confirmer » / « Annuler », ou 3 actions type « Enregistrer et quitter » / « Annuler » / « Quitter sans enregistrer »). À utiliser pour toute action destructive ou décision à conséquence (suppression, navigation avec perte de données).

## Pièges React/CSS rencontrés

- **`setState(prev => ...)` n'est pas synchrone.** Construire l'objet à passer à une server action **avant** l'appel à `setXxx`, jamais à l'intérieur de l'updater avec une variable externe capturée (`let saved = null; setXxx(prev => { saved = ...; return ... })` — `saved` reste `null` après l'appel). De même, **n'appelle jamais une server action à l'intérieur d'un updater `setState`** (l'updater s'exécute pendant la phase de rendu ; une server action qui fait `revalidatePath`/`router.refresh()` déclenche « Cannot update a component while rendering a different component »). Collecter le résultat dans une variable externe pendant l'updater, puis appeler la server action après `setXxx`.

- **`useLayoutEffect` pour mesurer une hauteur réelle (`ref` + `getBoundingClientRect`) :** ne pas mettre de tableau de dépendances vide si le contenu peut changer (réordonnancement, ajout) — la mesure doit re-tourner à chaque rendu. Pour éviter la boucle infinie de `setState`, garder la mise à jour derrière une comparaison explicite (`if (changed) setHeights(...)`).

- **`position: fixed` à l'intérieur d'un ancêtre avec `transform: scale(...)` (ou tout autre `transform`) combiné à `overflow: auto`** : le `fixed` cesse d'être positionné par rapport au viewport et devient un élément scrollable avec son contenu. Toute modale/toast ajoutée dans une zone mise à l'échelle (ex. panneaux avec zoom) doit passer par `createPortal(..., document.body)`.

- **`ResizeObserver` sur un conteneur de mise en page avec `overflow` conditionnel** : ne pas mettre `overflow: auto` par défaut si l'overflow n'est nécessaire que dans un cas particulier — l'apparition/disparition d'une scrollbar redéclenche l'observer et peut casser une animation ou fausser une mesure en cours. Basculer `overflow` seulement dans le mode qui en a besoin. Un `ResizeObserver` doit rester connecté en continu (ne pas le déconnecter après la première mesure), sinon la mise en page se fige au zoom navigateur suivant.

- **Centrer un conteneur potentiellement plus large que son parent, en le gardant scrollable** : ne jamais `justifyContent`/`alignItems: 'center'` sur un flex/grid scrollable — si le contenu dépasse, les navigateurs refusent un `scrollLeft` négatif, donc la partie qui dépasse à gauche devient inatteignable au scroll. Utiliser `width: 'fit-content', margin: '0 auto'` : en cas de dépassement, la marge se résout à 0 (alignement à gauche, immédiatement visible) et le reste est atteignable en scrollant.

- **Rangée flex dont un panneau n'a que des enfants `position: absolute`** (ex. le panneau « pots » de `ProgrammeTab`) : ce panneau a une hauteur intrinsèque nulle — sa hauteur visible vient soit d'un frère avec du contenu réel, soit d'une hauteur définie. Si l'ancêtre est en `minHeight` (hauteur `auto`), un `height: '100%'` ne résout pas ; supprimer le frère qui donnait la hauteur fait s'effondrer toute la rangée à 0 px → « page blanche » inexpliquée. Toujours poser un `minHeight` explicite sur le conteneur de la rangée dans ce cas.

- **Deux systèmes d'avatar distincts existent** — ne pas les confondre : le composeur PNG actuel (`src/components/avatar/avatarConfig.ts`, rendu par `AvatarComposer`, édité via `/profile/avatar`, source de vérité `publicMetadata.avatarParts` sur le compte Clerk) et un système SVG legacy (`src/components/avatar/types.ts`, rendu par `AvatarSVG`, utilisé uniquement par la `Navbar` visiteur — invisible une fois connecté). Toujours vérifier de quel fichier `avatarConfig`/`types` on importe avant de modifier le rendu d'avatar.
