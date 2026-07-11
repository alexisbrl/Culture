# 🔍 Audit complet du code — Culture

> Audit qualité / sécurité / DRY / efficacité / évolutivité réalisé le **21/06/2026**.
> **Aucune modification de code n'a été faite** — ce document est un état des lieux et un plan d'action.
>
> Axes évalués : **clarté** (lisible par un nouveau dev), **propreté** (pas de code mort ni de redite),
> **efficacité** (perf, gestion des données), **durabilité** (i18n, API, paiement à venir),
> **sécurité** (anti-abus, intégrité de la facturation).

**Périmètre mesuré :** 68 fichiers TS/TSX, ~14 600 lignes.
**État build/lint :** `next build` ✅ (TypeScript passe) · `eslint` ❌ 27 erreurs / 15 warnings (non bloquantes) · **aucun test installé**.

---

## Verdict en une phrase

Le code est **fonctionnel et le modèle de données est sain**, mais il y a un **écart sérieux entre les intentions documentées (CLAUDE.md) et ce que le code applique réellement** — surtout en sécurité. Les fondations sont bonnes ; il reste des trous de sécurité critiques, beaucoup de copier-coller, et deux fichiers de ~2 300 lignes ingérables. C'est très rattrapable.

---

## ✅ 1. SÉCURITÉ & FACTURATION — RÉSOLU (22/06/2026)

Toute la section 1 a été traitée. Détail dans l'historique git (branche `fix/exam-actions-authz`)
et dans CLAUDE.md (entrée datée 22/06/2026). Résumé :

- **1.1 IDOR éditeur d'examen** ✅ — création du module partagé `src/lib/authz.ts`
  (`requireMember/Manager/Owner`), appliqué aux 12 server actions de `examQuestions.ts`.
- **1.2 Confidentialité** ✅ — choix produit : **tous les ateliers sont privés**. `joinWorkshop`
  remplacé par `requestToJoinWorkshop` (demande validée par un gestionnaire) ; flux complet
  (table `workshop_join_requests` + UI Dashboard/Paramètres). Notion public/privé **supprimée**
  (toggle, colonne `workshops.private`, sélecteur de la page de création).
