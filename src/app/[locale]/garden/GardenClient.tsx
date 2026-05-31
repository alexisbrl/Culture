'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sprout, Check, Hammer, Maximize2, Move, Package, ArrowLeftRight, X, Sparkles, Blocks, Eraser, Droplets } from 'lucide-react';
import {
  PAL,
  TILE_W,
  TILE_H,
  DEPTH,
  LIP_H,
  COSMETICS,
  key,
  parseKey,
  isoPos,
  centroid,
  depthSort,
  cellRng,
  connMask,
  footprint,
  islandCells,
  isLand,
  isLandKind,
  isStructureKind,
  itemSig,
  uid,
  STRUCT_SIZE,
  type CellKey,
  type GardenState,
  type Plant,
  type Tile,
  type Structure,
  type InventoryItem,
  type AnyKind,
  type TileKind,
  type StructureKind,
  type Cosmetic,
} from './gardenEngine';

const STORAGE_KEY = 'culture.garden.v2';
const SURFACE_ORDER: TileKind[] = ['grass', 'path', 'tallgrass', 'earth', 'water', 'bridge'];
const SPECIES_LABEL: Record<string, string> = { chene: 'Chêne', paulownia: 'Paulownia', pin: 'Pin', pommier: 'Pommier' };
const KIND_LABEL: Record<string, string> = {
  grass: 'Herbe', path: 'Chemin', tallgrass: 'Herbe haute', earth: 'Terre', water: 'Eau', bridge: 'Pont', house: 'Maison', mountain: 'Montagne', tree: 'Arbre',
};
const COS_LABEL: Record<Cosmetic, string> = { rock: 'Rocher', flowers: 'Fleurs', mushroom: 'Champignon', lantern: 'Lanterne', basket: 'Panier', stump: 'Souche', bush: 'Buisson' };

function items(kind: AnyKind, n: number, plant: Plant | null = null): InventoryItem[] {
  return Array.from({ length: n }, () => ({ id: uid(), kind, plant }));
}

function defaultState(): GardenState {
  const tiles: Record<CellKey, Tile> = {};
  for (const k of islandCells()) tiles[k] = { kind: 'grass' }; // virgin grassy island
  const inventory: InventoryItem[] = [
    ...items('path', 10),
    ...items('tallgrass', 8),
    ...items('earth', 8),
    ...items('water', 10),
    ...items('bridge', 6),
    ...items('tree', 2, { species: 'chene', stage: 2 }),
    ...items('tree', 2, { species: 'pommier', stage: 1 }),
    ...items('tree', 2, { species: 'pin', stage: 2 }),
    ...items('tree', 1, { species: 'paulownia', stage: 1 }),
    ...items('house', 2),
    ...items('mountain', 1),
  ];
  return { tiles, structures: [], inventory, xp: 350 };
}

function loadState(): GardenState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as GardenState;
    if (!parsed?.tiles || Object.keys(parsed.tiles).length === 0) return defaultState();
    return { tiles: parsed.tiles, structures: parsed.structures ?? [], inventory: parsed.inventory ?? [], xp: parsed.xp ?? 0 };
  } catch {
    return defaultState();
  }
}

// ===========================================================================

type Props = { locale: string; firstName: string };

