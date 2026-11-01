import { describe, expect, it } from 'vitest';
import {
  BAY,
  CLADDING,
  D,
  DRIVE,
  driveHeight,
  GRADE,
  H,
  LEVELS,
  OPENINGS,
  PORCH,
  SLAB,
  T,
  W,
  WALK,
  walkHeight,
  WALL,
  wallPieces,
  YARD,
  type WallSide,
} from './layout';
import { terrainGrid, terrainHeight } from './terrain';

const SIDES: WallSide[] = ['front', 'back', 'left', 'right'];

describe('exterior walls', () => {
  it('tile every wall exactly around its openings', () => {
    for (const level of LEVELS) {
      const top = level === 'upper' ? H : WALL;
      for (const side of SIDES) {
        const along = side === 'front' || side === 'back';
        const length = along ? W : D - 2 * T;
        const pieces = wallPieces(level, side);
        const solid = pieces.reduce((sum, p) => sum + (along ? p.w : p.d) * (p.v1 - p.v0), 0);
        const holes = OPENINGS[level][side].reduce((sum, o) => {
          const u = Math.min(o.u1, length / 2) - Math.max(o.u0, -length / 2);
          const v = Math.min(o.v1, top) - Math.max(o.v0, -SLAB);
          return sum + Math.max(0, u) * Math.max(0, v);
        }, 0);
        expect(solid + holes, `${level} ${side}`).toBeCloseTo(length * (top + SLAB), 6);
      }
    }
  });

  it('keeps openings inside their wall and apart from each other', () => {
    for (const level of LEVELS) {
      for (const side of SIDES) {
        const limit = side === 'front' || side === 'back' ? W / 2 : D / 2 - T;
        const openings = OPENINGS[level][side];
        for (const [i, a] of openings.entries()) {
          expect(a.u0).toBeGreaterThanOrEqual(-limit);
          expect(a.u1).toBeLessThanOrEqual(limit);
          expect(a.u1).toBeGreaterThan(a.u0);
          for (const b of openings.slice(i + 1)) {
            const overlap = Math.min(a.u1, b.u1) > Math.max(a.u0, b.u0) && Math.min(a.v1, b.v1) > Math.max(a.v0, b.v0) + 1e-9;
            expect(overlap, `${level} ${side} openings ${i} overlap`).toBe(false);
          }
        }
      }
    }
  });

  it('stands only the entry bay proud of the facade, never into the rooms', () => {
    for (const level of LEVELS) {
      for (const side of SIDES) {
        for (const span of CLADDING[level][side]) {
          if (span.out) {
            expect(side).toBe('front');
            expect(span.u0).toBeGreaterThanOrEqual(BAY.x0 - 1e-9);
            expect(span.u1).toBeLessThanOrEqual(BAY.x1 + 1e-9);
          }
        }
        for (const piece of wallPieces(level, side)) {
          // The inside face always sits on the wall line, whatever the outside does.
          if (side === 'front') expect(piece.z - piece.d / 2).toBeCloseTo(D / 2 - T, 9);
          if (side === 'back') expect(piece.z + piece.d / 2).toBeCloseTo(-D / 2 + T, 9);
          if (side === 'left') expect(piece.x + piece.w / 2).toBeCloseTo(-W / 2 + T, 9);
          if (side === 'right') expect(piece.x - piece.w / 2).toBeCloseTo(W / 2 - T, 9);
        }
      }
    }
  });

  it('puts the porte-fenêtre on the living room wall, at backyard level', () => {
    const patio = OPENINGS.ground.left.find((o) => o.kind === 'patio');
    expect(patio).toBeDefined();
    expect(patio!.v0).toBe(0);
    // The backyard sits one step below the ground floor.
    expect(H - GRADE.back).toBeGreaterThan(0.1);
    expect(H - GRADE.back).toBeLessThan(0.35);
  });
});

describe('the lot', () => {
  it('slopes the driveway down into the garage', () => {
    expect(driveHeight(DRIVE.x0)).toBe(0);
    expect(driveHeight(DRIVE.x1)).toBeCloseTo(GRADE.street, 9);
    for (let x = DRIVE.x0; x < DRIVE.x1; x += 0.5) expect(driveHeight(x + 0.5)).toBeGreaterThanOrEqual(driveHeight(x));
    // A gentle slope: under 10 %.
    expect(GRADE.street / (DRIVE.x1 - DRIVE.x0)).toBeLessThan(0.1);
  });

  it('steps the walkway down from the porch to the drive', () => {
    expect(walkHeight(WALK.runs[0].x0)).toBeCloseTo(GRADE.front, 9);
    let previous = Infinity;
    for (let x = WALK.runs[0].x0; x <= WALK.end; x += 0.05) {
      const h = walkHeight(x);
      expect(h).toBeLessThanOrEqual(previous + 1e-9);
      if (previous !== Infinity) expect(previous - h).toBeLessThan(0.23); // no riser taller than a step
      previous = h;
    }
    expect(walkHeight(WALK.end + 0.01)).toBeCloseTo(driveHeight(WALK.end + 0.01), 9);
    expect(PORCH.top - GRADE.front).toBeLessThan(0.75);
  });

  it('keeps the ground below the house and at the right grades around it', () => {
    terrainGrid();
    expect(terrainHeight(0, 0)).toBeLessThan(0);
    expect(terrainHeight(-W / 2 - 3, 0)).toBeCloseTo(GRADE.back, 3);
    expect(terrainHeight(YARD.x0 + 0.5, YARD.z0 + 0.5)).toBeCloseTo(GRADE.back, 3);
    // Level lawn by the porch, falling toward the street.
    expect(Math.abs(terrainHeight(-1.5, PORCH.z1 + 0.5) - GRADE.front)).toBeLessThan(0.15);
    expect(terrainHeight(0, D / 2 + 6)).toBeLessThan(GRADE.front - 0.3);
    // The ground never rises through the driveway.
    for (let x = DRIVE.x0 + 0.1; x < DRIVE.x1; x += 0.37) {
      for (let z = DRIVE.z0 + 0.1; z < DRIVE.z1; z += 0.41) expect(terrainHeight(x, z)).toBeLessThanOrEqual(driveHeight(x) + 1e-6);
    }
  });

  it('solves a smooth lawn: every free point lies between its neighbours', () => {
    const { xs, zs, h, pinned } = terrainGrid();
    const nx = xs.length;
    let checked = 0;
    for (let j = 1; j < zs.length - 1; j += 1) {
      for (let i = 1; i < nx - 1; i += 1) {
        const k = j * nx + i;
        if (pinned[k]) continue;
        const around = [h[k - 1], h[k + 1], h[k - nx], h[k + nx]];
        expect(h[k]).toBeGreaterThanOrEqual(Math.min(...around) - 1e-3);
        expect(h[k]).toBeLessThanOrEqual(Math.max(...around) + 1e-3);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
