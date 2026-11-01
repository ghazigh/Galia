import type { FixtureId, ZoneId } from '@shared/types';
import { D, T, W, WALL } from './layout';

// Furniture and fixtures as data. Positions are level-local (y = 0 is the floor surface) except
// for site parts, which are world positions at grade. Boxes and cylinders stand on `p`.

export type MaterialKey =
  | 'linen'
  | 'pillow'
  | 'sofa'
  | 'cushion'
  | 'wood'
  | 'woodDark'
  | 'woodLight'
  | 'cabinet'
  | 'counter'
  | 'appliance'
  | 'steel'
  | 'black'
  | 'screen'
  | 'plant'
  | 'pot'
  | 'rug'
  | 'rugBlue'
  | 'car'
  | 'tire'
  | 'carGlass'
  | 'rim'
  | 'heatPump'
  | 'tank'
  | 'copper'
  | 'red'
  | 'panel'
  | 'duct'
  | 'porcelain'
  | 'water'
  | 'sage'
  | 'terracotta'
  | 'lavender'
  | 'concrete'
  | 'mat'
  | 'lamp'
  | 'glassPane'
  | 'leaves'
  | 'leavesDark'
  | 'trunk'
  | 'fence'
  | 'paver'
  | 'grille'
  | 'hose';

export interface BoxPart {
  kind: 'box';
  p: readonly [number, number, number];
  s: readonly [number, number, number];
  m: MaterialKey;
  /** Corner radius (rounded box). */
  r?: number;
  f?: FixtureId;
  ry?: number;
}

export interface CylPart {
  kind: 'cyl';
  p: readonly [number, number, number];
  r: number;
  h: number;
  m: MaterialKey;
  /** Lying along x or z instead of standing (p is then the center). */
  axis?: 'x' | 'z';
  f?: FixtureId;
  seg?: number;
}

export interface BallPart {
  kind: 'ball';
  p: readonly [number, number, number];
  r: number;
  m: MaterialKey;
  /** Vertical squash. */
  sy?: number;
  /** Faceted, low-poly look (foliage). */
  facet?: boolean;
}

export type Part = BoxPart | CylPart | BallPart;

const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: MaterialKey, extra: Partial<BoxPart> = {}): BoxPart => ({
  kind: 'box',
  p: [x, y, z],
  s: [w, h, d],
  m,
  ...extra,
});
const cyl = (x: number, y: number, z: number, r: number, h: number, m: MaterialKey, extra: Partial<CylPart> = {}): CylPart => ({
  kind: 'cyl',
  p: [x, y, z],
  r,
  h,
  m,
  ...extra,
});
const ball = (x: number, y: number, z: number, r: number, m: MaterialKey, extra: Partial<BallPart> = {}): BallPart => ({
  kind: 'ball',
  p: [x, y, z],
  r,
  m,
  ...extra,
});

const BACK = -D / 2 + T; // inside face of the back wall
const FRONT = D / 2 - T;

function bed(x: number, z: number, width: number, duvet: MaterialKey, frame: MaterialKey = 'wood'): Part[] {
  const length = 2.05;
  const head = z - length / 2;
  return [
    box(x, 0, z, width + 0.08, 0.28, length + 0.04, frame, { r: 0.03 }),
    box(x, 0.28, z + 0.02, width, 0.22, length - 0.04, 'linen', { r: 0.07 }),
    box(x, 0.43, z + 0.32, width + 0.04, 0.09, length * 0.62, duvet, { r: 0.04 }),
    ...(width > 1.2
      ? [box(x - width / 4, 0.48, head + 0.3, width / 2 - 0.12, 0.13, 0.34, 'pillow', { r: 0.06 }), box(x + width / 4, 0.48, head + 0.3, width / 2 - 0.12, 0.13, 0.34, 'pillow', { r: 0.06 })]
      : [box(x, 0.48, head + 0.3, width - 0.2, 0.13, 0.34, 'pillow', { r: 0.06 })]),
    box(x, 0, head - 0.06, width + 0.16, 0.95, 0.08, 'woodDark', { r: 0.02 }),
  ];
}

