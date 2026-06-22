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
- [x] Build vérifié (OK).

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
- [ ] `src/app/[locale]/workshops/[id]/tabs/AnalyseTab.tsx` (~14 occ.)
- [ ] `src/app/[locale]/workshops/[id]/WorkshopClient.tsx` (~9 occ.)
- [ ] `src/app/[locale]/workshops/[id]/tabs/CoursTab.tsx` (~6 occ.)
- [ ] `src/app/[locale]/workshops/[id]/session/page.tsx` (~5 occ.)
- [ ] `src/app/[locale]/create/page.tsx` (~4 occ.)
- [ ] `src/components/ShareQRModal.tsx`
- [ ] `src/components/DashboardHeader.tsx`, `Navbar.tsx`, `Footer.tsx`, `WaitlistForm.tsx`
- [ ] `src/app/[locale]/garden/GardenClient.tsx` (couleurs spécifiques au jardin — à évaluer : certaines sont propres au rendu isométrique, pas forcément à tokeniser)

## ⬜ À faire — étape finale (cohérence)
- [ ] Vérifier que `theme.ts` reste synchronisé avec les variables CSS de
      `src/app/globals.css` (`--primary`, `--color-culture-green`, …).
- [ ] Décider à terme d'une **source unique** : soit migrer les classes Tailwind
      pour qu'elles lisent les mêmes valeurs, soit (idéal) exposer la palette en
      variables CSS et lire `var(--…)` aussi dans les styles inline.

## Comment relancer
« Continue l'audit §2.4 : migre le prochain fichier de la checklist
`AUDIT_2.4_design_system.md` vers les tokens de `src/lib/theme.ts`, sans changer
le rendu, puis coche-le. » (Faire 1-2 fichiers par session pour rester sûr.)