export default function GardenClient({ locale, firstName }: Props) {
  const fr = locale === 'fr';
  const t = (f: string, e: string) => (fr ? f : e);

  const [state, setState] = useState<GardenState>(defaultState);
  const [editMode, setEditMode] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [menuFor, setMenuFor] = useState<CellKey | null>(null);
  const [movingTree, setMovingTree] = useState<CellKey | null>(null);
  const [movingStruct, setMovingStruct] = useState<string | null>(null);
  const [armedSig, setArmedSig] = useState<string | null>(null); // a surface kind, 'tree:..' or structure kind
  const [armedCos, setArmedCos] = useState<Cosmetic | 'erase' | null>(null);
  const [invOpen, setInvOpen] = useState(true);
  const [invTab, setInvTab] = useState<'blocks' | 'deco'>('blocks');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<CellKey | null>(null);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(2, Math.max(0.5, +(z * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(3))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const keys = useMemo(() => Object.keys(state.tiles), [state.tiles]);
  const c = useMemo(() => centroid(keys), [keys]);
  const CAM_X = size.w / 2;
  const CAM_Y = size.h * 0.52;
  const originX = CAM_X - c.x + pan.x;
  const originY = CAM_Y - c.y + pan.y;
  const toScreen = useCallback((ix: number, iy: number) => ({ x: CAM_X + (ix - CAM_X) * zoom, y: CAM_Y + (iy - CAM_Y) * zoom }), [CAM_X, CAM_Y, zoom]);

  const recenter = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);
  const cancelEdit = useCallback(() => {
    setMenuFor(null);
    setMovingTree(null);
    setMovingStruct(null);
  }, []);
  const toggleEdit = useCallback(() => {
    setEditMode((v) => {
      const next = !v;
      if (next) setInvOpen(true);
      else {
        setMenuFor(null);
        setMovingTree(null);
        setMovingStruct(null);
        setArmedSig(null);
        setArmedCos(null);
      }
      return next;
    });
  }, []);

  // inventory groups
  const invGroups = useMemo(() => {
    const map = new Map<string, { sig: string; kind: AnyKind; plant: Plant | null; count: number }>();
    for (const it of state.inventory) {
      const sig = itemSig(it);
      const g = map.get(sig);
      if (g) g.count += 1;
      else map.set(sig, { sig, kind: it.kind, plant: it.plant ?? null, count: 1 });
    }
    return map;
  }, [state.inventory]);
  const surfaceGroups = useMemo(
    () => SURFACE_ORDER.filter((k) => k !== 'grass').map((k) => invGroups.get(k)).filter(Boolean) as { sig: string; kind: AnyKind; plant: Plant | null; count: number }[],
    [invGroups]
  );
  const objectGroups = useMemo(
    () => [...invGroups.values()].filter((g) => g.kind === 'tree' || isStructureKind(g.kind)).sort((a, b) => (a.kind === 'tree' ? -1 : 1)),
    [invGroups]
  );

  const armed = armedSig === 'grass' ? { sig: 'grass', kind: 'grass' as AnyKind, plant: null, count: Infinity } : armedSig ? invGroups.get(armedSig) ?? null : null;
  const armedIsStruct = !!armed && isStructureKind(armed.kind);
  const armedIsSurface = !!armed && !armedIsStruct && armed.kind !== 'tree';
  const armedIsTree = !!armed && armed.kind === 'tree';

  useEffect(() => {
    if (armedSig && armedSig !== 'grass' && !invGroups.has(armedSig)) setArmedSig(null);
  }, [armedSig, invGroups]);

  // ---- helpers ----
  const takeFromInv = (inv: InventoryItem[], sig: string) => {
    const idx = inv.findIndex((it) => itemSig(it) === sig);
    if (idx < 0) return null;
    const next = inv.slice();
    const [item] = next.splice(idx, 1);
    return { item, inv: next };
  };

  // structure anchors valid on the fixed island (all land, no plant/structure)
  const islandBox = useMemo(() => {
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const k of keys) {
      const { col, row } = parseKey(k);
      minC = Math.min(minC, col); maxC = Math.max(maxC, col); minR = Math.min(minR, row); maxR = Math.max(maxR, row);
    }
    return { minC, maxC, minR, maxR };
  }, [keys]);

  const structAnchors = useCallback(
    (kind: StructureKind, excludeId?: string) => {
      const { w, h } = STRUCT_SIZE[kind];
      const out: { col: number; row: number }[] = [];
      for (let row = islandBox.minR; row <= islandBox.maxR - h + 1; row++) {
        for (let col = islandBox.minC; col <= islandBox.maxC - w + 1; col++) {
          const cells = footprint(kind, col, row);
          const ok = cells.every((k) => {
            const tl = state.tiles[k];
            return tl && isLandKind(tl.kind) && !tl.plant && (!tl.structureId || tl.structureId === excludeId);
          });
          if (ok) out.push({ col, row });
        }
      }
      return out;
    },
    [islandBox, state.tiles]
  );

  // ---- mutations ----
  const paint = useCallback((cell: CellKey, kind: TileKind) => {
    setState((s) => {
      const tile = s.tiles[cell];
      if (!tile || tile.structureId || tile.kind === kind) return s;
      let inv = s.inventory;
      if (kind !== 'grass') {
        const taken = takeFromInv(inv, kind);
        if (!taken) return s;
        inv = taken.inv;
      }
      if (tile.kind !== 'grass') inv = [...inv, { id: uid(), kind: tile.kind }]; // return previous surface
      const next: Tile = { ...tile, kind };
      if (!isLandKind(kind)) {
        next.plant = null;
        next.cosmetic = null;
      }
      return { ...s, tiles: { ...s.tiles, [cell]: next }, inventory: inv };
    });
  }, []);

  const placeTree = useCallback(
    (cell: CellKey) => {
      setState((s) => {
        const tile = s.tiles[cell];
        if (!tile || !isLandKind(tile.kind) || tile.structureId || tile.plant || !armedSig) return s;
        const taken = takeFromInv(s.inventory, armedSig);
        if (!taken || taken.item.kind !== 'tree') return s;
        return { ...s, tiles: { ...s.tiles, [cell]: { ...tile, plant: taken.item.plant } }, inventory: taken.inv };
      });
    },
    [armedSig]
  );

  const storeTree = useCallback((cell: CellKey) => {
    setState((s) => {
      const tile = s.tiles[cell];
      if (!tile?.plant) return s;
      return { ...s, tiles: { ...s.tiles, [cell]: { ...tile, plant: null } }, inventory: [...s.inventory, { id: uid(), kind: 'tree', plant: tile.plant }] };
    });
  }, []);

  const moveTree = useCallback((from: CellKey, to: CellKey) => {
    setState((s) => {
      const a = s.tiles[from];
      const b = s.tiles[to];
      if (!a?.plant || !b || !isLandKind(b.kind) || b.plant || b.structureId) return s;
      return { ...s, tiles: { ...s.tiles, [from]: { ...a, plant: null }, [to]: { ...b, plant: a.plant } } };
    });
  }, []);

  const deployStruct = useCallback(
    (col: number, row: number) => {
      setState((s) => {
        if (!armed || !isStructureKind(armed.kind)) return s;
        const cells = footprint(armed.kind, col, row);
        if (!cells.every((k) => s.tiles[k] && isLandKind(s.tiles[k].kind) && !s.tiles[k].plant && !s.tiles[k].structureId)) return s;
        const taken = takeFromInv(s.inventory, armedSig!);
        if (!taken) return s;
        const id = uid();
        const tiles = { ...s.tiles };
        for (const k of cells) tiles[k] = { ...tiles[k], structureId: id };
        return { ...s, tiles, inventory: taken.inv, structures: [...s.structures, { id, kind: armed.kind, col, row }] };
      });
    },
    [armed, armedSig]
  );

  const storeStruct = useCallback((id: string) => {
    setState((s) => {
      const st = s.structures.find((x) => x.id === id);
      if (!st) return s;
      const tiles = { ...s.tiles };
      for (const k of footprint(st.kind, st.col, st.row)) if (tiles[k]) tiles[k] = { ...tiles[k], structureId: undefined };
      return { ...s, tiles, structures: s.structures.filter((x) => x.id !== id), inventory: [...s.inventory, { id: uid(), kind: st.kind }] };
    });
  }, []);

  const moveStructTo = useCallback((id: string, col: number, row: number) => {
    setState((s) => {
      const st = s.structures.find((x) => x.id === id);
      if (!st) return s;
      const newCells = footprint(st.kind, col, row);
      if (!newCells.every((k) => s.tiles[k] && isLandKind(s.tiles[k].kind) && !s.tiles[k].plant && (!s.tiles[k].structureId || s.tiles[k].structureId === id))) return s;
      const tiles = { ...s.tiles };
      for (const k of footprint(st.kind, st.col, st.row)) if (tiles[k]) tiles[k] = { ...tiles[k], structureId: undefined };
      for (const k of newCells) tiles[k] = { ...tiles[k], structureId: id };
      return { ...s, tiles, structures: s.structures.map((x) => (x.id === id ? { ...x, col, row } : x)) };
    });
  }, []);

  const setCosmetic = useCallback((cell: CellKey, cos: Cosmetic | 'erase') => {
    setState((s) => {
      const tile = s.tiles[cell];
      if (!tile || tile.structureId || !isLandKind(tile.kind)) return s;
      const value: Cosmetic | null = cos === 'erase' ? null : tile.cosmetic === cos ? null : cos;
      return { ...s, tiles: { ...s.tiles, [cell]: { ...tile, cosmetic: value } } };
    });
  }, []);

  // ---- pan ----
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
    setPan({ x: drag.current.px + dx, y: drag.current.py + dy });
  }
  function onPointerUp() {
    drag.current = null;
  }

  // ---- cell click dispatch ----
  const onCellClick = useCallback(
    (cell: CellKey) => {
      if (!editMode) return;
      const tile = state.tiles[cell];
      if (!tile) return;
      if (movingTree) {
        if (cell === movingTree) setMovingTree(null);
        else { moveTree(movingTree, cell); setMovingTree(null); }
        return;
      }
      if (movingStruct) { setMovingStruct(null); return; }
      if (armedCos) { setCosmetic(cell, armedCos); return; }
      if (armedIsTree) { placeTree(cell); return; }
      if (armedIsSurface && armed) { paint(cell, armed.kind as TileKind); return; }
      if (armedIsStruct) return; // placed via anchors
      // nothing armed → context menu for objects
      if (tile.plant || tile.structureId) setMenuFor((m) => (m === cell ? null : cell));
    },
    [editMode, state.tiles, movingTree, movingStruct, armedCos, armedIsTree, armedIsSurface, armedIsStruct, armed, moveTree, setCosmetic, placeTree, paint]
  );

  // structure anchors to render
  const structGhosts = useMemo(() => {
    if (!editMode) return [] as { col: number; row: number; kind: StructureKind }[];
    if (movingStruct) {
      const st = state.structures.find((x) => x.id === movingStruct);
      if (!st) return [];
      return structAnchors(st.kind, st.id).map((a) => ({ ...a, kind: st.kind }));
    }
    if (armed && isStructureKind(armed.kind)) return structAnchors(armed.kind).map((a) => ({ ...a, kind: armed.kind as StructureKind }));
    return [];
  }, [editMode, movingStruct, armed, state.structures, structAnchors]);

  const onStructGhostClick = useCallback(
    (col: number, row: number) => {
      if (movingStruct) { moveStructTo(movingStruct, col, row); setMovingStruct(null); }
      else if (armedIsStruct) deployStruct(col, row);
    },
    [movingStruct, armedIsStruct, moveStructTo, deployStruct]
  );

  // menu meta
  const menuTile = menuFor ? state.tiles[menuFor] : null;
  const menuStruct = menuTile?.structureId ? state.structures.find((s) => s.id === menuTile.structureId) ?? null : null;
  const menuKind: 'tree' | 'struct' | null = menuStruct ? 'struct' : menuTile?.plant ? 'tree' : null;
  const menuPos = useMemo(() => {
    if (!menuFor) return null;
    const { col, row } = parseKey(menuFor);
    const { x, y } = isoPos(col, row, originX, originY);
    return toScreen(x, y - TILE_H / 2 - 16);
  }, [menuFor, originX, originY, toScreen]);

  const moving = movingTree || movingStruct;
  const isLandAt = (k: CellKey) => isLand(state.tiles[k]);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden select-none">
      <SceneStyles />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #cfe6e8 0%, #bcdbdf 55%, #a9ced6 100%)' }} />

      <div
        ref={wrapRef}
        className="absolute inset-0 touch-none"
        style={{ cursor: drag.current?.moved ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="grassTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PAL.grassTopLight} />
              <stop offset="1" stopColor={PAL.grassTopDark} />
            </linearGradient>
            <linearGradient id="earthTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PAL.earthTopLight} />
              <stop offset="1" stopColor={PAL.earthTopDark} />
            </linearGradient>
            <linearGradient id="soilRight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PAL.soilRightTop} />
              <stop offset="1" stopColor={PAL.soilRightBot} />
            </linearGradient>
            <linearGradient id="soilLeft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PAL.soilLeftTop} />
              <stop offset="1" stopColor={PAL.soilLeftBot} />
            </linearGradient>
          </defs>

          {/* sea */}
          <rect x={0} y={0} width={size.w} height={size.h} fill="url(#grassTop)" opacity={0} />
          <SeaShimmer w={size.w} h={size.h} />

          <g style={{ transform: `scale(${zoom})`, transformOrigin: `${CAM_X}px ${CAM_Y}px` }}>
            <rect x={-8000} y={-8000} width={16000} height={16000} fill="transparent" onClick={cancelEdit} />

            {/* depth-sorted cells + structures */}
            {[
              ...depthSort(keys).map(({ col, row, k }) => ({
                depth: col + row,
                sub: 0,
                node: <TileVisual key={k} cell={k} col={col} row={row} originX={originX} originY={originY} tiles={state.tiles} editMode={editMode} isMovingTree={movingTree === k} dimmed={!!moving && movingTree !== k && !state.tiles[k].structureId} />,
              })),
              ...state.structures.map((s) => {
                const { w, h } = STRUCT_SIZE[s.kind];
                return { depth: s.col + w - 1 + (s.row + h - 1), sub: 1, node: <StructureArt key={`st-${s.id}`} s={s} originX={originX} originY={originY} dimmed={!!moving && movingStruct !== s.id} /> };
              }),
            ]
              .sort((a, b) => a.depth - b.depth || a.sub - b.sub)
              .map((r) => r.node)}

            {/* click + hover layer (edit only) */}
            {editMode &&
              keys.map((k) => {
                const { col, row } = parseKey(k);
                const { x, y } = isoPos(col, row, originX, originY);
                const hw = TILE_W / 2;
                const hh = TILE_H / 2;
                const showHi = hovered === k && (armedIsSurface || armedIsTree || armedCos || movingTree);
                return (
                  <g key={`hit-${k}`}>
                    <polygon
                      points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHovered(k)}
                      onMouseLeave={() => setHovered((h) => (h === k ? null : h))}
                      onClick={(e) => { e.stopPropagation(); onCellClick(k); }}
                    />
                    {showHi && <polygon points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`} fill="#ffffff22" stroke="#ffffff" strokeWidth={1.5} strokeLinejoin="round" style={{ pointerEvents: 'none' }} />}
                  </g>
                );
              })}

            {/* structure ghosts */}
            {structGhosts.map((g, i) => (
              <StructGhost key={`sg-${i}`} col={g.col} row={g.row} kind={g.kind} originX={originX} originY={originY} mode={movingStruct ? 'move' : 'deploy'} onClick={() => onStructGhostClick(g.col, g.row)} />
            ))}
          </g>
        </svg>
      </div>

      {/* context menu */}
      {editMode && menuFor && menuPos && menuKind && !moving && (
        <div className="absolute z-30 -translate-x-1/2 -translate-y-full" style={{ left: menuPos.x, top: menuPos.y }}>
          <div className="flex items-center gap-1 rounded-xl bg-white shadow-lg border border-black/5 p-1">
            <button
              onClick={() => { if (menuKind === 'struct' && menuStruct) setMovingStruct(menuStruct.id); else setMovingTree(menuFor); setMenuFor(null); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#3a4a2a] hover:bg-[#eef3e2]"
            >
              <Move className="w-3.5 h-3.5" /> {t('Déplacer', 'Move')}
            </button>
            <button
              onClick={() => { if (menuKind === 'struct' && menuStruct) storeStruct(menuStruct.id); else storeTree(menuFor); setMenuFor(null); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#3a4a2a] hover:bg-[#eef3e2]"
            >
              <Package className="w-3.5 h-3.5" /> {t('Ranger', 'Store')}
            </button>
          </div>
          <div className="w-2.5 h-2.5 bg-white border-r border-b border-black/5 rotate-45 mx-auto -mt-1.5" />
        </div>
      )}

      {/* title */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 pointer-events-none text-center">
        <h1 className="text-[15px] font-medium text-[#2f4632] tracking-tight drop-shadow-sm">{t(`Le jardin de ${firstName}`, `${firstName}'s garden`)}</h1>
      </div>

      <div className="absolute top-5 left-5 flex items-center gap-2 rounded-full bg-white/85 backdrop-blur px-3.5 py-2 shadow-sm border border-black/5">
        <Sprout className="w-4 h-4 text-[#5f8a3f]" />
        <span className="text-sm font-semibold text-[#3a4a2a] tabular-nums">{state.xp}</span>
        <span className="text-xs text-[#5d6b4a]/70">XP</span>
      </div>

      <div className="absolute top-5 right-5 flex flex-col items-end gap-2">
        <button
          onClick={toggleEdit}
          className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-sm border transition-colors ${editMode ? 'bg-[#5f8a3f] text-white border-[#5f8a3f]' : 'bg-white/85 backdrop-blur text-[#3a4a2a] border-black/5 hover:bg-white'}`}
        >
          {editMode ? <Check className="w-4 h-4" /> : <Hammer className="w-4 h-4" />}
          {editMode ? t('Terminer', 'Done') : t('Modifier', 'Edit')}
        </button>
        <button onClick={recenter} className="p-2.5 rounded-xl bg-white/85 backdrop-blur border border-black/5 shadow-sm hover:bg-white text-[#3a4a2a]" aria-label={t('Recentrer', 'Recenter')}>
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {editMode && (
        <Panel
          open={invOpen}
          onToggle={() => setInvOpen((v) => !v)}
          tab={invTab}
          setTab={setInvTab}
          surfaceGroups={surfaceGroups}
          objectGroups={objectGroups}
          armedSig={armedSig}
          armedCos={armedCos}
          onArmItem={(sig) => { cancelEdit(); setArmedCos(null); setArmedSig((s) => (s === sig ? null : sig)); }}
          onArmCos={(cos) => { cancelEdit(); setArmedSig(null); setArmedCos((s) => (s === cos ? null : cos)); }}
          t={t}
        />
      )}

      {editMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-[#2f4632]/90 text-white text-xs px-4 py-2.5 shadow-lg">
          {moving ? (
            <><ArrowLeftRight className="w-4 h-4" /> {movingStruct ? t('Choisis un emplacement pour la structure', 'Pick a spot for the structure') : t('Clique une case de terre pour reposer l’arbre', 'Click a land cell to drop the tree')}</>
          ) : armedCos ? (
            <><Sparkles className="w-4 h-4" /> {t('Clique une tuile pour la déco (coin bas-droite)', 'Click a tile for the decoration')}</>
          ) : armedIsStruct ? (
            <><Sprout className="w-4 h-4" /> {t('Choisis un emplacement pour la structure', 'Pick a spot for the structure')}</>
          ) : armedIsTree ? (
            <><Sprout className="w-4 h-4" /> {t('Clique une case de terre pour planter l’arbre', 'Click a land cell to plant the tree')}</>
          ) : armed?.kind === 'water' ? (
            <><Droplets className="w-4 h-4" /> {t('Clique une case pour creuser de l’eau', 'Click a cell to carve water')}</>
          ) : armedIsSurface ? (
            <><Sprout className="w-4 h-4" /> {t('Clique les cases à peindre', 'Click cells to paint')}</>
          ) : (
            <><Package className="w-4 h-4" /> {t('Choisis une surface ou un objet · clique un arbre/structure pour le déplacer', 'Pick a surface or object · click a tree/structure to move it')}</>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Sea shimmer — a few faint drifting highlight streaks.

function SeaShimmer({ w, h }: { w: number; h: number }) {
  const lines = useMemo(() => {
    let s = 7;
    const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
    return Array.from({ length: 9 }, () => ({ x: rng() * w, y: rng() * h, len: 40 + rng() * 80, d: 18 + rng() * 22, delay: rng() * 8 }));
  }, [w, h]);
  return (
    <g style={{ pointerEvents: 'none' }} opacity={0.5}>
      {lines.map((l, i) => (
        <line key={i} x1={l.x} y1={l.y} x2={l.x + l.len} y2={l.y} stroke={PAL.shimmer} strokeWidth={2} strokeLinecap="round" opacity={0.5}>
          <animate attributeName="opacity" values="0;0.5;0" dur={`${l.d}s`} begin={`${l.delay}s`} repeatCount="indefinite" />
          <animate attributeName="x1" values={`${l.x};${l.x + 30}`} dur={`${l.d}s`} begin={`${l.delay}s`} repeatCount="indefinite" />
          <animate attributeName="x2" values={`${l.x + l.len};${l.x + l.len + 30}`} dur={`${l.d}s`} begin={`${l.delay}s`} repeatCount="indefinite" />
        </line>
      ))}
    </g>
  );
}

// ===========================================================================
// One cell visual (land block / lake water / bridge deck). Pointer-transparent.

function TileVisual({ cell, col, row, originX, originY, tiles, editMode, isMovingTree, dimmed }: { cell: CellKey; col: number; row: number; originX: number; originY: number; tiles: Record<CellKey, Tile>; editMode: boolean; isMovingTree: boolean; dimmed: boolean }) {
  const tile = tiles[cell];
  const { x: cx, y: cy } = isoPos(col, row, originX, originY);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  const T = { x: cx, y: cy - hh };
  const R = { x: cx + hw, y: cy };
  const B = { x: cx, y: cy + hh };
  const L = { x: cx - hw, y: cy };
  const covered = !!tile.structureId;

  const nLand = (dc: number, dr: number) => isLand(tiles[key(col + dc, row + dr)]);

  const blades = useMemo(() => {
    const rng = cellRng(col, row);
    const n = 3 + Math.floor(rng() * 3);
    return Array.from({ length: n }, () => ({ px: (rng() - 0.5) * TILE_W * 0.5, py: (rng() - 0.5) * TILE_H * 0.5, h: 3 + rng() * 3, flip: rng() > 0.5, flower: rng() > 0.85 }));
  }, [col, row]);

  // ---- open water (lake) ----
  if (tile.kind === 'water') {
    const inset = 5;
    return (
      <g style={{ pointerEvents: 'none' }}>
        <polygon points={`${T.x},${T.y + inset} ${R.x},${R.y + inset} ${B.x},${B.y + inset} ${L.x},${L.y + inset}`} fill={PAL.lakeDeep} />
        <polygon points={`${T.x},${T.y + inset + 2} ${R.x},${R.y + inset + 2} ${B.x},${B.y + inset + 2} ${L.x},${L.y + inset + 2}`} fill={PAL.lakeTop} opacity={0.85} />
        <ellipse cx={cx - 8} cy={cy + inset} rx={10} ry={3} fill={PAL.shimmer} opacity={0.5}>
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="5s" repeatCount="indefinite" />
        </ellipse>
      </g>
    );
  }

  // ---- bridge deck ----
  if (tile.kind === 'bridge') {
    const mask = connMask(col, row, (k) => !!tiles[k] && tiles[k].kind !== 'water');
    const axisCol = mask[0] || mask[2];
    return (
      <g style={{ pointerEvents: 'none', opacity: dimmed ? 0.55 : 1 }}>
        <line x1={L.x + 6} y1={L.y} x2={L.x + 6} y2={L.y + DEPTH * 0.8} stroke={PAL.plankEdge} strokeWidth="2" />
        <line x1={R.x - 6} y1={R.y} x2={R.x - 6} y2={R.y + DEPTH * 0.8} stroke={PAL.plankEdge} strokeWidth="2" />
        <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill={PAL.plankLight} />
        <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill="none" stroke={PAL.plankEdge} strokeWidth="1.2" />
        {[0.2, 0.4, 0.6, 0.8].map((tt, i) =>
          axisCol ? (
            <line key={i} x1={L.x + (T.x - L.x) * tt} y1={L.y + (T.y - L.y) * tt} x2={B.x + (R.x - B.x) * tt} y2={B.y + (R.y - B.y) * tt} stroke={PAL.plankDark} strokeWidth="1" />
          ) : (
            <line key={i} x1={L.x + (B.x - L.x) * tt} y1={L.y + (B.y - L.y) * tt} x2={T.x + (R.x - T.x) * tt} y2={T.y + (R.y - T.y) * tt} stroke={PAL.plankDark} strokeWidth="1" />
          )
        )}
      </g>
    );
  }

  // ---- land block ----
  const showRight = !nLand(1, 0);
  const showLeft = !nLand(0, 1);
  const lift = isMovingTree ? -5 : 0;
  const topFill = tile.kind === 'earth' ? 'url(#earthTop)' : 'url(#grassTop)';

  return (
    <g transform={`translate(0 ${lift})`} style={{ pointerEvents: 'none', opacity: dimmed ? 0.55 : 1 }}>
      {showRight && (
        <g>
          <polygon points={`${R.x},${R.y} ${B.x},${B.y} ${B.x},${B.y + LIP_H} ${R.x},${R.y + LIP_H}`} fill={tile.kind === 'earth' ? PAL.earthTopDark : PAL.turfRight} />
          <polygon points={`${R.x},${R.y + LIP_H} ${B.x},${B.y + LIP_H} ${B.x},${B.y + DEPTH} ${R.x},${R.y + DEPTH}`} fill="url(#soilRight)" />
        </g>
      )}
      {showLeft && (
        <g>
          <polygon points={`${B.x},${B.y} ${L.x},${L.y} ${L.x},${L.y + LIP_H} ${B.x},${B.y + LIP_H}`} fill={tile.kind === 'earth' ? PAL.earthTopDark : PAL.turfLeft} />
          <polygon points={`${B.x},${B.y + LIP_H} ${L.x},${L.y + LIP_H} ${L.x},${L.y + DEPTH} ${B.x},${B.y + DEPTH}`} fill="url(#soilLeft)" />
        </g>
      )}

      <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill={topFill} />

      {/* edges: outer rim only in view; faint grid while editing */}
      {([
        { a: T, b: L, dc: -1, dr: 0, light: true },
        { a: T, b: R, dc: 0, dr: -1, light: true },
        { a: B, b: L, dc: 0, dr: 1, light: false },
        { a: B, b: R, dc: 1, dr: 0, light: false },
      ] as const).map((e, i) => {
        const nb = tiles[key(col + e.dc, row + e.dr)];
        let stroke: string | null = null;
        let w = 1.2;
        let op = 0.5;
        if (!isLand(nb)) {
          stroke = e.light ? PAL.grassBevel : PAL.grassEdgeShade;
          w = e.light ? 1.4 : 1.2;
          op = e.light ? 0.85 : 0.5;
        } else if (nb!.structureId && nb!.structureId === tile.structureId) {
          stroke = null;
        } else if (editMode) {
          stroke = PAL.grassEdgeShade;
          w = 1;
          op = 0.18;
        }
        if (!stroke) return null;
        return <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={stroke} strokeWidth={w} strokeLinecap="round" opacity={op} />;
      })}

      {!covered && tile.kind === 'path' && <PathTop cx={cx} cy={cy} col={col} row={row} tiles={tiles} T={T} R={R} B={B} L={L} />}
      {!covered && tile.kind === 'tallgrass' && <TallGrassTop cx={cx} cy={cy} col={col} row={row} />}
      {!covered && tile.kind === 'earth' && <EarthSpecks cx={cx} cy={cy} col={col} row={row} />}
      {!covered && tile.kind === 'grass' &&
        blades.map((b, i) =>
          b.flower ? (
            <circle key={i} cx={cx + b.px} cy={cy + b.py} r={1.7} fill={i % 2 ? '#f4d9e3' : '#fbf0c4'} />
          ) : (
            <path key={i} d={`M ${cx + b.px} ${cy + b.py} q ${b.flip ? 1.6 : -1.6} ${-b.h * 0.6} ${b.flip ? 1 : -1} ${-b.h}`} stroke={i % 2 ? PAL.blade : PAL.bladeDeep} strokeWidth={1} strokeLinecap="round" fill="none" />
          )
        )}

      {isMovingTree && <polygon points={`${T.x},${T.y} ${R.x},${R.y} ${B.x},${B.y} ${L.x},${L.y}`} fill="none" stroke="#5f8a3f" strokeWidth={2.5} strokeLinejoin="round" />}
      {!covered && tile.plant && <PlantArt cx={cx} cy={cy} plant={tile.plant} />}
      {!covered && tile.cosmetic && <CosmeticOnTile cx={cx} cy={cy} cos={tile.cosmetic} />}
    </g>
  );
}

function PathTop({ cx, cy, col, row, tiles, T, R, B, L }: { cx: number; cy: number; col: number; row: number; tiles: Record<CellKey, Tile>; T: { x: number; y: number }; R: { x: number; y: number }; B: { x: number; y: number }; L: { x: number; y: number } }) {
  const mask = connMask(col, row, (k) => tiles[k]?.kind === 'path');
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const edges = [mid(R, B), mid(B, L), mid(L, T), mid(T, R)];
  const connected = edges.filter((_, i) => mask[i]);
  if (connected.length === 0) {
    return (
      <g style={{ pointerEvents: 'none' }}>
        <ellipse cx={cx} cy={cy} rx={13} ry={7} fill={PAL.pathLight} />
        <ellipse cx={cx} cy={cy} rx={9} ry={4.6} fill={PAL.pathDark} />
      </g>
    );
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      {connected.map((e, i) => <line key={`u${i}`} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke={PAL.pathLight} strokeWidth={17} strokeLinecap="round" />)}
      <circle cx={cx} cy={cy} r={9} fill={PAL.pathLight} />
      {connected.map((e, i) => <line key={`o${i}`} x1={cx} y1={cy} x2={e.x} y2={e.y} stroke={PAL.pathDark} strokeWidth={11} strokeLinecap="round" />)}
      <circle cx={cx} cy={cy} r={6} fill={PAL.pathDark} />
    </g>
  );
}

function TallGrassTop({ cx, cy, col, row }: { cx: number; cy: number; col: number; row: number }) {
  const tufts = useMemo(() => {
    const rng = cellRng(col * 3 + 1, row * 5 + 2);
    const n = 6 + Math.floor(rng() * 3);
    return Array.from({ length: n }, () => ({ px: (rng() - 0.5) * TILE_W * 0.52, py: (rng() - 0.5) * TILE_H * 0.5, h: 8 + rng() * 6, flip: rng() > 0.5 }));
  }, [col, row]);
  return (
    <g style={{ pointerEvents: 'none' }}>
      {tufts.map((b, i) => <path key={i} d={`M ${cx + b.px} ${cy + b.py} q ${b.flip ? 3 : -3} ${-b.h * 0.6} ${b.flip ? 1.5 : -1.5} ${-b.h}`} stroke={i % 2 ? PAL.tallGrass : PAL.tallGrassDeep} strokeWidth={1.6} strokeLinecap="round" fill="none" />)}
    </g>
  );
}

function EarthSpecks({ cx, cy, col, row }: { cx: number; cy: number; col: number; row: number }) {
  const sp = useMemo(() => {
    const rng = cellRng(col * 5 + 9, row * 7 + 3);
    return Array.from({ length: 4 }, () => ({ px: (rng() - 0.5) * TILE_W * 0.5, py: (rng() - 0.5) * TILE_H * 0.5, r: 0.8 + rng() * 1.2 }));
  }, [col, row]);
  return (
    <g style={{ pointerEvents: 'none' }} opacity={0.5}>
      {sp.map((s, i) => <circle key={i} cx={cx + s.px} cy={cy + s.py} r={s.r} fill={PAL.root} />)}
    </g>
  );
}

function PlantArt({ cx, cy, plant }: { cx: number; cy: number; plant: Plant }) {
  const w = plant.stage === 1 ? 92 : plant.stage === 2 ? 116 : 140;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <image href={`/assets/trees/${plant.species}-${plant.stage}.png`} x={cx - w / 2} y={cy - w * 0.8} width={w} height={w} preserveAspectRatio="xMidYMax meet" />
    </g>
  );
}

function CosmeticOnTile({ cx, cy, cos }: { cx: number; cy: number; cos: Cosmetic }) {
  return (
    <g transform={`translate(${cx + TILE_W * 0.28} ${cy + TILE_H * 0.2}) scale(0.8)`} style={{ pointerEvents: 'none' }}>
      <CosmeticGlyph cos={cos} />
    </g>
  );
}

// ===========================================================================
// Structures

function StructureArt({ s, originX, originY, dimmed }: { s: Structure; originX: number; originY: number; dimmed: boolean }) {
  if (s.kind === 'house') {
    const { x, y } = isoPos(s.col + 0.5, s.row + 0.5, originX, originY);
    return (
      <g transform={`translate(${x} ${y})`} style={{ opacity: dimmed ? 0.55 : 1, pointerEvents: 'none' }}>
        <polygon points="0,-4 36,-22 36,-52 0,-34" fill={PAL.wallLight} />
        <polygon points="0,-4 -36,-22 -36,-52 0,-34" fill={PAL.wallDark} />
        <polygon points="0,-34 36,-52 8,-74 -26,-56" fill={PAL.roofLight} />
        <polygon points="0,-34 -36,-52 -8,-74 26,-56" fill={PAL.roofDark} />
        <line x1="-8" y1="-74" x2="8" y2="-74" stroke="#6b3526" strokeWidth="1.4" />
        <rect x="-5" y="-26" width="10" height="16" rx="1" fill={PAL.woodFrame} />
        <rect x="-26" y="-34" width="9" height="8" rx="1" fill="#f6d27a" />
        <rect x="17" y="-34" width="9" height="8" rx="1" fill="#f6d27a" />
        <rect x="14" y="-66" width="6" height="12" fill="#8a5a44" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx="17" cy="-70" r="3" fill="#fff" opacity="0.5">
            <animate attributeName="cy" values="-70;-92;-104" dur="6s" begin={`${i * 1.8}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.25;0" dur="6s" begin={`${i * 1.8}s`} repeatCount="indefinite" />
            <animate attributeName="r" values="3;5;6.5" dur="6s" begin={`${i * 1.8}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }
  const { x, y } = isoPos(s.col + 1, s.row + 1, originX, originY);
  return (
    <g transform={`translate(${x} ${y})`} style={{ opacity: dimmed ? 0.55 : 1, pointerEvents: 'none' }}>
      <polygon points="-72,6 -30,-60 6,-104 40,-58 72,6" fill={PAL.rockMid} />
      <polygon points="6,-104 40,-58 72,6 18,6" fill={PAL.rockDark} />
      <polygon points="-72,6 -30,-60 6,-104 -6,6" fill={PAL.rockLight} />
      <polygon points="-72,6 -44,-34 -16,6" fill={PAL.rockMid} />
      <polygon points="-44,-34 -16,6 -30,6" fill={PAL.rockDark} />
      <polygon points="6,-104 22,-72 6,-66 -10,-78 -2,-88" fill={PAL.snow} />
      <polygon points="-44,-34 -34,-16 -52,-18" fill={PAL.snow} />
    </g>
  );
}

function StructGhost({ col, row, kind, originX, originY, mode, onClick }: { col: number; row: number; kind: StructureKind; originX: number; originY: number; mode: 'deploy' | 'move'; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const accent = mode === 'move' ? '#3f7fb0' : '#5f8a3f';
  const cells = footprint(kind, col, row);
  const { w, h } = STRUCT_SIZE[kind];
  const center = isoPos(col + (w - 1) / 2, row + (h - 1) / 2, originX, originY);
  return (
    <g onClick={(e) => { e.stopPropagation(); onClick(); }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ cursor: 'pointer' }} className="ghost-cell">
      {cells.map((k) => {
        const { col: cc, row: rr } = parseKey(k);
        const { x, y } = isoPos(cc, rr, originX, originY);
        const hw = TILE_W / 2;
        const hh = TILE_H / 2;
        return <polygon key={k} points={`${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`} fill={hover ? `${accent}44` : `${accent}1c`} stroke={accent} strokeWidth={1.3} strokeDasharray="5 4" strokeLinejoin="round" />;
      })}
      <g transform={`translate(${center.x} ${center.y})`}>
        <circle r={13} fill={hover ? accent : '#fff'} stroke={accent} strokeWidth={1.4} />
        <g transform="scale(0.55)">
          <BlockGlyph kind={kind} />
        </g>
      </g>
    </g>
  );
}

// ===========================================================================
// Panel (surfaces + objects + deco)

function Panel({
  open, onToggle, tab, setTab, surfaceGroups, objectGroups, armedSig, armedCos, onArmItem, onArmCos, t,
}: {
  open: boolean;
  onToggle: () => void;
  tab: 'blocks' | 'deco';
  setTab: (v: 'blocks' | 'deco') => void;
  surfaceGroups: { sig: string; kind: AnyKind; plant: Plant | null; count: number }[];
  objectGroups: { sig: string; kind: AnyKind; plant: Plant | null; count: number }[];
  armedSig: string | null;
  armedCos: Cosmetic | 'erase' | null;
  onArmItem: (sig: string) => void;
  onArmCos: (cos: Cosmetic | 'erase') => void;
  t: (f: string, e: string) => string;
}) {
  const Card = ({ g }: { g: { sig: string; kind: AnyKind; plant: Plant | null; count: number } }) => {
    const armed = armedSig === g.sig;
    return (
      <button
        onClick={() => onArmItem(g.sig)}
        title={g.plant ? SPECIES_LABEL[g.plant.species] : KIND_LABEL[g.kind]}
        className={`relative aspect-square rounded-xl border flex items-center justify-center transition-colors ${armed ? 'border-[#5f8a3f] bg-[#eef3e2] ring-2 ring-[#5f8a3f]/30' : 'border-black/5 bg-[#f7f9f1] hover:bg-[#eef3e2]'}`}
      >
        <ItemThumb kind={g.kind} plant={g.plant} />
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#3a4a2a] text-white text-[10px] font-semibold flex items-center justify-center">{g.count}</span>
      </button>
    );
  };
  return (
    <div className="absolute top-1/2 left-5 -translate-y-1/2 z-20 flex items-start gap-2">
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'w-64 opacity-100' : 'w-0 opacity-0'}`} style={{ pointerEvents: open ? 'auto' : 'none' }}>
        <div className="rounded-2xl bg-white/92 backdrop-blur border border-black/5 shadow-lg p-3 w-64">
          <div className="flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-[#f1f4ea]">
            <button onClick={() => setTab('blocks')} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium ${tab === 'blocks' ? 'bg-white shadow-sm text-[#3a4a2a]' : 'text-[#5d6b4a]'}`}>
              <Blocks className="w-3.5 h-3.5" /> {t('Blocs', 'Blocks')}
            </button>
            <button onClick={() => setTab('deco')} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium ${tab === 'deco' ? 'bg-white shadow-sm text-[#3a4a2a]' : 'text-[#5d6b4a]'}`}>
              <Sparkles className="w-3.5 h-3.5" /> {t('Déco', 'Deco')}
            </button>
          </div>

          {tab === 'blocks' ? (
            <div className="max-h-[56vh] overflow-y-auto overflow-x-hidden pr-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5d6b4a]/70 mb-1.5 px-0.5">{t('Surfaces', 'Surfaces')}</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onArmItem('grass')}
                  title={t('Herbe (réinitialiser)', 'Grass (reset)')}
                  className={`relative aspect-square rounded-xl border flex items-center justify-center ${armedSig === 'grass' ? 'border-[#5f8a3f] bg-[#eef3e2] ring-2 ring-[#5f8a3f]/30' : 'border-black/5 bg-[#f7f9f1] hover:bg-[#eef3e2]'}`}
                >
                  <ItemThumb kind="grass" plant={null} />
                  <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-[#5f8a3f] text-white flex items-center justify-center"><Eraser className="w-2.5 h-2.5" /></span>
                </button>
                {surfaceGroups.map((g) => <Card key={g.sig} g={g} />)}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5d6b4a]/70 mt-3 mb-1.5 px-0.5">{t('Objets', 'Objects')}</p>
              <div className="grid grid-cols-3 gap-2">
                {objectGroups.map((g) => <Card key={g.sig} g={g} />)}
                {objectGroups.length === 0 && <p className="col-span-3 text-xs text-[#9a948a] py-2 text-center">{t('Aucun objet', 'No objects')}</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-[#3a4a2a]">{t('Décorations', 'Decorations')}</span>
                <button onClick={() => onArmCos('erase')} className={`flex items-center gap-1 text-xs rounded-md px-1.5 py-0.5 ${armedCos === 'erase' ? 'bg-[#f0d6d6] text-[#b05555]' : 'text-[#5d6b4a] hover:bg-[#f1f4ea]'}`}>
                  <Eraser className="w-3 h-3" /> {t('Gomme', 'Erase')}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {COSMETICS.map((cos) => (
                  <button key={cos} onClick={() => onArmCos(cos)} title={COS_LABEL[cos]} className={`aspect-square rounded-xl border flex items-center justify-center ${armedCos === cos ? 'border-[#5f8a3f] bg-[#eef3e2] ring-2 ring-[#5f8a3f]/30' : 'border-black/5 bg-[#f7f9f1] hover:bg-[#eef3e2]'}`}>
                    <svg width="34" height="34" viewBox="-17 -22 34 30"><CosmeticGlyph cos={cos} /></svg>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <button onClick={onToggle} className="shrink-0 flex items-center gap-2 rounded-full bg-white/90 backdrop-blur border border-black/5 shadow-sm px-3 py-2.5 text-[#3a4a2a] hover:bg-white">
        {open ? <X className="w-4 h-4" /> : <Package className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ItemThumb({ kind, plant }: { kind: AnyKind; plant: Plant | null }) {
  if (kind === 'tree' && plant) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/assets/trees/${plant.species}-${plant.stage}.png`} alt="" className="w-[78%] h-[78%] object-contain" draggable={false} />;
  }
  return <svg width="46" height="40" viewBox="-23 -22 46 40"><BlockGlyph kind={kind as TileKind | StructureKind} /></svg>;
}

function BlockGlyph({ kind }: { kind: TileKind | StructureKind }) {
  const top = (fill: string) => <polygon points="0,-14 16,-6 0,2 -16,-6" fill={fill} />;
  const left = <polygon points="-16,-6 0,2 0,12 -16,4" fill="#7e5f38" />;
  const right = <polygon points="16,-6 0,2 0,12 16,4" fill="#a9824f" />;
  if (kind === 'grass') return <>{left}{right}{top('#a9c97a')}</>;
  if (kind === 'earth') return <>{left}{right}{top('#cdb079')}</>;
  if (kind === 'tallgrass')
    return <>{left}{right}{top('#9cc06a')}{[-5, 0, 5].map((x, i) => <path key={i} d={`M ${x} -6 q ${i % 2 ? 2 : -2} -6 ${i % 2 ? 1 : -1} -10`} stroke={PAL.tallGrassDeep} strokeWidth="1.4" fill="none" strokeLinecap="round" />)}</>;
  if (kind === 'path') return <>{left}{right}{top('#a9c97a')}<polygon points="0,-11 11,-6 0,-1 -11,-6" fill={PAL.pathLight} /><polygon points="0,-9 8,-6 0,-3 -8,-6" fill={PAL.pathDark} /></>;
  if (kind === 'water')
    return <><polygon points="0,-10 16,-2 0,6 -16,-2" fill={PAL.lakeDeep} /><polygon points="0,-8 12,-2 0,4 -12,-2" fill={PAL.lakeTop} /><ellipse cx="-3" cy="-2" rx="5" ry="1.6" fill={PAL.shimmer} /></>;
  if (kind === 'bridge')
    return <><polygon points="0,-10 14,-3 0,4 -14,-3" fill={PAL.plankLight} />{[-8, -3, 2, 7].map((x, i) => <line key={i} x1={x} y1={-6 + i} x2={x + 6} y2={-3 + i} stroke={PAL.plankEdge} strokeWidth="0.8" />)}</>;
  if (kind === 'house')
    return <>{left}{right}{top('#a9c97a')}<polygon points="-9,-10 0,-14 9,-10 9,-3 0,1 -9,-3" fill={PAL.wallLight} /><polygon points="0,1 9,-3 9,-10 0,-14" fill={PAL.wallDark} /><polygon points="-11,-9 0,-15 11,-9 0,-19" fill={PAL.roofLight} /><polygon points="0,-15 11,-9 0,-19" fill={PAL.roofDark} /></>;
  return <>{left}{right}{top('#a9c97a')}<polygon points="-13,0 0,-19 13,0" fill={PAL.rockMid} /><polygon points="0,-19 13,0 4,0" fill={PAL.rockDark} /><polygon points="-4,-7 0,-19 4,-7 0,-10" fill={PAL.snow} /></>;
}

function CosmeticGlyph({ cos }: { cos: Cosmetic }) {
  switch (cos) {
    case 'rock':
      return <><ellipse cx="0" cy="0" rx="9" ry="4.5" fill={PAL.rockMid} /><path d="M -9 0 Q -5 -8 1 -7 Q 8 -6 9 0 Z" fill={PAL.rockLight} /><path d="M 1 -7 Q 8 -6 9 0 L 2 0 Z" fill={PAL.rockDark} /></>;
    case 'flowers':
      return <>{[-6, 0, 6].map((x, i) => <g key={i}><line x1={x} y1="0" x2={x} y2="-9" stroke="#5f8a3f" strokeWidth="1.2" /><circle cx={x} cy="-11" r="2.6" fill={['#e8a0bd', '#f4d27a', '#c89ad8'][i]} /><circle cx={x} cy="-11" r="1" fill="#fff7df" /></g>)}</>;
    case 'mushroom':
      return <><rect x="-2" y="-7" width="4" height="8" rx="1.5" fill="#f0e6d2" /><path d="M -8 -6 Q 0 -16 8 -6 Z" fill="#c8503f" /><circle cx="-3" cy="-9" r="1.4" fill="#fff" /><circle cx="3" cy="-8" r="1.2" fill="#fff" /><circle cx="0" cy="-11" r="1.1" fill="#fff" /></>;
    case 'lantern':
      return <><line x1="0" y1="0" x2="0" y2="-14" stroke={PAL.woodFrame} strokeWidth="1.6" /><path d="M 0 -14 q 5 0 5 4" stroke={PAL.woodFrame} strokeWidth="1.4" fill="none" /><rect x="3" y="-11" width="7" height="9" rx="1.5" fill="#3a4a2a" /><rect x="4.2" y="-9.6" width="4.6" height="6.2" rx="1" fill="#f6d27a" /></>;
    case 'basket':
      return <><path d="M -7 -2 Q 0 -16 7 -2 Z" fill="none" stroke="#a87a3a" strokeWidth="1.4" /><path d="M -8 -2 Q 0 6 8 -2 Z" fill="#b78a52" /><path d="M -8 -2 L 8 -2" stroke="#8a6536" strokeWidth="1" /><circle cx="-2" cy="0" r="2" fill="#e87a7a" /><circle cx="3" cy="0.5" r="1.8" fill="#f4b86a" /></>;
    case 'stump':
      return <><ellipse cx="0" cy="0" rx="7" ry="3.4" fill={PAL.plankDark} /><path d="M -7 0 Q -7 -6 0 -6 Q 7 -6 7 0 Z" fill={PAL.plankLight} /><ellipse cx="0" cy="-6" rx="7" ry="3.4" fill="#caa274" /><ellipse cx="0" cy="-6" rx="3.4" ry="1.6" fill="#a87f50" /></>;
    case 'bush':
      return <><ellipse cx="0" cy="0" rx="9" ry="4" fill="#3f5a30" opacity="0.5" /><circle cx="-4" cy="-4" r="4.5" fill="#5f8a3f" /><circle cx="3" cy="-5" r="5" fill="#6f9a48" /><circle cx="0" cy="-3" r="4" fill="#7fa856" /><circle cx="2" cy="-7" r="1.2" fill="#e8a0bd" /></>;
  }
}

function SceneStyles() {
  return (
    <style>{`
      .ghost-cell { animation: ghostpulse 2.4s ease-in-out infinite; }
      @keyframes ghostpulse { 0%,100% { opacity: .85 } 50% { opacity: 1 } }
    `}</style>
  );
}
