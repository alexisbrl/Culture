# Culture — Guide Claude Code

> Source de vérité pour le workflow et les conventions de développement. Toujours chargé en entier — reste volontairement court.
>
> **Le projet tient en quatre documents, et rien d'autre :** ce fichier (les règles de travail), `docs/product-spec.md` (ce que fait le produit), `docs/architecture.md` (comment il est construit), `docs/backlog.md` (l'écart entre la cible et le réel). Les trois autres sont dans `docs/`, à lire à la demande — voir §9.
>
> Dernière mise à jour : 09/09/2026

---

## 1. RÈGLES ABSOLUES

### Ne jamais halluciner
Si tu n'es pas certain d'une information (API, comportement d'une lib, structure d'un fichier), **cherche dans le code ou dans la doc** plutôt que d'inventer. Si tu ne sais pas, dis-le explicitement.

### Poser des questions avant d'exécuter
**Après CHAQUE prompt de l'utilisateur**, avant d'exécuter quoi que ce soit, identifie systématiquement les ambiguïtés. S'il y en a — même mineures — pose tes questions de clarification et attends la réponse avant de commencer. N'exécute jamais sans avoir compris l'intention précise. S'il n'y a vraiment aucune ambiguïté, tu peux exécuter directement.

### Parler produit, jamais code
L'utilisateur **ne lit jamais le code** — il ne développe pas, il décide. Aucune réponse ne doit contenir de nom de fichier, de fonction, de table ou de colonne, ni d'extrait de code, sauf s'il le demande explicitement. On parle de « le bouton d'annulation », « la liste des chapitres », jamais de leur nom technique.

Les réponses sont **courtes** : la recommandation, sa raison en une phrase, et la question qui bloque s'il y en a une. Pas de reformulation de ce qu'il vient de dire, pas d'éventail d'options — on recommande. Recadrage du 23/08/2026, après un week-end perdu à des échanges illisibles pour lui.

### Icônes : Lucide React uniquement
Toujours utiliser exclusivement les icônes de `lucide-react`. Ne jamais créer d'icônes SVG inline custom, ne jamais utiliser d'autres librairies d'icônes. Si une icône Lucide ne correspond pas exactement au besoin, prendre la plus proche ou un emoji texte — jamais du SVG personnalisé.

### Infobulles : composant `Tooltip` uniquement
Toute infobulle passe par `<Tooltip content={…}>` (`src/components/ui/tooltip.tsx`). L'attribut `title` du HTML est interdit sur toute balise DOM — il est dessiné par le système d'exploitation, hors du DOM, donc impossible à mettre à l'esthétique du site. La règle est tenue par ESLint (`no-restricted-syntax`, en `error`, donc bloquante en CI), et c'est elle qui fait foi pour recenser les infobulles existantes. Détail et pièges (nom accessible, bouton désactivé, infobulles imbriquées) : `docs/architecture.md`.

### Lexique : notion (produit, code) = brick (base)
Ce que l'utilisateur voit et ce que le code nomme est **« notion »** (renommé depuis « brique de connaissance » en 08/2026). Les tables Supabase, elles, restent nommées `workshop_bricks`, `brick_mastery`, `exam_question_bricks` et leurs colonnes `brick_id` — un renommage en base est une migration destructive, différée (voir `docs/backlog.md`). Ne jamais introduire de nouveau code ou de nouvelle chaîne visible utilisant « brique »/« brick » ; les rares points de contact avec les noms de table Supabase portent un commentaire `// table encore nommée bricks en base…`.

### Ne pas devancer la feuille de route
Ne pas développer une fonctionnalité avant son tour. **L'ordre de travail est celui des trimestres de `docs/backlog.md`** — les sections sont l'ordre, et c'est le seul endroit qui porte le « quand ». `docs/product-spec.md` décrit le produit fini : y voir une fonctionnalité ne veut pas dire qu'elle est à faire maintenant.

