# Culture — Cahier des charges produit

> Spécifications produit détaillées : périmètre MVP, lexique, modèle d'abonnement, pages & navigation, et les deux modules fonctionnels. Ce fichier n'est **pas** chargé automatiquement — lis-le quand la tâche touche au périmètre produit, au vocabulaire métier, ou au comportement attendu d'une page/fonctionnalité. Les règles de développement (comment coder) sont dans `CLAUDE.md` et `.claude/rules/`.
>
> Dernière synthèse : 11/07/2026

---

## Vue d'ensemble

**Nom de travail :** Culture (nom produit final à confirmer)
**Type :** Application SaaS d'apprentissage — générateur pédagogique avec IA
**Plateformes :** Web / iOS / Android — **Web développé en premier**, iOS et Android après validation web (hors MVP)
**Architecture :** **API-first** obligatoire dès la V1 — chaque domaine fonctionnel expose une API interne propre (voir `.claude/rules/server-architecture.md` pour le pattern de code).

**Deux modules principaux :**
1. **Générateur pédagogique** — upload de fichiers → notions → programme éducatif personnalisé + générateur d'examens
2. **Examens standardisés** — certification officielle (développement prévu à partir de la V3, non prioritaire pour le MVP)

---

## Périmètre MVP (V1 — web uniquement)

### Dans le MVP

| Fonctionnalité | Notes |
|---|---|
| Création de compte et authentification | — |
| Upload de fichiers PDF | Un ou plusieurs fichiers par atelier |
| Décomposition en notions | Via IA. Notions modifiables manuellement. |
| Génération de questions | Via IA. Types : les 9 types de réponse réels (`ResponseType`, `src/lib/workshops/examTypes.ts`) — QCS, QCM, textuelle, liste, tableau, matching, dessin, fichier, sans réponse. `sondage`, `trier dans l'ordre` et `fill in the blank` ont été **retirés** le 09/08/2026 : ne pas les faire générer. |
| Parcours d'apprentissage séquencé | Enchaînement d'exercices sans gamification visuelle |
| Gestion d'un atelier | Ateliers toujours privés (adhésion validée), rôles gestionnaire/candidat, paramètres de base |
| Correction assistée | Suggestion IA + correction manuelle par le gestionnaire |
| Architecture API-first | APIs internes propres par domaine dès la V1 |

### Hors MVP (versions ultérieures)

| Fonctionnalité | Version cible |
|---|---|
| Gamification (jardin, plantes, énergie, séries, jokers, personnages) | V2 |
| Applications iOS & Android | V2 |
| Activités ludiques | V2 |
| Échange avec l'IA en cours d'apprentissage | V2 |
| Génération de cours (slides animées) | V2 |
| Scan et correction automatique de copies papier | V2+ |
| Examens projetés (type Kahoot) | V2 |
| Sécurité renforcée examens en ligne (caméra, micro, etc.) | V2 |
| Système social (amis) | V2 |
| Notifications intelligentes | V2 |
| Export CSV analyse | V2 |
| Taxonomie de Bloom appliquée à la génération | V2/V3 |
| Validation manuelle de section par gestionnaire (ateliers Premium) | V2 |
| API publique tierce | V3 |
| Module Examens standardisés (intégralité) | V3+ |

---

## Lexique

Termes utilisés dans toute la codebase et dans ce document.

| Terme | Définition |
|---|---|
| **Atelier** | Espace pédagogique créé par un gestionnaire à partir de fichiers sources. Contient un programme éducatif et un générateur d'examens. |
| **Notion** | Unité minimale d'information extraite d'un fichier source par l'IA (ou créée à la main). **Un seul texte** (280 caractères, l'idée en une phrase — le titre et la description séparés ont fusionné le 19/08/2026), rattachement à un chapitre optionnel. Terme produit et code depuis le chantier de refonte UI (08/2026) — anciennement « brique de connaissance » ; les tables Supabase restent nommées `workshop_bricks`/`brick_mastery`/`exam_question_bricks`, voir `CLAUDE.md` §1. |
| **Programme éducatif** | Parcours d'entraînements personnalisés par candidat, généré à partir des notions d'un atelier. |
| **Section** | Groupe de notions au sein d'un programme éducatif. |
| **Générateur d'examen** | Outil permettant de créer, gérer et corriger des examens à partir des notions d'un atelier. |
| **Entraînement** | Terme générique pour une session d'apprentissage dans le programme éducatif. Englobe Exercices et Activités. |
| **Exercice** | Entraînement au format question/réponse standard. |
| **Activité** | Entraînement au format ludique (V2+). |
| **Utilisateur** | Personne physique ayant un compte sur l'application. |
| **Membre** | Utilisateur appartenant à un atelier. |
| **Candidat** | Membre d'un atelier sans droits de gestion (rôle apprenant). |
| **Gestionnaire** | Membre d'un atelier avec droits de gestion étendus (rang entre candidat et propriétaire — voir `.claude/rules/server-architecture.md` pour le modèle `owner`/`manager`/`member`). |
| **Propriétaire** | Gestionnaire créateur de l'atelier. Droits maximaux. Un seul par atelier. |
| **Tag** | Identifiant unique d'un utilisateur. Format Crockford-like (alphabet sans caractères ambigus), 8 caractères aléatoires (ex : `A3K9P2M7`). Généré via `src/lib/tag.ts` (`generateTag`/`TAG_LENGTH`), partagé avec les tags d'atelier. |
| **Goutte d'eau** | Unité d'énergie consommée à chaque nouvelle question dans le programme éducatif (V2). |
| **Jardin** | Représentation visuelle de la progression globale d'un utilisateur (V2). |
| **Plante** | Représentation visuelle de la progression d'un utilisateur dans un atelier spécifique (V2). |
| **Pool** | Groupe de questions dans le générateur d'examen (affiché à l'utilisateur sous le nom « libellé »), utilisé pour structurer la génération d'examens. |
| **Atelier Premium** | Atelier dont l'accès Premium a été activé par le propriétaire (irréversible). Donne un accès Premium à vie à tous ses membres. |
| **Page Examen officiel** | Page publique d'un utilisateur récapitulant ses scores aux examens standardisés (module 2 uniquement). |

---

## Comptes & abonnements

### Niveaux d'abonnement (lié au compte utilisateur)

| Niveau | Prix | Détail |
|---|---|---|
| **Gratuit** | 0€ | Accès de base, énergie limitée, publicités |
| **Premium** | 10€/mois | Énergie illimitée, sans pub, générateur d'examen, échange IA |
| **Premium+** | 25€/mois | Tout Premium + sécurité renforcée examens en ligne, génération de cours |

