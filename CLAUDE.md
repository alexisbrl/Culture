# Culture — Guide Claude Code

> Ce fichier est l'unique source de vérité pour tout développement sur ce projet. Il doit être lu intégralement à chaque nouvelle conversation.
> **Toute modification structurante apportée au projet (stack, structure, conventions, décisions produit) doit être reflétée ici.**
>
> Dernière mise à jour : 14/06/2026

---

## 1. RÈGLES ABSOLUES

### Ne jamais halluciner
Si tu n'es pas certain d'une information (API, comportement d'une lib, structure d'un fichier), **cherche dans le code ou dans la doc** plutôt que d'inventer. Si tu ne sais pas, dis-le explicitement.

### Poser des questions avant d'exécuter
Avant de commencer toute tâche non triviale, identifie les ambiguïtés et pose tes questions de clarification. N'exécute pas sans avoir compris l'intention précise. Une question posée en amont vaut mieux que 30 minutes de travail à refaire.

### MVP uniquement
Ne pas développer de fonctionnalités hors-MVP avant que le MVP soit stable et validé. Se référer au périmètre MVP en section 10.

### API-first
Chaque domaine fonctionnel expose une API interne propre (profil, atelier, programme, examen…). Pas de logique directement couplée à l'UI.

### Web-first
Toute fonctionnalité est développée et validée sur web avant d'être portée sur iOS/Android.

### Formats de fichiers
PDF en priorité pour la V1. Les autres formats (Word, PowerPoint, audio, vidéo…) sont prévus en V2+.

### Irréversibilité du passage Premium d'un atelier
Cette opération ne doit jamais pouvoir être annulée, quelle que soit la situation.

### Mettre à jour ce fichier
À la fin de chaque grosse tâche (nouvelle feature déployée, PR mergée, refactor structurant), mettre à jour ce CLAUDE.md si la structure, la stack, les conventions ou les spécifications produit ont évolué. Taguer la modification `[MODIFIÉ PAR CLAUDE - JJ/MM/AAAA]`.

---

## 2. CONTEXTE PROJET

**Nom :** Culture (nom de travail — nom produit final : à confirmer)
**Type :** Application SaaS d'apprentissage — générateur pédagogique avec IA
**Plateforme :** Web en premier (iOS/Android hors MVP)
**Repo GitHub :** https://github.com/alexisbrl/Culture
**Lancer le dev :** `npm run dev` depuis ce dossier

### Notion
Tu as accès à Notion via le connecteur MCP. Le projet Culture y est documenté en détail. Tu peux t'y référer pour tout contexte supplémentaire qui ne figurerait pas dans ce fichier.

Pages hors-projet à ne pas consulter :
- La forêt : https://www.notion.so/La-for-t-15da3125fd1242bbbee95c23834ead17
- Studio de jeux vidéo : https://www.notion.so/Studio-de-jeux-vid-o-8599a9b58baf4e008a85edcc1af4fef7
- Pabet : https://www.notion.so/Pabet-041b7081972849bb907364b0e28f3514
- Jetpack : https://www.notion.so/Jetpack-9720d05e572441a982c06f1df1980553
- Le jardin : https://www.notion.so/Le-jardin-afe88eddd9994c90af48b591f7162cc4

---

## 3. STACK TECHNIQUE

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) |
| Langage | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Typographie | Inter Tight (corps) × Caveat (accents manuscrits) — utilitaire `.font-script` |
| Auth | Clerk (`@clerk/nextjs`) |
| Base de données | Supabase (`@supabase/supabase-js`) |
| UI | shadcn/ui + Base UI (`@base-ui/react`) |
| Icônes | Lucide React |
| Forms | React Hook Form + Zod |
| i18n | next-intl (FR + EN) |
| Email | Resend |
| Tests E2E | Playwright (à installer) |
| Tests unitaires | Vitest (à installer — pour les grosses modifications avant PR) |

> **Important Next.js 16 :** Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.js — cette version a des breaking changes par rapport aux connaissances d'entraînement. Respecter les avertissements de dépréciation.

---

## 4. STRUCTURE DU PROJET

```
culture/
├── src/
│   ├── app/
│   │   ├── [locale]/           # Routes i18n (next-intl)
│   │   │   ├── about/
│   │   │   ├── contact/
│   │   │   ├── create/         # Création d'atelier (dépôt fichiers + identité + visibilité) [MODIFIÉ PAR CLAUDE - 31/05/2026]
│   │   │   ├── dashboard/       # = page Recherche fusionnée : mes ateliers + recherche + Preview d'atelier [MODIFIÉ PAR CLAUDE - 13/06/2026]
│   │   │   ├── garden/          # Jardin « Terra Nil » — page principale (logo Culture) [MODIFIÉ PAR CLAUDE - 31/05/2026]
│   │   │   ├── legal/
│   │   │   ├── pricing/
│   │   │   ├── profile/
│   │   │   ├── search/         # Redirige vers /dashboard (fusionné) [MODIFIÉ PAR CLAUDE - 13/06/2026]
│   │   │   ├── sign-in/
│   │   │   ├── sign-up/
│   │   │   ├── workshops/       # + [id]/session = session d'exercice (QCM) ; QR de partage → /dashboard?preview=ID [MODIFIÉ PAR CLAUDE - 13/06/2026]
│   │   │   └── layout.tsx
│   │   ├── actions/            # Server actions
│   │   ├── api/                # API routes (API-first)
│   │   │   ├── contact/
│   │   │   └── waitlist/
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/             # Composants React réutilisables
│   │   ├── ui/                 # Composants shadcn/ui
│   │   ├── sections/           # Sections de page
│   │   └── [autres composants]
│   ├── lib/
│   │   ├── supabase.ts         # Client Supabase
│   │   └── utils.ts            # Utilitaires partagés
│   ├── i18n/                   # Config next-intl
│   └── middleware.ts           # Auth + i18n middleware (Clerk + next-intl)
├── messages/
│   ├── fr.json                 # Traductions françaises
│   └── en.json                 # Traductions anglaises
├── tests/
│   ├── e2e/                    # Tests Playwright
│   └── unit/                   # Tests Vitest
├── public/                     # Assets statiques
├── .env.local                  # Variables d'env (non commité)
├── .env.local.example          # Template des variables d'env
└── CLAUDE.md                   # Ce fichier
```

---

## 5. CONVENTIONS DE NOMMAGE

