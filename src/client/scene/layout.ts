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

// The 3D house, built from the floor plans in src/client/house/model.ts (22 × 33 ft). World units
// are meters, y is up and the street-side front of the house faces +z (toward the default camera).
//
// Plan coordinates run x from the back (yard) to the front (street) and y from the right side to
// the left side, where the entry is. In the scene that becomes:
//   world x = W/2 − plan y      (the right side is +x)
//   world z = plan x − D/2      (the front is +z)
// Each storey is drawn in level-local coordinates: y = 0 is its floor.

export const W = PLAN_D; // 6.7 m wide (x)
export const D = PLAN_W; // 10.05 m deep (z)
export const H = 2.9; // floor to floor
export const SLAB = 0.24;
export const WALL = H - SLAB; // wall height inside a storey
export const T = 0.2; // exterior wall thickness
export const ROOF = { base: 3 * H, rise: 2.6, overhang: 0.45 } as const;
export const RIDGE_Y = ROOF.base + ROOF.rise;
/** How far the eaves sit below the top of the walls (the roof planes run past them). */
export const EAVE_DROP = (ROOF.overhang * ROOF.rise) / (W / 2);

export const LEVELS: readonly LevelKey[] = ['basement', 'ground', 'upper'];
export type Layer = LevelKey | 'roof' | 'site';

/** Plan (x, y) → scene (x, z). */
export function fromPlan(x: number, y: number): [number, number] {
  return [W / 2 - y, x - D / 2];
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
  const [xa, za] = fromPlan(rect.x0, rect.y0);
  const [xb, zb] = fromPlan(rect.x1, rect.y1);
  return {
    id: rect.id,
    zone: rect.zone,
    level,
    x0: Math.min(xa, xb),
    x1: Math.max(xa, xb),
    z0: Math.min(za, zb),
    z1: Math.max(za, zb),
    floor: rect.floor,
    plan: rect,
  };
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
  return PLAN[level].flatMap((rect) =>
    partitionSegments(rect).map((segment) => {
      if (segment.axis === 'x') {
        // Runs along plan x (scene z) at plan y = at.
        const [x] = fromPlan(0, segment.at);
        const z0 = clampZ(fromPlan(segment.from, 0)[1]);
        const z1 = clampZ(fromPlan(segment.to, 0)[1]);
        return { x, z: (z0 + z1) / 2, w: thickness, d: Math.abs(z1 - z0) };
      }
      // Runs along plan y (scene x) at plan x = at.
      const [, z] = fromPlan(segment.at, 0);
      const x0 = clampX(fromPlan(0, segment.from)[0]);
      const x1 = clampX(fromPlan(0, segment.to)[0]);
      return { x: (x0 + x1) / 2, z, w: Math.abs(x1 - x0), d: thickness };
    }),
  ).filter((piece) => piece.w > 0.05 && piece.d > 0.05);
}

// ── Exterior walls and openings ──────────────────────────────────────────────────────────────

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
  /** Height above the floor. */
  v0: number;
  v1: number;
  kind: 'window' | 'door' | 'garage';
}

const win = (u0: number, u1: number, v0 = 0.9, v1 = 2.3): Opening => ({ u0, u1, v0, v1, kind: 'window' });
/** A window given as a span of plan y (front/back walls). */
const winY = (y0: number, y1: number, v0?: number, v1?: number) => win(W / 2 - y1, W / 2 - y0, v0, v1);
/** A window given as a span of plan x (left/right walls). */
const winX = (x0: number, x1: number, v0?: number, v1?: number) => win(x0 - D / 2, x1 - D / 2, v0, v1);

