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

### 3.4 — Le lint ne protège rien
ESLint scanne aussi `.claude/worktrees/` (copies d'agents) → bruit massif. Il manque un `eslint.config` avec
`ignores`. Surtout : `next build` **ne bloque pas** sur les erreurs lint → rien n'empêche de pousser du code
cassé. Pas de CI.

### 3.5 — Types obsolètes
`supabase.ts:22-34` — les types `WorkshopMember`, `WorkshopWithRole`, `WorkshopDetail` ne connaissent que
`'owner' | 'member'`, alors que le rôle `'manager'` existe partout ailleurs. Désynchronisé et trompeur.
Idéalement : **générer les types depuis Supabase** (`supabase gen types`) au lieu de les maintenir à la main.

---

## 🟢 4. EFFICACITÉ

### 4.1 — `revalidatePath('/', 'layout')` partout
Presque chaque mutation invalide **tout le cache de l'app** (`'/'` + `'layout'`). C'est un marteau-pilon : un
renommage de fichier invalide le rendu de toutes les pages. `examQuestions.ts` fait mieux
(`/workshops/${id}`, `'page'`). À harmoniser sur le scope le plus étroit possible.

### 4.2 — Requêtes N+1
- `confirmDeletion` (`workshops.ts:1332`) boucle `client.users.getUser()` (appel réseau Clerk) **par
  propriétaire**.
- Plusieurs actions enchaînent des requêtes Supabase séquentielles qui pourraient être parallélisées
  (`Promise.all`) ou jointes — `getExamBankData` montre la bonne approche avec `Promise.all`.

### 4.3 — `getUserWorkshops` appelle `cleanupExpiredWorkshops` à chaque chargement
`workshops.ts:156` — le nettoyage de la corbeille tourne à **chaque** affichage du dashboard de **chaque**
utilisateur. Ça devrait être une tâche planifiée (cron Supabase / route programmée), pas couplé à un chemin
de lecture chaud.

---

## 🔵 5. DURABILITÉ / ÉVOLUTIONS FUTURES

### 5.1 — i18n : ~90 % de l'app n'est pas traduisible
next-intl est configuré, mais seuls **7 fichiers sur 68** utilisent `useTranslations`. Tout l'app connecté
(dashboard, atelier, profil, paramètres, éditeur d'examen — ~10 000 lignes) est en **français codé en dur**.
Les fichiers `messages/fr.json` / `en.json` (208 lignes) ne couvrent que le site vitrine. Traduire le produit
aujourd'hui = réécrire des milliers de chaînes. → À traiter **au fur et à mesure** des refactors, jamais en
big-bang.

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
| **7** | Config ESLint (`ignores` worktrees) + faire échouer le build/CI sur erreurs ; corriger les erreurs | 🟡 Process | S | ⭐⭐⭐⭐ | à faire |
| **8** | Installer Vitest + Playwright (promis dans CLAUDE.md, absents) | Process | M | ⭐⭐⭐ | à faire |
| **9** | Resserrer `revalidatePath` ; sortir le cleanup corbeille en cron | 🟢 Perf | S | ⭐⭐⭐ | à faire |
| **10** | Extraire types métier dans `lib/` + factoriser emails/tags | 🔵 Durabilité | M | ⭐⭐⭐ | à faire |
| **11** | Plan i18n progressif + générer les types Supabase | 🔵 Durabilité | L | ⭐⭐⭐ | à faire |
| **12** | Intégration Stripe (voir §1.6) + facturation membres Premium | 🔴 Sécu/Facturation | L | ⭐⭐⭐⭐ | à faire (bloque la prod payante) |

> **Section 1 (sécurité) traitée.** Prochaine priorité conseillée : #4 (modales partagées) puis #7 (CI/lint).
> #12 (Stripe) reste indispensable avant toute mise en production payante.

---

*Audit généré par Claude Code le 21/06/2026. Section 1 (sécurité) traitée et appliquée au code le 22/06/2026 ;
le reste du rapport (DRY, clarté, efficacité, durabilité) est toujours d'actualité.*
