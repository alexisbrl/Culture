# Chantier : refonte UI de l'app connectée sur le nouveau design system

**Branche :** feat/refonte-ui-design-system
**PR :** https://github.com/alexisbrl/Culture/pull/31
**Cadré le :** 2026-08-05

## Objectif

Mettre en ligne le design produit avec Claude Design : porter toute l'**application
connectée** (dashboard, parcours, exercice, générateur d'examen, profil, réglages
d'atelier) sur le nouveau design system — palette crème/vert/tan, typographie
Hanken Grotesk, échelle d'espacement 4 px, deux rayons, deux élévations — et sur
la nouvelle navigation (barre du haut sur ordinateur, barre d'onglets en bas sur
téléphone, mode « dans l'atelier »).

C'est un chantier **d'interface uniquement**. Il ne change ni le modèle de données,
ni les règles métier, ni le périmètre fonctionnel — à une exception près, décidée
avec Alexis : le renommage du vocabulaire « brique de connaissance » en « notion ».

## Critère de réussite global

Chaque écran de l'app connectée est visuellement conforme à la maquette
`docs/design/App-Culture.dc.html` sur ordinateur **et** sur téléphone, aucune
fonctionnalité existante n'a disparu, `npm run build` et `npm run lint` passent, et
plus aucune couleur de l'ancienne charte (`#2d2a24`, `#5f8a3f`, `#fcf9f2`,
`#a87a3a`…) ni aucune classe `violet-*` ne subsiste dans les fichiers de l'app
connectée.

## Sources de vérité

- **La maquette** : `docs/design/App-Culture.dc.html` — prototype des 9 écrans, tous
  les styles inline. Chaque écran se repère par `data-screen-label="…"`.
- **Le mode d'emploi de la maquette** : `docs/design/README.md`. **À lire avant la
  première tâche.** Il explique le format `.dc.html`, ce qui est tronqué dans le
  fichier, et surtout **quelles variantes sont retenues** (plusieurs versions d'un
  même écran cohabitent dans le fichier — se tromper de variante, c'est refaire
  l'écran).
- **Les tokens** : `docs/design/tokens/*.css` — valeurs exactes des couleurs,
  typographie, espacements, rayons, ombres, motion.
- **Les composants du design system** : `docs/design/_ds_bundle.js` — styles exacts
  de Button, Card, Input, Pill, Badge, Tag, Avatar, ProgressBar, Tabs, StatCard,
  Checkbox, Radio, SegmentedControl.
- **Le projet Claude Design** (si un détail manque) : `DesignSync`, `method:
  get_file`, `projectId: 5a4a1789-7b99-42ff-bcc8-8fd4d723c700`. Le dossier
  `screenshots/` du projet contient des captures des écrans.

## Décisions arrêtées avec Alexis

- **Périmètre = app connectée uniquement** — la vitrine (landing, pricing,
  à-propos, contact, sign-in, sign-up, legal) n'est pas maquettée et **ne fait pas
  partie du chantier**. Elle gardera l'ancienne charte, c'est assumé.
- **Responsive complet** — chaque écran est implémenté dans ses deux variantes,
  ordinateur (barre du haut) et téléphone (barre d'onglets en bas). Point de
  bascule : **768 px** (arbitrage de cadrage — c'est le `md` de Tailwind et la
  frontière naturelle entre les deux mises en page du prototype).
- **Aucun sérif.** Le design system prévoit Source Serif 4 pour quelques accroches ;
  Alexis a tranché « tout en sans ». Source Serif 4 n'est donc **pas chargée**, et
  `--font-serif` est défini comme un alias vers la sans — exactement comme le
  design system le fait déjà pour `--font-script` — pour que le markup porté depuis
  la maquette (qui écrit `font-family:var(--font-serif)` à 12 endroits) rende juste
  sans qu'on ait à traquer chaque occurrence.
- **Typographie : Hanken Grotesk.** Inter Tight, Caveat et l'utilitaire
  `.font-script` sont retirés. `CLAUDE.md` §3 est à mettre à jour (T44).
- **Lexique : « brique de connaissance » → « notion »**, dans les textes visibles
  **et** dans les identifiants de code. **La base de données n'est pas renommée** :
  les tables restent `workshop_bricks`, `brick_mastery`, `exam_question_bricks` et
  leurs colonnes `brick_id`. Un renommage en base est une migration destructive,
  interdite en autonomie (`CLAUDE.md` §1). Le reste à faire est consigné dans
  `CLAUDE.md` et `docs/backlog.md` par T2.
- **Le reste du lexique ne bouge pas** : la maquette écrit « forfait Graine /
  Buisson / Arbre » — on garde **Gratuit / Premium / Premium+**.
- **Les fonctions absentes sont dessinées, pas branchées.** La maquette montre une
  cloche de notifications, un compteur de gouttes, un arrosoir/série de jours, une
  carte « reprendre », un sélecteur d'atelier. Elles sont rendues **avec les données
  réelles quand elles existent** (nom d'atelier, pourcentage, membres, fichiers) et
  **masquées quand elles n'existent pas**. Aucune migration, aucune server action
  nouvelle.
- **Trois blocs sont dessinés « inertes »** — conformes à la maquette mais
  désactivés et non persistés, parce qu'ils exigeraient une migration : l'**emoji
  d'atelier** (Réglages › Général), les **groupes de membres** (Réglages ›
  Membres), la **grille de paliers tarifaires** (Réglages › Premium). Ils doivent
  être visiblement non interactifs (`disabled`, `pointer-events: none`, `aria-disabled`),
  jamais des faux contrôles qui semblent fonctionner.
- **Le Dashboard conserve ce que la maquette ne montre pas.** La maquette n'affiche
  que salutation + carte « reprendre » + tiroir des ateliers. La recherche
  d'atelier, la modale Preview et la corbeille **restent**, sous le cadre maquetté,
  simplement repeintes.
- **Analyse et Générateur de cours** deviennent des états vides « V2 » conformes à
  la maquette. Le contenu actuel d'`AnalyseTab.tsx` est retiré.
- **Les écrans non maquettés de l'app connectée** (création d'atelier, éditeur
  d'avatar, page `session`) sont repeints aux tokens sans changement de mise en page.
- **Validation d'une tâche : `npm run build` + `npm run lint`.** Pas de Playwright
  (non installé), pas de capture. Alexis relit le rendu sur la PR.

## Hors périmètre

- Toute la vitrine déconnectée : `src/app/[locale]/{page.tsx,pricing,about,contact,legal,sign-in,sign-up}`.
- Toute évolution fonctionnelle : nouvelles tables, nouvelles server actions,
  nouvelles règles métier, nouveaux droits.
- Le renommage des tables et colonnes Supabase (voir Décisions).
- La gamification V2 (plantes qui poussent, énergie réelle, série réelle, amis).
- L'habillage : illustrations, couvertures photo, animations riches, micro-interactions.

## Zones interdites

- **`src/app/[locale]/garden/**`** — le Jardin. La maquette propose une scène
  isométrique où chaque parcelle est un atelier ; ça contredit `docs/product-spec.md`
  (« le jardin est indépendant des ateliers ») et remplacerait l'éditeur Terra Nil
  existant (`GardenClient.tsx`, 1 125 lignes, moteur `gardenEngine.ts`, mock
  `localStorage` `culture.garden.v2`). Décision d'Alexis : **on n'y touche pas**, ce
  sera un chantier à part. Ni le rendu de l'île, ni le HUD, ni les tokens.
- **`src/lib/database.types.ts`** — fichier généré, jamais édité à la main.
- **`src/lib/**`, `src/app/actions/**`, `src/app/api/**`** — le chantier est
  purement UI. **Seule exception : T2**, et uniquement pour du renommage
  d'identifiants (aucun changement de comportement, aucun changement de requête SQL).
- **Toute migration de base de données** — aucune, en aucune circonstance.

---

## Règles d'exécution

À respecter à chaque tâche, sans exception :

1. **Une tâche = un commit**, message en Conventional Commits (`feat:`, `fix:`,
   `chore:`, `refactor:`), en français.
2. **Avant de considérer une tâche terminée : `npm run build` ET `npm run lint`.**
   `tsc --noEmit` ne suffit pas (piège Turbopack, `CLAUDE.md` §1). `npm run lint`
   doit renvoyer **0 erreur** ; les warnings « React Compiler readiness » existants
   sont tolérés et ne doivent pas être « corrigés » en retirant un effet.
3. **i18n obligatoire** : toute chaîne visible passe par next-intl, ajoutée dans
   `messages/fr.json` **et** `messages/en.json`. Jamais de chaîne en dur.
   Routine détaillée : `.claude/rules/i18n.md`.
4. **Icônes : `lucide-react` uniquement.** La maquette contient des SVG Lucide
   inline — les remplacer par le composant Lucide correspondant, jamais recopier le
   SVG. Épaisseur de trait 1,75 ; tailles 16 px en ligne de texte, 18–20 px dans les
   boutons et la nav, 22–24 px isolées. **Zéro emoji en guise d'icône.**
5. **Aucune couleur, ombre, rayon ou espacement hors tokens.** Pas de hex en dur
   dans un `style={{}}` — passer par `src/lib/theme.ts` ou une variable CSS.
6. **Cocher la tâche** dans ce fichier, ajouter une ligne au **Journal**, et inclure
   cette mise à jour dans le commit de la tâche.
7. **En cas d'ambiguïté : décider, documenter, continuer.** Consigner l'arbitrage
   dans « Décisions prises en autonomie ». Ne jamais s'arrêter pour attendre une
   réponse.
8. **Après 2 échecs sur une tâche, l'abandonner**, la consigner dans « Tâches
   bloquées » avec le motif, et passer à la suivante.

### Le mode dense (écrans experts)

Pour la banque de questions, l'éditeur d'examen, les membres et les fichiers :

- Hauteur minimale des contrôles interactifs : **32 px** (36 px pour les principaux).
- **Alignement en colonnes** : dans une liste, chaque type d'information a sa
  colonne à position fixe. Pas de contenu qui zigzague d'une ligne à l'autre.
- **Contraste plein sur toute donnée.** L'encre translucide est réservée aux
  libellés de colonnes.
- **3 icônes d'action visibles maximum par ligne**, le reste dans un menu « ⋯ ».
- **Une seule valeur de bordure.** Zébrage **ou** séparateurs fins pour les longues
  listes, jamais les deux.

### Checklist de revue (à passer sur chaque écran livré)

1. La hiérarchie se lit en plissant les yeux : titre, action principale, contenu.
2. Une seule action primaire (verte) par écran ou par zone.
3. Tout texte porteur d'information passe le contraste AA (4,5:1 corps, 3:1 gros titres).
4. Toutes les valeurs d'espacement sont sur la grille de 4 px.
5. Aucun emoji en guise d'icône ; Lucide partout, taille standard.
6. Les états vide / chargement / erreur existent.
7. Le focus clavier est visible (halo vert, `--shadow-focus`).
8. L'écran reste correct à 380 px de large.
9. Aucune couleur, ombre ou rayon hors tokens.
10. L'écran est réussi **sans aucune image** — les emplacements visuels sont des
    placeholders assumés, pas des trous.

---

## Tâches

### Lot 0 — Lexique

- [ ] **T1 — Renommer « brique » en « notion » dans les textes visibles**
  - Ne toucher qu'aux **valeurs** de `messages/fr.json` et `messages/en.json`, pas
    aux clés. FR : « brique de connaissance » → « notion », « brique » → « notion »,
    « briques » → « notions » (accorder les articles : « la brique » → « la
    notion », « des briques » → « des notions »). EN : "knowledge brick" / "brick" →
    "notion", "bricks" → "notions".
  - Critère d'acceptation : `grep -ci "brique" messages/fr.json` renvoie `0`,
    `grep -ci "brick" messages/en.json` renvoie `0`, `npm run build` et
    `npm run lint` passent.
  - Fichiers : `messages/fr.json`, `messages/en.json`
  - Dépend de : rien

- [ ] **T2 — Renommer « brick » en « notion » dans les identifiants de code**
  - Renommer les clés i18n (`bricks` → `notions`, `brickCount` → `notionCount`,
    `bricksHint`, `bricksLabel`, `masteredBricks`, `noBricks`, `addBrickOption`…) et
    toutes leurs références ; renommer les variables, types, composants et fichiers
    (`src/lib/workshops/bricks.ts` → `notions.ts`,
    `src/app/actions/workshopBricks.ts` → `workshopNotions.ts`,
    `settings/BricksSection.tsx` → `NotionsSection.tsx`, `Brick` → `Notion`,
    `bricks` → `notions`…) via `git mv` pour préserver l'historique.
  - **Ne pas toucher aux noms Supabase** : les chaînes `'workshop_bricks'`,
    `'brick_mastery'`, `'exam_question_bricks'`, `brick_id` et tout autre nom de
    colonne restent **littéralement inchangés** dans les requêtes. Ajouter au-dessus
    de chaque `.from('workshop_bricks')` un commentaire court : `// table encore
    nommée bricks en base — renommage différé, voir docs/backlog.md`.
  - **Ne pas toucher à `src/lib/database.types.ts`** (généré).
  - Ajouter dans `CLAUDE.md` §1 une règle courte « Lexique : notion (produit, code)
    = brick (base) », et dans `docs/backlog.md` un item « Renommer les tables
    `workshop_bricks`/`brick_mastery`/`exam_question_bricks` en `notions` — migration
    destructive, à faire après déploiement du code renommé, séquencement
    expand/contract de `CLAUDE.md` §1 ».
  - Critère d'acceptation : `grep -ri "brick" src/ --include=*.ts --include=*.tsx -l`
    ne renvoie que `src/lib/database.types.ts` et les fichiers contenant uniquement
    des noms de tables/colonnes Supabase ; `grep -ri "brick" messages/` ne renvoie
    rien ; `npm run build` et `npm run lint` passent.
  - Fichiers : `messages/{fr,en}.json`, `src/lib/workshops/{bricks,chapters,exam,examTypes}.ts`,
    `src/app/actions/{workshopBricks,workshopChapters,examQuestions,parcoursQuestions}.ts`,
    `src/app/[locale]/workshops/[id]/settings/{BricksSection,SettingsClient,settingsShared,page}.tsx`,
    `src/app/[locale]/workshops/[id]/tabs/{AnalyseTab,ExamenTab,ProgrammeTab,QuestionEditor}.tsx`,
    `src/app/[locale]/workshops/[id]/tabs/programme/ParcoursQuestions.tsx`,
    `CLAUDE.md`, `docs/backlog.md`
  - Dépend de : T1

### Lot 1 — Socle du design system

- [ ] **T3 — Tokens de couleur**
  - Porter `docs/design/tokens/colors.css` (+ `_compat.css`) dans
    `src/app/globals.css` (bloc `@theme inline` et `:root`) et dans
    `src/lib/theme.ts` (`palette`). Garder les **anciens noms exportés** de
    `palette` comme alias vers les nouvelles valeurs (`ink` → `--ink`, `cream` →
    `--surface-page`, `green` → `--green`, `amber` → `--tan`…) pour que rien ne
    casse avant les tâches d'écran. Ajouter les nouveaux rôles manquants
    (`surfaceRaised`, `surfaceInput`, `surfaceSunken`, `line`, `lineStrong`,
    `success`, `gold`, `onGreen`, `onInk`).
  - Critère d'acceptation : `npm run build` et `npm run lint` passent ; l'app
    démarre et aucune page ne rend de texte invisible (vérifier que chaque token
    exporté par `palette` a une valeur non vide via une lecture du fichier).
  - Fichiers : `src/app/globals.css`, `src/lib/theme.ts`
  - Dépend de : T2

- [ ] **T4 — Typographie**
  - Remplacer `Inter_Tight` et `Caveat` par `Hanken_Grotesk` (`next/font/google`)
    dans `src/app/[locale]/layout.tsx`. Supprimer l'utilitaire `.font-script` de
    `globals.css` et ses 3 usages. Définir `--font-serif` comme alias de la sans.
    Porter l'échelle typographique (7 niveaux) et les rôles (`hero`, `eyebrow`,
    `body`, `stat`) en variables CSS.
  - Critère d'acceptation : `grep -r "Inter_Tight\|Caveat\|font-script" src/` ne
    renvoie rien ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/layout.tsx`, `src/app/globals.css`,
    `src/app/[locale]/create/page.tsx`, `src/app/[locale]/workshops/[id]/session/page.tsx`
  - Dépend de : T3

- [ ] **T5 — Tokens d'espacement, rayons, ombres, motion**
  - Porter `docs/design/tokens/spacing.css` : grille 4 px, deux rayons (12 / 20) +
    pill, deux élévations + `--shadow-inset` + `--shadow-focus`, deux courbes et
    trois durées. Mettre à jour `radius` et `shadow` dans `src/lib/theme.ts`.
    Ajouter le style de focus global (`:focus-visible` → `--shadow-focus`).
  - Critère d'acceptation : `radius` et `shadow` de `theme.ts` ne contiennent plus
    que les valeurs du design system ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/globals.css`, `src/lib/theme.ts`
  - Dépend de : T4

- [ ] **T6 — Composant Button**
  - Refondre `src/components/ui/button.tsx` d'après `docs/design/_ds_bundle.js`
    (composant `Button`) : variantes **primaire** (vert plein), **secondaire** (tan
    plein), **ink** (charbon plein), **ghost** (surface crème + filet), **danger** ;
    trois tailles ; option flèche finale ; états hover (vert plus sombre), press
    (scale 0.98), focus (halo vert), disabled.
  - Critère d'acceptation : le fichier n'expose que ces variantes et tailles, aucune
    couleur en dur ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/ui/button.tsx`, `src/components/LinkButton.tsx`
  - Dépend de : T5

- [ ] **T7 — Composants de formulaire**
  - Refondre `input.tsx` et `label.tsx`, et créer les composants manquants
    (`textarea.tsx`, `select.tsx`, `checkbox.tsx`, `radio.tsx`, `switch.tsx`) dans
    `src/components/ui/`, d'après `_ds_bundle.js` (`Input`, `Checkbox`, `Radio`).
    Surface `--surface-input`, filet `--line`, rayon 12 px, hauteur ≥ 36 px, focus
    en halo vert, placeholder en `--ink-faint`.
  - Critère d'acceptation : les 7 composants existent et sont exportés ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/ui/{input,label,textarea,select,checkbox,radio,switch}.tsx`
  - Dépend de : T6

- [ ] **T8 — Card et état vide**
  - Refondre `src/components/ui/card.tsx` (surface `--surface-raised`, filet
    `--line`, rayon 20 px, `--shadow-sm`, hover : `--shadow` + translation −1 px) et
    créer `src/components/ui/empty-state.tsx` (icône Lucide, titre, phrase, action
    facultative — jamais un blanc).
  - Critère d'acceptation : les deux composants existent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/ui/card.tsx`, `src/components/ui/empty-state.tsx`
  - Dépend de : T7

- [ ] **T9 — Pill, Badge, Chip, Tag**
  - Refondre `src/components/ui/badge.tsx` et créer `pill.tsx` et `tag.tsx` d'après
    `_ds_bundle.js` (`Pill`, `Badge`, `Tag`). Inclure les variantes vues dans la
    maquette : badge de version (`V2`, `V3`), badge Premium (or), pastille de
    comptage, pilule de filtre.
  - Critère d'acceptation : les trois composants existent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/ui/{badge,pill,tag}.tsx`
  - Dépend de : T8

- [ ] **T10 — Modale et dialogue de confirmation unifiés**
  - Porter `src/components/Modal.tsx` et `src/components/ConfirmDialog.tsx` sur les
    tokens : scrim translucide, carte `--surface-raised`, rayon 20 px,
    `--shadow-lg`. Conserver strictement le comportement actuel (portail,
    fermeture, focus) — voir le piège `position:fixed` dans un ancêtre transformé
    (`.claude/rules/frontend-patterns.md`).
  - Critère d'acceptation : aucun hex en dur dans les deux fichiers ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/Modal.tsx`, `src/components/ConfirmDialog.tsx`
  - Dépend de : T9

- [ ] **T11 — SegmentedControl, Tabs, ProgressBar**
  - Créer les trois composants dans `src/components/ui/` d'après `_ds_bundle.js`
    (`SegmentedControl`, `Tabs`, `ProgressBar`). La ProgressBar reprend le remplissage
    vert sur piste `--surface-sunken` avec `--shadow-inset`.
  - Critère d'acceptation : les trois composants existent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/ui/{segmented-control,tabs,progress-bar}.tsx`
  - Dépend de : T10

### Lot 2 — Coquille de navigation

- [ ] **T12 — Barre du haut ordinateur (hors atelier)**
  - Refondre l'en-tête de l'app connectée d'après les lignes 57–139 de la maquette :
    hauteur 60 px, mot-marque « Culture » + logo germe à gauche, onglets centrés
    `jardin` / `profil`, à droite cloche + gouttes + avatar. **Variante « V2 · sans
    accueil » : pas de bouton « accueil ».** Le logo mène au dashboard.
  - Critère d'acceptation : à ≥ 768 px la barre est rendue avec ces éléments, aucune
    couleur hors tokens, icônes Lucide ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/DashboardHeader.tsx`, `src/app/[locale]/layout.tsx`
  - Dépend de : T11

- [ ] **T13 — Mode « dans l'atelier »**
  - Quand l'utilisateur est dans un atelier, la barre du haut affiche en plus : le
    nom de l'atelier à côté du mot-marque, le groupe d'onglets **encadré**
    (`parcours` · `examens` · `cours` avec badge `V2`) au centre, et l'accès aux
    réglages à droite. Le groupe suit le style « encadré » (variante retenue) :
    conteneur à filet et rayon pill, onglet actif sur surface levée.
  - Critère d'acceptation : le groupe encadré n'apparaît que dans un atelier, l'onglet
    actif reflète l'onglet courant, `cours` est désactivé avec badge `V2` ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/DashboardHeader.tsx`,
    `src/app/[locale]/workshops/[id]/WorkshopClient.tsx`
  - Dépend de : T12

- [ ] **T14 — Barre d'onglets téléphone et bandeau d'atelier**
  - Sous 768 px : barre d'onglets fixée en bas (icône + libellé 10,5 px, lignes
    1881–1930 de la maquette), avec le groupe d'atelier inséré au milieu quand on est
    dans un atelier. Ajouter le bandeau d'atelier collant en haut (lignes 146–176) :
    nom en capitales + croix pour quitter + accès réglages.
  - Critère d'acceptation : sous 768 px la barre du bas est rendue et la barre du haut
    masquée, l'inverse au-dessus ; le contenu de page ne passe pas sous la barre du
    bas ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/DashboardHeader.tsx` (ou nouveau
    `src/components/MobileTabBar.tsx`), `src/app/[locale]/layout.tsx`
  - Dépend de : T13

- [ ] **T15 — Cloche de notifications et compteur de gouttes**
  - Dessiner la cloche et son panneau déroulant, et le compteur de gouttes, d'après
    la maquette. **Aucune donnée n'existe pour les alimenter** : les deux sont rendus
    **masqués** derrière un drapeau de compilation local (`const HAS_NOTIFICATIONS =
    false`, `const HAS_DROPLETS = false`) avec un commentaire renvoyant à cette
    feuille de route. Le code est écrit, la place est réservée, rien ne s'affiche.
  - Critère d'acceptation : les composants existent, ne sont pas montés, et aucun
    compteur factice n'apparaît à l'écran ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/NotificationBell.tsx`, `src/components/DropletCounter.tsx`,
    `src/components/DashboardHeader.tsx`
  - Dépend de : T14

### Lot 3 — Dashboard

- [ ] **T16 — En-tête de salutation**
  - Salutation personnalisée (« bonsoir alexis. » — en **sans**, pas en sérif) et
    sous-titre, d'après les lignes 179–208 de la maquette. Le moment de la journée
    est calculé côté client. Chaînes dans `fr.json` et `en.json`.
  - Critère d'acceptation : la salutation varie selon l'heure, les deux chaînes
    existent dans les deux fichiers de messages ; `npm run build` et `npm run lint`
    passent.
  - Fichiers : `src/app/[locale]/dashboard/DashboardClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T15

- [ ] **T17 — Carte « reprendre »**
  - Carte héros du dashboard (lignes 209–228) : illustration Lucide, nom de
    l'atelier, méta, barre de progression + pourcentage, bouton « reprendre » à
    flèche. **Données réelles** : le dernier atelier travaillé n'existe pas en base —
    utiliser le premier atelier de la liste triée par `updated_at` décroissant déjà
    disponible côté client. **Si l'utilisateur n'a aucun atelier, la carte est
    remplacée par l'état vide** (`EmptyState` + « créer un atelier »).
  - Critère d'acceptation : la carte s'affiche avec des données réelles, l'état vide
    s'affiche à zéro atelier, aucune valeur factice codée en dur ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/app/[locale]/dashboard/DashboardClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T16

- [ ] **T18 — Tiroir « tous mes ateliers »**
  - Poignée en bas de page qui déploie un panneau par-dessus le contenu (lignes
    229–265) : entrée « nouvel atelier » puis une ligne par atelier (icône feuille,
    nom, méta, pourcentage, chevron). Poignée en haut quand le tiroir est ouvert.
  - Critère d'acceptation : le tiroir s'ouvre et se ferme, liste les ateliers réels
    avec leur pourcentage réel, et l'entrée « nouvel atelier » mène à
    `/workshops/new` ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/dashboard/DashboardClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T17

- [ ] **T19 — Recherche, Preview et corbeille repeintes**
  - La partie du dashboard **absente de la maquette** est conservée et portée sur les
    tokens et les nouveaux composants : recherche d'atelier par tag, modale Preview
    (couverture, nom, description, propriétaire, nombre de membres, bouton
    rejoindre/entrer), corbeille. Mise en page inchangée, habillage refait.
  - Critère d'acceptation : les trois fonctionnalités marchent comme avant (recherche
    par tag, ouverture de la Preview via `?preview=`, restauration depuis la
    corbeille), aucun hex en dur ne subsiste dans le fichier ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/app/[locale]/dashboard/DashboardClient.tsx`, `src/components/ShareQRModal.tsx`
  - Dépend de : T18

### Lot 4 — Parcours

- [ ] **T20 — En-tête d'atelier du parcours**
  - Lignes 412–433 : nom de l'atelier, pourcentage, ligne « N notions acquises sur
    M », et bouton « liste des questions du parcours » (gestionnaires uniquement).
    La ligne des notions n'est affichée que si le compte est disponible.
  - Critère d'acceptation : l'en-tête affiche les valeurs réelles de l'atelier, le
    bouton n'apparaît que pour `manager`/`owner` ; `npm run build` et `npm run lint`
    passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/ProgrammeTab.tsx`, `messages/{fr,en}.json`
  - Dépend de : T19

- [ ] **T21 — Vue « serre » : étagères de pots**
  - Variante retenue : `vueSerre` (lignes 434–465). Un rayonnage par chapitre, un pot
    par chapitre, avec nom, statut et bouton « continuer ». Les variantes
    `vueParcelle` et `vueChapitres` du fichier sont **ignorées**. Le nombre de pots
    suit le nombre de chapitres réels ; zéro chapitre → état vide.
  - Critère d'acceptation : un pot par chapitre réel, le bouton mène à
    `/workshops/{id}/exercise/{chapterId}`, état vide à zéro chapitre ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/ProgrammeTab.tsx`, `messages/{fr,en}.json`
  - Dépend de : T20

- [ ] **T22 — Vue « questions du parcours »**
  - Porter la vue de gestion des questions de parcours sur les nouveaux composants et
    le mode dense : lignes alignées en colonnes, sélecteur de chapitre par ligne
    (soulignement rouge si aucun chapitre), 3 icônes d'action maximum.
  - Critère d'acceptation : l'affectation de chapitre par ligne fonctionne toujours
    (enregistrement immédiat), aucun hex en dur ; `npm run build` et `npm run lint`
    passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/programme/ParcoursQuestions.tsx`
  - Dépend de : T21

### Lot 5 — Exercice

- [ ] **T23 — Coquille plein écran et énoncé**
  - Lignes 530–620 : écran d'exercice plein cadre, en-tête avec progression et
    sortie, énoncé sur surface levée. La coquille masque la barre du haut/du bas.
  - Critère d'acceptation : l'écran s'affiche en plein cadre sur les deux tailles,
    l'énoncé réel est rendu ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/exercise/[chapterId]/ExerciseClient.tsx`
  - Dépend de : T22

- [ ] **T24 — Zone de réponse et correction**
  - Choix cliquables pour QCS/QCM avec états sélectionné / bon / mauvais ; saisie
    libre pour les autres types. Bloc de correction après validation, puis bouton
    « question suivante ». **Ne rien changer au contrat serveur** : le client ne
    reçoit toujours ni `answer` ni `correctChoices` au tirage.
  - Critère d'acceptation : la correction automatique QCS/QCM fonctionne comme
    avant, les autres types affichent la réponse attendue sans verdict ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/exercise/[chapterId]/ExerciseClient.tsx`
  - Dépend de : T23

- [ ] **T25 — Écran de fin d'exercice**
  - Ligne 676 : écran « belle récolte. » (en **sans**), score de la session, bouton
    de retour au parcours.
  - Critère d'acceptation : l'écran s'affiche à la fin des questions du chapitre avec
    le score réel ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/exercise/[chapterId]/ExerciseClient.tsx`,
    `messages/{fr,en}.json`
  - Dépend de : T24

### Lot 6 — Profil

- [ ] **T26 — Carte d'identité**
  - Lignes 1325–1345 : avatar, nom, « jardinier depuis {mois année} », bouton
    « éditer ». L'avatar reste rendu par `AvatarComposer` existant.
  - Critère d'acceptation : le nom, la date d'inscription et l'avatar réels
    s'affichent ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T25

- [ ] **T27 — Bloc série et suivi**
  - Bloc « N jours d'arrosage d'affilée » et bloc « suivi ». **Aucune donnée de série
    n'existe** : le bloc série est écrit puis masqué derrière `const HAS_STREAK =
    false`, comme T15. Le bloc « suivi » renvoie vers l'état vide V2.
  - Critère d'acceptation : aucun compteur de série factice n'est visible ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`
  - Dépend de : T26

- [ ] **T28 — Bloc forfait**
  - Carte du forfait courant avec son résumé et le bouton d'évolution. **Lexique
    conservé** : « Gratuit », « Premium », « Premium+ » — pas Graine/Buisson/Arbre.
    Le niveau est lu depuis les données d'abonnement existantes.
  - Critère d'acceptation : le forfait réel de l'utilisateur s'affiche, le bouton
    mène à `/pricing` ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T27

- [ ] **T29 — Liste des paramètres du profil**
  - Liste des entrées de réglages du compte (libellé + indice + chevron), en
    conservant **toutes** les entrées existantes de la page profil actuelle. Les
    libellés exacts de la maquette sont dans la partie tronquée du fichier : partir
    des entrées réelles de l'application.
  - Critère d'acceptation : aucune entrée de réglage présente avant la tâche n'a
    disparu ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`
  - Dépend de : T28

### Lot 7 — Réglages d'atelier

- [ ] **T30 — Coquille des réglages**
  - Lignes 1408–1432 : panneau de navigation collant à gauche sur ordinateur
    (eyebrow « PARAMÈTRES » + entrées à icône), sélecteur de section en bandeau
    collant sur téléphone. **Conserver le montage permanent des sections**
    (`display: 'contents' | 'none'`) — le montage conditionnel réintroduirait des
    régressions documentées dans `.claude/rules/server-architecture.md`.
  - Critère d'acceptation : les sections restent montées en permanence, la navigation
    fonctionne sur les deux tailles ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/{SettingsClient,settingsShared}.tsx`
  - Dépend de : T29

- [ ] **T31 — Section Général**
  - Nom, tag, description, date de création, « afficher le programme éducatif »,
    QR code, zone de danger (suppression). Ajouter le sélecteur d'**emoji d'atelier**
    de la maquette **inerte** : rendu conforme, `disabled` + `aria-disabled`, avec un
    commentaire renvoyant à `docs/backlog.md`.
  - Critère d'acceptation : les champs existants s'enregistrent comme avant (pattern
    « modifications non enregistrées » intact), le sélecteur d'emoji ne déclenche
    aucun appel serveur ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/SettingsClient.tsx`
  - Dépend de : T30

- [ ] **T32 — Section Membres & rôles**
  - Invitation par tag, liste des membres en mode dense (initiale, nom, rôle, tag,
    action, exclure), demandes d'adhésion. Ajouter le bloc **GROUPES** de la maquette
    **inerte** (même règle que T31).
  - Critère d'acceptation : promotion, rétrogradation, exclusion, invitation et
    traitement des demandes fonctionnent comme avant ; le bloc groupes ne déclenche
    aucun appel serveur ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/MembersSection.tsx`
  - Dépend de : T31

- [ ] **T33 — Section Fichiers**
  - Zone de dépôt à bordure pointillée tan (1,5 px), liste des fichiers en mode
    dense (nom, méta, actions). Conserver l'upload direct au stockage avec barre de
    progression.
  - Critère d'acceptation : l'upload et la suppression fonctionnent comme avant, la
    progression s'affiche ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/FilesSection.tsx`
  - Dépend de : T32

- [ ] **T34 — Section Atelier Premium**
  - Lignes 1642–1716 : carte de passage / carte de statut actif, liste des avantages,
    détail des prix. La **grille de paliers dégressifs** est dessinée **inerte**
    (même règle que T31) : la tarification réelle reste celle de
    `docs/product-spec.md`. **Ne toucher en aucun cas** à la logique
    d'irréversibilité ni au mécanisme de test d'activation.
  - Critère d'acceptation : le flux d'activation Premium existant est inchangé (mêmes
    appels, mêmes garde-fous), la grille de paliers n'est pas interactive ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/PremiumSection.tsx`
  - Dépend de : T33

- [ ] **T35 — Section Chapitres & notions**
  - Lignes 1717–1801 : deux colonnes (chapitres à gauche, notions du chapitre
    sélectionné à droite), ajout, renommage, réorganisation, suppression, états vides
    (« crée un chapitre pour y planter tes premières notions. »).
  - Critère d'acceptation : le CRUD des chapitres et des notions fonctionne comme
    avant, la réorganisation persiste, les états vides s'affichent ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/NotionsSection.tsx` (renommé en T2)
  - Dépend de : T34

### Lot 8 — Générateur d'examen

- [ ] **T36 — Coquille côte à côte et onglets pleine largeur**
  - Disposition « banque et feuille côte à côte » : colonne gauche (liste) + colonne
    droite (feuille A4), lignes 688–695 et 797+. En tête de la colonne gauche, les
    **deux onglets pleine largeur** « mes examens » / « questions » (variante
    `banqueOngletsLarge` — voir `docs/design/README.md`). Bouton « personnaliser »
    au-dessus de la feuille. Sur téléphone, les deux colonnes s'empilent.
  - Critère d'acceptation : les deux onglets basculent le contenu de la colonne
    gauche, la feuille reste visible à droite au-dessus de 768 px et passe dessous
    en dessous ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/ExamenTab.tsx`,
    `src/app/[locale]/workshops/[id]/tabs/examen/examShared.tsx`
  - Dépend de : T35

- [ ] **T37 — Liste « mes examens »**
  - Barre de recherche + tri + filtres **toujours visibles** (variante retenue) +
    bouton « + nouvel » vert. Une carte par examen : titre, date de création, trois
    icônes d'action. Mode dense.
  - Critère d'acceptation : recherche, tri et filtres opèrent sur les examens réels,
    l'ouverture d'un examen charge son brouillon ; `npm run build` et `npm run lint`
    passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/HistoryContent.tsx`
  - Dépend de : T36

- [ ] **T38 — Banque de questions**
  - Même barre d'outils, lignes de questions en mode dense (colonnes fixes : intitulé,
    type, actions), sélection multiple, envoi vers la feuille. Le filtre par
    étiquettes (pools) reste fonctionnel, et la banque continue de ne montrer que
    `context = 'exam'`.
  - Critère d'acceptation : la banque n'affiche aucune question de parcours, la
    sélection et l'envoi vers l'éditeur fonctionnent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/BankContent.tsx`
  - Dépend de : T37

- [ ] **T39 — En-tête de la feuille et pilules d'identité**
  - Lignes 945–1010 : titre éditable de l'examen, sous-titre (atelier · durée ·
    consigne), pilules d'identité candidat réparties en trois zones (gauche / droite /
    hors feuille) par glisser-déposer, barème par partie.
  - Critère d'acceptation : le déplacement des pilules entre zones persiste dans le
    brouillon, le titre s'enregistre ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/GeneratorContent.tsx`
  - Dépend de : T38

