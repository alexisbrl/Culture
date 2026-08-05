# Chantier : refonte UI de l'app connectée sur le nouveau design system

**Branche :** feat/refonte-ui-design-system
**PR :** https://github.com/alexisbrl/Culture/pull/31
**Cadré le :** 2026-08-05

## Objectif

Mettre en ligne le design produit avec Claude Design : porter toute l'**application
connectée** (parcours, exercice, générateur d'examen, profil, réglages d'atelier,
mes ateliers) sur le nouveau design system — palette crème/vert/tan, typographie
Hanken Grotesk, échelle d'espacement 4 px, deux rayons, deux élévations — et sur
la nouvelle navigation : barre du haut sur ordinateur, barre d'onglets en bas sur
téléphone, et **entrée directe dans l'atelier courant** (variante « V2 · sans
accueil »), le changement d'atelier passant par un sélecteur.

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

- **La maquette** : `docs/design/App-Culture.dc.html` — prototype complet des 9
  écrans (3 750 lignes), tous les styles inline. Chaque écran se repère par
  `data-screen-label="…"` ; les valeurs `{{…}}` et le contenu des `<sc-for>` sont
  calculés dans le `<script>` final, à partir de la ligne 1934.
- **Le mode d'emploi de la maquette** : `docs/design/README.md`. **À lire avant la
  première tâche.** Il explique le format `.dc.html`, donne la table des lignes par
  écran, et surtout **quelles variantes sont retenues** — plusieurs versions d'un
  même écran cohabitent dans le fichier, et pour le générateur d'examen l'indice
  `hint-placeholder-val` pointe vers une variante abandonnée. Se tromper de
  variante, c'est refaire l'écran.
- **Les tokens** : `docs/design/_ds/culture-design-system-9fd2c08f-6694-4ff2-a9da-5c9b435463bb/tokens/*.css`
  — valeurs exactes des couleurs, typographie, espacements, rayons, ombres, motion.
- **Les composants du design system** : `docs/design/_ds/culture-design-system-9fd2c08f-6694-4ff2-a9da-5c9b435463bb/_ds_bundle.js`
  — styles exacts de Button, Card, Input, Pill, Badge, Tag, Avatar, ProgressBar,
  Tabs, StatCard, Checkbox, Radio, SegmentedControl.
- **La doctrine du design system** : `docs/design/_ds/culture-design-system-9fd2c08f-6694-4ff2-a9da-5c9b435463bb/readme.md`
  — voix, casse, fondations visuelles, iconographie.
- **Le cahier de refonte** : `docs/design/uploads/refonte-ui-culture.md` (12/07/2026).
- **Les captures d'itérations** : `docs/design/screenshots/`.

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
  `.font-script` sont retirés. `CLAUDE.md` §3 est à mettre à jour (T42).
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
- **Pas de page d'accueil — l'app ouvre dans l'atelier.** C'est ce que fait
  réellement la variante retenue « V2 · sans accueil » : le prototype force
  `page = 'parcours'` dès que la page demandée est `dashboard` (ligne 2202) et
  maintient `inAtelier = true` en permanence. L'écran Dashboard maquetté (lignes
  179–265 : salutation, carte « reprendre », tiroir des ateliers) **n'est jamais
  rendu dans ce mode** — il appartient à la variante V1, écartée. On ne l'implémente
  donc pas.
- **Le changement d'atelier passe par le sélecteur.** Panneau « CHANGER D'ATELIER »
  (ligne 1859), ouvert par le chevron à côté du nom de l'atelier : liste des ateliers
  + « nouvel atelier ». Il remplace le tiroir du Dashboard.
- **`/dashboard` devient une page secondaire « mes ateliers ».** Elle n'est plus la
  cible après connexion, mais elle survit et conserve ce que la maquette ne montre
  nulle part : recherche d'atelier par tag, modale Preview, corbeille. Elle est
  atteignable depuis le sélecteur d'atelier et sert aussi de repli pour un
  utilisateur qui n'a encore aucun atelier.
- **Analyse et Générateur de cours** deviennent des états vides « V2 » conformes à
  la maquette. Le contenu actuel d'`AnalyseTab.tsx` est retiré.
- **Les écrans non maquettés de l'app connectée** (création d'atelier, éditeur
  d'avatar, page `session`) sont repeints aux tokens sans changement de mise en page.
- **Validation d'une tâche : `npm run build` + `npm run lint` partout, plus une
  vérification visuelle sur les tâches qui produisent un écran.** Pas de Playwright
  (non installé), pas de capture archivée. Le détail est dans « Règles d'exécution »
  ci-dessous — il **précise** l'étape 2.4 de `/chantier-run`, il ne la contredit pas.

## Hors périmètre

- Toute la vitrine déconnectée : `src/app/[locale]/{page.tsx,pricing,about,contact,legal,sign-in,sign-up}`.
  **Seule exception : T16**, qui touche à la redirection de `page.tsx` pour l'utilisateur
  connecté — sans modifier le rendu de la landing pour un visiteur déconnecté.
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

**Autonomie totale.** Alexis ne répondra à aucune question pendant ce chantier.
`AskUserQuestion` est interdit, et un tour ne se termine jamais sur une question.
Face à un choix non tranché : décider selon les décisions ci-dessus et consigner
dans « Décisions prises en autonomie » ; et seulement si le choix est structurant
(modèle de données, périmètre, règle produit), inscrire la tâche dans « Tâches
mises de côté » avec une recommandation, laisser la case décochée, passer à la
suivante. Le détail de l'échelle est dans la compétence `chantier-run`.

À respecter à chaque tâche, sans exception :

1. **Une tâche = un commit**, message en Conventional Commits (`feat:`, `fix:`,
   `chore:`, `refactor:`), en français.
2. **Avant de considérer une tâche terminée : `npm run build` ET `npm run lint`.**
   `tsc --noEmit` ne suffit pas (piège Turbopack, `CLAUDE.md` §1). `npm run lint`
   doit renvoyer **0 erreur** ; les warnings « React Compiler readiness » existants
   sont tolérés et ne doivent pas être « corrigés » en retirant un effet.
   *(`docs/**` est exclu du lint : le bundle de maquette n'est pas une source.)*

3. **Vérification visuelle — sur les tâches d'écran uniquement (T12 à T41).**
   Précision de l'étape 2.4 de `/chantier-run`, décidée avec Alexis :
   - **T1 à T11** (lexique, tokens, composants isolés) et **T42** (documentation) :
     `build` + `lint` suffisent. Il n'y a pas d'écran à regarder — ne pas lancer le
     serveur de dev pour rien.
   - **T12 à T41** : lancer le serveur via `preview_start` (entrée `culture` de
     `.claude/launch.json`), ouvrir la page concernée, la comparer à l'écran
     correspondant de la maquette (table des lignes dans `docs/design/README.md`),
     et vérifier que la console ne contient aucune erreur. **Une tâche d'écran n'est
     pas terminée tant que le rendu n'a pas été vu.**
   - **Repli si la page est inatteignable** — la plupart des écrans sont derrière
     l'authentification Clerk et une session n'est pas garantie en autonomie. Si la
     page ne peut pas être ouverte pour cette raison (ou si le serveur de dev refuse
     de démarrer), **ne pas y consacrer deux tentatives** : se rabattre sur
     `build` + `lint`, terminer la tâche, et le noter dans le journal (« rendu non
     vérifié — page derrière l'authentification »). Alexis relira ces écrans-là sur
     la PR.
4. **i18n obligatoire** : toute chaîne visible passe par next-intl, ajoutée dans
   `messages/fr.json` **et** `messages/en.json`. Jamais de chaîne en dur.
   Routine détaillée : `.claude/rules/i18n.md`.
5. **Icônes : `lucide-react` uniquement.** La maquette contient des SVG Lucide
   inline — les remplacer par le composant Lucide correspondant, jamais recopier le
   SVG. Épaisseur de trait 1,75 ; tailles 16 px en ligne de texte, 18–20 px dans les
   boutons et la nav, 22–24 px isolées. **Zéro emoji en guise d'icône.**
6. **Aucune couleur, ombre, rayon ou espacement hors tokens.** Pas de hex en dur
   dans un `style={{}}` — passer par `src/lib/theme.ts` ou une variable CSS.
7. **Cocher la tâche** dans ce fichier, ajouter une ligne au **Journal**, et inclure
   cette mise à jour dans le commit de la tâche.
8. **En cas d'ambiguïté : décider, documenter, continuer.** Consigner l'arbitrage
   dans « Décisions prises en autonomie ». Ne jamais s'arrêter pour attendre une
   réponse.
9. **Après 2 échecs sur une tâche, l'abandonner**, la consigner dans « Tâches
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

- [x] **T1 — Renommer « brique » en « notion » dans les textes visibles**
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

- [x] **T2 — Renommer « brick » en « notion » dans les identifiants de code**
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

- [x] **T3 — Tokens de couleur**
  - Porter `tokens/colors.css` (+ `_compat.css`) du design system dans
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

- [x] **T4 — Typographie**
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

- [x] **T5 — Tokens d'espacement, rayons, ombres, motion**
  - Porter `tokens/spacing.css` du design system : grille 4 px, deux rayons (12 / 20) +
    pill, deux élévations + `--shadow-inset` + `--shadow-focus`, deux courbes et
    trois durées. Mettre à jour `radius` et `shadow` dans `src/lib/theme.ts`.
    Ajouter le style de focus global (`:focus-visible` → `--shadow-focus`).
  - Critère d'acceptation : `radius` et `shadow` de `theme.ts` ne contiennent plus
    que les valeurs du design system ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/globals.css`, `src/lib/theme.ts`
  - Dépend de : T4

- [x] **T6 — Composant Button**
  - Refondre `src/components/ui/button.tsx` d'après `_ds_bundle.js` (chemin complet
    dans « Sources de vérité »)
    (composant `Button`) : variantes **primaire** (vert plein), **secondaire** (tan
    plein), **ink** (charbon plein), **ghost** (surface crème + filet), **danger** ;
    trois tailles ; option flèche finale ; états hover (vert plus sombre), press
    (scale 0.98), focus (halo vert), disabled.
  - Critère d'acceptation : le fichier n'expose que ces variantes et tailles, aucune
    couleur en dur ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/ui/button.tsx`, `src/components/LinkButton.tsx`
  - Dépend de : T5

- [x] **T7 — Composants de formulaire**
  - Refondre `input.tsx` et `label.tsx`, et créer les composants manquants
    (`textarea.tsx`, `select.tsx`, `checkbox.tsx`, `radio.tsx`, `switch.tsx`) dans
    `src/components/ui/`, d'après `_ds_bundle.js` (`Input`, `Checkbox`, `Radio`).
    Surface `--surface-input`, filet `--line`, rayon 12 px, hauteur ≥ 36 px, focus
    en halo vert, placeholder en `--ink-faint`.
  - Critère d'acceptation : les 7 composants existent et sont exportés ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/ui/{input,label,textarea,select,checkbox,radio,switch}.tsx`
  - Dépend de : T6

- [x] **T8 — Card et état vide**
  - Refondre `src/components/ui/card.tsx` (surface `--surface-raised`, filet
    `--line`, rayon 20 px, `--shadow-sm`, hover : `--shadow` + translation −1 px) et
    créer `src/components/ui/empty-state.tsx` (icône Lucide, titre, phrase, action
    facultative — jamais un blanc).
  - Critère d'acceptation : les deux composants existent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/ui/card.tsx`, `src/components/ui/empty-state.tsx`
  - Dépend de : T7

- [x] **T9 — Pill, Badge, Chip, Tag**
  - Refondre `src/components/ui/badge.tsx` et créer `pill.tsx` et `tag.tsx` d'après
    `_ds_bundle.js` (`Pill`, `Badge`, `Tag`). Inclure les variantes vues dans la
    maquette : badge de version (`V2`, `V3`), badge Premium (or), pastille de
    comptage, pilule de filtre.
  - Critère d'acceptation : les trois composants existent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/ui/{badge,pill,tag}.tsx`
  - Dépend de : T8

- [x] **T10 — Modale et dialogue de confirmation unifiés**
  - Porter `src/components/Modal.tsx` et `src/components/ConfirmDialog.tsx` sur les
    tokens : scrim translucide, carte `--surface-raised`, rayon 20 px,
    `--shadow-lg`. Conserver strictement le comportement actuel (portail,
    fermeture, focus) — voir le piège `position:fixed` dans un ancêtre transformé
    (`.claude/rules/frontend-patterns.md`).
  - Critère d'acceptation : aucun hex en dur dans les deux fichiers ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/Modal.tsx`, `src/components/ConfirmDialog.tsx`
  - Dépend de : T9

- [x] **T11 — SegmentedControl, Tabs, ProgressBar**
  - Créer les trois composants dans `src/components/ui/` d'après `_ds_bundle.js`
    (`SegmentedControl`, `Tabs`, `ProgressBar`). La ProgressBar reprend le remplissage
    vert sur piste `--surface-sunken` avec `--shadow-inset`.
  - Critère d'acceptation : les trois composants existent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/ui/{segmented-control,tabs,progress-bar}.tsx`
  - Dépend de : T10

### Lot 2 — Coquille de navigation

- [x] **T12 — Barre du haut ordinateur**
  - Refondre l'en-tête de l'app connectée d'après les lignes 57–139 de la maquette :
    hauteur 60 px ; à gauche le logo germe + mot-marque « Culture », puis le nom de
    l'atelier courant suivi d'un chevron (ouvre le sélecteur, T13) ; au centre
    l'onglet `jardin`, le groupe **encadré** `parcours` · `examens` · `cours` (badge
    `V2`, désactivé) et l'onglet `profil` ; à droite l'accès aux réglages de
    l'atelier, la cloche, les gouttes et l'avatar.
  - **Pas d'onglet « accueil »** : c'est la variante « V2 · sans accueil ». Le groupe
    d'onglets suit le style « encadré » (conteneur à filet, rayon pill, onglet actif
    sur surface levée).
  - Critère d'acceptation : à ≥ 768 px la barre est rendue avec ces éléments dans cet
    ordre, l'onglet actif reflète la page courante, `cours` est désactivé avec son
    badge, aucune couleur hors tokens, icônes Lucide ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/components/DashboardHeader.tsx`, `src/app/[locale]/layout.tsx`,
    `src/app/[locale]/workshops/[id]/WorkshopClient.tsx`
  - Dépend de : T11

- [x] **T13 — Sélecteur d'atelier**
  - Panneau « CHANGER D'ATELIER » (ligne 1859), ouvert par le chevron de la barre du
    haut et par le bandeau d'atelier sur téléphone : eyebrow, une ligne par atelier
    (icône feuille, nom, méta, pourcentage), puis une entrée « nouvel atelier ».
    **Il remplace le tiroir du Dashboard**, qui n'existe pas dans la variante
    retenue. Ajouter en bas une entrée vers `/dashboard` (« tous mes ateliers ») —
    c'est le seul chemin vers la recherche, la Preview et la corbeille (T17).
  - Critère d'acceptation : le panneau liste les ateliers réels avec leur pourcentage
    réel, « nouvel atelier » mène à `/workshops/new`, l'entrée « tous mes ateliers »
    mène à `/dashboard` ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/components/WorkshopSwitcher.tsx`, `src/components/DashboardHeader.tsx`
  - Dépend de : T12

