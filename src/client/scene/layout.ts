import type { FixtureId, ZoneId } from '@shared/types';
import { ROOMS as PLAN_ROOMS, W as PLAN_W, type LevelKey } from '../house/model';
import type { FloorMaterial } from '../house/palette';

// The 3D house. World units are meters, y is up, the house is centered on x/z and its front faces
// +z (toward the default camera). Each storey is drawn in level-local coordinates: y = 0 is the
// floor surface. Rooms keep the order and proportions of the illustrated plan (src/client/house).

export const W = 13.2; // width (x)
export const D = 8.4; // depth (z)
export const H = 2.9; // floor to floor
export const SLAB = 0.24;
export const WALL = H - SLAB; // wall height inside a storey
export const T = 0.2; // wall thickness
export const ROOF = { base: 3 * H, rise: 3.0, overhang: 0.45 } as const;
export const RIDGE_Y = ROOF.base + ROOF.rise;
export const EAVE_DROP = (ROOF.overhang * ROOF.rise) / (D / 2);

export const LEVELS: readonly LevelKey[] = ['basement', 'ground', 'upper'];
export type Layer = LevelKey | 'roof' | 'site';

export function levelIndex(level: LevelKey): number {
  return LEVELS.indexOf(level);
}

/** Floor height of a storey with the house assembled. */
export function levelBase(level: LevelKey): number {
  return levelIndex(level) * H;
}

/** Plan x (0–12) → world x. */
const px = (x: number) => (x / PLAN_W) * W - W / 2;

export interface Room3D {
  zone: ZoneId;
  level: LevelKey;
  x0: number;
  x1: number;
  floor: FloorMaterial;
}

export const ROOMS: Record<LevelKey, Room3D[]> = {
  basement: PLAN_ROOMS.basement.map((r) => ({ zone: r.zone, level: 'basement', x0: px(r.x0), x1: px(r.x1), floor: r.floor })),
  ground: PLAN_ROOMS.ground.map((r) => ({ zone: r.zone, level: 'ground', x0: px(r.x0), x1: px(r.x1), floor: r.floor })),
  upper: PLAN_ROOMS.upper.map((r) => ({ zone: r.zone, level: 'upper', x0: px(r.x0), x1: px(r.x1), floor: r.floor })),
};

export const ALL_ROOMS: readonly Room3D[] = LEVELS.flatMap((level) => ROOMS[level]);

export function room3d(zone: ZoneId): Room3D | null {
  return ALL_ROOMS.find((room) => room.zone === zone) ?? null;
}

// ── Walls and openings ────────────────────────────────────────────────────────────────────────

export type WallSide = 'front' | 'back' | 'left' | 'right';

