import type { FixtureId, ZoneId } from '@shared/types';
import { boundsOf, unionBounds, type Bounds, type P3 } from './iso';
import type { FloorMaterial } from './palette';

// The house is drawn as an exploded "dollhouse" section: each storey is a plate cut open at the
// front, walls facing the viewer are cut low, and the storeys float apart so every room stays
// visible at once. World units are meters.

export const W = 12; // house width (x)
export const D = 3.8; // house depth (y) — stylized shallow rooms keep every storey visible
export const T = 0.14; // wall thickness
export const SLAB = 0.32;
export const STOREY = 3; // floor-to-floor height
export const LOW_WALL = 0.72; // partitions and walls facing the viewer
export const BACK_WALL = { overview: 1.0, focus: 2.6 } as const;
// In the exploded overview a storey's back wall must clear the slab above it. At a fixed screen
// x, a world line along x sits at height (z − y), so the storey spacing has to cover the floor
// depth plus the overview wall height plus the slab.
export const GAP = 2.15; // extra air between storeys in the exploded overview

// The yard sits beside the ground floor, pushed back far enough that it never hides the
// mechanical room below it.
export const YARD = { x0: W, x1: W + 5.6, y0: -1.5, y1: 3.4, thickness: 0.5 } as const;
export const ROOF = { overhang: 0.35, rise: 2.0, lift: 5.4 } as const;

export type LevelKey = 'basement' | 'ground' | 'upper';
export const LEVEL_KEYS: readonly LevelKey[] = ['basement', 'ground', 'upper'];

export interface RoomDef {
  zone: ZoneId;
  x0: number;
  x1: number;
  floor: FloorMaterial;
}

export const ROOMS: Record<LevelKey, RoomDef[]> = {
  basement: [
    { zone: 'garage', x0: 0, x1: 6.6, floor: 'concrete' },
    { zone: 'mechanical', x0: 6.6, x1: W, floor: 'epoxy' },
  ],
  ground: [
    { zone: 'entry', x0: 0, x1: 2.6, floor: 'stone' },
    { zone: 'living', x0: 2.6, x1: 7.6, floor: 'oak' },
    { zone: 'kitchen', x0: 7.6, x1: W, floor: 'tile' },
  ],
  upper: [
    { zone: 'bedroom1', x0: 0, x1: 3.8, floor: 'oak' },
    { zone: 'bathroom', x0: 3.8, x1: 6.2, floor: 'mosaic' },
    { zone: 'bedroom2', x0: 6.2, x1: 9.1, floor: 'oak' },
    { zone: 'bedroom3', x0: 9.1, x1: W, floor: 'oak' },
  ],
};

/** Floor height of a storey in the exploded overview. */
export function levelBase(level: LevelKey): number {
  return LEVEL_KEYS.indexOf(level) * (STOREY + GAP);
}

export const ROOF_BASE = levelBase('upper') + ROOF.lift;

export type FocusTarget = 'overview' | LevelKey | 'roof' | 'yard';

const ROOM_LEVEL = new Map<ZoneId, LevelKey>(
  LEVEL_KEYS.flatMap((level) => ROOMS[level].map((room) => [room.zone, level] as const)),
);

export function roomDef(zone: ZoneId): RoomDef | null {
  const level = ROOM_LEVEL.get(zone);
  return level ? (ROOMS[level].find((room) => room.zone === zone) ?? null) : null;
}

/** Where the camera goes when a zone is selected. */
export function focusForZone(zone: ZoneId | null): FocusTarget {
  if (!zone || zone === 'house') return 'overview';
  if (zone === 'roof') return 'roof';
  if (zone === 'backyard') return 'yard';
  return ROOM_LEVEL.get(zone) ?? 'overview';
}

export function levelOfZone(zone: ZoneId): LevelKey | 'roof' | 'yard' | null {
  if (zone === 'roof') return 'roof';
  if (zone === 'backyard') return 'yard';
  return ROOM_LEVEL.get(zone) ?? null;
}

// ── Anchors (level-local coordinates) ────────────────────────────────────────────────────────

/** Point a zone's status pin hangs over. */
export function zoneAnchor(zone: ZoneId): { level: LevelKey | 'roof'; point: P3 } | null {
  const room = roomDef(zone);
  if (room) {
    const level = ROOM_LEVEL.get(zone)!;
    return { level, point: [(room.x0 + room.x1) / 2, D * 0.6, 0] };
  }
  if (zone === 'roof') return { level: 'roof', point: [W * 0.55, D / 2, ROOF.rise + 0.1] };
  if (zone === 'backyard') return { level: 'ground', point: [(YARD.x0 + YARD.x1) / 2 + 0.6, D * 0.55, 0] };
  return null;
}

export interface FixtureAnchor {
  level: LevelKey | 'roof';
  point: P3;
}

