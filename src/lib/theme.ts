// ─── Design system — source de vérité des couleurs (« design tokens ») ────────
//
// Objectif : centraliser ici TOUTES les couleurs de l'app pour qu'une évolution
// de charte se fasse en un seul endroit. Le code utilise massivement des styles
// inline (`style={{ color: '#2d2a24' }}`) avec des valeurs en dur dupliquées des
// centaines de fois — on les remplace progressivement par ces tokens.
//
// Pendant la migration, ces valeurs DOIVENT rester synchronisées avec les
// variables CSS de `globals.css` (`--primary`, `--color-culture-green`, …) qui,
// elles, servent aux classes Tailwind. À terme, viser une source unique (idéalement
// des variables CSS lues partout), mais ce module est l'étape pragmatique vu
// l'usage inline actuel.
//
// Depuis le chantier de refonte UI (08/2026, T3), les valeurs sont alignées sur
// le Culture Design System (docs/design/_ds/culture-design-system-…/tokens/colors.css).
// Les anciens noms sont conservés comme **alias** vers les nouvelles valeurs — la
// rampe de gris d'encre passe de 5 à 4 paliers (ghost réutilise faint), la rampe
// de verts/ambres de 3 valeurs à 3 valeurs mais réordonnée (voir mapping ci-dessous)
// — pour qu'aucun appelant existant ne casse avant les tâches d'écran (T12+).

/** Palette nommée. Noms sémantiques (rôle), pas « vert/ambre », pour suivre une évolution de charte. */
export const palette = {
  // Encre / textes — alias vers la rampe --ink/--ink-body/--ink-muted/--ink-faint
  ink: '#2A2620',        // texte fort, titres — --ink
  inkMuted: '#4A4234',   // texte secondaire — --ink-body
  inkSoft: '#696253',    // texte tertiaire / hints — --ink-muted
  inkFaint: '#9A917F',   // labels discrets — --ink-faint
  inkGhost: '#9A917F',   // icônes inactives — pas de 5e palier, réutilise --ink-faint

  // Fonds — alias vers la pile --surface-*
  cream: '#F4EFE6',      // fond principal de l'app et des cartes — --surface-page
  creamAlt: '#FCFAF4',   // variante de fond (panneaux) — --surface-raised
  parchment: '#F5F8EF',  // texte sur fond vert (boutons primaires) — --on-green
  paper: '#FEFCF7',      // cartes claires (QR, etc.) — --surface-input

  // Vert Culture (primaire) — alias vers --green-strong/--green/--green-light
  green: '#3C6B39',      // primaire (boutons) — --green
  greenBrand: '#2D5029', // couleur de marque — --green-strong
  greenSoft: '#82A968',  // vert doux — --green-light

  // Ambre / bois → tan (accent) — alias vers --tan/--gold-strong/--gold
  amber: '#9C7C4D',      // --tan
  amberLight: '#8C6C24', // --gold-strong

  // Danger
  danger: '#BC5439',     // --danger

  amberGlow: '#C39A47',  // ambre clair (pastilles, surbrillances) — --gold

  // Teintes translucides récurrentes (fonds de pastilles d'icône)
  dangerTint: 'rgba(188,84,57,0.12)',
  amberTint: 'rgba(195,154,71,0.18)',

  // ── Nouveaux rôles du Culture Design System (pas d'équivalent legacy) ──
  surfaceRaised: '#FCFAF4', // --surface-raised
  surfaceInput: '#FEFCF7',  // --surface-input
  surfaceSunken: '#ECE4D5', // --surface-sunken
  line: '#E3DAC9',          // --line
  lineStrong: '#D6CBB5',    // --line-strong
  success: '#5C8C4D',       // --success
  gold: '#C39A47',          // --gold
  onGreen: '#F5F8EF',       // --on-green
  onInk: '#F2EDE3',         // --on-ink
} as const;

/**
 * Couleur de marque + opacité → rgba. Ex. withAlpha(palette.danger, 0.12).
 * Pour l'encre (#2A2620), préférer le raccourci `ink(alpha)` ci-dessous.
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Translucide sur l'encre (#2A2620) — bordures, fonds légers, ombres, overlays.
 * Ex. ink(0.14) → 'rgba(42, 38, 32, 0.14)'. Remplace les innombrables
 * `rgba(45,42,36,0.XX)` codés en dur (ancienne valeur, avant T3).
 */
export const ink = (alpha: number) => `rgba(42, 38, 32, ${alpha})`;

/** Rayons d'arrondi — deux valeurs + pill (Culture Design System). */
export const radius = { sm: 12, md: 12, lg: 20, pill: 999 } as const;

/**
 * Ombres — deux élévations chaudes (teinte brun-écorce, tokens `--shadow-sm`
 * et `--shadow-lg`) + halo de focus.
 */
export const shadow = {
  sm: '0 1px 2px rgba(74, 58, 33, 0.05), 0 4px 12px rgba(74, 58, 33, 0.06)',
  lg: '0 4px 12px rgba(74, 58, 33, 0.08), 0 24px 56px rgba(74, 58, 33, 0.12)',
  inset: 'inset 0 1px 2px rgba(74, 58, 33, 0.07)',
  focus: '0 0 0 3px var(--ring)',
} as const;
