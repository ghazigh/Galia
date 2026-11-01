import type { FixtureId, ZoneId } from '@shared/types';
import { boundsOf, unionBounds, type Bounds, type P3 } from './iso';
import type { FloorMaterial } from './palette';

// The house is drawn as an exploded "dollhouse": each storey is a plate cut open at the front,
// walls facing the viewer are cut low, and the storeys float apart so every room stays visible.
// World units are meters. The layout follows the floor plans (22 × 33 ft):
//  - x runs from the back of the house (x = 0, the backyard side) to the street (x = W);
//  - y runs from the plan's right side (y = 0) to its left side (y = D), where the entry is.
// The viewer looks from the front-left corner, so the back (x = 0) and right (y = 0) walls stand
// tall while the front and left walls are cut low.

export const W = 10.05; // 33 ft, back to front (x)
export const D = 6.7; // 22 ft, right to left (y)
export const T = 0.14; // wall thickness
export const SLAB = 0.32;
export const STOREY = 3; // floor-to-floor height
export const LOW_WALL = 0.72; // partitions and walls facing the viewer
export const BACK_WALL = { overview: 0.9, focus: 2.6 } as const;

// Storeys are exploded up and slightly toward the right side (−y), which keeps a deep floor
// clear of the one above with far less height than a straight vertical stack. At a fixed screen
// x, a storey shifted by SHIFT needs RISE ≥ (D − SHIFT) + SLAB + the height of what stands
// against its back walls in the overview.
export const SHIFT = 3.0;
export const RISE = 5.3;

export const YARD = { x0: -4.6, x1: -0.1, y0: -0.4, y1: D + 0.4, thickness: 0.5 } as const;
export const ROOF = { overhang: 0.35, rise: 2.2, lift: 6.4, shift: 3.0 } as const;

export type LevelKey = 'basement' | 'ground' | 'upper';
export const LEVEL_KEYS: readonly LevelKey[] = ['basement', 'ground', 'upper'];

/** Where a doorway or opening interrupts a partition: [from, to] along the wall. */
export type Openings = readonly (readonly [number, number])[] | 'open';

export interface RoomRect {
  /** Key for the furniture drawn in this part of the floor. */
  id: string;
  /** Selectable zone; null for stairs, halls and closets that belong to no room. */
  zone: ZoneId | null;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  floor: FloorMaterial;
  /** Partition along y = y0 (shared with the part behind it); openings along x. */
  backWall?: Openings;
  /** Partition along x = x0; openings along y. */
  sideWall?: Openings;
}

const r = (
  id: string,
  zone: ZoneId | null,
  [x0, x1]: [number, number],
  [y0, y1]: [number, number],
  floor: FloorMaterial,
  walls: Pick<RoomRect, 'backWall' | 'sideWall'> = {},
): RoomRect => ({ id, zone, x0, x1, y0, y1, floor, ...walls });