export const OPENINGS: Record<LevelKey, Record<WallSide, Opening[]>> = {
  basement: {
    front: [{ u0: W / 2 - 5.45, u1: W / 2 - 0.95, v0: 0, v1: 2.25, kind: 'garage' }],
    back: [winY(0.35, 1.15, 1.6, 2.2)],
    left: [],
    right: [winX(1.0, 2.2, 1.6, 2.2), winX(5.6, 6.6, 1.6, 2.2)],
  },
  ground: {
    front: [winY(0.55, 3.1, 1.0, 2.3)],
    back: [winY(1.3, 3.65, 0.75, 2.3)],
    left: [{ u0: 5.08 - 0.48 - D / 2, u1: 5.08 + 0.48 - D / 2, v0: 0, v1: 2.2, kind: 'door' }, winX(1.2, 2.3, 1.3, 2.2), winX(5.8, 6.4, 1.0, 2.2)],
    right: [winX(0.6, 2.5, 0.9, 2.3), winX(3.8, 5.6, 0.9, 2.3), winX(8.0, 9.3, 1.3, 2.2)],
  },
  upper: {
    front: [winY(0.7, 3.5, 0.9, 2.3), winY(5.2, 6.0, 1.5, 2.2)],
    back: [winY(1.6, 3.1, 1.25, 2.3)],
    left: [winX(1.0, 2.2, 1.3, 2.2), winX(5.0, 6.6, 0.9, 2.3)],
    right: [winX(0.8, 2.5, 0.9, 2.3), winX(4.2, 5.0, 1.5, 2.2), winX(7.3, 9.2, 0.9, 2.3)],
  },
};

export interface WallPiece {
  /** Box center x/z and extent, level-local. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Vertical span. */
  v0: number;
  v1: number;
}

/** Splits a wall into solid boxes around its openings, so windows are real holes. */
export function wallPieces(side: WallSide, openings: readonly Opening[]): WallPiece[] {
  const along = side === 'front' || side === 'back';
  const length = along ? W : D - 2 * T;
  const start = -length / 2;
  const sorted = [...openings].sort((a, b) => a.u0 - b.u0);
  const spans: { u0: number; u1: number; v0: number; v1: number }[] = [];
  let cursor = start;
  for (const o of sorted) {
    if (o.u0 > cursor) spans.push({ u0: cursor, u1: o.u0, v0: 0, v1: WALL });
    if (o.v0 > 0) spans.push({ u0: o.u0, u1: o.u1, v0: 0, v1: o.v0 });
    if (o.v1 < WALL) spans.push({ u0: o.u0, u1: o.u1, v0: o.v1, v1: WALL });
    cursor = o.u1;
  }
  if (cursor < -start) spans.push({ u0: cursor, u1: -start, v0: 0, v1: WALL });
  const offset = along ? (side === 'front' ? D / 2 - T / 2 : -D / 2 + T / 2) : side === 'right' ? W / 2 - T / 2 : -W / 2 + T / 2;
  return spans.map(({ u0, u1, v0, v1 }) =>
    along
      ? { x: (u0 + u1) / 2, z: offset, w: u1 - u0, d: T, v0, v1 }
      : { x: offset, z: (u0 + u1) / 2, w: T, d: u1 - u0, v0, v1 },
  );
}

// ── Outside: yard behind the house, drive in front, side stair to the entry ─────────────────

export const YARD = { x0: -W / 2 - 0.9, x1: W / 2 + 0.9, z0: -D / 2 - 6.4, z1: -D / 2 - 0.35 } as const;
export const DRIVE = { x0: W / 2 - 5.6, x1: W / 2 - 0.8, z0: D / 2, z1: D / 2 + 7.5 } as const;
/** Side stair from grade up to the entry door on the ground floor's left wall. */
export const STAIR = { x0: -W / 2 - 1.35, x1: -W / 2 - 0.05, landing: [5.08 - 0.75 - D / 2, 5.08 + 0.65 - D / 2] as const, steps: 11, run: 0.29 } as const;

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