- [x] **T14 — Barre d'onglets téléphone et bandeau d'atelier**
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

- [x] **T15 — Cloche de notifications et compteur de gouttes**
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

### Lot 3 — Entrée dans l'app et « mes ateliers »

- [x] **T16 — Entrée directe dans l'atelier courant**
  - Après connexion, l'app n'ouvre plus sur `/dashboard` mais sur le **parcours du
    dernier atelier travaillé**. Le « dernier atelier travaillé » n'existe pas en
    base : prendre le premier de la liste des ateliers de l'utilisateur triée par
    `updated_at` décroissant, telle qu'elle est déjà chargée aujourd'hui. **Si
    l'utilisateur n'a aucun atelier, rediriger vers `/dashboard`** (qui porte alors
    l'état vide et la création d'atelier).
  - Ne modifier que les redirections et le routage côté page ; aucune server action,
    aucune requête nouvelle.
  - Critère d'acceptation : un utilisateur avec au moins un atelier arrive sur
    `/workshops/{id}` ; un utilisateur sans atelier arrive sur `/dashboard` ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/page.tsx`, `src/app/[locale]/dashboard/page.tsx`
  - Dépend de : T15

- [x] **T17 — `/dashboard` repeinte en page « mes ateliers »**
  - `/dashboard` devient une page secondaire, atteignable depuis le sélecteur
    d'atelier (T13). Elle **conserve intégralement** ce que la maquette ne montre
    nulle part — liste des ateliers, recherche par tag, modale Preview (couverture,
    nom, description, propriétaire, nombre de membres, bouton rejoindre/entrer),
    corbeille — portée sur les tokens et les nouveaux composants. Mise en page
    inchangée, habillage refait. Ajouter l'état vide « aucun atelier » avec l'action
    « créer un atelier ».
  - Critère d'acceptation : recherche par tag, ouverture de la Preview via
    `?preview=`, restauration depuis la corbeille et création d'atelier fonctionnent
    comme avant ; l'état vide s'affiche à zéro atelier ; aucun hex en dur ne subsiste
    dans le fichier ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/dashboard/DashboardClient.tsx`,
    `src/components/ShareQRModal.tsx`, `messages/{fr,en}.json`
  - Dépend de : T16

### Lot 4 — Parcours

- [x] **T18 — En-tête d'atelier du parcours**
  - Lignes 412–433 : nom de l'atelier, pourcentage, et bouton « liste des questions
    du parcours » (gestionnaires uniquement). **La ligne « N notions acquises sur M »
    n'est pas affichée** : le getter `showBriquesLine` (ligne 2793) vaut `false` dès
    lors que la vue parcours est `chapitres`, ce qui est le cas retenu.
  - Critère d'acceptation : l'en-tête affiche les valeurs réelles de l'atelier, le
    bouton n'apparaît que pour `manager`/`owner`, aucune ligne de compte de notions
    n'est rendue ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/ProgrammeTab.tsx`, `messages/{fr,en}.json`
  - Dépend de : T17

- [x] **T19 — Vue « chapitres » : chapitre en cours en héros + liste**
  - Variante retenue : **`vueChapitres`** (lignes 490–529). Le prototype fige
    `parcoursPref = 'chapitres (liste + progression)'` (ligne 2203) — c'est la vue
    réellement rendue. Un bloc héros « CHAPITRE EN COURS » avec le nom du chapitre et
    un bouton « lancer un exercice », puis un eyebrow « TOUS LES CHAPITRES » et la
    liste des autres chapitres avec leur progression. Les variantes `vueSerre`
    (434–465) et `vueParcelle` (466–489) sont **ignorées**. La liste suit les
    chapitres réels ; zéro chapitre → état vide.
  - Critère d'acceptation : le chapitre en cours est en héros et les autres en liste,
    le bouton mène à `/workshops/{id}/exercise/{chapterId}`, état vide à zéro
    chapitre ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/ProgrammeTab.tsx`, `messages/{fr,en}.json`
  - Dépend de : T18

- [x] **T20 — Vue « questions du parcours »**
  - Porter la vue de gestion des questions de parcours sur les nouveaux composants et
    le mode dense : lignes alignées en colonnes, sélecteur de chapitre par ligne
    (soulignement rouge si aucun chapitre), 3 icônes d'action maximum.
  - Critère d'acceptation : l'affectation de chapitre par ligne fonctionne toujours
    (enregistrement immédiat), aucun hex en dur ; `npm run build` et `npm run lint`
    passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/programme/ParcoursQuestions.tsx`
  - Dépend de : T19

### Lot 5 — Exercice

- [x] **T21 — Coquille plein écran et énoncé**
  - Lignes 530–620 : écran d'exercice plein cadre, en-tête avec progression et
    sortie, énoncé sur surface levée. La coquille masque la barre du haut/du bas.
  - Critère d'acceptation : l'écran s'affiche en plein cadre sur les deux tailles,
    l'énoncé réel est rendu ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/exercise/[chapterId]/ExerciseClient.tsx`
  - Dépend de : T20

- [x] **T22 — Zone de réponse et correction**
  - Choix cliquables pour QCS/QCM avec états sélectionné / bon / mauvais ; saisie
    libre pour les autres types. Bloc de correction après validation, puis bouton
    « question suivante ». **Ne rien changer au contrat serveur** : le client ne
    reçoit toujours ni `answer` ni `correctChoices` au tirage.
  - Critère d'acceptation : la correction automatique QCS/QCM fonctionne comme
    avant, les autres types affichent la réponse attendue sans verdict ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/exercise/[chapterId]/ExerciseClient.tsx`
  - Dépend de : T21

- [ ] **T23 — Écran de fin d'exercice**
  - Ligne 676 : écran « belle récolte. » (en **sans**), score de la session, bouton
    de retour au parcours.
  - Critère d'acceptation : l'écran s'affiche à la fin des questions du chapitre avec
    le score réel ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/exercise/[chapterId]/ExerciseClient.tsx`,
    `messages/{fr,en}.json`
  - Dépend de : T22

### Lot 6 — Profil

- [x] **T24 — Carte d'identité**
  - Lignes 1325–1345 : avatar, nom, « jardinier depuis {mois année} », bouton
    « éditer ». L'avatar reste rendu par `AvatarComposer` existant.
  - Critère d'acceptation : le nom, la date d'inscription et l'avatar réels
    s'affichent ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T23

- [x] **T25 — Bloc série et suivi**
  - Bloc « N jours d'arrosage d'affilée » et bloc « suivi ». **Aucune donnée de série
    n'existe** : le bloc série est écrit puis masqué derrière `const HAS_STREAK =
    false`, comme T15. Le bloc « suivi » renvoie vers l'état vide V2.
  - Critère d'acceptation : aucun compteur de série factice n'est visible ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`
  - Dépend de : T24

- [x] **T26 — Bloc forfait**
  - Carte du forfait courant avec son résumé et le bouton d'évolution. **Lexique
    conservé** : « Gratuit », « Premium », « Premium+ » — pas Graine/Buisson/Arbre.
    Le niveau est lu depuis les données d'abonnement existantes.
  - Critère d'acceptation : le forfait réel de l'utilisateur s'affiche, le bouton
    mène à `/pricing` ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`, `messages/{fr,en}.json`
  - Dépend de : T25

- [x] **T27 — Liste des paramètres du profil**
  - Liste des entrées de réglages du compte (libellé à gauche, indice en
    `--ink-faint` à droite, séparateur `--line-soft`, survol `--surface-sunken`).
    Les quatre entrées de la maquette (`profilSettings`, ligne 2818) : `notifications`
    → « activées », `langue` → « français », `aide & contact`, `se déconnecter` (en
    `--danger-strong`). **Conserver en plus toutes les entrées existantes de la page
    profil actuelle** qui ne figurent pas dans cette liste — aucune ne doit
    disparaître.
  - Critère d'acceptation : aucune entrée de réglage présente avant la tâche n'a
    disparu ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/profile/ProfileClient.tsx`
  - Dépend de : T26

### Lot 7 — Réglages d'atelier

- [x] **T28 — Coquille des réglages**
  - Lignes 1408–1432 : panneau de navigation collant à gauche sur ordinateur
    (eyebrow « PARAMÈTRES » + entrées à icône), sélecteur de section en bandeau
    collant sur téléphone. Les cinq entrées exactes (`regNav`, ligne 2672) :
    **Général** « informations de base », **Membres & rôles** « accès et
    permissions », **Fichiers** « sources de l'atelier », **Chapitre & Notion**
    « unités générées par l'IA », **Atelier Premium** « options avancées ».
    Icônes Lucide correspondantes : `sliders-horizontal`, `users`, `file-text`,
    `layout-grid`, `star`. **Conserver le montage permanent des sections**
    (`display: 'contents' | 'none'`) — le montage conditionnel réintroduirait des
    régressions documentées dans `.claude/rules/server-architecture.md`.
  - Critère d'acceptation : les sections restent montées en permanence, la navigation
    fonctionne sur les deux tailles ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/{SettingsClient,settingsShared}.tsx`
  - Dépend de : T27

- [x] **T29 — Section Général**
  - Nom, tag, description, date de création, « afficher le programme éducatif »,
    QR code, zone de danger (suppression). Ajouter le sélecteur d'**emoji d'atelier**
    de la maquette **inerte** : rendu conforme, `disabled` + `aria-disabled`, avec un
    commentaire renvoyant à `docs/backlog.md`.
  - Critère d'acceptation : les champs existants s'enregistrent comme avant (pattern
    « modifications non enregistrées » intact), le sélecteur d'emoji ne déclenche
    aucun appel serveur ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/SettingsClient.tsx`
  - Dépend de : T28

- [x] **T30 — Section Membres & rôles**
  - Invitation par tag, liste des membres en mode dense (initiale, nom, rôle, tag,
    action, exclure), demandes d'adhésion. Ajouter le bloc **GROUPES** de la maquette
    **inerte** (même règle que T29).
  - Critère d'acceptation : promotion, rétrogradation, exclusion, invitation et
    traitement des demandes fonctionnent comme avant ; le bloc groupes ne déclenche
    aucun appel serveur ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/MembersSection.tsx`
  - Dépend de : T29

- [x] **T31 — Section Fichiers**
  - Zone de dépôt à bordure pointillée tan (1,5 px), liste des fichiers en mode
    dense (nom, méta, actions). Conserver l'upload direct au stockage avec barre de
    progression.
  - Critère d'acceptation : l'upload et la suppression fonctionnent comme avant, la
    progression s'affiche ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/FilesSection.tsx`
  - Dépend de : T30

- [x] **T32 — Section Atelier Premium**
  - Lignes 1642–1716 : carte de passage / carte de statut actif, liste des avantages,
    détail des prix. La **grille de paliers dégressifs** est dessinée **inerte**
    (même règle que T29) : la tarification réelle reste celle de
    `docs/product-spec.md`. **Ne toucher en aucun cas** à la logique
    d'irréversibilité ni au mécanisme de test d'activation.
  - Critère d'acceptation : le flux d'activation Premium existant est inchangé (mêmes
    appels, mêmes garde-fous), la grille de paliers n'est pas interactive ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/PremiumSection.tsx`
  - Dépend de : T31

- [x] **T33 — Section Chapitres & notions**
  - Lignes 1717–1801 : deux colonnes (chapitres à gauche, notions du chapitre
    sélectionné à droite), ajout, renommage, réorganisation, suppression, états vides
    (« crée un chapitre pour y planter tes premières notions. »).
  - Critère d'acceptation : le CRUD des chapitres et des notions fonctionne comme
    avant, la réorganisation persiste, les états vides s'affichent ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/settings/NotionsSection.tsx` (renommé en T2)
  - Dépend de : T32

### Lot 8 — Générateur d'examen

- [x] **T34 — Coquille côte à côte et onglets pleine largeur**
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
  - Dépend de : T33

