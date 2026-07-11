# Culture — Guide Claude Code

> Ce fichier est l'unique source de vérité pour tout développement sur ce projet. Il doit être lu intégralement à chaque nouvelle conversation.
> **Toute modification structurante apportée au projet (stack, structure, conventions, décisions produit) doit être reflétée ici.**
>
> Dernière mise à jour : 11/07/2026

---

## 1. RÈGLES ABSOLUES

### Ne jamais halluciner
Si tu n'es pas certain d'une information (API, comportement d'une lib, structure d'un fichier), **cherche dans le code ou dans la doc** plutôt que d'inventer. Si tu ne sais pas, dis-le explicitement.

### Poser des questions avant d'exécuter
**Après CHAQUE prompt de l'utilisateur**, avant d'exécuter quoi que ce soit, identifie systématiquement les ambiguïtés. S'il y en a — même mineures — pose tes questions de clarification et attends la réponse avant de commencer. N'exécute jamais sans avoir compris l'intention précise. S'il n'y a vraiment aucune ambiguïté, tu peux exécuter directement. Une question posée en amont vaut mieux que 30 minutes de travail à refaire.

### Icônes : Lucide React uniquement
**Toujours utiliser exclusivement les icônes de `lucide-react`.** Ne jamais créer d'icônes SVG inline custom, ne jamais utiliser d'autres librairies d'icônes (heroicons, react-icons, etc.). Si une icône Lucide ne correspond pas exactement au besoin, utiliser la plus proche ou un emoji texte — jamais du SVG personnalisé.

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

### Migrations de base de données : jamais de destruction avant déploiement du code [AJOUTÉ PAR CLAUDE - 22/06/2026]
La base Supabase (`hhkmrejjksjpfetwefju`) est **partagée par le code local ET le code déployé en production** (scellow.com). Une migration prend effet **immédiatement**, alors qu'un changement de code n'est en ligne qu'après `push → PR → merge dans main → déploiement Vercel`.