> **Tarification mobile :** les prix affichés sur App Store / Google Play sont majorés pour absorber les commissions plateformes (taux exact à définir).

**Partage d'abonnement :**
- Premium : partageable avec 2 personnes supplémentaires (+7€/personne/mois)
- Premium+ : partageable avec 3 personnes supplémentaires (+15€/personne/mois)

### Atelier Premium (lié à l'atelier, pas au compte)

Un propriétaire peut activer le statut Premium sur son atelier. C'est une opération **irréversible** — voir la règle absolue correspondante dans `CLAUDE.md` §1 et le détail d'implémentation (trigger DB, mécanisme de test temporaire à retirer avant Stripe) dans `.claude/rules/server-architecture.md`.

**Effets :**
- L'atelier devient définitivement **privé** (le bouton "public" est désactivé et retiré)
- Tous les membres actuels et futurs ont un accès Premium à cet atelier **à vie**, qu'ils aient ou non un abonnement personnel
- Un badge Premium est affiché sur la page de présentation de l'atelier

**Facturation (cible — Stripe non encore intégré, voir `docs/backlog.md`) :**
- Le propriétaire doit enregistrer un moyen de paiement avant d'activer
- Facturation immédiate pour tous les membres présents au moment de l'activation (~3,5€/membre)
- Facturation mensuelle pour chaque nouveau membre qui rejoint l'atelier (~3,5€/membre)
- Si le moyen de paiement est invalide ou absent → l'entrée de nouveaux membres est bloquée jusqu'à régularisation

### Tableau des fonctionnalités par niveau

| Fonctionnalité | Gratuit | Premium | Premium+ |
|---|---|---|---|
| Énergie (gouttes d'eau) | Limitée | Illimitée | Illimitée |
| Publicités | Oui | Non | Non |
| Joker | Via quêtes | 1 aléatoire/jour | 1 au choix/jour |
| Échange avec l'IA (apprentissage) | Non | Oui | Oui |
| Générateur d'examen | Non | Oui | Oui |
| Plantes exclusives | Non | Oui | Oui |
| Sécurité renforcée examens en ligne | Non | Non | Oui |
| Génération de cours (slides animées) | Non | Non | Oui |
| Partage abonnement | Non | +2 pers. | +3 pers. |
| Ateliers loisir Culture disponibles | 5 | 10 | 15 |

---

## Pages & navigation

### Utilisateur non connecté

**Page d'accueil**
- Présentation du produit : claire, concise, visuellement très soignée et moderne
- Objectif : convaincre des professionnels (écoles, entreprises) d'adopter le produit
- Émotions fortes mettant en avant les bénéfices
- Liens vers la page d'abonnement

**Page abonnement**
- Compare les trois niveaux d'abonnement
- Chaque fonctionnalité listée est prévisualisable au clic (modal ou panneau)
- Inclut également la comparaison avec le modèle Atelier Premium

### Utilisateur connecté

**Onboarding (à la création du compte)**
- Guidage progressif de l'utilisateur (style Duolingo)
- Fichiers exemples disponibles pour créer son premier atelier
- **Règle de déverrouillage des fonctionnalités :** les fonctionnalités sont masquées par défaut et révélées au moment où elles deviennent pertinentes, pas après un délai fixe.

**Pas de page d'accueil — entrée directe dans l'atelier** *(révisé le 05/08/2026, chantier de refonte UI)*. La connexion mène directement au dernier atelier travaillé (le plus récent parmi les ateliers possédés puis rejoints), onglet Parcours — jamais à une page d'accueil intermédiaire. Un utilisateur sans atelier atterrit sur `/dashboard` (voir ci-dessous). La navigation entre les ateliers passe par un **sélecteur d'atelier** (chevron à côté du nom de l'atelier courant, dans la barre du haut) plutôt que par une page dédiée.

**Coquille de navigation**
- **Ordinateur** : barre du haut fixe — logo, sélecteur d'atelier, groupe d'onglets d'atelier (Parcours / Examens *(gestionnaires)* / Cours), lien Jardin, lien Profil, cloche de notifications, engrenage (paramètres de l'atelier + menu partage/quitter).
- **Téléphone** : bandeau d'atelier (nom + sélecteur) sous une barre d'onglets fixée en bas d'écran (mêmes destinations qu'en barre du haut).
- Implémentation : `src/components/DashboardHeader.tsx` (coquille + sélecteur), `src/app/[locale]/workshops/[id]/WorkshopClient.tsx` (onglets + bandeau mobile).

**Jardin** (`/garden`) — reste accessible depuis la coquille de navigation, mais n'est plus la page d'accueil.
- Le jardin est **indépendant des ateliers** : atelier = cours où l'on gagne de l'XP ; jardin = lieu où l'on cultive des plantes qui grandissent grâce à l'XP gagné. Les arbres ne sont PAS liés à un atelier.
- **Style « Terra Nil »** : une île de terre fixe (forme immuable) posée dans l'eau, sans ombres. On peint la surface des cases via un inventaire (herbe/chemin/herbe haute/terre/eau-lac/pont), puis on pose des objets (arbres, maison 2×2, montagne 3×3) et des cosmétiques. Mode édition avec déplacer/ranger.
- Implémentation actuelle : `src/app/[locale]/garden/{page.tsx, GardenClient.tsx, gardenEngine.ts}` (SVG isométrique). Mock **localStorage** `culture.garden.v2` ; schéma Supabase jardin + croissance via XP réel restent à créer.
- Visuellement chaleureux et apaisant (nature / lofi) — doit donner envie d'y revenir