function plant(x: number, z: number, size = 1): Part[] {
  return [cyl(x, 0, z, 0.17 * size, 0.36 * size, 'pot'), ball(x, 0.36 * size + 0.28 * size, z, 0.32 * size, 'plant', { facet: true, sy: 1.1 })];
}

function lampShade(x: number, y: number, z: number): Part[] {
  return [cyl(x, 0, z, 0.02, y, 'black'), cyl(x, y, z, 0.17, 0.22, 'lamp', { seg: 20 })];
}

function bedsideLamp(x: number, z: number): Part[] {
  return [cyl(x, 0.5, z, 0.02, 0.14, 'black'), cyl(x, 0.62, z, 0.12, 0.16, 'lamp', { seg: 18 })];
}

function chair(x: number, z: number, facing: 'n' | 's' | 'e' | 'w'): Part[] {
  const back: Record<typeof facing, [number, number, number, number]> = {
    n: [x, z + 0.2, 0.42, 0.05],
    s: [x, z - 0.2, 0.42, 0.05],
    e: [x - 0.2, z, 0.05, 0.42],
    w: [x + 0.2, z, 0.05, 0.42],
  };
  const [bx, bz, bw, bd] = back[facing];
  return [box(x, 0, z, 0.42, 0.45, 0.42, 'woodDark', { r: 0.02 }), box(bx, 0.45, bz, bw, 0.42, bd, 'woodDark')];
}

// ── Rooms ─────────────────────────────────────────────────────────────────────────────────────

