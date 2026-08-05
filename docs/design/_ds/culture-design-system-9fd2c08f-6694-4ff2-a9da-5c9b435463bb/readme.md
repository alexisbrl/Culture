# Culture — Design System

> « dépose tes cours — l'IA fera pousser les briques toute seule. »

**Culture** is a gamified EdTech learning app — *"Duolingo on your own course material."* A learner drops in their files (PDFs, slides, notes); an AI decomposes them into **briques de connaissance** (knowledge bricks) and grows a personalised training programme plus auto-graded exams inside a workspace called the **Atelier**. The guiding metaphor is **cultivation / gardening**: you *plant* a subject, the AI makes the bricks *grow*, and the learner tends a garden (the **Jardin**) that flourishes with their progress.

The product is **in French**, uses **tutoiement** (informal "tu"), warm conversational copy, and **lowercase serif titles**. The mood is playful-yet-professional, calm, lo-fi, evocative of nature.

---

## Sources provided

This system was reverse-engineered from seven hi-fi mockup screenshots (no codebase or Figma was supplied):

| File | Screen |
|---|---|
| `uploads/Jardin 1ère version.jpg` | Home — the isometric garden ("île iso") + today's session panel |
| `uploads/Page Atelier 1.jpg` | Atelier → Analyse — group dashboard, mastery bars, member table |
| `uploads/Page atelier 2.jpg` | Atelier → Génération d'examen — exam list + question bank |
| `uploads/Page création d'atelier.jpg` | Nouvel atelier — file dropzone + identity/visibility panels |
| `uploads/Page profil.jpg` | Profil — avatar, subscription, stats, streak |
| `uploads/Page Recherche.jpg` | Explorer — discover ateliers, join-by-tag |
| `uploads/Page abonnement.jpg` | Abonnement — three-tier pricing (Graine / Premium / Premium+) |

> Colours and fonts were **not** pinned by the brand. Hues were optimised for harmony + AA contrast inside the stated direction (green = growth, brown = neutrality, warm cream background). Fonts are Google-Fonts substitutions — see **Typography** below. Replace with the real brand fonts when available.

---

## Products / surfaces

There is one product — the **Culture web app** — with several surfaces, all recreated in `ui_kits/app/`:

- **Jardin** — the home garden + daily session ("arroser" = water = study)
- **Atelier** — a subject workspace (programme, exam generation, analytics dashboard, course generation)
- **Nouvel atelier** — create a workshop by dropping source files
- **Explorer** — discover & join public ateliers
- **Profil** — identity, streak, stats
- **Abonnement** — pricing tiers

---

## Content fundamentals — how Culture writes

**Language & address.** French, always **tutoiement** ("dépose **tes** cours", "ton jardin t'attend", "tu y es"). Warm, encouraging, never corporate. The reader is a gardener-learner; the app is a gentle companion.

**Casing.** This is the signature move:
- **Page hero titles are lowercase serif** and end with a period: *"ton jardin t'attend."*, *"plante une nouvelle matière."*, *"choisis ton niveau de jardinage."*, *"de nouvelles graines à planter."*
- **Eyebrow labels are UPPERCASE** sans, letter-spaced: `AUJOURD'HUI`, `ABONNEMENT`, `ARROSOIR DU JOUR`, `SOURCE · LE CŒUR DE TON ATELIER`.
- **Data-screen headings** (names, dashboards) use **bold sans, normal casing**: "Alexis Bourillon", "Tableau de bord", "Biologie cellulaire — L2".

**The garden metaphor is the vocabulary.** It is consistent and load-bearing — translate UI concepts into garden terms:
| App concept | Culture word |
|---|---|
| Study session | **arroser** (water) / *arroser maintenant →* |
| Knowledge unit | **brique** (brick) |
| Subject / workspace | **atelier**, planted as a **parcelle** (plot) |
| Daily streak meter | **arrosoir** (watering can) — "8/10", "8 sessions aujourd'hui" |
| Activity feed | **journal** |
| Free / Mid / Pro tiers | **Graine · Buisson · Arbre** (seed · bush · tree) |
| "Needs studying" | *« a soif »* (thirsty) |
| Ready to harvest | *récolte prête*, *baies à cueillir* (berries to pick) |