/** Where each fixture is, for highlight rings and labels. */
export const FIXTURE_ANCHORS: Record<FixtureId, Anchor[]> = {
  'garage-door': [{ layer: 'basement', point: [W / 2 - 3.2, 1.2, D / 2 + 0.06], normal: [0, 1] }],
  car: planFixture('car'),
  'heat-pump': planFixture('heat-pump'),
  'water-heater': planFixture('water-heater'),
  'air-exchanger': planFixture('air-exchanger'),
  'sump-pump': planFixture('sump-pump'),
  'electrical-panel': planFixture('electrical-panel'),
  'water-main': planFixture('water-main'),
  dryer: planFixture('dryer'),
  washer: planFixture('washer'),
  'dryer-vent': [
    { layer: 'site', point: [W / 2 - 3.55, 1.2, -D / 2 - 0.12], normal: [0, -1] },
    ...planFixture('dryer-vent'),
  ],
  'front-door': [{ layer: 'ground', point: [-W / 2 - 0.06, 1.1, 5.08 - D / 2], normal: [-1, 0] }],
  dishwasher: planFixture('dishwasher'),
  'range-hood': planFixture('range-hood'),
  fridge: planFixture('fridge'),
  'fire-extinguisher': planFixture('fire-extinguisher'),
  'bath-fan': planFixture('bath-fan'),
  bathtub: planFixture('bathtub'),
  shower: planFixture('shower'),
  gutters: [
    { layer: 'roof', point: [W / 2 + ROOF.overhang + 0.06, -EAVE_DROP - 0.06, 1.2], normal: [1, 0] },
    { layer: 'roof', point: [-W / 2 - ROOF.overhang - 0.06, -EAVE_DROP - 0.06, 1.2], normal: [-1, 0] },
  ],
  lawn: [{ layer: 'site', point: [0, 0.12, (YARD.z0 + YARD.z1) / 2 - 0.4] }],
  'heat-pump-outdoor': [{ layer: 'site', point: [W / 2 - 1.1, 0.5, -D / 2 - 1.15] }],
  'hose-bib': [{ layer: 'site', point: [W / 2 - 5.5, 0.45, -D / 2 - 0.1], normal: [0, -1] }],
  'smoke-detectors': planFixture('smoke-detectors'),
  windows: [
    { layer: 'upper', point: [W / 2 - 2.1, 1.6, D / 2 + 0.05], normal: [0, 1] },
    { layer: 'ground', point: [W / 2 + 0.05, 1.6, 4.7 - D / 2], normal: [1, 0] },
    { layer: 'basement', point: [W / 2 + 0.05, 1.9, 1.6 - D / 2], normal: [1, 0] },
  ],
};

/** Where a zone's label points. */
export function zoneAnchor(zone: ZoneId): Anchor | null {
  const found = zone3d(zone);
  if (found) return { layer: found.level, point: [found.center[0], 0.15, found.center[1]] };
  if (zone === 'roof') return { layer: 'roof', point: [W / 4 + 0.1, ROOF.rise * 0.52, 1.6], normal: [1, 0] };
  // The corner of the yard that shows past the house from the street side.
  if (zone === 'backyard') return { layer: 'site', point: [W / 2 + 0.45, 0.15, -D / 2 - 1.6] };
  if (zone === 'house') return { layer: 'ground', point: [-W / 2 - 0.7, 0.2, 5.08 - D / 2], normal: [-1, 0] };
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

export interface Framing {
  /** Region that has to fit on screen (world coordinates). */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** Camera angle around the house (0 = straight at the front, positive toward the right side). */
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
    return {
      min: [x0, base - 0.2, z0],
      max: [x1, base + 2.0, z1],
      azimuth: 22 * DEG,
      polar: 44 * DEG,
    };
  }
  switch (view.kind) {
    case 'exploded':
      return { min: [-W / 2 - 0.3, -0.4, -D / 2], max: [W / 2 + 0.3, ROOF.base + EXPLODE * 3.3 + ROOF.rise, D / 2], azimuth: 32 * DEG, polar: 68 * DEG };
    case 'level': {
      const base = levelBase(view.level);
      return { min: [-W / 2 - 0.2, base - 0.3, -D / 2], max: [W / 2 + 0.2, base + 2.0, D / 2], azimuth: 24 * DEG, polar: 47 * DEG };
    }
    case 'roof':
      return { min: [-W / 2 - 0.5, ROOF.base - 0.6, -D / 2 - 0.5], max: [W / 2 + 0.5, RIDGE_Y + 0.2, D / 2 + 0.5], azimuth: 34 * DEG, polar: 60 * DEG };
    case 'yard':
      return { min: [YARD.x0, 0, YARD.z0], max: [YARD.x1, 3.4, -D / 2 + 1.5], azimuth: 158 * DEG, polar: 58 * DEG };
    default:
      return { min: [STAIR.x0 - 0.3, 0, -D / 2 - 0.6], max: [W / 2 + 0.6, RIDGE_Y + 0.3, D / 2 + 2.6], azimuth: 34 * DEG, polar: 80 * DEG };
  }
}