- [ ] **T40 — Feuille A4 et éditeur de question**
  - Repeindre la feuille A4 et l'éditeur de question sur les tokens : surfaces,
    filets, rayons, boutons pointillés « + question » / « + partie », sélecteur de
    type, options de réponse. **Ne toucher ni à la logique de pagination A4 ni au
    calcul de hauteur** (pièges documentés dans `.claude/rules/frontend-patterns.md`)
    — habillage seulement.
  - Critère d'acceptation : la pagination A4 produit le même nombre de pages qu'avant
    pour un examen donné, aucun hex en dur ne subsiste ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/GeneratorContent.tsx`,
    `src/app/[locale]/workshops/[id]/tabs/QuestionEditor.tsx`
  - Dépend de : T39

### Lot 9 — Clôture

- [ ] **T41 — États vides « V2 » : Analyse et Générateur de cours**
  - Remplacer le contenu d'`AnalyseTab.tsx` par l'état vide de la maquette (lignes
    1400–1405 : titre « analyse. » en **sans**, phrase, badge `V2`) et créer le même
    état vide pour « Générateur de cours » (lignes 1319–1324). **Vérifier d'abord**
    que le contenu retiré d'`AnalyseTab` ne repose sur aucune donnée réelle ; s'il
    en utilise, consigner ce qui est perdu dans le journal.
  - Critère d'acceptation : les deux onglets affichent l'état vide avec badge `V2` ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/AnalyseTab.tsx`,
    `src/app/[locale]/workshops/[id]/tabs/CoursTab.tsx`, `messages/{fr,en}.json`
  - Dépend de : T40

