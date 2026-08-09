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
  tanStrong: '#6E5736',     // --tan-strong (texte brun fort, ex. titre de partie sur la feuille A4)
  greenTint: '#E7EEDB',     // --green-tint (fonds/dégradés doux à teinte verte)
  tanTint: '#ECE1CB',       // --tan-tint (fonds/dégradés doux à teinte tan)
  goldTint: '#F3EBD2',      // --gold-tint (fonds/dégradés doux à teinte or)
} as const;

/**
 * Teintes des pastilles d'initiale (membres d'un atelier).
 *
 * Reprises telles quelles de la maquette (`regMembers`, App-Culture.dc.html
 * ligne 2700) : quatre tokens du design system plus deux teintes sourdes que la
 * maquette introduit sans les nommer (`--blue` avec repli, et un prune). Elles
 * remplacent une rampe de huit teintes HSL générées (saturation 55-60 %), qui
 * produisait des pastilles cyan et magenta franchement hors palette.
 *
 * Volontairement plates : la maquette n'applique aucun dégradé aux avatars.
 */
export const avatarTones = [
  '#7A9BB5',              // bleu sourd (--blue de la maquette)
  '#9B7AB5',              // prune sourd
  palette.greenSoft,      // --green-light
  palette.amber,          // --tan
  palette.green,          // --green
  palette.greenBrand,     // --green-strong
] as const;

/**
 * Teintes catégorielles hors palette de marque stricte (vert/tan/ink/danger/or) —
 * pour distinguer visuellement plusieurs catégories (types de question, libellés
 * d'examen) sans réutiliser indéfiniment le vert ou l'ambre. Reprises de la
 * maquette, même esprit qu'`avatarTones` ci-dessus.
 */
export const categoryTones = {
  blueGray: '#9EB3B9',
  mauve: '#A890B8',
  steelBlue: '#6B8EA8',
  rust: '#C2603A',
} as const;

/**
 * Teinte stable d'un membre, dérivée de son nom. Somme des codes de caractères
 * plutôt que le seul premier caractère : deux membres dont le prénom commence
 * par la même lettre (fréquent) recevaient sinon toujours la même pastille.
 */
export function avatarTone(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return avatarTones[sum % avatarTones.length];
}

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
 * Encre lisible sur un aplat de couleur quelconque (libellé d'examen, teinte
 * catégorielle…) : luminance perçue (coefficients ITU-R BT.601) au-dessus du
 * seuil → encre foncée, en dessous → encre claire. Utile dès qu'une couleur
 * choisie par l'utilisateur devient un fond et non plus une pastille.
 */
export function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? palette.ink : palette.onInk;
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
