// ─── Design system — source de vérité UNIQUE = variables CSS de @theme ────────
//
// Les couleurs sont définies UNE SEULE FOIS dans `src/app/globals.css` (bloc
// `@theme`, ex. `--color-ink: #2d2a24`). Tailwind v4 les expose comme variables
// CSS sur `:root`, donc :
//   - les classes Tailwind (`text-ink`, `bg-cream`…) les utilisent ;
//   - les styles inline les utilisent via ce module (`palette.ink` = `var(--color-ink)`).
// → Un seul endroit à modifier pour changer la charte ; aucun risque de désync.
//
// Pour changer/ajouter une couleur : éditer `globals.css` (@theme) PUIS ajouter
// l'entrée correspondante ici (même nom). Ne JAMAIS remettre de hex en dur ici.

/** Référence vers une variable CSS de couleur du thème. */
const v = (name: string) => `var(--color-${name})`;

/** Couleur de marque (token) → rgba équivalent à `alpha`, via color-mix
 *  (même mécanisme que les opacités Tailwind v4, ex. `bg-ink/42`). */
function mix(colorVar: string, alpha: number): string {
  const pct = +(alpha * 100).toFixed(2);
  return `color-mix(in srgb, ${colorVar} ${pct}%, transparent)`;
}

/** Tokens de couleur (références aux variables CSS de @theme). */
export const palette = {
  ink: v('ink'),
  inkMuted: v('ink-muted'),
  inkSoft: v('ink-soft'),
  inkFaint: v('ink-faint'),
  inkGhost: v('ink-ghost'),
  cream: v('cream'),
  creamAlt: v('cream-alt'),
  parchment: v('parchment'),
  paper: v('paper'),
  green: v('green'),
  greenBrand: v('green-brand'),
  greenSoft: v('green-soft'),
  amber: v('amber'),
  amberLight: v('amber-light'),
  amberGlow: v('amber-glow'),
  danger: v('danger'),

  // Teintes translucides récurrentes (fonds de pastilles d'icône)
  dangerTint: mix(v('danger'), 0.12),
  amberTint: mix(v('amber-glow'), 0.18),
} as const;

/**
 * Couleur de marque + opacité → couleur translucide. Ex. withAlpha(palette.danger, 0.12).
 * Accepte une référence de variable CSS (palette.*). Pour l'encre, préférer `ink(alpha)`.
 */
export function withAlpha(colorVar: string, alpha: number): string {
  return mix(colorVar, alpha);
}

/** Translucide sur l'encre — bordures, fonds légers, ombres, overlays. Ex. ink(0.14). */
export const ink = (alpha: number) => mix(v('ink'), alpha);

/** Rayons d'arrondi récurrents. */
export const radius = { sm: 9, md: 10, lg: 12, xl: 20 } as const;

/** Ombre portée standard des cartes/modales. */
export const shadow = {
  modal: `0 24px 64px ${ink(0.25)}`,
  card: `0 4px 16px ${ink(0.06)}`,
} as const;
