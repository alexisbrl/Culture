// Avatar composition system — port fidèle de _handoff/project/src/avatar.jsx

export type AvatarConfig = {
  face: string;
  hair: string;
  brow: string;
  eyes: string;
  nose: string;
  mouth: string;
  top: string;
};

export type FrameKey = 'bust' | 'head';

export const METRICS: Record<string, { w: number; h: number; cx: number; cy: number; by: number; bw: number }> = {
  'face-1':        { w: 557, h: 514, cx: 0.508, cy: 0.502, by: 0.051, bw: 0.833 },
  'face-2':        { w: 477, h: 512, cx: 0.506, cy: 0.493, by: 0.012, bw: 0.971 },
  'hair-1':        { w: 558, h: 374, cx: 0.490, cy: 0.561, by: 0.142, bw: 0.876 },
  'hair-2':        { w: 637, h: 572, cx: 0.451, cy: 0.485, by: 0.021, bw: 0.783 },
  'hair-3':        { w: 691, h: 646, cx: 0.486, cy: 0.470, by: 0.019, bw: 0.883 },
  'hair-4':        { w: 709, h: 622, cx: 0.492, cy: 0.500, by: 0.056, bw: 0.913 },
  'hair-5':        { w: 597, h: 543, cx: 0.499, cy: 0.401, by: 0.046, bw: 0.878 },
  'eyes-1':        { w: 214, h: 98,  cx: 0.484, cy: 0.444, by: 0.173, bw: 0.864 },
  'eyes-2':        { w: 341, h: 185, cx: 0.484, cy: 0.530, by: 0.308, bw: 0.833 },
  'brow-1':        { w: 378, h: 117, cx: 0.491, cy: 0.483, by: 0.316, bw: 0.854 },
  'brow-2':        { w: 378, h: 124, cx: 0.500, cy: 0.488, by: 0.339, bw: 0.836 },
  'nose-1':        { w: 157, h: 149, cx: 0.513, cy: 0.450, by: 0.134, bw: 0.529 },
  'mouth-1':       { w: 207, h: 105, cx: 0.473, cy: 0.505, by: 0.295, bw: 0.744 },
  'mouth-2':       { w: 277, h: 184, cx: 0.477, cy: 0.497, by: 0.261, bw: 0.643 },
  'mouth-3':       { w: 71,  h: 44,  cx: 0.542, cy: 0.455, by: 0.295, bw: 0.606 },
  'top-chemise':   { w: 596, h: 465, cx: 0.478, cy: 0.492, by: 0.069, bw: 0.913 },
  'top-salopette': { w: 524, h: 385, cx: 0.503, cy: 0.487, by: 0.042, bw: 0.926 },
  'top-sweat':     { w: 557, h: 418, cx: 0.512, cy: 0.505, by: 0.081, bw: 0.865 },
  'top-tshirt':    { w: 581, h: 394, cx: 0.485, cy: 0.509, by: 0.081, bw: 0.855 },
};

type TopAnchor    = { mode: 'top';    centerX: number; topY: number;    contentW: number };
type CenterAnchor = { mode: 'center'; centerX: number; centerY: number; contentW: number };
export type Anchor = TopAnchor | CenterAnchor;

export const LAYOUT: Record<string, Anchor> = {
  top:   { mode: 'top',    centerX: 352, topY: 410, contentW: 432 },
  face:  { mode: 'top',    centerX: 340, topY: 112, contentW: 300 },
  brow:  { mode: 'center', centerX: 340, centerY: 262, contentW: 198 },
  eyes:  { mode: 'center', centerX: 340, centerY: 304, contentW: 190 },
  nose:  { mode: 'center', centerX: 340, centerY: 338, contentW: 52  },
  mouth: { mode: 'center', centerX: 340, centerY: 388, contentW: 74  },
  hair:  { mode: 'top',    centerX: 340, topY: 74,  contentW: 374 },
};

export const PART_LAYOUT_OVERRIDE: Record<string, Anchor> = {
  'face-1':        { mode: 'top',    centerX: 340, topY: 122,    contentW: 300 },
  'hair-1':        { mode: 'top',    centerX: 333, topY: 74,     contentW: 374 },
  'hair-2':        { mode: 'top',    centerX: 340, topY: 55,     contentW: 300 },
  'hair-3':        { mode: 'top',    centerX: 337, topY: 65,     contentW: 425 },
  'hair-4':        { mode: 'center', centerX: 338, centerY: 252, contentW: 405 },
  'hair-5':        { mode: 'top',    centerX: 344, topY: 60,     contentW: 350 },
  'top-tshirt':    { mode: 'top',    centerX: 339, topY: 430,    contentW: 432 },
  'top-chemise':   { mode: 'top',    centerX: 342, topY: 410,    contentW: 432 },
  'top-sweat':     { mode: 'top',    centerX: 340, topY: 390,    contentW: 432 },
  'top-salopette': { mode: 'top',    centerX: 341, topY: 410,    contentW: 432 },
};

