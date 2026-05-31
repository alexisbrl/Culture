// gardenEngine — Terra-Nil-inspired garden: one FIXED island of land cells sitting
// in water. The user never changes the island outline; instead they PAINT the
// surface of each cell (grass / path / tall grass / earth / water-lake / bridge)
// and place objects (trees, houses, mountains, decorations) on top.

export type CellKey = string; // "col,row"

export type Species = 'chene' | 'paulownia' | 'pin' | 'pommier';
export type Plant = { species: Species; stage: 1 | 2 | 3 };

// surface of a cell
export type TileKind = 'grass' | 'path' | 'tallgrass' | 'earth' | 'water' | 'bridge';
export type StructureKind = 'house' | 'mountain';
// anything that can sit in the inventory and be placed
export type AnyKind = TileKind | 'tree' | StructureKind;

export type Cosmetic = 'rock' | 'flowers' | 'mushroom' | 'lantern' | 'basket' | 'stump' | 'bush';
export const COSMETICS: Cosmetic[] = ['rock', 'flowers', 'mushroom', 'lantern', 'basket', 'stump', 'bush'];

export type Tile = {
  kind: TileKind;
  plant?: Plant | null;
  cosmetic?: Cosmetic | null;
  structureId?: string;
};

export type Structure = { id: string; kind: StructureKind; col: number; row: number };

export type InventoryItem = { id: string; kind: AnyKind; plant?: Plant | null };

export type GardenState = {
  tiles: Record<CellKey, Tile>; // the fixed island cells (outline immutable)
  structures: Structure[];
  inventory: InventoryItem[];
  xp: number;
};

export const STRUCT_SIZE: Record<StructureKind, { w: number; h: number }> = {
  house: { w: 2, h: 2 },
  mountain: { w: 3, h: 3 },
};
export function isStructureKind(k: AnyKind): k is StructureKind {
  return k === 'house' || k === 'mountain';
}

// land = anything you can walk/build on (not open water, not a bridge deck)
export function isLandKind(k: TileKind): boolean {
  return k !== 'water' && k !== 'bridge';
}
export function isLand(t: Tile | undefined): boolean {
  return !!t && isLandKind(t.kind);
}

export function itemSig(it: InventoryItem): string {
  if (it.kind === 'tree' && it.plant) return `tree:${it.plant.species}-${it.plant.stage}`;
  return it.kind;
}

let _uid = 0;
export function uid(): string {
  _uid += 1;
  return `i${Date.now().toString(36)}${_uid}`;
}

// ---- geometry ----
export const TILE_W = 96;
export const TILE_H = 48;
export const DEPTH = 22; // gentle land thickness above the water
export const LIP_H = 5;

export function key(col: number, row: number): CellKey {
  return `${col},${row}`;
}
export function parseKey(k: CellKey): { col: number; row: number } {
  const [col, row] = k.split(',').map(Number);
  return { col, row };
}
export function isoPos(col: number, row: number, originX: number, originY: number) {
  return { x: originX + (col - row) * (TILE_W / 2), y: originY + (col + row) * (TILE_H / 2) };
}

export function centroid(keys: CellKey[]) {
  if (keys.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const k of keys) {
    const { col, row } = parseKey(k);
    sx += (col - row) * (TILE_W / 2);
    sy += (col + row) * (TILE_H / 2);
  }
  return { x: sx / keys.length, y: sy / keys.length };
}

export const DIRS = [
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: -1 },
];
export function neighbours(col: number, row: number) {
  return DIRS.map((d) => ({ col: col + d.dc, row: row + d.dr }));
}

export function footprint(kind: StructureKind, col: number, row: number): CellKey[] {
  const { w, h } = STRUCT_SIZE[kind];
  const cells: CellKey[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) cells.push(key(col + c, row + r));
  return cells;
}

export function depthSort(keys: CellKey[]): { col: number; row: number; k: CellKey }[] {
  return keys
    .map((k) => ({ ...parseKey(k), k }))
    .sort((a, b) => a.col + a.row - (b.col + b.row) || a.col - a.row - (b.col - b.row));
}

// connection bitmask for auto-tiling (path/bridge)
export function connMask(col: number, row: number, connects: (k: CellKey) => boolean): boolean[] {
  return DIRS.map((d) => connects(key(col + d.dc, row + d.dr)));
}

// The fixed island: a rounded organic blob. Outline never changes.
export function islandCells(): CellKey[] {
  const cells: CellKey[] = [];
  const cx = 3.5;
  const cy = 3;
  const rx = 4.3;
  const ry = 3.5;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 8; c++) {
      const dx = (c - cx) / rx;
      const dy = (r - cy) / ry;
      if (dx * dx + dy * dy <= 1) cells.push(key(c, r));
    }
  }
  return cells;
}

export function cellRng(col: number, row: number) {
  let s = ((col * 73856093) ^ (row * 19349663)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ---- palette (calm, Terra-Nil-ish) ----
export const PAL = {
  grassTopLight: '#b3d189',
  grassTopDark: '#93bd68',
  grassBevel: '#d4e8ad',
  grassEdgeShade: '#79a456',
  blade: '#7fa856',
  bladeDeep: '#5f8a3f',
  // earth surface
  earthTopLight: '#d2b683',
  earthTopDark: '#bd9c64',
  // soil sides (below any land)
  turfRight: '#7aa14f',
  soilRightTop: '#b08a55',
  soilRightBot: '#7c5d38',
  turfLeft: '#5f7f3c',
  soilLeftTop: '#8a6a40',
  soilLeftBot: '#5c4329',
  pebble: '#ccb78f',
  root: '#5a4226',
  // path
  pathLight: '#dcc89c',
  pathDark: '#c3ac7b',
  // tall grass
  tallGrass: '#6f9a48',
  tallGrassDeep: '#4f7a30',
  // water
  seaTop: '#a9d2d8',
  seaBot: '#83b4be',
  lakeTop: '#9ccad2',
  lakeDeep: '#7badb7',
  foam: '#e4f3f4',
  shimmer: '#d6eef0',
  // bridge / wood
  plankLight: '#bb8e5c',
  plankDark: '#976d42',
  plankEdge: '#74532f',
  rope: '#d2c099',
  // mountain rock
  rockLight: '#a3a8af',
  rockMid: '#868c95',
  rockDark: '#666c76',
  snow: '#f4f7fa',
  // house
  wallLight: '#ecdcbc',
  wallDark: '#d2be94',
  roofLight: '#bb6a4e',
  roofDark: '#954f39',
  woodFrame: '#7a5a3c',
};
