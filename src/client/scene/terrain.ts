import {
  COURT,
  D,
  DRIVE,
  driveHeight,
  frontGrade,
  GRADE,
  PORCH,
  SIDE_STREET,
  STONE_WALL,
  STREET,
  T,
  W,
  WALK,
  walkHeight,
  YARD,
} from './layout';

// The lot as a height field. Everything that is built — the house, the porch, paving, walls,
// the fenced backyard — pins the ground to a height; the lawns in between are left free and
// solved as a smooth membrane (a discrete Laplace equation), so slopes fall naturally from the
// raised yards down to the driveway and the streets. Grid lines follow every built edge, so steps
// in the ground hide inside walls and under slabs.

export const TERRAIN_BOUNDS = { x0: -36, x1: 36, z0: -30, z1: 38 } as const;

export interface TerrainGrid {
  xs: Float64Array;
  zs: Float64Array;
  /** Heights, row by row: h[j * xs.length + i] at (xs[i], zs[j]). */
  h: Float32Array;
  /** Which vertices were pinned (built over) rather than solved. */
  pinned: Uint8Array;
}

const EPS = 1e-6;

/** Sorted grid lines: fine near the house, coarser toward the horizon, plus every built edge. */
function gridLines(min: number, max: number, core: readonly [number, number], features: number[]): Float64Array {
  const spacing = (t: number) => {
    const outside = t < core[0] ? core[0] - t : t > core[1] ? t - core[1] : 0;
    return Math.min(4, 0.5 + outside * 0.22);
  };
  const lines: number[] = [];
  for (let t = min; t < max - EPS; t += spacing(t)) lines.push(t);
  lines.push(max);
  const keep = features.filter((f) => f > min + EPS && f < max - EPS);
  // Regular lines that crowd a feature line give way to it.
  const merged = lines.filter((t) => keep.every((f) => Math.abs(f - t) > 0.06)).concat(keep);
  return Float64Array.from([...new Set(merged.map((t) => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b));
}

const inside = (v: number, lo: number, hi: number) => v > lo + EPS && v < hi - EPS;
const within = (v: number, lo: number, hi: number) => v >= lo - EPS && v <= hi + EPS;
const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Grade along the long side away from the entry: yard level, falling toward the driveway. */
export function sideGrade(x: number): number {
  return GRADE.back + (0.02 - GRADE.back) * smooth((x + 0.5) / (W / 2 + 0.8));
}

/**
 * The height a built feature fixes the ground to at (x, z), or null where the lawn is free.
 * Hidden footprints (house, porch, stone wall) pin their insides low; their edges keep the grade
 * of what is outside, so the drop happens within the solid.
 */
export function pinnedHeight(x: number, z: number): number | null {
  const B = TERRAIN_BOUNDS;
  if (x <= B.x0 + EPS || x >= B.x1 - EPS || z <= B.z0 + EPS || z >= B.z1 - EPS) return GRADE.street;

  // House: below the basement floor inside the walls; the facade grade along its outer faces.
  if (within(x, -W / 2, W / 2) && within(z, -D / 2, D / 2)) {
    if (inside(x, -W / 2, W / 2) && inside(z, -D / 2, D / 2)) return -0.4;
    if (Math.abs(x - W / 2) < EPS) return -0.03;
    if (Math.abs(z - D / 2) < EPS) return x < COURT.x0 ? frontGrade(x) : COURT.floor - 0.06;
    if (Math.abs(x + W / 2) < EPS) return GRADE.back;
    return sideGrade(x);
  }
  // Porch and stone wall are solid: anything inside them is out of sight.
  if (inside(x, PORCH.x0, COURT.x0) && inside(z, PORCH.z0, PORCH.z1)) return 0;
  if (inside(x, COURT.x0, WALK.end) && inside(z, STONE_WALL.z0, STONE_WALL.z1)) return -0.05;
  // Paved surfaces: the lawn meets their edges at their height and drops well below them inside,
  // so the two never share a depth (even with the lot flattened).
  const paved = (x0: number, x1: number, z0: number, z1: number, top: number): number | null => {
    if (!within(x, x0, x1) || !within(z, z0, z1)) return null;
    return inside(x, x0, x1) && inside(z, z0, z1) ? top - 0.25 : top - 0.02;
  };
  const surface =
    paved(COURT.x0, COURT.x1, COURT.z0, COURT.z1, COURT.floor) ??
    paved(PORCH.steps.x0, PORCH.steps.x1, PORCH.z1, WALK.z0, GRADE.front - 0.1) ??
    // Under the steps the ground follows the lowest tread nearby, so it never pokes through one.
    paved(WALK.runs[0].x0, WALK.end, WALK.z0, WALK.z1, Math.min(walkHeight(x - 0.5), walkHeight(x), walkHeight(x + 0.5)) - 0.06) ??
    paved(WALK.end, WALK.end + 1.2, STONE_WALL.z0, WALK.z1, driveHeight(x)) ??
    paved(DRIVE.x0, SIDE_STREET.curb, DRIVE.z0, DRIVE.z1, driveHeight(x)) ??
    paved(-Infinity, Infinity, STREET.curb, STREET.far, GRADE.street) ??
    paved(SIDE_STREET.curb, SIDE_STREET.far, -Infinity, STREET.curb, GRADE.street) ??
    paved(-Infinity, SIDE_STREET.curb, STREET.sidewalk, STREET.curb, GRADE.street + 0.12) ??
    paved(SIDE_STREET.sidewalk, SIDE_STREET.curb, -Infinity, STREET.sidewalk, GRADE.street + 0.12);
  if (surface !== null) return surface;
  // The fenced backyard is level with the ground floor; its wrap round the front follows the facade.
  if (within(x, YARD.x0, -W / 2) && within(z, YARD.z0, YARD.z1)) return GRADE.back;
  if (within(x, -W / 2, YARD.wrap) && within(z, D / 2, YARD.z1)) return frontGrade(x);
  if (within(x, -W / 2, -W / 2 + 0.6) && within(z, YARD.z0, -D / 2)) return GRADE.back;
  // A level strip of lawn along the front before it starts falling toward the street.
  if (within(x, YARD.wrap, COURT.x0) && within(z, D / 2, PORCH.z1 + 1.2)) return frontGrade(x);
  return null;
}

let cached: TerrainGrid | null = null;

/** Solves the lot once (a few milliseconds) and caches it. */
export function terrainGrid(): TerrainGrid {
  if (cached) return cached;
  const B = TERRAIN_BOUNDS;
  const xs = gridLines(B.x0, B.x1, [-17, 16], [
    -W / 2,
    W / 2,
    -W / 2 + T,
    W / 2 - T,
    -W / 2 + 0.6,
    YARD.x0,
    YARD.wrap,
    PORCH.x0,
    PORCH.steps.x0,
    PORCH.steps.x1,
    COURT.x0,
    COURT.x1,
    ...WALK.runs.flatMap((run) => [run.x0, run.x1]),
    WALK.end,
    WALK.end + 1.2,
    DRIVE.x1,
    SIDE_STREET.curb,
    SIDE_STREET.far,
  ]);
  const zs = gridLines(B.z0, B.z1, [-11, 14], [
    -D / 2,
    D / 2,
    -D / 2 + T,
    D / 2 - T,
    YARD.z0,
    YARD.z1,
    PORCH.z1,
    STONE_WALL.z1,
    WALK.z1,
    DRIVE.z0,
    STREET.sidewalk,
    STREET.curb,
    STREET.far,
  ]);
  const nx = xs.length;
  const nz = zs.length;
  const h = new Float32Array(nx * nz);
  const pinned = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const value = pinnedHeight(xs[i], zs[j]);
      const k = j * nx + i;
      if (value === null) h[k] = 1.4;
      else {
        h[k] = value;
        pinned[k] = 1;
      }
    }
  }
  // Successive over-relaxation of the Laplace equation on the uneven grid.
  const wx = new Float64Array(nx * 2);
  for (let i = 1; i < nx - 1; i += 1) {
    const left = xs[i] - xs[i - 1];
    const right = xs[i + 1] - xs[i];
    const scale = 2 / (left + right);
    wx[i * 2] = scale / left;
    wx[i * 2 + 1] = scale / right;
  }
  const wz = new Float64Array(nz * 2);
  for (let j = 1; j < nz - 1; j += 1) {
    const down = zs[j] - zs[j - 1];
    const up = zs[j + 1] - zs[j];
    const scale = 2 / (down + up);
    wz[j * 2] = scale / down;
    wz[j * 2 + 1] = scale / up;
  }
  const omega = 1.9;
  for (let iteration = 0; iteration < 700; iteration += 1) {
    let change = 0;
    for (let j = 1; j < nz - 1; j += 1) {
      for (let i = 1; i < nx - 1; i += 1) {
        const k = j * nx + i;
        if (pinned[k]) continue;
        const a = wx[i * 2];
        const b = wx[i * 2 + 1];
        const c = wz[j * 2];
        const d = wz[j * 2 + 1];
        const target = (a * h[k - 1] + b * h[k + 1] + c * h[k - nx] + d * h[k + nx]) / (a + b + c + d);
        const next = h[k] + omega * (target - h[k]);
        change = Math.max(change, Math.abs(next - h[k]));
        h[k] = next;
      }
    }
    if (change < 2e-4) break;
  }
  cached = { xs, zs, h, pinned };
  return cached;
}

function cell(lines: Float64Array, t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  if (t <= lines[0]) return 0;
  if (t >= lines[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lines[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Ground height at (x, z), interpolated from the solved grid. */
export function terrainHeight(x: number, z: number): number {
  const { xs, zs, h } = terrainGrid();
  const i = cell(xs, x);
  const j = cell(zs, z);
  const tx = Math.max(0, Math.min(1, (x - xs[i]) / (xs[i + 1] - xs[i])));
  const tz = Math.max(0, Math.min(1, (z - zs[j]) / (zs[j + 1] - zs[j])));
  const nx = xs.length;
  const a = h[j * nx + i];
  const b = h[j * nx + i + 1];
  const c = h[(j + 1) * nx + i];
  const d = h[(j + 1) * nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