### Fichiers et dossiers
- **Composants React :** PascalCase → `WorkshopCard.tsx`
- **Pages, routes, utilitaires :** kebab-case → `workshop-card.ts`, `sign-in/`
- **Server actions :** camelCase + suffixe `Action` → `createWorkshopAction.ts`
- **API routes :** dossiers kebab-case dans `app/api/` → `app/api/workshop/route.ts`

### Code TypeScript
- **Variables et fonctions :** camelCase → `workshopName`, `fetchWorkshops()`
- **Types et interfaces :** PascalCase → `WorkshopData`, `UserProfile`
- **Constantes globales :** SCREAMING_SNAKE_CASE → `MAX_FILE_SIZE`
- **Composants :** PascalCase → `WorkshopCard`

### Traductions (next-intl)
- Tout texte affiché à l'utilisateur passe par next-intl — jamais de string hardcodée dans un composant.
- Clés i18n en camelCase imbriqué : `workshop.create.title`, `auth.signIn.button`

---

## 6. GIT & GITHUB

**Repo :** https://github.com/alexisbrl/Culture
**Branche principale :** `main`

### Règles
- **Ne jamais committer directement sur `main`**
- Toujours travailler sur une branche dédiée
- Committer après chaque feature complète avec un message descriptif
- Merger via Pull Request sur GitHub

### Convention de nommage des branches

```
feat/nom-court        # Nouvelle fonctionnalité
fix/nom-court         # Correction de bug
chore/nom-court       # Tâche technique (deps, config, refactor)
```

Exemples :
- `feat/workshop-creation`
- `feat/knowledge-bricks-generation`
- `fix/auth-redirect-signin`
- `chore/add-playwright`

### Format des commits (Conventional Commits)

```
feat: ajouter la création d'atelier
fix: corriger la redirection après sign-in
chore: installer Playwright
```

### Workflow type
```bash
git checkout -b feat/nom-feature
# ... développement + commits fréquents ...
git push origin feat/nom-feature
# Créer une PR sur GitHub
```

---

## 7. TESTS

### En cours de développement (chaque feature)
Utiliser **Playwright E2E** pour valider le comportement UI de chaque feature développée. Claude doit lancer les tests et vérifier que ça passe avant de considérer une tâche terminée.

```bash
npx playwright test
npx playwright test --headed   # avec navigateur visible
```

### Avant une Pull Request (grosses modifications)
Lancer **Vitest (unit) + Playwright (E2E)** — les deux suites doivent passer avant de créer la PR.

```bash
npm run test:unit    # Vitest
npm run test:e2e     # Playwright
```

### Claude in Chrome
L'extension Claude in Chrome est activée. Claude peut l'utiliser pour ouvrir l'application dans un navigateur, tester l'UI et itérer jusqu'à ce que le rendu soit correct. À utiliser systématiquement pour valider le rendu visuel avant de considérer une feature terminée.

---

## 8. VARIABLES D'ENVIRONNEMENT

Se référer à `.env.local.example` pour la liste complète. Ne jamais committer `.env.local`.

Variables clés :
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Auth
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Database
- `RESEND_API_KEY` — Email

---

## 9. CAHIER DES CHARGES — VUE D'ENSEMBLE

**Nom de travail :** Cutlure
**Plateformes :** Web / iOS / Android — **Web développé en premier**, iOS et Android après validation web (hors MVP)
**Architecture :** **API-first** obligatoire dès la V1. Chaque domaine fonctionnel expose une API interne propre.

**Deux modules principaux :**
1. **Générateur pédagogique** — upload de fichiers → briques de connaissance → programme éducatif personnalisé + générateur d'examens
2. **Examens standardisés** — certification officielle (développement prévu à partir de la V3, non prioritaire pour le MVP)

---

## 10. PÉRIMÈTRE MVP (V1 — WEB UNIQUEMENT)

### Dans le MVP

| Fonctionnalité | Notes |
|---|---|
| Création de compte et authentification | — |
| Upload de fichiers PDF | Un ou plusieurs fichiers par atelier |
| Décomposition en briques de connaissance | Via IA. Briques modifiables manuellement. |
| Génération de questions | Via IA. Types : QCM, réponse ouverte, fill in the blank, matching, trier dans l'ordre. |
| Parcours d'apprentissage séquencé | Enchaînement d'exercices sans gamification visuelle |
| Gestion d'un atelier | Public/privé, rôles gestionnaire/candidat, paramètres de base |
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

## 11. LEXIQUE

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
| **Gestionnaire** | Membre d'un atelier avec droits de gestion étendus. |
| **Propriétaire** | Gestionnaire créateur de l'atelier. Droits maximaux. Un seul par atelier. |
| **Tag** | Identifiant unique d'un utilisateur. Format : Crockford Base32, 7-8 caractères aléatoires (ex : `A3K9P2M`). |
| **Goutte d'eau** | Unité d'énergie consommée à chaque nouvelle question dans le programme éducatif (V2). |
| **Jardin** | Représentation visuelle de la progression globale d'un utilisateur (V2). |
| **Plante** | Représentation visuelle de la progression d'un utilisateur dans un atelier spécifique (V2). |
| **Pool** | Groupe de questions dans le générateur d'examen, utilisé pour structurer la génération d'examens. |
| **Atelier Premium** | Atelier dont l'accès Premium a été activé par le propriétaire (irréversible). Donne un accès Premium à vie à tous ses membres. |
| **Page Examen officiel** | Page publique d'un utilisateur récapitulant ses scores aux examens standardisés (module 2 uniquement). |

---

## 12. COMPTES & ABONNEMENTS

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

Un propriétaire peut activer le statut Premium sur son atelier. C'est une opération **irréversible**.

**Effets :**
- L'atelier devient définitivement **privé** (le bouton "public" est désactivé et retiré)
- Tous les membres actuels et futurs ont un accès Premium à cet atelier **à vie**, qu'ils aient ou non un abonnement personnel
- Un badge Premium est affiché sur la page de présentation de l'atelier

**Facturation :**
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