// Overrides spécifiques à la mini version (frame "head" — icône nav 28px).
// N'impacte PAS la grande version (frame "bust").
export const HEAD_LAYOUT_OVERRIDE: Record<string, Anchor> = {
  'hair-1':        { mode: 'top',    centerX: 339, topY: 74,     contentW: 374 },
  'hair-3':        { mode: 'top',    centerX: 350, topY: 61,     contentW: 450 },
  'hair-4':        { mode: 'center', centerX: 346, centerY: 255, contentW: 405 },
  'top-tshirt':    { mode: 'top',    centerX: 348, topY: 395,    contentW: 432 },
  'top-chemise':   { mode: 'top',    centerX: 345, topY: 380,    contentW: 432 },
  'top-sweat':     { mode: 'top',    centerX: 345, topY: 360,    contentW: 432 },
  'top-salopette': { mode: 'top',    centerX: 343, topY: 390,    contentW: 432 },
};

export const Z_ORDER = ['top', 'neck', 'face', 'brow', 'eyes', 'nose', 'mouth', 'hair'] as const;

export const FRAMES: Record<FrameKey, { x: number; y: number; s: number }> = {
  bust: { x: 84, y: 70, s: 520 },
  head: { x:  95, y: 27, s: 490 },
};

export const SKIN_COLOR: Record<string, string> = {
  'face-1': '#f2c8a0',
  'face-2': '#e8a870',
};

export const CATS: { key: keyof AvatarConfig; label: string; parts: string[]; hint: string }[] = [
  { key: 'face',  label: 'Visage',   parts: ['face-1', 'face-2'],                               hint: 'la forme du visage et la carnation.' },
  { key: 'hair',  label: 'Cheveux',  parts: ['hair-1', 'hair-2', 'hair-3', 'hair-4', 'hair-5'], hint: 'la coupe — chaque style se combine à tout le reste.' },
  { key: 'brow',  label: 'Sourcils', parts: ['brow-1', 'brow-2'],                               hint: "l'expression commence ici." },
  { key: 'eyes',  label: 'Yeux',     parts: ['eyes-1', 'eyes-2'],                               hint: 'le regard de ton jardinier.' },
  { key: 'nose',  label: 'Nez',      parts: ['nose-1'],                                         hint: 'une touche discrète.' },
  { key: 'mouth', label: 'Bouche',   parts: ['mouth-1', 'mouth-2', 'mouth-3'],                  hint: 'sourire, neutre, ou grand sourire.' },
  { key: 'top',   label: 'Vêtement', parts: ['top-tshirt', 'top-chemise', 'top-sweat', 'top-salopette'], hint: 'le haut que porte ton personnage.' },
];

export const DEFAULT_CONFIG: AvatarConfig = {
  face: 'face-1', hair: 'hair-1', brow: 'brow-1',
  eyes: 'eyes-1', nose: 'nose-1', mouth: 'mouth-1', top: 'top-tshirt',
};

const LS_KEY = 'culture.avatar.v1';

export function loadAvatarConfig(): AvatarConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export function saveAvatarConfig(cfg: AvatarConfig): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

export function resolveLayout(cat: string, partId: string, frame: FrameKey = 'bust'): Anchor {
  if (frame === 'head' && HEAD_LAYOUT_OVERRIDE[partId]) return HEAD_LAYOUT_OVERRIDE[partId];
  return PART_LAYOUT_OVERRIDE[partId] ?? LAYOUT[cat];
}

export function placePart(cat: string, id: string, frame: FrameKey = 'bust'): { left: number; top: number; w: number; h: number } | null {
  const m = METRICS[id];
  const L = resolveLayout(cat, id, frame);
  if (!m || !L) return null;
  const contentImgW = m.bw * m.w;
  const scale = L.contentW / contentImgW;
  const renderW = m.w * scale;
  const renderH = m.h * scale;
  const ccx = m.cx * renderW;
  let left: number, top: number;
  if (L.mode === 'top') {
    const contentTop = m.by * renderH;
    left = L.centerX - ccx;
    top = (L as TopAnchor).topY - contentTop;
  } else {
    const ccy = m.cy * renderH;
    left = L.centerX - ccx;
    top = (L as CenterAnchor).centerY - ccy;
  }
  return { left, top, w: renderW, h: renderH };
}