const ROOM_PARTS: Partial<Record<ZoneId, Part[]>> = {
  garage: [
    // A long, low red car parked nose to the door.
    box(-3.4, 0.24, 0.45, 1.92, 0.56, 4.62, 'car', { r: 0.24, f: 'car' }),
    box(-3.4, 0.7, 0.25, 1.58, 0.46, 2.55, 'carGlass', { r: 0.22, f: 'car' }),
    ...[-0.9, 0.9].flatMap((dx) =>
      [-1.35, 1.6].map((dz) => cyl(-3.4 + dx, 0.34, 0.45 + dz, 0.34, 0.26, 'tire', { axis: 'x', seg: 24 })),
    ),
    ...[-1.02, 1.02].flatMap((dx) => [-1.35, 1.6].map((dz) => cyl(-3.4 + dx, 0.34, 0.45 + dz, 0.2, 0.04, 'rim', { axis: 'x', seg: 20 }))),
    // Shelving and a workbench.
    box(-W / 2 + T + 0.24, 0, -1.4, 0.46, 1.95, 2.6, 'woodDark'),
    ...[0.5, 1.05, 1.6].map((y) => box(-W / 2 + T + 0.26, y, -1.4, 0.4, 0.03, 2.5, 'wood')),
    box(-W / 2 + T + 0.26, 0.53, -2.1, 0.32, 0.3, 0.42, 'cabinet'),
    box(-W / 2 + T + 0.26, 1.08, -0.9, 0.32, 0.26, 0.5, 'terracotta'),
    box(-W / 2 + T + 0.26, 1.63, -1.6, 0.32, 0.22, 0.6, 'sage'),
    box(-1.4, 0, BACK + 0.32, 1.7, 0.88, 0.62, 'woodDark'),
    box(-1.4, 0.88, BACK + 0.32, 1.76, 0.05, 0.66, 'wood'),
    cyl(-5.75, 0, 3.4, 0.3, 1.0, 'black'),
    cyl(-5.05, 0, 3.4, 0.3, 1.0, 'sage'),
  ],
  mechanical: [
    // Heat pump air handler with its supply duct.
    box(1.75, 0, BACK + 0.36, 0.78, 1.65, 0.66, 'heatPump', { r: 0.03, f: 'heat-pump' }),
    box(1.75, 1.65, BACK + 0.36, 0.5, WALL - 1.65, 0.5, 'duct', { f: 'heat-pump' }),
    box(1.75, 0.35, BACK + 0.695, 0.6, 0.5, 0.02, 'grille', { f: 'heat-pump' }),
    // Hot water tank.
    cyl(3.15, 0, BACK + 0.42, 0.34, 1.55, 'tank', { f: 'water-heater', seg: 28 }),
    cyl(3.0, 1.55, BACK + 0.42, 0.035, WALL - 1.55, 'copper'),
    cyl(3.3, 1.55, BACK + 0.42, 0.035, WALL - 1.55, 'copper'),
    // Main water shutoff: a copper riser with a red valve.
    cyl(4.45, 0, BACK + 0.1, 0.045, 1.2, 'copper', { f: 'water-main' }),
    box(4.45, 0.42, BACK + 0.17, 0.2, 0.06, 0.1, 'red', { f: 'water-main' }),
    // Electrical panel.
    box(5.55, 1.0, BACK + 0.06, 0.62, 0.86, 0.12, 'panel', { f: 'electrical-panel' }),
    // Washer and dryer along the right wall, with the dryer's duct to the outside.
    box(W / 2 - T - 0.36, 0, -1.25, 0.68, 0.9, 0.66, 'appliance', { r: 0.03, f: 'washer' }),
    cyl(W / 2 - T - 0.71, 0.5, -1.25, 0.21, 0.03, 'carGlass', { axis: 'x', f: 'washer' }),
    box(W / 2 - T - 0.36, 0, -2.25, 0.68, 0.9, 0.66, 'appliance', { r: 0.03, f: 'dryer' }),
    cyl(W / 2 - T - 0.71, 0.5, -2.25, 0.21, 0.03, 'black', { axis: 'x', f: 'dryer' }),
    cyl(W / 2 - T - 0.08, 0.9, -2.25, 0.075, 0.32, 'duct', { f: 'dryer-vent' }),
    cyl(W / 2 - T - 0.08, 1.2, -2.25, 0.075, 0.16, 'duct', { axis: 'x', f: 'dryer-vent' }),
    box(1.0, 0, 2.6, 0.55, 0.55, 0.42, 'rugBlue', { r: 0.05 }),
  ],
  entry: [
    // Stair up along the back wall.
    ...Array.from({ length: 9 }, (_, i) => box(-3.98 - i * 0.26 - 0.13, 0, BACK + 0.55, 0.26, 0.3 * (i + 1), 1.1, i % 2 ? 'wood' : 'woodLight')),
    box(-4.9, 0, FRONT - 0.24, 1.15, 0.45, 0.4, 'wood', { r: 0.03 }),
    box(-W / 2 + T + 0.45, 0, 1.2, 0.8, 0.012, 1.1, 'mat'),
    cyl(-W / 2 + T + 0.3, 0, 3.1, 0.025, 1.7, 'black'),
    ball(-W / 2 + T + 0.3, 1.62, 3.1, 0.13, 'terracotta'),
    ...plant(-4.15, 2.1, 1.1),
  ],
  living: [
    box(-1.0, 0, 0.35, 3.1, 0.012, 2.4, 'rug'),
    // Sofa against the back wall.
    box(-1.0, 0, BACK + 0.5, 2.8, 0.42, 0.98, 'sofa', { r: 0.08 }),
    box(-1.0, 0.36, BACK + 0.14, 2.8, 0.5, 0.26, 'sofa', { r: 0.1 }),
    box(-2.3, 0.36, BACK + 0.55, 0.22, 0.24, 0.92, 'sofa', { r: 0.08 }),
    box(0.3, 0.36, BACK + 0.55, 0.22, 0.24, 0.92, 'sofa', { r: 0.08 }),
    box(-1.62, 0.4, BACK + 0.56, 1.18, 0.14, 0.7, 'cushion', { r: 0.06 }),
    box(-0.38, 0.4, BACK + 0.56, 1.18, 0.14, 0.7, 'cushion', { r: 0.06 }),
    box(-1.0, 0, -1.55, 1.25, 0.38, 0.62, 'woodDark', { r: 0.04 }),
    box(-0.75, 0.38, -1.55, 0.32, 0.03, 0.24, 'terracotta'),
    // Lounge chair facing the sofa, lamp and plants.
    box(0.85, 0, 1.2, 0.85, 0.42, 0.85, 'cushion', { r: 0.12 }),
    box(0.85, 0.32, 1.55, 0.85, 0.5, 0.2, 'cushion', { r: 0.08 }),
    ...lampShade(-3.2, 1.45, BACK + 0.3),
    ...plant(1.25, BACK + 0.35, 1.25),
    box(-3.35, 0, 1.0, 0.36, 1.6, 1.4, 'woodLight'),
  ],
  kitchen: [
    // Counter run: sink under the window, dishwasher, range under the hood, fridge at the end.
    box(3.75, 0, BACK + 0.31, 3.6, 0.86, 0.62, 'cabinet'),
    box(3.75, 0.86, BACK + 0.33, 3.66, 0.05, 0.66, 'counter'),
    box(3.15, 0.875, BACK + 0.3, 0.6, 0.04, 0.4, 'steel'),
    cyl(3.15, 0.91, BACK + 0.08, 0.025, 0.32, 'steel'),
    box(3.85, 0.05, BACK + 0.625, 0.58, 0.76, 0.02, 'steel', { f: 'dishwasher' }),
    box(4.95, 0.06, BACK + 0.625, 0.74, 0.68, 0.02, 'black'),
    box(4.95, 0.9, BACK + 0.33, 0.72, 0.02, 0.55, 'black'),
    box(4.95, 1.82, BACK + 0.25, 0.82, 0.3, 0.5, 'steel', { f: 'range-hood' }),
    box(4.95, 2.12, BACK + 0.15, 0.3, WALL - 2.12, 0.3, 'steel', { f: 'range-hood' }),
    box(6.0, 0, BACK + 0.36, 0.74, 1.95, 0.72, 'appliance', { r: 0.03, f: 'fridge' }),
    box(5.79, 0.9, BACK + 0.73, 0.03, 0.6, 0.03, 'steel', { f: 'fridge' }),
    // Dining table with chairs and a pendant.
    box(3.7, 0.7, 1.35, 1.6, 0.05, 0.9, 'wood', { r: 0.02 }),
    ...[-0.7, 0.7].flatMap((dx) => [-0.38, 0.38].map((dz) => box(3.7 + dx, 0, 1.35 + dz, 0.05, 0.7, 0.05, 'woodDark'))),
    ...chair(3.3, 0.6, 'n'),
    ...chair(4.1, 0.6, 'n'),
    ...chair(3.3, 2.1, 's'),
    ...chair(4.1, 2.1, 's'),
    cyl(3.7, 1.9, 1.35, 0.008, WALL - 1.9, 'black'),
    cyl(3.7, 1.78, 1.35, 0.2, 0.14, 'lamp', { seg: 20 }),
    // Fire extinguisher by the doorway.
    cyl(2.03, 0.12, 3.4, 0.085, 0.46, 'red', { f: 'fire-extinguisher', seg: 16 }),
    cyl(2.03, 0.58, 3.4, 0.035, 0.08, 'black', { f: 'fire-extinguisher' }),
    ...plant(6.05, 3.5, 0.9),
  ],
  bedroom1: [
    ...bed(-4.45, BACK + 1.08, 1.62, 'sage'),
    box(-5.62, 0, BACK + 0.25, 0.45, 0.5, 0.4, 'woodLight'),
    box(-3.28, 0, BACK + 0.25, 0.45, 0.5, 0.4, 'woodLight'),
    ...bedsideLamp(-5.62, BACK + 0.25),
    ...bedsideLamp(-3.28, BACK + 0.25),
    box(-W / 2 + T + 0.31, 0, 1.75, 0.6, 2.1, 1.7, 'woodLight'),
    box(-4.4, 0, 0.9, 2.2, 0.012, 1.5, 'rug'),
    ...plant(-3.05, 3.4, 1.0),
  ],
  bathroom: [
    box(-1.1, 0, BACK + 0.4, 1.7, 0.55, 0.78, 'porcelain', { r: 0.12, f: 'bathtub' }),
    box(-1.1, 0.5, BACK + 0.4, 1.46, 0.03, 0.56, 'water', { r: 0.1, f: 'bathtub' }),
    // Shower: tray, glass and head in the front corner.
    box(-1.72, 0, FRONT - 0.48, 0.92, 0.06, 0.92, 'porcelain', { f: 'shower' }),
    box(-1.27, 0.06, FRONT - 0.48, 0.02, 1.9, 0.9, 'glassPane', { f: 'shower' }),
    cyl(-2.12, 1.85, FRONT - 0.48, 0.07, 0.03, 'steel', { f: 'shower' }),
    // Toilet and vanity against the partition.
    box(0.0, 0, -1.4, 0.55, 0.42, 0.4, 'porcelain', { r: 0.12 }),
    box(0.06, 0.42, -1.4, 0.2, 0.38, 0.42, 'porcelain', { r: 0.04 }),
    box(-0.05, 0, 1.05, 0.5, 0.82, 1.0, 'woodLight'),
    box(-0.05, 0.82, 1.05, 0.52, 0.05, 1.02, 'porcelain'),
    box(0.11, 1.15, 1.05, 0.03, 0.75, 0.75, 'screen'),
    box(-1.1, WALL - 0.04, -2.6, 0.32, 0.04, 0.32, 'grille', { f: 'bath-fan' }),
    box(-0.9, 0, 0.0, 0.6, 0.012, 0.9, 'rugBlue'),
  ],
  bedroom2: [
    ...bed(1.5, BACK + 1.08, 1.4, 'lavender'),
    box(2.98, 0, 1.6, 0.56, 0.74, 1.15, 'wood'),
    ...chair(2.55, 1.6, 'e'),
    box(2.98, 0.74, 1.7, 0.06, 0.32, 0.5, 'screen'),
    ...plant(0.65, 3.45, 0.9),
  ],
  bedroom3: [
    ...bed(5.75, -1.8, 1.0, 'terracotta'),
    box(4.35, 0, BACK + 0.2, 0.95, 1.85, 0.36, 'woodLight'),
    ...[0.6, 1.2].map((y) => box(4.35, y, BACK + 0.22, 0.88, 0.03, 0.32, 'woodDark')),
    box(4.45, 0, FRONT - 0.33, 1.3, 0.74, 0.6, 'wood'),
    ...chair(4.45, FRONT - 0.85, 's'),
    box(4.45, 0.74, FRONT - 0.18, 0.62, 0.38, 0.05, 'screen'),
  ],
};