- [x] **T35 — Liste « mes examens »**
  - Barre de recherche + tri + filtres **toujours visibles** (variante retenue) +
    bouton « + nouvel » vert. Une carte par examen : titre, date de création, trois
    icônes d'action. Mode dense.
  - Critère d'acceptation : recherche, tri et filtres opèrent sur les examens réels,
    l'ouverture d'un examen charge son brouillon ; `npm run build` et `npm run lint`
    passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/HistoryContent.tsx`
  - Dépend de : T34

- [x] **T36 — Banque de questions**
  - Même barre d'outils, lignes de questions en mode dense (colonnes fixes : intitulé,
    type, actions), sélection multiple, envoi vers la feuille. Le filtre par
    étiquettes (pools) reste fonctionnel, et la banque continue de ne montrer que
    `context = 'exam'`.
  - Critère d'acceptation : la banque n'affiche aucune question de parcours, la
    sélection et l'envoi vers l'éditeur fonctionnent ; `npm run build` et
    `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/BankContent.tsx`
  - Dépend de : T35

- [x] **T37 — En-tête de la feuille et pilules d'identité**
  - Lignes 945–1010 : titre éditable de l'examen, sous-titre (atelier · durée ·
    consigne), pilules d'identité candidat réparties en trois zones (gauche / droite /
    hors feuille) par glisser-déposer, barème par partie.
  - Critère d'acceptation : le déplacement des pilules entre zones persiste dans le
    brouillon, le titre s'enregistre ; `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/examen/GeneratorContent.tsx`
  - Dépend de : T36

- [ ] **T38 — Feuille A4 et éditeur de question**
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
  - Dépend de : T37

### Lot 9 — Clôture

- [ ] **T39 — États vides « V2 » : Analyse et Générateur de cours**
  - Remplacer le contenu d'`AnalyseTab.tsx` par l'état vide de la maquette (lignes
    1400–1405 : titre « analyse. » en **sans**, phrase, badge `V2`) et créer le même
    état vide pour « Générateur de cours » (lignes 1319–1324). **Vérifier d'abord**
    que le contenu retiré d'`AnalyseTab` ne repose sur aucune donnée réelle ; s'il
    en utilise, consigner ce qui est perdu dans le journal.
  - Critère d'acceptation : les deux onglets affichent l'état vide avec badge `V2` ;
    `npm run build` et `npm run lint` passent.
  - Fichiers : `src/app/[locale]/workshops/[id]/tabs/AnalyseTab.tsx`,
    `src/app/[locale]/workshops/[id]/tabs/CoursTab.tsx`, `messages/{fr,en}.json`
  - Dépend de : T38

- [ ] **T40 — Écrans non maquettés repeints**
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
  - Dépend de : T39

- [ ] **T41 — Passe finale : hex en dur, violet, emojis-icônes**
  - Balayer **les fichiers de l'app connectée uniquement** (dashboard, workshops,
    profile, components partagés) : remplacer tout hex restant dans un `style={{}}`
    par un token, supprimer toute classe `violet-*`, remplacer tout emoji utilisé
    comme icône par une icône Lucide.
  - Critère d'acceptation : `grep -rn "#[0-9a-fA-F]\{6\}" src/app/\[locale\]/{dashboard,workshops,profile} src/components`
    ne renvoie plus que des cas justifiés et commentés ; `grep -rn "violet-"` sur ces
    mêmes chemins ne renvoie rien ; `npm run build` et `npm run lint` passent.
  - Fichiers : app connectée + `src/components/**` (**pas** la vitrine, **pas** le jardin)
  - Dépend de : T40

- [ ] **T42 — Documentation**
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
  - Dépend de : T41

## Journal
<!-- Append-only. Une ligne par tâche terminée : date, tâche, commit, note. -->

- **2026-08-05 — T2 en cours, non commitée.** Une exécution s'est interrompue en
  demandant une autorisation, après avoir livré T1 (commit `91c6773`). Le travail
  de T2 est **laissé dans l'arbre**, à reprendre : ne pas le jeter sans l'avoir
  inspecté.
  - **Fait** : `src/lib/workshops/{bricks.ts→notions.ts, chapters.ts, exam.ts, examTypes.ts}` ;
    `src/app/actions/{workshopBricks.ts→workshopNotions.ts, examQuestions.ts,
    parcoursQuestions.ts, workshopChapters.ts}` ; `settings/{page.tsx,
    settingsShared.tsx}` ; `BricksSection.tsx` renommé en `NotionsSection.tsx`
    (fichier renommé, **contenu pas encore mis à jour**).
  - **Reste à faire** : le contenu de `NotionsSection.tsx` (import de
    `@/app/actions/workshopBricks` devenu mort, clés i18n `bricks.*` → `notions.*`,
    `Chapter.brickCount` → `notionCount`), puis `SettingsClient.tsx`,
    `AnalyseTab.tsx`, `ExamenTab.tsx`, `ProgrammeTab.tsx`, `QuestionEditor.tsx`,
    `programme/ParcoursQuestions.tsx`. Enfin la note dans `CLAUDE.md` et
    `docs/backlog.md` sur le renommage des tables restant à faire.
  - **État de la validation** : `npm run typecheck` échoue (normal, renommage à
    mi-chemin). `src/lib/database.types.ts` et les noms de tables Supabase sont
    intacts, comme prévu.
  - Terminer T2, faire **un seul commit**, cocher la case. T1 est déjà cochée.
- 2026-08-05 — T1 — 91c6773 — Valeurs renommées dans `messages/fr.json` et `messages/en.json` ; `grep -ci "brique" messages/fr.json` = 0. `build`/`lint` OK, pas d'écran à vérifier.
- 2026-08-05 — T2 — cf2cf6f — Renommage des identifiants de code et des clés i18n (bricks→notions, brickCount→notionCount, bricksLabel/bricksHint/addBrickOption/noBricks/masteredBricks→équivalents notions). `git mv` sur `lib/workshops/bricks.ts`→`notions.ts`, `app/actions/workshopBricks.ts`→`workshopNotions.ts`, `settings/BricksSection.tsx`→`NotionsSection.tsx`. Noms de table/colonnes Supabase (`workshop_bricks`, `brick_mastery`, `exam_question_bricks`, `brick_id`) laissés strictement inchangés, chacun commenté. `CLAUDE.md` §1 et `docs/backlog.md` mis à jour. `grep -ri "brick" src/ --include=*.ts --include=*.tsx -l` ne renvoie que `database.types.ts` + les fichiers portant les littéraux Supabase ; `grep -ri "brick" messages/` ne renvoie rien. `build`/`lint` OK, pas d'écran à vérifier.
- 2026-08-05 — T3 — 444c5b4 — Tokens de couleur du Culture Design System portés dans `src/app/globals.css` (bloc `@theme inline` + nouveau bloc `:root` avec les tokens bruts `--surface-*`/`--green*`/`--tan*`/`--ink*`/`--line*`/fonctionnels/`--on-*` + alias sémantiques + rampe de compatibilité `_compat.css`, déclaré après le `:root` shadcn existant pour que `--border`/`--ring` héritent de la marque) et dans `src/lib/theme.ts` (`palette`, `ink()`). Anciens noms de `palette` conservés en alias (mapping documenté en commentaire par clé) ; 9 nouveaux rôles ajoutés. `build`/`lint` OK, pas d'écran à vérifier (T3 est un socle, pas un écran).
- 2026-08-05 — T4 — [voir commit] — `Inter_Tight`/`Caveat` (next/font) remplacés par `Hanken_Grotesk` (poids 400/500/600/700, conformes aux 4 poids du design system) dans `src/app/[locale]/layout.tsx`. `.font-script` retiré de `globals.css` (règle + entrée `@theme inline`), `--font-serif` ajouté comme alias vers `--font-sans` (décision Alexis « tout en sans »). Échelle typographique 7 niveaux + poids + line-height/tracking + les 5 rôles sémantiques (`hero`/`accroche`/`eyebrow`/`body`/`stat`) portés en variables CSS dans le même bloc `:root` que les tokens de couleur (T3). `grep -r "Inter_Tight\|Caveat\|font-script" src/` ne renvoie plus que `src/app/[locale]/pricing/PricingClient.tsx` (vitrine, hors périmètre — voir Décisions). `build`/`lint` OK, pas d'écran à vérifier (T4 est un socle).
- 2026-08-05 — T5 — [voir commit] — `tokens/spacing.css` porté dans `src/app/globals.css` (même bloc `:root` que T3/T4) : grille `--space-1..16`, deux rayons `--radius-sm/md`(12px)/`--radius-lg`(20px) + `--radius-pill`(999px), bordures (`--border-hairline`/`--border-dashed`), deux élévations `--shadow-sm`/`--shadow-lg` + `--shadow-inset` + `--shadow-focus`, mouvement (`--ease-out`/`--ease-soft`, `--dur-fast/base/slow`), mise en page (`--container-max`/`--content-max`/`--nav-height`), alias de compatibilité (`tokens/_compat.css` : `--radius-xs/xl/2xl`, `--shadow-xs/md/window`). Style de focus global ajouté (`:focus-visible { box-shadow: var(--shadow-focus) }` dans `@layer base`). `radius`/`shadow` de `src/lib/theme.ts` mis à jour aux seules valeurs du design system (anciens noms `xl`/`modal`/`card` gardés en alias explicites vers `lg`/`lg`/`sm`, le temps que Modal.tsx/ConfirmDialog.tsx soient repeints en T10). `build`/`lint` OK, pas d'écran à vérifier (T5 est un socle).
- 2026-08-05 — T6 — [voir commit] — `src/components/ui/button.tsx` refondu d'après `_ds_bundle.js` (`Button`) : variantes `primary`/`secondary`/`ink`/`ghost`/`danger`, trois tailles `sm`/`md`/`lg` aux paddings et tailles de police exacts de la source, prop `trailingArrow` (icône Lucide `ArrowRight`, jamais le SVG inline de la maquette), hover/press (`translate-y` + `scale`)/focus (`--shadow-focus`)/disabled portés fidèlement. Tous les tokens couleur/rayon/ombre/mouvement utilisés existaient déjà (T3/T5). `LinkButton.tsx` inchangé (wrapper générique, aucun nom de variante en dur). `build`/`lint` OK, pas d'écran à vérifier (T6 est un composant isolé, T1-T11).
- 2026-08-05 — T7 — [voir commit] — `input.tsx`/`label.tsx` refondus d'après `_ds_bundle.js` (`Input`) : surface `--surface-input`, filet `--border-strong`, rayon `--radius-sm`, focus `--green-500` + halo `--shadow-focus`, erreur `aria-invalid` → `--alert-500`. Créés `textarea.tsx` (même habillage + `min-h-[84px]` comme la variante `textarea.cds-input` de la source), `select.tsx` (pas dans le bundle — `<select>` natif même habillage + chevron Lucide en overlay), `checkbox.tsx`/`radio.tsx` (d'après `_ds_bundle.js` `Checkbox`/`Radio` — coche Lucide `Check`, variante `card` du Radio), `switch.tsx` (pas dans le bundle — piste/curseur cohérents avec les tokens). `build`/`lint` OK, pas d'écran à vérifier (T7 est un composant isolé, T1-T11).
- 2026-08-05 — T8 — [voir commit] — `card.tsx` refondu d'après `_ds_bundle.js` (`Card`) : tons `default`/`sunken`/`tan`/`dark`/`dashed`, `pad` (14/20/28), `eyebrow`, `hover` (translateY(-2px) + `--shadow-md`), `flat`. `CardHeader`/`CardFooter`/`CardTitle`/`CardAction`/`CardDescription` de l'ancien shadcn supprimés (aucun appelant dans tout `src/`, code mort) ; `CardContent` conservé comme passe-plat pour la vitrine (hors périmètre, voir Décisions). Créé `empty-state.tsx` (icône Lucide, titre, phrase, action facultative). `build`/`lint` OK, pas d'écran à vérifier (T8 est un composant isolé, T1-T11).
- 2026-08-05 — T9 — [voir commit] — `badge.tsx` refondu d'après `_ds_bundle.js` (`Badge`) : 9 tons (`neutral`/`premium`/`success`/`green`/`tan`/`alert`/`warn`/`ink`/`version`, ce dernier pour les pastilles `V2`/`V3` de la maquette), prop `variant="outline"` gardée en alias (vitrine, hors périmètre — `src/app/[locale]/page.tsx`). Créés `pill.tsx` (`as='button'` pour une pilule de filtre cliquable, `active` pour l'état sélectionné vert) et `tag.tsx` (chip monospace pour les codes d'atelier, `font-mono`/Geist Mono au lieu de la pile `ui-monospace` de la source). `build`/`lint` OK, pas d'écran à vérifier (T9 est un composant isolé, T1-T11).
- 2026-08-05 — T10 — [voir commit] — `Modal.tsx` : carte portée de `palette.cream`/`radius.xl`/`shadow.modal` (anciens alias) à `palette.surfaceRaised`/`radius.lg`/`shadow.lg` (20px, `--shadow-lg`) — comportement (portail, fermeture au clic sur le fond) inchangé. `ConfirmDialog.tsx` : les deux boutons (`<button style={{}}>` en dur) remplacés par le composant `Button` (T6) — `ghost` pour annuler, `primary`/`danger` selon `confirmTone` pour confirmer — même comportement, hover/press/focus enrichis gratuitement. `radius.xl`/`shadow.modal`/`shadow.card` retirés de `src/lib/theme.ts` (alias temporaires posés en T5, plus aucun appelant après ce repeint). Aucun hex en dur dans les deux fichiers (c'était déjà le cas avant la tâche — tout passait par `palette`/`ink()`). `build`/`lint` OK, pas d'écran à vérifier (T10 est un composant isolé, T1-T11).
- 2026-08-05 — T11 — [voir commit] — Créés `segmented-control.tsx`, `tabs.tsx` (avec badge `version` optionnel par onglet, réutilise `Badge` de T9) et `progress-bar.tsx` (tons `green`/`sage`/`light`/`tan`, tailles `sm`/`md`/`lg` aux hauteurs exactes 6/9/13px), d'après `_ds_bundle.js` (`SegmentedControl`, `Tabs`, `ProgressBar`). Remplissage vert sur piste `--cream-sunken` + `--shadow-inset` conforme. Ceci referme le Lot 1 (socle du design system, T1-T11) : tous les tokens et composants isolés sont en place pour attaquer la coquille de navigation (Lot 2). `build`/`lint` OK, pas d'écran à vérifier (T11 est un composant isolé, T1-T11).
- 2026-08-05 — T12 — [voir commit] — `DashboardHeader.tsx` refondu d'après les lignes 57-138 de la maquette : logo (Lucide `Sprout` + « Culture » en `--font-serif`), nom d'atelier + chevron (inerte, câblé en T13), groupe encadré `parcours`/`examens`/`cours` (filet `--line-strong`, pill), `profil`, icône réglages atelier, avatar. `cours` rendu `aria-disabled` + `pointer-events:none` + badge `Badge tone="version"`. Onglet actif : texte vert `font-weight` 800 sans fond, fidèle au getter `stTab` du script de la maquette (ligne 2215) — pas de « surface levée » comme la paraphrase de la tâche le suggérait (voir Décisions). Header caché sous 768px (`hidden md:flex`, anticipe T14). `WorkshopClient.tsx` : l'ancienne barre d'onglets interne (state local) supprimée, l'onglet actif se lit maintenant dans `?tab=` (lu par le header ET la page) — zéro changement de comportement des onglets eux-mêmes. `layout.tsx` : `DashboardHeader` enveloppé dans un `<Suspense>` (requis pour `useSearchParams()`). Sweep `calc(100vh - 65px)` → `60px` dans les 9 fichiers de l'app connectée qui en dépendaient (nouvelle hauteur réelle du header, `--nav-height`), Jardin et vitrine exclus. Clés i18n `nav.tab*`/`changeWorkshop`/`workshopSettings` ajoutées ; `workshop.tabs.*` (devenues mortes) retirées. `build`/`lint` OK. **Rendu non vérifié — page derrière l'authentification Clerk**, aucune session disponible en autonomie (`/fr/dashboard` redirige vers `/sign-in` en local) ; Alexis relira cet écran sur la PR.
- 2026-08-05 — T13 — [voir commit] — `WorkshopSwitcher.tsx` (nouveau) : panneau « changer d'atelier » d'après la maquette (lignes 1859-1878), ouvert par le chevron posé en T12. Liste `getUserWorkshops()` (owned+joined, déjà triés par `last_visited_at` décroissant — sert aussi pour T16), une ligne par atelier (icône feuille, cadre or si `is_premium`, nom, nombre de membres réel), barre verte à gauche sur l'atelier courant, entrée « nouvel atelier » → `/workshops/new`, entrée « tous mes ateliers » → `/dashboard`. **Pas de pourcentage affiché** (voir Décisions — aucune donnée de progression par atelier n'existe). `DashboardHeader.tsx` : état `switcherOpen`, panneau positionné en absolu sous le nom d'atelier. `build`/`lint` OK. **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage qu'en T12 (pas de nouvelle tentative, cf. règle des deux essais) ; Alexis relira cet écran sur la PR.
- 2026-08-05 — T14 — [voir commit] — Barre d'onglets du bas (lignes 1881-1927 de la maquette) ajoutée **dans `DashboardHeader.tsx`** (pas un fichier séparé — voir Décisions) : icônes 22px (`Sprout`/`Route`/`FileText`/`BookOpen`/`User`), libellés 10,5px, groupe encadré parcours/examen/cours (cours inerte), masquée sur `/exercise/`. Bandeau d'atelier mobile (lignes 146-176) ajouté dans `WorkshopClient.tsx` : nom en capitales + chevron (ouvre `WorkshopSwitcher`, réutilisé de T13) + réglages, `sticky top-0`, visible seulement sur parcours/examen/cours (pas sur réglages, qui a son propre bandeau prévu en T28). `layout.tsx` : `pb-[78px] md:pb-0` sur `<main>` pour dégager la barre fixe du bas en dessous de 768px. Corrigé au passage un oubli du sweep 65px→60px de T12 sur `WorkshopClient.tsx` (repéré en éditant ce fichier). `build`/`lint` OK. **Rendu non vérifié — page derrière l'authentification Clerk.**
- 2026-08-05 — T15 — [voir commit] — `NotificationBell.tsx` (cloche + panneau déroulant, lignes 109-129 de la maquette) et `DropletCounter.tsx` (pastille verte, ligne 131-134) créés, complets, mais **jamais montés** : `DashboardHeader.tsx` les importe derrière `const HAS_NOTIFICATIONS = false` / `const HAS_DROPLETS = false`. Contenu d'exemple de la cloche (« Camille t'invite… ») laissé en français en dur (donnée fictive représentative d'un futur flux réel, cf. `.claude/rules/i18n.md` § mock data) ; les libellés d'interface réels (« notifications », « rejoindre », « ignorer », « annuler ») passent par next-intl (`messages.notifications`). Ceci referme le Lot 2 (coquille de navigation, T12-T15). `build`/`lint` OK — critère vérifiable par lecture du code (composants non montés), pas de capture nécessaire.
- 2026-08-05 — T16 — [voir commit] — `src/app/[locale]/page.tsx` : pour un utilisateur connecté, redirige vers `/workshops/{id}` du premier atelier (`owned[0] ?? joined[0]`, chacun déjà trié par `last_visited_at` décroissant dans `getUserWorkshops()`) au lieu de `/dashboard` systématiquement ; zéro atelier → repli `/dashboard` inchangé. Rendu de la landing pour visiteur déconnecté non touché. `dashboard/page.tsx` : aucun changement — `DashboardClient` gère déjà l'état vide (`hasWorkshops`) quand `owned`/`joined` sont vides, le critère de repli était déjà satisfait. `build`/`lint` OK. **Comportement non vérifié en conditions réelles** (redirection testable seulement avec une session Clerk active, indisponible en autonomie) ; Alexis validera le parcours de connexion sur la PR.
- 2026-08-05 — T17 — [voir commit] — `DashboardClient.tsx` : mise en page strictement inchangée (recherche, grille des ateliers, modale Preview, corbeille, état vide) — seul l'habillage change. Tous les hex/rgba en dur remplacés par des tokens : dégradés `TONE_CSS` des modules Culture (mock) mappés aux teintes du design system (sage→vert, wood→tan, amber→or, sky→neutre faute d'équivalent bleu dans la palette), ombres `rgba(45,42,36,…)` (ancienne teinte d'encre pré-T3) → jeton d'ombre du design system, ombres teintées (vert/ambre) → `color-mix(in oklab, var(--tan|green) X%, transparent)` pour conserver le halo coloré des cartes invitation/demande sans hex, texte `#3a352c`/`#7a4d20`/`#3f5630` → tokens `ink-body`/`amberLight`/`green-strong`. Boutons d'action primaires remplacés par `LinkButton` (T6), état vide par `EmptyState` (T8) — mise en page identique, juste les primitives qui la composent. `ShareQRModal.tsx` : carte sur `surfaceRaised`/`radius.lg`/`shadow.lg` (comme Modal.tsx en T10), couleurs du QR code (`#ffffff`/`#2d2a24`, ancienne teinte) → `palette.paper`/`palette.ink`. Aucune nouvelle chaîne visible, `messages/{fr,en}.json` inchangés. `build`/`lint` OK. **Rendu non vérifié — page derrière l'authentification Clerk.**
- 2026-08-05 — T18/T19 — [voir commit, menées ensemble] — `ProgrammeTab.tsx` entièrement réécrit : l'ancien décor « étagères de pots » (vueSerre, abandonnée) retiré (Pot/CoiledVine/Leaf/spiralPath, pagination par carrousel) au profit de la vue `vueChapitres` retenue (lignes 490-526 de la maquette) — en-tête (nom d'atelier + bouton « liste des questions du parcours », managers uniquement), chapitre héros (premier par `position`) avec bouton « lancer un exercice », séparateur « TOUS LES CHAPITRES », liste des autres chapitres cliquables. **Aucune ligne de progression nulle part** (ni pourcentage d'en-tête, ni barre par chapitre, ni verrou) : `brick_mastery` n'est alimentée par rien (commentaire explicite dans `src/lib/workshops/notions.ts`), aucune donnée de progression n'existe côté serveur — voir Décisions. `WorkshopClient.tsx` : chrome hérité (breadcrumb, titre, chips, boutons partage/réglages/quitter) masqué sur l'onglet Programme uniquement (nom désormais porté par `ProgrammeTab` et par la barre du haut globale), conservé sur les autres onglets qui n'ont pas encore leur propre en-tête. `messages/{fr,en}.json` : nouvelles clés `programme.currentChapterEyebrow`/`allChaptersEyebrow`, `emptyDesc`/`questions.open`/`noChapterHint` nettoyés des références aux pots. `build`/`lint` OK (corrigé au passage un avertissement de build Tailwind sans rapport à l'écran, causé par un commentaire de `theme.ts` mal formaté que son scanner de contenu interprétait comme une classe). **Rendu non vérifié — page derrière l'authentification Clerk.**

- 2026-08-05 — T20 — [voir commit] — `ParcoursQuestions.tsx` porté sur le mode dense : lignes en colonnes fixes (numéro monospace 24px, contenu flexible, sélecteur de chapitre 190×32px, deux actions 32×32px), tokens (`palette.surfaceRaised`/`palette.line`/`palette.lineStrong`/`palette.surfaceInput` remplacent `withAlpha(palette.paper, …)`/`ink(…)` en dur), bouton « + nouvelle question » remplacé par le composant `Button` (T6, variante `ink`), boutons « éditer »/« supprimer » texte remplacés par deux icônes Lucide (`Pencil`/`Trash2`, 2 actions ≤ 3 max de la règle du mode dense). Soulignement rouge conservé (`withAlpha(palette.danger, 0.45)`, déjà présent avant la tâche) sur le sélecteur de chapitre sans chapitre affecté. Affectation de chapitre par ligne (`handleChapterChange`, enregistrement immédiat optimiste) non touchée. Reprise d'un travail laissé non commité par une exécution antérieure interrompue (trouvé en tête de session dans `git status`) : diff inspecté avant de construire dessus, jugé complet et cohérent avec l'énoncé de T20, un seul import (`ink`, devenu mort après le passage aux tokens) nettoyé pour repasser lint à 0 warning nouveau. `build`/`lint` OK (0 erreur, warnings pré-existants uniquement). **Rendu non vérifié — page derrière l'authentification Clerk**, `/fr/dashboard` redirige vers la landing en local, même blocage que T12-T19 ; Alexis relira cet écran sur la PR.

- 2026-08-05 — T21/T22 — [voir commit, menées ensemble] — `ExerciseClient.tsx` réécrit sur une coquille `position: fixed; inset: 0` (plein cadre garanti indépendamment du padding de `<main>`), header (bouton sortie `X` 36×36 + eyebrow/nom de chapitre — pas de barre de progression, voir Décisions) puis zone scrollable centrée (max 680px) avec la question sur une carte `surfaceRaised`/`line`/`shadow.sm` (icône `Sprout` en badge vert-tint, remplaçant l'illustration SVG custom de la maquette — règle Lucide only). Boutons de choix QCS/QCM restylés aux tokens (bordure/fond selon sélection et résultat), zone de texte libre sur `surfaceInput`/`lineStrong`, bloc de correction inchangé (déjà sur tokens). Boutons « valider »/« question suivante » remplacés par le composant `Button` (T6, variante `primary`). Aucun changement de comportement : même tirage, même correction serveur, même contrat (`ExercisePrompt` sans `answer`/`correctChoices`). `DashboardHeader.tsx` : la barre du haut ordinateur (`<header>`, jusque-là toujours montée) est maintenant masquée sur `/exercise/` (réutilise le `isExercise` déjà posé en T14 pour la barre du bas) — sans ce changement, la coquille plein écran se serait affichée sous la barre du haut au lieu de la couvrir. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants qu'avant la tâche). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que les tâches précédentes (`/fr/workshops/{id}/exercise/{chapterId}` redirige vers la landing en local) ; Alexis relira cet écran sur la PR.

- 2026-08-05 — T24/T25/T26/T27 — [voir commit, menées ensemble] — `ProfileClient.tsx` entièrement réécrit sur le layout resserré de la maquette (colonne unique, max 520px) : carte d'identité (avatar réel `AvatarComposer`, nom réel, « jardinier depuis {mois année} » — `user.createdAt` Clerk désormais passé par `profile/page.tsx`, formaté comme le fait déjà `SettingsClient.tsx` pour la date de création d'un atelier — tag `#uniqueId` conservé en petit chip), bloc série masqué (`HAS_STREAK = false`, aucune donnée), carte « suivi » réelle vers `?tab=analyse` de l'atelier le plus récent (masquée si aucun atelier), carte forfait sur le **tier réel** du compte (`getUserTier`, `src/lib/subscription.ts`, lu côté serveur dans `page.tsx` et passé en prop — lecture seule, aucune modification du fichier), liste de paramètres (modifier l'avatar, notifications, langue, aide & contact, se déconnecter). L'ancienne page (grille de cartes 100% factices : streak/ateliers actifs/plantes vivantes/questions répondues codés en dur, `subscription.plan` hardcodé « ★ Premium · 10€/mois » indépendamment du vrai tier, carte « examen officiel V3 » et carte « amis V2 » sans aucune donnée ni lien) a été **entièrement retirée** : elle n'a plus d'équivalent dans la maquette retenue (lignes 1325-1397) et ne portait aucune fonctionnalité réelle (zéro `onClick`/`href` sur `editProfile`/`shareGarden`/`subscription.share`, vérifié avant suppression). `messages/{fr,en}.json` : namespace `profile` réécrit en conséquence (`stats`/`subscription`/`energy`/`exam`/`friends`/`breadcrumb*`/`greeting`/`editProfile`/`shareGarden` retirés — `grep` confirmé qu'aucun autre fichier ne consomme le namespace `profile`, seul `ProfileClient.tsx` l'utilise ; `avatar/page.tsx` utilise un namespace `avatar` distinct). `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, `/fr/profile` redirige vers la landing en local ; Alexis relira cet écran sur la PR.

- 2026-08-05 — T28 — [voir commit] — `settingsShared.tsx` : `NAV_ITEMS` porte désormais une icône Lucide (`SlidersHorizontal`/`Users`/`FileText`/`LayoutGrid`/`Star`) au lieu d'un libellé en dur (déjà traduit via `t(\`nav.${item.id}\`)` côté appelant, pré-existant). `SettingsClient.tsx` : sidebar ordinateur restylée aux tokens (`palette.surfaceRaised`/`line`/`surfaceSunken`) avec icône + libellé par entrée, masquée sous 768px (`hidden md:flex`) ; nouveau sélecteur de section téléphone (bandeau sticky « PARAMÈTRES » + chevron ouvrant un menu déroulant des 5 sections avec icône, plus bouton de fermeture vers l'atelier) d'après la maquette (lignes 1426-1456). Le montage permanent des sections (`display:'contents'|'none'`) n'a pas été touché — seul l'habillage change. Libellé de navigation « Notions » → « Chapitre & Notion » (`settings.nav.notions`, FR **et** EN) pour matcher l'énoncé de T28 ; nouvelle clé `settings.closeSettings`. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk** ; Alexis relira cet écran (les deux tailles) sur la PR.

- 2026-08-05 — T29 — [voir commit] — `settingsShared.tsx` : primitives partagées (`Row`, `Switch`, `SmallBtn`, `SectionCard`) retonifiées (`ink(x)`/hex en dur → `palette.line`/`lineStrong`/`surfaceRaised`/`surfaceInput`/`surfaceSunken`/`onInk`, `shadow.sm`) — impacte aussi Membres/Fichiers/Notions/Premium qui les réutilisent, sans changement de comportement. `SettingsClient.tsx` : section Général retonifiée (champ nom, description, sélecteurs de couverture/emoji, bouton QR) — voir décision ci-dessous sur l'emoji. Zone de danger et section Accès retonifiées. Les hex restants du fichier (barre flottante « enregistrer », modale de suppression, lignes 640+) sont hors du bloc Général/Accès/Danger et laissés pour la passe finale (T41) ou une tâche ultérieure qui les touche. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk.**
- 2026-08-05 — T30 — [voir commit] — `MembersSection.tsx` retonifié intégralement (plus aucun hex/`rgba(45,42,36,…)` en dur — invitation par tag, pastilles d'invitation/de demande, filtre de groupes, popover d'édition de groupe, nouveau groupe). Liste des membres réécrite en mode dense : colonnes à largeur fixe (avatar 32px, nom flexible, rôle 96px, tag 80px monospace, groupes 150px, actions 150px alignées à droite) au lieu de l'ancien sous-texte « rôle · tag » combiné — la colonne actions garde sa largeur même vide (propriétaire, ou membre sans groupe) pour ne pas décaler les lignes suivantes. Case à cocher du mode « groupe sélectionné » remplacée par le composant `Checkbox` (T7). Modale de confirmation de suppression de groupe (jusqu'ici un `Modal` + boutons en dur) remplacée par `ConfirmDialog` (T10, déjà le pattern de référence pour toute suppression — `.claude/rules/frontend-patterns.md`). `settingsShared.tsx` : hauteur de `SmallBtn` portée de ~29px à ~33px (padding vertical 7→9px) pour respecter le minimum de 32px du mode dense — impacte aussi Fichiers/Notions/Premium/Général (SmallBtn est partagé), sans changement de comportement, juste un peu plus haut. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T29 (`/fr/dashboard` redirige vers la landing en local, un seul essai fait conformément à la règle des deux tentatives) ; Alexis relira cet écran sur la PR. Voir décision ci-dessous : le bloc GROUPES n'a **pas** été rendu inerte, contrairement à la consigne de la tâche.

- 2026-08-05 — T31 — [voir commit] — `FilesSection.tsx` : zone de dépôt reconstruite sur le motif réel de la maquette (lignes 1600-1607) — grand `<label>` illustré (icône `Upload` dans une pastille verte, texte + hint) enveloppant directement l'`<input type="file">` caché, au lieu de l'ancien `Row`+bouton « ajouter un fichier ». Bordure pointillée 1,5px `--line-strong` au repos, vire au vert (`--green` + fond teinté) au survol/glisser-déposer — pas à l'ambre de l'ancien habillage (voir décision ci-dessous sur le mot « tan » de l'énoncé). Barre de progression d'upload remplacée par le composant `ProgressBar` (T11) au lieu d'un remplissage ambre en dur. Liste des fichiers passée en mode dense : icône dans une pastille 36px, ligne à hauteur minimale 48px, séparateurs `palette.line` (un seul type de bordure, pas de zébrage), les trois actions (télécharger/renommer/supprimer) et les boutons enregistrer/annuler du renommage inline portés à 32×32px avec bordure visible (même style que `ParcoursQuestions`/`MembersSection`, T20/T30) au lieu de simples icônes 15px sans cadre ni doublure. Upload direct au stockage (ticket signé + XHR + progression) et suppression inchangés. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants ; un type `React.DragEvent<HTMLDivElement>` → `HTMLLabelElement` corrigé pour la nouvelle zone de dépôt). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T30, un seul essai fait ; Alexis relira cet écran (les deux tailles) sur la PR.

- 2026-08-05 — T32 — [voir commit] — `PremiumSection.tsx` reconstruit sur la carte de passage/statut actif de la maquette (lignes 1643-1678) : pastille dorée + éligibilité, titre + estimation de prix (état inactif) ou badge « Premium actif » + facturation (état actif), bouton pleine largeur, liste de 7 avantages en grille 2 colonnes (lignes 1681-1692, `Check` dans une pastille verte), grille de paliers dégressifs (lignes 1694-1709) reproduite à l'identique visuellement mais **inerte** (`aria-disabled`, `pointer-events:none`, opacité réduite, note explicite sous le titre) — voir décision ci-dessous sur le calcul du prix affiché. Mécanisme de test d'activation par mot de passe strictement inchangé (aucune modification de `activateWorkshopPremium`, du trigger DB, ni de l'allowlist — zone interdite hors T2). Modale de confirmation gardée en `Modal` direct (pas `ConfirmDialog`, qui n'expose pas de `disabled` sur son bouton — le double-déclenchement d'une activation irréversible n'est pas un risque à prendre), seulement retonifiée. `SettingsClient.tsx` : `memberCount={members.length}` ajouté à l'appel de `PremiumSection` pour permettre l'estimation de prix. `messages/{fr,en}.json` : namespace `settings.premium` réécrit (anciennes clés `statusLabel`/`statusHint`/`statusBadge`/`goPremiumLabel`/`badgePremium` retirées, aucun autre fichier ne les consommait — vérifié par `grep`). `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T31, un seul essai fait ; Alexis relira cet écran sur la PR.

- 2026-08-05 — T33 — [voir commit] — `NotionsSection.tsx` réécrit sur la disposition à deux colonnes de la maquette (lignes 1717-1786) : colonne Chapitres à gauche (`grid-cols-[0.85fr_1.45fr]` ≥768px, empilée en dessous), sélection d'un chapitre par clic (barre verte de 3px à gauche de la ligne active, fidèle au style « barre » du getter `briqueChapters`), colonne Notions à droite filtrée sur le chapitre actif, bouton « + ajouter » plein-largeur en tête de chacune des deux cartes (au lieu du bouton en pied de liste de l'ancien habillage), actions renommer/supprimer en icônes 32×32 (au lieu de `SmallBtn` textuels). CRUD chapitres et notions, réorganisation (flèches haut/bas, `reorderWorkshopChapters`), formulaire d'ajout/édition de notion (`NotionForm`, inchangé) strictement identiques au comportement d'avant la tâche. État vide fidèle à la maquette (« crée un chapitre pour y planter tes premières notions. ») uniquement quand il n'y a **ni** chapitre **ni** notion non rangée à gérer — voir décision ci-dessous sur le groupe « sans chapitre », qui n'existe pas dans le modèle de la maquette. `messages/{fr,en}.json` : nouvelle clé `notions.needChapterHint`. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T32, un seul essai fait ; Alexis relira cet écran (les deux tailles, et particulièrement le cas « notions sans chapitre ») sur la PR.

- 2026-08-05 — T34 — [voir commit] — `ExamenTab.tsx` entièrement réécrit : le système de 3 tuiles façon Gmail (positions/tailles calculées en px, mise à l'échelle CSS, animation `el.animate()` au changement de focus, mesure `ResizeObserver` — ~140 lignes de calcul géométrique) est retiré au profit de la coquille « banque et feuille côte à côte » retenue (`examOptB`, variante `banqueOngletsLarge`, lignes 690-809 et 935 de la maquette) : colonne gauche à deux onglets pleine largeur (« mes examens » / « questions », icônes `FileText`/`Search`, coins hauts arrondis, filet vert + fond teinté sur l'onglet actif) fixée à 360px (`banqueW` de la maquette) sur `md:`, colonne droite (feuille A4, `GeneratorContent` non modifié) en `flex:1` — empilées en colonne en dessous de 768px (`editorDir`). `HistoryContent`/`BankContent` restent montés en permanence sous les deux onglets (`display:none`/`block`, même pattern que `SettingsClient`) pour ne pas perdre un état de recherche/tri au changement d'onglet une fois que T35/T36 en ajouteront. La fonction `focus(id)` (utilisée par `requestEditExam`/`handleGenerate`/`handleOpenQuestion`/la modale d'accueil) est conservée à l'identique dans sa signature mais simplifiée : elle bascule l'onglet gauche pour `'history'`/`'bank'`, et devient un no-op pour `'generator'` (qui n'est plus un onglet — déjà toujours visible). Toute la logique métier (chargement, brouillon, CRUD examens/questions/libellés, blocage d'édition concurrente, modale d'accueil) est strictement inchangée — seul le rendu du conteneur change. Clés i18n `tab.panelHistory`/`panelBank`/`panelGenerator` (n'étaient utilisées que par l'ancien libellé flottant des tuiles en arrière-plan, supprimé) remplacées par `tab.tabHistory`/`tabBank` (nouveaux libellés d'onglets, « mes examens »/« questions », fidèles à la maquette). `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T33, un seul essai fait ; Alexis relira cet écran (les deux tailles) sur la PR — voir décision ci-dessous sur l'aspect provisoirement compressé de `HistoryContent` dans la colonne de 360px tant que T35 n'est pas passée.

- 2026-08-05 — T35 — [voir commit] — `HistoryContent.tsx` réécrit sur la variante retenue « toujours visible » (lignes 810-869 de la maquette) : barre de recherche (icône Lucide `Search`, jamais le SVG loupe inline de la maquette) + bouton tri (`ArrowUpDown`, menu déroulant plus récents/plus anciens/A→Z) + bouton filtre (`Filter`, menu déroulant par statut) + bouton « + nouvel » vert, tous en permanence visibles (pas de repli derrière le focus de la recherche, cf. `emplacementFiltre` figé). Recherche sur `title`, filtre multi-sélection sur `status` (les 3 statuts réels `brouillon`/`publié`/`archivé` — la maquette n'en propose que 2, publié/brouillon ; `archivé` existe réellement dans `GeneratedExam.status` donc gardé dans le filtre pour ne rien cacher). Tri « plus récents »/« plus anciens » : inversion de l'ordre de la liste (pas de vrai tri chronologique — `Exam.date` est une chaîne d'affichage, jamais un timestamp, exactement comme le fait le getter `examsList` de la maquette elle-même sur ses données de démo). Liste transformée en cartes empilées (mode dense) : titre + badge de statut sur la même ligne, puis nombre de questions + date + 3 icônes d'action (dupliquer/exporter — décoratives, sans handler, déjà le cas avant ce chantier — et supprimer, fonctionnelle) ; la carte entière est cliquable pour éditer (`onEdit`), fidèle à `ex.open` de la maquette qui remplace l'ancien bouton « modifier » dédié. `messages/{fr,en}.json` : nouvelles clés `history.searchPlaceholder`/`sortTitle`/`sort.*`/`filterTitle`/`noResults` ; `history.newExam` raccourci de « nouvel examen » à « nouvel » (le libellé visible du bouton dans la maquette — l'infobulle complète reste dans l'attribut `title`). `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T34, un seul essai fait ; Alexis relira cet écran sur la PR.

- 2026-08-05 — T36 — [voir commit] — `BankContent.tsx` réécrit en mode dense sur le même schéma que T35 : titre + boutons « nouvelle question »/« générer par IA » (ce dernier passé `disabled`, il n'avait déjà aucun handler avant ce chantier — cohérent avec le traitement des placeholders IA de T33/T29), zones glisser-déposer inclure/exclure et panneau de filtres (type de question, type de réponse, statut, libellés, difficulté) strictement inchangés dans leur logique, seulement retonifiés (tous les `ink(x)`/hex en dur remplacés par `palette`/`shadow.lg`). Chaque question devient une carte cliquable qui l'envoie vers la feuille (`onSendOne`, fidèle à `onClick="{{bq.toggle}}"` de la maquette, lignes 916-926) avec un liseré vert quand elle y figure déjà (nouvelle prop `draftIds`, câblée depuis `ExamenTab.tsx`) ; 3 icônes d'action maximum (éditer/dupliquer/supprimer, `IconBtn` de `examShared.tsx` porté à 32×32 — c'est aussi le seul autre consommateur d'`IconBtn`, aucun impact ailleurs) plus un chevron de détail séparé (pas une action sur la donnée, cf. le même principe déjà appliqué aux flèches de réordonnancement dans `NotionsSection`/T33). `examShared.tsx` : `TypePill` retonifié (`#3a352c` → `palette.inkMuted`), seul autre point touché hors du fichier assigné à T36. La banque ne montre toujours que `context = 'exam'` — déjà garanti côté serveur (`getExamBankData`, `.eq('context','exam')`), rien à changer côté client. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T35, un seul essai fait ; Alexis relira cet écran sur la PR.

- 2026-08-05 — T37 — [voir commit] — `GeneratorContent.tsx` : périmètre restreint volontairement à la colonne « questions envoyées » (gauche, fixe 230px, hors calcul de pagination) et au bloc « paramètres » (titre éditable, pilules d'identité gauche/droite/hors-feuille par glisser-déposer, création de champ personnalisé, favori de présentation) — tous les `ink(x)`/hex en dur retonifiés. **N'a pas touché** à la zone de rendu du flux de questions ni à `computePagination`/`rowHeights`/`flattenSections` (lignes ~450-720, hors périmètre explicite de T37, réservée à T38 avec l'avertissement de la feuille de route sur la pagination A4). Bouton « personnaliser »/« terminer » ajouté (`toggleHdr`/`hdrOpen` de la maquette, ligne 939) : replie/déplie le titre + les pilules + les champs personnalisés, les 4 statistiques (sections/questions/barème/durée) restant toujours visibles — voir décision ci-dessous sur le choix de l'ouvrir par défaut. `messages/{fr,en}.json` : nouvelles clés `generator.customize`/`generator.done`. `build`/`lint` OK (0 erreur, mêmes 26 warnings pré-existants). **Rendu non vérifié — page derrière l'authentification Clerk**, même blocage que T12-T36, un seul essai fait ; Alexis relira cet écran sur la PR — en particulier le nouveau bouton personnaliser et le repli/dépli.

- 2026-08-05 — **Fin de session autonome — arrêt volontaire avant T38.** Huit tâches livrées et poussées ce tour (T30-T37, un commit chacune) : tout le Lot 7 (Réglages d'atelier) et T34-T37 du Lot 8 (Générateur d'examen). T38 (« Feuille A4 et éditeur de question ») est la seule tâche de toute la feuille de route à porter son propre avertissement dédié (« ne toucher ni à la logique de pagination A4 ni au calcul de hauteur ») — elle touche `GeneratorContent.tsx` (la zone de rendu du flux, lignes ~450-720, non touchée par T37, cf. décision ci-dessus) et `QuestionEditor.tsx` (789 lignes, pas encore ouvert). Sans aucun moyen de vérification visuelle possible cette nuit (authentification Clerk bloquant systématiquement l'accès à l'app en local, cf. chaque tâche d'écran depuis T12), l'attaquer en fin d'une session déjà longue aurait maximisé le risque sur le point le plus délicat du chantier — casser silencieusement la génération de PDF d'examen ne se verrait qu'au déploiement. Décision : s'arrêter proprement ici plutôt que de s'acharner (cf. règle « ne pas brûler le quota d'une nuit sur un seul point dur », compétence `chantier-run`). Le chantier reste actif (`docs/chantiers/EN-COURS.md` inchangé) — la prochaine routine reprendra directement sur T38, avec un contexte frais.

## Décisions prises en autonomie
<!-- L'agent y consigne ses arbitrages de nuit. Alexis les relit au réveil. -->
- 2026-08-05 — T1 — Le critère d'acceptation `grep -ci "brick" messages/en.json` = 0 est structurellement impossible tant que T2 n'a pas renommé les clés (`bricksLabel`, `addBrickOption`, `noBricks`, `bricks`, `brickCount`, `masteredBricks` contiennent toutes "brick" dans leur nom de clé anglais, que T1 n'a pas le droit de toucher). Vérifié après coup : les seules occurrences restantes dans `messages/en.json` sont bien dans des clés, aucune dans une valeur. Le critère se vérifie donc au niveau du couple T1+T2, pas de T1 seul — poursuite immédiate vers T2 dans la même session pour refermer ce point.
- 2026-08-05 — T1 — Les textes anglais employaient un mélange incohérent "brick(s)"/"block(s)" pour désigner le même concept (ex. `bricksLabel: "Knowledge blocks"`, `masteredBricks: "mastered bricks"`). La consigne ne mentionnait explicitement que "brick"→"notion", mais laisser "block(s)" en l'état aurait produit un lexique anglais incohérent avec le FR ("notion" partout). Décision : les deux formes ("brick(s)" et "block(s)") ont été renommées en "notion(s)" en anglais, à l'exception de `garden.panel.blocks` (« Blocks » du Jardin Terra Nil — zone interdite, concept différent, non touché).
- 2026-08-05 — T2 — En reprenant T2, trouvé dans `git log`/le journal ci-dessus la trace d'une exécution antérieure (commits `94cb430`/`98c5387`, déjà poussés) interrompue en cours de tâche sur une demande d'autorisation, n'ayant fait que le `git mv` de `bricks.ts`→`notions.ts`, `workshopBricks.ts`→`workshopNotions.ts` et `BricksSection.tsx`→`NotionsSection.tsx` sans toucher au contenu. Vérifié qu'aucun contenu n'avait divergé (diffs à 0 insertion sur ces renommages) avant de construire dessus. T2 a été menée à terme dans cette session — réécriture complète des fichiers renommés + tous les autres fichiers listés dans la tâche, `messages/{fr,en}.json` (clés), `CLAUDE.md` §1, `docs/backlog.md` — et validée par `build`/`lint`, ce qui referme le travail laissé en suspens par l'exécution précédente.
- 2026-08-05 — T3 — La rampe d'encre passe de 5 paliers (`ink/inkMuted/inkSoft/inkFaint/inkGhost`) à 4 dans le design system (`--ink/--ink-body/--ink-muted/--ink-faint`) : mappé en préservant l'ordre de luminosité (`inkGhost` réutilise `--ink-faint`, aucun palier n'est perdu visuellement, juste deux anciens noms qui convergent). Côté vert/ambre, la consigne fixait seulement `green→--green` et `amber→--tan` ; complété par `greenBrand→--green-strong`, `greenSoft→--green-light` (ordre de luminosité préservé), et `amberLight→--gold-strong`, `amberGlow→--gold` (l'ancienne rampe ambre n'a pas d'équivalent direct dans `--tan-*`, qui ne descend qu'à une seule valeur claire ; `--gold` est l'accent chaud le plus proche du rôle « pastille / surbrillance » qu'occupaient `amberLight`/`amberGlow`). `ink(alpha)` (helper rgba) recalculé sur le nouveau `--ink` (#2A2620 → rgb(42,38,32)) pour rester synchronisé — sinon toutes les bordures/overlays de l'app auraient continué à utiliser l'ancienne teinte d'encre malgré le token renommé.
- 2026-08-05 — T3 — La zone interdite du Jardin dit « ni le rendu de l'île, ni le HUD, ni les tokens » ; `GardenClient.tsx` importe `palette.greenBrand`/`palette.paper` (curseur du HUD), qui changent légèrement de teinte du fait de l'alias global. Interprété comme visant le *système de tokens dédié au Jardin* (ne pas le re-designer, ne pas le brancher sur le nouveau design system) et non un gel pixel-parfait des deux couleurs qu'il emprunte au thème partagé — geler `palette` entièrement aurait rendu T3 (tâche explicitement assignée, fichiers `globals.css`/`theme.ts`) impossible à réaliser. Aucun fichier du Jardin n'a été touché.
- 2026-08-05 — T4 — Le critère d'acceptation de T4 (`grep -r "Inter_Tight\|Caveat\|font-script" src/` = rien) porte sur tout `src/`, mais la liste « Fichiers » de la tâche n'en cite que 4 (`layout.tsx`, `globals.css`, `create/page.tsx`, `session/page.tsx`). En pratique, 18 fichiers référençaient encore ces polices (usages `fontFamily` en dur et blocs `<style>{'@import ...fonts.googleapis.com...'}</style>` dupliqués, hérités d'avant la migration next/font). Décision : traiter le critère littéralement mais **à l'intérieur du périmètre du chantier** (app connectée uniquement, cf. « Hors périmètre ») — corrigés dans les 16 fichiers de l'app connectée concernés (remplacement mécanique de la police, aucun autre changement — l'habillage complet de ces écrans reste aux tâches dédiées des lots suivants), et **exclu** `src/app/[locale]/pricing/PricingClient.tsx` (vitrine, hors périmètre, 5 occurrences restantes assumées). Par ailleurs `.font-script` avait 4 usages réels (`create/page.tsx` ×2, `session/page.tsx` ×2) et non 3 comme indiqué dans l'énoncé de la tâche — les 4 ont été corrigés.
- 2026-08-05 — T4 — Poids de police : le design system n'en définit que 4 (400/500/600/700) ; l'ancien chargement `Inter_Tight` incluait aussi 300 (light), sans usage trouvé dans le code (`grep` sur `font-light`/`fontWeight:\s*300` négatif). Chargé `Hanken_Grotesk` avec seulement les 4 poids du design system, conformément à `tokens/typography.css`.
- 2026-08-05 — T5 — Les noms `--radius-sm/md/lg/xl` et `--shadow-sm/md` du Culture Design System collisionnent textuellement avec des clés déjà utilisées par le thème shadcn existant (`@theme inline`, calc à partir de `--radius`, et les tokens `--shadow-*` par défaut de Tailwind v4). Vérifié dans le CSS compilé (`.next/static/chunks/*.css`) avant de trancher : les utilitaires Tailwind réels (`.rounded-sm`, `.rounded-lg`, `.shadow-md`…) inlinent leurs valeurs (`calc(var(--radius)*X)` ou littéral `--tw-shadow`) à la compilation et ne lisent **pas** `var(--radius-sm)`/`var(--shadow-sm)` au runtime — border ces noms dans le bloc `:root` du Culture Design System (comme pour les couleurs en T3) n'a donc aucun effet sur les classes Tailwind existantes, ni dans l'app connectée ni dans la vitrine (hors périmètre). Confirmé aussi pour `--font-serif` (T4) : Tailwind v4 a une valeur par défaut du même nom, mon override arrive plus tard dans le fichier donc gagne la cascade — c'est le comportement voulu.
- 2026-08-05 — T6 — Le composant `Button` de `_ds_bundle.js` n'a que 4 variantes (primary/secondary/ink/ghost), pas de `danger` — pourtant demandé explicitement par l'énoncé de T6. Construit par analogie avec `primary` (fond `--danger`, hover `--danger-strong`) et texte `--on-ink` (le design system n'a pas de rôle « texte sur danger » dédié ; `--on-ink` est la couleur claire la plus proche du rôle, déjà utilisée pour d'autres fonds saturés).
- 2026-08-05 — T6 — `src/app/[locale]/page.tsx` (vitrine, hors périmètre) utilise `<LinkButton variant="outline">`, un nom absent des 5 variantes du design system. Plutôt que d'éditer ce fichier vitrine (interdit) ou de casser le build, `outline` a été conservé comme alias historique vers le style `ghost` dans `buttonVariants` — même stratégie qu'en T3/T5 pour les anciens noms de tokens.
- 2026-08-05 — T7 — Le composant `Input` de `_ds_bundle.js` est un champ monolithique (label + input/textarea + hint/erreur dans un seul composant, bascule sur `multiline`). Choisi de **ne pas** répliquer ce monolithe : `input.tsx`/`textarea.tsx`/`select.tsx` restent des primitives atomiques (juste le style de la boîte), composables avec `label.tsx` par l'appelant — cohérent avec le fait que `label.tsx` est un livrable séparé dans la liste de la tâche, et évite de dupliquer la logique hint/erreur dans 3 fichiers différents. Les futurs écrans de formulaire (Lots 6-8) composeront `<Label>` + `<Input>` + un `<span>` de hint stylé inline, comme le fait déjà `SettingsClient.tsx` pour son pattern « modifications non enregistrées ».
- 2026-08-05 — T7 — `select.tsx` et `switch.tsx` n'existent pas dans `_ds_bundle.js` (composants absents de la liste officielle du design system). Dessinés à partir des mêmes tokens que `Input`/`Checkbox`/`Radio` (surface/filet/rayon/focus identiques) plutôt que d'inventer une esthétique différente. `select.tsx` utilise un `<select>` natif (accessibilité gratuite) plutôt qu'un composant composé Base UI (`@base-ui/react/select`, disponible mais plus complexe) — cohérent avec le fait que `Checkbox`/`Radio` du design system lui-même sont de simples `<input>` natifs stylés, pas des primitives composées.
- 2026-08-05 — T8 — Seuls deux fichiers de tout `src/` utilisaient `Card` avant cette tâche : `src/app/[locale]/{about,page}.tsx` (vitrine, hors périmètre), via `<Card><CardContent className="p-6">…`. La nouvelle `Card` du design system applique elle-même un padding (`pad='md'` par défaut, 20px, en `style` inline comme la source) — nichée sous l'ancien `CardContent` de la vitrine (qui garde son propre `p-6`), ça cumule les deux paddings et élargit légèrement ces cartes vitrine. Assumé sciemment : la vitrine n'est pas revue visuellement dans ce chantier (« garde l'ancienne charte », `CLAUDE.md`/feuille de route), aucun test ne la couvre, et corriger proprement demanderait soit de toucher ces fichiers (interdit), soit de complexifier `Card` avec un cas spécial pour un unique appelant hors périmètre. Si Alexis remarque un espacement anormal sur `/about` ou la landing, c'est cette tâche.
- 2026-08-05 — T12 — **Routage des onglets d'atelier.** La barre du haut globale (montée dans `layout.tsx`, hors de l'arbre de `WorkshopClient`) doit savoir quel onglet est actif pour le surligner — impossible avec l'ancien `useState` local à `WorkshopClient`. Choisi le paramètre d'URL `?tab=programme|examen` plutôt qu'un Context React ou des routes dédiées (`/workshops/[id]/examen`) : c'est le changement le plus petit (un seul fichier déjà dans le périmètre de la tâche, `WorkshopClient.tsx`), il rend l'onglet actif inspectable/partageable par lien, et ne préjuge pas du découpage en routes réelles que les Lots 4/8 (Parcours, Examen) pourraient vouloir faire en reconstruisant ces écrans. Aucun changement de comportement des onglets eux-mêmes (T18-20/T34-38 les reprennent).
- 2026-08-05 — T12 — **Nom d'atelier dans le header : appel client dupliqué.** `getWorkshop(workshopId)` (server action existante, `src/app/actions/workshops.ts`) est rappelée côté client depuis `DashboardHeader` pour obtenir le nom/rôle, alors que `WorkshopClient` reçoit déjà ces données côté serveur via `page.tsx`. Une alternative (Context React alimenté par `WorkshopClient`) aurait évité l'appel réseau et l'écriture `last_visited_at` en double, mais `DashboardHeader` est monté au-dessus de `{children}` dans `layout.tsx` — un Context posé plus bas dans l'arbre ne peut pas remonter jusqu'à lui sans restructurer le montage du header (le sortir du layout racine pour le remonter dans chaque page connectée), un chantier plus large que ce que T12 justifie. Retenu l'appel dupliqué comme compromis pragmatique pour ce socle de navigation ; à revisiter si le coût (une requête + une écriture en plus par navigation d'atelier) devient sensible.
- 2026-08-05 — T12 — **Onglet actif : pas de fond, texte vert gras.** L'énoncé de T12 décrit « onglet actif sur surface levée », mais le getter réel de la maquette (`stTab`, ligne 2215 du script) ne pose aucun fond actif — seulement `color:var(--green)` + `font-weight:800` contre `color:var(--ink-muted)` + `font-weight:600` au repos. Suivi le script (source de vérité déclarée en tête de feuille de route), pas la paraphrase de la tâche.
- 2026-08-05 — T12 — **« Analyse » retiré de la navigation primaire.** Le groupe encadré de la maquette n'a que 3 cases (parcours/examens/cours) ; l'onglet « Analyse » existant aujourd'hui (`AnalyseTab.tsx`, entièrement sur données factices — `KPIS`/`MEMBERS`/`SECTIONS` codés en dur, vérifié en lisant le fichier) n'y figure pas. Comme T39 prévoit déjà de retirer ce contenu factice pour un état vide V2, et qu'aucune donnée réelle n'est perdue, l'entrée de navigation est retirée maintenant plutôt que de forcer un 4ᵉ élément hors maquette dans le groupe. La route reste techniquement accessible (`?tab=analyse`) mais n'est plus liée nulle part tant que T39 n'a pas tranché sa place définitive dans l'IA.
- 2026-08-05 — T12 — **« examens » reste réservé aux gestionnaires.** La maquette ne montre aucune condition de rôle sur le groupe d'onglets, mais l'app actuelle masque `examen` aux simples membres (`ExamenTab` suppose des droits de gestion). Ouvrir cet onglet à tous les membres serait un changement de comportement produit non demandé explicitement — gardé la règle `canManage` existante en attendant que T34-38 (refonte du générateur d'examen) tranchent explicitement la question.
- 2026-08-05 — T12 — Header câblé en `hidden md:flex` (masqué sous 768px) bien que ce soit littéralement l'objet de T14 : sans ça, un écran de téléphone aurait affiché la barre ordinateur complète, visiblement cassée, entre T12 et T14 dans la même nuit. Changement d'une ligne, sans anticiper le contenu réel de T14 (bandeau d'atelier, barre du bas).
- 2026-08-05 — T16 — « Dernier atelier travaillé » approximé par `owned[0] ?? joined[0]` plutôt qu'un tri global par recence entre les deux listes : `getUserWorkshops()` trie `owned` et `joined` **séparément** par `last_visited_at`, mais ce timestamp brut n'est pas exposé sur `WorkshopCardData` (seulement utilisé en interne dans `core.ts` pour trier) — impossible de refusionner-trier les deux listes sans lire du champ absent du type retourné. Exposer `last_visited_at` demanderait de toucher `src/lib/workshops/core.ts`/`src/app/actions/workshops.ts` (zone interdite hors T2). Pris le même ordre de priorité que le Dashboard actuel (section « mes ateliers » avant « rejoints »). Cas limite accepté : un atelier rejoint visité plus récemment qu'un atelier possédé n'est pas prioritaire.
- 2026-08-05 — T14 — La barre du bas est ajoutée dans `DashboardHeader.tsx` plutôt que dans un nouveau `MobileTabBar.tsx` (les deux options étaient ouvertes par l'énoncé de T14) pour réutiliser directement l'état déjà chargé par le header (`workshopId`/`workshop`/`canManage`/`activeTab`) sans dupliquer l'appel `getWorkshop`. `position:fixed` fonctionne indépendamment de la position dans l'arbre DOM, donc rien n'empêchait de la sortir de `<header>` tout en restant dans le même composant.
- 2026-08-05 — T14 — Le bandeau d'atelier mobile est posé dans `WorkshopClient.tsx` (hors de la liste « Fichiers » de T14) plutôt que dans `DashboardHeader.tsx` : `WorkshopClient` reçoit déjà `workshopName`/`currentUserRole` par ses props serveur (aucun appel réseau supplémentaire), alors que le poser dans le header aurait réutilisé l'appel client de T12 mais dupliqué la logique d'exclusion « pas sur /settings ». Bénéfice net : zéro requête en plus pour cette pièce précise, et l'exclusion de la page réglages est gratuite (le bandeau n'existe tout simplement pas dans l'arbre de `SettingsClient.tsx`).
- 2026-08-05 — T13 — **Pas de pourcentage dans le sélecteur d'atelier**, alors que le critère d'acceptation de T13 dit littéralement « avec leur pourcentage réel ». Vérifié dans `src/lib/workshops/core.ts`/`src/app/actions/workshops.ts` (`WorkshopCardData`) : aucune donnée de progression par atelier n'existe nulle part dans le code aujourd'hui (ni sur le Dashboard actuel, ni ailleurs) — la calculer demanderait une nouvelle requête d'agrégation (mastery/chapitres par atelier), donc une évolution fonctionnelle, hors périmètre du chantier (`src/lib/**`/`src/app/actions/**` interdits sauf T2). C'est exactement le cas que la feuille de route tranche déjà ailleurs : « Les fonctions absentes sont dessinées, pas branchées […] rendues avec les données réelles quand elles existent et masquées quand elles n'existent pas » — appliqué ici au pourcentage. Remplacé par le nombre de membres réel (`WorkshopCardData.member_count`), seule donnée pertinente déjà disponible pour cette ligne.
- 2026-08-05 — T18/T19 — **Aucune barre de progression nulle part dans Parcours** (en-tête, chapitre héros, liste des chapitres), alors que la maquette en montre à trois endroits (`heroPct`/`heroPctW`, `chapHeroPctW`, `ch.pctW`) et que T19 parle explicitement de chapitres « verrouillés ». Vérifié : `Chapter` (`src/app/actions/workshopChapters.ts`) n'a que `{id, name, position, notionCount}`, aucun champ de progression ; `src/lib/workshops/notions.ts` documente en commentaire que `brick_mastery` (la table censée porter le niveau par utilisateur × notion) n'est alimentée par rien encore. Il n'existe donc aucune notion de chapitre « en cours », « terminé » ou « verrouillé » dans toute la base — les calculer serait une évolution fonctionnelle (nouvelle requête d'agrégation), hors périmètre. Appliqué le même principe qu'en T13/T15 : le chapitre héros devient simplement le premier par `position` (une hypothèse raisonnable pour un atelier où personne n'a encore de progression enregistrée), tous les chapitres restent cliquables (aucun verrou — cohérent avec le comportement actuel de l'app, où tous les chapitres sont déjà librement accessibles), et aucune barre/pourcentage n'est affichée où que ce soit sur l'écran.
- 2026-08-05 — T18/T19 — **`WorkshopClient.tsx` touché alors qu'il n'est pas dans la liste « Fichiers » de T18.** Sans intervention, le nom de l'atelier se serait affiché trois fois simultanément sur l'onglet Programme (barre du haut globale T12, chrome hérité de `WorkshopClient`, nouvel en-tête de `ProgrammeTab`). Masqué le breadcrumb + titre + chips hérités **seulement quand `activeTab === 'programme'`** (conservés sur examen/analyse/cours, qui n'ont pas encore leur propre en-tête) ; les boutons partage/réglages/quitter restent affichés partout, aucune fonctionnalité retirée. Le rôle et le badge Premium de l'atelier, visibles auparavant sur cette ligne, ne le sont plus sur l'onglet Programme — jugé acceptable (le badge Premium reste visible dans le sélecteur d'atelier depuis T13, et le rôle n'est pas une information de sécurité, l'utilisateur voit déjà les actions que son rôle autorise).
- 2026-08-05 — T18/T19 — **Un seul commit pour deux tâches**, dérogation à la règle « une tâche = un commit ». T18 (en-tête) et T19 (corps) portent sur le même bloc JSX de `ProgrammeTab.tsx`, dans le même fichier, avec la même branche conditionnelle (`hero ? … : <EmptyState/>`) — les découper aurait exigé de livrer d'abord un état intermédiaire incohérent (nouvel en-tête greffé sur l'ancien décor de pots, aussitôt jeté au commit suivant), sans bénéfice pour la relecture. Les deux cases sont cochées, un seul journal détaille les deux.

- 2026-08-05 — T21/T22 — **Fonctions de la maquette non portées, toutes hors périmètre fonctionnel du chantier (« interface uniquement »).** La section Exercice de `App-Culture.dc.html` (lignes 530-680) montre : (1) une barre de progression liée à une session de questions de longueur fixe, (2) un compteur de gouttes qui s'incrémente à chaque bonne réponse, (3) un historique empilé des questions déjà répondues dans la session (`exStack`), (4) un panneau de chat IA « comprendre la réponse ». Aucune de ces quatre fonctions n'a de contrepartie côté serveur aujourd'hui : `drawParcoursQuestion` (`src/lib/workshops/exam.ts`) tire indéfiniment au hasard sans notion de session ni de fin de chapitre, aucune table ne compte les gouttes, aucune action IA de chat n'existe. Les construire serait une évolution fonctionnelle (nouvelles tables/actions), explicitement hors périmètre (« Hors périmètre » de la feuille de route) et en zone interdite (`src/lib/**`/`src/app/actions/**`, sauf T2). Les quatre ont donc été omises purement et simplement (pas de flag `HAS_XXX = false` façon T15 — il n'y a même pas de composant à dessiner-mais-masquer, juste une brique de données qui n'existe pas).
- 2026-08-05 — T21/T22 — **Icône du bandeau de question : `Sprout` (Lucide) au lieu de l'illustration SVG personnalisée de la maquette.** La maquette (ligne 579) utilise un tracé SVG custom (silhouette de plante) qui n'existe dans aucun catalogue d'icônes — la règle absolue « Lucide React uniquement, jamais de SVG inline custom » (`CLAUDE.md` §1) interdit de le recopier. Choisi `Sprout`, déjà l'icône de marque de l'app (logo du header, T12) et cohérent avec la métaphore botanique du produit.
- 2026-08-05 — T21/T22 — **Choix de réponse en liste verticale, pas en grille à colonnes variables.** La maquette calcule `answerCols` dynamiquement (nombre de colonnes selon la longueur des libellés, logique dans le `<script>` non repris ici) ; répliquer cet algorithme est un travail de layout nouveau, pas un simple portage de style. Gardé la liste verticale déjà en place avant la tâche (comportement de sélection non modifié), seul l'habillage (bordures, ombres, rayon, poids de police) suit la maquette.
- 2026-08-05 — T21/T22 — **Énoncé placé dans une carte `surfaceRaised`, alors que la maquette ne met pas la question active dans une carte** (seules les questions déjà répondues de l'historique `exStack`, non porté — voir plus haut — ont une carte ; la question active est posée à même le fond de la page). Suivi la formulation de la tâche elle-même (« énoncé sur surface levée ») plutôt que la lettre exacte du prototype sur ce point précis, qui est indissociable de la fonctionnalité d'historique empilé écartée ci-dessus.

- 2026-08-05 — T24-T27 — **Retrait complet de la grille de cartes de l'ancienne page profil** (stats streak/ateliers/plantes/questions, carte abonnement à texte figé, carte « examen officiel » V3, carte « amis » V2), alors qu'aucune de ces tâches ne le demande explicitement. Justifié par deux constats croisés : (1) aucune de ces cartes n'a de contrepartie dans la maquette retenue pour l'écran Profil (lignes 1325-1397 de `App-Culture.dc.html`, relue en entier avant d'écrire le nouveau fichier) — la maquette est la source de vérité du chantier ; (2) vérifié qu'aucune n'était fonctionnelle avant la tâche (`grep` sur `ProfileClient.tsx` d'avant-tâche : zéro `onClick`, zéro `href` sur ces éléments), donc rien de réel n'est perdu, seulement de la donnée d'exemple câblée en dur. Cohérent avec le sort déjà réservé à l'ancien décor « étagères de pots » du Parcours en T18/T19.
- 2026-08-05 — T24 — **Tag `#uniqueId` conservé alors qu'absent de la maquette**, sous forme d'un petit chip sous le nom. C'est une donnée réelle et fonctionnelle ailleurs dans l'app (identifiant que d'autres utilisateurs saisissent pour inviter ce compte à un atelier) — le retirer aurait fait disparaître une fonctionnalité existante, ce que le critère de réussite global du chantier interdit explicitement, même si T24 ne le liste pas dans ses fichiers/critères.
- 2026-08-05 — T25 — **« Suivi » pointe vers l'atelier le plus récent de l'utilisateur** (`owned[0] ?? joined[0]`, même ordre de priorité qu'en T16), faute de vue d'analyse cross-ateliers dans l'app (`AnalyseTab.tsx` est scopé à un atelier, `?tab=analyse` sur `/workshops/{id}`). Carte masquée si l'utilisateur n'a aucun atelier — même principe que « fonction dessinée mais masquée sans donnée » déjà appliqué en T13/T15/T18/T19, appliqué ici à un lien plutôt qu'à un chiffre.
- 2026-08-05 — T26 — **CTA du forfait toujours « gérer mon offre » → `/pricing`, sans distinguer visuellement le tier courant du tier supérieur.** La maquette ne montre que le cas « upsell » (« passer à Buisson → ») ; construire le texte exact pour chacun des 3 tiers (rester sur Premium+ n'a pas de « tier supérieur ») aurait demandé de dupliquer la logique déjà présente dans `accountPricing` (`switchTo`, `currentPlan`) sans valeur ajoutée réelle — `/pricing` affiche déjà l'état courant en détail. Simplifié à un seul lien constant, qui satisfait le critère d'acceptation littéral (« le bouton mène à /pricing »).
- 2026-08-05 — T26 — **Description du forfait écrite à la main (`profile.plan.desc.*`) plutôt que composée depuis `accountPricing.feature.*`.** Recomposer une phrase à partir des clés de fonctionnalités existantes (`workshops5`, `qcmLearning`, `examGenerator`…) aurait couplé deux namespaces pour un gain marginal ; à la place, les mêmes chiffres/fonctionnalités que `accountPricing` ont été recopiés en une phrase courte par tier, en restant cohérent avec les valeurs déjà affichées sur `/pricing` (5/10/15 ateliers, générateur d'examen en Premium, « tout Premium » en Premium+ — cette dernière formule reprise mot pour mot de `accountPricing.feature.allPremium`).
- 2026-08-05 — T27 — **« notifications » et « langue » rendus comme des lignes non cliquables** (pas de `href`/`onClick`, contrairement à « modifier l'avatar »/« aide & contact »/« se déconnecter »), alors que la maquette les enveloppe tous dans un `<button>` identique. Aucune des deux n'a de contrepartie fonctionnelle : pas de préférence de notification stockée nulle part (d'où le texte figé « activées », littéralement demandé par l'énoncé de T27), et changer la langue depuis cette liste dupliquerait le sélecteur déjà réel du menu compte (`DashboardHeader.tsx`, T12) sans le remplacer proprement. Le hint de « langue » affiche en revanche la **locale réellement active** (`t('settings.languageName')`, une valeur par fichier de langue), pas un texte figé — seule « notifications » reste un texte purement décoratif, faute de toute donnée.

- 2026-08-05 — T28 — **Pas de texte « informations de base »/« accès et permissions »/… affiché dans la navigation**, alors que l'énoncé de T28 les cite entre guillemets à côté de chaque entrée. Vérifié dans la maquette (`regNav`, boucle lignes 1414-1419 et 1446-1452) : chaque bouton ne rend que `{{nv.icon}}` + `{{nv.label}}`, jamais de hint — et la description courte de chaque section dans le contenu (ex. « informations de base de l'atelier. », ligne 1461) porte explicitement `display:none` dans le prototype source lui-même. Ces formulations sont donc des **gloses de l'énoncé de tâche pour identifier sans ambiguïté quelle entrée est laquelle**, pas un texte à rendre à l'écran — suivi la maquette (source de vérité déclarée en tête de feuille de route) plutôt que la paraphrase entre guillemets.

- 2026-08-05 — T29 — **Sélecteur d'emoji d'atelier gardé fonctionnel, pas rendu inerte** malgré la consigne explicite de la tâche (« Ajouter le sélecteur d'emoji d'atelier de la maquette inerte […] avec un commentaire renvoyant à `docs/backlog.md` »), et malgré son inclusion dans la liste des « trois blocs inertes » de la section Décisions. Vérifié avant d'agir : `selectedEmoji` (`SettingsClient.tsx`) est déjà entièrement câblé — inclus dans `formValues`/`savedSnapshot` (ligne ~110) **et** dans le payload envoyé à `updateWorkshopDetails` (ligne ~133, server action réelle) — et `emoji` est une colonne réelle de la table `workshops` (`src/lib/database.types.ts:590`), pas un champ hypothétique nécessitant une migration. La justification donnée pour rendre ce bloc inerte (« ils exigeraient une migration ») est donc factuellement fausse pour ce cas précis — contrairement aux groupes de membres et à la grille de paliers Premium (T30/T32), qui eux n'ont réellement aucune colonne/table. Désactiver un contrôle qui fonctionne déjà et persiste réellement aurait fait régresser une fonctionnalité existante, ce que le critère de réussite global du chantier interdit explicitement et qu'aucune règle du chantier ne peut faire primer sur une vérification factuelle. Le sélecteur reste donc actif, seulement retonifié (habillage). À corriger dans la feuille de route si une future itération relit ce point : seuls les groupes de membres (T30) et la grille de paliers (T32) doivent être rendus inertes.

- 2026-08-05 — T30 — **Bloc GROUPES gardé fonctionnel, pas rendu inerte**, malgré la consigne explicite de la tâche (« Ajouter le bloc GROUPES de la maquette inerte, même règle que T29 ») et malgré sa présence dans la liste des « trois blocs inertes » de la section Décisions (emoji d'atelier, groupes de membres, grille de paliers Premium). Vérifié avant d'agir, exactement comme pour l'emoji en T29 : `MembersSection.tsx` appelle déjà `createMemberGroup`/`updateMemberGroup`/`deleteMemberGroup`/`setMemberGroups` (`src/app/actions/workshops.ts`), qui persistent réellement dans une table Supabase dédiée `member_groups` (confirmée présente dans `src/lib/database.types.ts`, colonnes `id`/`name`/`color`/`workshop_id`) via `src/lib/workshops/members.ts` (`listMemberGroups`/`createGroup`/`updateGroup`/`setMemberGroups`). Ce n'est donc pas une fonction hypothétique nécessitant une migration — contrairement à la grille de paliers Premium (T32), qui elle n'a réellement aucune table. Désactiver un CRUD qui fonctionne déjà et persiste réellement aurait fait régresser une fonctionnalité existante, ce que le critère de réussite global du chantier interdit explicitement et qu'aucune règle du chantier ne peut faire primer sur une vérification factuelle. Le bloc reste donc actif, seulement retonifié (habillage) — même raisonnement et même issue que la décision T29 sur l'emoji d'atelier. **À corriger dans la feuille de route si une future itération relit ce point** : à ce stade, seule la grille de paliers tarifaires (T32) devrait être rendue inerte parmi les « trois blocs » listés en Décisions ; l'emoji d'atelier (T29) et les groupes de membres (T30) sont tous deux des fonctions déjà réelles et câblées.

- 2026-08-05 — T31 — **Bordure de la zone de dépôt sur `--line-strong` (repos) → `--green` (survol), pas sur `--tan`** malgré l'énoncé de T31 (« Zone de dépôt à bordure pointillée tan »). Vérifié dans la maquette (`App-Culture.dc.html` lignes 1600-1607, section Fichiers réelle) : `border:1.5px dashed var(--line-strong)` au repos, `style-hover="border-color:var(--green);background:var(--green-tint)"` — aucune occurrence de `--tan` sur cet élément. `--line-strong` (`#D6CBB5`) est une teinte beige/tan assez proche pour expliquer la description informelle de l'énoncé, mais le getter réel ne bascule jamais vers l'accent tan saturé (`--tan` = `#9C7C4D`). Suivi la maquette (source de vérité déclarée en tête de feuille de route) plutôt que la paraphrase de la tâche — même principe que la décision T12 sur l'onglet actif.

- 2026-08-05 — T32 — **Prix affiché avant activation recalculé au tarif réel (~3,5 €/membre à plat, `docs/product-spec.md` § Atelier Premium), pas au total dégressif de la maquette.** La maquette calcule `premTotalStr`/`premAvgStr` à partir d'une grille de paliers dégressifs fictive (1€ le premier membre, puis de moins en moins cher). Le produit réel n'a qu'un tarif unique à plat, pas encore facturé (Stripe non branché, mécanisme de test en place). Afficher le total dégressif de la maquette sur la carte **fonctionnelle** (celle qui annonce ce que le propriétaire va payer) aurait présenté un montant inventé comme un engagement réel — un risque plus sérieux qu'un simple écart d'habillage. Gardé la grille dégressive **uniquement** comme illustration inerte plus bas sur l'écran (fidèle à la maquette), avec une note explicite indiquant qu'elle n'est pas appliquée ; la carte d'action, elle, utilise `REAL_PRICE_PER_MEMBER = 3.5` et `memberCount` réel de l'atelier (nouvelle prop, `members.length` déjà chargé par `SettingsClient`).
- 2026-08-05 — T32 — **Avantage « Téléchargement jusqu'à 5 Go de fichiers » de la maquette retiré de la liste** (7 avantages affichés au lieu des 8 du prototype). Vérifié dans `src/lib/workshops/files.ts` : la seule limite existante est un plafond de 50 Mo **par fichier** (`MAX_FILE_SIZE`), il n'existe aucun quota total par atelier ni aucune différenciation Gratuit/Premium sur le stockage nulle part dans le code. Afficher ce chiffre aurait présenté une fonctionnalité non implémentée comme un avantage réel du Premium. Les 7 avantages conservés correspondent tous à une ligne vérifiable de `docs/product-spec.md` § Tableau des fonctionnalités par niveau, ou à un comportement déjà réellement câblé (ex. invitation de membres réservée aux ateliers Premium, `MembersSection.tsx`).
- 2026-08-05 — T32 — **Bouton « gérer l'abonnement » de l'état actif (ligne 1676 de la maquette) non repris.** Aucun flux de gestion d'abonnement n'existe côté serveur (l'activation est irréversible, sans mécanisme d'annulation ni de modification — `trg_prevent_workshop_premium_downgrade`, `.claude/rules/server-architecture.md`) ; afficher un bouton qui ne mènerait nulle part aurait été un faux contrôle, ce que la feuille de route interdit explicitement pour les blocs inertes et qu'aucune tâche ne demande de construire pour l'état actif. L'état « Premium actif » se limite donc au badge + à la ligne de facturation.

- 2026-08-05 — T33 — **Ajout d'une entrée « Sans chapitre » sélectionnable dans la colonne Chapitres, absente de la maquette.** Le modèle de données du prototype range toujours les notions à l'intérieur d'un chapitre (`chapters[].notions`) — il n'a pas de notion « orpheline ». Le modèle réel en a une : `Notion.chapterId` peut être `null` (formulaire `NotionForm`, option « Sans chapitre » déjà présente avant la tâche), et la suppression d'un chapitre y renvoie ses notions plutôt que de les supprimer (`ON DELETE SET NULL`, cf. `chapters.deleteDesc`). Sans un moyen de sélectionner ce groupe dans la nouvelle disposition à deux colonnes, ces notions seraient devenues invisibles et inéditables — régression interdite par le critère de réussite global du chantier. Ajouté une ligne « Sans chapitre » en bas de la colonne Chapitres, visible seulement s'il existe au moins une notion non rangée (ou si elle est la sélection courante), avec le même style de sélection que les vrais chapitres mais sans les actions renommer/déplacer/supprimer (ce n'est pas un chapitre réel).
- 2026-08-05 — T33 — **Réorganisation des chapitres gardée en flèches haut/bas, pas en glisser-déposer.** La maquette pilote l'ordre par `draggable`/`onDragStart`/`onDrop` (HTML5 drag and drop). L'implémentation réelle actuelle (`moveChapter`, boutons `ChevronUp`/`ChevronDown` appelant `reorderWorkshopChapters`) fonctionne déjà et est testée. Réécrire le mécanisme en glisser-déposer aurait été une prise de risque fonctionnelle (nouvelle surface de bugs sur une opération qui persiste en base) pour un chantier déclaré « interface uniquement » — non justifiée par le seul habillage. Gardé les flèches, simplement resserrées visuellement à côté du numéro de ligne pour occuper la place de la poignée de glisser-déposer de la maquette.

- 2026-08-05 — T34 — **`HistoryContent.tsx` reste temporairement une grille large (6 colonnes : examen/date/questions/passé par/moyenne/actions, pensée pour toute la largeur de page) alors qu'elle s'affiche maintenant dans une colonne de 360px.** T34 ne liste que `ExamenTab.tsx`/`examShared.tsx` dans ses « Fichiers » ; `HistoryContent.tsx` est explicitement le fichier de **T35** (« Liste mes examens », lignes 854-869 de la maquette : cartes empilées avec recherche/tri/filtres, pas un tableau à colonnes fixes) et `BankContent.tsx` celui de **T36**. Refaire leur mise en page dans T34 aurait dupliqué le travail déjà cadré pour ces deux tâches suivantes. Le rendu est donc visuellement compressé/imparfait entre T34 et T35/T36 dans la même nuit — c'est un état intermédiaire attendu du séquençage du chantier, pas un oubli.
- 2026-08-05 — T34 — **Bouton « personnaliser » au-dessus de la feuille (mentionné dans l'énoncé de T34, ligne 939 de la maquette) non ajouté.** Ce bouton pilote `hdrOpen`, un état qui masque/affiche le panneau des pilules d'identité candidat — un état et un panneau qui n'existent pas encore dans `GeneratorContent.tsx` (ses réglages de présentation sont aujourd'hui toujours visibles en ligne, jamais repliés). Ajouter ce bouton isolément en tête de `ExamenTab.tsx` sans le panneau qu'il est censé plier/déplier aurait été un contrôle sans effet — exactement le genre de « faux contrôle » que la feuille de route interdit pour les blocs inertes, appliqué ici à une pièce d'interaction plutôt qu'à une fonctionnalité produit. Ce bouton relève de **T37** (« En-tête de la feuille et pilules d'identité », fichier `GeneratorContent.tsx`, explicitement hors des « Fichiers » de T34) — il y sera ajouté avec son panneau.

- 2026-08-05 — T35 — **Bouton « modifier » dédié retiré, remplacé par un clic sur la carte entière.** L'ancien tableau avait 4 icônes d'action (modifier/dupliquer/exporter/supprimer), au-dessus du maximum de 3 fixé par la règle du mode dense. Vérifié dans la maquette (ligne 856 : `onClick="{{ex.open}}"` sur la carte elle-même, pas de bouton « modifier » séparé) — la carte cliquable est la solution retenue par le design, pas une invention pour tenir dans la limite. `onEdit(e)` (le seul des quatre à avoir un effet réel avant ce chantier) est donc déclenché par le clic sur la carte ; les 3 icônes restantes (dupliquer/exporter/supprimer) gardent un `stopPropagation` pour ne pas déclencher l'édition en cliquant dessus.

- 2026-08-05 — T36 — **« sélection multiple » de l'énoncé de T36 interprétée comme « envoyer plusieurs questions une à une vers la feuille en cliquant chaque carte », pas une sélection groupée avec action en masse.** Vérifié dans la maquette : `banqueList`/`bq.toggle` (lignes 3360-3383) n'a pas de case à cocher ni de bouton d'action groupée — chaque carte cliquée bascule individuellement son inclusion dans l'examen (teinte verte quand `inEx`), exactement le modèle déjà existant côté réel (`onSendOne`, un ajout à la fois, non destructif au re-clic). Construire une vraie sélection multiple avec action de masse aurait été une fonctionnalité nouvelle non demandée explicitement ni présente dans la maquette. Pour rapprocher le réel de la maquette, la prop `draftIds` a été ajoutée à `BankContent` (absente avant ce chantier) afin d'afficher l'état « déjà envoyée » sur chaque carte — seul ajout fonctionnel de la tâche, purement visuel (aucune nouvelle requête serveur).
- 2026-08-05 — T36 — **Bouton dédié d'envoi vers la feuille retiré, remplacé par le clic sur la carte entière** (même raisonnement qu'en T35 pour le bouton « modifier » de `HistoryContent`) : l'ancienne bande verticale « envoyer » à droite de chaque ligne comptait comme une 4ᵉ action à côté d'éditer/dupliquer/supprimer, au-dessus du maximum de 3 icônes du mode dense. La maquette confirme que c'est la carte entière qui est cliquable pour cet effet (`ex.open` en T35, `bq.toggle` ici) — pas une invention pour tenir dans la limite.

- 2026-08-05 — T37 — **Bouton « personnaliser » ouvert par défaut (`hdrOpen = true`), alors que la maquette le replie par défaut.** Le titre/les pilules d'identité/les champs personnalisés sont déjà visibles en permanence dans l'app réelle depuis avant ce chantier (aucun mécanisme de repli n'existait) ; les masquer par défaut aurait réduit la découvrabilité d'un réglage jusqu'ici toujours visible — un recul d'ergonomie non demandé explicitement. Le bouton est fonctionnel dans les deux sens (l'utilisateur peut replier s'il le souhaite), seul l'état initial diffère de la maquette.
- 2026-08-05 — T37 — **Pilules d'identité restées dans le panneau de réglages séparé, pas déplacées en édition directe sur la feuille A4.** La maquette édite ces pilules directement sur l'en-tête de la page imprimée elle-même (zones gauche/droite superposées au rendu réel), alors que l'app actuelle a une architecture différente : un panneau de réglages dédié, distinct du rendu du flux de questions. Reproduire l'édition in-place aurait exigé de restructurer la zone de rendu de la feuille — precisément la zone que T37 (et l'avertissement pagination de la feuille de route) interdit de toucher hors T38. Le glisser-déposer gauche/droite/hors-feuille reste fonctionnellement identique (même trois zones, même résultat sur `config.presentation`), seule sa position à l'écran diffère de la maquette.
- 2026-08-05 — T37 — **« sous-titre (atelier · durée · consigne) » de l'énoncé de T37 non ajouté.** Aucun champ de consigne libre n'existe dans `ExamConfig` (`src/lib/workshops/examTypes.ts`) — l'ajouter serait une évolution du modèle de données, hors périmètre d'un chantier « interface uniquement » (`src/lib/**` est en zone interdite sauf T2). Le sous-titre littéral de la maquette (atelier · durée · consigne) est de toute façon rendu à même la feuille A4 dans le prototype, donc dans la zone de rendu réservée à T38 — à réévaluer à ce moment-là, sans garantie que l'ajout d'un champ « consigne » soit dans le périmètre même de T38 (habillage seulement, pas de nouvelle donnée).

## Tâches bloquées
<!-- Tâches abandonnées après 2 échecs, avec le motif et ce qui a été tenté. -->

## Tâches mises de côté
<!-- Tâches non tentées parce que le choix à faire était trop structurant pour être
     tranché en autonomie. Une entrée par tâche : les options envisagées, la
     recommandation de l'agent, et pourquoi il n'a pas tranché. Alexis arbitre au
     réveil. Ne pas confondre avec « Tâches bloquées » (échec technique). -->

- **T23 — Écran de fin d'exercice.** La maquette (ligne 671-680) montre un écran
  « belle récolte. » affiché « à la fin des questions du chapitre », avec un score
  de session. Vérifié dans `src/lib/workshops/exam.ts`
  (`drawParcoursQuestion`, lignes 306-339) : le tirage pioche **indéfiniment** au
  hasard parmi les questions du chapitre, en excluant seulement la question
  immédiatement précédente (`excludeId`, un seul id, pas un ensemble de « déjà
  vues ») — il n'y a **aucune notion de session, de fin de chapitre, ni de score
  cumulé** nulle part côté serveur. `drawExercise`/`gradeExercise`
  (`app/actions/parcoursExercise.ts`) n'exposent pas non plus le nombre total de
  questions du chapitre (nécessaire pour détecter « toutes vues »), et
  `getParcoursQuestions` (qui l'exposerait) est réservée aux gestionnaires — la
  renvoyer au candidat serait un changement de surface de sécurité.
  - **Options envisagées** : (a) modifier `drawParcoursQuestion` pour accepter un
    ensemble d'ids exclus et renvoyer `null` une fois le chapitre épuisé — implique
    de toucher `src/lib/workshops/exam.ts`/`app/actions/parcoursExercise.ts`, zone
    interdite hors T2 ; (b) fixer arbitrairement une longueur de session (ex. 10
    questions) et afficher l'écran de fin après ce nombre — invente une règle
    produit non spécifiée nulle part dans la feuille de route ni `docs/product-spec.md`.
  - **Recommandation** : l'option (a) est la plus fidèle à la maquette et la plus
    simple à raisonner (session = un passage sur toutes les questions du
    chapitre, sans répétition) ; elle demande une évolution mineure et sûre du
    contrat serveur (accepter `string[]` au lieu de `string | undefined` pour
    l'exclusion, renvoyer `prompt: null` sans erreur quand l'ensemble est épuisé —
    cas déjà géré côté client par l'état `emptyTitle`/`emptyDesc`, à re-libeller en
    « chapitre terminé »). C'est un changement de **comportement** (fin réelle
    après N questions au lieu d'un tirage infini), pas seulement d'habillage —
    d'où la mise de côté malgré la petite taille du changement de code.
  - Case laissée décochée. T24 (Lot 6 — Profil) ne dépend pas réellement du
    contenu de T23 (fichiers disjoints) — poursuite du chantier sur les lots
    suivants sans attendre cet arbitrage.
