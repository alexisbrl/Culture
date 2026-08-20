# Culture — Guide Claude Code

> Source de vérité pour le workflow et les conventions de développement. Toujours chargé en entier — reste volontairement court. Le cahier des charges produit, l'historique et la dette technique sont dans `docs/` (à lire à la demande, pas chargés automatiquement). Les patterns de code détaillés (i18n, architecture serveur, UI/CSS) sont dans `.claude/rules/` (chargés automatiquement uniquement quand tu touches un fichier concerné).
>
> Dernière mise à jour : 11/07/2026

---

## 1. RÈGLES ABSOLUES

### Ne jamais halluciner
Si tu n'es pas certain d'une information (API, comportement d'une lib, structure d'un fichier), **cherche dans le code ou dans la doc** plutôt que d'inventer. Si tu ne sais pas, dis-le explicitement.

### Poser des questions avant d'exécuter
**Après CHAQUE prompt de l'utilisateur**, avant d'exécuter quoi que ce soit, identifie systématiquement les ambiguïtés. S'il y en a — même mineures — pose tes questions de clarification et attends la réponse avant de commencer. N'exécute jamais sans avoir compris l'intention précise. S'il n'y a vraiment aucune ambiguïté, tu peux exécuter directement.

### Icônes : Lucide React uniquement
Toujours utiliser exclusivement les icônes de `lucide-react`. Ne jamais créer d'icônes SVG inline custom, ne jamais utiliser d'autres librairies d'icônes. Si une icône Lucide ne correspond pas exactement au besoin, prendre la plus proche ou un emoji texte — jamais du SVG personnalisé.

### Infobulles : composant `Tooltip` uniquement
Toute infobulle passe par `<Tooltip content={…}>` (`src/components/ui/tooltip.tsx`). L'attribut `title` du HTML est interdit sur toute balise DOM — il est dessiné par le système d'exploitation, hors du DOM, donc impossible à mettre à l'esthétique du site. La règle est tenue par ESLint (`no-restricted-syntax`, en `error`, donc bloquante en CI), et c'est elle qui fait foi pour recenser les infobulles existantes. Détail et pièges (nom accessible, bouton désactivé, infobulles imbriquées) : `.claude/rules/frontend-patterns.md`.

### Lexique : notion (produit, code) = brick (base)
Ce que l'utilisateur voit et ce que le code nomme est **« notion »** (renommé depuis « brique de connaissance » lors du chantier de refonte UI, 08/2026, voir `docs/changelog.md`). Les tables Supabase, elles, restent nommées `workshop_bricks`, `brick_mastery`, `exam_question_bricks` et leurs colonnes `brick_id` — un renommage en base est une migration destructive, différée (voir `docs/backlog.md`). Ne jamais introduire de nouveau code ou de nouvelle chaîne visible utilisant « brique »/« brick » ; les rares points de contact avec les noms de table Supabase portent un commentaire `// table encore nommée bricks en base…`.

### MVP uniquement
Ne pas développer de fonctionnalités hors-MVP avant que le MVP soit stable et validé. Périmètre MVP détaillé : `docs/product-spec.md`.

### API-first — checklist par défaut pour tout nouveau développement
Chaque domaine fonctionnel doit pouvoir un jour exposer une API interne propre, sans logique couplée à l'UI. Ces pratiques (mises en place rétroactivement lors de l'audit de juin-juillet 2026, voir `docs/changelog.md`) s'appliquent **dès l'écriture** de tout nouveau code, jamais migrées plus tard en bloc :
- **i18n** : toute chaîne visible passe par next-intl dès l'écriture, dans `fr.json` **et** `en.json`. Détail : `.claude/rules/i18n.md`.
- **Logique métier dans `src/lib/<domaine>/…`** (module pur, sans `'use server'`) ; le fichier `'use server'` dans `app/actions/` reste un wrapper fin (authz → appel `lib/` → revalidation). Détail : `.claude/rules/server-architecture.md`.
- **Contrôle d'accès** : toute server action sur un atelier appelle `requireMember`/`requireManager`/`requireOwner` (`src/lib/authz.ts`) en tête.
- **Revalidation** : jamais `revalidatePath('/', 'layout')` — toujours `revalidateWorkshop()`/`revalidateDashboard()` (`src/lib/revalidate.ts`).
- **Couleurs de marque** : toujours via `src/lib/theme.ts` (`palette`, `ink()`), jamais de hex en dur.
- **Validation avant de considérer une tâche terminée** : `npm run build`, pas seulement `tsc --noEmit` (Turbopack peut casser des re-exports de type sans que `tsc`/`eslint` le détectent — détail : `.claude/rules/server-architecture.md`).