/** Smoke and CO alarms, one per storey (they follow the house-wide "smoke detectors" fixture). */
const ALARMS: Partial<Record<ZoneId, Part[]>> = {
  mechanical: [cyl(3.6, WALL - 0.045, 0.2, 0.1, 0.045, 'porcelain', { f: 'smoke-detectors' })],
  entry: [cyl(-5.3, WALL - 0.045, -1.0, 0.1, 0.045, 'porcelain', { f: 'smoke-detectors' })],
  bedroom1: [cyl(-4.6, WALL - 0.045, 0.4, 0.1, 0.045, 'porcelain', { f: 'smoke-detectors' })],
};

export function roomParts(zone: ZoneId): Part[] {
  return [...(ROOM_PARTS[zone] ?? []), ...(ALARMS[zone] ?? [])];
}

// ── Outside ───────────────────────────────────────────────────────────────────────────────────

const YARD_X0 = W / 2 + 0.7;
const YARD_X1 = W / 2 + 8.6;
const YARD_Z0 = -D / 2 - 1.6;
const YARD_Z1 = D / 2 + 1.2;

export function siteParts(): Part[] {
  const fence: Part[] = [];
  for (let i = 0; i < 4; i += 1) {
    const y = 0.18 + i * 0.24;
    fence.push(box((YARD_X0 + YARD_X1) / 2 + 0.3, y, YARD_Z0, YARD_X1 - YARD_X0 + 0.6, 0.15, 0.05, 'fence'));
    fence.push(box(YARD_X1, y, (YARD_Z0 + YARD_Z1) / 2, 0.05, 0.15, YARD_Z1 - YARD_Z0, 'fence'));
  }
  for (let x = YARD_X0; x <= YARD_X1 + 0.01; x += (YARD_X1 - YARD_X0) / 6) fence.push(box(x, 0, YARD_Z0, 0.08, 1.12, 0.08, 'black'));
  for (let z = YARD_Z0; z <= YARD_Z1 + 0.01; z += (YARD_Z1 - YARD_Z0) / 5) fence.push(box(YARD_X1, 0, z, 0.08, 1.12, 0.08, 'black'));

  const pavers: Part[] = [];
  for (let i = 0; i < 4; i += 1) pavers.push(box(-W / 2 - 0.7 + (i % 2) * 0.12, 0, D / 2 + 0.6 + i * 0.75, 0.9, 0.04, 0.55, 'paver'));
  for (let i = 0; i < 5; i += 1) pavers.push(cyl(YARD_X0 + 0.6 + i * 0.95, 0.06, D / 2 + 0.3 - (i % 2) * 0.25, 0.28, 0.03, 'paver', { seg: 20 }));

  return [
    // Patio with two lounge chairs.
    box((YARD_X0 + YARD_X0 + 3.0) / 2, 0.06, -2.4, 3.0, 0.06, 2.8, 'concrete'),
    box(YARD_X0 + 0.9, 0.12, -2.6, 0.65, 0.32, 1.7, 'woodLight', { r: 0.04 }),
    box(YARD_X0 + 2.0, 0.12, -2.6, 0.65, 0.32, 1.7, 'woodLight', { r: 0.04 }),
    box(YARD_X0 + 0.9, 0.44, -3.25, 0.62, 0.08, 0.5, 'linen', { r: 0.03 }),
    box(YARD_X0 + 2.0, 0.44, -3.25, 0.62, 0.08, 0.5, 'linen', { r: 0.03 }),
    // Heat pump outdoor unit on its pad, against the house.
    box(W / 2 + 0.62, 0.06, 0.2, 0.62, 0.08, 1.2, 'concrete'),
    box(W / 2 + 0.6, 0.14, 0.2, 0.46, 0.82, 1.0, 'heatPump', { r: 0.03, f: 'heat-pump-outdoor' }),
    cyl(W / 2 + 0.84, 0.55, 0.2, 0.3, 0.02, 'grille', { axis: 'x', seg: 28, f: 'heat-pump-outdoor' }),
    // Dryer vent hood and outdoor faucet with a hose reel on the right wall.
    box(W / 2 + 0.09, 1.08, -2.25, 0.18, 0.24, 0.28, 'steel', { f: 'dryer-vent' }),
    cyl(W / 2 + 0.08, 0.5, 2.7, 0.04, 0.14, 'copper', { axis: 'x', f: 'hose-bib' }),
    cyl(W / 2 + 0.3, 0.32, 3.25, 0.26, 0.14, 'hose', { axis: 'x', seg: 24, f: 'hose-bib' }),
    // Tree and shrubs.
    cyl(12.7, 0, -3.4, 0.15, 2.1, 'trunk', { seg: 10 }),
    ball(12.7, 2.7, -3.4, 1.25, 'leaves', { facet: true }),
    ball(12.15, 2.25, -2.85, 0.85, 'leavesDark', { facet: true }),
    ball(13.25, 2.35, -3.0, 0.8, 'leaves', { facet: true }),
    ball(13.9, 0.45, 3.4, 0.5, 'leavesDark', { facet: true }),
    ball(13.2, 0.38, 3.75, 0.42, 'leaves', { facet: true }),
    ball(W / 2 + 0.55, 0.36, 3.6, 0.42, 'leaves', { facet: true }),
    ball(-W / 2 - 0.55, 0.4, -2.6, 0.5, 'leavesDark', { facet: true }),
    ball(-W / 2 - 0.5, 0.34, -1.6, 0.4, 'leaves', { facet: true }),
    // Yard light post.
    cyl(YARD_X0 + 3.6, 0, D / 2 + 0.6, 0.04, 1.0, 'black'),
    cyl(YARD_X0 + 3.6, 1.0, D / 2 + 0.6, 0.08, 0.16, 'lamp', { seg: 16 }),
    ...fence,
    ...pavers,
  ];
}

/** Wall lights that glow at night: by the front door and the garage. */
export const SCONCES: readonly (readonly [number, number, number])[] = [
  [-W / 2 - 0.08, 2.9 + 2.35, 2.05],
  [-6.05, 2.45, D / 2 + 0.08],
  [-0.85, 2.45, D / 2 + 0.08],
];