## 13. PAGES & NAVIGATION

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
- **Le jardin est indépendant des ateliers** [MODIFIÉ PAR CLAUDE - 31/05/2026] : atelier = cours où l'on gagne de l'XP ; jardin = lieu où l'on cultive des plantes qui grandissent grâce à l'XP gagné. Les arbres ne sont PAS liés à un atelier.
- **Style « Terra Nil »** : une **île de terre fixe** (forme immuable) posée dans l'**eau** (la mer est le fond par défaut), sans ombres. On ne modifie pas le contour de l'île ; on **peint la surface** des cases via un inventaire (herbe par défaut / chemin / herbe haute / terre / eau-lac / pont). On pose ensuite des objets (arbres, maison 2×2, montagne 3×3) et des cosmétiques. Mode édition avec déplacer/ranger.
- Implémentation : `src/app/[locale]/garden/{page.tsx, GardenClient.tsx, gardenEngine.ts}` (SVG isométrique). Mock **localStorage** `culture.garden.v2` ; schéma Supabase jardin + croissance via XP réel à créer ultérieurement.
- Donne accès à : recherche d'atelier, profil, paramètres, toutes les autres fonctionnalités
- Visuellement chaleureux et apaisant (nature / lofi) — doit donner envie d'y revenir

**Recherche d'atelier**
- Accessible via une icône sur la Home page (recouvre partiellement la page)
- Affiche les ateliers publics + les ateliers loisir proposés par Culture
- **Ateliers loisir Culture :** créés et maintenus par Culture sur des sujets grand public. Disponibles selon l'abonnement : 5 (gratuit) / 10 (Premium) / 15 (Premium+).
- Chaque atelier affiche une **page de présentation** : image de couverture, nom, description, propriétaire, bouton "Rejoindre"

**Profil utilisateur**
- Avatar personnalisable (personnage en jardinier)
- Affiche le tag de l'utilisateur (Crockford Base32, 7-8 caractères)
- Accès à la page abonnement (avec l'abonnement actuel mis en avant)
- Accès à la page Examen officiel (module 2)

**Page sociale** *(V2)*
- Permet d'ajouter d'autres utilisateurs en amis via leur tag

**Page Examen officiel** *(module 2 — V3+)*
- Esthétique très professionnelle
- Récapitule tous les examens standardisés officiels passés par l'utilisateur
- Partageable publiquement via lien et/ou QR code
- API disponible pour des applications tierces
- Les pastilles "Triche" sont visibles ici et contestables
- Identité officielle obligatoirement rattachée au compte

---

## 14. MODULE 1 — GÉNÉRATEUR PÉDAGOGIQUE

### Cycle de vie d'un atelier

**Création**
1. L'utilisateur crée un atelier (nom, description, image de couverture)
2. Il dépose des fichiers sources (PDF en V1 — autres formats en V2+)
3. L'IA décompose les fichiers en briques de connaissance
4. L'IA organise automatiquement les briques en sections et génère le programme éducatif
5. Le gestionnaire peut modifier les briques et l'organisation manuellement

**Rejoindre un atelier**
- Via l'outil de recherche en entrant le tag de l'atelier
- Atelier public → accès immédiat
- Atelier privé → demande d'adhésion → le gestionnaire accepte ou refuse
- QR code disponible (avec ou sans bypass de validation pour les ateliers privés)
- À l'entrée dans l'atelier : le candidat choisit la plante qu'il va cultiver (étape ignorable)

### Paramètres d'un atelier (accessibles aux gestionnaires)

| Paramètre | Détail |
|---|---|
| Public / Privé | Visibilité de l'atelier |
| Nombre max de candidats total | Limite globale |
| Nombre max de candidats mensuel | Limite par mois |
| Afficher / cacher le programme éducatif | Pour les candidats |
| Inviter un utilisateur | Devient membre candidat. **Réservé aux ateliers Premium** [MODIFIÉ PAR CLAUDE - 13/06/2026] — voir section 17 « Atelier Premium — implémentation ». |
| Exclure un membre | Uniquement de rang inférieur au gestionnaire qui exclut (candidat < gestionnaire < propriétaire) |
| Changer le rang d'un membre | Promouvoir : rang ≤ au sien / Rétrograder : rang < au sien |
| QR code | Redirige vers l'atelier. Option : avec ou sans bypass de validation (atelier privé) |
| Passer Premium | **Irréversible.** Voir section 12 et section 17 « Atelier Premium — implémentation ». |
| Donner la propriété | Uniquement le propriétaire. Il perd son statut de propriétaire. |
| Supprimer l'atelier | Uniquement le propriétaire. |

### Briques de connaissance

- Générées par l'IA à partir des fichiers sources de l'atelier
- Chaque brique possède : un **niveau de difficulté**, un **niveau d'importance**, une **position chronologique**
- Accessibles et modifiables manuellement par les gestionnaires
- Modifiables via échange avec l'IA
- La qualité des briques dépend de la qualité des fichiers déposés — pas de filtrage côté application.

### Programme éducatif

**Structure**
- Personnalisé pour chaque candidat
- Organisé en **sections** (groupes de briques)
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

Chaque question est associée à une réponse. Une même question peut appartenir à plusieurs pools. Les questions générées automatiquement n'ont pas de libellé par défaut.

**Options par question**

| Option | Détail |
|---|---|
| Lier des questions | Les questions liées sortent toujours ensemble dans l'ordre dans un examen |
| Pools | Créer des groupes de questions (libellés) [base : off] |
| Difficulté | Annoter la difficulté de la question [base : off] |
| Édition d'images | Les images/graphiques joints peuvent être édités via un outil basique |
| Discussion IA | Discuter avec l'IA pour générer ou retravailler des questions spécifiques |
| Durée | Durée allouée à cette question (uniquement pour les examens projetés) [base : off] |

**Types de question :** Textuel `[base]` / Visuel (image, graphique) / Audio

**Types de réponse :** Sans réponse `[base]` / QCS / QCM / Textuelle / Dessin (fond blanc ou calque) / Audio / Sondage (sans correction) / Fill in the blank / Matching / Trier dans l'ordre

**Génération d'examens**
Un gestionnaire génère autant d'examens que souhaité à partir de combinaisons de pools. Les examens générés sont modifiables librement.

**Options par examen**

| Option | Valeur par défaut |
|---|---|
| Titre | Généré par l'IA |
| Identité candidat demandée | Nom, Prénom, Tag |
| Nombre de sections | 3 |
| Difficulté moyenne | 5/10 |
| Pondération des questions | Générée par l'IA |
| Points négatifs | Non (configurable) |
| Questions éliminatoires | Non (configurable) |
| Durée de l'examen | 2h |
| Créneau horaire | N/A |
| Sections de connaissance à valider | N/A (Premium) |
| QR code + lien | Disponible pour les examens en ligne et projetés |

**Modes de passage :** Export PDF / impression / Examen en ligne / Examen projeté / Intégré au programme éducatif

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

## 15. GAMIFICATION *(V2+)*

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

## 16. MODULE 2 — EXAMENS STANDARDISÉS *(V3+ — idéation, non prioritaire)*

> Les spécifications ci-dessous sont des orientations, pas des spécifications finales.

Sessions d'examens standardisés dans des **centres certifiés**. Chaque examen est unique (questions tirées aléatoirement d'une banque). Correction intégrale par l'IA. Seul un **score global** communiqué — aucune correction partagée.