### Web-first
Toute fonctionnalité est développée et validée sur web avant d'être portée sur iOS/Android.

### Formats de fichiers
PDF en priorité pour la V1. Les autres formats (Word, PowerPoint, audio, vidéo…) sont prévus en V2+.

### Irréversibilité du passage Premium d'un atelier
Cette opération ne doit jamais pouvoir être annulée, quelle que soit la situation. Implémentation (trigger DB, mécanisme de test à retirer avant Stripe) : `.claude/rules/server-architecture.md`.

### Migrations de base de données : jamais de destruction avant déploiement du code
La base Supabase (`hhkmrejjksjpfetwefju`) est **partagée par le code local ET le code déployé en production** (get-culture.com). Une migration prend effet **immédiatement**, alors qu'un changement de code n'est en ligne qu'après `push → PR → merge dans main → déploiement Vercel`.

**Règle de séquencement « expand / contract » :**
- **Ajouter** une colonne/table (expand) : sans danger à tout moment (le code déployé l'ignore).
- **Supprimer ou renommer** une colonne/table, ou changer un type (contract) : **interdit tant que le code déployé en production lit encore cet objet**. Beaucoup de `select` ne lisent que `{ data }` en ignorant `{ error }` → l'échec est **silencieux** (`data = null`) et casse la fonctionnalité sans alerte.
- Ordre correct pour retirer un champ : (1) déployer le code qui ne l'utilise plus → (2) seulement ensuite, appliquer la migration de suppression.
- **Toute migration en attente de déploiement se note dans `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md`** — point d'entrée unique, à lire dès que l'utilisateur demande ce qu'il reste à faire « une fois en ligne ». Le SQL lui-même va dans `docs/migrations/<date>-<sujet>.sql`. Si la section « À appliquer » du fichier dit `AUCUN`, il n'y a rien à faire.
- Incident de référence (22/06/2026, ateliers cassés en ligne pour avoir inversé cet ordre) : `docs/changelog.md`.

**Garde-fous conditionnels au mode chantier.** Les migrations Supabase (`apply_migration`, `execute_sql`), l'écriture de `src/lib/database.types.ts` et les modifications du Jardin sont **bloquées tant qu'un chantier est ouvert** — c'est-à-dire tant que `docs/chantiers/EN-COURS.md` ne contient pas `AUCUN` : en autonomie, personne ne relit avant que la base ne change. En session interactive (hors chantier), elles sont autorisées normalement. Mécanisme : hook `PreToolUse` → `.claude/hooks/chantier-guard.mjs`, branché dans `.claude/settings.local.json`. En chantier, la conduite à tenir est celle du fichier : écrire le SQL dans `docs/migrations/`, le documenter dans la feuille de route, laisser l'humain l'appliquer. Les interdictions inconditionnelles (`git push --force`, écriture de `.env*`, `rm -rf`) restent dans `permissions.deny`, hors de portée de toute condition.

### Mettre à jour la documentation
À la fin de chaque grosse tâche (nouvelle feature déployée, PR mergée, refactor structurant), mets à jour le fichier concerné plutôt que d'entasser dans `CLAUDE.md` :
- Règle de workflow, convention, stack, structure → **ce fichier**.
- Spécification produit (page, fonctionnalité, périmètre) → `docs/product-spec.md`.
- Pattern de code réutilisable ou piège technique → `.claude/rules/i18n.md`, `server-architecture.md`, ou `frontend-patterns.md` selon le sujet.
- Décision/épisode marquant à conserver pour contexte historique (une entrée courte, pas un journal détaillé — `git log` fait foi pour le détail) → `docs/changelog.md`.
- Dette technique / TODO connu → `docs/backlog.md`.
- Migration de base qui attend un déploiement → `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md` (voir §1).

---

## 2. CONTEXTE PROJET

**Nom :** Culture (nom de travail — nom produit final à confirmer)
**Type :** Application SaaS d'apprentissage — générateur pédagogique avec IA
**Plateforme :** Web en premier (iOS/Android hors MVP)
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
│   │   ├── actions/             # Server actions — wrappers fins (voir .claude/rules/server-architecture.md)
│   │   ├── api/                 # API routes (contact, waitlist, webhooks Clerk/Stripe)
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/              # Composants React réutilisables (ui/ = shadcn, sections/ = sections de page)
│   ├── lib/
│   │   ├── workshops/           # Logique métier par domaine (members, core, lifecycle, files, exam, examTypes)
│   │   ├── authz.ts             # Contrôle d'accès centralisé
│   │   ├── revalidate.ts        # Revalidation de cache à scope étroit
│   │   ├── theme.ts             # Tokens de couleur/design
│   │   ├── storage.ts           # Abstraction stockage de fichiers
│   │   ├── supabase.ts          # Client Supabase + types dérivés
│   │   └── database.types.ts    # Généré — ne pas éditer à la main
│   ├── i18n/                    # Config next-intl
│   └── proxy.ts                  # Auth + i18n proxy (anciennement middleware.ts, renommé pour Next.js 16)
├── messages/{fr,en}.json         # Traductions
├── docs/                         # Cahier des charges, historique, backlog (lus à la demande)
├── .claude/rules/                # Patterns de code (chargés à la demande selon les fichiers touchés)
├── tests/{e2e,unit}/
└── public/
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
Tout texte affiché à l'utilisateur passe par next-intl — jamais de string hardcodée. Clés en camelCase imbriqué : `workshop.create.title`. Détail complet : `.claude/rules/i18n.md`.

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

### En cours de développement (chaque feature)
Utiliser **Playwright E2E** pour valider le comportement UI de chaque feature. Lancer les tests et vérifier que ça passe avant de considérer une tâche terminée.
```bash
npx playwright test
npx playwright test --headed   # avec navigateur visible
```

### Tests unitaires (Vitest) — portée volontairement étroite
Installé le 19/08/2026. `npm run test:unit` (ou `test:unit:watch`), config `vitest.config.mts`, fichiers dans `tests/unit/`.

**On ne teste pas tout, et c'est délibéré.** Deux critères, un seul suffit :
- l'opération peut **détruire des données saisies à la main** (suppression par lot, `upsert` sur un identifiant fourni par le client, ré-écriture de masse) ;
- la fonction est le **contrat d'une entrée non fiable** (IA, import, future API) — typiquement `src/lib/workshops/questionGroup.ts` et les normaliseurs d'`examTypes.ts`.

Ce qui relève du rendu, de l'ergonomie ou de la qualité d'un contenu généré **ne se teste pas ici** : ça se regarde dans l'app. Raison d'être de cette discipline : la base Supabase est partagée avec la production (`docs/backlog.md`), donc une requête de suppression non testée s'exécuterait sur les vraies données.

**Aucun test ne doit toucher au réseau ni à Supabase.** Un module qui a besoin d'un client lui reçoit un double ; on ne laisse jamais `getSupabaseServerClient()` s'exécuter dans un test.

### Avant une Pull Request (grosses modifications)
Lancer **Vitest (unit) + Playwright (E2E)** — les deux suites doivent passer avant de créer la PR.
```bash
npm run test:unit    # Vitest
npm run test:e2e     # Playwright (à installer)
```

### Claude in Chrome
Activée — à utiliser systématiquement pour ouvrir l'app, tester l'UI et valider le rendu visuel avant de considérer une feature terminée.

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

Ces fichiers ne sont **pas** chargés automatiquement à chaque session — vas-y quand la tâche le justifie :

| Fichier | Contenu | Quand le lire |
|---|---|---|
| `docs/product-spec.md` | Cahier des charges complet : périmètre MVP, lexique, abonnements, pages & navigation, modules 1 & 2, gamification | Question de périmètre produit, comportement attendu d'une page/fonctionnalité |
| `docs/changelog.md` | Repères chronologiques des décisions structurantes | Comprendre le contexte historique avant de modifier une zone en profondeur |
| `docs/backlog.md` | Dette technique et TODO connus | Planification, avant de toucher une zone qui a un item ouvert |
| `docs/ai-ingestion-plan.md` | Conception arrêtée de la génération du programme par IA (contrat, fournisseurs, annulation, ordre de chantier) | Avant tout travail sur l'ingestion IA — le document fixe les décisions et les prérequis |

Ces fichiers se chargent automatiquement, seulement quand tu touches un fichier dont le chemin matche leur `paths:` — pas besoin de les lire à la main dans ce cas :

| Fichier | Portée (`paths:`) | Contenu |
|---|---|---|
| `.claude/rules/i18n.md` | `messages/**`, `src/app/**`, `src/components/**` | Routine next-intl, patterns de clés dynamiques |
| `.claude/rules/server-architecture.md` | `src/app/actions/**`, `src/lib/**`, `src/app/api/**` | Pattern lib/+wrapper, authz, revalidation, RLS, storage, pièges Turbopack |
| `.claude/rules/frontend-patterns.md` | `src/**/*.tsx`, `src/**/*.css` | Design tokens, patterns UI réutilisables, pièges React/CSS récurrents |
