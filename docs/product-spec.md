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
1. **Générateur pédagogique** — upload de fichiers → briques de connaissance → programme éducatif personnalisé + générateur d'examens
2. **Examens standardisés** — certification officielle (développement prévu à partir de la V3, non prioritaire pour le MVP)

---

## Périmètre MVP (V1 — web uniquement)

### Dans le MVP

| Fonctionnalité | Notes |
|---|---|
| Création de compte et authentification | — |
| Upload de fichiers PDF | Un ou plusieurs fichiers par atelier |
| Décomposition en briques de connaissance | Via IA. Briques modifiables manuellement. |
| Génération de questions | Via IA. Types : QCM, réponse ouverte, fill in the blank, matching, trier dans l'ordre. |
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
| **Brique de connaissance** | Unité minimale d'information extraite d'un fichier source par l'IA. Possède un niveau de difficulté, un niveau d'importance et une position chronologique. |
| **Programme éducatif** | Parcours d'entraînements personnalisés par candidat, généré à partir des briques d'un atelier. |
| **Section** | Groupe de briques de connaissance au sein d'un programme éducatif. |
| **Générateur d'examen** | Outil permettant de créer, gérer et corriger des examens à partir des briques d'un atelier. |
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

**Home page = Jardin** (`/garden`) — page principale après connexion, cible du logo Culture
- Le jardin est **indépendant des ateliers** : atelier = cours où l'on gagne de l'XP ; jardin = lieu où l'on cultive des plantes qui grandissent grâce à l'XP gagné. Les arbres ne sont PAS liés à un atelier.
- **Style « Terra Nil »** : une île de terre fixe (forme immuable) posée dans l'eau, sans ombres. On peint la surface des cases via un inventaire (herbe/chemin/herbe haute/terre/eau-lac/pont), puis on pose des objets (arbres, maison 2×2, montagne 3×3) et des cosmétiques. Mode édition avec déplacer/ranger.
- Implémentation actuelle : `src/app/[locale]/garden/{page.tsx, GardenClient.tsx, gardenEngine.ts}` (SVG isométrique). Mock **localStorage** `culture.garden.v2` ; schéma Supabase jardin + croissance via XP réel restent à créer.
- Donne accès à : recherche d'atelier, profil, paramètres, toutes les autres fonctionnalités
- Visuellement chaleureux et apaisant (nature / lofi) — doit donner envie d'y revenir

**Recherche d'atelier** — fusionnée dans `/dashboard` (mes ateliers + recherche + Preview d'atelier). `/search` redirige vers `/dashboard`.
- Affiche les ateliers publics + les ateliers loisir proposés par Culture
- **Ateliers loisir Culture :** créés et maintenus par Culture sur des sujets grand public. Disponibles selon l'abonnement : 5 (gratuit) / 10 (Premium) / 15 (Premium+).
- Chaque atelier affiche une **page de présentation** (« Preview », en modale) : image de couverture, nom, description, propriétaire, nombre de membres, bouton « rejoindre » (envoie une demande d'adhésion — voir « Rejoindre un atelier » ci-dessous) ou « entrer » si déjà membre.
- Le QR code de partage d'un atelier pointe vers `/dashboard?preview=<id>`, qui ouvre automatiquement la Preview.

**Profil utilisateur**
- Avatar personnalisable (personnage en jardinier), composé de PNG via `AvatarComposer` (`src/components/avatar/avatarConfig.ts` + `/profile/avatar`) — source de vérité : `publicMetadata.avatarParts` du compte Clerk (synchronisé sur tous les appareils, pas seulement en local).
- Affiche le tag de l'utilisateur (Crockford-like, 8 caractères)
- Accès à la page abonnement (avec l'abonnement actuel mis en avant)
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
3. L'IA décompose les fichiers en briques de connaissance
4. L'IA organise automatiquement les briques en sections et génère le programme éducatif
5. Le gestionnaire peut modifier les briques et l'organisation manuellement

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

### Briques de connaissance

- Générées par l'IA à partir des fichiers sources de l'atelier
- Chaque brique possède : un **niveau de difficulté**, un **niveau d'importance**, une **position chronologique**
- Accessibles et modifiables manuellement par les gestionnaires, et via échange avec l'IA
- La qualité des briques dépend de la qualité des fichiers déposés — pas de filtrage côté application.

### Programme éducatif

**Structure**
- Personnalisé pour chaque candidat, organisé en **sections** (groupes de briques)
- Organisation automatique par l'IA, modifiable manuellement par un gestionnaire

**Options par section**

| Option | Valeurs possibles |
|---|---|
| Accessibilité | Débloquée immédiatement / Après X% de la section précédente / Manuellement par un gestionnaire |
| Introduction | Cours/présentation uploadé par un gestionnaire OU généré automatiquement (Premium+) |
| Examen final | Créé via le générateur d'examen, automatiquement ou manuellement (Premium+) |

**Mécanique de progression**

- Chaque **nouvelle question** (hors réitération) consomme **1 goutte d'eau**
- Les gouttes d'eau se regagnent : avec le temps / en quantité aléatoire après un nombre aléatoire de questions
- Score d'une brique : +X pour une réponse réussie / -X pour une réponse ratée (score minimum = 0)
- Une question ratée est **réposée** jusqu'à être réussie — seule la première tentative affecte le score
- À partir d'un seuil de score défini : la brique est marquée **acquise**
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

Chaque question est associée à une réponse. Une même question peut appartenir à plusieurs pools (« libellés » dans l'UI). Les questions générées automatiquement n'ont pas de libellé par défaut. Une question peut être composée de plusieurs **parties** indépendantes (énoncé/type de réponse/réponse propres à chacune).

**Options par question**

| Option | Détail |
|---|---|
| Libellés (pools) | Créer des groupes de questions [base : off] |
| Difficulté | Annoter la difficulté de la question, réglable par partie [base : off] |
| Édition d'images | Les images/graphiques joints peuvent être édités via un outil basique |
| Discussion IA | Discuter avec l'IA pour générer ou retravailler des questions spécifiques |
| Durée | Durée allouée à cette question, réglable par partie (uniquement pour les examens projetés) [base : off] |

**Types de question :** Textuel `[base]` / Visuel (image, graphique) / Audio

**Types de réponse :** Sans réponse `[base]` / QCS / QCM / Textuelle (avec option « réponse libre / sans correction ») / Dessin (fond blanc ou calque) / Audio / Sondage (sans correction) / Fill in the blank / Matching / Trier dans l'ordre

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

### Analyse *(gestionnaires uniquement)*

- Ensemble des notes obtenues par chaque membre avec leurs coefficients
- Moyenne des notes par membre
- Avancement de l'état des connaissances par membre
- Export au format CSV *(V2)*

### Génération de cours *(Premium+, gestionnaires — V2)*

- Slides animées convertibles en PDF
- Générées à partir des briques de connaissance de l'atelier
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
