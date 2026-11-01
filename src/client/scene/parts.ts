import type { FixtureId } from '@shared/types';
import { ALCOVE, BAY, CORNER, D, GRADE, H, HEAT_PUMP_UNIT, HOSE_BIB_Z, W, WALL } from './layout';

// Furniture and fixtures as data. Room parts use floor-plan coordinates — the same numbers as the
// illustrated house (src/client/house/furniture.tsx): x from the back of the house to the front,
// y from the right side to the left, z up from the floor. Boxes are [corner, size]; cylinders
// stand on their base center (or lie along an axis, centered). Site parts use scene coordinates.

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
  | 'blue'
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
  | 'hose'
  | 'spruce'
  | 'cedar'
  | 'tuft'
  | 'shrubGold'
  | 'planter';

export interface BoxPart {
  kind: 'box';
  /** Corner (minimum x, y, z). */
  p: readonly [number, number, number];
  s: readonly [number, number, number];
  m: MaterialKey;
  /** Corner radius (rounded box). */
  r?: number;
  f?: FixtureId;
}

export interface CylPart {
  kind: 'cyl';
  /** Base center when standing; center when lying along an axis. */
  p: readonly [number, number, number];
  r: number;
  h: number;
  m: MaterialKey;
  axis?: 'x' | 'y';
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

const box = (
  [x, y, z]: readonly [number, number, number],
  [sx, sy, sz]: readonly [number, number, number],
  m: MaterialKey,
  extra: Partial<BoxPart> = {},
): BoxPart => ({ kind: 'box', p: [x, y, z], s: [sx, sy, sz], m, ...extra });
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

const rug = (x0: number, y0: number, x1: number, y1: number, m: MaterialKey = 'rug') => box([x0, y0, 0], [x1 - x0, y1 - y0, 0.012], m);

function plant(x: number, y: number, size = 1): Part[] {
  return [cyl(x, y, 0, 0.17 * size, 0.36 * size, 'pot'), ball(x, y, 0.36 * size + 0.28 * size, 0.3 * size, 'plant', { facet: true, sy: 1.1 })];
}

/** Bed with its head against the wall at y0, running toward +y. */
function bed(x: number, y0: number, width: number, blanket: MaterialKey, length = 2.0): Part[] {
  const parts: Part[] = [
    box([x - 0.04, y0 + 0.08, 0], [width + 0.08, length, 0.28], 'wood', { r: 0.03 }),
    box([x, y0 + 0.1, 0.28], [width, length - 0.04, 0.22], 'linen', { r: 0.07 }),
    box([x - 0.02, y0 + 0.75, 0.43], [width + 0.04, length * 0.62, 0.09], blanket, { r: 0.04 }),
    box([x - 0.08, y0, 0], [width + 0.16, 0.08, 0.95], 'woodDark', { r: 0.02 }),
  ];
  const pillows = width > 1.2 ? [x + 0.1, x + width / 2 + 0.04] : [x + 0.12];
  for (const px of pillows) parts.push(box([px, y0 + 0.18, 0.48], [width > 1.2 ? width / 2 - 0.14 : width - 0.24, 0.34, 0.13], 'pillow', { r: 0.06 }));
  return parts;
}

function nightstand(x: number, y = 0.18): Part[] {
  return [box([x, y, 0], [0.45, 0.4, 0.5], 'woodLight'), cyl(x + 0.22, y + 0.2, 0.5, 0.02, 0.14, 'black'), cyl(x + 0.22, y + 0.2, 0.62, 0.12, 0.16, 'lamp', { seg: 18 })];
}

/** Chair centered on (x, y) with its back on one side. */
function chair(x: number, y: number, back: 'x0' | 'x1' | 'y0' | 'y1', seat: MaterialKey = 'cushion'): Part[] {
  const s = 0.42;
  const backs: Record<typeof back, [number, number, number, number]> = {
    x0: [x - s / 2, y - s / 2, 0.05, s],
    x1: [x + s / 2 - 0.05, y - s / 2, 0.05, s],
    y0: [x - s / 2, y - s / 2, s, 0.05],
    y1: [x - s / 2, y + s / 2 - 0.05, s, 0.05],
  };
  const [bx, by, bw, bd] = backs[back];
  return [box([x - s / 2, y - s / 2, 0], [s, s, 0.45], seat, { r: 0.03 }), box([bx, by, 0.45], [bw, bd, 0.42], 'woodDark')];
}

/** A straight flight climbing from xBottom to xTop between y0 and y1. */
function stairs(xBottom: number, xTop: number, y0: number, y1: number, steps = 9): Part[] {
  const run = (xBottom - xTop) / steps;
  return Array.from({ length: steps }, (_, i) =>
    box([xBottom - (i + 1) * run, y0, 0], [run, y1 - y0, (WALL * (i + 1)) / steps], i % 2 ? 'wood' : 'woodLight'),
  );
}

function clothesRail(x0: number, x1: number, y: number): Part[] {
  const colors: MaterialKey[] = ['sage', 'terracotta', 'rugBlue', 'linen', 'lavender', 'sofa'];
  const out: Part[] = [cyl((x0 + x1) / 2, y, 1.75, 0.018, x1 - x0, 'steel', { axis: 'x' })];
  for (let x = x0 + 0.1, i = 0; x < x1 - 0.1; x += 0.22, i += 1) out.push(box([x, y - 0.22, 0.95], [0.06, 0.44, 0.78], colors[i % colors.length]));
  return out;
}

const alarm = (x: number, y: number): Part => cyl(x, y, WALL - 0.045, 0.1, 0.045, 'porcelain', { f: 'smoke-detectors' });

function toilet(x: number, y: number): Part[] {
  return [box([x + 0.02, y - 0.02, 0.35], [0.38, 0.18, 0.42], 'porcelain', { r: 0.04 }), box([x, y + 0.08, 0], [0.4, 0.52, 0.42], 'porcelain', { r: 0.12 })];
}

// ── Rooms (keyed by plan part) ───────────────────────────────────────────────────────────────

const ROOM_PARTS: Record<string, Part[]> = {
  // Basement
  family: [
    rug(0.6, 0.95, 2.95, 2.6),
    cyl(0.35, 0.45, 0, 0.025, 1.3, 'black'),
    cyl(0.35, 0.45, 1.3, 0.2, 0.28, 'lamp', { seg: 20 }),
    box([0.7, 0.2, 0], [0.22, 0.9, 0.62], 'sofa', { r: 0.08 }),
    box([0.92, 0.2, 0], [1.76, 0.9, 0.42], 'sofa', { r: 0.08 }),
    box([0.92, 0.2, 0.36], [1.76, 0.26, 0.5], 'sofa', { r: 0.1 }),
    box([0.94, 0.44, 0.4], [0.86, 0.62, 0.12], 'cushion', { r: 0.05 }),
    box([1.82, 0.44, 0.4], [0.84, 0.62, 0.12], 'cushion', { r: 0.05 }),
    box([2.68, 0.2, 0], [0.22, 0.9, 0.62], 'sofa', { r: 0.08 }),
    box([1.35, 1.55, 0], [0.9, 0.5, 0.3], 'woodDark'),
    box([1.25, 1.47, 0.3], [1.1, 0.66, 0.06], 'wood'),
    box([1.45, 1.6, 0.36], [0.32, 0.24, 0.05], 'terracotta'),
    ...plant(3.15, 0.45),
  ],
  laundry: [
    // Dryer, then washer, facing the family room.
    box([0.42, 3.18, 0], [0.82, 0.78, 0.92], 'appliance', { r: 0.03, f: 'dryer' }),
    cyl(0.83, 3.16, 0.55, 0.22, 0.03, 'black', { axis: 'y', f: 'dryer' }),
    box([1.3, 3.18, 0], [0.82, 0.78, 0.92], 'appliance', { r: 0.03, f: 'washer' }),
    cyl(1.71, 3.16, 0.55, 0.22, 0.03, 'carGlass', { axis: 'y', f: 'washer' }),
    // Exhaust duct up the back wall and out.
    box([0.02, 3.45, 0.9], [0.14, 0.22, 1.4], 'duct', { f: 'dryer-vent' }),
    cyl(0.3, 3.56, 0.88, 0.075, 0.5, 'duct', { axis: 'x', f: 'dryer-vent' }),
  ],
  mechanical: [
    // Heat pump air handler with its supply duct, hot water tank, air exchanger up high.
    box([0.15, 4.15, 0], [0.8, 0.8, 1.65], 'heatPump', { r: 0.03, f: 'heat-pump' }),
    box([0.94, 4.25, 0.25], [0.02, 0.6, 0.6], 'grille', { f: 'heat-pump' }),
    box([0.3, 4.3, 1.65], [0.5, 0.5, WALL - 1.65], 'duct', { f: 'heat-pump' }),
    cyl(1.75, 4.72, 0, 0.36, 1.5, 'tank', { f: 'water-heater', seg: 28 }),
    cyl(1.62, 4.72, 1.5, 0.035, WALL - 1.5, 'copper'),
    cyl(1.88, 4.72, 1.5, 0.035, WALL - 1.5, 'copper'),
    box([0.25, 4.95, 1.45], [0.85, 0.36, 0.42], 'appliance', { r: 0.03, f: 'air-exchanger' }),
    cyl(0.67, 5.13, 1.87, 0.08, WALL - 1.87, 'duct', { f: 'air-exchanger' }),
  ],
  sump: [
    cyl(0.55, 6.0, 0, 0.3, 0.02, 'black'),
    cyl(0.55, 6.0, 0.02, 0.12, 0.3, 'blue', { f: 'sump-pump' }),
    cyl(0.42, 6.12, 0.3, 0.035, 1.6, 'porcelain', { f: 'sump-pump' }),
    // Electrical panel and the main water shutoff on the back wall.
    box([0.02, 5.45, 1.0], [0.12, 0.5, 0.76], 'panel', { f: 'electrical-panel' }),
    box([0.13, 5.52, 1.55], [0.02, 0.36, 0.08], 'blue', { f: 'electrical-panel' }),
    cyl(0.08, 6.35, 0, 0.04, 1.1, 'copper', { f: 'water-main' }),
    box([0.03, 6.23, 0.48], [0.14, 0.25, 0.08], 'blue', { f: 'water-main' }),
  ],
  'basement-hall': [alarm(3.0, 3.5)],
  'basement-stairs': stairs(3.45, 1.2, 5.45, 6.55),
  garage: [
    box([3.75, 0.16, 0], [1.0, 0.46, 1.45], 'woodDark'),
    ...[0.48, 0.96].map((z) => box([3.77, 0.18, z], [0.96, 0.42, 0.03], 'wood')),
    box([3.82, 0.22, 0.03], [0.36, 0.36, 0.36], 'terracotta'),
    box([4.28, 0.22, 0.03], [0.36, 0.36, 0.36], 'sage'),
    box([4.35, 0.22, 0.99], [0.36, 0.36, 0.3], 'cabinet'),
    box([8.75, 0.25, 0], [0.55, 0.6, 0.95], 'sage', { r: 0.04 }),
    box([9.38, 0.25, 0], [0.55, 0.6, 0.95], 'rugBlue', { r: 0.04 }),
    // A long, low red car, nose to the garage door.
    box([4.95, 2.35, 0.24], [4.5, 1.9, 0.56], 'car', { r: 0.24, f: 'car' }),
    box([5.85, 2.52, 0.7], [2.45, 1.56, 0.46], 'carGlass', { r: 0.22, f: 'car' }),
    ...[5.75, 8.65].flatMap((x) => [2.32, 4.28].map((y) => cyl(x, y, 0.34, 0.34, 0.26, 'tire', { axis: 'y', seg: 24 }))),
    ...[5.75, 8.65].flatMap((x) => [2.18, 4.42].map((y) => cyl(x, y, 0.34, 0.2, 0.04, 'rim', { axis: 'y', seg: 20 }))),
  ],

  // Ground floor
  living: [
    // Sofa along the party wall, facing the room; the porte-fenêtre to the backyard stays clear.
    rug(0.6, 0.9, 2.8, 3.1),
    cyl(0.3, 0.32, 0, 0.025, 1.35, 'black'),
    cyl(0.3, 0.32, 1.35, 0.18, 0.26, 'lamp', { seg: 20 }),
    box([0.55, 0.15, 0], [0.22, 0.9, 0.62], 'sofa', { r: 0.08 }),
    box([0.77, 0.15, 0], [1.66, 0.9, 0.42], 'sofa', { r: 0.08 }),
    box([0.77, 0.15, 0.36], [1.66, 0.26, 0.5], 'sofa', { r: 0.1 }),
    box([0.79, 0.41, 0.4], [0.8, 0.62, 0.12], 'cushion', { r: 0.05 }),
    box([1.62, 0.41, 0.4], [0.79, 0.62, 0.12], 'cushion', { r: 0.05 }),
    box([2.43, 0.15, 0], [0.22, 0.9, 0.62], 'sofa', { r: 0.08 }),
    box([1.3, 1.45, 0], [0.96, 0.5, 0.3], 'woodDark'),
    box([1.18, 1.35, 0.3], [1.2, 0.7, 0.06], 'wood'),
    box([1.4, 1.48, 0.36], [0.36, 0.26, 0.05], 'terracotta'),
    // Armchair facing the sofa, with the side table (radon monitor) beside it.
    box([1.95, 3.0, 0], [0.75, 0.75, 0.42], 'cushion', { r: 0.1 }),
    box([1.95, 3.57, 0.36], [0.75, 0.18, 0.46], 'cushion', { r: 0.06 }),
    box([2.8, 3.3, 0], [0.4, 0.4, 0.5], 'wood'),
    box([2.88, 3.38, 0.5], [0.16, 0.12, 0.1], 'porcelain'),
    ...plant(0.35, 3.85, 1.1),
  ],
  dining: [
    box([3.75, 1.6, 0.7], [1.8, 0.95, 0.06], 'wood', { r: 0.02 }),
    ...[
      [3.85, 1.68],
      [5.45, 1.68],
      [3.85, 2.5],
      [5.45, 2.5],
    ].map(([x, y]) => box([x, y, 0], [0.06, 0.06, 0.7], 'woodDark')),
    ...chair(4.16, 1.26, 'y0'),
    ...chair(5.06, 1.26, 'y0'),
    ...chair(3.51, 2.11, 'x0'),
    ...chair(5.96, 2.11, 'x1'),
    ...chair(4.16, 2.91, 'y1'),
    ...chair(5.06, 2.91, 'y1'),
    cyl(4.65, 2.07, 1.9, 0.008, WALL - 1.9, 'black'),
    cyl(4.65, 2.07, 1.76, 0.2, 0.14, 'lamp', { seg: 20 }),
  ],
  kitchen: [
    box([6.45, 0.16, 0], [0.88, 0.74, 1.85], 'appliance', { r: 0.03, f: 'fridge' }),
    box([7.2, 0.9, 0.75], [0.03, 0.03, 0.6], 'steel', { f: 'fridge' }),
    box([7.35, 0.16, 0], [2.6, 0.62, 0.86], 'cabinet'),
    box([7.33, 0.14, 0.86], [2.64, 0.66, 0.06], 'counter'),
    box([8.18, 0.77, 0.1], [0.8, 0.02, 0.66], 'black'),
    box([8.2, 0.2, 0.92], [0.76, 0.52, 0.01], 'black'),
    box([8.17, 0.16, 1.8], [0.8, 0.5, 0.3], 'steel', { f: 'range-hood' }),
    box([8.42, 0.16, 2.1], [0.3, 0.3, WALL - 2.1], 'steel', { f: 'range-hood' }),
    // Island with the sink; the dishwasher faces the range.
    box([6.5, 1.95, 0], [2.35, 0.95, 0.86], 'cabinet'),
    box([6.46, 1.91, 0.86], [2.43, 1.03, 0.06], 'counter'),
    box([7.12, 2.08, 0.875], [0.72, 0.46, 0.05], 'steel'),
    cyl(7.48, 2.0, 0.92, 0.025, 0.32, 'steel'),
    box([8.25, 1.93, 0.05], [0.6, 0.02, 0.76], 'steel', { f: 'dishwasher' }),
    ...[6.95, 7.5, 8.15].flatMap((x) => [cyl(x, 3.22, 0, 0.03, 0.65, 'black'), cyl(x, 3.22, 0.62, 0.17, 0.05, 'wood', { seg: 18 })]),
    cyl(9.75, 3.75, 0, 0.09, 0.46, 'red', { f: 'fire-extinguisher', seg: 16 }),
    cyl(9.75, 3.75, 0.46, 0.04, 0.07, 'black', { f: 'fire-extinguisher' }),
  ],
  'ground-stairs': [...stairs(3.45, 1.25, 4.2, 5.3), alarm(2.0, 4.15)],
  entry: [
    box([4.7, 6.0, 0], [0.8, 0.55, 0.012], 'mat'),
    box([5.68, 4.18, 0], [1.18, 0.86, 2.1], 'cabinet'),
    box([3.75, 6.05, 0], [0.85, 0.42, 0.45], 'wood', { r: 0.03 }),
    box([3.82, 5.7, 0], [0.12, 0.22, 0.1], 'black'),
    box([4.02, 5.7, 0], [0.12, 0.22, 0.1], 'black'),
    ...plant(6.6, 6.3),
  ],
  'entry-hall': [rug(7.05, 5.8, 8.3, 6.4, 'rugBlue')],
  powder: [
    box([6.98, 4.18, 0], [0.52, 0.45, 0.82], 'wood'),
    box([6.96, 4.16, 0.82], [0.56, 0.49, 0.05], 'porcelain'),
    ...toilet(7.8, 4.18),
  ],
  'ground-closet': [
    box([8.55, 4.6, 0], [0.42, 2.0, 1.1], 'wood'),
    box([8.6, 4.75, 1.1], [0.36, 0.4, 0.26], 'terracotta'),
    box([8.6, 5.3, 1.1], [0.36, 0.4, 0.22], 'sage'),
  ],

  // Upper floor
  bedroom2: [rug(0.6, 2.0, 2.7, 3.05, 'rugBlue'), ...nightstand(0.32), ...bed(0.85, 0.16, 1.4, 'sage'), ...nightstand(2.38), ...plant(2.9, 2.85)],
  'bedroom2-closet': clothesRail(0.3, 2.3, 3.85),
  bathroom: [
    rug(4.3, 0.5, 4.85, 1.25, 'sage'),
    box([5.05, 0.18, 0], [0.95, 1.6, 0.56], 'porcelain', { r: 0.12, f: 'bathtub' }),
    box([5.14, 0.27, 0.5], [0.77, 1.42, 0.03], 'water', { r: 0.1, f: 'bathtub' }),
    box([3.27, 1.25, 0], [0.55, 0.95, 0.82], 'wood'),
    box([3.25, 1.23, 0.82], [0.59, 0.99, 0.05], 'porcelain'),
    box([3.22, 1.4, 1.15], [0.03, 0.65, 0.7], 'screen'),
    ...toilet(3.47, 0.3),
    // Glass shower.
    box([5.05, 1.88, 0], [0.95, 1.3, 0.08], 'porcelain', { f: 'shower' }),
    box([5.05, 1.88, 0.08], [0.02, 1.3, 1.87], 'glassPane', { f: 'shower' }),
    box([5.05, 1.88, 0.08], [0.95, 0.02, 1.87], 'glassPane', { f: 'shower' }),
    cyl(5.8, 3.0, 1.8, 0.09, 0.03, 'steel', { f: 'shower' }),
    box([4.25, 1.45, WALL - 0.04], [0.3, 0.3, 0.04], 'grille', { f: 'bath-fan' }),
  ],
  'upper-hall': [rug(2.7, 3.55, 5.8, 4.05), alarm(4.2, 3.8)],
  bedroom1: [
    rug(6.85, 1.9, 9.25, 3.15),
    ...nightstand(6.6),
    ...bed(7.15, 0.16, 1.8, 'terracotta'),
    ...nightstand(9.05),
    box([9.45, 2.55, 0], [0.45, 1.3, 0.85], 'wood'),
    ...plant(9.65, 3.95, 0.9),
  ],
  bedroom3: [
    box([3.55, 4.45, 0], [0.6, 1.95, 2.0], 'cabinet'),
    rug(5.05, 5.3, 6.95, 6.3),
    ...bed(5.35, 4.42, 1.35, 'lavender'),
    box([7.15, 5.55, 0], [0.5, 0.06, 0.72], 'woodDark'),
    box([7.15, 6.45, 0], [0.5, 0.06, 0.72], 'woodDark'),
    box([7.12, 5.52, 0.72], [0.56, 1.02, 0.05], 'wood'),
    box([7.58, 5.8, 0.77], [0.03, 0.44, 0.3], 'screen'),
    ...chair(6.83, 6.06, 'x0', 'sofa'),
  ],
  'walk-in': [...clothesRail(7.95, 9.9, 6.2), box([9.5, 4.45, 0], [0.42, 1.1, 0.95], 'wood')],
};

export function rectParts(id: string): Part[] {
  return ROOM_PARTS[id] ?? [];
}

// ── Outside (scene coordinates) ──────────────────────────────────────────────────────────────

/** Site parts in scene space: x along the entry facade, z toward the street, y up. */
export interface SitePartBox {
  kind: 'box';
  /** Center of the base. */
  at: readonly [number, number, number];
  s: readonly [number, number, number];
  m: MaterialKey;
  r?: number;
  f?: FixtureId;
}

export type SitePart = SitePartBox | { kind: 'cyl'; at: readonly [number, number, number]; r: number; h: number; m: MaterialKey; axis?: 'x' | 'z'; f?: FixtureId; seg?: number } | BallPart;

const sbox = (at: readonly [number, number, number], s: readonly [number, number, number], m: MaterialKey, extra: Partial<SitePartBox> = {}): SitePartBox => ({
  kind: 'box',
  at,
  s,
  m,
  ...extra,
});

/** Backyard furniture and equipment (the yard is level, at GRADE.back). */
export function siteParts(): SitePart[] {
  const y = GRADE.back;
  const patio = y + 0.08;
  const unit = HEAT_PUMP_UNIT;
  return [
    // Two lounge chairs and a side table on the patio off the living room.
    sbox([-W / 2 - 2.15, patio, -1.55], [1.7, 0.3, 0.65], 'woodLight', { r: 0.04 }),
    sbox([-W / 2 - 2.15, patio, -0.55], [1.7, 0.3, 0.65], 'woodLight', { r: 0.04 }),
    sbox([-W / 2 - 2.75, patio + 0.3, -1.55], [0.5, 0.08, 0.62], 'linen', { r: 0.03 }),
    sbox([-W / 2 - 2.75, patio + 0.3, -0.55], [0.5, 0.08, 0.62], 'linen', { r: 0.03 }),
    { kind: 'cyl', at: [-W / 2 - 2.0, patio, 0.3], r: 0.24, h: 0.45, m: 'woodDark', seg: 20 },
    // Heat pump outdoor unit on its pad, fan facing the yard.
    sbox([unit.x, y, unit.z], [0.62, 0.1, 1.25], 'concrete'),
    sbox([unit.x, y + 0.1, unit.z], [0.46, 0.82, 1.0], 'heatPump', { r: 0.03, f: 'heat-pump-outdoor' }),
    { kind: 'cyl', at: [unit.x - 0.24, y + 0.51, unit.z], r: 0.3, h: 0.02, m: 'grille', axis: 'x', seg: 28, f: 'heat-pump-outdoor' },
    // Hose reel under the faucet.
    { kind: 'cyl', at: [-W / 2 - 0.35, y + 0.3, HOSE_BIB_Z - 0.45], r: 0.26, h: 0.14, m: 'hose', axis: 'x', seg: 24, f: 'hose-bib' },
  ];
}

export interface Sconce {
  at: readonly [number, number, number];
  /** Outward direction of the wall it hangs on (x, z). */
  normal: readonly [number, number];
}

/** Outdoor lights that glow at night: entry alcove, floodlight, garage corner, patio door. */
export const SCONCES: readonly Sconce[] = [
  { at: [ALCOVE.x0 + 1.05, H + 2.02, D / 2 + 0.06], normal: [0, 1] },
  { at: [BAY.x1 + 0.75, H + 2.36, D / 2 + 0.08], normal: [0, 1] },
  { at: [W / 2 + 0.06, 2.0, CORNER.z0 + 0.35], normal: [1, 0] },
  { at: [-W / 2 - 0.06, H + 2.15, 0.75], normal: [-1, 0] },
];
