// Isometric geometry. World units are meters: x runs to the screen's lower right, y to the lower
// left, z up. The projection is a uniformly scaled true isometric view (30°), so a sphere is a
// circle and horizontal circles are axis-aligned ellipses.

export const COS30 = Math.cos(Math.PI / 6);
export const SIN30 = 0.5;

export type P3 = readonly [number, number, number];
export type P2 = readonly [number, number];

export function project(x: number, y: number, z: number): P2 {
  return [(x - y) * COS30, (x + y) * SIN30 - z];
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** SVG `points` string for a list of world points. */
export function pts(points: readonly P3[]): string {
  return points
    .map(([x, y, z]) => {
      const [sx, sy] = project(x, y, z);
      return `${f(sx)},${f(sy)}`;
    })
    .join(' ');
}

export interface BoxSpec {
  x: number;
  y: number;
  z: number;
  /** Extent along x. */
  w: number;
  /** Extent along y. */
  d: number;
  /** Extent along z. */
  h: number;
}

/** The three visible faces of an axis-aligned box. */
export function boxFaces({ x, y, z, w, d, h }: BoxSpec) {
  const x1 = x + w;
  const y1 = y + d;
  const z1 = z + h;
  return {
    top: pts([
      [x, y, z1],
      [x1, y, z1],
      [x1, y1, z1],
      [x, y1, z1],
    ]),
    /** Face at y = y1 (faces +y; appears on the screen's left side). */
    left: pts([
      [x, y1, z],
      [x1, y1, z],
      [x1, y1, z1],
      [x, y1, z1],
    ]),
    /** Face at x = x1 (faces +x; appears on the screen's right side). */
    right: pts([
      [x1, y, z],
      [x1, y1, z],
      [x1, y1, z1],
      [x1, y, z1],
    ]),
  };
}

/** Screen-space bounding box of a world box. */
export function boxBounds({ x, y, z, w, d, h }: BoxSpec): Bounds {
  const corners: P3[] = [];
  for (const cx of [x, x + w]) for (const cy of [y, y + d]) for (const cz of [z, z + h]) corners.push([cx, cy, cz]);
  return boundsOf(corners);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: readonly P3[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y, z] of points) {
    const [sx, sy] = project(x, y, z);
    minX = Math.min(minX, sx);
    minY = Math.min(minY, sy);
    maxX = Math.max(maxX, sx);
    maxY = Math.max(maxY, sy);
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(...all: Bounds[]): Bounds {
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

/**
 * SVG transform mapping 2D face-local coordinates onto a world plane, so flat details (windows,
 * doors, panels, dials) can be drawn as ordinary rects and circles. Local v points up.
 *  - 'y': plane y = c, local (u = x, v = z)
 *  - 'x': plane x = c, local (u = y, v = z)
 *  - 'z': plane z = c, local (u = x, v = y)
 */
export function faceTransform(plane: 'x' | 'y' | 'z', c: number): string {
  if (plane === 'y') return `matrix(${f(COS30)} 0.5 0 -1 ${f(-c * COS30)} ${f(c * 0.5)})`;
  if (plane === 'x') return `matrix(${f(-COS30)} 0.5 0 -1 ${f(c * COS30)} ${f(c * 0.5)})`;
  return `matrix(${f(COS30)} 0.5 ${f(-COS30)} 0.5 0 ${f(-c)})`;
}

/** Radii of the screen ellipse for a horizontal circle of radius r. */
export function ellipseRadii(r: number): { rx: number; ry: number } {
  return { rx: r * Math.SQRT2 * COS30, ry: r * Math.SQRT2 * 0.5 };
}

// ── Color ──────────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mixes a color toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

export interface Shades {
  top: string;
  left: string;
  right: string;
}

const shadeCache = new Map<string, Shades>();

/** Face colors for a base color under a light from the upper left. */
export function shades(base: string): Shades {
  let cached = shadeCache.get(base);
  if (!cached) {
    cached = { top: shade(base, 0.18), left: base, right: shade(base, -0.14) };
    shadeCache.set(base, cached);
  }
  return cached;
}
