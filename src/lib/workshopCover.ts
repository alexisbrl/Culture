export const COVER_GRADIENTS = {
  amber: 'linear-gradient(135deg, #e8d8a8, #c89860)',
  sky: 'linear-gradient(135deg, #c7d4d8, #9eb3b9)',
  sage: 'linear-gradient(135deg, #cfd9c0, #a8b896)',
  wood: 'linear-gradient(135deg, #cbb79a, #a08a72)',
} as const;

export type CoverGradient = keyof typeof COVER_GRADIENTS;

export const COVER_GRADIENT_KEYS = Object.keys(COVER_GRADIENTS) as CoverGradient[];

/** Renvoie le gradient stocké, ou un gradient par défaut déterminé par hash de l'id. */
export function coverGradientFor(id: string, stored?: string | null): CoverGradient {
  if (stored && (COVER_GRADIENT_KEYS as string[]).includes(stored)) {
    return stored as CoverGradient;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_GRADIENT_KEYS[hash % COVER_GRADIENT_KEYS.length];
}

export type CoverStyle = {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
};

/**
 * Renvoie le style CSS de la couverture : image personnalisée si présente, sinon le gradient.
 * N'utilise jamais le raccourci `background` — le mélanger avec `backgroundSize`/`backgroundPosition`
 * sur le même élément déclenche l'avertissement React « conflicting property ».
 */
export function coverStyleFor(id: string, gradient?: string | null, imageUrl?: string | null): CoverStyle {
  if (imageUrl) {
    return { backgroundColor: 'transparent', backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { backgroundColor: 'transparent', backgroundImage: COVER_GRADIENTS[coverGradientFor(id, gradient)], backgroundSize: 'auto', backgroundPosition: '0 0' };
}

export const COVER_EMOJIS = ['📚', '🌿', '🔬', '🎨', '🧮', '🌍', '💡', '🎵'] as const;

/** Renvoie l'emoji stocké, ou un emoji par défaut déterminé par hash de l'id. */
export function emojiFor(id: string, stored?: string | null): string {
  if (stored) return stored;
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_EMOJIS[hash % COVER_EMOJIS.length];
}