/** Outward normal of each exterior wall (x, z). */
export const WALL_NORMAL: Record<WallSide, readonly [number, number]> = {
  front: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

export interface Opening {
  /** Along the wall: world x for front/back walls, world z for left/right walls. */
  u0: number;
  u1: number;
  /** Height above the floor. */
  v0: number;
  v1: number;
  kind: 'window' | 'door' | 'garage';
}

const win = (u0: number, u1: number, v0 = 0.9, v1 = 2.3): Opening => ({ u0, u1, v0, v1, kind: 'window' });

export const OPENINGS: Record<LevelKey, Record<WallSide, Opening[]>> = {
  basement: {
    front: [{ u0: -5.75, u1: -1.15, v0: 0, v1: 2.3, kind: 'garage' }, win(2.4, 4.8, 1.65, 2.3)],
    back: [win(-4.6, -2.6, 1.6, 2.25)],
    left: [win(-1.0, 1.0, 1.6, 2.25)],
    right: [win(1.0, 2.6, 1.6, 2.25)],
  },
  ground: {
    front: [win(-6.0, -4.45, 0.9, 2.3), win(-3.2, 1.25, 0.12, 2.45), win(2.5, 5.9, 1.05, 2.3)],
    back: [win(-2.7, 0.7, 0.9, 2.3), win(2.5, 3.8, 1.3, 2.2)],
    left: [{ u0: 0.65, u1: 1.75, v0: 0, v1: 2.25, kind: 'door' }, win(-2.6, -1.0, 1.0, 2.2)],
    right: [win(-2.1, -0.3, 1.0, 2.2)],
  },
  upper: {
    front: [win(-5.9, -3.3, 0.85, 2.3), win(-1.7, -0.7, 1.5, 2.2), win(0.85, 2.85, 0.85, 2.3), win(3.95, 6.0, 0.85, 2.3)],
    back: [win(-5.4, -3.8, 1.0, 2.2), win(1.0, 2.6, 1.0, 2.2), win(4.2, 5.8, 1.0, 2.2)],
    left: [win(-1.0, 1.0, 1.0, 2.2)],
    right: [win(-1.0, 1.0, 1.0, 2.2)],
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

// ── Yard, drive and stairs (at grade, never move) ─────────────────────────────────────────────

export const YARD = { x0: W / 2 + 0.7, x1: W / 2 + 8.6, z0: -D / 2 - 1.6, z1: D / 2 + 1.2 } as const;
export const DRIVE = { x0: -5.9, x1: -1.0, z0: D / 2, z1: D / 2 + 7.5 } as const;
/** Side stair from the drive up to the front door on the ground floor's left wall. */
export const STAIR = { x0: -W / 2 - 1.35, x1: -W / 2 - 0.05, landing: [0.35, 2.05] as const, steps: 11, run: 0.31 } as const;

// ── Anchors ───────────────────────────────────────────────────────────────────────────────────

export interface Anchor {
  layer: Layer;
  /** Level-local position (site anchors are world positions). */
  point: readonly [number, number, number];
  /** Outward direction of the surface it sits on (x, z); labels fade when it faces away. */
  normal?: readonly [number, number];
}

/** Where each fixture is, for highlight rings and labels. */
export const FIXTURE_ANCHORS: Record<FixtureId, Anchor[]> = {
  'garage-door': [{ layer: 'basement', point: [-3.45, 1.25, D / 2 + 0.06], normal: [0, 1] }],
  car: [{ layer: 'basement', point: [-3.4, 1.05, 0.5] }],
  'heat-pump': [{ layer: 'basement', point: [1.75, 1.15, -D / 2 + 0.62] }],
  'water-heater': [{ layer: 'basement', point: [3.15, 1.0, -D / 2 + 0.66] }],
  washer: [{ layer: 'basement', point: [W / 2 - 0.55, 0.55, -1.25] }],
  dryer: [{ layer: 'basement', point: [W / 2 - 0.55, 0.55, -2.25] }],
  'dryer-vent': [
    { layer: 'basement', point: [W / 2 + 0.1, 1.2, -2.25], normal: [1, 0] },
    { layer: 'basement', point: [W / 2 - 0.35, 1.2, -2.25] },
  ],
  'electrical-panel': [{ layer: 'basement', point: [5.55, 1.45, -D / 2 + 0.26] }],
  'water-main': [{ layer: 'basement', point: [4.45, 0.45, -D / 2 + 0.3] }],
  'front-door': [{ layer: 'ground', point: [-W / 2 - 0.06, 1.1, 1.2], normal: [-1, 0] }],
  dishwasher: [{ layer: 'ground', point: [3.85, 0.45, -D / 2 + 0.6] }],
  'range-hood': [{ layer: 'ground', point: [4.95, 2.0, -D / 2 + 0.45] }],
  fridge: [{ layer: 'ground', point: [6.0, 1.0, -D / 2 + 0.62] }],
  'fire-extinguisher': [{ layer: 'ground', point: [2.0, 0.45, 3.4] }],
  'bath-fan': [{ layer: 'upper', point: [-1.1, WALL - 0.04, -2.6] }],
  bathtub: [{ layer: 'upper', point: [-1.1, 0.35, -D / 2 + 0.66] }],
  shower: [{ layer: 'upper', point: [-1.75, 1.0, 3.35] }],
  gutters: [
    { layer: 'roof', point: [-3, -EAVE_DROP - 0.05, D / 2 + ROOF.overhang + 0.06], normal: [0, 1] },
    { layer: 'roof', point: [3.5, -EAVE_DROP - 0.05, D / 2 + ROOF.overhang + 0.06], normal: [0, 1] },
  ],
  lawn: [{ layer: 'site', point: [10.7, 0.12, 0.6] }],
  'heat-pump-outdoor': [{ layer: 'site', point: [W / 2 + 0.75, 0.5, 0.2], normal: [1, 0] }],
  'hose-bib': [{ layer: 'site', point: [W / 2 + 0.08, 0.5, 2.7], normal: [1, 0] }],
  'smoke-detectors': [
    { layer: 'upper', point: [-4.6, WALL - 0.04, 0.4] },
    { layer: 'ground', point: [-5.3, WALL - 0.04, -1.0] },
    { layer: 'basement', point: [3.6, WALL - 0.04, 0.2] },
  ],
  windows: [
    { layer: 'upper', point: [-4.6, 1.6, D / 2 + 0.05], normal: [0, 1] },
    { layer: 'ground', point: [-1.0, 1.3, D / 2 + 0.05], normal: [0, 1] },
    { layer: 'upper', point: [5.0, 1.6, D / 2 + 0.05], normal: [0, 1] },
  ],
};

/** Where a zone's label points. */
export function zoneAnchor(zone: ZoneId): Anchor | null {
  const room = room3d(zone);
  if (room) return { layer: room.level, point: [(room.x0 + room.x1) / 2, 0.15, 0.6] };
  if (zone === 'roof') return { layer: 'roof', point: [2.6, ROOF.rise * 0.6, D / 2 * 0.42], normal: [0, 1] };
  if (zone === 'backyard') return { layer: 'site', point: [10.6, 0.15, 0.4] };
  if (zone === 'house') return { layer: 'ground', point: [-W / 2 - 0.7, 0.2, 1.2], normal: [-1, 0] };
  return null;
}

/** Facade points for the floor labels on the outside of the house. */
export const LEVEL_FACADE: Record<LevelKey | 'roof' | 'yard', Anchor> = {
  roof: { layer: 'roof', point: [-2.4, ROOF.rise * 0.62, D / 2 * 0.38], normal: [0, 1] },
  upper: { layer: 'upper', point: [1.85, 1.55, D / 2 + 0.05], normal: [0, 1] },
  ground: { layer: 'ground', point: [-1.0, 1.25, D / 2 + 0.05], normal: [0, 1] },
  basement: { layer: 'basement', point: [-3.45, 1.15, D / 2 + 0.05], normal: [0, 1] },
  yard: { layer: 'site', point: [10.4, 0.15, 1.2] },
};

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
  const room = room3d(zone);
  return room ? { kind: 'level', level: room.level } : EXTERIOR;
}

const EXPLODE = 2.5; // extra air between storeys in the stacked view
const AWAY = 16; // how far storeys fly up when the view goes inside a lower one

/** Vertical offset of each layer (on top of its assembled height) in a view. */
export function layerLift(layer: Exclude<Layer, 'site'>, view: SceneView): number {
  if (view.kind === 'exploded') return layer === 'roof' ? EXPLODE * 3.4 : levelIndex(layer) * EXPLODE;
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
  /** Camera angle around the house (0 = straight at the front, positive toward the yard side). */
  azimuth: number;
  /** Angle from straight down (90° = level). */
  polar: number;
}

const DEG = Math.PI / 180;

export function framingFor(view: SceneView, zone: ZoneId | null = null): Framing {
  const room = zone ? room3d(zone) : null;
  if (room && view.kind === 'level') {
    const base = levelBase(room.level);
    const pad = Math.max(0, 3.4 - (room.x1 - room.x0)) / 2 + 0.5;
    return { min: [room.x0 - pad, base - 0.2, -D / 2], max: [room.x1 + pad, base + 2.2, D / 2], azimuth: 12 * DEG, polar: 47 * DEG };
  }
  switch (view.kind) {
    case 'exploded':
      return { min: [-W / 2 - 0.3, -0.4, -D / 2], max: [W / 2 + 0.3, ROOF.base + 2.5 * 3.4 + ROOF.rise, D / 2], azimuth: 24 * DEG, polar: 66 * DEG };
    case 'level': {
      const base = levelBase(view.level);
      return { min: [-W / 2 - 0.2, base - 0.3, -D / 2], max: [W / 2 + 0.2, base + 2.2, D / 2], azimuth: 16 * DEG, polar: 52 * DEG };
    }
    case 'roof':
      return { min: [-W / 2 - 0.5, ROOF.base - 0.6, -D / 2 - 0.5], max: [W / 2 + 0.5, RIDGE_Y + 0.2, D / 2 + 0.5], azimuth: 22 * DEG, polar: 62 * DEG };
    case 'yard':
      return { min: [YARD.x0 - 0.6, 0, YARD.z0], max: [YARD.x1, 3.6, YARD.z1], azimuth: 50 * DEG, polar: 60 * DEG };
    default:
      return { min: [-W / 2 - 1.5, 0, -D / 2 - 1], max: [YARD.x1 + 0.2, RIDGE_Y + 0.3, D / 2 + 2.2], azimuth: 20 * DEG, polar: 80 * DEG };
  }
}
