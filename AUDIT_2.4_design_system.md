# Audit §2.4 — Design system dans le code (checklist de migration)

> Objectif : centraliser toutes les couleurs (et rayons/ombres récurrents) dans
> `src/lib/theme.ts` pour qu'une évolution de charte se fasse en un seul endroit.
> Le code utilise des styles inline avec ~538 valeurs de couleur en dur dupliquées.
> Migration **progressive** : on remplace `'#2d2a24'` → `palette.ink`,
> `'rgba(45,42,36,0.14)'` → `ink(0.14)`, etc.

## ✅ Fait
- [x] Création de **`src/lib/theme.ts`** : `palette` (tokens nommés sémantiquement),
      `ink(alpha)` (translucides sur l'encre), `radius`, `shadow`.
- [x] Migration de **`src/components/Modal.tsx`**.
- [x] Migration de **`src/components/ConfirmDialog.tsx`**.
- [x] **`src/app/[locale]/workshops/[id]/tabs/CoursTab.tsx`** (ink, inkMuted, amber).
- [x] **`src/app/[locale]/workshops/[id]/WorkshopClient.tsx`** (ink, inkSoft, inkMuted, cream).
- [x] **`src/app/[locale]/workshops/[id]/session/page.tsx`** (green, greenSoft).
- [x] Build vérifié (OK) après chaque lot.

## ⚠️ Méthode & constat important
- **Migration sûre = `replace_all` sur `'#hex'` ENTRE QUOTES** : ça ne matche que les
  valeurs autonomes ; les couleurs imbriquées dans une chaîne (dégradés, ombres,
  `'1px solid rgba(...)'`) ne sont PAS touchées → aucun risque de casser le rendu.
  Les `rgba(45,42,36,X)` (bordures/overlays) restent donc à migrer manuellement vers
  `ink(X)` dans un second temps (conversion en template literal).
- **Tous les fichiers ne sont PAS migrables vers le palette TS** : `create/page.tsx`
  (et d'autres pages publiques) utilisent des couleurs en **classes Tailwind**
  `text-[#2d2a24]` / `bg-[#...]`, pas en styles inline. Pour celles-là, la bonne
  approche est d'ajouter des tokens dans la **config Tailwind / `globals.css`**
  (`@theme`) et d'utiliser `text-ink`, etc. — PAS `palette` (qui est du JS, inutilisable
  dans une classe). À traiter comme un chantier distinct.
- **`AnalyseTab.tsx`** : mock V2 avec surtout des couleurs **décoratives** de graphiques
  (avatars, barres) hors charte de marque → faible valeur, à ne migrer que pour les
  tokens réels (ink/green/amber…), laisser les couleurs arbitraires.

## ⬜ À faire — migrer les fichiers restants vers les tokens
Remplacer dans chaque fichier les couleurs en dur par les tokens de `theme.ts`.
Méthode par fichier : repérer `#xxxxxx` et `rgba(45,42,36,…)`, mapper sur `palette.*`
/ `ink(…)`, vérifier visuellement (le rendu doit être identique), puis build.

Table de correspondance principale :
| En dur | Token |
|---|---|
| `#2d2a24` | `palette.ink` |
| `#5a564c` | `palette.inkMuted` |
| `#7a766d` | `palette.inkSoft` |
| `#9a948a` | `palette.inkFaint` |
| `#bdb8ad` | `palette.inkGhost` |
| `#fcf9f2` | `palette.cream` |
| `#fbf7ef` | `palette.creamAlt` |
| `#f4f0e6` | `palette.parchment` |
| `#fff` / `#ffffff` | `palette.paper` |
| `#4f6b40` | `palette.green` |
| `#5f8a3f` | `palette.greenBrand` |
| `#7a9968` | `palette.greenSoft` |
| `#a87a3a` | `palette.amber` |
| `#c89860` | `palette.amberLight` |
| `#b85a4a` | `palette.danger` |
| `rgba(45,42,36,0.XX)` | `ink(0.XX)` |
| `rgba(184,90,74,0.12)` | `palette.dangerTint` |
| `rgba(232,184,108,0.18)` | `palette.amberTint` |

Fichiers à migrer (du plus chargé au moins chargé — cf. audit, ~538 occurrences) :
- [ ] `src/app/[locale]/workshops/[id]/tabs/ExamenTab.tsx` (~173 occ.)
- [ ] `src/app/[locale]/workshops/[id]/settings/SettingsClient.tsx` (~147 occ.)
- [ ] `src/app/[locale]/workshops/[id]/tabs/QuestionEditor.tsx` (~50 occ.)
- [ ] `src/app/[locale]/workshops/[id]/tabs/ProgrammeTab.tsx` (~33 occ.)
- [ ] `src/app/[locale]/profile/ProfileClient.tsx` (~30 occ.)
- [ ] `src/app/[locale]/pricing/PricingClient.tsx` (~24 occ.)
- [ ] `src/app/[locale]/dashboard/DashboardClient.tsx` (~21 occ.)
- [ ] `src/app/[locale]/profile/avatar/page.tsx` (~21 occ.)
- [ ] `src/app/[locale]/workshops/[id]/tabs/AnalyseTab.tsx` (mock V2 — couleurs déco, faible priorité)
- [x] ~~`src/app/[locale]/workshops/[id]/WorkshopClient.tsx`~~ ✅
- [x] ~~`src/app/[locale]/workshops/[id]/tabs/CoursTab.tsx`~~ ✅
- [x] ~~`src/app/[locale]/workshops/[id]/session/page.tsx`~~ ✅ (partiel : 2 tokens)
- [ ] ~~`src/app/[locale]/create/page.tsx`~~ → **classes Tailwind, pas de palette TS** (chantier Tailwind)
- [ ] `src/components/ShareQRModal.tsx`
- [ ] `src/components/DashboardHeader.tsx`, `Navbar.tsx`, `Footer.tsx`, `WaitlistForm.tsx`
- [ ] `src/app/[locale]/garden/GardenClient.tsx` (couleurs spécifiques au jardin — à évaluer : certaines sont propres au rendu isométrique, pas forcément à tokeniser)

## ⬜ À faire — étape finale (cohérence)
- [ ] Vérifier que `theme.ts` reste synchronisé avec les variables CSS de
      `src/app/globals.css` (`--primary`, `--color-culture-green`, …).
- [ ] Décider à terme d'une **source unique** : soit migrer les classes Tailwind
      pour qu'elles lisent les mêmes valeurs, soit (idéal) exposer la palette en
      variables CSS et lire `var(--…)` aussi dans les styles inline.

## ✅ Achèvement — migration inline complète (22/06/2026)
Migration en masse via 2 scripts temporaires (supprimés depuis), sûrs (remplacent
uniquement les valeurs autonomes entre quotes, jamais les couleurs imbriquées dans
une chaîne) :
- **Toutes les couleurs de marque hex autonomes** (`'#2d2a24'`, `'#fcf9f2'`,
  `'#4f6b40'`, `'#a87a3a'`, `'#b85a4a'`, etc.) → `palette.*`. **Reste : 0** (vérifié
  par grep, hors `theme.ts`).
- **Tous les `rgba(45,42,36,X)` d'encre autonomes** → `ink(X)`.
- Fichiers migrés : Dashboard, Garden(+engine), Pricing, Profile(+avatar), Settings,
  Analyse, Examen, Programme, QuestionEditor, ShareQRModal, WorkshopClient, CoursTab,
  session, Modal, ConfirmDialog. **Build OK.**

### Reste (mineur, non bloquant) — vrais chantiers restants
- **`rgba(45,42,36,X)` imbriqués dans des chaînes** (`border: '1px solid rgba(...)'`,
  ombres) : non migrés (nécessitent une conversion en template literal `\`… ${ink(X)}\``,
  au cas par cas). Neutres (encre), pas des couleurs de marque.
- **Tints non-encre** (`rgba(255,255,255,…)`, `rgba(184,90,74,…)` danger, amber,
  green) en chaînes : à tokeniser si besoin (ajouter des helpers `withAlpha`).
- **7 attributs SVG double-quote** (`stroke="#2d2a24"`) : idéalement passer ces SVG
  inline en icônes Lucide (cf. règle §1) puis supprimer.
- **Pages en classes Tailwind** (`text-[#2d2a24]`, ex. `create/page.tsx`) : chantier
  distinct → définir les tokens dans `globals.css` `@theme` (`text-ink`, `bg-cream`…).

## Comment relancer
« Continue l'audit §2.4 : migre le prochain fichier de la checklist
`AUDIT_2.4_design_system.md` vers les tokens de `src/lib/theme.ts`, sans changer
le rendu, puis coche-le. » (Faire 1-2 fichiers par session pour rester sûr.)
