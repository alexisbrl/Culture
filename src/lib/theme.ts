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

/** Palette nommée. Noms sémantiques (rôle), pas « vert/ambre », pour suivre une évolution de charte. */
export const palette = {
  // Encre / textes
  ink: '#2d2a24',        // texte fort, titres
  inkMuted: '#5a564c',   // texte secondaire
  inkSoft: '#7a766d',    // texte tertiaire / hints
  inkFaint: '#9a948a',   // labels discrets
  inkGhost: '#bdb8ad',   // icônes inactives

  // Fonds
  cream: '#fcf9f2',      // fond principal de l'app et des cartes
  creamAlt: '#fbf7ef',   // variante de fond (panneaux)
  parchment: '#f4f0e6',  // texte sur fond vert (boutons primaires)
  paper: '#ffffff',      // cartes blanches (QR, etc.)

  // Vert Culture (primaire)
  green: '#4f6b40',      // primaire profond (boutons)
  greenBrand: '#5f8a3f', // couleur de marque
  greenSoft: '#7a9968',  // vert doux

  // Ambre / bois (accent)
  amber: '#a87a3a',
  amberLight: '#c89860',

  // Danger
  danger: '#b85a4a',

  amberGlow: '#e8b86c',  // ambre clair (pastilles, surbrillances)

  // Teintes translucides récurrentes (fonds de pastilles d'icône)
  dangerTint: 'rgba(184,90,74,0.12)',
  amberTint: 'rgba(232,184,108,0.18)',
} as const;

/**
 * Couleur de marque + opacité → rgba. Ex. withAlpha(palette.danger, 0.12).
 * Pour l'encre (#2d2a24), préférer le raccourci `ink(alpha)` ci-dessous.
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Translucide sur l'encre (#2d2a24) — bordures, fonds légers, ombres, overlays.
 * Ex. ink(0.14) → 'rgba(45, 42, 36, 0.14)'. Remplace les innombrables
 * `rgba(45,42,36,0.XX)` codés en dur.
 */
export const ink = (alpha: number) => `rgba(45, 42, 36, ${alpha})`;

/** Rayons d'arrondi récurrents. */
export const radius = { sm: 9, md: 10, lg: 12, xl: 20 } as const;

/** Ombre portée standard des cartes/modales. */
export const shadow = {
  modal: `0 24px 64px ${ink(0.25)}`,
  card: `0 4px 16px ${ink(0.06)}`,
} as const;