export const PLAN: Record<LevelKey, RoomRect[]> = {
  basement: [
    r('family', 'family', [0, 3.5], [0, 3.0], 'oak'),
    r('laundry', 'laundry', [0, 2.2], [3.0, 4.05], 'tile', { backWall: [[0.3, 2.1]] }),
    r('basement-hall', null, [2.2, 3.5], [3.0, 4.05], 'tile', { backWall: 'open' }),
    r('mechanical', 'mechanical', [0, 2.5], [4.05, 5.35], 'epoxy'),
    r('basement-hall-2', null, [2.5, 3.5], [4.05, 5.35], 'tile', { backWall: 'open', sideWall: [[4.3, 5.1]] }),
    r('sump', 'mechanical', [0, 1.1], [5.35, 6.7], 'epoxy', { backWall: 'open' }),
    r('basement-stairs', null, [1.1, 3.5], [5.35, 6.7], 'tile', { backWall: [[2.5, 3.5]], sideWall: 'open' }),
    r('garage', 'garage', [3.5, W], [0, D], 'concrete', { sideWall: [[3.1, 3.9]] }),
  ],
  ground: [
    r('living', 'living', [0, 3.1], [0, 4.1], 'oak'),
    r('dining', 'dining', [3.1, 6.2], [0, 4.1], 'oak', { sideWall: 'open' }),
    r('kitchen', 'kitchen', [6.2, W], [0, 4.1], 'tile', { sideWall: 'open' }),
    r('ground-stairs', null, [0, 3.55], [4.1, D], 'oak'),
    r('entry', 'entry', [3.55, 6.9], [4.1, D], 'stone', { backWall: [[3.55, 5.65]], sideWall: 'open' }),
    r('powder', 'powder', [6.9, 8.45], [4.1, 5.55], 'mosaic'),
    r('entry-hall', 'entry', [6.9, 8.45], [5.55, D], 'stone', { backWall: [[7.1, 7.8]], sideWall: 'open' }),
    r('ground-closet', null, [8.45, W], [4.1, D], 'oak', { backWall: [[9.1, 9.8]] }),
  ],
  upper: [
    r('bedroom2', 'bedroom2', [0, 3.2], [0, 3.3], 'oak'),
    r('bedroom2-closet', 'bedroom2', [0, 2.45], [3.3, 4.3], 'oak', { backWall: [[0.35, 2.3]] }),
    r('bathroom', 'bathroom', [3.2, 6.05], [0, 3.3], 'mosaic'),
    r('upper-hall', null, [2.45, 6.05], [3.3, 4.3], 'oak', { backWall: [[2.5, 3.15], [3.3, 4.0]] }),
    r('upper-stairs', null, [0, 3.45], [4.3, D], 'oak', { backWall: [[2.45, 3.45]] }),
    r('bedroom1', 'bedroom1', [6.05, W], [0, 4.3], 'oak', { sideWall: [[3.4, 4.2]] }),
    r('bedroom3', 'bedroom3', [3.45, 7.75], [4.3, D], 'oak', { backWall: [[4.4, 5.1]] }),
    r('walk-in', 'bedroom1', [7.75, W], [4.3, D], 'oak', { backWall: [[8.85, 9.6]] }),
  ],
};