- **1.3 Limites de membres** ✅ — abandonnées (gérées côté structures via l'API). Colonnes
  `max_members_total`/`max_members_monthly` supprimées + UI retirée.
- **1.4 Fichiers confidentiels** ✅ — bucket privé confirmé, lecture (`getWorkshopFiles`) verrouillée
  gestionnaire, + téléchargement gestionnaire via URL signée éphémère (`getFileDownloadUrl`).
- **1.5 Code mort `addMemberByTag`** ✅ — supprimé (le flux d'ajout par tag passe par
  `inviteMemberByTag`, conservé).
- **1.7 Aléas / brute-force** ✅ — `generateCode` en `crypto.randomInt` ; `confirmDeletion` durci
  (délai 5 s entre essais + plafond 25 essais → renvoi d'un nouveau code) ; suppression basée sur
  `requireOwner` (rôle, et non plus `created_by`).

- **1.6 Facturation Premium / Stripe** ⏳ — **différé volontairement** (Stripe non branché). Le webhook
  `src/app/api/webhooks/stripe/route.ts` est un stub inerte. Tous les sujets à traiter au branchement
  Stripe sont tracés dans **CLAUDE.md §18 (backlog)** : vérification de signature `constructEvent`,
  types d'événements, idempotence, mapping `setUserTier`, activation Premium uniquement après paiement,
  facturation ~3,5 €/membre à l'acceptation d'une invitation/demande.

---

## 🟠 2. RÉUTILISATION / DRY

### 2.1 — Aucune modale de confirmation partagée
Les patterns de modale (`position:'fixed'`, `borderRadius:20`, « Annuler » / « Quitter », « action
irréversible »…) apparaissent **68 fois dans 8 fichiers**. Chaque popup « Modifications non enregistrées »,
« Supprimer ce libellé », « Supprimer cette question », « Effacer l'éditeur » est recodée from scratch en
JSX inline. Le seul composant de modale réutilisable est `src/components/ShareQRModal.tsx` — et encore, il a
ses couleurs en dur.

> **Recommandation forte :** créer un `<ConfirmDialog>` (titre, description, variante danger/normal, actions)
> et un `<Modal>` de base. Ça supprimerait des centaines de lignes et garantirait un rendu cohérent.
> Meilleur rapport effort/valeur du projet.

### 2.2 — Le contrôle d'autorisation est copié-collé ~20 fois
Le bloc `auth()` → requête `workshop_members` → check rôle se répète dans presque chaque action de
`workshops.ts`, plus `requireManager` qui existe **en double** dans `workshopFiles.ts:36`. Il faut **un seul
module** `lib/authz.ts` avec `requireMember(workshopId)`, `requireManager(workshopId)`,
`requireOwner(workshopId)` réutilisé partout (ce qui réglerait aussi §1.1 d'un coup).

### 2.3 — Fonctions dupliquées à l'identique
`generateUniqueId` (`profile.ts:11`) et `generateWorkshopTag` (`workshops.ts:23`) sont **le même code** (même
alphabet Crockford, 7 caractères). À factoriser en `lib/tag.ts`. Idem la construction du `displayName` (Clerk
first/last/email) répétée 4 fois.

### 2.4 — Un design system existe mais est contourné 538 fois
`globals.css` définit des tokens (`--color-culture-green`, `--primary`…), **mais** les couleurs sont écrites
en dur (`#fcf9f2`, `rgba(45,42,36,0.5)`, `#4f6b40`) **538 fois dans 14 fichiers** via `style={{…}}` inline.
Conséquence : changer une nuance de vert = chercher/remplacer dans des milliers de lignes. → Centraliser dans
un objet `theme` partagé ou utiliser les classes Tailwind / variables CSS.

### 2.5 — Emails HTML dupliqués
Les deux templates email dans `workshops.ts` (~ligne 1242) partagent ~80 % de markup (en-tête 🪴 Culture,
footer). À extraire en `lib/emails.ts` avec un layout commun — indispensable avant d'en ajouter d'autres.

---

## 🟡 3. CLARTÉ & LISIBILITÉ

### 3.1 — Deux fichiers monstres ✅ RÉSOLU (24/06/2026)
- ~~`ExamenTab.tsx` : **2 374 lignes**~~ → **510 lignes** (orchestrateur). Sous-composants extraits dans
  `tabs/examen/` : `examShared.tsx` (types/constantes/helpers), `HistoryContent.tsx`, `BankContent.tsx`,
  `GeneratorContent.tsx`.
- ~~`SettingsClient.tsx` : **2 273 lignes**~~ → **896 lignes** (Général + machinerie « modifications non
  enregistrées » + modales). Sections extraites dans `settings/` : `settingsShared.tsx` (types/helpers),
  `MembersSection.tsx`, `FilesSection.tsx`, `PremiumSection.tsx`, `BricksSection.tsx`.

Extraction **sans changement de comportement** (tranches verbatim) — `tsc --noEmit` + `next build` OK.
Branche `refactor/split-large-files`.

### 3.2 — Composants définis pendant le render ✅ RÉSOLU (24/06/2026)
- `SectionCard` (anciennement `SettingsClient.tsx:486`) : déjà sorti au niveau module lors du découpage §3.1
  (vit maintenant dans `settings/settingsShared.tsx`).
- Audit complémentaire : la seule autre instance réelle du même anti-pattern, `Card` défini dans le render de
  `Panel` (`garden/GardenClient.tsx`), a été extraite au niveau module en `ItemCard` (props `armed`/`onArm`
  au lieu d'une closure). Vérifié : plus aucun composant défini dans un corps de composant (`tsc` + `next build` OK).

### 3.3 — Erreurs lint réelles ✅ TRAITÉ (24/06/2026)
Lint avant : **27 erreurs / 14 warnings** → après : **14 erreurs / 6 warnings** (`tsc` + `next build` OK).
Corrigé (toutes sûres, comportement préservé) :
- **Apostrophes non échappées** (`react/no-unescaped-entities`, 11 erreurs) : `legal/page.tsx`,
  `SettingsClient.tsx`, `BankContent.tsx` → `&apos;` (rendu identique).
- **`Date.now()` (`react-hooks/purity`)** dans `ExamenTab` : extrait dans un helper module `newExamId()`.
- **Ref écrit pendant le render** (`react-hooks/refs`) dans `SettingsClient` (`isDirtyRef.current = isDirty`)
  → déplacé dans un `useEffect` (comportement identique : lu par les handlers post-montage).
- **Imports / variables inutilisés** (8) : `NextResponse` (middleware), `useLocale` (contact), `locale`
  (about), `GardenerAvatar` (ProfileClient, fonction morte), `isOwner` (WorkshopClient), `isLandAt`/`b`
  (GardenClient), `incomplete` (GeneratorContent).

**Restant (14 erreurs / 6 warnings) → relève du §3.4**, pas des « vrais bugs » : ce sont des règles de
*React-Compiler-readiness* (`react-hooks/set-state-in-effect` ×11, `react-hooks/refs` ×2 curseur de drag,
`react-hooks/immutability` ×1 PRNG dans `useMemo`) qui signalent des patterns **légitimes** — inits
client-only/hydration-safe (lecture `window`/localStorage/searchParams après montage). Les « corriger » en
retirant les effets réintroduirait des hydration mismatches. À traiter en §3.4 via la **config ESLint**
(décider de les passer en `warn`) plutôt que par des refactors risqués. Warnings restants : `exhaustive-deps`
×4, `no-img-element` ×1, parse ×1.

### 3.4 — Le lint ne protège rien ✅ RÉSOLU (24/06/2026)
- **Bruit ESLint** : `eslint.config.mjs` ignore désormais `.claude/**` (worktrees d'agents) ainsi que les
  dossiers de maquettes locaux non suivis `_handoff/**` et `culture-design-system/**`. `eslint .` ne scanne
  plus que `src/` + les configs racine.
- **Règles react-compiler-readiness** passées en `warn` (set-state-in-effect / refs / immutability / purity) :
  les 14 « erreurs » légitimes (§3.3) deviennent des warnings non bloquants → `eslint .` = **0 erreur / 20
  warnings**, exit 0. Toute *vraie* erreur (type, import mort, entité non échappée…) reste `error` et fait
  échouer la commande.
- **CI** : nouveau workflow `.github/workflows/ci.yml` (push `main` + toutes les PR) :
  - job **lint** (`npm run lint`) — sans secret, c'est le garde-fou qui bloque le code cassé ;
  - job **build** (`npm run build`) — régénère `next-env.d.ts` + types de routes et **vérifie les types**
    (typecheck fiable) ; nécessite les variables d'env du dépôt (GitHub → Settings → Secrets and variables →
    Actions), mêmes valeurs que Vercel.
- Scripts ajoutés : `npm run lint` (= `eslint .`) et `npm run typecheck` (= `tsc --noEmit`).

> ⚠️ **À faire côté GitHub (hors code)** : ajouter les *repository secrets* (Clerk/Supabase/Resend) pour que
> le job `build` passe, puis activer une *branch protection rule* sur `main` exigeant la CI verte avant merge.

### 3.5 — Types obsolètes ✅ (25/06/2026)
`supabase.ts:22-34` — les types `WorkshopMember`, `WorkshopWithRole`, `WorkshopDetail` ne connaissaient que
`'owner' | 'member'`, alors que le rôle `'manager'` existe partout ailleurs. Désynchronisé et trompeur
(d'autant que ces types n'étaient **importés nulle part** — exports morts, d'où la dérive silencieuse).

**Corrigé :** le schéma Supabase est désormais **généré** dans `src/lib/database.types.ts` (source de vérité,
régénérable via le MCP / `supabase gen types`). Les types métier de `supabase.ts` en **dérivent**
(`Tables<'workshops'>`, `Omit<Tables<'workshop_members'>, 'role'> & { role: WorkshopRole }`…) — ils ne
peuvent donc plus diverger des colonnes réelles, et `role` est resserré sur l'union partagée `WorkshopRole`
(`owner | manager | member`) de `lib/authz.ts`.

> **Suivi (non bloquant) :** typer le client (`createClient<Database>`) donnerait une sécurité de bout en bout
> sur toutes les requêtes `.from()`, mais révèle ~15 incohérences réelles de nullabilité/`Json` à corriger sur
> de nombreux fichiers — migration à part entière, tracée au backlog CLAUDE.md §18.

---

## 🟢 4. EFFICACITÉ

### 4.1 — `revalidatePath('/', 'layout')` partout ✅ RÉSOLU (25/06/2026)
Presque chaque mutation invalidait **tout le cache de l'app** (`'/'` + `'layout'`) : un marteau-pilon (un
renommage de fichier d'atelier invalidait aussi le Jardin, le Profil, la page Tarifs…). À noter : l'exemple
`examQuestions.ts` que cet audit citait comme « fait mieux » était en réalité **mal scopé** — il passait
`/workshops/${id}` sans le segment `[locale]`, donc ne matchait probablement aucune entrée de cache (le
`revalidatePath` opère sur la *structure de fichiers de route*, pas l'URL ; cf. doc Next 16).

**Corrigé :** nouveau module `src/lib/revalidate.ts` exposant deux helpers à scope étroit, basés sur les
**patterns de route** corrects (avec `[locale]`/`[id]` + `type`) :
- `revalidateWorkshop()` → `revalidatePath('/[locale]/workshops/[id]', 'layout')` (page atelier + paramètres
  + session) ;
- `revalidateDashboard()` → `revalidatePath('/[locale]/dashboard', 'page')` (mes ateliers / rejoints /
  corbeille / recherche).

Chacune des **27 mutations** (16 dans `workshops.ts`, 3 dans `workshopFiles.ts`, 8 dans `examQuestions.ts`) a
été re-scopée selon ce qu'elle modifie réellement (atelier, dashboard, ou les deux — voir les commentaires en
ligne). Plus aucun `revalidatePath('/', 'layout')` dans le code. `next build` ✅.

### 4.2 — Requêtes N+1 ✅ RÉSOLU (25/06/2026)
- `confirmDeletion` bouclait `client.users.getUser()` (un appel réseau Clerk **par propriétaire**) + envois
  d'emails séquentiels. Corrigé : un seul `client.users.getUserList({ userId: ownerIds })` (batch) +
  `Promise.all` sur les envois Resend. Les deux `select` indépendants (nom de l'atelier / liste des
  propriétaires) sont aussi parallélisés.
- `getUserWorkshops` (chemin chaud, appelé à **chaque** chargement du dashboard) enchaînait deux `select`
  Supabase indépendants (ateliers / nombre de membres) — parallélisés via `Promise.all`.
- Audit confirmé : plus aucune boucle Clerk `getUser` ailleurs (les autres appels sont unitaires).

### 4.3 — `getUserWorkshops` appelle `cleanupExpiredWorkshops` à chaque chargement ✅ RÉSOLU (25/06/2026)
Le nettoyage de la corbeille tournait à **chaque** affichage du dashboard de **chaque** utilisateur. Déplacé
vers une **tâche planifiée `pg_cron`** côté Supabase (migration `schedule_trash_cleanup_cron`) : extension
`pg_cron` activée + job nommé `cleanup-expired-trashed-workshops` (tous les jours à 03:00 UTC) qui exécute
le `DELETE` des ateliers en corbeille depuis > 7 jours. La fonction `cleanupExpiredWorkshops` et son appel
dans `getUserWorkshops` ont été retirés — le chemin de lecture chaud ne déclenche plus aucune écriture.

---

## 🔵 5. DURABILITÉ / ÉVOLUTIONS FUTURES

### 5.1 — i18n : ~90 % de l'app n'est pas traduisible ✅ RÉSOLU (11/07/2026)
next-intl est configuré, mais seuls **7 fichiers sur 68** utilisaient `useTranslations` au moment de l'audit.
Tout l'app connecté (dashboard, atelier, profil, paramètres, éditeur d'examen — ~10 000 lignes) était en
**français codé en dur**. Traduire le produit en big-bang aurait voulu dire réécrire des milliers de chaînes
d'un coup → choix retenu : migration **au fur et à mesure**, jamais en big-bang, avec une routine documentée
pour ne pas aggraver la dette entre-temps (détail ci-dessous).

**Statut final** : la totalité de l'app connectée (module 1 — atelier/dashboard/profil/paramètres/examen/jardin)
ainsi que les pages d'authentification et les témoignages de la homepage sont désormais migrés vers next-intl.
Il ne reste **aucune chaîne d'UI non centralisée** dans le périmètre de l'audit — les seuls `locale === 'fr'`
restants dans le code sont des usages techniques légitimes et non traduisibles (sélection de la locale Clerk,
format de date `toLocaleDateString`, calcul de la locale alternative pour le sélecteur de langue) ou le rendu
volontairement en deux blocs JSX du texte juridique long de `legal/page.tsx` (déjà sous `useTranslations('legal')`
pour son titre/sa date, contenu RGPD trop long pour un découpage clé par clé).

**Fait (26/06) — fondations + routine, pas de big-bang :**
- **Typage des clés** : `src/i18n/types.ts` augmente next-intl (`Messages = typeof fr.json`) → `t('clé')`
  vérifié au build, autocomplétion IDE. Plus de typo silencieuse.
- **Page exemple migrée de bout en bout** = `profile` (`page.tsx` pattern serveur `getTranslations` +
  `ProfileClient.tsx` pattern client `useTranslations` + namespace `profile` dans `fr.json`/`en.json`). Sert de
  modèle à copier.
- **Routine documentée très clairement dans CLAUDE.md §17** (entrée « ROUTINE i18n ») : où vivent les messages,
  convention de namespaces, 3 patterns d'usage, **la règle** (toute nouvelle chaîne en i18n dès l'écriture +
  migration opportuniste quand on touche un fichier), checklist. Discipline manuelle (pas de lint, qui crierait
  des milliers de faux positifs sur l'app non migrée).
- Nettoyage annexe : email obsolète `contact@evalia.app` → `contact@scellow.com` (6 emplacements).

**Avancement migration (page par page, suivi détaillé dans CLAUDE.md §17) :**
- ✅ 26/06 — page **Profil** (namespace `profile`).
- ✅ 27/06 — **Dashboard** (namespace `dashboard`) : ~40 ternaires `locale === 'fr' ? …` convertis en `t('clé')`, + 2 chaînes restées en FR pur corrigées (`gestionnaire`, aria-label `agrandir`).
- ✅ 27/06 — **Génération d'examen** (namespace `examen`, ~200 chaînes) : les 6 fichiers `ExamenTab` + `tabs/examen/{HistoryContent,BankContent,GeneratorContent,examShared}` + `QuestionEditor`, en français pur, entièrement migrés. Patterns notables documentés dans CLAUDE.md §17 (helpers purs reçoivent `t` en paramètre, clés dynamiques type-safe `t(\`responseType.${type}\`)`, valeurs de données `status`/`date` traduites à l'affichage seulement).
- ✅ 27/06 — **Éditeur d'avatar** (`profile/avatar/page.tsx`, namespace `avatar`) : libellés/hints de catégories traduits à l'affichage, `CATS` (avatarConfig) reste la source des clés/parties.
- ✅ 27/06 — **Paramètres d'atelier** (namespace `settings`, ~110 chaînes) : `SettingsClient` + `settingsShared` + 4 sections (`MembersSection`/`FilesSection`/`PremiumSection`/`BricksSection`). `formatFileSize` paramétré (unités), `NAV_ITEMS`/`ROLE_LABEL` traduits à l'affichage via clé dynamique.
- ✅ 11/07 — **Page atelier** (`WorkshopClient.tsx`, namespace `workshop`) + **`ShareQRModal.tsx`** (namespace `shareQr`) + composants partagés **`DashboardHeader`/`Navbar`** (5 derniers ternaires → namespace `nav`).
- ✅ 11/07 — **Jardin** (`garden/GardenClient.tsx`, le plus gros fichier restant, 1003 l., namespace `garden`) : sous-composants module-level (`ItemCard`/`Panel`) migrés au même pattern que `WorkshopCard`/`InvitationCard` du Dashboard ; maps de libellés (espèce d'arbre/nature de tuile/déco) remplacées par des clés dynamiques sur les unions déjà exposées par `gardenEngine.ts`.
- ✅ 11/07 — **Derniers onglets atelier + pages de flux** : `ProgrammeTab` (namespace `programme`), `AnalyseTab` (namespace `analyse`), `CoursTab` (namespace `cours`), `session/page.tsx` (namespace `session`), `workshops/new/WorkshopNewClient.tsx` (namespace `workshopNew`), `create/page.tsx` (namespace `createWorkshop`, conversion des ternaires `fr ? … : …`). `pricing/PricingClient.tsx` (page compte connecté) migré sous **`accountPricing`** — pas `pricing`, déjà pris par la section marketing publique ; même logique pour `createWorkshop` vs `create`. `search/page.tsx` ignoré (redirection pure, aucune chaîne).
- ✅ 11/07 — **Pages d'authentification + témoignages homepage** (hors périmètre initialement suivi, mais même dette) : `sign-in`/`sign-up` (namespace `auth.signIn`/`auth.signUp`, pattern serveur `getTranslations`) et les 3 témoignages de `[locale]/page.tsx` (namespace `testimonials.{marie,thomas,sophie}`, clés `role`/`content` — nom/avatar/couleur restent des données non traduisibles).
- ⬜ Reste : rien — périmètre i18n de l'audit entièrement traité.

Note : beaucoup de pages connectées sont **déjà bilingues via ternaires inline** (elles changent déjà FR/EN) — la migration les **centralise** dans next-intl, elle n'ajoute pas une couverture absente.

### 5.2 — API publique (objectif « ajouter un étudiant via API »)
Bonne nouvelle : si on factorise l'autorisation (§2.2) et la logique métier hors des server actions (un module
`lib/workshops/members.ts`), exposer une API REST (`POST /api/v1/workshops/:id/members`) avec auth par clé API
réutilisera **exactement la même logique**. Aujourd'hui, la logique est enchevêtrée dans les actions liées à
l'UI → l'API devrait tout dupliquer. C'est l'argument concret pour faire le travail DRY maintenant.

### 5.3 — Partage de données entre pages
Les types de domaine (`Question`, `ExamConfig`) sont définis **dans des composants UI** (`QuestionEditor.tsx`,
`ExamenTab`) et importés par les server actions. C'est inversé : les types métier devraient vivre dans `lib/`
ou `types/`, et l'UI + les actions + la future API les consommer. Sinon impossible de réutiliser la logique
sans traîner tout le composant.

### 5.4 — `middleware.ts` déprécié en Next 16
Le build avertit : `middleware` → renommer en `proxy`. À planifier.

---

## ✅ Ce qui est déjà bien fait (à garder)

- **Abstraction de stockage** `src/lib/storage.ts` : exemplaire, provider-agnostic, prête pour S3.
- **Module subscription** `src/lib/subscription.ts` : propre, bien documenté, source de vérité serveur.
- **Modèle RLS « server-only »** cohérent et assumé (clé service-role, RLS activée sans policy).
- **Trigger DB d'irréversibilité Premium** : la garantie est au niveau base, pas seulement applicative.
- **Webhook Clerk** (session unique) : vérification de signature correcte, gestion d'erreur soignée.
- **CLAUDE.md** : excellente doc de projet — le souci est que le code a divergé d'elle.

---

## 🎯 Plan d'action priorisé

| # | Action | Axe | Effort | Impact | État |
|---|--------|-----|--------|--------|------|
| **1** | Créer `lib/authz.ts` (`requireMember/Manager/Owner`) et l'appliquer aux actions, surtout `examQuestions.ts` | 🔴 Sécu + DRY | M | ⭐⭐⭐⭐⭐ | ✅ fait (créé + appliqué à examQuestions, workshopFiles, demandes d'adhésion, suppression ; reste à étendre aux autres actions de `workshops.ts`) |
| **2** | Modèle « tout privé » + demandes d'adhésion validées | 🔴 Sécu | S | ⭐⭐⭐⭐⭐ | ✅ fait |
| **3** | Sécuriser `getWorkshopFiles`, supprimer `addMemberByTag` mort | 🔴 Sécu | S | ⭐⭐⭐⭐ | ✅ fait |
| — | Durcir les codes de suppression (crypto + délai/plafond) | 🔴 Sécu | S | ⭐⭐⭐ | ✅ fait (1.7) |
| **4** | Composant `<ConfirmDialog>` + `<Modal>` partagés | 🟠 DRY | M | ⭐⭐⭐⭐⭐ | à faire |
| **5** | Centraliser les tokens de couleur (fin du `#fcf9f2` en dur) | 🟠 DRY | M | ⭐⭐⭐⭐ | à faire |
| **6** | Découper `ExamenTab` & `SettingsClient` en sous-composants | 🟡 Clarté | L | ⭐⭐⭐⭐ | ✅ fait (24/06) |
| **7** | Config ESLint (`ignores` worktrees) + faire échouer le build/CI sur erreurs ; corriger les erreurs | 🟡 Process | S | ⭐⭐⭐⭐ | ✅ fait (24/06 — §3.3+§3.4) |
| **8** | Installer Vitest + Playwright (promis dans CLAUDE.md, absents) | Process | M | ⭐⭐⭐ | à faire |
| **9** | Resserrer `revalidatePath` ; sortir le cleanup corbeille en cron | 🟢 Perf | S | ⭐⭐⭐ | ✅ fait (25/06 — §4.1 `revalidatePath` + §4.3 cleanup pg_cron) |
| **10** | Extraire types métier dans `lib/` + factoriser emails/tags | 🔵 Durabilité | M | ⭐⭐⭐ | à faire |
| **11** | Plan i18n progressif + générer les types Supabase | 🔵 Durabilité | L | ⭐⭐⭐ | à faire |
| **12** | Intégration Stripe (voir §1.6) + facturation membres Premium | 🔴 Sécu/Facturation | L | ⭐⭐⭐⭐ | à faire (bloque la prod payante) |

> **Sections 1 (sécurité), 2 (DRY), 3 (clarté) et 4 (efficacité) traitées.** Prochaine priorité : section 5
> (durabilité — i18n progressif, types métier dans `lib/`, `middleware`→`proxy`). #12 (Stripe) reste
> indispensable avant toute mise en production payante.

---

*Audit généré par Claude Code le 21/06/2026. Sections 1 (sécurité, 22/06), 2 (DRY, 22/06), 3 (clarté,
24-25/06) et 4 (efficacité, 25/06) traitées et appliquées au code ; reste la section 5 (durabilité).*