### API-first — checklist par défaut pour tout nouveau développement
Chaque domaine fonctionnel doit pouvoir un jour exposer une API interne propre, sans logique couplée à l'UI. Ces pratiques s'appliquent **dès l'écriture** de tout nouveau code, jamais migrées plus tard en bloc :
- **i18n** : toute chaîne visible passe par next-intl dès l'écriture, dans `fr.json` **et** `en.json`. Détail : `docs/architecture.md`.
- **Logique métier dans `src/lib/<domaine>/…`** (module pur, sans `'use server'`) ; le fichier `'use server'` dans `app/actions/` reste un wrapper fin (authz → appel `lib/` → revalidation). Détail : `docs/architecture.md`.
- **Contrôle d'accès** : toute server action sur un atelier appelle `requireMember`/`requireManager`/`requireOwner` (`src/lib/authz.ts`) en tête.
- **Revalidation** : jamais `revalidatePath('/', 'layout')` — toujours `revalidateWorkshop()`/`revalidateDashboard()` (`src/lib/revalidate.ts`).
- **Couleurs de marque** : toujours via `src/lib/theme.ts` (`palette`, `ink()`), jamais de hex en dur.
- **Validation avant de considérer une tâche terminée** : `npm run build`, pas seulement `tsc --noEmit` (Turbopack peut casser des re-exports de type sans que `tsc`/`eslint` le détectent — détail : `docs/architecture.md`).

### Web-first
Toute fonctionnalité est développée et validée sur web avant d'être portée sur iOS/Android.

### Formats de fichiers
PDF et texte sont les seuls formats acceptés nativement par le modèle, donc les seuls qu'on lise aujourd'hui. Word, PowerPoint, audio, vidéo demandent une conversion préalable — chantier à part entière, voir `docs/backlog.md`.

### Migrations de base de données : jamais de destruction avant déploiement du code
La base Supabase (`hhkmrejjksjpfetwefju`) est **partagée par le code local ET le code déployé en production** (get-culture.com). Une migration prend effet **immédiatement**, alors qu'un changement de code n'est en ligne qu'après `push → PR → merge dans main → déploiement Vercel`.