**« Mes ateliers » — page secondaire** (`/dashboard`, anciennement page d'accueil ; fusionnée avec la recherche d'atelier). `/search` redirige vers `/dashboard`. Atteignable depuis le sélecteur d'atelier ; sert aussi de repli pour un utilisateur qui n'a encore aucun atelier.
- Affiche les ateliers publics + les ateliers loisir proposés par Culture
- **Ateliers loisir Culture :** créés et maintenus par Culture sur des sujets grand public. Disponibles selon l'abonnement : 5 (gratuit) / 10 (Premium) / 15 (Premium+).
- Chaque atelier affiche une **page de présentation** (« Preview », en modale) : image de couverture, nom, description, propriétaire, nombre de membres, bouton « rejoindre » (envoie une demande d'adhésion — voir « Rejoindre un atelier » ci-dessous) ou « entrer » si déjà membre.
- Le QR code de partage d'un atelier pointe vers `/dashboard?preview=<id>`, qui ouvre automatiquement la Preview.

**Profil utilisateur** *(mise en page arrêtée le 06/08/2026)*
- Avatar personnalisable (personnage en jardinier), composé de PNG via `AvatarComposer` (`src/components/avatar/avatarConfig.ts` + `/profile/avatar`) — source de vérité : `publicMetadata.avatarParts` du compte Clerk (synchronisé sur tous les appareils, pas seulement en local).
- **Bannière rayée** en tête : avatar centré (sans contour), nom en bas à gauche suivi du tag en plus petit (Crockford-like, 8 caractères), bouton « éditer » en haut à droite. « éditer » est le **seul** accès au composeur d'avatar — il n'y a plus de ligne « modifier l'avatar » dans les paramètres. Pas de date d'inscription.
- **Carrousel de 5 statistiques** (série, XP, temps passé, succès, notions maîtrisées) : rangée à défilement horizontal, barre de défilement masquée — les dernières tuiles se découvrent en faisant glisser. ⚠️ **Non fonctionnel** : aucune de ces données n'existe côté serveur, les valeurs sont celles de la maquette, figées (`PLACEHOLDER_STATS`). Même statut que le compteur de gouttes et la cloche de notifications.
- **Encart d'abonnement** : pour un compte gratuit, un encart doré d'upsell (« passe à Smart / débloque tout ton jardin », bouton vers `/pricing`, mention « ton forfait actuel · basique ») ; pour un compte déjà payant, une carte sobre rappelant le forfait réel. ⚠️ Le vocabulaire « Smart »/« basique » vient de la maquette et **ne correspond pas** aux offres Gratuit / Premium / Premium+ de `/pricing` — arbitrage à faire, voir `docs/backlog.md`.
- **Carte « suivi »** → `/profile/analyse` (vue de suivi personnelle, voir plus bas).
- **Paramètres** : notifications *(non fonctionnel)*, langue, aide & contact, se déconnecter. La ligne « langue » ouvre un menu court (français / english) qui navigue vers la même page dans l'autre locale ; la préférence est ensuite persistée sur le compte par `DashboardHeader` (`publicMetadata.locale`, source de vérité pour la langue des emails).
- **Barre du haut** : la page profil garde le sélecteur d'atelier et le groupe d'onglets, alimentés par le **dernier atelier visité** (`getLastVisitedWorkshop`) puisque son URL n'en porte aucun. Le Jardin et le tableau de bord gardent une barre nue.
- Accès à la page Examen officiel (module 2)

**Page sociale** *(V2)*
- Permet d'ajouter d'autres utilisateurs en amis via leur tag

**Page Examen officiel** *(module 2 — V3+)*
- Esthétique très professionnelle
- Récapitule tous les examens standardisés officiels passés par l'utilisateur
- Partageable publiquement via lien et/ou QR code
- API disponible pour des applications tierces
- Les pastilles « Triche » sont visibles ici et contestables
- Identité officielle obligatoirement rattachée au compte

---

## Module 1 — Générateur pédagogique

### Cycle de vie d'un atelier

**Création**
1. L'utilisateur crée un atelier (nom, description, image de couverture)
2. Il dépose des fichiers sources (PDF en V1 — autres formats en V2+)
3. L'IA décompose les fichiers en notions
4. L'IA organise automatiquement les notions en sections et génère le programme éducatif
5. Le gestionnaire peut modifier les notions et l'organisation manuellement

**Rejoindre un atelier**
- Tous les ateliers sont **toujours privés** : on les rejoint via une **demande d'adhésion** validée par un gestionnaire/propriétaire (accepter/refuser), ou sur invitation directe (réservée aux ateliers Premium — voir plus bas). Il n'existe plus de notion public/privé ni de limites de candidats (total/mensuel) — ces quotas seront gérés par les structures via l'API (V3).
- Via l'outil de recherche en entrant le tag de l'atelier
- QR code disponible, pointe vers la Preview (`/dashboard?preview=`)
- À l'entrée dans l'atelier : le candidat choisit la plante qu'il va cultiver (étape ignorable)

### Paramètres d'un atelier (accessibles aux gestionnaires)

| Paramètre | Détail |
|---|---|
| Demandes d'adhésion | Un gestionnaire/propriétaire accepte ou refuse chaque demande. |
| Afficher / cacher le programme éducatif | Pour les candidats |
| Inviter un utilisateur | Devient membre candidat directement (sans demande). **Réservé aux ateliers Premium.** |
| Exclure un membre | Uniquement de rang inférieur au gestionnaire qui exclut (candidat < gestionnaire < propriétaire) |
| Changer le rang d'un membre | Promouvoir : rang ≤ au sien / Rétrograder : rang < au sien |
| QR code | Redirige vers l'atelier (Preview `?preview=`). Rejoindre passe toujours par une demande validée. |
| Passer Premium | **Irréversible.** |
| Donner la propriété | Uniquement le propriétaire. Il perd son statut de propriétaire. *(non implémenté à ce jour)* |
| Supprimer l'atelier | Uniquement le propriétaire. |

### Notions

- Générées par l'IA à partir des fichiers sources de l'atelier, ou ajoutées à la main
- Chaque notion n'a qu'**un texte** : l'idée en une phrase, 280 caractères au plus. Il sert de libellé partout ailleurs (liaison aux questions, parcours). Le titre et le contenu détaillé séparés ont fusionné le 19/08/2026 — la liste n'affichait que le titre, la description ne se lisait qu'en rouvrant le formulaire
- Une notion peut être rattachée à un **chapitre** — le rattachement est optionnel, les notions non rangées apparaissent sous « sans chapitre »
- Pas de niveau de difficulté ni d'importance (décision du 19/07/2026, remplace la spécification initiale)
- CRUD manuel réservé au propriétaire et aux gestionnaires, dans Paramètres → Notions
- La qualité des notions dépend de la qualité des fichiers déposés — pas de filtrage côté application.

**Maîtrise d'une notion — Taxonomie de Bloom**

Le niveau de maîtrise d'une notion par un utilisateur se mesure sur les niveaux de Bloom (1 mémoriser, 2 comprendre, 3 appliquer, 4 analyser, 5 évaluer, 6 créer) : on veut pouvoir distinguer un candidat qui a seulement mémorisé une notion de celui qui sait la critiquer. La table `brick_mastery` (utilisateur × notion — table encore nommée `bricks` en base, voir `CLAUDE.md` §1) porte un **score de 0 à 40** : 10 points par niveau atteint, 4 niveaux utiles. `bloom_level` en est la valeur dérivée (`floor(score/10)`, plafonné à 4), conservée pour le module Analyse. Alimentée depuis le 06/08/2026 par les bonnes réponses du parcours — voir « Mécanique de progression » ci-dessous et `src/lib/workshops/mastery.ts`.

### Chapitres

- Un chapitre appartient à un atelier et regroupe des notions
- Ordre d'affichage **réorganisable à la main** (colonne `position`), qui détermine l'ordre des pots dans le programme éducatif
- Gérés depuis Paramètres → Notions (création, renommage, réorganisation, suppression), réservés au propriétaire et aux gestionnaires
- Supprimer un chapitre **ne supprime pas ses notions** : elles retombent dans « sans chapitre »
- Un chapitre = un pot dans l'onglet Programme éducatif. Le nombre de pots suit donc directement le nombre de chapitres, et un atelier sans chapitre affiche un programme vide.
- **Chapitre caché** (29/08/2026) : un import IA qui vide un chapitre l'écarte au lieu de le supprimer — c'est le seul geste qui pose cet état, l'interface n'offre pas de bouton « cacher ». Un chapitre caché **sort entièrement du parcours** : pas de pot, pas d'exercice (y compris par lien direct), aucun tirage, aucune recharge automatique, et ses notions ne comptent plus dans la barre d'avancement de l'atelier — comme les notions sans chapitre. **Côté gestion il reste entier** : visible sous les chapitres visibles dans Paramètres → Notions avec son bouton « restaurer » (unique geste humain sur cet état), et toujours proposé dans la liste des questions du parcours, pour qu'on puisse retrouver ses questions sans avoir à le restaurer d'abord.

### Programme éducatif

**Structure**
- Personnalisé pour chaque candidat, organisé en **chapitres** (groupes de notions)
- Un pot par chapitre, dans l'ordre défini par le gestionnaire
- La plante de chaque pot reste enroulée sur elle-même : le « chemin » d'exercices dépliable a été retiré le 19/07/2026 (il reposait sur des exercices factices). Le bouton « lancer un exercice » de chaque pot ouvre la page d'exercice du chapitre.
- **Barres de progression** (06/08/2026) : une sous le nom de l'atelier avec son pourcentage, et une par ligne de la liste des chapitres. Elles montrent la progression du **membre connecté** — voir « Mécanique de progression ».
- **Bloc central = raccourci, pas indicateur** : le bloc « chapitre en cours » au milieu de la page ne porte **pas** de barre de progression — c'est un simple raccourci vers le chapitre en cours (le premier par position). L'avancement de ce chapitre se lit dans la liste du bas, qui contient **tous** les chapitres, chapitre en cours compris.
- Le bouton « liste des questions du parcours » (gestionnaires) est ancré en haut à droite de la zone, hors de la colonne de contenu, pour ne pas mordre sur les noms d'atelier longs.

**Questions du parcours**

Un bouton « questions du parcours », en haut de l'onglet (gestionnaires uniquement), ouvre la vue de gestion de ces questions. Elles sont stockées dans la **même table que la banque du générateur d'examen** (`exam_questions`), distinguées par la colonne `context` (`'exam'` / `'parcours'`), et éditées avec le même éditeur de question. Les deux surfaces restent étanches : la banque d'examen ne montre que `context = 'exam'`, la vue parcours que `context = 'parcours'`. Les pools (étiquettes) sont en revanche partagés entre les deux.

**Niveau de Bloom et notions couvertes (toutes les questions)**

Toute question — parcours **et** banque d'examen — porte :

- un **niveau de Bloom visé par notion** (1 mémoriser → 4 analyser), porté par le lien question ↔ notion (`exam_question_item_bricks.bloom_level`) et **non par la question** depuis le 28/08/2026 : une même question peut faire *restituer* une notion de contexte et faire *analyser* celle qui est réellement en jeu. Un lien sans niveau se lit comme « mémoriser ». À ne pas confondre avec `brick_mastery.bloom_level`, qui mesure le niveau *atteint* par un candidat ; celui-ci est le niveau *visé*.
- zéro à N **notions** (table de jonction `exam_question_bricks` — encore nommée `bricks` en base, voir `CLAUDE.md` §1 —, `on delete cascade` des deux côtés : supprimer une notion détache les questions, supprimer une question retire ses liens). Aucune restriction de chapitre — une question peut mobiliser des notions de plusieurs chapitres.

Les deux se saisissent dans l'éditeur de question, section « Options par question ».

Une question de parcours **n'a pas de chapitre à elle** : elle hérite de ceux des **notions qu'elle mobilise** (19/08/2026 — remplace `exam_questions.chapter_id` et son sélecteur par ligne). C'était déjà la règle du filtre « chapitre » de la banque d'examen ; c'est maintenant aussi celle du tirage. Trois conséquences : une question posée sur des notions de deux chapitres est tirable dans les deux ; une question sans notion — ou dont aucune notion n'est rangée — n'est jamais tirée ; et ranger une notion dans un chapitre suffit à y faire entrer toutes les questions qui la mobilisent.

La **liste des questions du parcours** est celle de la banque d'examen (même composant, `QuestionListView`) : recherche, tri, panneau de filtres (type de réponse, statut, chapitre) et cartes identiques. Deux différences, faute d'objet : ni libellés (ce sont les étiquettes de la banque), ni examens (une question de parcours n'appartient à aucun examen).

**Exercice (page candidat)**

`/{locale}/workshops/{id}/exercise/{chapterId}`, ouverte par le bouton du pot et accessible à **tout membre**. Elle enchaîne des questions choisies pour CE membre, affiche l'énoncé et une zone de réponse, puis la correction après validation :

- **QCS / QCM** → choix cliquables, correction automatique (bonne/mauvaise réponse, bonnes options mises en évidence).
- **Autres types de réponse** (texte, dessin, fichier…) → saisie libre, pas de verdict automatique : la validation affiche seulement la réponse attendue.

**Une grappe se pose une question à la fois** *(règle arrêtée le 30/08/2026)*

Une question qui porte des questions liées ne s'affiche plus en entier. Seule la **première** est posée ; on répond, on valide, **elle seule est corrigée**, et sa correction s'affiche. « Suivant » fait alors apparaître la deuxième **sous** la première, qui reste visible avec sa correction — jamais un écran vierge, jamais une correction qui disparaît. Ainsi de suite jusqu'au bout de la grappe, puis on passe à la question suivante de l'exercice.

L'énoncé en cours est posé à même le fond, les énoncés déjà corrigés prennent une carte : c'est le repère « ce qui est fait / ce qui reste ». L'image et l'audio, communs à la grappe, restent affichés avec la question principale et ne sont jamais répétés.

**Une question liée est une question entière.** Les questions d'une grappe sont **inséparables** — elles se tirent et se posent ensemble, jamais l'une sans les autres — mais aucune n'est un morceau d'une autre, la première comprise : elle compte dans le « question X sur N » comme les suivantes. Chacune vaut donc pour elle-même :

- **sa goutte** — une bonne réponse, une goutte, quelle que soit sa place dans la grappe ;
- **sa part du budget de Bloom** — la barre avance à chaque question validée, du coût de cette question-là. Le coût de la grappe ENTIÈRE est en revanche réservé dès le tirage : on doit savoir ce qu'elle vaut avant de l'engager, sinon on dépasserait les douze niveaux en cours de route ;
- **son XP**, le jour où il existera (règle du 29/08/2026, rien n'est encore implémenté côté serveur) ;
- **sa maîtrise** — les notions d'une question liée juste progressent même si la principale est ratée ;
- **son rythme de réponse** — les trois secondes de la détection de réponses expédiées se comptent par question, jamais sur la grappe : cinq questions bâclées à la suite doivent se voir comme cinq fautes.

Deux choses restent à l'échelle de la grappe, et pour la même raison — ses questions sont inséparables : la **trace « déjà posée »** (elle s'écrit dès la première question validée, la grappe est alors consommée, même si le membre s'arrête là) et le **tirage de la question suivante**, déclenché à la fin de la grappe et non à chacune de ses questions.

**Ce que vaut un exercice : 12 niveaux de Bloom, pas 12 questions** *(règles arrêtées le 29/08/2026, implémentées dans `src/lib/workshops/parcoursDraw.ts`)*

- Un **énoncé coûte le plus haut niveau qu'il demande** (le maximum sur ses notions) ; une **grappe coûte la somme de ses énoncés**, puisque tous sont posés (un à la fois depuis le 30/08/2026, mais toujours d'une seule traite). Un exercice, c'est donc douze énoncés « mémoriser », ou un « analyser » + deux « appliquer » + deux « mémoriser », ou cinq questions difficiles. La barre du haut avance en pourcentage du budget consommé, jamais en nombre de questions : personne ne sait d'avance combien il y en aura.
- **Portée : jamais plus de deux niveaux au-dessus de ce qui est atteint.** Un membre qui a atteint le niveau N sur une notion travaille le N+1 ; on accepte donc jusqu'à N+2. La règle vaut pour **chaque notion de chaque énoncé** de la grappe — une seule notion hors de portée l'écarte entière. Exemple : sur une notion jamais travaillée (niveau 0), seules les questions « mémoriser » et « comprendre » sont tirables.
- **Priorité à la notion la moins maîtrisée** du chapitre, tirage au hasard entre les candidats à égalité.
- **Une question répondue ne revient jamais** (table `parcours_asked`). Une question **vue puis abandonnée reste disponible** : ne pas y répondre ne mesure rien, la brûler pour autant serait du gâchis (règle révisée le 29/08/2026 — l'enregistrement se fait à la correction, pas au tirage).
- **La question suivante est tirée pendant la lecture de la correction**, jamais toutes au lancement : le choix tient compte de la progression qui vient d'avoir lieu, et le clic sur « question suivante » n'attend rien.
- **Plus rien à poser → l'exercice s'arrête.** En cours d'exercice, l'écran de fin s'affiche normalement. Au lancement, deux impasses bien distinctes : un chapitre **sans aucune question** dit qu'un gestionnaire doit en créer ; un chapitre dont **rien n'est encore à portée** (ou dont tout a déjà été répondu) répond « rien à te proposer ici pour l'instant » — le membre n'y est pour rien et personne n'est mis en cause. Le second cas est une anomalie que la recharge automatique doit empêcher : elle est signalée côté serveur (voir `docs/backlog.md`), jamais à l'écran.
- **XP** *(règle arrêtée le 29/08/2026, pas encore implémentée — aucun XP n'existe côté serveur)* : une question rapporte un XP proportionnel à son niveau de Bloom. Un « appliquer » (3) rapporte trois fois un « mémoriser » (1).
- **Deux questions d'avance.** Au lancement, deux questions sont tirées : la première s'affiche, la seconde attend. À chaque validation, une de plus est tirée — le temps de lire la correction *puis* de traiter la question suivante suffit largement à la préparer. Un membre qui ne lit aucune correction n'attend donc jamais. Le budget est réservé au tirage et non à la réponse : deux questions d'avance ne peuvent pas faire dépasser les 12 niveaux.

**Le radar et la recharge automatique** *(règles arrêtées le 29/08/2026 ; la mesure est implémentée — `parcours_radar` en base et `src/lib/workshops/parcoursRadar.ts` —, la génération reste à faire)*

- **Un « couple » = une notion et un niveau de Bloom** (« la photosynthèse au niveau appliquer »). C'est l'unité de stock, parce que c'est l'unité de ce qu'on sait demander à l'IA.
- **Le stock se compte membre par membre**, jamais pour l'atelier : « disponible » veut dire *jamais posée à CE membre* et *entièrement à sa portée*. Deux membres du même atelier n'ont donc pas le même stock devant eux.
- **Une question ne compte pour un couple que si la grappe entière est à portée.** Une question qui vise « notion 1, niveau 2 » ne compte pas pour ce couple si elle mobilise par ailleurs une notion hors d'atteinte du membre : elle se tire en entier, donc elle est indisponible en entier. C'est ce point qui interdit de compter question par question.
- **On ne compte qu'à la frontière** : les niveaux qu'il reste à conquérir sur chaque notion, du niveau atteint + 1 jusqu'à la portée (+ 2), plafonnés à 4. Un niveau déjà acquis n'a pas besoin d'être réapprovisionné.
- **Déclenchement : un seul couple à 1 ou 0 question disponible suffit. La recharge remet alors TOUS les couples du chapitre à 4** — un déclenchement remet tout au propre, sinon on rechargerait un exercice sur deux.
- **Le radar tourne au lancement d'un exercice, pour le membre qui le lance** (et sur son chapitre). Mesurer le membre le plus démuni de l'atelier remplirait le stock de quelqu'un d'autre et laisserait celui qui a la page ouverte sans question ; la recharge qu'il déclenche profite ensuite à tous, les questions créées étant neuves pour tout le monde. La base sait aussi balayer un atelier entier — ça servira le jour où l'on préparera le stock à l'avance plutôt qu'à l'ouverture d'un exercice.
- **Ce que la recharge fait produire** : une question centrée sur le couple en manque. Les autres notions qu'elle mobilise restent déclarées honnêtement (on ne demande pas à l'IA de les cacher), mais **aucune à un niveau supérieur à celui de la notion principale** — sans quoi la question créée pour combler un manque serait elle-même indisponible. Si le modèle dépasse quand même le plafond, la question est **conservée** (c'est du contenu valide) : elle ne compte simplement pas pour le couple visé, et le radar redemandera. Aucune pression à mentir, aucun rejet.

**Demander des questions à l'IA : une seule forme, trois façons de la remplir** *(arrêté le 29/08/2026)*

Une demande est **une liste de couples (notion × niveau) avec un nombre pour chacun**. Ce qui change d'un cas à l'autre, ce n'est pas la demande, c'est qui la remplit :

| Qui remplit | Quand | Ce qui est demandé |
|---|---|---|
| Le programme | Chapitre neuf ou mis à jour | **25 questions de niveau 1**, réparties sur les notions du chapitre — de quoi tenir deux exercices. L'existant est retranché : un second passage n'en rajoute pas 25. |
| Le radar | Lancement d'un exercice | Les couples sous le seuil, remontés à 4. |
| Un gestionnaire | Bouton « générer des questions » | Rien de calculé : une consigne libre ne dit rien du stock de chaque notion, donc on envoie toutes les notions du chapitre et **c'est le modèle qui choisit**. |

⚠️ **Changement de volumétrie** : jusqu'au 29/08/2026, un import visait **12 questions par notion** (8 de niveau 1, 4 de niveau 2), soit 240 pour un chapitre de 20 notions. C'est désormais **25 par chapitre**. Les niveaux supérieurs et les notions restées vides ne sont plus produits d'avance : la recharge les pourvoit quand un membre les atteint réellement.

**Garde-fous de la recharge** — c'est le seul appel payant que personne ne décide : un **plafond** de 60 questions par recharge (ce qui reste en manque sera repris au lancement suivant), un **délai de garde** de 10 minutes par chapitre (deux exercices coup sur coup ne rechargent qu'une fois), et une **trace** — chaque recharge ouvre un lot d'import comme n'importe quelle génération, donc son coût est compté et son contenu reste annulable. Elle part **après** que la question est partie à l'écran : le membre n'attend jamais après elle, et elle survit à la fermeture de l'onglet.

**Répondre au hasard** *(29/08/2026)*

Une question répondue est consommée, juste ou fausse : quelques minutes de clics au hasard vident un chapitre et déclenchent une recharge payante pour rien. Remettre les mauvaises réponses au tirage a été **écarté** — ça donnerait le moyen d'aller vite pour se faire montrer toutes les réponses, puis de repasser en les connaissant.

La règle compte **les fautes expédiées**, pas un score comparé au hasard : une réponse rédigée, un dessin, un dépôt de fichier n'ont pas de probabilité de réussite, et « proche du hasard » n'aurait voulu dire quelque chose que pour un QCM.

- **3 mauvaises réponses d'affilée, chacune en moins de 3 secondes** → un message, affiché avec la correction. Rien n'est empêché.
- **2 de plus dans le même état** (5 d'affilée) → **l'exercice se ferme**, en pause 5 minutes. Il ne s'interrompt pas sur un mur : ce qui a été fait est enregistré, l'écran de fin s'affiche avec le retour au parcours, et le membre va faire autre chose. Tant que le compte tourne, l'onglet Programme n'invite plus à en relancer un — le bouton du chapitre en cours et les lignes de chapitres sont éteints, avec la raison en infobulle — et le tirage refuserait de toute façon. Le temps repart de la dernière réponse, donc s'entêter repousse d'autant.
- **Recharger la page n'y change rien** : la pause se déduit des réponses enregistrées, pas d'un compte à rebours du navigateur. Fermer l'onglet, changer d'appareil ou se reconnecter donnent le même résultat.
- **Portage mobile** : le refus vient du **serveur** (le tirage de la question suivante), donc il s'appliquera tel quel à l'app. Ce que l'app devra fournir, et qu'elle seule peut fournir : le **temps d'affichage de la question** (le serveur ne peut pas le mesurer, voir plus bas) et l'écran de pause. Sans le premier, la règle ne se déclenche jamais — elle ne se voit pas casser, elle se tait.
- Une bonne réponse, une réponse posée, ou une réponse que rien ne permet de corriger automatiquement **remet le compteur à zéro**. Conséquence assumée : on ne repère pas quelqu'un qui expédierait uniquement des questions ouvertes — mieux vaut le laisser passer que mettre en pause quelqu'un dont on ignore s'il avait raison.
- La pause **ne se stocke pas** : elle se déduit de la date de la dernière réponse. Rien à écrire, rien à nettoyer, rien qui puisse rester coincé.

Le temps est mesuré **par l'écran** et non par le serveur : depuis les deux questions d'avance, une question est tirée bien avant d'être affichée, et le chronomètre du serveur laisserait donc passer un cliqueur. Le message d'avertissement s'affiche sur l'écran de la question **déjà corrigée**, donc le temps de le lire n'entre jamais dans le chronomètre de la suivante. C'est falsifiable, et c'est assumé — on vise le membre qui se disperse, pas le tricheur.

Sécurité : le client ne reçoit **jamais** `answer` ni `correctChoices` au tirage — le serveur renvoie un `ExercisePrompt` épuré et calcule la correction (`gradeExercise`). Les options peuvent donc être mélangées côté serveur sans mémoriser de permutation, chaque option portant son index d'origine. Un membre qui soumet n'importe quoi peut obtenir la réponse : c'est assumé pour un parcours d'entraînement individuel, contrairement à un examen noté.

**Options par section**

| Option | Valeurs possibles |
|---|---|
| Accessibilité | Débloquée immédiatement / Après X% de la section précédente / Manuellement par un gestionnaire |
| Introduction | Cours/présentation uploadé par un gestionnaire OU généré automatiquement (Premium+) |
| Examen final | Créé via le générateur d'examen, automatiquement ou manuellement (Premium+) |

**Mécanique de progression**

*Modèle arrêté le 06/08/2026, implémenté dans `src/lib/workshops/mastery.ts`.*

Chaque question porte un niveau de Bloom visé dont on tire une **cible** `T = 10 × min(bloom, 4)`. Une bonne réponse rapproche le score de la notion de cette cible, sans jamais la dépasser :

```
gain = floor( min( T − score , (T − score) × 0,4 + 1,5 ) )   si score < T, sinon 0
```

C'est un **rattrapage exponentiel plafonné**. Le terme proportionnel fait qu'une question difficile rapporte beaucoup quand on part de bas (13 points à score 0 pour une cible 30) et plus rien une fois dépassée ; le bonus fixe garantit qu'on atteint la cible en un nombre fini de réponses (3 pour une cible 10, 5 pour une cible 30) au lieu de s'en approcher indéfiniment. Le `floor` garde des scores entiers.

- Une **mauvaise réponse ne retire rien** : le score est monotone, une notion travaillée ne régresse jamais. Idem pour les questions sans correction automatique (texte libre, dessin, fichier) : `correct: null`, donc score inchangé.
- Le **plafond par cible** est structurant : une question « mémoriser » ne peut pas prouver qu'on sait analyser. Un chapitre qui n'a que des questions de Bloom 1 plafonne ses notions à 10 points, donc à 33 % d'avancement.
- Une question n'alimente que les notions qui lui sont **explicitement reliées** (`exam_question_bricks`). Une question sans notion reliée ne fait progresser aucune barre.
- Une notion **sans chapitre ne compte dans aucune barre**, pas même celle de l'atelier (19/08/2026). Aucun exercice ne peut la faire progresser — le tirage se fait par chapitre et elle n'a pas de pot — donc la compter revenait à plafonner la barre de l'atelier sous 100 % sans que le membre puisse voir ce qui manque. « Sans chapitre » est un sas de gestion (notion créée à la volée, chapitre supprimé, ingestion IA), pas encore du programme.
- Même règle, même raison, pour les notions d'un **chapitre caché** (29/08/2026) : le chapitre étant sorti du parcours, aucun exercice ne peut plus les faire progresser.
- **Avancement affiché** — calculé sur le score exact, pas sur le niveau, et saturé à 30 (les 3 premiers niveaux valent 100 %, le 4e est du bonus) : notion = `min(score, 30) / 30`, chapitre = `Σ min(score, 30) / (30 × nombre de notions)`, atelier = même formule, mais **seulement sur les notions rangées dans un chapitre**.
- Chaque **nouvelle question** (hors réitération) consomme **1 goutte d'eau** *(V2 — l'énergie n'existe pas encore, le compteur de la barre du haut affiche une valeur fixe)*
- Les gouttes d'eau se regagnent : avec le temps / en quantité aléatoire après un nombre aléatoire de questions *(V2)*
- Une question ratée est **réposée** jusqu'à être réussie *(non implémenté — le tirage est uniforme dans le chapitre)*
- Affichage de la bonne réponse : utiliser la réponse de l'utilisateur corrigée et complétée des éléments manquants (pas une réponse modèle générique)
- **Échange avec l'IA** disponible en cours d'apprentissage pour poser des questions ou obtenir des explications (Premium — V2)
- Dans les ateliers Premium : un gestionnaire peut **valider manuellement** une section pour un candidat (V2)

**Taxonomie de Bloom** *(objectif — faisabilité technique à valider en V2)*

| Niveau | Ce que l'apprenant fait | Exemple de question |
|---|---|---|
| Remember | Mémoriser | QCM "quelle est la définition de X" |
| Understand | Reformuler | "Explique X avec tes propres mots" |
| Apply | Utiliser dans un cas | "Résous ce problème avec X" |
| Analyze | Décomposer | "Pourquoi X fonctionne-t-il ainsi ?" |
| Evaluate | Juger, critiquer | "Cette approche est-elle correcte ?" |
| Create | Produire quelque chose de nouveau | "Conçois X à partir de rien" |

**Types d'entraînements**

*Exercices (format standard — MVP) :*
- Question / Réponse
- Flashcard (réponse orale)
- Fill in the blank
- Matching
- Trier dans l'ordre

*Activités (format ludique — V2+) :*
- Des personnages parlent et l'apprenant doit interrompre et corriger les erreurs
- Un personnage fait une prestation à qui on doit souffler les réponses
- Un animateur pose des questions et l'apprenant envoie un SMS pour participer
- Jeux télévisés (ex : Qui veut gagner des millions, 100% logique…)
- Batailles de connaissances (ping-pong d'éléments face à l'IA, ex : marques)

### Générateur d'examen *(Premium — gestionnaires uniquement)*

**Création des questions**
1. Via l'IA à partir des fichiers de l'atelier
2. Manuellement par un gestionnaire
3. Automatiquement à partir d'un examen existant partagé par un gestionnaire

Chaque question est associée à une réponse. Une même question peut appartenir à plusieurs pools (« libellés » dans l'UI). Les questions générées automatiquement n'ont pas de libellé par défaut.

**Questions liées.** Une question peut en porter d'autres, dites **liées** (`parts` dans le modèle et en base). Une question liée est une **question à part entière** — même formulaire, même menu de types de réponse, mêmes réglages de type, son propre barème, ses propres attendus, ses propres notions et son propre niveau de Bloom. Seuls trois éléments restent **communs** à toute la grappe, saisis une seule fois sur la question principale : l'**image**, l'**audio** et les **libellés**. Sur la copie comme dans l'éditeur, les questions liées sont numérotées à plat (1., 2., 3. — pas de 1.a/1.b) et séparées par un simple filet, sans encadré. Elles suivent toujours leur question principale : elles ne sont ni tirées, ni déplacées, ni supprimées séparément.

**Modèle.** Ce que l'utilisateur manipule est donc un **groupe** — les éléments communs, puis une liste de questions (au moins une). C'est aussi la forme exposée à l'extérieur : le type `QuestionGroup` (`src/lib/workshops/questionGroup.ts`), `{ image, audio, labels, questions: [...] }`, est le contrat de la génération par IA et d'une future API — aucun cas particulier pour la première question. En base, `exam_questions` porte le groupe et `exam_question_items` porte chaque question (`sort_order` 0 = principale), les notions couvertes étant reliées à la question et non au groupe.

**Options par question**

| Option | Détail |
|---|---|
| Libellés (pools) | Créer des groupes de questions [base : off] |
| Difficulté | Annoter la difficulté de la question, réglable par partie [base : off] |
| Édition d'images | Les images/graphiques joints peuvent être édités via un outil basique |
| Discussion IA | Discuter avec l'IA pour générer ou retravailler des questions spécifiques |
| Durée | Durée allouée à cette question, réglable par partie (uniquement pour les examens projetés) [base : off] |

**Type de question :** toujours textuel — une question peut porter en plus une image et/ou un audio en pièce jointe, indépendamment l'un de l'autre (pas un type exclusif). Voir `QuestionMedia` dans `src/lib/workshops/examTypes.ts`.

**Types de réponse :** Sans réponse `[base]` / QCS / QCM / Textuelle (avec option « réponse libre / sans correction ») / Liste / Tableau / Matching / Dessin (fond blanc ou calque) / Fichier (dépôt, y compris un fichier audio)

**Mode de réponse** (paramètres avancés, exclusifs l'un de l'autre) : une question peut demander que la réponse soit donnée **à la voix** (« réponse orale » — textuelle, liste, paire) ou **sur l'image de la question** (« répondre sur l'image » — dessin, liste ; proposé seulement si une image est jointe). Les deux ne concernent **que les versions en ligne** (examen passé en ligne, parcours) : la feuille A4 les ignore. À ce jour ils ne font qu'identifier la question — le branchement réel, et le format d'une réponse orale, sont au backlog.

**Génération d'examens**
Un gestionnaire génère autant d'examens que souhaité, organisés en sections, à partir des questions de la banque. Les examens générés sont modifiables librement dans un éditeur avec aperçu A4 en direct.

**Options par examen**

| Option | Valeur par défaut |
|---|---|
| Titre | Saisi manuellement (pas de génération IA à ce jour) |
| Identité candidat demandée | Nom, Prénom, Tag, Classe + champs personnalisés |
| Nombre de sections | Libre, réorganisables par glisser-déposer |
| Pondération des questions | Points, points négatifs (configurable), question éliminatoire (configurable) — par examen, pas par question (un même pool de questions peut être pondéré différemment selon l'examen) |
| Durée de l'examen | Calculée à partir de la durée par question |
| Créneau horaire | N/A |
| Sections de connaissance à valider | N/A (Premium) |
| QR code + lien | Disponible pour les examens en ligne et projetés *(non implémenté à ce jour)* |

**Modes de passage :** Export PDF / impression / Examen en ligne / Examen projeté / Intégré au programme éducatif *(seul l'aperçu A4 existe à ce jour — export/passage réel non implémenté)*

### Correction

Une correction est automatiquement liée à chaque examen, construite à partir des réponses associées aux questions. Si une question n'a pas de réponse associée → l'application propose d'en générer une via l'IA.

**Examen papier :**
- La correction sert d'aide à la correction manuelle
- Scan des copies → correction automatique *(V2+)*
- Les résultats peuvent être retravaillés manuellement
- Questions ouvertes / dessins : pondérés et justifiés par l'IA
- Commentaire constructif annoté sur chaque copie
- Statistiques globales partagées aux gestionnaires

**Examen en ligne :**
- Si les résultats ne sont pas partagés instantanément → la correction peut être retravaillée
- Questions ouvertes / dessins : pondérés et justifiés par l'IA
- Commentaire constructif annoté sur chaque copie
- Statistiques globales partagées aux gestionnaires

Les examens et corrections sont associés au membre qui les a passés (association manuelle possible pour les examens papier).

### Examen en ligne — Niveaux de sécurité

*Disponible pour tous les membres (selon leur abonnement) :*
- Blocage du copier/coller
- Blocage du changement d'onglet
- Capture vidéo de l'écran

*Premium+ uniquement :*
- Utilisation de la caméra
- Utilisation du micro
- Blocage du téléphone via l'application
- Utilisation d'une caméra secondaire (téléphone) pour filmer l'environnement

### Examen projeté *(type Kahoot — V2)*

Questions affichées une par une sur un écran partagé. Options : afficher la réponse / afficher les statistiques de réponses / afficher un classement (points ; égalité → temps de réponse global).

### Analyse *(V2)*

**Périmètre révisé le 05/08/2026** (chantier de refonte UI) : l'Analyse n'est plus un onglet par atelier réservé aux gestionnaires, mais une **vue de suivi personnelle rattachée au profil** (`/profile/analyse`), indépendante de tout atelier ou rôle — accessible à tout utilisateur via la carte « suivi » de `/profile`. Actuellement un état vide « V2 » (titre + badge, aucune donnée) ; le contenu ci-dessous reste la cible fonctionnelle à spécifier plus précisément le moment venu (portée multi-ateliers à définir) :

- Ensemble des notes obtenues par chaque membre avec leurs coefficients
- Moyenne des notes par membre
- Avancement de l'état des connaissances par membre
- Export au format CSV

### Génération de cours *(Premium+, gestionnaires — V2)*

- Slides animées convertibles en PDF
- Générées à partir des notions de l'atelier
- Générées par l'IA, modifiables manuellement

---

## Gamification *(V2+)*

> La gamification **n'a aucun impact sur le contenu pédagogique**. Elle améliore uniquement l'engagement et la rétention.

### Personnages
~20 personnages aux caractères variés (le blasé, le colérique, le timide, le peureux, l'intello, le sportif, le riche prétentieux, celui qui met des tunnels, le branleur…). Âges variés pour une population représentative.

### Jardin
Représentation visuelle de la progression globale. Tailles progressives : **Balcon → Jardin → Ferme**. Cliquer sur une plante → ouvre l'atelier associé.

### Plantes
- Choisie par le candidat à l'entrée dans un atelier (étape ignorable)
- Grandit visuellement au fur et à mesure de la progression (5-8 étapes visuelles)
- Si aucun entraînement pendant **3 mois** → la plante pourrit
- Pour la raviver : faire un entraînement OU déclencher une animation d'arrosage (simple, gratuite)

### Série / Flamme
Système de flamme/soleil (série de jours consécutifs). Jokers : 1 via quêtes (gratuit) / 1 aléatoire/jour (Premium) / 1 au choix/jour (Premium+).

### Notifications intelligentes
Volume adaptatif selon le comportement de l'utilisateur. Notifications animées. Logo dynamique personnalisé selon l'heure, la saison, les actions récentes.

### Social
Ajout d'amis via le tag. Les abonnements partagés créent une dynamique sociale.

---

## Module 2 — Examens standardisés *(V3+ — idéation, non prioritaire)*

> Les spécifications ci-dessous sont des orientations, pas des spécifications finales.

Sessions d'examens standardisés dans des **centres certifiés**. Chaque examen est unique (questions tirées aléatoirement d'une banque). Correction intégrale par l'IA. Seul un **score global** communiqué — aucune correction partagée.

**Format :** 2h / Textuel, texte à trou, analyse d'image ou graphique / QCS, QCM, réponse ouverte courte, réponse ouverte longue.

**Anti-triche :** copies toutes différentes, enregistrement vidéo 360°, analyse IA des comportements suspects, pastille "TRICHE" sur la page publique, système de lanceurs d'alerte anonymes, minimum 25 candidats par session.

**Post-examen :** score global uniquement, page publique partageable, API tierce, contestation payante.

**Banque de questions :** créée par l'IA à partir des cours du module 1, relue et validée par des professionnels.