/** Spots highlighted when a task about that fixture is selected. */
export const FIXTURE_ANCHORS: Record<FixtureId, FixtureAnchor[]> = {
  'garage-door': [{ level: 'basement', point: [T, 1.9, 0.9] }],
  car: [{ level: 'basement', point: [3.85, 2.1, 1.0] }],
  'heat-pump': [{ level: 'basement', point: [8.07, 0.6, 1.05] }],
  'water-heater': [{ level: 'basement', point: [9.35, 0.62, 0.95] }],
  dryer: [{ level: 'basement', point: [11.28, 0.58, 0.55] }],
  'dryer-vent': [{ level: 'basement', point: [11.28, T, 1.15] }],
  washer: [{ level: 'basement', point: [10.38, 0.58, 0.55] }],
  'electrical-panel': [{ level: 'basement', point: [7.1, T, 1.38] }],
  'water-main': [{ level: 'basement', point: [7.05, T + 0.1, 0.5] }],
  'front-door': [{ level: 'ground', point: [T, 2.7, 1.0] }],
  dishwasher: [{ level: 'ground', point: [9.85, 0.82, 0.45] }],
  'range-hood': [{ level: 'ground', point: [10.6, 0.38, 2.1] }],
  fridge: [{ level: 'ground', point: [11.48, 0.53, 1.0] }],
  'fire-extinguisher': [{ level: 'ground', point: [7.95, 3.4, 0.3] }],
  'bath-fan': [{ level: 'upper', point: [5.8, T, 2.3] }],
  bathtub: [{ level: 'upper', point: [4.95, 0.54, 0.4] }],
  shower: [{ level: 'upper', point: [5.63, 3.12, 1.0] }],
  gutters: [{ level: 'roof', point: [W / 2, D + ROOF.overhang + 0.06, -0.06] }],
  lawn: [{ level: 'ground', point: [15.3, 1.6, 0] }],
  'heat-pump-outdoor': [{ level: 'ground', point: [12.8, 0.55, 0.6] }],
  'hose-bib': [{ level: 'ground', point: [W, 2.4, 0.42] }],
  'smoke-detectors': [
    { level: 'upper', point: [3.2, T, 2.35] },
    { level: 'ground', point: [2.1, T, 2.35] },
    { level: 'basement', point: [8.9, T, 2.35] },
  ],
  windows: [
    { level: 'upper', point: [1.9, T, 1.85] },
    { level: 'ground', point: [4.7, T, 1.85] },
    { level: 'upper', point: [10.2, T, 1.85] },
  ],
};

// ── Camera framing (screen-space bounds at overview positions) ───────────────────────────────

export function levelBounds(level: LevelKey, wallHeight: number = BACK_WALL.focus): Bounds {
  const z = levelBase(level);
  return boundsOf([
    [0, 0, z - SLAB],
    [W, 0, z - SLAB],
    [0, D, z - SLAB],
    [W, D, z - SLAB],
    [0, 0, z + wallHeight],
    [W, 0, z + wallHeight],
  ]);
}

export function roofBounds(): Bounds {
  const o = ROOF.overhang;
  return boundsOf([
    [-o, -o, ROOF_BASE],
    [-o, D + o, ROOF_BASE - 0.2],
    [W + o, D + o, ROOF_BASE - 0.2],
    [-o, D / 2, ROOF_BASE + ROOF.rise + 0.2],
    [W + o, D / 2, ROOF_BASE + ROOF.rise + 0.2],
    [W + o, -o, ROOF_BASE],
  ]);
}

export function yardBounds(): Bounds {
  const z = levelBase('ground');
  return boundsOf([
    [YARD.x0 - 1.5, YARD.y0, z + 3.2],
    [YARD.x1, YARD.y0, z + 3.2],
    [YARD.x1, YARD.y1, z - YARD.thickness],
    [YARD.x0 - 1.5, YARD.y1, z - YARD.thickness],
  ]);
}

export function sceneBounds(): Bounds {
  return unionBounds(levelBounds('basement', BACK_WALL.overview), roofBounds(), yardBounds());
}

/** Frames one room with some of its neighbours for context. */
export function roomBounds(zone: ZoneId): Bounds | null {
  const room = roomDef(zone);
  const level = ROOM_LEVEL.get(zone);
  if (!room || !level) return null;
  const z = levelBase(level);
  const margin = 1.1;
  return boundsOf([
    [Math.max(0, room.x0 - margin), 0, z - SLAB],
    [Math.min(W, room.x1 + margin), 0, z - SLAB],
    [Math.max(0, room.x0 - margin), D, z - SLAB],
    [Math.min(W, room.x1 + margin), D, z - SLAB],
    [Math.max(0, room.x0 - margin), 0, z + BACK_WALL.focus],
    [Math.min(W, room.x1 + margin), 0, z + BACK_WALL.focus],
  ]);
}

export function cameraFor(focus: FocusTarget, zone: ZoneId | null = null): Bounds {
  const room = zone ? roomBounds(zone) : null;
  if (room) return room;
  switch (focus) {
    case 'overview':
      return sceneBounds();
    case 'roof':
      return roofBounds();
    case 'yard':
      return yardBounds();
    default:
      return levelBounds(focus);
  }
}
