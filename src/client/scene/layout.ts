import type { FixtureId, ZoneId } from '@shared/types';
import {
  D as PLAN_D,
  FIXTURE_ANCHORS as PLAN_FIXTURES,
  PLAN,
  partitionSegments,
  W as PLAN_W,
  type LevelKey,
  type RoomRect,
} from '../house/model';
import type { FloorMaterial } from '../house/palette';

// The 3D house, built from the floor plans in src/client/house/model.ts (22 × 33 ft) and dressed
// to match photos of the house. World units are meters and y is up.
//
// The entry side (the plan's left, y = D — porch, canopy, brick gable bay) is the front and faces
// +z, toward the default camera. Standing in front of it, the garage end (plan x = W) is on the
// right (+x) and the backyard end (plan x = 0) on the left (−x):
//   world x = plan x − W/2
//   world z = plan y − D/2
// The lot slopes: the garage at basement level opens onto a driveway a little below the street,
// the front lawn sits a porch-flight below the ground floor, and the backyard is on level 0.
// Each storey is drawn in level-local coordinates: y = 0 is its floor.

export const W = PLAN_W; // 10.05 m along the entry facade (x)
export const D = PLAN_D; // 6.7 m deep (z)
export const H = 2.9; // floor to floor
export const SLAB = 0.24;
export const WALL = H - SLAB; // wall height inside a storey
export const T = 0.2; // exterior wall thickness
export const ROOF = { base: 3 * H, rise: 2.3, overhang: 0.45 } as const;
export const RIDGE_Y = ROOF.base + ROOF.rise;
/** How far the eaves sit below the top of the walls (the roof planes run past them). */
export const EAVE_DROP = (ROOF.overhang * ROOF.rise) / (D / 2);

export const LEVELS: readonly LevelKey[] = ['basement', 'ground', 'upper'];
export type Layer = LevelKey | 'roof' | 'site';

/** Plan (x, y) → scene (x, z). */
export function fromPlan(x: number, y: number): [number, number] {
  return [x - W / 2, y - D / 2];
}

export function levelIndex(level: LevelKey): number {
  return LEVELS.indexOf(level);
}

/** Floor height of a storey with the house assembled. */
export function levelBase(level: LevelKey): number {
  return levelIndex(level) * H;
}

// ── Rooms ─────────────────────────────────────────────────────────────────────────────────────

export interface Rect3D {
  /** Plan part id (furniture key). */
  id: string;
  zone: ZoneId | null;
  level: LevelKey;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  floor: FloorMaterial;
  plan: RoomRect;
}

function toRect(level: LevelKey, rect: RoomRect): Rect3D {
  const [x0, z0] = fromPlan(rect.x0, rect.y0);
  const [x1, z1] = fromPlan(rect.x1, rect.y1);
  return { id: rect.id, zone: rect.zone, level, x0, x1, z0, z1, floor: rect.floor, plan: rect };
}

export const RECTS: Record<LevelKey, Rect3D[]> = {
  basement: PLAN.basement.map((rect) => toRect('basement', rect)),
  ground: PLAN.ground.map((rect) => toRect('ground', rect)),
  upper: PLAN.upper.map((rect) => toRect('upper', rect)),
};

/** Selectable zones on a storey, in plan order (back of the house first). */
export function levelZones(level: LevelKey): ZoneId[] {
  const out: ZoneId[] = [];
  for (const rect of RECTS[level]) if (rect.zone && !out.includes(rect.zone)) out.push(rect.zone);
  return out;
}

export interface Zone3D {
  level: LevelKey;
  rects: Rect3D[];
  /** Bounding box of the zone's parts. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Center of the largest part (where its label points). */
  center: [number, number];
}

const ZONES = new Map<ZoneId, Zone3D>();
for (const level of LEVELS) {
  for (const zone of levelZones(level)) {
    const rects = RECTS[level].filter((rect) => rect.zone === zone);
    const main = [...rects].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
    ZONES.set(zone, {
      level,
      rects,
      x0: Math.min(...rects.map((r) => r.x0)),
      x1: Math.max(...rects.map((r) => r.x1)),
      z0: Math.min(...rects.map((r) => r.z0)),
      z1: Math.max(...rects.map((r) => r.z1)),
      center: [(main.x0 + main.x1) / 2, (main.z0 + main.z1) / 2],
    });
  }
}