**Règle de séquencement « expand / contract » :**
- **Ajouter** une colonne/table (expand) : sans danger à tout moment (le code déployé l'ignore).
- **Supprimer ou renommer** une colonne/table, ou changer un type (contract) : **interdit tant que le code déployé en production lit encore cet objet**. Beaucoup de `select` ne lisent que `{ data }` en ignorant `{ error }` → l'échec est **silencieux** (`data = null`) et casse la fonctionnalité sans alerte.
- Ordre correct pour retirer un champ : (1) déployer le code qui ne l'utilise plus → (2) seulement ensuite, appliquer la migration de suppression.
- **Toute migration en attente de déploiement se note dans `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md`** — point d'entrée unique, à lire dès que l'utilisateur demande ce qu'il reste à faire « une fois en ligne ». Le SQL lui-même va dans `docs/migrations/<date>-<sujet>.sql`. Si la section « À appliquer » du fichier dit `AUCUN`, il n'y a rien à faire.
- Cette règle vient d'un incident réel : le 22/06/2026, une migration de suppression appliquée avant que le code cesse de lire les colonnes visées a cassé les ateliers en ligne, en silence.

**Garde-fous conditionnels au mode chantier.** Les migrations Supabase (`apply_migration`, `execute_sql`), l'écriture de `src/lib/database.types.ts` et les modifications du Jardin sont **bloquées tant qu'un chantier est ouvert** — c'est-à-dire tant que `docs/chantiers/EN-COURS.md` ne contient pas `AUCUN` : en autonomie, personne ne relit avant que la base ne change. En session interactive (hors chantier), elles sont autorisées normalement. Mécanisme : hook `PreToolUse` → `.claude/hooks/chantier-guard.mjs`, branché dans `.claude/settings.local.json`. En chantier, la conduite à tenir est celle du fichier : écrire le SQL dans `docs/migrations/`, le documenter dans la feuille de route, laisser l'humain l'appliquer. Les interdictions inconditionnelles (`git push --force`, écriture de `.env*`, `rm -rf`) restent dans `permissions.deny`, hors de portée de toute condition.

### Toujours décrire la version finale, jamais l'état d'avancement
Les quatre documents décrivent **le produit tel qu'il doit être**, pas ce qui est en ligne. Aucun marqueur « fait / à faire » dans le corps d'un document : un statut posé à quatre endroits devient faux à la première mise en ligne, et personne ne le corrige.

L'écart entre la cible et le réel se lit **en comparant le produit au document** — c'est cette comparaison qui fait foi, pas une liste. `docs/backlog.md` n'en est que le raccourci, tenu à jour pour ne pas avoir à refaire la comparaison à chaque fois : il doit donc être entretenu consciencieusement, et **renvoyer aux pages et aux parties d'architecture qu'il appelle**.

**Décisions et cas pratiques :** un arbitrage tranché ou un piège rencontré peut être consigné **en annexe, en fin de document**, et **très concis** — une à trois lignes. Jamais dans le corps, qui ne décrit que la cible. Et **ça se supprime dès que c'est trop éloigné du produit actuel** : une annexe qui parle d'un état révolu n'informe plus, elle induit en erreur. `git log` garde tout, il n'y a rien à préserver.

Corollaire : **pas de journal, pas d'historique, pas de feuille de route de chantier terminé** dans `docs/`. Ces fichiers ont existé jusqu'au 09/09/2026 et représentaient les deux tiers du volume documentaire — supprimés pour cette raison.

### Mettre à jour la documentation
À la fin de chaque grosse tâche (feature livrée, PR mergée, refactor structurant), mets à jour le document concerné :
- Règle de workflow, convention, stack, structure → **ce fichier**.
- Ce que fait le produit (page, fonctionnalité, périmètre) → `docs/product-spec.md`.
- Comment il est construit (architecture serveur, i18n, patterns UI, génération par IA) → `docs/architecture.md`.
- Écart entre la cible et le réel, dette technique, TODO → `docs/backlog.md`.
- Migration de base qui attend un déploiement → `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md` (voir §1).

---

## 2. CONTEXTE PROJET

**Nom :** Culture (nom de travail — nom produit final à confirmer)
**Type :** Application SaaS d'apprentissage — générateur pédagogique avec IA
**Plateforme :** Web en premier, iOS et Android ensuite
**Repo GitHub :** https://github.com/alexisbrl/Culture
**Lancer le dev :** `npm run dev` depuis ce dossier

### Notion
Accès à Notion via le connecteur MCP — le projet Culture y est documenté en détail, pour tout contexte supplémentaire absent de `CLAUDE.md`/`docs/`.

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
| Typographie | Hanken Grotesk (seule police — pas de sérif, `--font-serif` alias vers la sans) |
| Auth | Clerk (`@clerk/nextjs`) |
| Base de données | Supabase (`@supabase/supabase-js`) |
| UI | shadcn/ui + Base UI (`@base-ui/react`) |
| Icônes | Lucide React |
| Forms | React Hook Form + Zod |
| i18n | next-intl (FR + EN) |
| Email | Resend |
| Tests E2E | Playwright (à installer) |
| Tests unitaires | Vitest (installé le 19/08/2026 — `npm run test:unit`, portée volontairement étroite, voir §7) |

> **Important Next.js 16 :** Lire `node_modules/next/dist/docs/` avant d'écrire du code Next.js — cette version a des breaking changes par rapport aux connaissances d'entraînement. Respecter les avertissements de dépréciation.

---

## 4. STRUCTURE DU PROJET

```
culture/
├── src/
│   ├── app/
│   │   ├── [locale]/            # Routes i18n (next-intl)
│   │   │   ├── workshops/[id]/  # + settings/ (4 sections, voir settingsShared) ; tabs/examen/ (banque + éditeur A4)
│   │   │   ├── dashboard/       # mes ateliers + recherche + Preview d'atelier
│   │   │   ├── garden/          # Jardin « Terra Nil »
│   │   │   ├── create/ · profile/ · pricing/ · sign-in/ · sign-up/ · legal/ · about/ · contact/
│   │   │   └── layout.tsx
│   │   ├── actions/             # Server actions — wrappers fins (voir docs/architecture.md)
│   │   ├── api/                 # API routes (contact, recharge du parcours, webhooks Clerk/Stripe)
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/              # Composants React réutilisables (ui/ = shadcn, sections/ = sections de page)
│   ├── lib/
│   │   ├── workshops/           # Logique métier par domaine (members, core, lifecycle, files, exam, examTypes)
│   │   ├── ingest/              # Génération par IA : étapes, consignes, recharge, journal (voir docs/architecture.md §7)
│   │   ├── authz.ts             # Contrôle d'accès centralisé
│   │   ├── revalidate.ts        # Revalidation de cache à scope étroit
│   │   ├── theme.ts             # Tokens de couleur/design
│   │   ├── storage.ts           # Abstraction stockage de fichiers
│   │   ├── supabase.ts          # Client Supabase + types dérivés
│   │   └── database.types.ts    # Généré — ne pas éditer à la main
│   ├── i18n/                    # Config next-intl
│   └── proxy.ts                  # Auth + i18n proxy (anciennement middleware.ts, renommé pour Next.js 16)
├── messages/{fr,en}.json         # Traductions
├── docs/                         # product-spec · architecture · backlog (lus à la demande)
│                                 # + migrations/ · chantiers/ · design/ (outils, pas des documents)
├── tests/{e2e,unit}/
└── public/
```

---

## 5. CONVENTIONS DE CODE

> Les règles à appliquer sans réfléchir, chargées d'office. Le **fonctionnement**
> qu'elles servent est décrit dans `docs/architecture.md`, à lire avant d'écrire.

### Les huit règles qui ne se discutent pas

1. **Toute chaîne visible passe par next-intl dès l'écriture**, dans `fr.json` **et** `en.json`. Jamais de littéral dans le JSX, jamais de migration différée à un futur audit.
2. **La logique métier va dans `src/lib/<domaine>/…`** — module pur, sans `'use server'`, sans `auth()`, sans `revalidatePath`. Le fichier `'use server'` d'`app/actions/` reste un wrapper fin : authz → appel `lib/` → revalidation.
3. **Toute server action ou route d'API sur un atelier appelle `requireMember`/`requireManager`/`requireOwner` (`src/lib/authz.ts`) en tête.** C'est une URL POST publique ; le garde de la page ne protège rien.
4. **Ne jamais lire `workshop_members.role` directement** pour vérifier un droit — la lecture échapperait à la mémorisation par requête.
5. **Revalidation à scope étroit** : `revalidateWorkshop()` / `revalidateDashboard()` (`src/lib/revalidate.ts`). **Jamais `revalidatePath('/', 'layout')`.**
6. **Couleurs de marque via `src/lib/theme.ts`** (`palette`, `ink()`), jamais de hex ou de rgba en dur. Dans un `className`, référencer la variable CSS (`bg-[var(--surface-raised)]`) plutôt qu'une couleur Tailwind générique : la palette n'a **jamais** de blanc pur ni de gris neutre.
7. **Icônes exclusivement `lucide-react`**, infobulles exclusivement `<Tooltip>` — voir §1, les deux sont des règles absolues.
8. **Valider par `npm run build`**, jamais par `tsc --noEmit` seul. Turbopack casse des choses que le contrôle de types ne voit pas (détail : `docs/architecture.md`, annexe A).

### Avant d'écrire du code, dans l'ordre

1. Lire `docs/architecture.md` — c'est lui qui porte le fonctionnement et les pièges.
2. Vérifier dans `docs/backlog.md` si la zone a un item ouvert.
3. Pour Next.js 16, lire `node_modules/next/dist/docs/` : cette version a des ruptures par rapport aux connaissances d'entraînement.

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
Tout texte affiché à l'utilisateur passe par next-intl — jamais de string hardcodée. Clés en camelCase imbriqué : `workshop.create.title`. Détail complet : `docs/architecture.md`.

---

## 6. GIT & GITHUB

**Repo :** https://github.com/alexisbrl/Culture — **Branche principale :** `main`

### Règles
- Ne jamais committer directement sur `main` — toujours une branche dédiée
- Committer après chaque feature complète avec un message descriptif
- Merger via Pull Request sur GitHub

### Convention de nommage des branches
```
feat/nom-court        # Nouvelle fonctionnalité
fix/nom-court         # Correction de bug
chore/nom-court       # Tâche technique (deps, config, refactor)
```

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

### Tests unitaires (Vitest) — portée volontairement étroite
`npm run test:unit` (ou `test:unit:watch`), config `vitest.config.mts`, fichiers dans `tests/unit/`. C'est **la seule suite qui existe aujourd'hui**.

**On ne teste pas tout, et c'est délibéré.** Deux critères, un seul suffit :
- l'opération peut **détruire des données saisies à la main** (suppression par lot, `upsert` sur un identifiant fourni par le client, ré-écriture de masse) ;
- la fonction est le **contrat d'une entrée non fiable** (IA, import, future API) — typiquement `src/lib/workshops/questionGroup.ts` et les normaliseurs d'`examTypes.ts`.

Ce qui relève du rendu, de l'ergonomie ou de la qualité d'un contenu généré **ne se teste pas ici** : ça se regarde dans l'app. Raison d'être de cette discipline : la base Supabase est partagée avec la production (`docs/backlog.md`), donc une requête de suppression non testée s'exécuterait sur les vraies données.

**Aucun test ne doit toucher au réseau ni à Supabase.** Un module qui a besoin d'un client lui reçoit un double ; on ne laisse jamais `getSupabaseServerClient()` s'exécuter dans un test.

### Tests de bout en bout (Playwright) — cible, pas encore en place
Le produit fini a des tests de bout en bout sur les parcours critiques : connexion, création d'atelier, génération, passage d'un exercice. **Playwright n'est pas installé à ce jour** — item ouvert dans `docs/backlog.md`. Ne pas prescrire `npm run test:e2e` tant que le script n'existe pas.

### Avant une Pull Request
```bash
npm run test:unit
```

### Claude in Chrome
Activée — à utiliser systématiquement pour ouvrir l'app, tester l'UI et valider le rendu visuel avant de considérer une feature terminée. **C'est ce qui tient lieu de test de bout en bout en attendant Playwright.**

### Lint & CI
- `npm run lint` (= `eslint .`) doit passer **sans erreur** avant tout commit/PR. Les règles « React Compiler readiness » (`react-hooks/set-state-in-effect`, `refs`, `immutability`, `purity`) sont volontairement en `warn` (patterns hydration-safe légitimes) — ne pas les repasser en `error` sans raison, et ne pas « corriger » un warning hydration en retirant l'effet (réintroduit un hydration mismatch).
- `npm run typecheck` (= `tsc --noEmit`) en local ; en CI le typecheck fiable passe par `npm run build` (régénère `next-env.d.ts` + types de routes) — voir le piège Turbopack en §1.
- CI : `.github/workflows/ci.yml` — jobs `lint` et `build`, **ni l'un ni l'autre ne dispose de secrets**. Le dépôt n'en définit aucun (`Settings → Secrets and variables → Actions` est vide), donc les `${{ secrets.* }}` du job `build` se résolvent tous en chaîne vide. C'est **sans conséquence et assumé** (constaté le 20/08/2026) : `next build` compile sans identifiants valides, et rien dans ce projet ne consulte Clerk, Supabase ou Resend *au moment du build* — toutes les routes applicatives sont rendues à la demande. La CI vérifie donc la compilation, les types de routes et TypeScript, **pas** l'accès aux services. Ne pas ajouter un seul secret « pour bien faire » : ce serait la moitié d'un invariant, plus trompeur que l'absence.

---

## 8. VARIABLES D'ENVIRONNEMENT

Se référer à `.env.local.example` pour la liste complète. Ne jamais committer `.env.local`.

Variables clés : `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (Auth), `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Database), `RESEND_API_KEY` (Email).