const EPS = 1e-6;
const overlaps = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/** Back-to-front drawing order: a part directly behind another (smaller x or y) comes first. */
export function paintOrder(rects: readonly RoomRect[]): RoomRect[] {
  const behind = (a: RoomRect, b: RoomRect) =>
    (a.y1 <= b.y0 + EPS && overlaps(a.x0, a.x1, b.x0, b.x1)) || (a.x1 <= b.x0 + EPS && overlaps(a.y0, a.y1, b.y0, b.y1));
  const remaining = [...rects].sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
  const ordered: RoomRect[] = [];
  while (remaining.length) {
    const index = remaining.findIndex((a) => !remaining.some((b) => b !== a && behind(b, a)));
    ordered.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return ordered;
}

/** Partition segments a part draws on its back and side edges, after removing openings. */
export function partitionSegments(rect: RoomRect): { axis: 'x' | 'y'; at: number; from: number; to: number }[] {
  const segments: { axis: 'x' | 'y'; at: number; from: number; to: number }[] = [];
  const cut = (axis: 'x' | 'y', at: number, from: number, to: number, openings: Openings | undefined) => {
    if (openings === 'open') return;
    let start = from;
    for (const [a, b] of [...(openings ?? [])].sort((p, q) => p[0] - q[0])) {
      if (a > start + EPS) segments.push({ axis, at, from: start, to: Math.min(a, to) });
      start = Math.max(start, b);
    }
    if (to > start + EPS) segments.push({ axis, at, from: start, to });
  };
  // axis 'x': a wall running along x at y = at; axis 'y': running along y at x = at.
  if (rect.y0 > EPS) cut('x', rect.y0, rect.x0, rect.x1, rect.backWall);
  if (rect.x0 > EPS) cut('y', rect.x0, rect.y0, rect.y1, rect.sideWall);
  return segments;
}

// ── Storey placement ────────────────────────────────────────────────────────────────────────

export type Layer = LevelKey | 'roof';

/** World offset of a storey (or the roof) in the exploded overview. */
export function layerOrigin(layer: Layer): P3 {
  if (layer === 'roof') {
    const upper = layerOrigin('upper');
    return [0, upper[1] - ROOF.shift, upper[2] + ROOF.lift];
  }
  const k = LEVEL_KEYS.indexOf(layer);
  return [0, -k * SHIFT, k * RISE];
}

/** A storey-local point in world coordinates. */
export function toWorld(layer: Layer, [x, y, z]: P3): P3 {
  const [ox, oy, oz] = layerOrigin(layer);
  return [x + ox, y + oy, z + oz];
}

export type FocusTarget = 'overview' | LevelKey | 'roof' | 'yard';

const ZONE_RECTS = new Map<ZoneId, { level: LevelKey; rects: RoomRect[] }>();
for (const level of LEVEL_KEYS) {
  for (const rect of PLAN[level]) {
    if (!rect.zone) continue;
    const entry = ZONE_RECTS.get(rect.zone) ?? { level, rects: [] };
    entry.rects.push(rect);
    ZONE_RECTS.set(rect.zone, entry);
  }
}

/** The parts of the floor that make up a zone, and their storey. */
export function zoneRects(zone: ZoneId): { level: LevelKey; rects: RoomRect[] } | null {
  return ZONE_RECTS.get(zone) ?? null;
}

/** The largest part of a zone: where its label and status pin go. */
export function mainRect(zone: ZoneId): RoomRect | null {
  const found = ZONE_RECTS.get(zone);
  if (!found) return null;
  return [...found.rects].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
}

/** Where the camera goes when a zone is selected. */
export function focusForZone(zone: ZoneId | null): FocusTarget {
  if (!zone || zone === 'house') return 'overview';
  if (zone === 'roof') return 'roof';
  if (zone === 'backyard') return 'yard';
  return ZONE_RECTS.get(zone)?.level ?? 'overview';
}

export function levelOfZone(zone: ZoneId): LevelKey | 'roof' | 'yard' | null {
  if (zone === 'roof') return 'roof';
  if (zone === 'backyard') return 'yard';
  return ZONE_RECTS.get(zone)?.level ?? null;
}

// ── Anchors (storey-local coordinates) ───────────────────────────────────────────────────────

/** Point a zone's status pin hangs over. */
export function zoneAnchor(zone: ZoneId): { level: Layer; point: P3 } | null {
  const rect = mainRect(zone);
  if (rect) {
    return { level: ZONE_RECTS.get(zone)!.level, point: [(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2, 0] };
  }
  if (zone === 'roof') return { level: 'roof', point: [W * 0.45, D * 0.62, ROOF.rise * 0.55] };
  if (zone === 'backyard') return { level: 'ground', point: [(YARD.x0 + YARD.x1) / 2, D * 0.45, 0] };
  return null;
}

export interface FixtureAnchor {
  level: Layer;
  point: P3;
}

/** Spots highlighted when a task about that fixture is selected. */
export const FIXTURE_ANCHORS: Record<FixtureId, FixtureAnchor[]> = {
  'garage-door': [{ level: 'basement', point: [W, 3.2, 0.6] }],
  car: [{ level: 'basement', point: [7.15, 3.27, 1.0] }],
  'heat-pump': [{ level: 'basement', point: [0.55, 4.55, 1.2] }],
  'water-heater': [{ level: 'basement', point: [1.75, 4.75, 1.0] }],
  'air-exchanger': [{ level: 'basement', point: [0.67, 5.15, 1.68] }],
  'sump-pump': [{ level: 'basement', point: [0.55, 6.0, 0.25] }],
  'electrical-panel': [{ level: 'basement', point: [T, 5.75, 1.4] }],
  'water-main': [{ level: 'basement', point: [T, 6.35, 0.5] }],
  dryer: [{ level: 'basement', point: [0.83, 3.57, 0.6] }],
  'dryer-vent': [{ level: 'basement', point: [T, 3.55, 1.25] }],
  washer: [{ level: 'basement', point: [1.71, 3.57, 0.6] }],
  'front-door': [{ level: 'ground', point: [5.08, D, 0.5] }],
  dishwasher: [{ level: 'ground', point: [8.55, 1.95, 0.55] }],
  'range-hood': [{ level: 'ground', point: [8.57, 0.4, 1.95] }],
  fridge: [{ level: 'ground', point: [6.9, 0.55, 1.1] }],
  'fire-extinguisher': [{ level: 'ground', point: [9.75, 3.75, 0.3] }],
  'bath-fan': [{ level: 'upper', point: [4.4, 1.6, 2.4] }],
  bathtub: [{ level: 'upper', point: [5.52, 0.98, 0.45] }],
  shower: [{ level: 'upper', point: [5.52, 2.5, 1.0] }],
  gutters: [{ level: 'roof', point: [W / 2, D + ROOF.overhang + 0.06, -0.06] }],
  lawn: [{ level: 'ground', point: [-2.6, 3.3, 0] }],
  'heat-pump-outdoor': [{ level: 'ground', point: [-1.15, 1.1, 0.6] }],
  'hose-bib': [{ level: 'ground', point: [-0.3, 5.5, 0.42] }],
  'smoke-detectors': [
    { level: 'upper', point: [4.2, 3.8, 2.4] },
    { level: 'ground', point: [2.0, 4.15, 2.4] },
    { level: 'basement', point: [3.0, 3.5, 2.4] },
  ],
  windows: [
    { level: 'upper', point: [T, 2.35, 1.85] },
    { level: 'ground', point: [T, 2.5, 1.85] },
  ],
};

// ── Camera framing (screen-space bounds at overview positions) ───────────────────────────────

function levelCorners(level: LevelKey, wallHeight: number): P3[] {
  return [
    [0, 0, -SLAB],
    [W, 0, -SLAB],
    [0, D, -SLAB],
    [W, D, -SLAB],
    [0, 0, wallHeight],
    [W, 0, wallHeight],
    [0, D, wallHeight],
  ].map((p) => toWorld(level, p as unknown as P3));
}

export function levelBounds(level: LevelKey, wallHeight: number = BACK_WALL.focus): Bounds {
  return boundsOf(levelCorners(level, wallHeight));
}

export function roofBounds(): Bounds {
  const o = ROOF.overhang;
  return boundsOf(
    (
      [
        [-o, -o, 0],
        [-o, D + o, -0.6],
        [W + o, D + o, -0.6],
        [-o, D / 2, ROOF.rise + 0.2],
        [W + o, D / 2, ROOF.rise + 0.2],
        [W + o, -o, 0],
      ] as P3[]
    ).map((p) => toWorld('roof', p)),
  );
}

export function yardBounds(): Bounds {
  return boundsOf(
    (
      [
        [YARD.x0, YARD.y0, 3.0],
        [YARD.x1 + 1.5, YARD.y0, 3.0],
        [YARD.x1 + 1.5, YARD.y1, -YARD.thickness],
        [YARD.x0, YARD.y1, -YARD.thickness],
      ] as P3[]
    ).map((p) => toWorld('ground', p)),
  );
}

export function sceneBounds(): Bounds {
  return unionBounds(...LEVEL_KEYS.map((level) => levelBounds(level, BACK_WALL.overview)), roofBounds(), yardBounds());
}

/** Frames one room with some of its neighbours for context. */
export function roomBounds(zone: ZoneId): Bounds | null {
  const found = ZONE_RECTS.get(zone);
  if (!found) return null;
  const margin = 0.9;
  const x0 = Math.max(0, Math.min(...found.rects.map((rect) => rect.x0)) - margin);
  const x1 = Math.min(W, Math.max(...found.rects.map((rect) => rect.x1)) + margin);
  const y0 = Math.max(0, Math.min(...found.rects.map((rect) => rect.y0)) - margin);
  const y1 = Math.min(D, Math.max(...found.rects.map((rect) => rect.y1)) + margin);
  return boundsOf(
    (
      [
        [x0, y0, -SLAB],
        [x1, y0, -SLAB],
        [x0, y1, -SLAB],
        [x1, y1, -SLAB],
        [x0, y0, BACK_WALL.focus],
        [x1, y0, BACK_WALL.focus],
        [x0, y1, BACK_WALL.focus],
      ] as P3[]
    ).map((p) => toWorld(found.level, p)),
  );
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