**Conséquence — règle de séquencement « expand / contract » :**
- **Ajouter** une colonne/table (expand) : sans danger à tout moment (le code déployé l'ignore).
- **Supprimer ou renommer** une colonne/table, ou changer un type (contract) : **interdit tant que le code déployé en production lit encore cet objet**. Sinon, ses requêtes échouent — et comme beaucoup de `select` ne lisent que `{ data }` en ignorant `{ error }`, l'échec est **silencieux** (`data = null`, pas de log) et casse la fonctionnalité sans alerte.
- Ordre correct pour retirer un champ : (1) déployer le code qui ne l'utilise plus → (2) seulement ensuite, appliquer la migration de suppression.

> **Incident de référence (22/06/2026)** : suppression de `workshops.private` / `max_members_total` / `max_members_monthly` appliquée sur la prod alors que le code déployé (`2774bf5`) les sélectionnait encore dans `getWorkshop` → tous les ateliers cassés en ligne. Correctif : recréation des colonnes (migration `restore_workshop_columns_for_deployed_code`). Voir l'action de suivi au backlog §18.

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

### Lint & CI [AJOUTÉ PAR CLAUDE - 24/06/2026]
- `npm run lint` (= `eslint .`) doit passer **sans erreur** avant tout commit/PR. La config (`eslint.config.mjs`) ignore `.claude/**`, `_handoff/**`, `culture-design-system/**` (maquettes/worktrees locaux). Les règles « React Compiler readiness » (`react-hooks/set-state-in-effect`, `refs`, `immutability`, `purity`) sont volontairement en `warn` (patterns hydration-safe légitimes) : **ne pas les repasser en `error`** sans raison, et ne pas « corriger » un warning hydration en retirant l'effet (cela réintroduit un hydration mismatch).
- `npm run typecheck` (= `tsc --noEmit`) en local ; en CI le typecheck fiable passe par `npm run build` (régénère `next-env.d.ts` + types de routes).
- **CI** : `.github/workflows/ci.yml` (job `lint` sans secret + job `build` avec secrets dépôt). Le job `build` nécessite que les *repository secrets* GitHub soient renseignés (mêmes valeurs que Vercel). Idéalement, protéger `main` en exigeant la CI verte avant merge.

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
| **Tag** | Identifiant unique d'un utilisateur. Format : Crockford-like (alphabet sans caractères ambigus), **8 caractères** aléatoires (ex : `A3K9P2M7`). Généré via `src/lib/tag.ts` (`generateTag` / `TAG_LENGTH`), partagé avec les tags d'atelier. [MODIFIÉ PAR CLAUDE - 22/06/2026] |
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
| Demandes d'adhésion | **[MODIFIÉ PAR CLAUDE - 22/06/2026]** Tous les ateliers sont privés ; on les rejoint via une **demande validée** par un gestionnaire/propriétaire (accepter/refuser), ou sur invitation. La notion public/privé et les limites de candidats (total/mensuel) ont été retirées — les quotas seront gérés par les structures via l'API. |
| Afficher / cacher le programme éducatif | Pour les candidats |
| Inviter un utilisateur | Devient membre candidat. **Réservé aux ateliers Premium** [MODIFIÉ PAR CLAUDE - 13/06/2026] — voir section 17 « Atelier Premium — implémentation ». |
| Exclure un membre | Uniquement de rang inférieur au gestionnaire qui exclut (candidat < gestionnaire < propriétaire) |
| Changer le rang d'un membre | Promouvoir : rang ≤ au sien / Rétrograder : rang < au sien |
| QR code | Redirige vers l'atelier (Preview `?preview=`). Rejoindre passe par une demande validée comme partout. |
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

> **Tag d'atelier & couverture personnalisée** [MODIFIÉ PAR CLAUDE - 13/06/2026] : chaque atelier a désormais un `unique_tag` (**8 caractères** [MODIFIÉ 22/06/2026], format Crockford-like identique au tag utilisateur, générateur de base partagé `src/lib/tag.ts`, unicité vérifiée à la création via `generateUniqueWorkshopTag`). Affiché dans Paramètres → Général, accolé au nom de l'atelier dans une même bulle (`TAG - nom`), sans symbole `#`. La recherche (`searchWorkshops`) matche le nom (`ILIKE`) OU le tag exact (`unique_tag.ilike`). En complément des 4 dégradés de base, le propriétaire peut uploader une image de couverture personnalisée (colonne `cover_image_url`, bucket Supabase Storage public `workshop-covers`, action `uploadWorkshopCover`). Une colonne `cover_image_active` (booléenne) indique si cette image est la couverture active : `cover_image_url` est conservée en base même quand un dégradé est sélectionné, et n'est supprimée (`null`) que via le bouton croix dédié. `src/lib/workshopCover.ts` expose `coverStyleFor(id, gradient, imageUrl, imageActive)` qui renvoie l'image si présente ET active, sinon le dégradé — utilisé partout où une couverture est affichée (Dashboard, recherche, Preview).

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
> **Badge Premium sur la Preview (Dashboard)** : `is_premium` est désormais renvoyé par `getUserWorkshops`, `getWorkshopPreview` et `searchWorkshops` (`src/app/actions/workshops.ts`). Dans `DashboardClient.tsx`, `PreviewData.isPremium?: boolean` est alimenté partout où une `PreviewData` est construite (ateliers possédés/rejoints, deep-link `?preview=`, clic sur un résultat de recherche). La modale Preview affiche un badge ambre « Premium » (`background: rgba(232,184,108,0.85)`, `color: #7a4d20`) en haut à gauche, à côté du badge de rôle (propriétaire/membre) s'il est présent. **[AJOUTÉ 21/06/2026]** Une pastille « 👑 Premium » (même style ambre, `rgba(232,184,108,0.92)` / `#7a4d20`, icône `Crown` Lucide) est aussi affichée en haut à gauche de la couverture des cartes `WorkshopCard` du dashboard (sections « mes ateliers » et « ateliers rejoints », composant partagé) quand `workshop.is_premium`.
>
> **Activation Premium — modèle de sécurité (`activateWorkshopPremium` dans `src/app/actions/workshops.ts`)** : action serveur appelée depuis le bouton « activer → » (section Atelier Premium des Paramètres). Couches de protection, dans l'ordre :
> 1. **[MODIFIÉ 21/06/2026]** Allowlist admin **par email** : `PREMIUM_TEST_ADMIN_EMAILS = ['alex.bourillon@gmail.com']` — l'email de l'utilisateur connecté (lu via `clerkClient().users.getUser`) doit y figurer, sinon l'action retourne une erreur. **Remplace l'ancien garde `process.env.NODE_ENV === 'production'`** (qui désactivait tout en prod, d'où « le mot de passe ne marche pas en ligne »). Allowlist par email et non par `user_id` car l'instance Clerk de prod ≠ celle de dev (même personne = `user_id` différent, mais email identique) → le mécanisme se comporte donc à l'identique en local et en ligne.
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
> - Quand le paiement Stripe sera intégré (voir mémoire « Plan Stripe »), `activateWorkshopPremium` doit être remplacée par un flux où l'activation n'a lieu **qu'après confirmation d'un paiement réel** (webhook Stripe ou équivalent) — supprimer alors : l'allowlist `PREMIUM_TEST_ADMIN_EMAILS`, la constante `PREMIUM_TEST_ACTIVATION_PASSWORD`, le paramètre `password`, et toute l'UI de test (champ mot de passe + bouton « activer →" dans son état actuel).
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

> **Page Paramètres → Fichiers** [AJOUTÉ PAR CLAUDE - 14/06/2026]
>
> Nouvelle page dédiée `src/app/[locale]/workshops/[id]/settings/SettingsClient.tsx` (`activeSection === 'files'`, onglet **« Fichiers »**, positionné juste au-dessus de « Briques de connaissance » dans `NAV_ITEMS` et dans l'ordre de rendu JSX) : liste tous les fichiers déposés dans l'atelier, triés par nom, avec une zone « ajouter un fichier » (drag-and-drop + bouton parcourir). Nouveau fichier serveur `src/app/actions/workshopFiles.ts` (`getWorkshopFiles`, `uploadWorkshopFile`, `renameWorkshopFile`, `deleteWorkshopFile`), réservé au propriétaire (`requireOwner`).
>
> **Schéma DB (migration `add_workshop_files_table`, projet `hhkmrejjksjpfetwefju`)** : table `workshop_files` (id, workshop_id FK cascade, name, size, mime_type, category, storage_path, created_by, created_at) + bucket de stockage privé `workshop-files`. `category` (`audio` / `texte` / `autre`) est déduite du `mime_type` à l'upload (`categoryFor`) — affichée via `FileCategoryIcon` mais n'est plus utilisée pour trier/grouper la liste (tri uniquement par nom).
>
> **Taille maximale par fichier — 50 Mo pour tous** [MODIFIÉ PAR CLAUDE - 14/06/2026] : la distinction Premium/Gratuit (50 Mo / 5 Go) a été retirée. Le projet Supabase « Culture » (`hhkmrejjksjpfetwefju`) est sur le plan **Free**, dont la limite globale de taille de fichier (tous buckets confondus) est **hard-cappée à 50 Mo** — un `file_size_limit` de bucket supérieur n'a donc aucun effet réel. `MAX_FILE_SIZE = 50 * 1024 * 1024` dans `src/app/actions/workshopFiles.ts` s'applique désormais à **tous les ateliers** (l'helper `isWorkshopPremium` a été supprimé). Le bucket `workshop-files` a été repassé à `file_size_limit = 52428800` (migration `set_workshop_files_bucket_limit_50mb`). Le hint « ajouter un fichier » affiche statiquement `taille max. 50 Mo`. **Pour augmenter cette limite plus tard** : il faudra passer le projet Supabase sur le plan Pro (jusqu'à 500 Go par fichier) — ou migrer le stockage vers un autre provider (S3, voir ci-dessous).
>
> **Renommage de fichier** : icône crayon (`Pencil`) sur chaque ligne, bascule en mode édition inline (input texte pour le nom de base + extension affichée en suffixe fixe non éditable, boutons valider/annuler). `renameWorkshopFile(workshopId, fileId, newBaseName)` recalcule systématiquement `extension = nom.slice(nom.lastIndexOf('.'))` à partir du nom existant en base et la réaccole au nouveau nom de base — **l'extension d'origine (`.pdf`, `.jpg`, etc.) est donc toujours préservée**, quoi que l'utilisateur saisisse. Pattern (split base/extension + extension non éditable) à réutiliser pour tout futur renommage de fichier.

> **Module de stockage `src/lib/storage.ts` — abstraction provider-agnostic (Option 3, upload direct via URL signée)** [AJOUTÉ PAR CLAUDE - 14/06/2026]
>
> Tout le stockage de fichiers d'atelier passe désormais par `src/lib/storage.ts`, point d'entrée unique : **le reste de l'app n'appelle jamais `supabase.storage` ni un SDK de provider directement**. Objectif : un futur changement de stratégie (ex. passage à S3 multipart, « Option 2 ») ne touche que ce fichier.
>
> - **Principe — clés, pas d'URLs** : en base (`workshop_files.storage_path`), on stocke uniquement la **clé/chemin de l'objet** (`buildWorkshopFileKey(workshopId, fileName)` → `${workshopId}/${Date.now()}-${fileName}`, le `workshopId` en premier segment pour l'isolation), jamais une URL de provider. Les URLs sont générées à la demande via le module.
> - **`UploadTicket`** : type générique `{ url, method: 'PUT', headers }` — un « ticket » d'upload que le client exécute lui-même (`fetch`/`XHR` PUT direct vers le stockage, sans clé secrète ni SDK côté client). Identique que le ticket soit émis par Supabase (`createSignedUploadUrl`) ou, plus tard, par un presigned PUT S3.
> - **Flux d'upload (`src/app/actions/workshopFiles.ts` + `SettingsClient.tsx`)** :
>   1. `createFileUploadTicket(workshopId, fileName, fileSize, mimeType)` — vérifie les droits (`requireOwner`, contrôle d'accès côté serveur, **pas de RLS Storage**) et la taille (50 Mo), construit la clé via `buildWorkshopFileKey`, obtient un `UploadTicket` via `createUploadTicket(key, mimeType)`.
>   2. Le client transfère le fichier lui-même : `uploadFileDirect` (dans `SettingsClient.tsx`) fait un `XMLHttpRequest` `PUT` vers `ticket.url` avec `ticket.headers`, en suivant la progression via `xhr.upload.onprogress` (XHR choisi plutôt que `fetch` car `fetch` ne donne pas la progression d'upload).
>   3. `finalizeWorkshopFileUpload(workshopId, path, name, size, mimeType)` enregistre les métadonnées en base (`workshop_files.storage_path = path`). En cas d'échec d'insertion, l'objet est nettoyé via `deleteObject(path)`.
> - **Historique** : l'approche TUS (upload resumable, « Option 1/2 » côté Supabase) a été abandonnée — l'endpoint TUS renvoyait systématiquement une erreur 403 RLS (`new row violates row-level security policy`) avec la clé anon, même en suivant le pattern documenté (`x-signature`), et ne fonctionnait qu'avec la clé `service_role` (impossible à exposer côté navigateur). `createSignedUploadUrl` + `PUT` simple n'a aucun souci de RLS et est largement suffisant tant que la limite par fichier reste à 50 Mo (pas besoin de chunking).
> - **Migration future vers S3 (Option 2)** : si le volume/la taille de fichiers dépasse ce que Supabase Free/Pro permet, migrer en réécrivant uniquement `src/lib/storage.ts` — `buildWorkshopFileKey` (schéma de clé déjà indépendant du provider), `createUploadTicket` (presigned PUT ou multipart S3), `deleteObject`. Endpoint/région/bucket/clés doivent rester en variables d'environnement, jamais en dur. Aucun changement attendu dans `workshopFiles.ts` ni `SettingsClient.tsx`.

---

> **Aperçu de l'examen en direct (panneau « Générer un examen »)** [AJOUTÉ PAR CLAUDE - 15/06/2026]
>
> Dans `src/app/[locale]/workshops/[id]/tabs/ExamenTab.tsx`, le panneau « Générer un examen » (`GeneratorContent`, remplace l'ancien panneau générique) est désormais un aperçu en direct de l'examen en cours de construction : les questions envoyées depuis la banque (cases à cocher « QUESTIONS ENVOYÉES ») s'enchaînent dans l'ordre choisi, organisées en **sections** (groupes nommés et réordonnables de questions consécutives, drag-and-drop via `moveSectionRow`/`handleDrop`, y compris pour les groupes de questions liées).
>
> **Modèle de données** (types exportés depuis `ExamenTab.tsx`) :
> ```ts
> type CandidateIdentity = { nom: boolean; prenom: boolean; tag: boolean; classe: boolean };
> type ExamPresentation = { identity: CandidateIdentity; customFields: string[] };
> type ExamSection = { id: string; title: string; questionIds: string[] };
> type QuestionWeight = { points: number; negative: { enabled: boolean; value: number }; eliminatory: boolean };
> type ExamConfig = { title: string; durationMinutes: number; presentation: ExamPresentation; sections: ExamSection[]; weighting: Record<string, QuestionWeight> };
> ```
> - **Pondération** (`weighting`) est stockée **par examen** (et non comme valeur par défaut sur la question elle-même) — un même pool de questions peut donc avoir des pondérations différentes selon l'examen généré. `updateWeight(id, patch)` fusionne avec `defaultWeight()` (`{ points: 1, negative: { enabled: false, value: 0 }, eliminatory: false }`).
> - **Présentation** : identité du candidat demandée (nom/prénom/tag/classe, switches) + champs personnalisés libres (`customFields`, ajout via mini-formulaire inline).
> - **Sections** : `addSection`/`removeSection` (en fusionnant les questions de la section supprimée dans la précédente), titres éditables inline.
>
> **Persistance** : `ExamConfig` est stocké dans la nouvelle colonne `exam_generated.config jsonb not null default '{}'::jsonb` (migration `add_exam_generated_config`, projet `hhkmrejjksjpfetwefju`). `getExamBankData`/`saveGeneratedExam` (`src/app/actions/examQuestions.ts`) lisent/écrivent ce champ. Pour un examen chargé sans config valide (`config: {}`), l'édition retombe sur `defaultExamConfig(title)` — vérifier `e.config?.sections` (pas seulement `??`) avant d'utiliser un `config` venant de la base, car `{}` est truthy.
>
> **⚠️ Piège React à connaître — `setState` avec fonction updater n'est PAS synchrone** : dans `handleGenerate()`, l'objet `saved` (l'examen à persister) doit être construit **avant** l'appel à `setExams(prev => ...)`, jamais à l'intérieur de l'updater avec une variable externe (`let saved = null; setExams(prev => { saved = ...; return ... })`) — l'updater s'exécute lors de la phase de rendu, pas immédiatement, donc tout code après `setExams` qui dépend de `saved` (ici l'appel à `saveGeneratedExam`) verrait `saved` toujours `null`. C'était la cause du bug « l'examen généré n'apparaît plus après reload ». Pattern à appliquer pour tout futur `setXxx(prev => ...)` dont le résultat doit être réutilisé en dehors de l'updater.

> **Tri par chronologie + ordre croissant/décroissant (Banque de questions)** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx`, le type `Question` (`QuestionEditor.tsx`) expose désormais `createdAt?: string` (mappé depuis `exam_questions.created_at` via `rowToQuestion` dans `src/app/actions/examQuestions.ts`), non affiché dans l'UI mais utilisable comme clé de tri. Le `<select>` « trier » a une nouvelle option `trier · date d'ajout` (`value="recent"`, type `SortBy` étendu). Un nouvel état `sortDir: 'asc' | 'desc'` (constante `DEFAULT_SORT_DIR` par critère : `difficulty: 'desc'`, `name`/`type`/`label`: `'asc'`, `recent: 'desc'`) est combiné au comparateur (`dir = sortDir === 'asc' ? 1 : -1`, multiplié à la comparaison de base). `changeSortBy(value)` met à jour `sortBy` ET réinitialise `sortDir` à sa valeur par défaut pour ce critère. Un `IconBtn` flèche verticale (↑/↓ selon `sortDir`) à côté du `<select>` bascule `sortDir`.

> **Refonte du bandeau de sélection (Banque de questions)** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx` → `BankContent`, une constante `NEW_SELECTION_BANNER = true` (déclarée en haut du fichier avec les autres constantes) bascule entre l'ancien bandeau (sous le header, provoquait un décalage de la liste de questions d'un cran à la sélection) et le nouveau, affiché **inline dans la ligne d'en-tête**, entre la colonne « Banque de questions »/filtres et les boutons « + nouvelle question »/« ✦ générer par IA ». Le nouveau bandeau (compact, fond ambre, `whiteSpace: 'nowrap'`) affiche « N sélectionnée(s) », « désélectionner », « 🔗 lier » (si ≥ 2 sélectionnées) et « envoyer → ». L'ancien bandeau (texte complet « envoyer vers le générateur → » etc.) reste intact, enveloppé dans `!NEW_SELECTION_BANNER && ...`, pour permettre un retour en arrière facile en repassant la constante à `false`. Pattern (constante de bascule en tête de fichier pour A/B tester une zone d'UI sans dupliquer de fichier) à réutiliser pour de futurs essais similaires.

> **Aperçu A4 « PDF-like » du panneau « Générer un examen »** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx` → `GeneratorContent`, le panneau de génération d'examen affiche désormais chaque question comme un bloc visuel au format A4 (carte blanche, `maxWidth: 700`, `padding: '28px 34px'`, ombre légère), contenant l'énoncé numéroté **et** un espace de réponse générique en dessous — bande continue verticale scrollable, avec pagination A4 (voir entrée ci-dessous).
>
> - **Layout** : la sidebar « QUESTIONS ENVOYÉES » (coche pour ajouter à l'examen) est désormais à **gauche** (230px, `borderRight`), suivie du panneau de configuration/déroulé. L'ancien bouton « aperçu » a été supprimé — l'aperçu est désormais permanent et en direct.
> - **`renderAnswerSpace(q: Question)`** (nouvelle fonction, juste après `defaultWeight()`) génère l'espace de réponse selon `q.responseType` : QCM/QCS/sondage → liste de choix avec case (carrée pour QCM, ronde pour QCS/sondage) ; matching → deux colonnes numérotées/lettrées ; ordre → cases numérotées vides + libellé ; dessin → cadre en pointillés 180px ; audio → cadre placeholder « 🎙 espace de réponse audio » ; fill_blank → 3 lignes vides ; textuelle/par défaut → 5 lignes vides ; sans_reponse → rien.
> - Pour les groupes de questions liées, chaque membre déplié affiche son propre bloc A4 complet (avec `renderAnswerSpace`) ; replié, seul l'en-tête du groupe est visible.
> - Le drag-and-drop, les sections, les contrôles de pondération (`WeightControls`) et le badge « ⚠ incomplète » (cliquable → ouvre l'éditeur de question) sont conservés à l'identique, juste réintégrés dans la nouvelle mise en page.
> - Le bouton « exporter PDF » est conservé en placeholder (non fonctionnel), désormais pleine largeur sous le bouton « générer l'examen → ».

> **Renommage « Générer un examen » → « Éditeur d'examen »** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx`, le libellé du panneau (`META.generator`) est devenu `"Éditeur d'examen"`. L'en-tête interne du panneau (« Aperçu de l'examen ») et l'onglet de plus haut niveau dans `WorkshopClient.tsx` (« Génération d'examen ») sont volontairement restés inchangés (correspondance exacte de chaîne uniquement sur « Générer un examen », occurrence unique).

> **Regroupement du contrôle de tri (Banque de questions)** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `BankContent` (`ExamenTab.tsx`), le bouton flèche de sens de tri (`sortDir`) et le `<select>` « trier » sont désormais réunis dans un même conteneur bordé (`borderRadius: 9, border: 1px solid rgba(45,42,36,0.10)`), positionné à gauche, au lieu d'être deux contrôles séparés.

> **Pagination A4 de l'« Éditeur d'examen »** [AJOUTÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx` → `GeneratorContent`, l'aperçu A4 (voir entrée ci-dessus) calcule désormais de vrais sauts de page, sans jamais couper un bloc de question entre deux pages.
>
> - **Constantes** (après `const LINKED_ID`) : `A4_PAGE_HEIGHT = 990`, `A4_ROW_GAP = 16` (doit correspondre au `marginBottom` de chaque bloc), `A4_SECTION_HEADER_HEIGHT = 44`, `A4_ROW_FALLBACK_HEIGHT = 260` (hauteur estimée avant mesure réelle).
> - **`rowKey(row)`** (après `rowMembers`) : clé stable pour une `Row` (id de question, ou ids joints pour un groupe lié), indépendante de la position.
> - **`computePagination(flat, rowHeights)`** : bin-packing glouton sur la liste aplatie (`flat`), renvoie `{ pageStarts: Set<number>; continuationStarts: Set<number>; pageCount: number }`. Un changement de section ajoute `A4_SECTION_HEADER_HEIGHT` ; si le bloc ne rentre pas dans la page courante, un saut de page est inséré (et un en-tête « (suite) » si le saut tombe au milieu d'une section).
> - **Mesure réelle des hauteurs** : `rowRefs` (`useRef<Record<string, HTMLDivElement | null>>`) + `rowHeights` (state), mis à jour via `useLayoutEffect` (sans tableau de dépendances, gardé par une comparaison `changed` pour éviter les boucles de re-render infinies). Chaque bloc (single ou membre de groupe) pose `ref={el => { rowRefs.current[rowKey(row)] = el; }}`.
> - **Affichage** : nouvelle stat « PAGES » dans la grille (passée de 3 à 4 colonnes : QUESTIONS / SECTIONS / PAGES / DURÉE). `pageLabel(1)` au-dessus du premier bloc si `pageCount > 1`. `pageBreakSeparator(gi)` (ligne pointillée + « page X / N ») inséré aux indices de `pageStarts`. `continuationLabel(title)` (« {titre section} (suite) ») inséré aux indices de `continuationStarts`.
> - **Piège React à connaître** : dans `useLayoutEffect`, ne PAS utiliser de tableau de dépendances vide — la mesure doit re-tourner à chaque rendu pour suivre les changements de contenu/réordonnancement, mais le garde `changed` empêche la boucle infinie de `setRowHeights`.

> **Bandeau de sélection (Banque de questions) — retour au format pleine largeur sans décalage** [MODIFIÉ PAR CLAUDE - 15/06/2026] : la constante `NEW_SELECTION_BANNER` et la variante de bandeau intégrée à l'en-tête (entre les filtres et les boutons « + nouvelle question »/« ✦ générer par IA ») ont été retirées de `ExamenTab.tsx`. Le bandeau de sélection redevient pleine largeur, positionné sous l'en-tête, mais son conteneur (`minHeight: 39`) est désormais **toujours rendu**, même quand `selected.length === 0` (fond et bordure transparents, aucun texte/bouton) : sélectionner/désélectionner des questions ne provoque donc plus de décalage vertical de la liste. Quand `selected.length >= 1`, le fond ambre, « N question(s) sélectionnée(s) », « désélectionner », « 🔗 lier ces questions » (si ≥ 2) et « envoyer vers le générateur → » réapparaissent dans ce même conteneur.

> **Suppression d'une question (Banque de questions)** [AJOUTÉ PAR CLAUDE - 15/06/2026] : chaque question de la banque (`renderQuestionBody` dans `ExamenTab.tsx`) a désormais une icône poubelle (après « dupliquer la question ») qui ouvre une modale de confirmation (« Supprimer cette question ? » / « Cette action est irréversible. », style carte crème `borderRadius: 20` avec icône d'avertissement — même pattern que la modale de suppression de libellé). Si la question appartient à un groupe de questions liées, un message complémentaire prévient qu'elle sera retirée du groupe. Si la question est référencée dans un ou plusieurs examens générés (`exams[].config.sections[].questionIds`), la modale liste leurs titres avant suppression.
>
> Confirmer appelle `handleDeleteQuestion` (`ExamenTab.tsx`), qui effectue un nettoyage en cascade :
> - retire la question de `questions` ; si elle faisait partie d'un groupe de questions liées, met à jour `linkedQuestionIds` des membres restants (groupe dissous si ≤ 1 membre restant) ;
> - pour chaque examen généré référençant la question dans `config.sections`, retire son id des `questionIds` de section et de `config.weighting`, recalcule `questionIds`/`q`, et persiste via `saveGeneratedExam` ;
> - retire la question de l'« Éditeur d'examen » en cours (`draftIds`, `examConfig.sections`, `examConfig.weighting`) et de la sélection courante (`selected`).
>
> Nouvelle server action `deleteQuestion(workshopId, questionId, affectedQuestions)` dans `src/app/actions/examQuestions.ts` (même pattern que `deletePool`) : upsert des questions de groupe affectées puis `delete` de la question dans `exam_questions`.

> **Nombre de lignes de réponse pour les questions textuelles** [AJOUTÉ PAR CLAUDE - 15/06/2026] : le type `Question` (`QuestionEditor.tsx`) gagne un champ `textLines?: number` (défaut `4`). Pour `responseType === 'textuelle'`, un champ numérique « Nombre de lignes » (max-width 160px, hint « nombre de lignes proposées pour la réponse dans l'aperçu de l'examen ») apparaît dans `QuestionEditor.tsx` juste sous « Réponse associée », valeur minimale 1. `emptyQuestion()` initialise `textLines: 4`. Dans `ExamenTab.tsx` → `renderAnswerSpace`, le cas `'textuelle'` utilise désormais `blankLines(q.textLines ?? 4)` (distinct du cas `default`, resté à `blankLines(5)`, et de `'fill_blank'`, resté à `blankLines(3)`).
>
> **Schéma DB** : migration `add_exam_questions_text_lines` (projet `hhkmrejjksjpfetwefju`) ajoute `exam_questions.text_lines integer not null default 4`. `rowToQuestion`/`questionToRow` (`src/app/actions/examQuestions.ts`) lisent/écrivent `text_lines` ↔ `textLines` (défaut `4`).

> **Ordre des types de réponse dans l'éditeur de question** [MODIFIÉ PAR CLAUDE - 15/06/2026] : `RESPONSE_TYPE_ORDER` (`QuestionEditor.tsx`) est réordonné en Textuelle → QCM → QCS → Texte à trous → Matching → Trier dans l'ordre → Dessin → Audio → Sondage → Sans réponse (au lieu de Sans réponse → QCS → QCM → Textuelle → Dessin → Audio → Sondage → Texte à trous → Matching → Trier dans l'ordre). `RESPONSE_TYPE_V2` (types V2 désactivés dans le segmented control) est inchangé.

> **Ajustements de l'aperçu A4 « Éditeur d'examen »** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx` → `GeneratorContent` :
> - **Largeur du bloc A4** : nouvelle constante `A4_BLOCK_WIDTH = 880` (remplace le `maxWidth: 700` codé en dur sur les deux cartes A4 — question simple et membre de groupe), `A4_PAGE_HEIGHT` passé à `1245` et `A4_ROW_FALLBACK_HEIGHT` à `330` pour garder le ratio A4 à cette nouvelle largeur.
> - **Pastille de type de question retirée** : `TypePill` n'est plus affiché dans `GeneratorContent` (sidebar « questions envoyées » et cartes A4) — reste uniquement dans `BankContent`.
> - **Scroll indépendant sidebar/aperçu** : la racine de `GeneratorContent` passe en `display:flex, flexDirection:column` avec le header (`flexShrink:0`) ; la ligne sidebar+aperçu devient `flex:1, minHeight:0`, et la sidebar « QUESTIONS ENVOYÉES » (230px) ainsi que la zone d'aperçu ont chacune leur propre `overflowY:'auto', minHeight:0`. Le wrapper de tuile du composant `ExamenTab` (zone scaled via `transform`) passe `overflowY` à `'hidden'` spécifiquement pour le panneau `generator` (les autres panneaux gardent `'auto'`), pour laisser le scroll interne de `GeneratorContent` gérer le défilement.
> - **Numérotation à deux niveaux par section** : pour chaque section, `range = sectionRanges[sIdx]` et `rowsInSection.map((entry, localIdx) => { const gi = range.start + localIdx; ... })` — `gi` (index global continu) alimente le badge de gauche (`String(gi + 1).padStart(2,'0')`, identique pour une question simple et pour l'en-tête d'un groupe de questions liées), tandis que `localIdx` (réinitialisé à 0 à chaque section) alimente le numéro `{localIdx + 1}.` affiché dans le bloc A4. Exemple : Section 1 = A,B,C (badges 01/02/03, numéros 1./2./3.), Section 2 = D,E (badges 04/05, numéros 1./2.).
> - **Exclusivité éliminatoire / points négatifs** (`WeightControls`) : le bouton « − » (activer les points négatifs) et son champ de valeur ne s'affichent que si `!weight.eliminatory`. Activer le drapeau « ⚑ éliminatoire » force `negative.enabled = false` (et masque les contrôles associés) ; le désactiver restaure l'affichage du bouton « − » sans modifier `negative.enabled`.

> **Questions collées en feuillet continu, affordance de titre de section, confirmation de suppression de section, fix drag-and-drop inter-sections** [MODIFIÉ PAR CLAUDE - 15/06/2026] : dans `ExamenTab.tsx` → `GeneratorContent` :
> - **Questions collées (Task A)** : `A4_ROW_GAP` passe de `16` à `0` — les questions d'une même section forment désormais un seul feuillet continu (pas de marge entre lignes), séparées uniquement par un fin trait (`borderTop`) entre questions consécutives. Le découpage en « feuillets » (chunks coupés uniquement aux sauts de page A4) est inchangé.
> - **Affordance du titre de section (Task B)** : l'`<input>` de titre de section (« Section 1 », etc.) affiche désormais une icône « ✎ » discrète (`color: 'rgba(168,122,58,0.45)'`, `pointerEvents: 'none'`) en superposition à droite, et un fond/bordure ambre au focus (`focusedSectionIdx`, state `useState<number | null>`). Aucun texte d'aide ajouté — uniquement une affordance visuelle indiquant que le titre est éditable.
> - **Confirmation de suppression de section (Task C)** : `removeSection(idx)` ne supprime plus directement une section non vide — si `config.sections[idx].questionIds.length > 0`, elle ouvre une modale de confirmation (state `pendingRemoveSectionIdx`, même pattern visuel que les autres modales de confirmation du projet — carte crème `borderRadius: 20`, icône « ! », titre « Supprimer la section « {titre} » ? », texte indiquant que les N questions retourneront dans la liste des questions envoyées, boutons « Annuler » / « Supprimer »). `confirmRemoveSection()` effectue la suppression réelle (les questions de la section supprimée redeviennent simplement non cochées dans « QUESTIONS ENVOYÉES », aucune donnée n'est perdue). Une section vide se supprime toujours directement, sans confirmation.
> - **Fix drag-and-drop inter-sections (Task D)** : `moveSectionRow(sections, allQuestions, fromFlatIdx, toFlatIdx, targetSectionIdx)` avait un bug dans son early-return : `fromFlatIdx + 1 === toFlatIdx` était traité comme un no-op systématique, alors que ce cas correspond exactement à « déplacer la dernière question d'une section vers la section suivante (notamment une section vide) » — un déplacement bien réel puisque `targetSectionIdx` change. Le early-return ne bloque désormais ce cas que si `moving.sectionIdx === targetSectionIdx` (déplacement réellement no-op). Vérifié : déposer une question dans une section vide la déplace correctement, et le réordonnancement au sein d'une même section continue de fonctionner.

---

> **Persistance du brouillon « Éditeur d'examen », bandeau de sélection, renommage et bouton « effacer »** [MODIFIÉ PAR CLAUDE - 16/06/2026] : dans `ExamenTab.tsx` :
> - **En-tête renommé** : le titre interne du panneau « Aperçu de l'examen » devient « Éditeur d'examen » (distinct de `META.generator`, déjà renommé « Éditeur d'examen » le 15/06/2026, et de l'onglet de plus haut niveau « Génération d'examen », tous deux inchangés).
> - **Intitulé par défaut vide** : `defaultExamConfig()` initialise désormais `title: ''` (au lieu de `'Partiel · Biologie cellulaire'`) — le champ INTITULÉ démarre vide pour un nouvel examen.
> - **Bouton « effacer l'éditeur »** : nouveau bouton (bordure/texte rouge `#b85a4a`) dans l'en-tête de `GeneratorContent`, ouvre une modale de confirmation (pattern cream `borderRadius: 20`/icône « ! » déjà établi). Confirmer appelle `handleClearEditor()` (dans `ExamenTab`) qui remet `examConfig = defaultExamConfig()`, `draftIds = []` et `editing = null`.
> - **Bandeau de sélection (Banque de questions)** : retour au comportement d'avant le 15/06/2026 — le conteneur du bandeau « N question(s) sélectionnée(s) / désélectionner / 🔗 lier / envoyer vers le générateur → » n'est plus toujours rendu (suppression du `minHeight: 39` permanent introduit le 15/06/2026) ; il n'apparaît que si `selected.length >= 1`.
> - **Persistance du brouillon (reprise après déconnexion/lendemain)** : nouvelle table `exam_draft` (migration `add_exam_draft_table`, projet `hhkmrejjksjpfetwefju`) — `workshop_id uuid primary key references workshops(id) on delete cascade`, `draft_ids jsonb`, `config jsonb`, `editing_id text null`, `updated_at timestamptz`. Nouvelles server actions `getExamDraft`/`saveExamDraft` (`src/app/actions/examQuestions.ts`, type `ExamDraft = { draftIds: string[]; config: ExamConfig; editingId: string | null }`).
>   - Au montage de `ExamenTab`, `getExamBankData` et `getExamDraft` sont chargés en parallèle ; si un brouillon existe, `draftIds`/`examConfig`/`editing` sont restaurés (avec garde `draft.config?.sections` car `config: {}` est truthy mais invalide).
>   - Sauvegarde auto **debounced 800ms** (`useEffect` sur `[workshopId, draftIds, examConfig, editing]`, gardée par un ref `draftLoaded` pour ne pas écraser le brouillon avant la fin du chargement initial) — appelle `saveExamDraft(workshopId, { draftIds, config: examConfig, editingId: editing?.id ?? null })`.
>   - Vérifié en conditions réelles (Claude in Chrome) : titre saisi → attente > 800ms → reload complet de la page → le titre est toujours présent. Le bouton « effacer l'éditeur » remet bien le brouillon à l'état vide (`title: ''`, 1 section vide, `draft_ids: []`) côté `exam_draft`.

> **Aperçu A4 « Éditeur d'examen » — pondération/numéro/drag-and-drop déplacés dans des gouttières latérales, icône « incomplète » repositionnée, fix erreur React à la suppression** [MODIFIÉ PAR CLAUDE - 16/06/2026] : dans `ExamenTab.tsx` → `GeneratorContent`, chaque « feuillet » A4 (`chunk`) est désormais rendu en 3 colonnes (`display:flex`) :
> - **Gouttière gauche** (26px) : une cellule par ligne, hauteur = `rowHeights[rowKey(row)]` (mesurée comme pour la pagination), contenant la poignée de glisser-déposer (`⠿`, `draggable`) puis, si la question (ou un membre du groupe) est incomplète, l'icône « incomplète » juste en dessous avec un espacement de 10px.
> - **Centre** : la feuille A4 blanche, ne contient plus QUE l'énoncé numéroté (`{localIdx + 1}.`) et `renderAnswerSpace(q)` — plus de header avec poignée/numéro/pondération/icône.
> - **Gouttière droite** (86px) : une cellule par ligne avec le numéro global (`01`, `02`, …), les `WeightControls` (pour une question simple — pas pour un groupe) et le bouton « retirer de l'examen » (`×`).
> - **Icône « incomplète »** (nouvelle fonction partagée `incompleteIcon(id)`) : cercle `⚠` seul (texte « incomplète » retiré), `title="question incomplète — cliquer pour compléter dans la banque"` (tooltip au survol), `onClick={() => onOpenQuestion(id)}` → `handleOpenQuestion` (`ExamenTab`) qui ouvre `QuestionEditor` pour cette question précise dans la Banque de questions (`focus('bank')`). Vérifié en conditions réelles (Claude in Chrome) : l'icône apparaît bien sous la poignée de glisser-déposer avec un espacement de 10px (mesuré via `getBoundingClientRect`), et le clic ouvre la modale « Modifier la question » pré-remplie avec la bonne question, dans le panneau Banque de questions.
> - Pour un groupe de questions liées repliable, le header du groupe (🔗 + énoncé + « déplier/replier ») n'a plus de poignée/numéro/icône inline (déplacés dans les gouttières, basés sur `row.ids`/`row.members`) ; les membres dépliés gardent leurs propres `WeightControls`/`incompleteIcon` inline (non déplacés en gouttière, portée limitée).
>
> **Fix erreur React à la suppression d'une question** : dans `handleDeleteQuestion`, l'appel à `saveGeneratedExam(workshopId, next)` se faisait **à l'intérieur** de l'updater `setExams(prev => prev.map(...))`, ce qui déclenchait « Cannot update a component (`Router`) while rendering a different component (`ExamenTab`) » (un appel à une server action qui fait `revalidatePath`/`router.refresh()` ne doit jamais être exécuté depuis un updater de `setState`, qui s'exécute pendant la phase de rendu). Corrigé en collectant les examens mis à jour dans un tableau externe `updatedExams` pendant l'updater, puis en appelant `saveGeneratedExam` pour chacun **après** `setExams`. Vérifié (Claude in Chrome, hook `console.error`/`window.onerror`) : suppression d'une question depuis la banque → aucune erreur console, suppression bien persistée côté Supabase (`exam_questions`). **Pattern à appliquer pour tout futur `setXxx(prev => ...)` dont le corps appellerait une server action.**

---

> **Refonte du système de sélection — questions multi-parties (Banque de questions)** [MODIFIÉ PAR CLAUDE - 18/06/2026] : dans `ExamenTab.tsx` et `QuestionEditor.tsx` :
>
> **Suppression du système de sélection et de liaison (linked questions)** :
> - Retrait complet des cases à cocher, de l'état `selected`, du bouton « désélectionner », du bouton « 🔗 lier » et de `LinkOrderModal`.
> - Retrait des handlers `handleRequestLink`, `handleLinkQuestions`, `handleUnlinkGroup`, `handleToggleGroup`, `handleSendToGenerator`.
> - Retrait du système de regroupement en `Row` (`groupIntoRows`, `rowMembers`, `rowKey`, `type Row`) — la banque et l'éditeur A4 utilisent désormais une liste plate de `Question[]`.
> - Colonne `linked_question_ids` supprimée de la table `exam_questions` (migration `add_question_parts_drop_linked_ids`, projet `hhkmrejjksjpfetwefju`) : toutes les liaisons existantes vidées avant suppression de la colonne.
>
> **Nouveau bouton « → » par question (envoi direct vers l'éditeur)** : toujours visible sur chaque ligne de la banque, appelle `handleSendOne(id)` → ajoute l'id à `draftIds` si absent. Plus de sélection préalable.
>
> **Questions multi-parties** : nouveau type `QuestionPart` (exporté par `QuestionEditor.tsx`) — `{ content, responseType, answer, choices, correctChoices, textLines }`. Chaque question peut avoir N parties supplémentaires, chacune avec ses propres champs indépendants. Colonne `parts jsonb NOT NULL DEFAULT '[]'` ajoutée à `exam_questions` (même migration). `rowToQuestion`/`questionToRow` dans `src/app/actions/examQuestions.ts` lisent/écrivent `parts`. Affichage dans la banque : badge « N parties » + dépliage inline. Affichage dans l'aperçu A4 (éditeur) : chaque partie est rendue comme un bloc de réponse séparé sous l'énoncé principal.
>
> **Rendu A4 simplifié** : `computePagination` et les chunks A4 utilisent `q.id` comme clé de ref (ex `qRefs.current[q.id]`) au lieu de `rowKey(row)`. La gouttière gauche et droite (poignée, pondération, numéro, ×) itèrent directement sur `{ gi, q }` sans Row intermédiaire.

> **Fix global d'une barre de scroll résiduelle (quelques pixels) sur toutes les pages connectées** [MODIFIÉ PAR CLAUDE - 20/06/2026] : le layout `[locale]/layout.tsx` empile `<DashboardHeader>`/`<Navbar>` (hauteur réelle 65px = `h-16` Tailwind + `border-b` 1px) puis `<main className="flex-1">`. Chaque page (`WorkshopClient`, `SettingsClient`, `DashboardClient`, `ProfileClient`, `profile/avatar`, `PricingClient`, `WorkshopNewClient`) fixait en plus `minHeight: '100vh'` (ou `min-h-screen`) sur son propre conteneur racine, ajoutant systématiquement 65px de trop par rapport à la fenêtre. Remplacé partout par `calc(100vh - 65px)`, cohérent avec le pattern déjà utilisé sur `session/page.tsx`, `garden/GardenClient.tsx` et `create/page.tsx` (eux aussi alignés sur `65px`, pas `4rem`, pour la même raison de bordure). Pattern à reprendre pour toute future page plein-écran sous ce layout : ne jamais utiliser `100vh` brut, toujours `calc(100vh - 65px)`.
>
> **Logo « plante en pot » dans les barres de navigation** [MODIFIÉ PAR CLAUDE - 20/06/2026] : l'icône `src/app/icon.png` (favicon) est copiée dans `public/logo-plant.png` pour être utilisable comme `<Image>` Next.js. Remplace l'ancien SVG inline (germe stylisé) à côté du mot « Culture » dans `Navbar.tsx` (visiteur) et `DashboardHeader.tsx` (connecté).

> **Refonte de la banque de questions et de l'éditeur d'examen (suite des sessions des 14-18/06)** [MODIFIÉ PAR CLAUDE - 20/06/2026]
>
> **Titre de question optionnel** : nouveau champ `Question.title` (colonne `exam_questions.title text not null default ''`, migration `add_exam_questions_title`), affiché tout en haut de `QuestionEditor.tsx`, hint « optionnel — remplace l'énoncé comme titre affiché dans la banque ». S'il est rempli, `renderQuestionBody` (`ExamenTab.tsx`) l'affiche à la place de `q.content` dans la banque (`q.title.trim() || q.content`) ; le tri « trier · nom » et la recherche texte (`chercher une question…`, placeholder renommé depuis « filtrer les questions… ») portent désormais sur `title + content + answer`. L'aperçu A4 de l'éditeur d'examen continue d'afficher le véritable `content` (l'énoncé réel vu par les candidats n'est jamais remplacé par le titre).
>
> **Réponse libre / sans correction (type Textuelle)** : nouveau champ `answerOptional: boolean` sur `Question` et sur chaque `QuestionPart` (colonne `exam_questions.answer_optional boolean not null default false`, migration `add_exam_questions_answer_optional` — pour les parties, le champ vit dans le jsonb `parts`, pas de colonne dédiée). Pour `responseType === 'textuelle'` uniquement, un `MiniSwitch` « Réponse libre » apparaît sur la même ligne que « Nombre de lignes » (réponse libre à gauche, nombre de lignes à droite), pour ne pas allonger le formulaire. Si activé, le champ « Réponse associée » est masqué et la question/partie n'est plus jamais comptée comme incomplète par `answerMissing`/`hasNoAnswer` (`ExamenTab.tsx`) — usage typique : dissertation ou réponse rédigée libre sans correction de référence. `answerSummary` affiche alors « réponse libre · sans correction » dans la banque.
>
> **Difficulté et durée désormais réglables par partie** : les contrôles (auparavant globaux à toute la question, partagés entre toutes les parties) sont factorisés dans un nouveau composant `DifficultyDurationFields` (`QuestionEditor.tsx`), rendu une fois pour la question principale et une fois par partie supplémentaire — chaque (sous-)question a donc sa propre difficulté/durée indépendante. `QuestionPart` gagne les champs `difficulty`/`duration` (mêmes formes que sur `Question`) ; `normalizePart` (`examQuestions.ts`) fournit des valeurs par défaut pour les questions existantes en base (anciennes parties sans ces champs).
>
> **Question multi-parties considérée incomplète si une seule partie manque de réponse** : `hasNoAnswer` (`ExamenTab.tsx`) vérifie désormais la partie principale **et** `q.parts.some(answerMissing)` — avant ce correctif, une question à plusieurs parties pouvait être marquée complète dès qu'une seule réponse (n'importe laquelle) était renseignée. `answerMissing`/`answerSummary` sont génériques (acceptent `{ responseType, answer, choices, correctChoices, answerOptional? }`), réutilisables pour `Question` et pour chaque `QuestionPart`.
>
> **Numérotation continue des parties dans l'aperçu A4 de l'éditeur** : remplace l'ancien affichage « Partie 2. », « Partie 3. » (qui repartait à 2 pour chaque question) par une numérotation continue par section — ex. Q1 (2 parties), Q2 (1 partie), Q3 (3 parties) → 1, 2, 3, 4, 5, 6, 7. Calculé via `subStarts` (tableau de positions de départ par question dans `rowsInSection`, basé sur `1 + q.parts.length`), porté par le type `FlatQ` étendu (`{ gi, localIdx, subStart, q }`). Le badge de gouttière droite (`gi`-based, « 01 », « 02 »…) reste lui un numéro par *question* (inchangé), distinct de la numérotation continue affichée dans le corps du document — ce sont deux échelles de numérotation volontairement différentes.
>
> **Confirmations ajoutées dans l'éditeur d'examen** (toutes en `position: fixed` via `createPortal(..., document.body)` — nécessaire car le panneau « banque »/« historique » a un ancêtre avec `transform: scale(...)` qui, combiné à `overflowY: auto`, transforme du `position: fixed` ordinaire en élément scrollable avec le contenu plutôt que fixé à l'écran ; piège CSS à connaître pour toute future modale ajoutée dans ces panneaux) :
> - **Génération/enregistrement avec questions incomplètes** : si l'examen en cours contient des questions incomplètes, popup « Enregistrer malgré tout ? » avant `onGenerate()`.
> - **Retrait d'une question cochée depuis « questions envoyées »** : si la question est incluse dans l'examen en cours (`includedIds`), une confirmation prévient qu'elle sera aussi retirée de l'aperçu/de l'examen ; sinon le retrait est immédiat. `confirmRemoveFromDraft` nettoie `config.sections` et `config.weighting` en plus de `draftIds`.
> - **Modifier un examen existant alors que l'éditeur est déjà utilisé pour autre chose** : `requestEditExam(e)` vérifie `isEditorEmpty()` (titre vide, 0 question envoyée, 0 question dans les sections, `editing === null`) ; si l'éditeur n'est pas vierge et qu'il s'agit d'un *autre* examen, popup « Éditeur déjà en cours d'utilisation » avec « Annuler » / « Aller à l'éditeur » (ce dernier navigue sans toucher aux données en cours — il faut d'abord terminer ou effacer l'éditeur pour modifier l'autre examen).
> - **Icône « question incomplète » bloquée si une question est déjà en cours d'édition** (`QuestionEditor` déjà ouvert pour une autre question) : `handleOpenQuestion` ne fait plus rien silencieusement dans ce cas — un toast bas-d'écran « question déjà en cours d'édition » (2,2s, `createPortal`) informe l'utilisateur. Cliquer sur l'icône de la question déjà ouverte fonctionne normalement.
>
> **Réinitialisation automatique de l'éditeur après enregistrement** : `handleGenerate` (création **et** modification d'un examen existant) appelle désormais aussi `setDraftIds([])`/`setExamConfig(defaultExamConfig())` en plus de `setEditing(null)` — l'éditeur repart à vide après chaque sauvegarde, comme un « annuler les modifications »/« effacer l'éditeur » implicite.
>
> **Libellés UI en mode édition d'examen existant** : quand `editing !== null`, le bouton « réinitialiser l'éditeur » devient « annuler les modifications » (texte + modale de confirmation adaptés, sans mention d'irréversibilité puisque l'examen déjà enregistré n'est pas affecté) ; le bouton de validation est « enregistrer les modifications » au lieu de « générer l'examen » — les deux boutons partagent désormais exactement le même style plein vert (`#4f6b40`). L'ancien bouton « exporter PDF » a été supprimé (placeholder non fonctionnel retiré, pas remplacé).
>
> **Icônes « incomplète » converties en Lucide React** : remplace l'emoji `⚠` (rendu/alignement non maîtrisable selon la police système, rognait visuellement dans son cercle) par `AlertTriangle` de `lucide-react`, conformément à la règle absolue « Icônes : Lucide React uniquement » (section 1). Deux occurrences (sidebar « questions envoyées » et gouttière de l'aperçu A4), tooltip raccourci en « question incomplète - cliquer pour compléter ».
>
> **Filtres et libellés (banque de questions)** : le filtre « type de question » (Textuel/Visuel/Audio) et « type de réponse » ne listent désormais que les valeurs réellement présentes dans la banque (calculé depuis `questions`, comme c'était déjà le cas pour le type de réponse). Renommages : « jamais tombé en examen » → « Nouveau », « question incomplète » → « Incomplète ». La modale d'édition d'un libellé (clic sur le crayon d'un chip) est désormais **centrée sur l'encadré des filtres** (`position: absolute` ancrée à un wrapper `position: relative` interne au popover, avec un léger fond translucide cliquable pour fermer) au lieu d'être positionnée relativement au chip cliqué, ce qui donnait un rendu décalé selon le libellé choisi. Tri par défaut au chargement : « date d'ajout », flèche décroissante (les plus récentes en haut) ; changer de critère de tri ne modifie plus le sens (`asc`/`desc`) choisi par l'utilisateur — avant, chaque changement de critère réinitialisait la flèche à sa valeur par défaut.
>
> **Liste « questions envoyées »** : `handleSendOne` ajoute désormais en tête de liste (`[id, ...prev]`) plutôt qu'en fin — les questions tout juste envoyées depuis la banque apparaissent en haut. Bouton d'envoi « → » par question agrandi (`fontSize: 30`, plus large) pour plus de clarté visuelle.
>
> **Suppression des questions/libellés/examens supprimés** : les avertissements `'Cette action est irréversible.'` ont été retirés des modales « effacer l'éditeur » et « supprimer la section » (récupérables/non destructeurs pour des données déjà enregistrées) — conservés pour la suppression définitive d'une question, d'un libellé ou d'un examen.

> **Retour à l'architecture « 3 colonnes parallèles » pour l'aperçu A4 + fixes zoom navigateur + favori de présentation** [MODIFIÉ PAR CLAUDE - 21/06/2026]
>
> **Architecture A4 (`GeneratorContent`, `ExamenTab.tsx`)** : l'architecture « ligne unifiée » (un seul wrapper pleine largeur par ligne, feuille A4 en calque `position:absolute` décoratif) introduite puis abandonnée en cours de session a été **revertée vers l'architecture « 3 colonnes parallèles »** d'origine (gouttière gauche 26px poignée/icône, feuille A4 centrale = le conteneur lui-même avec fond/bordure/ombre, gouttière droite 86px numéro/pondération/suppression). Les 3 colonnes font chacune leur propre `.map()` sur le même tableau `chunk`, donc une ligne ne change jamais de colonne pendant un drag (seulement de position) — c'est ce qui évite un bug de démontage DOM en plein drag natif HTML5. Alignement vertical des 3 cellules d'une même ligne via `rowHeights[row.key]` (mesuré par `ref`+`useLayoutEffect` sur la cellule centrale, appliqué en `height` explicite aux 3 cellules). Seule différence avec l'ancienne version : les mêmes handlers `onDragOver`/`onDrop` sont attachés aux 3 cellules de chaque ligne (pas seulement la feuille centrale), pour pouvoir déposer une question en survolant aussi les gouttières.
>
> **Reflow au zoom navigateur (`ExamenTab.tsx`, composant racine)** : le `ResizeObserver` qui mesure `stageRef` (système de tuiles history/bank/generator) se déconnectait après sa toute première mesure réussie — bug qui figeait la mise en page dès qu'on zoomait ensuite (espace vide en trop en dézoomant, contenu hors d'atteinte en zoomant). Corrigé : l'observer reste actif en continu. Nouveau seuil `STACK_BP = 860` : sous cette largeur disponible, les 3 panneaux passent d'une disposition côte-à-côte avec mise à l'échelle à une **pile verticale plein-largeur en 1:1** (panneau actif plus grand en haut, scroll vertical sur le conteneur) — pattern de reflow à réutiliser pour tout futur système de tuiles à largeur variable. Le conteneur `stageRef` n'a `overflow:'auto'` qu'en mode pile (`stacked`) — en mode côte-à-côte (le cas normal), il reste `overflow:'visible'`, sinon l'apparition/disparition d'une scrollbar redéclenche le `ResizeObserver` en plein vol et casse l'animation FLIP d'échange de tuiles (et tronque les ombres portées des cartes). **Piège à retenir** : ne jamais mettre `overflow:auto` par défaut sur un conteneur de mise en page mesuré par `ResizeObserver` si l'overflow n'est nécessaire que dans un cas particulier.
>
> **Scrollbar « collée » au bord (tuiles history/bank)** : ces deux tuiles défilent via leur conteneur extérieur (contrairement à l'éditeur qui gère son propre scroll interne avec marge) — `contentW = mainW - 16` (au lieu de `mainW`) pour ces deux ids réserve une marge où la scrollbar peut respirer avant le bord de la tuile, comme c'est déjà le cas sur l'éditeur. Le fond de la tuile extérieure (`background` du conteneur `position:absolute`) doit être la **même couleur** que le fond du contenu intérieur (`#fcf9f2` / `#fbf7ef` selon l'id), sinon cette marge réservée apparaît blanche au lieu de la couleur de fond — piège à surveiller pour toute future marge de ce type.
>
> **Scroll latéral incomplet dans l'aperçu A4 (zoom élevé)** : la ligne à 3 colonnes était centrée via `justifyContent:'center'` sur un flex — piège CSS classique : quand le contenu dépasse, les navigateurs refusent un `scrollLeft` négatif, donc la partie qui dépasse à gauche du centrage devient inatteignable au scroll. Remplacé par `width:'fit-content', margin:'0 auto'` : en cas de dépassement, la marge auto se résout à 0 (alignement à gauche, immédiatement visible), et le reste devient atteignable en scrollant vers la droite. **Règle générale à appliquer** : ne jamais centrer un conteneur potentiellement plus large que son parent avec `justifyContent:/alignItems:'center'` sur un flex/grid scrollable — toujours `margin:'0 auto'` sur un élément de largeur intrinsèque (`fit-content`/`max-content`).
>
> **Favori de présentation** (section « présentation » de l'éditeur — identité du candidat + pilules personnalisées, uniquement) : deux boutons ajoutés à côté du label « présentation » — ⭐ « favori » (popup de confirmation « La section présentation va être remplacée par votre favori. » puis applique `favoritePresentation` à `config.presentation`) et ↻ (popup « Enregistre la présentation actuelle comme favorite. Elle remplacera l'ancienne favorite. » puis bouton « Enregistrer », qui sauvegarde `config.presentation` comme nouveau favori). Stocké en `localStorage` (clé `culture.examPresentationFavorite.v1`) — **favori par utilisateur/navigateur, pas par atelier**, lu/écrit via `getFavoritePresentation`/`saveFavoritePresentation` (`ExamenTab.tsx`). Valeur par défaut avant toute sauvegarde = la présentation par défaut elle-même (Nom > Prénom > Tag-Culture à gauche, Date à droite, Classe non affiché) — `defaultPresentation()` factorisée et réutilisée par `defaultExamConfig()`.

> **Une seule session active par compte (« la dernière connexion gagne »)** [AJOUTÉ PAR CLAUDE - 21/06/2026]
>
> Empêche un même compte d'être connecté simultanément depuis deux appareils/navigateurs. Implémenté côté serveur via un **webhook Clerk** `session.created` : `src/app/api/webhooks/clerk/route.ts` vérifie la signature avec `verifyWebhook` (`@clerk/nextjs/webhooks`, secret `CLERK_WEBHOOK_SIGNING_SECRET`), puis liste les sessions actives de l'utilisateur (`clerkClient.sessions.getSessionList({ userId, status: 'active' })`) et révoque toutes celles différentes de la session fraîchement créée (`revokeSession`). Se connecter quelque part déconnecte donc automatiquement l'utilisateur partout ailleurs.
>
> **Pourquoi pas le « single session mode » du dashboard Clerk** : il ne limite qu'à une session *par navigateur*, pas une session *par compte tous appareils confondus* — il ne répond donc pas au besoin. Seule la révocation via la Backend API garantit l'unicité globale.
>
> **Configuration requise (dashboard Clerk + env)** : Webhooks > endpoint sur `/api/webhooks/clerk` abonné à `session.created`, puis copier le « Signing Secret » dans `CLERK_WEBHOOK_SIGNING_SECRET` (cf. `.env.local.example`). La route est hors du matcher du middleware (`api` exclu) donc publique, et reste protégée par la vérification de signature Svix. En local, exposer la route via un tunnel (ex. ngrok / `clerk` CLI) pour recevoir les webhooks.
>
> **Information de l'utilisateur déconnecté (option A — bannière à la reconnexion)** : `src/components/SessionWatcher.tsx` (monté dans `[locale]/layout.tsx`, sous `NextIntlClientProvider`) surveille `useAuth()` ; à la transition connecté → déconnecté, si elle n'est pas volontaire, il redirige vers `/{locale}/sign-in?reason=session_revoked`, où la page de connexion affiche une bannière ambre « Vous avez été déconnecté car votre compte a été utilisé sur un autre appareil ». La déconnexion volontaire est distinguée via `src/lib/signOutIntent.ts` (`markIntentionalSignOut`/`consumeIntentionalSignOut`, sessionStorage) — `markIntentionalSignOut` est appelé `onClick` des `<SignOutButton>` dans `DashboardHeader.tsx` et `Navbar.tsx` (3 occurrences). **Limite** : ne fonctionne que si l'onglet de la victime est ouvert (Clerk détecte la révocation au rafraîchissement du token, < ~1 min) ; onglet fermé → déconnexion silencieuse sans bannière au prochain accès.

> **Invitations à un atelier (Premium) — accepter / refuser** [AJOUTÉ PAR CLAUDE - 21/06/2026]
>
> Un propriétaire d'atelier **Premium** peut inviter un utilisateur par son tag. L'invitation apparaît dans le dashboard de l'invité, en tête des « ateliers rejoints », sous forme de **carte invitation** (bordure ambre, badge « invitation »). Au clic, la **modale Preview** réutilisée affiche le détail de l'atelier avec deux actions : « accepter l'invitation » (→ devient membre puis entre dans l'atelier) ou « refuser » (supprime l'invitation, le propriétaire peut réinviter).
>
> **Schéma DB (migration `add_workshop_invitations_table`, projet `hhkmrejjksjpfetwefju`)** : table `workshop_invitations` (id, workshop_id FK `on delete cascade`, user_id = invité, invited_by = propriétaire, created_at), contrainte `unique (workshop_id, user_id)` (pas de double invitation), index sur `user_id` et `workshop_id`, RLS activée (le serveur passe par la service role key qui bypass la RLS — cf. `getSupabaseServerClient`). Modèle dédié plutôt qu'un statut « pending » sur `workshop_members`, pour ne pas fausser le comptage de membres / la liste des membres tant que l'invitation n'est pas acceptée.
>
> **Server actions (`src/app/actions/workshops.ts`)** : `inviteMemberByTag(workshopId, uniqueTag)` (propriétaire **ou gestionnaire** + **vérification `is_premium` côté serveur** + utilisateur introuvable / soi-même / déjà membre / déjà invité), `getPendingInvitations()` (invitations reçues par l'utilisateur courant, au format `WorkshopCardData`), `acceptInvitation(workshopId)` (insère `workshop_members` role `member` puis supprime l'invitation), `declineInvitation(workshopId)` (supprime l'invitation), `getWorkshopInvitations(workshopId)` + `cancelInvitation(workshopId, targetUserId)` (propriétaire — liste/annule les invitations en attente). Type `PendingInvite = { userId, displayName, uniqueTag, createdAt }`.
>
> **UI** : `dashboard/page.tsx` charge `getPendingInvitations()` et le passe en prop `invitations` à `DashboardClient` (nouvelle prop, carte `InvitationCard`, `invitationToPreview()`, états `acceptingId`/`decliningId`, branche `preview.isInvitation` dans la modale). `SettingsClient.tsx` → Membres & rôles : le bouton « inviter » (placeholder jusque-là) appelle `inviteMemberByTag` (message de retour succès/erreur, Enter supporté) et une liste « invitations en attente » (chargée via `getWorkshopInvitations`, bouton « annuler » par ligne) s'affiche sous le formulaire. **Remplace l'ancien `addMemberByTag`** (qui ajoutait le membre directement, sans invitation — toujours présent dans le fichier mais plus branché à l'UI).
>
> **Hors périmètre (Stripe non intégré)** : accepter une invitation à un atelier Premium devrait, à terme, déclencher la facturation du propriétaire (~3,5€/membre, cf. section 12). Tant que Stripe n'est pas branché, `acceptInvitation` se contente de créer la qualité de membre.

> **Modèle de sécurité Supabase — RLS « server-only »** [AJOUTÉ PAR CLAUDE - 21/06/2026]
>
> Toute la base est accédée **exclusivement côté serveur** via la *service role key* (`getSupabaseServerClient`, `src/lib/supabase.ts`), qui **bypass la RLS**. Aucune table n'est lue/écrite depuis le client avec la clé anon. En conséquence : **toutes les tables ont la RLS activée, sans aucune policy** (migration `enable_rls_on_exam_tables` du 21/06/2026 a aligné `exam_pools`/`exam_questions`/`exam_generated`/`exam_draft` sur ce modèle, fermant une faille où elles étaient exposées à la clé anon). L'audit `get_advisors(security)` ne remonte donc plus que des notices **INFO `rls_enabled_no_policy`** sur toutes les tables — c'est **normal et voulu**, à ne PAS « corriger » en ajoutant des policies (inutile tant que l'accès reste 100 % server-side via service role ; si un jour on ajoute un accès client avec la clé anon, il faudra alors écrire des policies pour les tables concernées).
>
> Durcissement complémentaire (migration `harden_premium_downgrade_function_search_path`) : `search_path = ''` posé sur la fonction trigger `prevent_workshop_premium_downgrade` (résout le WARN `function_search_path_mutable` ; la fonction ne référence aucun objet de schéma, donc sans effet sur son comportement — l'irréversibilité Premium reste garantie, vérifié).

> **Avatar utilisateur — synchronisé au compte (Clerk publicMetadata)** [MODIFIÉ PAR CLAUDE - 21/06/2026]
>
> ⚠️ Il existe **deux systèmes d'avatar distincts** dans le code, à ne pas confondre :
> - **Composer (PNG, le vrai)** : type `AvatarConfig` de `src/components/avatar/avatarConfig.ts` (`face/hair/brow/eyes/nose/mouth/top`), rendu par `AvatarComposer` (compositing de PNG). C'est celui qu'on édite via `/profile/avatar`, et qu'affichent le header connecté (`DashboardHeader`) et la page profil (`ProfileClient`).
> - **Legacy (SVG)** : type `AvatarConfig` de `src/components/avatar/types.ts` (`faceShape/skinColor/…`, numérique), rendu par `AvatarSVG`, utilisé uniquement par la `Navbar` **visiteur** (un utilisateur connecté voit `DashboardHeader`, jamais la Navbar — donc ce système est en pratique invisible une fois connecté).
>
> **Source de vérité de l'avatar Composer = Clerk `publicMetadata.avatarParts`** (clé dédiée, distincte du legacy `publicMetadata.avatarConfig`). Avant le 21/06/2026, cet avatar n'était stocké **que dans le localStorage** (`culture.avatar.v1`), donc différent sur chaque appareil. Désormais : l'éditeur (`/profile/avatar`) persiste via la server action `updateAvatarParts` (`src/app/actions/profile.ts`) puis `user.reload()` ; `DashboardHeader`, `ProfileClient` et l'éditeur lisent `user.publicMetadata.avatarParts` (repli localStorage pour les configs non encore migrées). Le localStorage reste écrit comme cache anti-flicker mais n'est plus la source de vérité.
>
> **Migration des avatars existants** : un avatar créé avant ce changement n'est qu'en localStorage. Il faut le **ré-enregistrer une fois** (éditeur → « valider l'avatar ») pour qu'il soit poussé sur le compte et synchronisé sur tous les appareils. `updateUserMetadata` fait un merge profond côté Clerk (le spread `...user.publicMetadata` est défensif et ne touche pas `uniqueId`/`tier`).

> **Rôle « gestionnaire » + contrôle d'accès réel par rôle** [AJOUTÉ PAR CLAUDE - 21/06/2026]
>
> Trois rôles d'atelier (rang décroissant) : **owner (propriétaire) > manager (gestionnaire) > member (candidat)**. Valeurs internes en anglais, libellés FR via `ROLE_LABEL`. Le gestionnaire a presque les droits du propriétaire **sauf** ce qui touche à l'argent (activation Premium) et la suppression de l'atelier.
>
> **Schéma DB (migration `add_manager_role_to_workshop_members`)** : la contrainte `workshop_members_role_check` autorise désormais `owner` | `manager` | `member`.
>
> **Rangs & règles (serveur, `src/app/actions/workshops.ts`)** : `WorkshopRole` (exporté) + `ROLE_RANK = { owner: 3, manager: 2, member: 1 }`. Nouvelle action `setMemberRole(workshopId, targetUserId, 'manager'|'member')` et `removeMember` réécrit : on ne peut agir que sur un membre de **rang strictement inférieur** au sien, **jamais sur le propriétaire**, et on ne peut pas promouvoir au-dessus de son propre rang (donc : owner promeut/rétrograde/exclut managers+members ; manager promeut/exclut des members mais ne touche pas un autre manager ; transfert de propriété = opération distincte, non implémentée). Les actions de gestion (`updateWorkshopDetails`, invitations `inviteMemberByTag`/`getWorkshopInvitations`/`cancelInvitation`, fichiers `requireManager` dans `workshopFiles.ts`) acceptent **owner OU manager**. `activateWorkshopPremium` et la suppression (`requestDeletionCode`/`confirmDeletion`) restent **owner only**.
>
> **Page atelier (`WorkshopClient.tsx`)** : les deux pastilles sont **fonctionnelles** (plus décoratives) — la pastille « premium » ne s'affiche que si `isPremium` (nouvelle prop, passée depuis `page.tsx` via `workshop.is_premium`) ; la pastille rôle affiche `ROLE_LABEL[currentUserRole]`. `canManage = owner || manager` conditionne : les onglets de gestion (Génération d'examen / Analyse / Génération de cours) — un **candidat ne voit que « Programme éducatif »** — et le bouton « paramètres ».
>
> **Page Paramètres** : `settings/page.tsx` renvoie un candidat (`currentUserRole === 'member'`) vers l'atelier (owner+manager autorisés). Dans `SettingsClient.tsx`, `isOwner` masque l'onglet de nav **« Atelier Premium »**, sa section, et la **« Zone de danger »** (suppression) pour un gestionnaire. La section **Membres & rôles est désormais réelle** (plus de mock) : promouvoir/rétrograder/exclure câblés à `setMemberRole`/`removeMember`, boutons affichés uniquement quand l'utilisateur courant surclasse la cible (`actorRank > ROLE_RANK[member.role]` et cible ≠ propriétaire).
>
> **Dashboard — badge gestionnaire** [MODIFIÉ PAR CLAUDE - 21/06/2026] : `getUserWorkshops` remonte désormais le vrai rôle (`WorkshopCardData.role?`), alimenté dans `roleMap`. Un atelier où l'utilisateur est *gestionnaire* reste dans « ateliers rejoints » mais affiche : une pastille verte « gestionnaire » sur la carte (`WorkshopCard`, à côté de la pastille Premium éventuelle) ET le bon libellé dans la Preview (`workshopToPreview` utilise `w.role` ; `PreviewData.role` étendu à `owner|manager|member`).

> **Passe de sécurité (audit `AUDIT.md`, section 1) + nettoyages associés** [AJOUTÉ PAR CLAUDE - 22/06/2026]
>
> ⚠️ **Cette entrée fait autorité et remplace les descriptions antérieures** concernant la visibilité public/privé, les limites de candidats, et l'ajout direct de membres (entrées plus anciennes des sections 12/14/17 désormais obsolètes sur ces points précis).
>
> **Contrôle d'accès centralisé — `src/lib/authz.ts`** : nouveau module, **point d'entrée unique** des droits d'atelier. Exporte `WorkshopRole`, `ROLE_RANK`, `requireWorkshopRole(workshopId, minRole)` et les raccourcis `requireMember` / `requireManager` / `requireOwner` (renvoient `{ userId, role } | null`) + `assertManager` (variante qui lève). **Règle :** toute server action agissant sur un atelier DOIT appeler l'un de ces helpers en tête — une server action `'use server'` est une URL POST publique, le garde de la page ne protège pas l'action. Déjà appliqué à `examQuestions.ts`, `workshopFiles.ts`, aux demandes d'adhésion et à la suppression d'atelier ; **reste à étendre** aux autres actions de `workshops.ts` (`updateWorkshopDetails`, `setMemberRole`, `removeMember`, invitations…) qui font encore le check en ligne.
>
> **1.1 — IDOR éditeur d'examen corrigé** : les 12 server actions de `src/app/actions/examQuestions.ts` étaient appelables sur n'importe quel `workshopId` sans aucune vérification (lecture/écriture/suppression des questions et examens de tout atelier). Chacune vérifie désormais `requireManager` (lectures `getExamBankData`/`getExamDraft` → retour vide si non autorisé ; écritures → `assertManager` qui lève). La banque contenant les réponses, elle est interdite aux candidats.
>
> **1.2 — Tous les ateliers sont privés ; adhésion sur validation** : la notion public/privé est **abandonnée**. Migration `drop_workshops_private_column` (colonne `workshops.private` supprimée). Nouveau modèle :
> - Table `workshop_join_requests` (migration `add_workshop_join_requests_table`, miroir de `workshop_invitations`, RLS server-only sans policy).
> - `joinWorkshop` **remplacé** par `requestToJoinWorkshop(workshopId)` : crée une **demande en attente** (idempotent ; renvoie `already_member` si déjà membre), n'ajoute jamais directement.
> - Server actions : `getJoinRequests` / `approveJoinRequest` / `rejectJoinRequest` (gestionnaire, via `requireManager`) et `cancelJoinRequest` (le demandeur). `getWorkshopPreview` renvoie désormais `hasRequested`.
> - UI : Dashboard → bouton « demander à rejoindre » / état « demande envoyée » (`DashboardClient`) ; Paramètres → Membres & rôles → section « Demandes d'adhésion » (accepter/refuser, `SettingsClient`).
> - Retraits associés : toggle Public/Privé des Paramètres (+ composant `Toggle` mort), gestion `isPrivate` de `updateWorkshopDetails`, sélecteur de visibilité de la **page de création** (mock non branché). La recherche d'atelier (nom/tag/QR) est **inchangée** — seul le mode d'admission change.
> - **À terme (API)** : l'équivalent d'un atelier « public » sera l'auto-approbation des demandes via l'API publique (ajout d'étudiants par les structures).
>
> **1.3 — Limites de candidats supprimées** : colonnes `max_members_total` / `max_members_monthly` supprimées (migration `drop_workshop_member_limit_columns`), UI et `updateWorkshopDetails` nettoyés (composant `NumInput` mort retiré). Les quotas seront gérés par les structures via l'API.
>
> **1.4 — Fichiers confidentiels** : bucket `workshop-files` **privé** (confirmé), aucune URL publique. `getWorkshopFiles` verrouillé `requireManager`. Téléchargement gestionnaire ajouté : `createSignedDownloadUrl` dans `src/lib/storage.ts` (URL signée éphémère 120 s, force le téléchargement avec le bon nom), action `getFileDownloadUrl(workshopId, fileId)` (`requireManager`), bouton « télécharger » (Lucide `Download`) par ligne de fichier dans `SettingsClient`.
>
> **1.5 — Code mort supprimé** : `addMemberByTag` (ajout direct avec rôle au choix, `'owner'` inclus) retiré. L'ajout par tag légitime passe par `inviteMemberByTag` (Premium, conservé).
>
> **1.7 — Codes de suppression durcis** (`requestDeletionCode` / `confirmDeletion`) : génération via `crypto.randomInt` (CSPRNG, plus de `Math.random`) ; validité 15 min inchangée ; **délai minimal de 5 s entre deux essais** + **plafond de 25 essais** par code (au-delà, code invalidé → renvoyer un email ; jamais de blocage durable) via nouvelles colonnes `deletion_codes.attempts` / `last_attempt_at` (migration `add_deletion_codes_attempt_tracking`). Les deux fonctions utilisent désormais `requireOwner` (basé sur le **rôle** et non `created_by`, pour gérer correctement un futur transfert de propriété).
>
> **1.6 — Facturation / Stripe : différé** (Stripe non branché). Voir l'item dédié dans le backlog §18 ci-dessous.
>
> ⚠️ **État schéma vs prod (22/06/2026)** : les colonnes `private` / `max_members_total` / `max_members_monthly` décrites comme « supprimées » ci-dessus ont dû être **temporairement recréées** en base pour ne pas casser le code encore déployé en production (incident du 22/06, cf. règle « Migrations » §1). Le code de la branche ne les utilise plus ; elles seront re-supprimées une fois la branche déployée — action tracée au backlog §18.

## 18. BACKLOG TECHNIQUE (à traiter plus tard)

- ~~**Re-supprimer 3 colonnes une fois le code « tout privé » déployé**~~ ✅ **RÉSOLU (vérifié le 25/06/2026)** : les colonnes `workshops.private`, `max_members_total`, `max_members_monthly` ont déjà été re-supprimées par la migration `drop_workshop_private_and_member_limits_final` (`20260622185211`, le 22/06 à 18h52, juste après la restauration d'urgence — l'ordre expand/contract a bien été respecté). Vérifié le 25/06 : `information_schema.columns` ne renvoie plus aucune de ces 3 colonnes, et le code de `main` ne les référence plus nulle part. Plus rien à faire.

- **Intégration Stripe & facturation (audit §1.6)** [AJOUTÉ PAR CLAUDE - 22/06/2026] : le webhook `src/app/api/webhooks/stripe/route.ts` est un **stub inerte** (renvoie `{ received: true }` sans rien faire). Sujets à traiter au branchement réel : (1) **vérifier la signature** Stripe avec `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` avant tout traitement ; (2) gérer les événements `customer.subscription.created/updated/deleted` + `invoice.payment_failed` → `setUserTier` (`src/lib/subscription.ts`) ; (3) **idempotence** (un même événement peut être reçu plusieurs fois) ; (4) remplacer le mécanisme **temporaire** d'activation Premium d'atelier (`activateWorkshopPremium`, mot de passe `CultureMDP` + allowlist email) par une activation **uniquement après paiement confirmé** ; (5) **facturation ~3,5 €/membre** à l'acceptation d'une invitation/demande d'adhésion sur un atelier Premium (point d'ancrage : TODO dans `approveJoinRequest`). Plan détaillé : mémoire `stripe_integration_plan.md`.

- **Nettoyage des utilisateurs supprimés** [AJOUTÉ PAR CLAUDE - 14/06/2026] : `workshops.created_by` et `workshop_members.user_id` stockent l'ID Clerk en texte brut, sans clé étrangère ni cascade. Si un utilisateur ayant créé/rejoint des ateliers est supprimé de Clerk, ses lignes deviennent orphelines (le code retombe sur `'Utilisateur'` pour l'affichage, donc pas de crash, mais atelier "fantôme"). À prévoir : soit un webhook Clerk `user.deleted` qui nettoie/réassigne ces lignes côté Supabase, soit un job de nettoyage manuel.

- **Popup d'intro « + nouvel examen » à finaliser** [AJOUTÉ PAR CLAUDE - 20/06/2026] : `ExamenTab.tsx` (`HistoryContent`, état `introOpen`) affiche une popup d'introduction (« Comment fonctionne le générateur d'examen ») avant d'aller à la banque de questions. Les 3 illustrations sont actuellement des placeholders CSS (blob ambre en dégradé radial) en attendant les vraies images fournies par l'utilisateur — à remplacer par des `<img>` aux mêmes dimensions/position (260×230, débordant du cadre de ±64px, rotation ±4deg) une fois les fichiers reçus.

- **Typer le client Supabase de bout en bout (`createClient<Database>`)** [AJOUTÉ PAR CLAUDE - 25/06/2026] : le schéma est désormais généré (`src/lib/database.types.ts`, audit §3.5), mais `getSupabaseServerClient` (`src/lib/supabase.ts`) renvoie volontairement un client **non typé**. Le passer à `createClient<Database>(url, key)` donnerait une sécurité de type sur toutes les requêtes `.from()`, mais révèle **~15 incohérences réelles** à corriger d'abord : colonnes nullables traitées comme non-null (`workshops.created_at`, `unique_tag`…), colonnes `jsonb` (`Json`) castées directement en `string[]` dans `examQuestions.ts`, `role: string` (DB) vs `WorkshopRole` côté code, et un `update(...)` typé `Record<string, …>` rejeté. C'est une **migration à part entière** (plusieurs fichiers d'actions) — à faire quand on s'attaque à la section 4/5 de l'audit, pas dans le périmètre 3.5.

---

> **Design system — tokens de couleur centralisés** [AJOUTÉ PAR CLAUDE - 22/06/2026] : `src/lib/theme.ts` est la **source de vérité des couleurs** pour les styles inline — `palette` (tokens nommés par rôle : `ink`, `inkMuted`, `cream`, `green`, `amber`, `danger`…), `ink(alpha)` (translucides sur l'encre `#2d2a24`), `radius`, `shadow`. **Ne plus écrire de couleur de marque en dur dans un `style={{}}`** : utiliser ces tokens (ex. `color: palette.ink`, `border: \`1px solid ${ink(0.14)}\``). Audit §2.4 : toutes les couleurs de marque hex inline ont été migrées. Restes documentés dans `AUDIT_2.4_design_system.md` (rgba imbriqués dans des chaînes, pages en classes Tailwind `text-[#…]` → à tokeniser via `@theme` dans `globals.css`, quelques attributs SVG). `theme.ts` doit rester synchronisé avec les variables CSS de `globals.css` (`--primary`…) utilisées par les classes Tailwind.

> **Découpage des deux fichiers monstres (audit §3.1)** [AJOUTÉ PAR CLAUDE - 24/06/2026] : `ExamenTab.tsx` (2334 l.) et `SettingsClient.tsx` (2019 l.) ont été éclatés en sous-composants, **sans changement de comportement** (extraction verbatim, `tsc` + `next build` OK). Beaucoup d'entrées plus haut référencent encore « dans `ExamenTab.tsx` → `BankContent` », « dans `SettingsClient.tsx` » : le code correspondant vit désormais dans les fichiers ci-dessous (même logique, juste déplacée).
> - **Onglet examen** — `src/app/[locale]/workshops/[id]/tabs/` : `ExamenTab.tsx` ne contient plus que l'orchestrateur (état partagé, tuiles history/bank/generator, modales examen). `tabs/examen/` contient `examShared.tsx` (types `ExamConfig`/`Question`-adjacents, constantes A4, helpers purs comme `computePagination`/`defaultExamConfig` et petits composants `DiffDots`/`TypePill`/`WeightControls`/`renderAnswerSpace`…), `HistoryContent.tsx`, `BankContent.tsx`, `GeneratorContent.tsx`. ⚠️ `examQuestions.ts` importe toujours `type { ExamConfig }` depuis `ExamenTab` (ré-exporté depuis `examShared`) — ne pas casser ce ré-export.
> - **Paramètres d'atelier** — `src/app/[locale]/workshops/[id]/settings/` : `SettingsClient.tsx` garde la section **Général**, la machinerie « modifications non enregistrées » (formValues/isDirty/intercepteur de navigation/beforeunload), la barre d'enregistrement et les modales de suppression/partage/quitter, et orchestre les sections. `settingsShared.tsx` (types de rôle, `NAV_ITEMS`, `ROLE_RANK`/`ROLE_LABEL`, helpers `Row`/`Switch`/`SmallBtn`/`SectionCard`/`DotRow`/`FileCategoryIcon`/`formatFileSize`/`MOCK_BRICKS`/`avatarGradient`), `MembersSection.tsx`, `FilesSection.tsx`, `PremiumSection.tsx`, `BricksSection.tsx`. **Les 4 sections sont auto-contenues** (état/effets/handlers/modales propres) et **montées en permanence** dans le parent (toggle `display:'contents'`/`'none'`) — c'est volontaire : ça préserve la persistance d'état entre onglets et l'exécution des effets au chargement, exactement comme avant quand l'état vivait dans le parent toujours monté. **Ne pas** repasser en `{activeSection === 'x' && <Section/>}` (montage conditionnel) sans réfléchir : ça réintroduirait des régressions (upload en cours perdu au changement d'onglet, reset des mises à jour optimistes des membres).
>
> Pattern de découpage à réutiliser pour tout futur fichier surdimensionné : tranches verbatim (pas de réécriture), un module `xShared` pour types/constantes/helpers/petits composants, un fichier par responsabilité, validé par `tsc --noEmit` + `next build`.

> **Types Supabase générés = source de vérité du schéma (audit §3.5)** [AJOUTÉ PAR CLAUDE - 25/06/2026] : `src/lib/database.types.ts` est **généré** (MCP Supabase `generate_typescript_types`, ou CLI `supabase gen types typescript --project-id hhkmrejjksjpfetwefju > src/lib/database.types.ts`) — **ne pas l'éditer à la main**, et le **régénérer après chaque migration**. Il est ignoré par ESLint (`eslint.config.mjs`). Les types métier de `src/lib/supabase.ts` (`UserProfile`, `Workshop`, `WorkshopMember`, `WorkshopWithRole`, `WorkshopDetail`) en **dérivent** désormais (`Tables<'workshops'>`, `Omit<Tables<'workshop_members'>, 'role'> & { role: WorkshopRole }`…) au lieu d'être maintenus à la main — ils ne peuvent donc plus diverger des colonnes réelles (avant ce correctif, ils ne connaissaient que `'owner' | 'member'`, sans `'manager'`, et n'étaient importés nulle part : exports morts ayant dérivé en silence). `role` est resserré sur l'union partagée `WorkshopRole` de `src/lib/authz.ts` (le check Postgres `owner | manager | member` n'apparaît pas comme enum dans le schéma généré, donc `role` y est `string`). Le client reste non typé — cf. l'item « Typer le client Supabase de bout en bout » au backlog §18.

> **Revalidation de cache à scope étroit (audit §4.1)** [AJOUTÉ PAR CLAUDE - 25/06/2026] : `src/lib/revalidate.ts` est le **point d'entrée unique** pour invalider le cache après une mutation d'atelier. Il expose `revalidateWorkshop()` (→ `revalidatePath('/[locale]/workshops/[id]', 'layout')` : page atelier + paramètres + session) et `revalidateDashboard()` (→ `revalidatePath('/[locale]/dashboard', 'page')` : mes ateliers / rejoints / corbeille / recherche). **Ne plus jamais écrire `revalidatePath('/', 'layout')`** (l'ancien défaut copié-collé ~27 fois) : il invalidait TOUTE l'app (jardin, profil, tarifs…) à chaque mutation. ⚠️ **Piège Next 16** : `revalidatePath` opère sur la *structure de fichiers de route*, pas l'URL — avec le segment i18n `[locale]`, il FAUT passer le pattern (`/[locale]/workshops/[id]`) + le `type`, jamais un chemin concret (`/fr/workshops/<uuid>` ne matche rien). C'était d'ailleurs le bug latent des appels « étroits » d'`examQuestions.ts` (qui oubliaient `[locale]`). Règle pour toute nouvelle server action de mutation : appeler `revalidateWorkshop()` et/ou `revalidateDashboard()` selon ce qui change réellement (atelier, liste du dashboard, ou les deux) — voir les commentaires en ligne dans `workshops.ts`.

> **Requêtes N+1 éliminées (audit §4.2)** [AJOUTÉ PAR CLAUDE - 25/06/2026] : deux chemins corrigés dans `src/app/actions/workshops.ts`. (1) `confirmDeletion` bouclait `client.users.getUser()` (un appel réseau Clerk **par propriétaire**) + envois d'emails séquentiels → remplacé par un **seul `client.users.getUserList({ userId: ownerIds })`** (batch Clerk) + envois Resend en `Promise.all` ; les deux `select` indépendants (nom de l'atelier / liste des propriétaires) sont aussi parallélisés. (2) `getUserWorkshops` (chemin chaud, appelé à chaque dashboard) parallélise ses deux `select` Supabase indépendants (ateliers / nombre de membres). **Règle générale** : dans une server action, ne jamais boucler un appel réseau (Clerk `getUser`, email…) — préférer un appel batch (`getUserList`) ou `Promise.all` ; et regrouper les requêtes Supabase indépendantes en `Promise.all` (cf. `getExamBankData`, déjà exemplaire).

> **Nettoyage de la corbeille via pg_cron (audit §4.3)** [AJOUTÉ PAR CLAUDE - 25/06/2026]
>
> **Choix retenu — `pg_cron` (cron côté base Supabase).** La suppression définitive des ateliers en corbeille depuis > 7 jours est désormais une **tâche planifiée dans la base**, **plus du code applicatif** : extension `pg_cron` activée + job nommé `cleanup-expired-trashed-workshops` (migration `schedule_trash_cleanup_cron`), tous les jours à **03:00 UTC**, qui exécute `delete from public.workshops where deleted_at is not null and deleted_at < now() - interval '7 days'`. **Pourquoi ce choix** : le nettoyage est un simple `DELETE` SQL sans logique applicative → le cron base est le plus simple et le plus robuste (tourne tout seul, indépendant du trafic, des déploiements et de toute clé/secret).
>
> **Avant (le défaut corrigé)** : la fonction `cleanupExpiredWorkshops` était appelée dans `getUserWorkshops`, donc le nettoyage tournait — une écriture en base — à **chaque** chargement du dashboard, de **chaque** utilisateur (couplage d'une tâche de maintenance à un chemin de lecture chaud). Fonction + appel **retirés**. **Ne PAS réintroduire** d'appel de nettoyage dans un chemin de lecture.
>
> **⚠️ Défaut connu de ce choix** : (1) la planification **vit dans la base** (via une migration versionnée), pas comme une config visible dans le repo — pour la voir/l'auditer il faut interroger la base (`select * from cron.job` / `cron.job_run_details`), elle n'apparaît pas dans le code. (2) Le projet Supabase est sur le **plan Free, qui met le projet en pause après ~1 semaine d'inactivité** : pendant une pause, `pg_cron` **ne tourne pas** (le nettoyage prend alors du retard jusqu'au réveil du projet — acceptable pour une corbeille, mais à garder en tête). Pour modifier fréquence/rétention : `select cron.schedule('cleanup-expired-trashed-workshops', '<cron>', '<sql>')` (job nommé = mise à jour idempotente, pas de doublon). La rétention 7 jours doit rester cohérente avec ce qu'affiche la corbeille du dashboard.
>
> **Alternative écartée (à reconsidérer si besoin) — Vercel Cron.** Un endpoint `/api/cron/cleanup-workshops` (qui ferait le même `DELETE`), déclenché par un cron déclaré dans `vercel.json`, protégé par un secret `CRON_SECRET` (vérifié dans la route). **Avantage** : la planification est **versionnée dans le repo** (visible, revue en PR). **Inconvénients** qui ont fait préférer pg_cron : nécessite un secret à configurer, dépend du déploiement Vercel, et le **plan Hobby limite le cron à 1×/jour**. À privilégier le jour où l'on voudrait une planif tout-en-code ou un nettoyage portant aussi sur des objets non-DB (ex. fichiers Storage orphelins), que `pg_cron` seul ne sait pas faire.

> **🌍 ROUTINE i18n — internationalisation au fil de l'eau (audit §5.1)** [AJOUTÉ PAR CLAUDE - 26/06/2026]
>
> **À LIRE avant d'écrire la moindre chaîne affichée à l'utilisateur.** L'app utilise **next-intl** (v4, FR + EN). Le site vitrine est traduit ; **tout l'app connecté (~10 000 lignes) est encore en français codé en dur** et se traduit **progressivement, jamais en big-bang** (cf. audit §5.1). Cette routine explique comment faire pour ne pas aggraver la dette et la résorber au passage.
>
> **Où vivent les traductions :**
> - `messages/fr.json` (langue par défaut, **fait foi pour la forme** = l'ensemble des clés) et `messages/en.json`. **Les deux fichiers doivent TOUJOURS rester synchronisés** : toute clé ajoutée dans l'un doit l'être dans l'autre, même structure. Une clé manquante côté EN = erreur d'exécution next-intl.
> - Config : `src/i18n/routing.ts` (locales + chemins localisés type `/tarifs`↔`/pricing`), `src/i18n/request.ts`, `src/middleware.ts`. Le `NextIntlClientProvider` est monté une fois dans `src/app/[locale]/layout.tsx` → **tous les composants client de l'app connecté peuvent appeler `useTranslations` directement**, sans prop-drilling (vrai même pour les gros composants `SettingsClient`/`ExamenTab`/`DashboardClient`).
> - **Typage des clés** : `src/i18n/types.ts` augmente next-intl avec `Messages = typeof fr.json` → **`t('clé')` est vérifié par TypeScript** (une clé inexistante casse le `build`, l'IDE autocomplète). À régénérer mentalement quand on ajoute des clés : il suffit qu'elles existent dans `fr.json`. **Ne pas éditer ce fichier** sauf pour changer la stratégie de typage.
>
> **Convention de nommage :** un **namespace par page/feature** (`profile`, `dashboard`, `workshop`, `settings`, `examen`…), clés en **camelCase imbriqué** (`profile.subscription.manage`). Réutiliser les namespaces existants (`nav`, `footer`…) pour les éléments transverses. Jamais de clé « fourre-tout » globale.
>
> **Les 3 patterns d'usage (les seuls à connaître) :**
> 1. **Composant client** (`'use client'`) **ou composant serveur NON-async** : `const t = useTranslations('profile'); … {t('greeting', { name })}`.
> 2. **Composant serveur async / `generateMetadata` / server action** : `const t = await getTranslations('profile');` (le hook `useTranslations` est interdit en async — utiliser `getTranslations` de `next-intl/server`).
> 3. **Interpolation** : `t('energy.sessions', { count: 8 })` avec la clé `"{count} sessions aujourd'hui"`. Pluriels/rich-text : syntaxe ICU de next-intl si besoin.
>
> **LA RÈGLE pour tout futur développement (à appliquer systématiquement) :**
> - **Toute NOUVELLE chaîne visible** par l'utilisateur passe par i18n **dès l'écriture** — on ajoute la clé dans `fr.json` **ET** `en.json`, jamais de littéral FR dans le JSX (rappel de la convention §5). Cela vaut aussi pour les nouveaux composants de l'app connecté.
> - **Quand tu TOUCHES un fichier existant non encore traduit**, migre **au passage** les chaînes de la zone que tu modifies (migration opportuniste). On n'ouvre pas un chantier de traduction dédié ; on résorbe la dette là où on passe déjà.
> - Toujours mettre à jour **`fr.json` et `en.json` ensemble**.
>
> **Exemples de référence vivants** (à **copier** pour les prochaines pages) :
> - **Page Profil** (migrée le 26/06/2026) : `src/app/[locale]/profile/page.tsx` → pattern **serveur** (`generateMetadata` via `await getTranslations('profile')`) ; `ProfileClient.tsx` → pattern **client** (`const t = useTranslations('profile')`, interpolation `greeting`/`energy.sessions`/`energy.nextJoker`, libellés `StatCard` via `t(...)`). Namespace `"profile"`.
> - **Dashboard** (migré le 27/06/2026) : `src/app/[locale]/dashboard/DashboardClient.tsx`, namespace `"dashboard"`. Bon exemple de **conversion de ternaires `locale === 'fr' ? … : …` vers next-intl** : beaucoup de pages de l'app connecté sont déjà bilingues via ce pattern inline (ça « marche » mais c'est dispersé/non centralisé) — la migration consiste à remplacer chaque ternaire par `t('clé')`. À noter : (1) les **sous-composants au niveau module** (`WorkshopCard`, `InvitationCard`) appellent eux-mêmes `useTranslations('dashboard')` (ils sont sous le provider, pas de prop-drilling) ; (2) **clé dynamique** type-safe : `t(\`role.${preview.role}\`)` où `role` est une union littérale ; (3) on garde la prop `locale` pour les `href`/`toLocaleString(locale)`, on ne l'utilise plus pour choisir la langue du texte.

> **📋 Avancement i18n de l'app connecté (audit §5.1) ✅ TERMINÉ (11/07/2026) — page par page** [MODIFIÉ PAR CLAUDE - 11/07/2026]
>
> Suivi de la migration progressive, désormais achevée sur tout le périmètre de l'audit. **✅ = traduit via next-intl** · **🔶 = bilingue mais via ternaires inline (à migrer)** · **⬜ = FR codé en dur**.
> - ✅ Site vitrine (accueil, à propos, contact, mentions légales, Navbar, Footer, WaitlistForm), **Profil**, **Dashboard**, **Génération d'examen** (tout l'onglet : `ExamenTab` + `tabs/examen/{HistoryContent,BankContent,GeneratorContent,examShared}` + `QuestionEditor` — namespace `examen`), **Éditeur d'avatar** (`profile/avatar/page.tsx` — namespace `avatar` ; libellés/hints de catégories `CATS` traduits à l'affichage via clé dynamique `t(\`cat.${c.key}\`)`/`t(\`hint.${activeCat}\`)`, `CATS` reste la source des `key`/`parts`), **Paramètres d'atelier** (`settings/SettingsClient.tsx` + `settingsShared` + `MembersSection`/`FilesSection`/`PremiumSection`/`BricksSection` — namespace `settings`), **Page atelier** (`workshops/[id]/WorkshopClient.tsx`, namespace `workshop`) + **`ShareQRModal.tsx`** (composant partagé, namespace dédié `shareQr`), **`DashboardHeader.tsx`/`Navbar.tsx`** (derniers ternaires migrés vers 5 nouvelles clés du namespace `nav` : `myWorkshops`, `profile`, `goPremium`, `signOut`, `switchTo`).
> - ✅ **Jardin** (`garden/GardenClient.tsx`, 1003 l. — namespace `garden`) [MODIFIÉ PAR CLAUDE - 11/07/2026] : les sous-composants module-level (`ItemCard`, `Panel`) appellent eux-mêmes `useTranslations('garden')` (même pattern que `WorkshopCard`/`InvitationCard` du Dashboard). Les anciennes maps de libellés `SPECIES_LABEL`/`KIND_LABEL`/`COS_LABEL` (espèce d'arbre / nature de tuile / déco, utilisées uniquement en `title=` d'infobulle) sont supprimées — remplacées par des **clés dynamiques** `t(\`species.${species}\`)`/`t(\`kind.${kind}\`)`/`t(\`cosmetic.${cos}\`)` directement sur les unions littérales déjà exposées par `gardenEngine.ts` (`Species`/`AnyKind`/`Cosmetic`), sans toucher au moteur (`gardenEngine.ts` reste hors périmètre — aucune chaîne utilisateur). La prop `locale` de `GardenClient` (devenue inutile — aucun `href`/`toLocaleString` ne s'en servait, contrairement au Dashboard) a été retirée, ainsi que son passage depuis `page.tsx`. `garden/page.tsx` n'avait aucune chaîne à migrer.
> - ✅ **Derniers onglets/pages atelier + pages de flux** (11/07/2026) : `tabs/ProgrammeTab.tsx` (namespace `programme`), `tabs/AnalyseTab.tsx` (namespace `analyse`), `tabs/CoursTab.tsx` (namespace `cours`), `session/page.tsx` (namespace `session`, pattern client `useTranslations`), `workshops/new/WorkshopNewClient.tsx` (namespace `workshopNew`), `create/page.tsx` (namespace `createWorkshop` — conversion des ternaires `fr ? … : …` comme sur le Dashboard). **Deux namespaces renommés pour éviter une collision** avec des namespaces marketing déjà existants portant le même nom : `pricing/PricingClient.tsx` (page compte connecté, tiers Gratuit/Premium/Premium+) → namespace **`accountPricing`** (distinct de `pricing`, section marketing publique) ; `create/page.tsx` (flux connecté de création d'atelier) → namespace **`createWorkshop`** (distinct de `create`, section marketing publique). `search/page.tsx` reste hors périmètre : simple redirection de 7 lignes, aucune chaîne affichée.
> - ✅ **Pages d'authentification + témoignages homepage** (11/07/2026, hors liste initialement suivie mais même dette — traité à la demande explicite avant de clore le point d'audit) : `sign-in/[[...sign-in]]/page.tsx` et `sign-up/[[...sign-up]]/page.tsx` — composants serveur async, pattern `const t = await getTranslations('auth.signIn' | 'auth.signUp')`, namespace partagé `auth` avec sous-clés `signIn`/`signUp`. Les 3 témoignages de la homepage (`[locale]/page.tsx` → `HomePageClient`) : `role`/`content` migrés vers `testimonials.{marie,thomas,sophie}.{role,content}` (namespace `testimonials` déjà existant, juste étendu) ; `name`/`avatar`/`color` restent des données locales non traduisibles (identiques dans les deux langues). La prop `locale` de `HomePageClient` reste nécessaire (encore utilisée pour un `href`). **Avec ce lot, tout le périmètre i18n identifié par l'audit §5.1 est migré** — les seuls `locale === 'fr'` restants dans le code sont des usages techniques légitimes (locale Clerk, format de date, calcul de la locale alternative) ou le texte juridique long de `legal/page.tsx` (déjà sous `useTranslations`, rendu en deux blocs JSX par choix — trop long pour un découpage clé par clé).
>
> **Patterns settings (27/06)** : `NAV_ITEMS`/`ROLE_LABEL` (settingsShared) restent la **source des clés** (`id`/rôle), traduits à l'affichage via `t(\`nav.${id}\`)`/`t(\`role.${role}\`)`. `formatFileSize(bytes, units)` prend désormais les **unités en paramètre** (o/Ko/Mo ↔ B/KB/MB) — la fonction pure ne peut pas lire `t`. `MOCK_BRICKS` (données d'exemple) laissées en FR ; les placeholders de **format** (`#tag…`, `000000`) ne sont pas traduits (neutres).
> - **Mock data** (ex. `CULTURE_MODULES` dans `DashboardClient`) : **laissé en français volontairement** — c'est de la donnée d'exemple destinée à venir de la base, pas du chrome d'UI ; ne pas la passer en clés i18n. Idem les **valeurs de données stockées en base** affichées telles quelles (`exam.status` = `publié`/`brouillon`/`archivé`, `exam.date` = `aujourd'hui`) : la valeur stockée reste en FR ; on traduit seulement à l'**affichage** via un petit helper (`statusLabel` dans `HistoryContent`), pas la donnée.
>
> **Patterns établis pour la génération d'examen (à réutiliser sur les fichiers à fort couplage)** [27/06/2026] :
> - **Fonctions pures qui renvoient une chaîne** (ex. `renderAnswerSpace`) : ne peuvent pas appeler `useTranslations` (règle des hooks). Soit on passe la chaîne déjà traduite en paramètre (`renderAnswerSpace(q, t('answerSpace.audio'))`), soit on déplace la fonction dans le composant pour fermer sur `t` (ex. `answerSummary`, redéfini localement dans `BankContent`).
> - **Maps de libellés indexées par un type** (`RESPONSE_TYPE_LABELS`, `QUESTION_TYPE_LABELS`, `IDENTITY_LABELS`) : remplacer `MAP[type]` par une **clé dynamique type-safe** `t(\`responseType.${type}\`)` — valide car `type` est une union littérale (le template donne une union de clés existantes). NE PAS faire `t('responseType.' + x)` (donne `string`, rejeté par le typage des clés). Les anciens consts restent exportés mais inertes.
> - **Clé dynamique sur une valeur de données `string`** (ex. `exam.status`) : `t(\`status.${s}\`)` ne type-check pas (s est `string`). Utiliser un petit helper à `switch`/ternaire (`s === 'publié' ? t('status.publié') : …`) qui ne passe que des littéraux à `t`.
> - **Collision de nom `t`** : si le composant a déjà des paramètres/variables nommés `t` (callbacks `.map(t => …)`), nommer le traducteur **`tr`** (fait dans `BankContent`).
>
> **Checklist pour ajouter/migrer une chaîne :** (1) choisir le namespace de la page ; (2) ajouter la clé dans `fr.json` **et** `en.json` ; (3) remplacer le littéral par `t('…')` (ou `await getTranslations` si async) ; (4) `npm run build` (le typage des clés est vérifié au build). **Pas de garde-fou automatique** (un lint « chaînes en dur » crierait des milliers de faux positifs sur l'app non encore migrée) — c'est une **discipline manuelle** documentée ici.
>
> **Au passage (26/06/2026)** : nettoyage de l'email de contact obsolète `contact@evalia.app` → `contact@culture.com` (placeholder choisi par le fondateur ; ⚠️ domaine pas encore confirmé/possédé — l'envoi réel passe par `src/lib/emails.ts` sur `scellow.com`) dans `messages/fr|en.json`, `contact/page.tsx`, `legal/page.tsx` (RGPD FR+EN) et les exemples commentés `noreply@culture.com` des routes `api/contact|waitlist`. Si la vraie boîte support diffère, corriger ces emplacements.

> **Extraction de la logique métier « membres » vers `lib/workshops/members.ts` (audit §5.2)** [AJOUTÉ PAR CLAUDE - 11/07/2026]
>
> Les 13 fonctions de `src/app/actions/workshops.ts` liées aux membres d'un atelier (demandes d'adhésion : `requestToJoinWorkshop`/`getJoinRequests`/`approveJoinRequest`/`rejectJoinRequest`/`cancelJoinRequest` ; invitations : `inviteMemberByTag`/`getPendingInvitations`/`acceptInvitation`/`declineInvitation`/`getWorkshopInvitations`/`cancelInvitation` ; rôles/exclusion : `setMemberRole`/`removeMember`) ont été **décomposées** : la logique métier (requêtes Supabase, règles d'idempotence, règles de rang) vit désormais dans **`src/lib/workshops/members.ts`**, un module pur sans `'use server'`, sans `auth()` Clerk et sans `revalidatePath`. Les fonctions de `workshops.ts` deviennent de simples **wrappers** : authz (`requireMember`/`requireManager`/`requireOwner`, `syncUserProfile`) → appel à `membersLib.xxx(...)` → `revalidateWorkshop()`/`revalidateDashboard()` si `result.success`.
>
> **Pourquoi** (cf. audit §5.2, objectif « ajouter un étudiant via API ») : aujourd'hui aucune route API publique n'existe (et ce n'est **pas** l'objet de ce chantier — seule la logique a été extraite, pas de route créée). Mais le jour où l'on voudra exposer `POST /api/v1/workshops/:id/members` (auth par clé API plutôt que session Clerk), cette route pourra appeler **exactement les mêmes fonctions** de `lib/workshops/members.ts` après avoir résolu l'identité de l'appelant autrement — sans dupliquer les règles métier. Les fonctions de rôle (`setMemberRole`/`removeMember`) prennent un paramètre `actor: { userId, role }` déjà résolu (pas d'appel `auth()` interne) pour rester agnostiques de la façon dont l'acteur a été authentifié.
>
> **⚠️ Piège Next 16 / Turbopack rencontré** : un fichier `'use server'` ne peut pas faire `export type { X } from '@/lib/...'` ni même `import type { X } from '@/lib/...'; export type { X };` — Turbopack traite ces re-exports de type comme des exports de valeur lors de l'analyse des server actions et le **build échoue** (`Export X doesn't exist in target module`), alors que `tsc --noEmit` et `next lint` ne détectent rien (d'où l'importance de valider par `npm run build`, pas seulement `npm run typecheck`, cf. §7). Solution : **redéclarer** le type localement dans le fichier `'use server'` (structurellement identique, pas d'import) — c'est exactement le pattern déjà utilisé pour `WorkshopRole` (redéclaré depuis `@/lib/authz`) et maintenant appliqué à `PendingInvite`/`JoinRequestStatus` (redéclarés depuis `@/lib/workshops/members`). Un `import type { X } from '@/lib/...'` **sans** ré-export (juste pour typer une variable locale) reste, lui, tout à fait valide dans un fichier `'use server'`.
>
> **Pattern à réutiliser pour tout futur domaine** (§5.3 va dans le même sens pour `Question`/`ExamConfig`) : `lib/<domaine>/<sous-domaine>.ts` = requêtes Supabase + règles métier, prend des identités déjà résolues en paramètres, retourne des résultats simples (`{ success, error? }` ou des données) ; le fichier `'use server'` ne garde que l'authz Clerk + les effets de bord Next.js (`revalidatePath`). `WorkshopCardData` (type plus large, utilisé aussi hors du domaine membres) reste défini dans `workshops.ts` et importé en `import type` (sans ré-export) par `lib/workshops/members.ts` — acceptable tant que le type n'a pas encore été déplacé dans un module de types partagé (§5.3, non traité ici).
>
> **Suite (même jour) — reste de `workshops.ts` + `workshopFiles.ts`** : même découpage étendu à tout ce qui restait. `src/lib/workshops/core.ts` (lecture/mise à jour d'un atelier : `getUserWorkshops`, `getTrashWorkshops`, `getWorkshop`, `getWorkshopPreview`, `updateDetails`, `activatePremium`, `uploadCover`, `search`) et `src/lib/workshops/lifecycle.ts` (`createWorkshop`, `requestDeletionCode`, `confirmDeletion`, `restoreWorkshop` — regroupés car ils partagent les mêmes effets de bord Clerk/Resend). `workshops.ts` est passé de ~1075 à ~230 lignes. Même chose pour `src/app/actions/workshopFiles.ts` → `src/lib/workshops/files.ts` (upload par ticket signé, téléchargement, renommage, suppression).
>
> **Cas particulier `activateWorkshopPremium`** : le mode de test temporaire (mot de passe en dur + allowlist email admin, cf. plus haut) **reste dans le wrapper**, pas dans `core.ts` — c'est un garde d'autorisation (qui a le droit d'activer), pas une règle métier réutilisable par une future API ; `core.ts` n'expose que `activatePremium(workshopId)` (vérifier l'état + poser le flag), appelé seulement après que le wrapper a validé propriétaire + mot de passe. Distinction à reproduire : tout ce qui répond à « qui a le droit ? » reste dans le fichier `'use server'` (à côté de `requireOwner`/`requireManager`), tout ce qui répond à « qu'est-ce qui se passe ensuite ? » va dans `lib/`.
>
> **Cas particulier `uploadWorkshopCover`** : extraire un `File` d'un `FormData` (`formData.get('file')` + `instanceof File`) reste dans le wrapper — c'est une préoccupation de transport HTTP (comment le client a soumis la requête), pas une règle métier. La validation du fichier lui-même (type MIME, taille) est en revanche dans `core.ts` (`uploadCover`), car une future API prendrait un fichier différemment mais devrait appliquer exactement les mêmes règles.
>
> **`requestDeletionCode`/`confirmDeletion` (lifecycle.ts) incluent les appels Clerk (`clerkClient().users.getUser`) et Resend** : contrairement à l'intuition « auth = wrapper, métier = lib », ces appels ne servent pas à authentifier l'appelant (déjà fait par `requireOwner` dans le wrapper) mais à déterminer *qui reçoit l'email* — c'est une conséquence métier de l'action, identique quel que soit le canal d'appel (site ou future API), donc ça reste dans `lib/`.

> **§5.3 — types de domaine `Question`/`ExamConfig` déplacés vers `lib/workshops/examTypes.ts`, puis extraction de `examQuestions.ts`** [AJOUTÉ PAR CLAUDE - 11/07/2026]
>
> Avant : `src/app/actions/examQuestions.ts` (server action `'use server'`) importait `Question`/`QuestionPart` depuis `QuestionEditor.tsx` et `ExamConfig` depuis `ExamenTab.tsx` — une server action dépendait de composants UI, empêchant toute réutilisation de la logique (audit §5.3). `ExamenTab.tsx` faisait même un `export type { ExamConfig } from './examen/examShared'` **uniquement** pour que `examQuestions.ts` puisse l'importer, créant un cycle de dépendance UI ↔ server action.
>
> **`src/lib/workshops/examTypes.ts`** est désormais la source de vérité de tous les types de domaine de l'examen : `QuestionType`, `ResponseType`, `QuestionPart`, `Question`, `IdentitySide`, `CandidateIdentity`, `CustomField`, `ExamPresentation`, `ExamSection`, `QuestionWeight`, `ExamConfig`, `ExamPool`, `GeneratedExam`, `ExamDraft`. Au passage, deux duplications supprimées : `examShared.tsx` définissait `Pool`/`Exam` et `examQuestions.ts` définissait séparément `ExamPool`/`GeneratedExam` — mêmes formes, deux sources. Les deux noms historiques `Pool`/`Exam` sont conservés comme **alias locaux** dans `examShared.tsx` (`export type Pool = ExamPool; export type Exam = GeneratedExam;`) pour ne rien casser dans `BankContent.tsx`/`GeneratorContent.tsx`/`HistoryContent.tsx`, qui continuent d'importer `Pool`/`Exam` de `examShared.tsx` **sans aucun changement**.
>
> `QuestionEditor.tsx` et `examShared.tsx` ré-exportent désormais ces types (`import type {...} from '@/lib/workshops/examTypes'; export type {...};`) plutôt que de les définir localement. **Note** : ces deux fichiers ne sont **pas** `'use server'` (ce sont des composants `'use client'`) — le piège Turbopack `export type {...} from '...'` documenté plus haut n'a été observé que sur des fichiers `'use server'` (l'analyse du manifeste de server actions) ; rien ne prouve qu'il s'applique aussi ici. Le pattern import-puis-export a été repris par cohérence avec `workshops.ts`/`examQuestions.ts`, pas par nécessité vérifiée — à retester si on veut simplifier en `export type {...} from '...'` direct dans ces deux fichiers. Les constantes/labels UI (`QUESTION_TYPE_LABELS`, `IDENTITY_LABELS`, `DEFAULT_IDENTITY_ORDER`…) et les types **purement UI** (`SortBy`, `SortDir`, `FlatEntry`, `PaginationInfo` — état de tri/pagination/regroupement d'affichage) restent dans `examShared.tsx`/`QuestionEditor.tsx`, ils ne sont pas des types de domaine.
>
> **`src/lib/workshops/exam.ts`** porte ensuite la logique métier de `examQuestions.ts` (mapping row Supabase ↔ `Question` via `rowToQuestion`/`questionToRow`/`normalizePart`, requêtes `exam_questions`/`exam_pools`/`exam_generated`/`exam_draft`), même découpage que `members.ts`/`core.ts`/`lifecycle.ts`/`files.ts`. Particularité de ce fichier par rapport aux autres : les fonctions **lèvent une exception** au lieu de renvoyer `{ success, error }` — comportement conservé tel quel (c'était déjà le style de `examQuestions.ts`, cohérent avec l'appel en fire-and-forget `.catch(console.error)` côté `ExamenTab.tsx`). `examQuestions.ts` (~250 → ~90 lignes) ne garde que `assertManager`/`requireManager` + `revalidateWorkshop()`.
>
> **`examQuestions.ts` reste `assertManager`/`requireManager`, pas les helpers `lib/authz` bruts** : contrairement à `workshops.ts` (qui appelle `requireOwner(workshopId)` puis lit `.userId` sur le contexte), ici l'acteur n'est jamais transmis à `lib/workshops/exam.ts` (aucune fonction n'a besoin de savoir qui a fait l'appel, contrairement à `finalizeUpload`/`createWorkshop` qui ont besoin d'un `userId` pour la colonne `created_by`) — l'authz reste donc une pure vérification bloquante dans le wrapper, sans donnée à faire transiter vers `lib/`.

*Dernière mise à jour : 11/07/2026 [MODIFIÉ PAR CLAUDE]*