---

## 9. RESSOURCES COMPLÉMENTAIRES

Les trois autres documents ne sont **pas** chargés automatiquement — vas-y quand la tâche le justifie :

| Fichier | Contenu | Quand le lire |
|---|---|---|
| `docs/product-spec.md` | Ce que fait le produit : lexique, abonnements, pages & navigation, les deux modules, gamification | Question de périmètre, comportement attendu d'une page ou d'une fonctionnalité |
| `docs/architecture.md` | Comment il est construit : architecture serveur, i18n, patterns UI, génération du programme par IA | **Avant d'écrire du code**, quelle que soit la zone — c'est lui qui porte les conventions |
| `docs/backlog.md` | L'écart entre la cible et le réel : ce qui manque, la dette, les TODO | Planification, ou avant de toucher une zone qui a un item ouvert |

⚠️ `docs/architecture.md` remplace depuis le 09/09/2026 les trois fichiers de `.claude/rules/` (i18n, architecture serveur, patterns frontend) et le plan de génération par IA. Ces fichiers se chargeaient automatiquement selon le chemin touché ; ce n'est plus le cas, **c'est donc à toi d'aller le lire avant d'écrire du code**.

### Ce qui n'est pas de la documentation
Trois fichiers vivent dans `docs/` sans être des documents — ce sont des outils, à laisser tels quels : `docs/migrations/` (le SQL et la liste de ce qui attend un déploiement), `docs/chantiers/EN-COURS.md` (fichier sentinelle du système de chantiers autonomes), et `docs/design/` (le design system généré, ses tokens et ses maquettes).