export function zone3d(zone: ZoneId): Zone3D | null {
  return ZONES.get(zone) ?? null;
}

export interface PartitionPiece {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Interior walls of a storey, with the plan's doorways left open. */
export function partitions(level: LevelKey): PartitionPiece[] {
  const thickness = 0.12;
  // Stop at the inside faces of the exterior walls so no interior finish shows outside.
  const clampX = (x: number) => Math.max(-W / 2 + T, Math.min(W / 2 - T, x));
  const clampZ = (z: number) => Math.max(-D / 2 + T, Math.min(D / 2 - T, z));
  return PLAN[level]
    .flatMap((rect) =>
      partitionSegments(rect).map((segment) => {
        if (segment.axis === 'x') {
          // Runs along plan x (scene x) at plan y = at.
          const z = segment.at - D / 2;
          const x0 = clampX(segment.from - W / 2);
          const x1 = clampX(segment.to - W / 2);
          return { x: (x0 + x1) / 2, z, w: Math.abs(x1 - x0), d: thickness };
        }
        // Runs along plan y (scene z) at plan x = at.
        const x = segment.at - W / 2;
        const z0 = clampZ(segment.from - D / 2);
        const z1 = clampZ(segment.to - D / 2);
        return { x, z: (z0 + z1) / 2, w: thickness, d: Math.abs(z1 - z0) };
      }),
    )
    .filter((piece) => piece.w > 0.05 && piece.d > 0.05);
}

// ── Exterior walls: openings and cladding ────────────────────────────────────────────────────

export type WallSide = 'front' | 'back' | 'left' | 'right';

/** Outward normal of each exterior wall (x, z). */
export const WALL_NORMAL: Record<WallSide, readonly [number, number]> = {
  front: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

export interface Opening {
  /** Along the wall: scene x for front/back walls, scene z for left/right walls. */
  u0: number;
  u1: number;
  /** Height above the floor (may start below it, across the floor slab). */
  v0: number;
  v1: number;
  /**
   * window · door · garage (flush sectional door) · patio (sliding glass door) · panel (dark
   * spandrel between stacked windows).
   */
  kind: 'window' | 'door' | 'garage' | 'patio' | 'panel';
}

export type Cladding = 'brickDark' | 'brickLight' | 'siding' | 'foundation';

/** Facade finish along a wall, by span of u; `out` is how far that stretch stands proud of the wall. */
export interface CladdingSpan {
  u0: number;
  u1: number;
  m: Cladding;
  out?: number;
}

const op = (kind: Opening['kind'], u0: number, u1: number, v0: number, v1: number): Opening => ({ u0, u1, v0, v1, kind });

/**
 * The entry bay: light brick standing 40 cm proud of the facade under its own front gable, with
 * the big bedroom window upstairs and, below a flat metal canopy, a recessed alcove for the door.
 */
export const BAY = { x0: -0.95, x1: 2.25, out: 0.4 } as const;
export const ALCOVE = { x0: -0.45, x1: 1.0 } as const;
/** The cream-siding strip with the stairwell windows, toward the backyard end of the front. */
export const STAIR_STRIP = { x0: -4.15, x1: -2.5, window: [-3.68, -2.95] as const } as const;
/** Light brick column on the garage end, at the corner by the entry. */
export const CORNER = { z0: D / 2 - 1.1, z1: D / 2 } as const;

export const DOOR_X = 5.08 - W / 2; // the plan's entry door
/** The garage door, along the garage end (scene z). */
export const GARAGE_DOOR = [-2.95, 2.15] as const;
const NARROW = [1.05, 1.75] as const; // narrow stacked windows on the garage end (scene z)
const LARGE = [-2.75, -0.1] as const; // large stacked windows on the garage end (scene z)
const BAY_WINDOW = [BAY.x0 + 0.5, BAY.x0 + 2.2] as const;

export const OPENINGS: Record<LevelKey, Record<WallSide, Opening[]>> = {
  basement: {
    front: [],
    back: [],
    left: [],
    right: [op('garage', ...GARAGE_DOOR, 0, 2.2)],
  },
  ground: {
    // Stairwell: a low window, a dark panel, then the tall window running up into the top floor.
    front: [
      op('window', ...STAIR_STRIP.window, 0.2, 1.45),
      op('panel', ...STAIR_STRIP.window, 1.45, 2.5),
      op('window', ...STAIR_STRIP.window, 2.5, WALL + SLAB),
      op('door', DOOR_X - 0.45, DOOR_X + 0.45, 0, 2.15),
    ],
    back: [],
    // The porte-fenêtre from the living room out to the backyard.
    left: [op('patio', 1.3 - D / 2, 3.65 - D / 2, 0, 2.25)],
    right: [op('window', ...LARGE, 0.8, 2.3), op('window', ...NARROW, 0.8, 2.3), op('panel', ...NARROW, 2.3, WALL + SLAB)],
  },
  upper: {
    front: [op('window', ...STAIR_STRIP.window, -SLAB, 2.3), op('window', ...BAY_WINDOW, 0.45, 2.2)],
    back: [],
    left: [op('window', 1.6 - D / 2, 3.1 - D / 2, 1.2, 2.3)],
    right: [op('window', ...LARGE, 0.8, 2.3), op('panel', ...NARROW, -SLAB, 0.8), op('window', ...NARROW, 0.8, 2.3)],
  },
};

const frontCladding = (alcoveOut: number): CladdingSpan[] => [
  { u0: -W / 2, u1: STAIR_STRIP.x0, m: 'brickLight' },
  { u0: STAIR_STRIP.x0, u1: STAIR_STRIP.x1, m: 'siding' },
  { u0: STAIR_STRIP.x1, u1: BAY.x0, m: 'brickDark' },
  { u0: BAY.x0, u1: ALCOVE.x0, m: 'brickLight', out: BAY.out },
  { u0: ALCOVE.x0, u1: ALCOVE.x1, m: 'brickLight', out: alcoveOut },
  { u0: ALCOVE.x1, u1: BAY.x1, m: 'brickLight', out: BAY.out },
  { u0: BAY.x1, u1: W / 2, m: 'brickDark' },
];

/** Siding with a light brick column at the corner by the entry (both ends of the house). */
const END_CLADDING: CladdingSpan[] = [
  { u0: -D / 2, u1: CORNER.z0, m: 'siding' },
  { u0: CORNER.z0, u1: D / 2, m: 'brickLight' },
];

export const CLADDING: Record<LevelKey, Record<WallSide, CladdingSpan[]>> = {
  basement: {
    // Below grade except by the garage, where the corner court and the driveway expose it.
    front: [
      { u0: -W / 2, u1: W / 2 - 1.75, m: 'foundation' },
      { u0: W / 2 - 1.75, u1: W / 2, m: 'brickDark' },
    ],
    back: [
      { u0: -W / 2, u1: 0.5, m: 'foundation' },
      { u0: 0.5, u1: W / 2, m: 'brickDark' },
    ],
    left: [{ u0: -D / 2, u1: D / 2, m: 'foundation' }],
    right: [
      { u0: -D / 2, u1: GARAGE_DOOR[0], m: 'brickLight' },
      { u0: GARAGE_DOOR[0], u1: CORNER.z0, m: 'siding' },
      { u0: CORNER.z0, u1: D / 2, m: 'brickLight' },
    ],
  },
  ground: {
    front: frontCladding(0),
    back: [{ u0: -W / 2, u1: W / 2, m: 'brickDark' }],
    left: END_CLADDING,
    right: END_CLADDING,
  },
  upper: {
    front: frontCladding(BAY.out),
    back: [{ u0: -W / 2, u1: W / 2, m: 'brickDark' }],
    left: END_CLADDING,
    right: END_CLADDING,
  },
};

/** How far the facade stands proud of the wall line at `u` (the entry bay). */
export function wallOut(level: LevelKey, side: WallSide, u: number): number {
  return CLADDING[level][side].find((c) => u >= c.u0 - 1e-6 && u <= c.u1 + 1e-6)?.out ?? 0;
}

/** Distance from the house center to the outer face of a wall, at `u`. */
export function wallFace(level: LevelKey, side: WallSide, u: number): number {
  return (side === 'front' || side === 'back' ? D / 2 : W / 2) + wallOut(level, side, u);
}

export interface WallPiece {
  /** Box center x/z and extent, level-local. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Vertical span (starts below the floor to cover the slab edge). */
  v0: number;
  v1: number;
  m: Cladding;
}

/**
 * Splits a wall into solid boxes around its openings (so windows are real holes) and where the
 * cladding changes. Walls run from the slab below the floor to the next floor (or the roof).
 */
export function wallPieces(level: LevelKey, side: WallSide): WallPiece[] {
  const along = side === 'front' || side === 'back';
  // Front and back walls run the full length; the end walls fit between them.
  const length = along ? W : D - 2 * T;
  const start = -length / 2;
  const end = length / 2;
  const bottom = -SLAB;
  // The top storey's walls run up to the roof plate.
  const top = level === 'upper' ? H : WALL;
  const openings = OPENINGS[level][side];
  const cladding = CLADDING[level][side];
  const cuts = new Set<number>([start, end]);
  const clamp = (u: number) => Math.max(start, Math.min(end, u));
  for (const o of openings) cuts.add(clamp(o.u0)).add(clamp(o.u1));
  for (const c of cladding) cuts.add(clamp(c.u0)).add(clamp(c.u1));
  const edges = [...cuts].sort((a, b) => a - b);
  const sign = side === 'front' || side === 'right' ? 1 : -1;
  const pieces: WallPiece[] = [];
  const push = (u0: number, u1: number, v0: number, v1: number) => {
    if (u1 - u0 < 0.005 || v1 - v0 < 0.005) return;
    const mid = (u0 + u1) / 2;
    const span = cladding.find((c) => mid >= c.u0 && mid <= c.u1);
    const out = span?.out ?? 0;
    // From the inside face to the outer face (which stands proud on the bay).
    const inner = (along ? D / 2 : W / 2) - T;
    const outer = (along ? D / 2 : W / 2) + out;
    const center = (sign * (inner + outer)) / 2;
    const depth = outer - inner;
    const m = span?.m ?? 'brickDark';
    pieces.push(along ? { x: mid, z: center, w: u1 - u0, d: depth, v0, v1, m } : { x: center, z: mid, w: depth, d: u1 - u0, v0, v1, m });
  };
  for (let i = 0; i < edges.length - 1; i += 1) {
    const u0 = edges[i];
    const u1 = edges[i + 1];
    const mid = (u0 + u1) / 2;
    // Vertical gaps where openings cross this column of wall.
    const holes = openings.filter((o) => mid > o.u0 && mid < o.u1).map((o) => [Math.max(bottom, o.v0), Math.min(top, o.v1)] as const);
    holes.sort((a, b) => a[0] - b[0]);
    let cursor = bottom;
    for (const [h0, h1] of holes) {
      push(u0, u1, cursor, h0);
      cursor = Math.max(cursor, h1);
    }
    push(u0, u1, cursor, top);
  }
  return pieces;
}

// ── Roof ──────────────────────────────────────────────────────────────────────────────────────

/** Front gable over the entry bay: 45° pitch, its ridge running back into the hip roof. */
export const GABLE = {
  x0: BAY.x0,
  x1: BAY.x1,
  /** Its brick pediment sits on the bay's front face. */
  face: D / 2 + BAY.out,
  rise: (BAY.x1 - BAY.x0) / 2,
  /** Side overhang: its eaves land exactly on the hip roof's eave line. */
  side: EAVE_DROP,
  front: 0.22,
} as const;

// ── The lot ───────────────────────────────────────────────────────────────────────────────────

/**
 * Finished grade heights (world y). The garage floor is 0 and the driveway climbs gently to the
 * street; the front lawn sits a short flight below the porch; the backyard is level with the
 * ground floor (one step down from the living room's patio door).
 */
export const GRADE = { street: 0.6, front: 2.2, back: 2.66 } as const;
/** Ground-floor porch along the entry, from the bay to the garage end; steps down to the lawn. */
export const PORCH = { x0: BAY.x0 - 0.15, x1: W / 2, z0: D / 2, z1: D / 2 + 1.6, top: H - 0.04, steps: { x0: 1.0, x1: 2.3, count: 3 } } as const;
/** Paved court at driveway level under the porch's garage end, with a door under the porch. */
export const COURT = { x0: W / 2 - 1.75, x1: W / 2 + 0.3, z0: D / 2, z1: PORCH.z1, floor: 0.1 } as const;
/** Armour-stone retaining wall between the court/driveway and the walkway above. */
export const STONE_WALL = { z0: PORCH.z1, z1: PORCH.z1 + 0.5 } as const;
/** The walkway: from the porch steps it runs toward the street end, stepping down to the drive. */
export const WALK = {
  z0: STONE_WALL.z1,
  z1: STONE_WALL.z1 + 1.2,
  /** [x, top] breakpoints: flat runs between flights of steps. */
  runs: [
    { x0: 0.8, x1: 3.2, top: GRADE.front },
    { x0: 4.1, x1: 5.4, top: 1.6 },
    { x0: 6.6, x1: 7.4, top: 0.85 },
  ],
  end: 8.3,
} as const;
export const DRIVE = { x0: W / 2, x1: W / 2 + 7.5, z0: -D / 2 - 0.3, z1: STONE_WALL.z0 } as const;
/** Fenced backyard: off the back end of the house, wrapping round to the stairwell windows. */
export const YARD = { x0: -W / 2 - 8, x1: -W / 2, z0: -D / 2 - 2.4, z1: D / 2 + 2.0, wrap: -2.3 } as const;
export const STREET = { sidewalk: D / 2 + 8, curb: D / 2 + 9.5, far: D / 2 + 17 } as const;
export const SIDE_STREET = { sidewalk: DRIVE.x1, curb: DRIVE.x1 + 1.5, far: DRIVE.x1 + 9 } as const;

/** Driveway surface height: 0 at the garage door, rising to the street. */
export function driveHeight(x: number): number {
  const t = Math.max(0, Math.min(1, (x - DRIVE.x0) / (DRIVE.x1 - DRIVE.x0)));
  return GRADE.street * t;
}

/** Top of the walkway at x (landings and the flights of steps between them). */
export function walkHeight(x: number): number {
  const runs = WALK.runs;
  if (x <= runs[0].x1) return runs[0].top;
  for (let i = 1; i < runs.length; i += 1) {
    const prev = runs[i - 1];
    const run = runs[i];
    if (x <= run.x0) {
      const steps = Math.max(1, Math.round((prev.top - run.top) / 0.19));
      const k = Math.min(steps - 1, Math.floor(((x - prev.x1) / (run.x0 - prev.x1)) * steps));
      return prev.top - ((prev.top - run.top) * (k + 1)) / steps;
    }
    if (x <= run.x1) return run.top;
  }
  const last = runs[runs.length - 1];
  const drop = last.top - driveHeight(WALK.end);
  const steps = Math.max(1, Math.round(drop / 0.19));
  const k = Math.min(steps - 1, Math.floor(((x - last.x1) / (WALK.end - last.x1)) * steps));
  return x >= WALK.end ? driveHeight(x) : last.top - (drop * (k + 1)) / steps;
}

/** Grade along the front of the house: level with the backyard at its end, dropping toward the entry. */
export function frontGrade(x: number): number {
  const t = Math.max(0, Math.min(1, (x + 4.5) / 3.3));
  return GRADE.back + (GRADE.front - GRADE.back) * t * t * (3 - 2 * t);
}

// ── Anchors ───────────────────────────────────────────────────────────────────────────────────

export interface Anchor {
  layer: Layer;
  /** Level-local position (site anchors are world positions; roof ones are above its base). */
  point: readonly [number, number, number];
  /** Outward direction of the surface it sits on (x, z); labels fade when it faces away. */
  normal?: readonly [number, number];
}

const fromPlanAnchor = (level: LevelKey, [x, y, z]: readonly [number, number, number]): Anchor => {
  const [sx, sz] = fromPlan(x, y);
  return { layer: level, point: [sx, Math.min(z, WALL - 0.04), sz] };
};

function planFixture(id: FixtureId, level?: LevelKey): Anchor[] {
  return PLAN_FIXTURES[id]
    .filter((a) => a.level !== 'roof' && (!level || a.level === level))
    .map((a) => fromPlanAnchor(a.level as LevelKey, a.point));
}

/** The dryer's vent hood, outside on the backyard end (scene z). */
export const DRYER_VENT_Z = 4.0 - D / 2;
/** The outdoor faucet, by the corner of the backyard end (scene z). */
export const HOSE_BIB_Z = 5.5 - D / 2;
/** The heat pump's outdoor unit in the backyard. */
export const HEAT_PUMP_UNIT = { x: -W / 2 - 1.0, z: -D / 2 + 0.45 } as const;

/** Where each fixture is, for highlight rings and labels. */
export const FIXTURE_ANCHORS: Record<FixtureId, Anchor[]> = {
  'garage-door': [{ layer: 'basement', point: [W / 2 + 0.06, 1.15, (GARAGE_DOOR[0] + GARAGE_DOOR[1]) / 2], normal: [1, 0] }],
  car: planFixture('car'),
  'heat-pump': planFixture('heat-pump'),
  'water-heater': planFixture('water-heater'),
  'air-exchanger': planFixture('air-exchanger'),
  'sump-pump': planFixture('sump-pump'),
  'electrical-panel': planFixture('electrical-panel'),
  'water-main': planFixture('water-main'),
  dryer: planFixture('dryer'),
  washer: planFixture('washer'),
  'dryer-vent': [{ layer: 'ground', point: [-W / 2 - 0.12, -0.05, DRYER_VENT_Z], normal: [-1, 0] }, ...planFixture('dryer-vent')],
  'front-door': [{ layer: 'ground', point: [DOOR_X, 1.1, D / 2 + 0.06], normal: [0, 1] }],
  dishwasher: planFixture('dishwasher'),
  'range-hood': planFixture('range-hood'),
  fridge: planFixture('fridge'),
  'fire-extinguisher': planFixture('fire-extinguisher'),
  'bath-fan': planFixture('bath-fan'),
  bathtub: planFixture('bathtub'),
  shower: planFixture('shower'),
  gutters: [
    { layer: 'roof', point: [-2.9, -EAVE_DROP - 0.08, D / 2 + ROOF.overhang + 0.08], normal: [0, 1] },
    { layer: 'roof', point: [3.8, -EAVE_DROP - 0.08, D / 2 + ROOF.overhang + 0.08], normal: [0, 1] },
  ],
  lawn: [{ layer: 'site', point: [-W / 2 - 4.2, GRADE.back + 0.1, 0.3] }],
  'heat-pump-outdoor': [{ layer: 'site', point: [HEAT_PUMP_UNIT.x, GRADE.back + 0.55, HEAT_PUMP_UNIT.z] }],
  'hose-bib': [{ layer: 'ground', point: [-W / 2 - 0.06, 0.25, HOSE_BIB_Z], normal: [-1, 0] }],
  'smoke-detectors': planFixture('smoke-detectors'),
  windows: [
    { layer: 'upper', point: [(BAY_WINDOW[0] + BAY_WINDOW[1]) / 2, 1.3, D / 2 + BAY.out + 0.05], normal: [0, 1] },
    { layer: 'upper', point: [(STAIR_STRIP.window[0] + STAIR_STRIP.window[1]) / 2, 0.9, D / 2 + 0.05], normal: [0, 1] },
    { layer: 'ground', point: [W / 2 + 0.05, 1.55, (LARGE[0] + LARGE[1]) / 2], normal: [1, 0] },
  ],
};

/** Where a zone's label points. */
export function zoneAnchor(zone: ZoneId): Anchor | null {
  const found = zone3d(zone);
  if (found) return { layer: found.level, point: [found.center[0], 0.15, found.center[1]] };
  if (zone === 'roof') return { layer: 'roof', point: [-2.6, ROOF.rise * 0.5, D / 4], normal: [0, 1] };
  // The fenced corner of the backyard by the stairwell windows, which shows from the street.
  if (zone === 'backyard') return { layer: 'site', point: [-W / 2 - 1.6, GRADE.back + 0.1, D / 2 + 1.0] };
  if (zone === 'house') return { layer: 'ground', point: [DOOR_X + 0.6, 0.2, D / 2 + 1.0], normal: [0, 1] };
  return null;
}

// ── Views ─────────────────────────────────────────────────────────────────────────────────────

export type SceneView =
  | { kind: 'exterior' }
  | { kind: 'exploded' }
  | { kind: 'level'; level: LevelKey }
  | { kind: 'roof' }
  | { kind: 'yard' };

export const EXTERIOR: SceneView = { kind: 'exterior' };

export function sameView(a: SceneView, b: SceneView): boolean {
  return a.kind === b.kind && (a.kind !== 'level' || (b.kind === 'level' && a.level === b.level));
}

/** The view that shows a zone. */
export function viewForZone(zone: ZoneId | null): SceneView {
  if (!zone || zone === 'house') return EXTERIOR;
  if (zone === 'roof') return { kind: 'roof' };
  if (zone === 'backyard') return { kind: 'yard' };
  const found = zone3d(zone);
  return found ? { kind: 'level', level: found.level } : EXTERIOR;
}

const EXPLODE = 2.6; // extra air between storeys in the stacked view
const AWAY = 16; // how far storeys fly up when the view goes inside a lower one

/** Vertical offset of each layer (on top of its assembled height) in a view. */
export function layerLift(layer: Exclude<Layer, 'site'>, view: SceneView): number {
  if (view.kind === 'exploded') return layer === 'roof' ? EXPLODE * 3.3 : levelIndex(layer) * EXPLODE;
  if (view.kind !== 'level') return 0;
  const target = levelIndex(view.level);
  const index = layer === 'roof' ? 3 : levelIndex(layer);
  return index > target ? AWAY + (index - target) * 3 : 0;
}

/** Whether a storey shows its interior (furniture, status floors) in a view. */
export function levelOpen(level: LevelKey, view: SceneView): boolean {
  return view.kind === 'exploded' || (view.kind === 'level' && view.level === level);
}

/**
 * Whether the landscaping stands at its real heights. Looking into the basement, or at the
 * stacked floors, the raised lawns would hide the rooms, so the lot settles flat.
 */
export function terrainRaised(view: SceneView): boolean {
  return view.kind !== 'exploded' && !(view.kind === 'level' && view.level === 'basement');
}

export interface Framing {
  /** Region that has to fit on screen (world coordinates). */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** Camera angle around the house (0 = straight at the front, positive toward the garage end). */
  azimuth: number;
  /** Angle from straight down (90° = level). */
  polar: number;
}

const DEG = Math.PI / 180;

export function framingFor(view: SceneView, zone: ZoneId | null = null): Framing {
  const room = zone ? zone3d(zone) : null;
  if (room && view.kind === 'level') {
    const base = levelBase(room.level);
    // At least ~4.6 m across, so small rooms (laundry, powder room) keep their neighbours in view.
    const span = (lo: number, hi: number, limit: number) => {
      const half = Math.max((hi - lo) / 2 + 0.7, 2.3);
      const mid = Math.max(-limit + half, Math.min(limit - half, (lo + hi) / 2));
      return [Math.max(-limit, mid - half), Math.min(limit, mid + half)] as const;
    };
    const [x0, x1] = span(room.x0, room.x1, W / 2);
    const [z0, z1] = span(room.z0, room.z1, D / 2);
    return { min: [x0, base - 0.2, z0], max: [x1, base + 2.0, z1], azimuth: 24 * DEG, polar: 44 * DEG };
  }
  switch (view.kind) {
    case 'exploded':
      return { min: [-W / 2 - 0.3, -0.4, -D / 2], max: [W / 2 + 0.3, ROOF.base + EXPLODE * 3.3 + ROOF.rise, D / 2], azimuth: 38 * DEG, polar: 68 * DEG };
    case 'level': {
      const base = levelBase(view.level);
      // From the garage-end corner, so the long house fits a phone held upright.
      return { min: [-W / 2 - 0.2, base - 0.3, -D / 2], max: [W / 2 + 0.2, base + 2.0, D / 2], azimuth: 58 * DEG, polar: 48 * DEG };
    }
    case 'roof':
      return { min: [-W / 2 - 0.5, ROOF.base - 0.6, -D / 2 - 0.5], max: [W / 2 + 0.5, RIDGE_Y + 0.2, D / 2 + 0.5], azimuth: 32 * DEG, polar: 60 * DEG };
    case 'yard':
      return { min: [YARD.x0 + 1, GRADE.back, YARD.z0], max: [-W / 2 + 1.2, GRADE.back + 3.2, YARD.z1], azimuth: -78 * DEG, polar: 60 * DEG };
    default:
      return { min: [-W / 2 - 2.2, 0, -D / 2 - 0.6], max: [W / 2 + 2.4, RIDGE_Y + 0.3, PORCH.z1 + 1.6], azimuth: 34 * DEG, polar: 80 * DEG };
  }
}