- [ ] **T42 — Écrans non maquettés repeints**
  - Création d'atelier (`/workshops/new`, `/create`), éditeur d'avatar
    (`/profile/avatar`) et page `session` : appliquer les tokens (couleurs, typo,
    rayons, ombres) et les nouveaux composants, **sans changer la mise en page**.
    Ne pas toucher aux deux systèmes d'avatar (piège documenté dans
    `.claude/rules/frontend-patterns.md`).
  - Critère d'acceptation : aucun hex en dur ni classe `violet-*` dans ces fichiers,
    la structure des pages est inchangée ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/new/WorkshopNewClient.tsx`,
    `src/app/[locale]/create/page.tsx`, `src/app/[locale]/profile/avatar/page.tsx`,
    `src/components/avatar/AvatarBuilder.tsx`,
    `src/app/[locale]/workshops/[id]/session/page.tsx`
  - Dépend de : T41

- [ ] **T43 — Passe finale : hex en dur, violet, emojis-icônes**
  - Balayer **les fichiers de l'app connectée uniquement** (dashboard, workshops,
    profile, components partagés) : remplacer tout hex restant dans un `style={{}}`
    par un token, supprimer toute classe `violet-*`, remplacer tout emoji utilisé
    comme icône par une icône Lucide.
  - Critère d'acceptation : `grep -rn "#[0-9a-fA-F]\{6\}" src/app/\[locale\]/{dashboard,workshops,profile} src/components`
    ne renvoie plus que des cas justifiés et commentés ; `grep -rn "violet-"` sur ces
    mêmes chemins ne renvoie rien ; `npm run build` et `npm run lint` passent.
  - Fichiers : app connectée + `src/components/**` (**pas** la vitrine, **pas** le jardin)
  - Dépend de : T42

- [ ] **T44 — Documentation**
  - `CLAUDE.md` : typographie §3 (Hanken Grotesk, retrait Inter Tight × Caveat et
    `.font-script`), règle de lexique notion/brick si T2 ne l'a pas déjà posée.
    `docs/product-spec.md` : lexique « notion », navigation de l'app connectée
    (barre du haut / barre d'onglets, mode atelier), Analyse et Générateur de cours
    en V2. `docs/changelog.md` : une entrée courte pour ce chantier.
    `docs/backlog.md` : les reports (renommage en base, emoji d'atelier, groupes de
    membres, paliers tarifaires, notifications, gouttes, série).
    `.claude/rules/frontend-patterns.md` : la section « Design tokens » mise à jour.
  - Critère d'acceptation : les cinq fichiers sont à jour et ne mentionnent plus
    Inter Tight, Caveat ni « brique de connaissance » ; `npm run build` passe.
  - Fichiers : `CLAUDE.md`, `docs/product-spec.md`, `docs/changelog.md`,
    `docs/backlog.md`, `.claude/rules/frontend-patterns.md`
  - Dépend de : T43

## Journal
<!-- Append-only. Une ligne par tâche terminée : date, tâche, commit, note. -->

## Décisions prises en autonomie
<!-- L'agent y consigne ses arbitrages de nuit. Alexis les relit au réveil. -->

## Tâches bloquées
<!-- Tâches abandonnées après 2 échecs, avec le motif. -->