**Accroches.** A warm tan aside next to or under a title — set in the **sans** (a validated font), not a separate typeface: *« dépose tes cours — l'IA fera pousser les briques toute seule »*, *« nos ateliers loisir, prêts à pousser »*. The warmth comes from the tan colour and the copy, not a special font. Used sparingly, as a wink — never for dense reading.

**Tone of micro-copy.** Friendly and concrete. Buttons are verbs with a trailing arrow: *arroser maintenant →*, *créer l'atelier →*, *gérer l'abonnement →*, *rejoindre →*, *continuer →*. Helper text reassures: *"l'IA extraira ensuite les briques · tu pourras tout ajuster."*

**Numbers & units.** French formatting — comma decimals and `/20` grading ("14,2/20", "61 %", non-breaking space before %). Versioned-feature badges mark the roadmap: `V2`, `V3` next to not-yet-shipped items ("Jardiniers amis `V2`", "Page publique de certification … `V3`").

**Emoji.** Not used as UI. Personality comes from the serif italic accroches, the garden words, and the illustrated plants/avatars — not emoji.

---

## Visual foundations

**Background.** Never white, never dark. A warm **cream/beige** family. There are layered washes: a slightly darker beige *canvas* (`--cream-canvas` #E9E2D4) behind the app window, the cream *page* (`--cream-page` #F5F0E8), lighter *raised* cream for cards (`--cream-raised` #FBF8F2), and the brightest warm surface for inputs (`--cream-bright`). Some pages add a faint warm radial glow behind the focal content (a low sun). Cover/banner art uses soft diagonal-stripe gradients in muted green or tan.

**Colour vibe.** Low saturation, sun-warmed, botanical — and deliberately small. The whole palette is ~16 values: a cream surface stack, **one hero green** (`--green` #3C6B39 for every action & progress fill, with `--green-strong` for hover/press/text and `--green-light` + `--green-tint` for data and soft surfaces), **one warm earth** (`--tan` for the caramel secondary button, script ink, and accents), a four-step warm-grey **ink** ramp for text, and three functional colours — sage `--success`, clay `--danger` (never neon), and `--gold` for premium/certification. That's it. Discipline is the point.

**Typography.** Two voices, four weights, one seven-step scale — and nothing else. A warm **serif** (Source Serif 4) for lowercase hero titles & editorial; a friendly humanist **grotesque** (Hanken Grotesk) for absolutely everything else — UI, body, data, and the warm tan accroche asides. *(Both are Google-Fonts substitutions for unspecified brand fonts. An earlier handwriting script was retired entirely.)*

**Corner radii.** Two values and a pill. **12px** is the keeper — inputs, buttons, chips, small cards; **20px** for larger cards, panels, and the app shell; **pill** (999px) for toggles and round avatars. Soft, but disciplined.

**Cards.** Raised cream on the page, hairline warm border (`--line` #E3DBCC), soft low shadow. No heavy outlines, no coloured left-border accents. "Coming soon" cards use a **dashed tan border** with no fill. Feature-spotlight cards invert to dark ink with light text.

**Shadows.** Two warm elevations only — **`--shadow-sm`** rests under every card, **`--shadow-lg`** lifts overlays/dialogs/the app shell — plus a hairline `--shadow-inset` for progress tracks and a green `--shadow-focus` halo. All bark-brown tinted (not grey), low opacity, diffuse — like soft sun. Never harsh.

**Borders.** 1px hairlines in warm `--line`. Dropzones and not-yet-available blocks use a 1.5px **dashed tan** border. Dividers are even fainter (`--line-soft`).

**Buttons & states.**
- *Primary* — solid forest green, light text, trailing arrow. Hover → darker green (`--green-800`); press → deepest (`--green-900`) + tiny scale-down (≈0.98).
- *Secondary* — caramel tan solid, or a tan-bordered ghost on cream.
- *Ink* — solid charcoal, used for neutral confirmations ("éditer le profil", "rejoindre").
- *Ghost / pill* — cream surface, hairline border, for toggles and filters (the "matin · printemps", "30 jours" chips).
- Hover lifts subtly (shadow + −1px translate on cards); focus shows a soft green halo ring.

**Motion.** Calm and minimal. Fades and small settles with `--ease-out` (a gentle decelerate). No bounces, no springy overshoot, no infinite decorative loops. Durations 120–360ms. The garden itself can have slow ambient life (drifting light), but UI motion is restrained.

**Transparency & blur.** Light touch — occasional translucent overlay scrim behind modals (the Explorer panel floats over a dimmed garden), faint radial sun-glows. No heavy glassmorphism.

**Layout.** Centred content on cream with comfortable margins; a fixed top nav (~60px) with the logo + word "Culture", primary tabs (jardin · explorer · nouvel atelier · profil), and right-side status pills (moment/saison, day counter, search ⌘K, avatar). Dashboards use multi-column stat grids and tidy tables with right-aligned numerals. Generous whitespace; nothing cramped.

**Imagery.** Soft, warm, slightly muted illustration — isometric low-poly garden scenes, hand-drawn-feeling character avatars, simple plant icons. Cover art is abstract diagonal-stripe gradient fields in muted green/tan. No photography, no cold/blue imagery, no harsh contrast.

---

## Iconography

**System: Lucide** (line icons), loaded from CDN. *(Substitution — the mockups use thin, rounded, friendly line icons with no detectable proprietary set; Lucide is the closest open match. Swap if the real set surfaces.)*

- **Style:** thin **1.75** stroke, rounded caps & joins, no fill. They read as quiet and hand-friendly — never bold or filled. Use `currentColor` so an icon inherits its context (forest green in nav, ink in text, light on dark cards).
- **Sizes:** 16px inline with text, 18–20px in buttons/nav, 22–24px standalone. Keep stroke visually consistent across sizes.
- **Garden-first vocabulary:** prefer botanical glyphs where they fit the metaphor — `sprout` (the brand's own motif), `leaf`, `trees`, `droplet`/watering for sessions, `sun`/`moon` for the moment toggle, `flame` for streaks, `star` for premium.
- **Common UI glyphs:** `search` (with ⌘K), `settings`, `upload`, `download`, `copy`, `file-text`, `qr-code`, `check`, `arrow-right` (the trailing arrow echoed in button labels), `x` (close).
- **Load:** `<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>` then `<i data-lucide="leaf"></i>` + `lucide.createIcons()`. In React, the components use a small inline-SVG `<Icon>` helper that mirrors Lucide paths.
- **Emoji & unicode:** not used as iconography. The only glyph-as-decoration is the occasional `★` for premium and `›` in breadcrumbs. Personality comes from illustration + the serif italic accroches, not emoji.

**Logo assets** (`assets/`): `logo-mark.svg` (the tree), `logo-lockup.svg` (tree + "Culture" wordmark). The mark is a soft three-lobe forest-green canopy on a tan trunk; the wordmark is bold Hanken Grotesk. Both are recreations from the mockups — no original vector was supplied.

---

## Index — what's in this system

**Root**
- `styles.css` — the single CSS entry point (consumers link this). `@import`s everything below.
- `readme.md` — this file.
- `SKILL.md` — Agent-Skills front-matter so the system works as a downloadable Claude skill.

**`tokens/`** — design tokens, all reachable from `styles.css`
- `fonts.css` · `colors.css` · `typography.css` · `spacing.css` · `base.css` · `_compat.css` (legacy ramp aliases → the tight palette)

**`assets/`** — `logo-mark.svg`, `logo-lockup.svg`. Icons come from **Lucide** (CDN) / the inline `Icon` component.

**`guidelines/`** — foundation specimen cards (Design System tab): colours (green, tan, neutrals, surfaces, functional), type (serif, sans, data, scale), spacing (scale, radii, shadows, borders), brand (logo, icons).

**`components/`** — reusable React primitives (namespace `window.CultureDesignSystem_9fd2c0`)
- `core/` — `Icon`, `Button`, `IconButton`, `Pill`, `Badge`, `Tag`, `Avatar`, `Card`
- `forms/` — `Input`, `Radio`, `Checkbox`, `SegmentedControl`
- `data/` — `ProgressBar`, `StatCard`, `Tabs`, `ArrosoirMeter`

**`ui_kits/app/`** — interactive recreation of the Culture web app (Jardin, Atelier, Nouvel atelier, Explorer, Profil). Entry: `ui_kits/app/index.html`.

**Starting points** — `Button`, `Card` (Core); `Input` (Forms); `StatCard`, `ArrosoirMeter` (Data); plus the full app screen.