**Format :** 2h / Textuel, texte à trou, analyse d'image ou graphique / QCS, QCM, réponse ouverte courte, réponse ouverte longue.

**Anti-triche :** copies toutes différentes, enregistrement vidéo 360°, analyse IA des comportements suspects, pastille "TRICHE" sur la page publique, système de lanceurs d'alerte anonymes, minimum 25 candidats par session.

**Post-examen :** score global uniquement, page publique partageable, API tierce, contestation payante.

**Banque de questions :** créée par l'IA à partir des cours du module 1, relue et validée par des professionnels.

---

## 17. DESIGN & IDENTITÉ VISUELLE

| Élément | Spécification |
|---|---|
| **Nom de marque** | **Culture** (le nom « Evalia » a été retiré de l'app le 31/05/2026) |
| **Logo** | Un germe/arbre vert (SVG) + mot « Culture » en noir. Symbolise la croissance. [MODIFIÉ PAR CLAUDE - 31/05/2026] |
| **Typographie** | Inter Tight (corps) × Caveat (accents manuscrits ambre) |
| **Couleur principale** | Crème `#fcf9f2` / Blanc — fond apaisant |
| **Couleur secondaire** | Vert Culture `#5f8a3f` (profond `#4f6b40`, doux `#7a9968`) — couleur de marque (`--primary`, `gradient-primary`) |
| **Couleur tertiaire** | Ambre/bois `#a87a3a` (accents) · encre `#2d2a24` (texte) |
| **Ton général** | Mix ludique / professionnel. Atmosphère paisible évoquant la nature ou le lofi. |

> **Migration thème en cours** [31/05/2026] : l'app passe du violet (« Evalia ») au vert/crème (« Culture »). Fondations faites (typo, logo, `--primary`, renommage, Dashboard). Pages encore en classes `violet-*` à migrer page par page : Atelier, Profil, Paramètres, Pricing.

> **Dashboard / Recherche / Preview d'atelier** [MODIFIÉ PAR CLAUDE - 13/06/2026] : `/dashboard` est désormais la page unique « mes ateliers + recherche » (thème Culture). `/search` redirige vers `/dashboard`. La barre de recherche, au focus, révèle les « ateliers proposés par Culture » (mock) + résultats de recherche en direct (`searchWorkshops`). Chaque atelier a une **Preview** (modal) : image de couverture (`cover_gradient`, colonnes `description`/`cover_gradient` sur `workshops`, géré via `src/lib/workshopCover.ts` + `updateWorkshopDetails`), description, propriétaire, nombre de membres, et un CTA « entrer dans l'atelier » (membre) ou « rejoindre » (non-membre). Le QR code de partage d'un atelier (`WorkshopClient.tsx`) pointe vers `/dashboard?preview=<id>`, qui ouvre automatiquement la Preview. La route `/workshops/[id]/join` a été supprimée (remplacée par `?preview=`).

> **Tag d'atelier & couverture personnalisée** [MODIFIÉ PAR CLAUDE - 13/06/2026] : chaque atelier a désormais un `unique_tag` (7 caractères, format Crockford-like identique au tag utilisateur, généré et vérifié à la création via `generateUniqueWorkshopTag`). Affiché dans Paramètres → Général, accolé au nom de l'atelier dans une même bulle (`TAG - nom`), sans symbole `#`. La recherche (`searchWorkshops`) matche le nom (`ILIKE`) OU le tag exact (`unique_tag.ilike`). En complément des 4 dégradés de base, le propriétaire peut uploader une image de couverture personnalisée (colonne `cover_image_url`, bucket Supabase Storage public `workshop-covers`, action `uploadWorkshopCover`). Une colonne `cover_image_active` (booléenne) indique si cette image est la couverture active : `cover_image_url` est conservée en base même quand un dégradé est sélectionné, et n'est supprimée (`null`) que via le bouton croix dédié. `src/lib/workshopCover.ts` expose `coverStyleFor(id, gradient, imageUrl, imageActive)` qui renvoie l'image si présente ET active, sinon le dégradé — utilisé partout où une couverture est affichée (Dashboard, recherche, Preview).

> **Page Paramètres d'atelier** [MODIFIÉ PAR CLAUDE - 13/06/2026] : `src/app/[locale]/workshops/[id]/settings/SettingsClient.tsx` — navigation latérale en **4 pages indépendantes** (Général, Membres & rôles, Briques de connaissance, Atelier Premium), une seule affichée à la fois (plus de scroll combiné). « Général » regroupe les anciennes sections Général + Visibilité & accès + Zone de danger. Le QR code de l'atelier (ligne en bas de « Visibilité & accès ») s'ouvre via le composant partagé `src/components/ShareQRModal.tsx` (aussi utilisé sur la page atelier, où le bouton « supprimer » a été retiré — la suppression se fait désormais uniquement via Paramètres → Zone de danger), qui permet de télécharger le QR en PNG.

> **Pattern « modifications non enregistrées »** [MODIFIÉ PAR CLAUDE - 13/06/2026] : sur les pages de formulaire (ex. Paramètres → Général), pas de bouton « enregistrer » permanent. Un état `savedSnapshot` capture les valeurs sauvegardées ; un `isDirty` (comparaison avec l'état courant) déclenche l'affichage d'une barre flottante « enregistrer » (bas-droite) et, au clic sur le lien retour, l'ouverture d'une **modale personnalisée** « Modifications non enregistrées » (au design system du projet : carte blanche `borderRadius: 20`, icône d'avertissement, titre/description centrés, 3 actions — « Enregistrer et quitter » / « Annuler » / « Quitter sans enregistrer ») si des modifications sont en cours. `updateWorkshopDetails` accepte désormais aussi `name`. À réutiliser pour les futurs formulaires (ex. paramètres de profil).
>
> **Détection générique des modifications + interception de toute navigation** [MODIFIÉ PAR CLAUDE - 14/06/2026] : dans `SettingsClient.tsx`, tous les champs éditables des sections « Général » et « Visibilité & accès » (nom, description, couverture, emoji, `isPublic`, `showProgramme`, `maxTotal`, `maxMonthly`) sont regroupés dans un objet unique `formValues`, comparé à `savedSnapshot` (même forme) via `JSON.stringify(formValues) !== JSON.stringify(savedSnapshot)` pour calculer `isDirty`. **Pour ajouter un futur champ au formulaire** : (1) ajouter sa clé dans `formValues` (et donc implicitement dans `savedSnapshot`, initialisé avec `useState(formValues)`), (2) l'inclure dans l'objet envoyé à `updateWorkshopDetails` dans `handleSaveDetails` — rien d'autre à modifier, `isDirty` et la barre « enregistrer » suivent automatiquement.
>
> La modale « Modifications non enregistrées » n'est plus déclenchée uniquement par le lien retour de la sidebar : un listener global `document.addEventListener('click', ..., true)` intercepte (capture phase) tout clic sur un `<a>` interne tant que `isDirty` est vrai (sauf clic modifié/molette/`target="_blank"`/ancre `#`), stocke l'URL cible dans `pendingHref`, et ouvre la modale. « Enregistrer et quitter » / « Quitter sans enregistrer » naviguent vers `pendingHref` (ou, si absent, vers la page de l'atelier). Un handler `beforeunload` (ref `isDirtyRef` pour éviter les closures obsolètes) affiche la boîte de dialogue native du navigateur pour la fermeture d'onglet / le rechargement / la saisie d'URL. **Limite connue** : le bouton retour/avant du navigateur (navigation `popstate`) n'est pas intercepté. Ce double mécanisme (listener global + `beforeunload`) est à réutiliser pour les futurs formulaires avec détection de modifications non enregistrées.
>
> **Schéma DB** : colonnes `workshops.show_programme boolean not null default true`, `workshops.max_members_total integer null`, `workshops.max_members_monthly integer null` ajoutées (migration `add_workshop_visibility_settings`). `getWorkshop` les sélectionne désormais ; `updateWorkshopDetails` accepte `showProgramme`, `maxMembersTotal`, `maxMembersMonthly` (un champ vide dans l'UI → `null` = pas de limite).
>
> **Validation minimale (« check des données »)** [MODIFIÉ PAR CLAUDE - 13/06/2026] : pour les champs en texte libre (ex. nom de l'atelier), un booléen `canSave` (ex. `workshopNameInput.trim().length > 0`) bloque l'enregistrement. Le bouton « enregistrer » (composant `SmallBtn`, prop `disabled`) et le bouton « Enregistrer et quitter » de la modale ci-dessus sont grisés/désactivés si `!canSave`, avec un message d'erreur inline (« le nom de l'atelier ne peut pas être vide »). Les champs à choix fixe (dégradés, emoji, switches) n'ont pas besoin de validation — ils ne peuvent pas être dans un état invalide par construction.

> **Curseur global** [MODIFIÉ PAR CLAUDE - 13/06/2026] : `cursor: default` posé sur `body` dans `src/app/globals.css` (`@layer base`), propriété héritée par tous les éléments sans `cursor` propre — corrige l'affichage du curseur texte (I-beam) sur le texte non-éditable partout dans l'app, tout en laissant `input`/`textarea` afficher leur curseur natif et les éléments `cursor-pointer` (liens/boutons) leur curseur main.

> **Atelier Premium — implémentation** [MODIFIÉ PAR CLAUDE - 13/06/2026]
>
> **Schéma DB (migrations Supabase déjà appliquées, projet `hhkmrejjksjpfetwefju`) :**
> - `add_workshop_premium_flag` : ajoute `workshops.is_premium boolean not null default false` et `workshops.premium_activated_at timestamptz null`. Crée un **trigger Postgres** `trg_prevent_workshop_premium_downgrade` (fonction `prevent_workshop_premium_downgrade`) qui lève une erreur si une mise à jour tente de passer `is_premium` de `true` à `false`. Cette garantie est posée **au niveau base de données**, donc valable même via SQL direct ou un futur bug applicatif — c'est la mise en œuvre concrète de la règle absolue « Irréversibilité du passage Premium d'un atelier » (section 1).
> - `add_workshop_private_flag` : ajoute `workshops.private boolean not null default false`. Cette colonne correspond au toggle « Visibilité » (Public/Privé) de Paramètres → Général.
>
> **Toggle « Visibilité » branché sur `workshops.private`** [MODIFIÉ PAR CLAUDE - 13/06/2026] : pour un atelier non-Premium, le `Toggle` privé/public initialise `isPublic` depuis `!workshop.private` (prop `isPrivate` transmise par `getWorkshop` → `page.tsx` → `SettingsClient`). Le changement de toggle rend `isDirty` (inclus dans `savedSnapshot`/comparaison comme les autres champs Général) et est persisté via `updateWorkshopDetails(workshopId, { ..., isPrivate: !isPublic })`, qui suit le même pattern « modifications non enregistrées » / barre flottante « enregistrer ». Côté serveur (`updateWorkshopDetails` dans `src/app/actions/workshops.ts`), si `isPrivate !== undefined`, on relit `is_premium` et on force `private = true` quoi qu'il arrive si l'atelier est déjà Premium — défense en profondeur en complément du verrouillage UI (texte statique « privé », voir ci-dessous).
>
> **Verrouillage de « Visibilité » pour un atelier Premium** : dans `SettingsClient.tsx`, quand `isPremium === true`, la ligne « Visibilité » n'affiche plus le `Toggle` privé/public (pour éviter toute confusion sur le mot « public ») mais un simple texte statique « privé », au même style que « Date de création ». Le hint associé devient « atelier premium · définitivement privé ». Pour un atelier non-premium, le `Toggle` (privé/public) reste affiché normalement.
>
> **Gating « Inviter un utilisateur »** : dans `SettingsClient.tsx`, la section Membres & rôles affiche le formulaire d'invitation (input tag + bouton « inviter ») uniquement si `isPremium === true` (prop dérivée de `workshop.is_premium`, lue par `getWorkshop`). Sinon, un message « disponible pour les ateliers Premium » est affiché à la place. **Important :** cette UI gating n'est PAS une mesure de sécurité — c'est uniquement du confort d'affichage. Le jour où l'action serveur réelle d'invitation par tag sera implémentée, elle DOIT elle-même vérifier `is_premium` côté serveur (via Supabase, jamais faire confiance au client) avant de créer un `workshop_members`.
>
> **Badge Premium sur la Preview (Dashboard)** : `is_premium` est désormais renvoyé par `getUserWorkshops`, `getWorkshopPreview` et `searchWorkshops` (`src/app/actions/workshops.ts`). Dans `DashboardClient.tsx`, `PreviewData.isPremium?: boolean` est alimenté partout où une `PreviewData` est construite (ateliers possédés/rejoints, deep-link `?preview=`, clic sur un résultat de recherche). La modale Preview affiche un badge ambre « Premium » (`background: rgba(232,184,108,0.85)`, `color: #7a4d20`) en haut à gauche, à côté du badge de rôle (propriétaire/membre) s'il est présent.
>
> **Activation Premium — modèle de sécurité (`activateWorkshopPremium` dans `src/app/actions/workshops.ts`)** : action serveur appelée depuis le bouton « activer → » (section Atelier Premium des Paramètres). Couches de protection, dans l'ordre :
> 1. `process.env.NODE_ENV === 'production'` → l'action entière retourne une erreur et ne fait rien. Le mécanisme de test ci-dessous n'existe donc qu'en développement.
> 2. `auth()` (Clerk) → utilisateur authentifié obligatoire.
> 3. Vérification `workshop_members.role === 'owner'` pour cet utilisateur et cet atelier → **seul le propriétaire** peut activer.
> 4. Mot de passe de test comparé à une constante en dur `PREMIUM_TEST_ACTIVATION_PASSWORD = 'CultureMDP'`.
> 5. Si `is_premium` est déjà `true`, retourne un succès sans rien changer (idempotent).
> 6. Sinon, met à jour `is_premium = true`, `premium_activated_at = now()`, **et `private = true`** (le passage Premium force l'atelier en privé, de façon permanente — cohérent avec la règle « L'atelier devient définitivement privé » de la section 12).
> 7. Le trigger DB (`trg_prevent_workshop_premium_downgrade`) garantit qu'aucune requête ultérieure ne pourra repasser `is_premium` à `false`.
>
> **⚠️ MÉCANISME TEMPORAIRE DE TEST — À RETIRER avant mise en production / dès l'intégration Stripe :**
> - Le bouton « activer → » + le champ « Mot de passe d'activation (test) » dans la section Atelier Premium des Paramètres (`SettingsClient.tsx`), ainsi que la modale de confirmation associée, sont du **code de test temporaire**, marqués par des commentaires `[TEST TEMPORAIRE — 13/06/2026]`.
> - Le mot de passe `CultureMDP` est un mot de passe de test en dur, **jamais destiné à la production**.
> - Quand le paiement Stripe sera intégré (voir mémoire « Plan Stripe »), `activateWorkshopPremium` doit être remplacée par un flux où l'activation n'a lieu **qu'après confirmation d'un paiement réel** (webhook Stripe ou équivalent) — supprimer alors : le garde `NODE_ENV`, la constante `PREMIUM_TEST_ACTIVATION_PASSWORD`, le paramètre `password`, et toute l'UI de test (champ mot de passe + bouton « activer →" dans son état actuel).
> - La colonne `is_premium`, `premium_activated_at`, le trigger d'irréversibilité, et le rendu en lecture (badge « ✓ atelier premium ») sont en revanche **définitifs** et doivent être conservés.

> **Outil de création/édition de question (Générateur d'examen)** [AJOUTÉ PAR CLAUDE - 14/06/2026]
>
> Nouveau composant `src/app/[locale]/workshops/[id]/tabs/QuestionEditor.tsx`, ouvert depuis l'onglet « Génération d'examen » (`ExamenTab.tsx`) via le bouton « + nouvelle question » (banque de questions) ou via l'icône crayon « modifier la question » sur une question existante. Couvre l'intégralité du spec de la section 14 « Générateur d'examen » :
> - **Type de question** : Textuel `[base]` / Visuel / Audio (segmented control — Visuel et Audio affichent un placeholder « outil bientôt disponible »)
> - **Type de réponse** (segmented control, 10 valeurs) : Sans réponse `[base]`, QCS, QCM, Textuelle, Dessin, Audio, Sondage, Fill in the blank, Matching, Trier dans l'ordre. Pour QCS/QCM/Sondage/Matching/Ordre, un éditeur de choix dédié (`ChoiceListEditor`) gère l'ajout/suppression/réordonnancement et le marquage des bonnes réponses (cases à cocher) ; pour Matching, chaque « choix » est une paire `"gauche :: droite"`.
> - **Options par question** : Libellés (sélecteur + difficulté/durée — voir ci-dessous), Difficulté `[off par défaut]` (switch + curseur 1-10), Durée `[off par défaut]` (switch + minutes), Discussion IA (placeholder désactivé), Édition d'images (non implémentée — dépend du type Visuel)
>
> **Modèle de données** : type `Question` (exporté par `QuestionEditor.tsx`) — `{ id, questionType, responseType, content, answer, choices, correctChoices, pools, difficulty: {enabled, value}, duration: {enabled, minutes}, linkedQuestionIds }`. État `questions: Question[]` et `pools: Pool[]` désormais portés par `ExamenTab` (avant : mock figé dans le composant). `handleSaveQuestion` met à jour ou préfixe `questions` ; `handleCreatePool` ajoute un pool (id `'pool' + Date.now()`, couleur grise par défaut) et renvoie son id pour sélection immédiate dans l'éditeur.
>
> **Banque de questions** (`BankContent` dans `ExamenTab.tsx`) : chips de filtre par pool avec compteurs dynamiques (`questions.filter(q => q.pools.includes(poolId)).length`), bouton « ✦ générer par IA » (placeholder, non implémenté), `TypePill` (pastille colorée par `ResponseType`) et `answerSummary(q)` qui formate l'affichage de la réponse selon le type (QCM/QCS → choix corrects, Matching → paires `→`, Ordre → séquence fléchée, Sans réponse → message dédié).
>
> **Persistance Supabase de la banque de questions** [MODIFIÉ PAR CLAUDE - 14/06/2026] : remplace le mock en mémoire. Trois tables (migration `add_exam_generator_tables`, projet `hhkmrejjksjpfetwefju`), toutes scopées par `workshop_id` (FK `on delete cascade`), démarrent vides pour chaque atelier (pas de seed/mock) :
> - `exam_pools` (id text PK, workshop_id, name, color, created_at)
> - `exam_questions` (id text PK, workshop_id, question_type, response_type, content, answer, choices/correct_choices/pools/difficulty/duration/linked_question_ids/exam_ids en jsonb, created_at, updated_at)
> - `exam_generated` (id text PK, workshop_id, title, date, q, dur, avg, status, taken, question_ids jsonb, created_at)
>
> Nouveau fichier `src/app/actions/examQuestions.ts` (server actions) : `getExamBankData(workshopId)` charge `{ questions, pools, exams }` en parallèle ; `saveQuestion` / `saveQuestions` (upsert), `createPool` (insert), `deletePool(workshopId, poolId, affectedQuestions)` (upsert des questions affectées puis delete du pool), `saveGeneratedExam` (upsert). Conversion row↔objet via `rowToQuestion`/`questionToRow` (snake_case ↔ camelCase).
>
> `ExamenTab` prend désormais une prop `workshopId: string` (passée depuis `WorkshopClient.tsx`). Au montage, un `useEffect` appelle `getExamBankData(workshopId)` pour initialiser `questions`/`pools`/`exams` (vides par défaut). Chaque handler (`handleSaveQuestion`, `handleCreatePool`, `handleDeletePool`, `handleLinkQuestions`, `handleUnlinkGroup`, génération d'examen) met à jour l'état local de façon optimiste puis appelle la server action correspondante en fire-and-forget (`.catch(console.error)`, pas d'état de chargement/erreur dédié).
>
> **Correctif layout (pré-existant)** [MODIFIÉ PAR CLAUDE - 14/06/2026] : l'onglet « Génération d'examen » ne s'affichait pas du tout (zone vide) à cause d'un bug CSS flexbox — une `height: '100%'` ne se résout pas si le conteneur parent a `height: auto` même si sa hauteur réelle (flex-grow) est définie. Corrigé en passant le conteneur d'onglet (`WorkshopClient.tsx`, div « Tab content ») en `display:'flex', flexDirection:'column'` et la racine de `ExamenTab` en `flex: 1, minHeight: 0` (au lieu de `height: '100%'`). Pattern à réutiliser pour tout futur composant en layout pixel-précis (`ResizeObserver`) placé dans cette zone.
>
> **Renommage Pool → Libellé + sélecteur en liste déroulante** [MODIFIÉ PAR CLAUDE - 14/06/2026] : dans `QuestionEditor.tsx`, le terme affiché à l'utilisateur « Pool » est devenu « Libellé(s) » (le type interne `Pool` et la convention de nommage `pools`/`onCreatePool` sont conservés tels quels — renommage UI uniquement). La section « Libellés » affiche les libellés déjà assignés sous forme de chips retirables (×, via `togglePool`), suivis d'un `<select>` natif listant les libellés non encore assignés + une option `+ nouveau libellé…`. Choisir un libellé existant l'ajoute directement (`togglePool`) ; choisir `+ nouveau libellé…` bascule un état local `creatingPool` qui affiche un mini-formulaire inline (`TextField` + boutons « ajouter » / « annuler ») appelant `addPool()` (qui appelle `onCreatePool`, ajoute l'id à `draft.pools`, puis referme le formulaire).
>
> **Liaison de questions depuis la banque (remplace l'ancien champ « Lier des questions »)** [MODIFIÉ PAR CLAUDE - 14/06/2026] : le champ « Lier des questions » a été retiré de `QuestionEditor.tsx` (ne scalait pas avec beaucoup de questions). À la place, dans `ExamenTab.tsx` → `BankContent` : quand ≥ 2 questions sont cochées dans la banque, une barre apparaît (« N questions sélectionnées » + bouton « 🔗 lier ces questions »). Cliquer ouvre `LinkOrderModal` (nouveau composant), qui liste les questions sélectionnées avec des boutons ▲▼ pour choisir l'ordre d'apparition, puis confirme via « Lier les questions ». `handleLinkQuestions(orderedIds)` (dans `ExamenTab`) assigne `linkedQuestionIds = orderedIds` à chacune des questions concernées.
>
> **Groupe de questions liées affiché en ligne repliable** [MODIFIÉ PAR CLAUDE - 14/06/2026] : dans `BankContent`, les questions liées (`linkedQuestionIds.length > 1`) ne sont plus affichées individuellement avec un badge `🔗 liée X/N` — elles sont regroupées en une seule « ligne-groupe » repliable. Après le filtrage/tri, une étape de regroupement construit `rows: Row[]` (`type Row = { kind: 'single'; q: Question } | { kind: 'group'; ids: string[]; members: Question[] }`) : pour chaque question non encore vue, si `linkedQuestionIds.length > 1` on crée une entrée `group` avec tous les membres (marqués `seen`), sinon une entrée `single`. L'affichage de chaque question (case à cocher, énoncé, `TypePill`, difficulté, libellés, « voir la réponse », icône crayon) est factorisé dans `renderQuestionBody(q, indexBadge?)`, réutilisé pour les lignes simples et pour chaque membre d'un groupe.
> - **Ligne-groupe** (carte ambre, `border: 1px solid rgba(168,122,58,0.30)`) : icône 🔗, énoncé de la première question (tronqué), sous-titre « question liée · N parties », bouton « délier ✕ » (appelle `onUnlinkGroup(row.ids)`), et un toggle « déplier ▾ » / « replier ▴ » piloté par `expandedGroups: Set<string>` (clé = `row.ids.join(',')`, togglée via `toggleExpand(groupKey)`).
> - **Groupe déplié** : affiche chaque membre dans sa propre sous-carte, numérotée `1.`, `2.`, … via `renderQuestionBody(q, i + 1)`.
> - **Délier** : `onUnlinkGroup` est implémenté par `handleUnlinkGroup(ids)` dans `ExamenTab` — met `linkedQuestionIds = []` pour toutes les questions de `ids`, ce qui dissout le groupe et fait réapparaître chaque question comme ligne simple. L'ancien `handleUnlinkQuestion` (délier une question individuellement) a été supprimé, remplacé par ce mécanisme au niveau du groupe.
>
> **Gestion des libellés, tri et filtres avancés dans la banque de questions** [MODIFIÉ PAR CLAUDE - 14/06/2026] : dans `ExamenTab.tsx` → `BankContent` (état désormais local au composant — `filterPools`, `filterTypes`, `filterDiffs`, `sortBy`, `search`, `filterOpen`, `creatingLabel`, `newLabelName`) :
> - **Libellés (ajout/suppression)** : chaque chip de libellé devient multi-sélectionnable (filtre par clic, `filterPools: string[]`) et porte un petit bouton `×` qui appelle `onDeletePool(id)` (nouveau prop, implémenté par `handleDeletePool` dans `ExamenTab` — retire le pool de `pools` et le retire de `q.pools` pour toutes les questions). Le bouton « + libellé » ouvre un mini-formulaire inline (texte + « ajouter »/« annuler », Enter/Escape supportés) qui appelle `onCreatePool` (déjà existant, réutilisé tel quel).
> - **Tri** : le bouton statique « trier · difficulté ▾ » est remplacé par un `<select>` natif à 4 options — `trier · difficulté` (décroissant, questions sans difficulté annotée en dernier), `trier · nom` (alphabétique sur `q.content`), `trier · type` (alphabétique sur `RESPONSE_TYPE_LABELS`), `trier · libellé` (alphabétique sur le nom du premier pool de la question). État `sortBy: SortBy`.
> - **Recherche texte** : la barre « filtrer les questions… » est un `<input>` fonctionnel (`search`, filtre sur `q.content` insensible à la casse).
>
> **Refonte du système de filtres — popover unifié + barre « filtres actifs »** [MODIFIÉ PAR CLAUDE - 14/06/2026] : dans `ExamenTab.tsx` → `BankContent`, l'ancien système (chips de libellés permanentes au-dessus de la liste + popover « filtres » limité à type/difficulté en 3 buckets) est remplacé par un système unifié :
> - **Popover « filtres ▾`(N)`»** (bouton `filterRef` + `filterOpen`) : se ferme désormais au clic extérieur (listener `document.addEventListener('mousedown', ...)` sur `filterRef`, retiré au démontage). Il regroupe 4 catégories multi-sélectionnables, chacune en chips :
>   - **Libellés** : les anciennes chips de pools permanentes ont été déplacées ici (`filterPools: string[]`). Chaque chip porte toujours son bouton `×` de suppression (ouvre la modale de confirmation, voir ci-dessous) et le bouton « + libellé » (création inline) est conservé.
>   - **Type de question** (`filterTypes: ResponseType[]`, inchangé).
>   - **Difficulté** : remplace les 3 buckets `facile`/`moyen`/`difficile` par **5 niveaux** correspondant à l'échelle visuelle déjà utilisée pour afficher la difficulté (`diffDots(v) = Math.ceil(v/2)`, composant `DiffDots`, 5 points pleins/vides). `filterDiffs: number[]` contient les niveaux 1 à 5 sélectionnés indépendamment ; une question matche si `diffDots(q.difficulty.value)` est dans `filterDiffs` (et `difficulty.enabled`).
>   - **Présence en examen** *(nouvelle catégorie, lecture seule)* : liste chaque examen de `exams` (titre) + une valeur spéciale « jamais tombé en examen » (`NEVER_EXAM_ID`). Basée sur le nouveau champ `examIds: string[]` de `Question` (ajouté au type dans `QuestionEditor.tsx` et aux données mock `INITIAL_QUESTIONS`) : une question matche un filtre d'examen si `examIds.includes(examId)`, ou si `examIds.length === 0` pour « jamais tombé en examen ». **Catégorie purement calculée** — l'utilisateur ne peut ni créer ni assigner manuellement ces valeurs, uniquement filtrer. Remplace l'ancien pool manuel `#jamais tombé en examen` (`examQ`), supprimé de `INITIAL_POOLS`.
>   - Bouton **« réinitialiser »** déplacé en haut à droite du header du popover (visible seulement si `activeFilterCount > 0`), vide les 4 catégories (`filterPools`, `filterTypes`, `filterDiffs`, `filterExams`) en un clic.
>   - Toutes les catégories sont combinées en ET entre elles et avec la recherche texte.
> - **Barre « FILTRES ACTIFS »** (visible seulement si `activeFilterCount > 0`, positionnée au-dessus de la liste de questions, avant la barre « N questions sélectionnées ») : affiche tous les filtres actifs (toutes catégories confondues) sous forme de chips sombres `ActiveChip` avec bouton `×` pour retirer individuellement chaque filtre — y compris les libellés, qui ne sont donc plus affichés en permanence hors du popover.
> - **Modale de confirmation de suppression de libellé** : cliquer sur le `×` d'un libellé (dans le popover) ouvre désormais une modale de confirmation (`pendingDeleteLabel`, style carte crème `borderRadius: 20`, icône d'avertissement, titre « Supprimer le libellé « {nom} » ? », message indiquant le nombre de questions affectées + « Cette action est irréversible », boutons « Annuler » / « Supprimer »). Seule la confirmation (`confirmDeleteLabel`) appelle `onDeletePool` ; « Annuler » ferme la modale sans rien changer. Pattern de modale de confirmation à réutiliser pour toute future action destructive dans cet onglet.
>
> **Ajustements UI banque de questions** [MODIFIÉ PAR CLAUDE - 14/06/2026] : la phrase récapitulative « N questions générées depuis M fichiers source · K sélectionnées » au-dessus de la liste a été retirée. Sur chaque chip de libellé (dans le popover « filtres »), le bouton `×` de suppression a été déplacé en badge circulaire positionné en haut à droite de la chip (au lieu d'être inline après le nom).

---

## 18. BACKLOG TECHNIQUE (à traiter plus tard)

- **Nettoyage des utilisateurs supprimés** [AJOUTÉ PAR CLAUDE - 14/06/2026] : `workshops.created_by` et `workshop_members.user_id` stockent l'ID Clerk en texte brut, sans clé étrangère ni cascade. Si un utilisateur ayant créé/rejoint des ateliers est supprimé de Clerk, ses lignes deviennent orphelines (le code retombe sur `'Utilisateur'` pour l'affichage, donc pas de crash, mais atelier "fantôme"). À prévoir : soit un webhook Clerk `user.deleted` qui nettoie/réassigne ces lignes côté Supabase, soit un job de nettoyage manuel.

---

*Dernière mise à jour : 14/06/2026*
