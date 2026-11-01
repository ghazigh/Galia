import type { ReactNode } from 'react';
import { project, pts, shade } from './iso';
import { D, LOW_WALL, ROOF, T, W, YARD, type LevelKey } from './model';
import { C, type HousePalette } from './palette';
import { Ball, Box, Cylinder, Face, FloorRect, Line } from './primitives';

// All coordinates are storey-local: z = 0 is the finished floor. See model.ts for the axes.

type P = HousePalette;

// ── Flat details on walls (face-local u/v coordinates) ──────────────────────────────────────

function WindowPane({ p, u0, u1, v0, v1, mullions = 1 }: { p: P; u0: number; u1: number; v0: number; v1: number; mullions?: number }) {
  const w = u1 - u0;
  const h = v1 - v0;
  return (
    <g>
      <rect x={u0 - 0.07} y={v0 - 0.07} width={w + 0.14} height={h + 0.14} fill={p.windowFrame} />
      <rect x={u0} y={v0} width={w} height={h} fill={p.glass} />
      <polygon
        points={`${u0 + w * 0.08},${v0 + h * 0.15} ${u0 + w * 0.22},${v0 + h * 0.15} ${u0 + w * 0.08},${v0 + h * 0.62}`}
        fill="#ffffff"
        opacity={p.dark ? 0.12 : 0.45}
      />
      {Array.from({ length: mullions }, (_, i) => (
        <rect key={i} x={u0 + (w * (i + 1)) / (mullions + 1) - 0.025} y={v0} width={0.05} height={h} fill={p.windowFrame} />
      ))}
      <rect x={u0 - 0.14} y={v0 - 0.12} width={w + 0.28} height={0.07} fill={shade(p.windowFrame, -0.1)} />
    </g>
  );
}

function ArtFrame({ p, u0, v0, w, h, color }: { p: P; u0: number; v0: number; w: number; h: number; color: string }) {
  return (
    <g>
      <rect x={u0} y={v0} width={w} height={h} fill={p.tint('#3a3a46')} />
      <rect x={u0 + 0.05} y={v0 + 0.05} width={w - 0.1} height={h - 0.1} fill={p.tint('#f7f2ea')} />
      <circle cx={u0 + w * 0.68} cy={v0 + h * 0.68} r={Math.min(w, h) * 0.13} fill={p.tint(color)} />
      <polygon
        points={`${u0 + 0.08},${v0 + 0.08} ${u0 + w * 0.42},${v0 + h * 0.55} ${u0 + w * 0.7},${v0 + 0.08}`}
        fill={p.tint('#8fa8c4')}
      />
    </g>
  );
}

function Tiles({ p, u0, u1, v1, step = 0.3 }: { p: P; u0: number; u1: number; v1: number; step?: number }) {
  const lines: ReactNode[] = [];
  for (let u = u0 + step; u < u1 - 0.01; u += step) lines.push(<rect key={`u${u.toFixed(2)}`} x={u} y={0} width={0.012} height={v1} fill={p.tint('#d6dde3')} />);
  for (let v = step; v < v1 - 0.01; v += step) lines.push(<rect key={`v${v.toFixed(2)}`} x={u0} y={v} width={u1 - u0} height={0.012} fill={p.tint('#d6dde3')} />);
  return (
    <g>
      <rect x={u0} y={0} width={u1 - u0} height={v1} fill={p.tint('#eef3f6')} />
      {lines}
    </g>
  );
}

/** Inner face of the right exterior wall (plane y = T; u = x, v = z). */
export function backWallArt(level: LevelKey, p: P): ReactNode {
  switch (level) {
    case 'basement':
      return (
        <g>
          <ArtFrame p={p} u0={1.3} v0={1.25} w={0.9} h={0.6} color="#f2b33a" />
          {/* garage pegboard with tools */}
          <rect x={4.0} y={0.95} width={1.6} height={0.95} fill={p.tint('#c9b79f')} />
          {[0, 1, 2, 3, 4, 5].map((i) =>
            [0, 1, 2].map((j) => <circle key={`${i}-${j}`} cx={4.15 + i * 0.26} cy={1.1 + j * 0.3} r={0.025} fill={p.tint('#8c7a64')} />),
          )}
          <rect x={4.25} y={1.25} width={0.08} height={0.45} fill={p.tint(C.red)} />
          <rect x={4.7} y={1.3} width={0.32} height={0.06} fill={p.tint('#5e6673')} />
          <rect x={5.2} y={1.15} width={0.1} height={0.5} fill={p.tint('#5e6673')} />
        </g>
      );
    case 'ground':
      return (
        <g>
          <ArtFrame p={p} u0={1.05} v0={1.35} w={1.0} h={0.7} color="#d6977f" />
          <ArtFrame p={p} u0={4.2} v0={1.3} w={0.85} h={0.6} color="#f2b33a" />
          {/* kitchen backsplash */}
          <rect x={6.4} y={0.92} width={3.55} height={0.55} fill={p.tint('#f1eee9')} />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={6.4 + i * 0.3} y={0.92} width={0.012} height={0.55} fill={p.tint('#dcd6cd')} />
          ))}
          <rect x={6.4} y={1.19} width={3.55} height={0.012} fill={p.tint('#dcd6cd')} />
        </g>
      );
    case 'upper':
      return (
        <g>
          <ArtFrame p={p} u0={1.15} v0={1.2} w={0.85} h={0.5} color="#94b5a0" />
          {/* tiled tub surround */}
          <Tiles p={p} u0={4.95} u1={6.0} v1={1.35} />
          <rect x={5.75} y={0.75} width={0.12} height={0.05} fill={p.tint(C.steel)} />
          <ArtFrame p={p} u0={7.55} v0={1.25} w={1.0} h={0.55} color="#d6977f" />
        </g>
      );
  }
}

/** Inner face of the back exterior wall (plane x = T; u = y, v = z). */
export function sideWallArt(level: LevelKey, p: P): ReactNode {
  switch (level) {
    case 'basement':
      return (
        <g>
          {/* dryer exhaust duct out through the wall (the backyard outside is level with the ground floor) */}
          <rect x={3.45} y={0.9} width={0.22} height={1.4} fill={p.tint(C.duct)} />
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={3.45} y={1.0 + i * 0.2} width={0.22} height={0.03} fill={p.tint(shade(C.duct, -0.15))} />
          ))}
          {/* electrical panel */}
          <rect x={5.45} y={1.0} width={0.5} height={0.76} fill={p.tint(C.panel)} />
          <rect x={5.49} y={1.04} width={0.42} height={0.68} fill={p.tint(shade(C.panel, 0.25))} />
          <rect x={5.54} y={1.55} width={0.32} height={0.08} fill={p.tint('#ffd35a')} />
          <rect x={5.62} y={1.76} width={0.05} height={0.8} fill={p.tint(C.panel)} />
          <rect x={5.77} y={1.76} width={0.05} height={0.8} fill={p.tint(C.panel)} />
          {/* main water line + shutoff valve */}
          <rect x={6.32} y={0} width={0.07} height={0.95} fill={p.tint(C.copper)} />
          <rect x={6.23} y={0.48} width={0.25} height={0.08} fill={p.tint('#2f6fe0')} />
        </g>
      );
    case 'ground':
      return (
        <g>
          {/* porte-fenêtre out to the backyard */}
          <WindowPane p={p} u0={1.3} u1={3.65} v0={0.07} v1={2.25} mullions={1} />
          <rect x={2.4} y={0.95} width={0.04} height={0.25} fill={p.tint('#5e6673')} />
          <ArtFrame p={p} u0={4.9} v0={1.2} w={0.7} h={0.85} color="#94b5a0" />
        </g>
      );
    case 'upper':
      return (
        <g>
          <WindowPane p={p} u0={1.6} u1={3.1} v0={1.25} v1={2.3} />
          <ArtFrame p={p} u0={4.8} v0={1.2} w={0.6} h={0.75} color="#b6a8d2" />
        </g>
      );
  }
}

// ── Floors ──────────────────────────────────────────────────────────────────────────────────

export function floorTexture(material: keyof P['floors'], x0: number, x1: number, y0: number, y1: number, p: P): ReactNode {
  const { line } = p.floors[material];
  const lines: ReactNode[] = [];
  const add = (key: string, ax: number, ay: number, bx: number, by: number) =>
    lines.push(<line key={key} x1={ax} y1={ay} x2={bx} y2={by} stroke={line} strokeWidth={0.022} />);
  if (material === 'oak') {
    // Planks run along x; staggered joints.
    for (let y = y0 + 0.2, i = 0; y < y1 - 0.02; y += 0.2, i++) {
      add(`h${i}`, x0, y, x1, y);
      const offset = (i * 0.73) % 1.6;
      for (let x = x0 + 0.4 + offset; x < x1 - 0.1; x += 1.6) add(`j${i}-${x.toFixed(2)}`, x, y - 0.2, x, y);
    }
  } else if (material === 'tile' || material === 'mosaic' || material === 'stone') {
    const step = material === 'mosaic' ? 0.25 : material === 'stone' ? 0.6 : 0.45;
    for (let y = y0 + step; y < y1 - 0.02; y += step) add(`h${y.toFixed(2)}`, x0, y, x1, y);
    for (let x = x0 + step; x < x1 - 0.02; x += step) add(`v${x.toFixed(2)}`, x, y0, x, y1);
  } else if (material === 'concrete') {
    for (let x = x0 + 2.2; x < x1 - 0.5; x += 2.2) add(`c${x.toFixed(2)}`, x, y0, x, y1);
    add('c-mid', x0, (y0 + y1) / 2, x1, (y0 + y1) / 2);
  }
  return (
    <Face plane="z" at={0.002}>
      {lines}
    </Face>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────

function Car({ p, x, y }: { p: P; x: number; y: number }) {
  const body = p.tint(C.car);
  const glass = p.tint(C.carGlass);
  return (
    <g>
      <FloorRect x0={x + 0.1} y0={y + 0.15} x1={x + 4.6} y1={y + 2.05} fill={p.shadow} />
      <Box at={[x, y, 0.2]} size={[4.4, 1.85, 0.6]} color={body} />
      <Box at={[x + 1.15, y + 0.12, 0.8]} size={[2.3, 1.61, 0.48]} color={body} left={glass} right={shade(glass, -0.12)} top={shade(body, -0.05)} />
      <Face plane="y" at={y + 1.85}>
        {[x + 0.9, x + 3.5].map((u) => (
          <g key={u}>
            <circle cx={u} cy={0.3} r={0.3} fill={p.tint(C.tire)} />
            <circle cx={u} cy={0.3} r={0.13} fill={p.tint('#c4c9d1')} />
          </g>
        ))}
        <rect x={x + 1.22} y={0.83} width={0.05} height={0.42} fill={body} />
        <rect x={x + 2.3} y={0.83} width={0.06} height={0.44} fill={body} />
        <rect x={x + 2.0} y={0.62} width={0.22} height={0.04} fill={shade(body, -0.25)} />
      </Face>
      <Face plane="x" at={x + 4.4}>
        <rect x={y + 0.18} y={0.52} width={0.32} height={0.12} fill={p.dark ? '#ffe7a3' : '#fff6d6'} />
        <rect x={y + 1.35} y={0.52} width={0.32} height={0.12} fill={p.dark ? '#ffe7a3' : '#fff6d6'} />
        <rect x={y + 0.6} y={0.3} width={0.65} height={0.12} fill={shade(body, -0.3)} />
      </Face>
    </g>
  );
}

/** Bed with its headboard at y and its foot toward +y. */
function Bed({ p, x, y = 0.16, width, blanket, double }: { p: P; x: number; y?: number; width: number; blanket: string; double?: boolean }) {
  const headboard = double ? p.tint(C.cushion) : p.tint(C.wood);
  return (
    <g>
      <Box at={[x - 0.05, y, 0]} size={[width + 0.1, 0.14, double ? 1.05 : 0.92]} color={headboard} />
      <Box at={[x, y + 0.14, 0]} size={[width, 2.05, 0.3]} color={p.tint(C.wood)} shadow={p.shadow} />
      <Box at={[x + 0.04, y + 0.16, 0.3]} size={[width - 0.08, 2.0, 0.22]} color={p.tint(C.linen)} />
      {double ? (
        <>
          <Box at={[x + 0.16, y + 0.24, 0.52]} size={[width / 2 - 0.22, 0.38, 0.13]} color={p.tint(C.pillow)} />
          <Box at={[x + width / 2 + 0.06, y + 0.24, 0.52]} size={[width / 2 - 0.22, 0.38, 0.13]} color={p.tint(C.pillow)} />
        </>
      ) : (
        <Box at={[x + 0.18, y + 0.24, 0.52]} size={[width - 0.36, 0.36, 0.12]} color={p.tint(C.pillow)} />
      )}
      <Box at={[x - 0.02, y + 0.86, 0.27]} size={[width + 0.04, 1.36, 0.31]} color={p.tint(blanket)} />
      <Box at={[x - 0.02, y + 0.86, 0.58]} size={[width + 0.04, 0.16, 0.012]} color={p.tint(shade(blanket, 0.35))} />
    </g>
  );
}

function Nightstand({ p, x, y = 0.18 }: { p: P; x: number; y?: number }) {
  return (
    <g>
      <Box at={[x, y, 0]} size={[0.45, 0.42, 0.5]} color={p.tint(C.wood)} shadow={p.shadow} />
      <Cylinder at={[x + 0.22, y + 0.2, 0.5]} r={0.05} h={0.18} color={p.tint('#8a8f99')} />
      <Cylinder at={[x + 0.22, y + 0.2, 0.66]} r={0.14} h={0.17} color={p.dark ? '#ffd27a' : p.tint(C.linen)} />
    </g>
  );
}

function Plant({ p, x, y, size = 1 }: { p: P; x: number; y: number; size?: number }) {
  return (
    <g>
      <Cylinder at={[x, y, 0]} r={0.17 * size} h={0.32 * size} color={p.tint(C.pot)} shadow={p.shadow} />
      <Ball at={[x - 0.05, y + 0.04, 0.55 * size]} r={0.26 * size} color={p.tint(C.leavesDark)} />
      <Ball at={[x + 0.06, y - 0.05, 0.72 * size]} r={0.24 * size} color={p.tint(C.plant)} />
    </g>
  );
}

/** Dining chair; `back` is the side its backrest is on. */
function Chair({ p, x, y, back, seat }: { p: P; x: number; y: number; back: 'x0' | 'x1' | 'y0' | 'y1'; seat: string }) {
  const rest: Record<typeof back, [number, number, number, number]> = {
    x0: [x - 0.02, y - 0.02, 0.06, 0.44],
    x1: [x + 0.38, y - 0.02, 0.06, 0.44],
    y0: [x - 0.02, y - 0.02, 0.44, 0.06],
    y1: [x - 0.02, y + 0.38, 0.44, 0.06],
  };
  const [bx, by, bw, bd] = rest[back];
  return (
    <g>
      <Box at={[x, y, 0]} size={[0.4, 0.4, 0.42]} color={p.tint(C.woodDark)} />
      <Box at={[x - 0.02, y - 0.02, 0.42]} size={[0.44, 0.44, 0.05]} color={p.tint(seat)} />
      <Box at={[bx, by, 0.47]} size={[bw, bd, 0.42]} color={p.tint(C.woodDark)} />
    </g>
  );
}

function Stool({ p, x, y }: { p: P; x: number; y: number }) {
  return (
    <g>
      <Cylinder at={[x, y, 0]} r={0.03} h={0.62} color={p.tint('#5e6673')} />
      <Cylinder at={[x, y, 0.62]} r={0.18} h={0.06} color={p.tint(C.woodDark)} />
    </g>
  );
}

/** Steps climbing from x = xBottom toward x = xTop, cut off (like the walls) at `cut`. */
function Stairs({ p, xBottom, xTop, y0, y1, cut = 1.2 }: { p: P; xBottom: number; xTop: number; y0: number; y1: number; cut?: number }) {
  const count = 6;
  const run = (xBottom - xTop) / count;
  const rise = cut / count;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = xBottom - (i + 1) * run;
        const h = (i + 1) * rise;
        return (
          <Box
            key={i}
            at={[x, y0, 0]}
            size={[run, y1 - y0, h]}
            color={p.tint(C.wood)}
            top={i === count - 1 ? p.poche : p.tint(shade(C.wood, 0.25))}
          />
        );
      })}
    </g>
  );
}

/** The stairwell seen from above: an opening with treads going down, behind a railing. */
function StairOpening({ p, x0, x1, y0, y1 }: { p: P; x0: number; x1: number; y0: number; y1: number }) {
  const steps = 8;
  return (
    <g>
      <FloorRect x0={x0} y0={y0} x1={x1} y1={y1} fill={p.dark ? '#141821' : p.tint('#c9b79f')} />
      <Face plane="z" at={0.004}>
        {Array.from({ length: steps - 1 }, (_, i) => {
          const x = x0 + ((i + 1) * (x1 - x0)) / steps;
          return <line key={i} x1={x} y1={y0} x2={x} y2={y1} stroke={p.dark ? '#262d3b' : p.tint('#b29e84')} strokeWidth={0.03} />;
        })}
      </Face>
      <Box at={[x0, y0 - 0.03, 0.9]} size={[x1 - x0, 0.06, 0.05]} color={p.tint(C.woodDark)} />
      {[x0, (x0 + x1) / 2, x1 - 0.04].map((x) => (
        <Box key={x} at={[x, y0 - 0.02, 0]} size={[0.04, 0.04, 0.9]} color={p.tint(C.woodDark)} />
      ))}
    </g>
  );
}

function Sink({ p, x, y, w, d, z }: { p: P; x: number; y: number; w: number; d: number; z: number }) {
  return (
    <Face plane="z" at={z + 0.001}>
      <rect x={x} y={y} width={w} height={d} rx={0.05} fill={p.tint('#a9b1ba')} />
      <rect x={x + 0.04} y={y + 0.04} width={w - 0.08} height={d - 0.08} rx={0.04} fill={p.tint('#c7ced6')} />
    </Face>
  );
}

function Toilet({ p, x, y }: { p: P; x: number; y: number }) {
  // Tank against the wall at y; bowl toward +y.
  return (
    <g>
      <Box at={[x, y, 0]} size={[0.48, 0.2, 0.78]} color={p.tint(C.porcelain)} shadow={p.shadow} />
      <Box at={[x + 0.04, y + 0.2, 0]} size={[0.4, 0.44, 0.4]} color={p.tint(C.porcelain)} shadow={p.shadow} />
      <Face plane="z" at={0.401}>
        <ellipse cx={x + 0.24} cy={y + 0.43} rx={0.14} ry={0.17} fill={p.tint('#dfe5ea')} />
      </Face>
    </g>
  );
}

function ClothesRail({ p, x0, x1, y }: { p: P; x0: number; x1: number; y: number }) {
  const colors = [C.terracotta, C.sage, C.lavender, C.rugBlue, '#f2b33a', C.linen];
  const items: ReactNode[] = [];
  for (let x = x0 + 0.05, i = 0; x < x1 - 0.12; x += 0.16, i++) {
    items.push(<Box key={i} at={[x, y - 0.22, 0.45]} size={[0.1, 0.44, 0.75]} color={p.tint(colors[i % colors.length])} />);
  }
  return (
    <g>
      <Box at={[x0, y + 0.22, 0]} size={[x1 - x0, 0.06, 1.25]} color={p.tint(C.woodDark)} />
      {items}
    </g>
  );
}

function SmokeAlarm({ p, x, y }: { p: P; x: number; y: number }) {
  return (
    <g>
      <Cylinder at={[x, y, 2.4]} r={0.13} h={0.05} color={p.tint('#ffffff')} />
      <Cylinder at={[x + 0.05, y + 0.05, 2.45]} r={0.025} h={0.005} color={p.status.ok} />
    </g>
  );
}

// ── Furniture by part of the floor (ids from PLAN) ───────────────────────────────────────────

export function partFurniture(id: string, p: P): ReactNode {
  const shadow = p.shadow;
  switch (id) {
    // Basement
    case 'family':
      return (
        <g>
          <FloorRect x0={0.6} y0={0.95} x1={2.95} y1={2.6} fill={p.tint(C.rug)} />
          <Cylinder at={[0.35, 0.45, 0]} r={0.14} h={0.03} color={p.tint('#5e6673')} />
          <Cylinder at={[0.35, 0.45, 0.03]} r={0.022} h={1.28} color={p.tint('#5e6673')} />
          <Cylinder at={[0.35, 0.45, 1.3]} r={0.22} h={0.3} color={p.dark ? '#ffd27a' : p.tint(C.linen)} />
          {/* sofa against the right wall */}
          <Box at={[0.7, 0.2, 0]} size={[0.22, 0.9, 0.62]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[0.92, 0.2, 0]} size={[1.76, 0.9, 0.42]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[0.92, 0.2, 0.42]} size={[1.76, 0.24, 0.42]} color={p.tint(C.sofa)} />
          <Box at={[0.94, 0.44, 0.42]} size={[0.86, 0.62, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[1.82, 0.44, 0.42]} size={[0.84, 0.62, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[1.0, 0.46, 0.52]} size={[0.4, 0.13, 0.28]} color={p.tint(C.terracotta)} />
          <Box at={[2.68, 0.2, 0]} size={[0.22, 0.9, 0.62]} color={p.tint(C.sofa)} />
          <Box at={[1.35, 1.55, 0]} size={[0.9, 0.5, 0.3]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Box at={[1.25, 1.47, 0.3]} size={[1.1, 0.66, 0.06]} color={p.tint(C.wood)} />
          <Box at={[1.45, 1.6, 0.36]} size={[0.32, 0.24, 0.05]} color={p.tint(C.terracotta)} />
          <Plant p={p} x={3.15} y={0.45} />
        </g>
      );
    case 'laundry':
      return (
        <g>
          {/* dryer, then washer, facing the family room through bifold doors */}
          {[0.42, 1.3].map((x, i) => (
            <g key={x}>
              <Box at={[x, 3.18, 0]} size={[0.82, 0.78, 0.92]} color={p.tint(C.appliance)} shadow={shadow} />
              <Face plane="z" at={0.921}>
                <rect x={x + 0.04} y={3.8} width={0.74} height={0.12} fill={p.tint('#e3e7eb')} />
                <circle cx={x + 0.62} cy={3.86} r={0.035} fill={p.tint(i ? '#2f6fe0' : C.red)} />
              </Face>
            </g>
          ))}
        </g>
      );
    case 'mechanical':
      return (
        <g>
          {/* heat pump indoor unit (air handler) */}
          <Box at={[0.15, 4.15, 0]} size={[0.8, 0.8, 1.65]} color={p.tint(C.heatPump)} shadow={shadow} />
          <Face plane="y" at={4.95}>
            {Array.from({ length: 7 }, (_, i) => (
              <rect key={i} x={0.24} y={0.18 + i * 0.09} width={0.62} height={0.03} fill={p.tint('#b8c0ca')} />
            ))}
            <rect x={0.22} y={0.9} width={0.66} height={0.02} fill={p.tint('#b8c0ca')} />
            <rect x={0.35} y={1.22} width={0.32} height={0.14} fill={p.tint('#ffffff')} />
            <circle cx={0.78} cy={1.29} r={0.04} fill={p.status.ok} />
          </Face>
          {/* hot water tank */}
          <Cylinder at={[1.75, 4.72, 0]} r={0.36} h={1.5} color={p.tint(C.tank)} shadow={shadow} />
          {(() => {
            const [sx, sy] = project(1.75, 4.72, 0);
            return (
              <g>
                <rect x={sx - 0.14} y={sy - 1.0} width={0.28} height={0.36} rx={0.03} fill={p.tint('#e6eaee')} />
                <rect x={sx - 0.1} y={sy - 0.94} width={0.2} height={0.06} fill={p.tint(C.red)} />
                <rect x={sx - 0.1} y={sy - 0.84} width={0.2} height={0.04} fill={p.tint('#2f6fe0')} />
                <circle cx={sx} cy={sy - 0.12} r={0.05} fill={p.tint(C.copper)} />
              </g>
            );
          })()}
        </g>
      );
    case 'sump':
      return (
        <g>
          <Face plane="z" at={0.003}>
            <circle cx={0.55} cy={6.0} r={0.3} fill={p.tint('#7d8691')} />
            <circle cx={0.55} cy={6.0} r={0.24} fill={p.dark ? '#151a22' : p.tint('#4c5560')} />
          </Face>
          <Cylinder at={[0.55, 6.0, 0]} r={0.12} h={0.32} color={p.tint('#2f6fe0')} />
          <Cylinder at={[0.42, 6.12, 0.3]} r={0.035} h={1.6} color={p.tint('#e9ecef')} />
        </g>
      );
    case 'basement-stairs':
      return <Stairs p={p} xBottom={3.45} xTop={1.2} y0={5.45} y1={6.55} />;
    case 'garage':
      return (
        <g>
          <Face plane="z" at={0.003}>
            <ellipse cx={7.4} cy={3.25} rx={0.5} ry={0.3} fill="#000" opacity={0.05} />
          </Face>
          {/* shelving under the pegboard */}
          <Box at={[3.75, 0.16, 0]} size={[1.0, 0.46, 1.45]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Face plane="y" at={0.62}>
            {[0.48, 0.96].map((v) => (
              <rect key={v} x={3.75} y={v} width={1.0} height={0.04} fill={p.tint(shade(C.woodDark, 0.25))} />
            ))}
            {[
              [3.82, 0.05, C.terracotta],
              [4.28, 0.05, C.sage],
              [3.95, 0.53, C.steel],
              [4.35, 1.01, '#f2b33a'],
            ].map(([u, v, color]) => (
              <rect key={`${u}-${v}`} x={u as number} y={v as number} width={0.36} height={0.36} fill={p.tint(color as string)} />
            ))}
          </Face>
          {/* bins */}
          <Box at={[8.75, 0.25, 0]} size={[0.55, 0.6, 0.95]} color={p.tint('#4f9a5c')} shadow={shadow} />
          <Box at={[9.38, 0.25, 0]} size={[0.55, 0.6, 0.95]} color={p.tint('#3f78c6')} shadow={shadow} />
          <Car p={p} x={4.95} y={2.35} />
        </g>
      );

    // Ground floor
    case 'living':
      return (
        <g>
          <FloorRect x0={0.6} y0={0.9} x1={2.8} y1={3.1} fill={p.tint(C.rug)} />
          <FloorRect x0={0.77} y0={1.07} x1={2.63} y1={2.93} fill={p.tint(shade(C.rug, 0.18))} />
          {/* floor lamp and sofa along the party wall, facing the room; the patio door stays clear */}
          <Cylinder at={[0.3, 0.32, 0]} r={0.025} h={1.35} color={p.tint('#1b1c1f')} />
          <Cylinder at={[0.3, 0.32, 1.35]} r={0.18} h={0.26} color={p.tint('#f3eadb')} />
          <Box at={[0.55, 0.15, 0]} size={[0.22, 0.9, 0.62]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[0.77, 0.15, 0]} size={[1.66, 0.9, 0.42]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[0.77, 0.15, 0.42]} size={[1.66, 0.24, 0.45]} color={p.tint(C.sofa)} />
          <Box at={[0.79, 0.41, 0.42]} size={[0.8, 0.62, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[1.62, 0.41, 0.42]} size={[0.79, 0.62, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[0.95, 0.42, 0.52]} size={[0.42, 0.13, 0.3]} color={p.tint(C.terracotta)} />
          <Box at={[1.95, 0.42, 0.52]} size={[0.42, 0.13, 0.3]} color={p.tint(C.sage)} />
          <Box at={[2.43, 0.15, 0]} size={[0.22, 0.9, 0.62]} color={p.tint(C.sofa)} />
          {/* coffee table */}
          <Box at={[1.3, 1.45, 0]} size={[0.96, 0.5, 0.3]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Box at={[1.18, 1.35, 0.3]} size={[1.2, 0.7, 0.06]} color={p.tint(C.wood)} />
          <Box at={[1.4, 1.48, 0.36]} size={[0.36, 0.26, 0.05]} color={p.tint(C.terracotta)} />
          <Cylinder at={[1.95, 1.75, 0.36]} r={0.05} h={0.09} color={p.tint('#ffffff')} />
          {/* armchair facing the sofa + side table with the radon monitor */}
          <Box at={[1.95, 3.0, 0]} size={[0.75, 0.75, 0.4]} color={p.tint(C.cushion)} shadow={shadow} />
          <Box at={[1.95, 3.59, 0.4]} size={[0.75, 0.16, 0.4]} color={p.tint(C.cushion)} />
          <Box at={[2.8, 3.3, 0]} size={[0.4, 0.4, 0.5]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[2.88, 3.38, 0.5]} size={[0.16, 0.12, 0.1]} color={p.tint('#ffffff')} />
          <Plant p={p} x={0.35} y={3.85} size={1.1} />
        </g>
      );
    case 'dining':
      return (
        <g>
          {[
            [3.85, 1.68],
            [5.45, 1.68],
            [3.85, 2.5],
            [5.45, 2.5],
          ].map(([x, y]) => (
            <Box key={`${x}-${y}`} at={[x, y, 0]} size={[0.06, 0.06, 0.7]} color={p.tint(C.woodDark)} />
          ))}
          <Chair p={p} x={3.95} y={1.05} back="y0" seat={C.cushion} />
          <Chair p={p} x={4.85} y={1.05} back="y0" seat={C.cushion} />
          <Chair p={p} x={3.3} y={1.9} back="x0" seat={C.cushion} />
          <FloorRect x0={3.8} y0={1.65} x1={5.6} y1={2.6} fill={shadow} />
          <Box at={[3.75, 1.6, 0.7]} size={[1.8, 0.95, 0.06]} color={p.tint(C.wood)} />
          <Cylinder at={[4.65, 2.07, 0.76]} r={0.17} h={0.07} color={p.tint('#ffffff')} />
          <Ball at={[4.6, 2.04, 0.86]} r={0.06} color={p.tint(C.red)} />
          <Ball at={[4.71, 2.1, 0.86]} r={0.06} color={p.tint('#f2b33a')} />
          <Chair p={p} x={5.75} y={1.9} back="x1" seat={C.cushion} />
          <Chair p={p} x={3.95} y={2.7} back="y1" seat={C.cushion} />
          <Chair p={p} x={4.85} y={2.7} back="y1" seat={C.cushion} />
        </g>
      );
    case 'kitchen':
      return (
        <g>
          {/* fridge */}
          <Box at={[6.45, 0.16, 0]} size={[0.88, 0.74, 1.85]} color={p.tint('#eef1f4')} shadow={shadow} />
          <Face plane="y" at={0.9}>
            <rect x={6.45} y={1.15} width={0.88} height={0.015} fill={p.tint('#c9cfd6')} />
            <rect x={7.22} y={1.3} width={0.03} height={0.35} fill={p.tint('#9aa0a8')} />
            <rect x={7.22} y={0.7} width={0.03} height={0.35} fill={p.tint('#9aa0a8')} />
          </Face>
          {/* counter run with the range */}
          <Box at={[7.35, 0.16, 0]} size={[2.6, 0.62, 0.86]} color={p.tint(C.cabinet)} shadow={shadow} />
          <Face plane="y" at={0.78}>
            <rect x={7.35} y={0} width={2.6} height={0.08} fill={p.tint('#d9d3ca')} />
            {[7.75, 8.15, 9.0, 9.45].map((u) => (
              <rect key={u} x={u} y={0.08} width={0.015} height={0.78} fill={p.tint('#ddd7ce')} />
            ))}
            {[7.48, 7.88, 9.15, 9.6].map((u) => (
              <rect key={u} x={u} y={0.66} width={0.16} height={0.03} fill={p.tint('#9aa0a8')} />
            ))}
            <rect x={8.18} y={0.08} width={0.8} height={0.76} fill={p.tint('#e9ecef')} />
            <rect x={8.25} y={0.14} width={0.66} height={0.45} fill={p.dark ? '#151a22' : '#3d4652'} />
            {[8.32, 8.48, 8.64, 8.8].map((u) => (
              <circle key={u} cx={u} cy={0.72} r={0.035} fill={p.tint('#5e6673')} />
            ))}
          </Face>
          <Box at={[7.33, 0.14, 0.86]} size={[2.64, 0.66, 0.06]} color={p.tint(C.counter)} />
          <Face plane="z" at={0.921}>
            {[
              [8.38, 0.32],
              [8.76, 0.32],
              [8.38, 0.6],
              [8.76, 0.6],
            ].map(([u, v]) => (
              <g key={`${u}-${v}`}>
                <circle cx={u} cy={v} r={0.11} fill={p.tint('#4a515c')} />
                <circle cx={u} cy={v} r={0.05} fill={p.tint('#2c3138')} />
              </g>
            ))}
          </Face>
          {/* island with the sink (dishwasher on the far side) */}
          <Box at={[6.5, 1.95, 0]} size={[2.35, 0.95, 0.86]} color={p.tint(C.cabinet)} shadow={shadow} />
          <Face plane="y" at={2.9}>
            <rect x={6.5} y={0.62} width={2.35} height={0.012} fill={p.tint('#ddd7ce')} />
          </Face>
          <Box at={[6.46, 1.91, 0.86]} size={[2.43, 1.03, 0.06]} color={p.tint(C.counter)} />
          <Sink p={p} x={7.12} y={2.08} w={0.72} d={0.46} z={0.92} />
          <Face plane="z" at={0.922}>
            <rect x={7.47} y={2.1} width={0.02} height={0.42} fill={p.tint('#a9b1ba')} />
          </Face>
          <Cylinder at={[7.48, 2.0, 0.92]} r={0.03} h={0.32} color={p.tint(C.steel)} />
          {[6.95, 7.5, 8.15].map((x) => (
            <Stool key={x} p={p} x={x} y={3.22} />
          ))}
          {/* fire extinguisher by the front */}
          <Cylinder at={[9.75, 3.75, 0]} r={0.09} h={0.46} color={p.tint(C.red)} shadow={shadow} />
          <Cylinder at={[9.75, 3.75, 0.46]} r={0.04} h={0.07} color={p.tint('#2c3138')} />
        </g>
      );
    case 'ground-stairs':
      return (
        <g>
          <Stairs p={p} xBottom={3.45} xTop={1.25} y0={4.2} y1={5.3} />
          <StairOpening p={p} x0={1.1} x1={3.3} y0={5.45} y1={6.5} />
        </g>
      );
    case 'entry':
      return (
        <g>
          <FloorRect x0={4.7} y0={6.0} x1={5.5} y1={6.55} fill={p.tint(C.mat)} />
          {/* closet */}
          <Box at={[5.68, 4.18, 0]} size={[1.18, 0.86, LOW_WALL]} color={p.wallLeft} top={p.poche} left={p.tint(C.cabinet)} right={p.wallLeft} />
          <Face plane="y" at={5.04}>
            {[5.98, 6.27, 6.56].map((u) => (
              <rect key={u} x={u} y={0} width={0.012} height={LOW_WALL} fill={p.tint('#d8d2c8')} />
            ))}
          </Face>
          {/* bench + shoes */}
          <Box at={[3.75, 6.05, 0]} size={[0.85, 0.42, 0.45]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[3.82, 5.7, 0]} size={[0.12, 0.22, 0.1]} color={p.tint('#4a4a52')} />
          <Box at={[4.02, 5.7, 0]} size={[0.12, 0.22, 0.1]} color={p.tint('#4a4a52')} />
          <Plant p={p} x={6.6} y={6.3} />
        </g>
      );
    case 'entry-hall':
      return <FloorRect x0={7.05} y0={5.8} x1={8.3} y1={6.4} fill={p.tint(C.rugBlue)} />;
    case 'powder':
      return (
        <g>
          <Box at={[6.98, 4.18, 0]} size={[0.52, 0.45, 0.82]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[6.96, 4.16, 0.82]} size={[0.56, 0.49, 0.05]} color={p.tint(C.porcelain)} />
          <Face plane="z" at={0.871}>
            <ellipse cx={7.24} cy={4.42} rx={0.16} ry={0.13} fill={p.tint('#dfe5ea')} />
          </Face>
          <Toilet p={p} x={7.8} y={4.18} />
        </g>
      );
    case 'ground-closet':
      return (
        <g>
          <Box at={[8.55, 4.6, 0]} size={[0.42, 2.0, 1.1]} color={p.tint(C.wood)} shadow={shadow} />
          <Face plane="x" at={8.97}>
            {[0.35, 0.72].map((v) => (
              <rect key={v} x={4.6} y={v} width={2.0} height={0.03} fill={p.tint(C.woodDark)} />
            ))}
            {[
              [4.75, 0.05, C.terracotta],
              [5.3, 0.05, C.sage],
              [5.9, 0.42, C.rugBlue],
              [4.9, 0.79, '#f2b33a'],
            ].map(([u, v, color]) => (
              <rect key={`${u}-${v}`} x={u as number} y={v as number} width={0.4} height={0.26} fill={p.tint(color as string)} />
            ))}
          </Face>
        </g>
      );

    // Upper floor
    case 'bedroom2':
      return (
        <g>
          {/* home office: bookshelf, loveseat, desk under the back window */}
          <FloorRect x0={0.95} y0={1.2} x1={2.2} y1={2.95} fill={p.tint(C.rugBlue)} />
          <Box at={[0.3, 0.12, 0]} size={[1.6, 0.35, 1.9]} color={p.tint(shade(C.wood, 0.15))} shadow={shadow} />
          <Face plane="y" at={0.47}>
            {[0.45, 0.95, 1.45].flatMap((v, row) =>
              [0, 1, 2].map((i) => (
                <rect key={`${row}-${i}`} x={0.38 + i * 0.5} y={v} width={0.42} height={0.3} fill={p.tint([C.terracotta, C.sage, C.rugBlue, C.lavender][(i + row) % 4])} />
              )),
            )}
          </Face>
          <Plant p={p} x={2.05} y={0.4} />
          <Box at={[2.35, 0.45, 0]} size={[0.75, 0.18, 0.6]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[2.35, 0.62, 0]} size={[0.75, 1.46, 0.42]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[2.85, 0.62, 0.42]} size={[0.24, 1.46, 0.45]} color={p.tint(C.sofa)} />
          <Box at={[2.4, 1.0, 0.42]} size={[0.42, 0.7, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[2.35, 2.07, 0]} size={[0.75, 0.18, 0.6]} color={p.tint(C.sofa)} />
          <Box at={[0.12, 1.52, 0]} size={[0.62, 0.45, 0.72]} color={p.tint(C.cabinet)} shadow={shadow} />
          <Box at={[0.12, 3.02, 0]} size={[0.05, 0.05, 0.72]} color={p.tint(C.woodDark)} />
          <Box at={[0.7, 3.02, 0]} size={[0.05, 0.05, 0.72]} color={p.tint(C.woodDark)} />
          <Box at={[0.1, 1.5, 0.72]} size={[0.7, 1.6, 0.04]} color={p.tint(C.wood)} />
          <Box at={[0.18, 2.0, 0.76]} size={[0.04, 0.62, 0.38]} color={p.tint('#15181d')} />
          <Box at={[0.42, 2.72, 0.76]} size={[0.3, 0.24, 0.02]} color={p.tint(C.steel)} />
          <Chair p={p} x={1.15} y={2.3} back="x1" seat="#2b2d31" />
        </g>
      );
    case 'bedroom2-closet':
      return <ClothesRail p={p} x0={0.3} x1={2.3} y={3.85} />;
    case 'bathroom':
      return (
        <g>
          <FloorRect x0={4.3} y0={0.5} x1={4.85} y1={1.25} fill={p.tint(C.sage)} />
          {/* bathtub */}
          <Box at={[5.05, 0.18, 0]} size={[0.95, 1.6, 0.56]} color={p.tint(C.porcelain)} shadow={shadow} />
          <Face plane="z" at={0.561}>
            <rect x={5.14} y={0.27} width={0.77} height={1.42} rx={0.18} fill={p.tint('#dfe5ea')} />
            <rect x={5.19} y={0.32} width={0.67} height={1.32} rx={0.15} fill={p.tint(C.water)} opacity={0.85} />
          </Face>
          {/* vanity + toilet along the back partition */}
          <Box at={[3.27, 1.25, 0]} size={[0.55, 0.95, 0.82]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[3.25, 1.23, 0.82]} size={[0.59, 0.99, 0.05]} color={p.tint(C.porcelain)} />
          <Face plane="z" at={0.871}>
            <ellipse cx={3.55} cy={1.72} rx={0.16} ry={0.26} fill={p.tint('#dfe5ea')} />
          </Face>
          <Box at={[3.27, 0.3, 0]} size={[0.2, 0.48, 0.78]} color={p.tint(C.porcelain)} />
          <Box at={[3.47, 0.34, 0]} size={[0.44, 0.4, 0.4]} color={p.tint(C.porcelain)} shadow={shadow} />
          {/* glass shower */}
          <Box at={[5.05, 1.88, 0]} size={[0.95, 1.3, 0.08]} color={p.tint(C.porcelain)} />
          <Cylinder at={[5.9, 3.08, 0.08]} r={0.025} h={1.78} color={p.tint(C.steel)} />
          <Cylinder at={[5.8, 3.0, 1.8]} r={0.09} h={0.03} color={p.tint(C.steel)} />
          {[
            [
              [5.05, 1.88, 0.08],
              [5.05, 3.18, 0.08],
              [5.05, 3.18, 1.95],
              [5.05, 1.88, 1.95],
            ],
            [
              [5.05, 1.88, 0.08],
              [6.0, 1.88, 0.08],
              [6.0, 1.88, 1.95],
              [5.05, 1.88, 1.95],
            ],
          ].map((face, i) => (
            <polygon
              key={i}
              points={pts(face as [number, number, number][])}
              fill={p.dark ? '#7fa7c6' : '#bfe0f2'}
              opacity={0.3}
              stroke={p.tint('#c7d3dc')}
              strokeWidth={0.025}
            />
          ))}
        </g>
      );
    case 'upper-hall':
      return <FloorRect x0={2.7} y0={3.55} x1={5.8} y1={4.05} fill={p.tint(C.rug)} />;
    case 'upper-stairs':
      return <StairOpening p={p} x0={0.35} x1={3.0} y0={5.3} y1={6.5} />;
    case 'bedroom1':
      return (
        <g>
          <FloorRect x0={6.85} y0={1.9} x1={9.25} y1={3.15} fill={p.tint(C.rug)} />
          <Nightstand p={p} x={6.6} />
          <Bed p={p} x={7.15} width={1.8} blanket={C.terracotta} double />
          <Nightstand p={p} x={9.05} />
          <Box at={[9.45, 2.55, 0]} size={[0.45, 1.3, 0.85]} color={p.tint(C.wood)} shadow={shadow} />
          <Face plane="x" at={9.9}>
            {[0.3, 0.58].map((v) => (
              <rect key={v} x={2.55} y={v} width={1.3} height={0.015} fill={p.tint(C.woodDark)} />
            ))}
          </Face>
          <Plant p={p} x={9.65} y={3.95} size={0.9} />
        </g>
      );
    case 'bedroom3':
      return (
        <g>
          {/* closet with bifold doors */}
          <Box at={[3.55, 4.45, 0]} size={[0.6, 1.95, 1.2]} color={p.tint(C.cabinet)} top={p.poche} shadow={shadow} />
          <Face plane="x" at={4.15}>
            {[4.94, 5.42, 5.9].map((u) => (
              <rect key={u} x={u} y={0} width={0.012} height={1.2} fill={p.tint('#d8d2c8')} />
            ))}
          </Face>
          <FloorRect x0={5.05} y0={5.3} x1={6.95} y1={6.3} fill={p.tint(C.rug)} />
          <Bed p={p} x={5.35} y={4.42} width={1.35} blanket={C.lavender} />
          {/* desk */}
          <Box at={[7.15, 5.55, 0]} size={[0.5, 0.06, 0.72]} color={p.tint(C.woodDark)} />
          <Box at={[7.15, 6.45, 0]} size={[0.5, 0.06, 0.72]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Box at={[7.12, 5.52, 0.72]} size={[0.56, 1.02, 0.05]} color={p.tint(C.wood)} />
          <Box at={[7.3, 5.8, 0.77]} size={[0.3, 0.44, 0.02]} color={p.tint('#3d4652')} />
          <Chair p={p} x={6.62} y={5.85} back="x0" seat={C.sofa} />
        </g>
      );
    case 'walk-in':
      return (
        <g>
          <ClothesRail p={p} x0={7.95} x1={9.9} y={6.2} />
          <Box at={[9.5, 4.45, 0]} size={[0.42, 1.1, 0.95]} color={p.tint(C.wood)} shadow={shadow} />
        </g>
      );
    default:
      return null;
  }
}

/** Things hung on walls or the ceiling; they only make sense once the walls are full height. */
export function partMounted(id: string, p: P): ReactNode {
  switch (id) {
    case 'kitchen':
      return (
        <g>
          <Box at={[7.35, 0.16, 1.45]} size={[0.8, 0.36, 0.75]} color={p.tint(C.cabinet)} />
          <Box at={[9.02, 0.16, 1.45]} size={[0.93, 0.36, 0.75]} color={p.tint(C.cabinet)} />
          <Box at={[8.2, 0.14, 1.78]} size={[0.76, 0.5, 0.2]} color={p.tint(C.steel)} />
          <Box at={[8.43, 0.14, 1.98]} size={[0.3, 0.26, 0.62]} color={p.tint(C.steel)} />
          {[6.95, 7.65, 8.35].map((x) => (
            <g key={x}>
              <Line from={[x, 2.42, 2.6]} to={[x, 2.42, 1.75]} stroke={p.tint('#5e6673')} width={0.02} />
              <Cylinder at={[x, 2.42, 1.6]} r={0.11} h={0.15} color={p.dark ? '#ffd27a' : p.tint('#3d4652')} />
            </g>
          ))}
        </g>
      );
    case 'dining':
      return (
        <g>
          <Line from={[4.65, 2.07, 2.6]} to={[4.65, 2.07, 1.85]} stroke={p.tint('#5e6673')} width={0.02} />
          <Cylinder at={[4.65, 2.07, 1.6]} r={0.3} h={0.25} color={p.dark ? '#ffd27a' : p.tint(C.linen)} />
        </g>
      );
    case 'mechanical':
      return (
        <g>
          <Box at={[0.25, 4.15, 1.65]} size={[0.6, 0.6, 0.95]} color={p.tint(C.duct)} />
          <Cylinder at={[1.6, 4.55, 1.5]} r={0.035} h={1.1} color={p.tint(C.copper)} />
          <Cylinder at={[1.9, 4.65, 1.5]} r={0.035} h={1.1} color={p.tint(C.copper)} />
          {/* air exchanger on its wall bracket, with its four ducts */}
          <Box at={[0.3, 4.98, 1.45]} size={[0.75, 0.34, 0.45]} color={p.tint('#f4f6f8')} />
          {[0.42, 0.62, 0.82].map((x) => (
            <Cylinder key={x} at={[x, 5.15, 1.9]} r={0.06} h={0.7} color={p.tint(C.duct)} />
          ))}
        </g>
      );
    case 'basement-hall':
      return <SmokeAlarm p={p} x={2.85} y={3.5} />;
    case 'ground-stairs':
      return <SmokeAlarm p={p} x={2.0} y={4.6} />;
    case 'upper-hall':
      return <SmokeAlarm p={p} x={4.2} y={3.8} />;
    case 'bathroom':
      return (
        <g>
          <Box at={[4.25, 1.45, 2.42]} size={[0.32, 0.32, 0.04]} color={p.tint('#ffffff')} />
          <Box at={[3.21, 1.35, 1.1]} size={[0.04, 0.75, 0.85]} color={p.tint(p.dark ? '#5b6b7d' : '#cfe2ee')} />
        </g>
      );
    default:
      return null;
  }
}

// ── Front walls (cut low) and what sits in front of them ────────────────────────────────────

function WallRun({ p, axis, from, to, color }: { p: P; axis: 'x' | 'y'; from: number; to: number; color: string }) {
  // axis 'x': the left exterior wall along x at y = D; axis 'y': the front wall along y at x = W.
  return axis === 'x' ? (
    <Box at={[from, D - T, 0]} size={[to - from, T, LOW_WALL]} color={color} left={color} right={p.poche} top={p.poche} />
  ) : (
    <Box at={[W - T, from, 0]} size={[T, to - from, LOW_WALL]} color={color} left={p.poche} right={color} top={p.poche} />
  );
}

export function FrontWalls({ level, p }: { level: LevelKey; p: P }) {
  const wall = p.wallExterior;
  if (level === 'basement') {
    // Overhead garage door in the front wall.
    const [d0, d1] = [0.75, 5.7];
    return (
      <g>
        <WallRun p={p} axis="x" from={0} to={W} color={wall} />
        <WallRun p={p} axis="y" from={0} to={d0} color={wall} />
        <Box at={[W - T, d0, 0]} size={[T, d1 - d0, LOW_WALL]} color={p.tint(C.garageDoor)} left={p.poche} right={p.tint(C.garageDoor)} top={p.poche} />
        <Face plane="x" at={W}>
          {[0.24, 0.48].map((v) => (
            <rect key={v} x={d0} y={v} width={d1 - d0} height={0.03} fill={p.tint('#cdd2d8')} />
          ))}
        </Face>
        <WallRun p={p} axis="y" from={d1} to={D} color={wall} />
      </g>
    );
  }
  if (level === 'ground') {
    // Side entry door, opening onto the landing of the outdoor steps.
    const [d0, d1] = [4.65, 5.5];
    return (
      <g>
        <WallRun p={p} axis="x" from={0} to={d0} color={wall} />
        <Box at={[d0, D - T, 0]} size={[d1 - d0, T, LOW_WALL]} color={p.tint(C.door)} left={p.tint(C.door)} right={p.poche} top={p.poche} />
        <Face plane="y" at={D}>
          <rect x={d0 + 0.1} y={0.08} width={d1 - d0 - 0.2} height={0.5} fill={p.tint(shade(C.door, -0.12))} />
          <circle cx={d1 - 0.14} cy={0.6} r={0.045} fill={p.tint('#e2c26c')} />
        </Face>
        <WallRun p={p} axis="x" from={d1} to={W} color={wall} />
        <WallRun p={p} axis="y" from={0} to={D} color={wall} />
        <Box at={[4.2, D, -0.16]} size={[1.75, 0.95, 0.1]} color={p.tint(C.stone)} />
        <Box at={[4.2, D + 0.92, -0.06]} size={[1.75, 0.04, 0.85]} color={p.tint('#5e6673')} top={p.tint('#5e6673')} />
      </g>
    );
  }
  return (
    <g>
      <WallRun p={p} axis="x" from={0} to={W} color={wall} />
      <WallRun p={p} axis="y" from={0} to={D} color={wall} />
    </g>
  );
}

// ── Yard (behind the house, part of the ground storey) ──────────────────────────────────────

export function Yard({ p }: { p: P }) {
  const { x0, x1, y0, y1, thickness } = YARD;
  const stripes: ReactNode[] = [];
  for (let i = 0, x = x0; x < x1; i++, x += 0.75) {
    if (i % 2) stripes.push(<rect key={i} x={x} y={y0} width={Math.min(0.75, x1 - x)} height={y1 - y0} fill={p.grassStripe} />);
  }
  return (
    <g>
      <Box at={[x0, y0, -thickness]} size={[x1 - x0, y1 - y0, thickness]} color={p.soil} top={p.grass} />
      <Face plane="z" at={0.001}>
        {stripes}
        {[
          [-0.6, 3.9],
          [-1.3, 4.3],
          [-2.0, 4.7],
        ].map(([u, v]) => (
          <ellipse key={u} cx={u} cy={v} rx={0.28} ry={0.2} fill={p.tint(C.stone)} />
        ))}
      </Face>
      {/* fences: back and right side */}
      <Box at={[x0, y0, 0]} size={[0.07, y1 - y0, 0.78]} color={p.tint(C.fence)} />
      <Face plane="x" at={x0 + 0.07}>
        {[0.26, 0.52].map((v) => (
          <rect key={v} x={y0} y={v} width={y1 - y0} height={0.02} fill={p.tint(shade(C.fence, -0.15))} />
        ))}
      </Face>
      <Box at={[x0 + 0.07, y0, 0]} size={[x1 - x0 - 0.07, 0.07, 0.78]} color={p.tint(C.fence)} />
      {/* heat pump outdoor unit on its pad */}
      <Box at={[-1.75, 0.6, 0]} size={[1.18, 0.92, 0.08]} color={p.tint(C.stone)} />
      <Box at={[-1.69, 0.66, 0.08]} size={[1.06, 0.8, 0.86]} color={p.tint(C.heatPump)} shadow={p.shadow} />
      <Face plane="z" at={0.941}>
        <circle cx={-1.16} cy={1.06} r={0.31} fill={p.tint('#b8c0ca')} />
        <circle cx={-1.16} cy={1.06} r={0.26} fill={p.tint('#8c96a3')} />
        {[0, 45, 90, 135].map((a) => (
          <rect key={a} x={-1.18} y={0.81} width={0.04} height={0.5} fill={p.tint('#c9cfd6')} transform={`rotate(${a} -1.16 1.06)`} />
        ))}
      </Face>
      <Face plane="x" at={-0.63}>
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={0.72} y={0.2 + i * 0.1} width={0.68} height={0.035} fill={p.tint('#b8c0ca')} />
        ))}
      </Face>
      {/* hose reel by the back wall */}
      <Cylinder at={[-0.45, 5.5, 0]} r={0.2} h={0.16} color={p.tint('#4f9a5c')} shadow={p.shadow} />
      {/* patio table */}
      <Cylinder at={[-2.4, 2.4, 0]} r={0.04} h={0.7} color={p.tint('#5e6673')} />
      <Cylinder at={[-2.4, 2.4, 0.7]} r={0.42} h={0.04} color={p.tint('#f4f1ea')} />
      {/* tree in the far corner */}
      <Cylinder at={[-3.85, 6.3, 0]} r={0.11} h={1.3} color={p.tint(C.trunk)} shadow={p.shadow} />
      <Ball at={[-3.7, 6.1, 1.85]} r={0.6} color={p.tint(C.leavesDark)} />
      <Ball at={[-4.0, 6.45, 2.0]} r={0.68} color={p.tint(C.leaves)} />
      <Ball at={[-3.6, 6.55, 1.55]} r={0.48} color={p.tint(C.leaves)} />
    </g>
  );
}

// ── Roof (z = 0 at the eaves) ────────────────────────────────────────────────────────────────

export function Roof({ p }: { p: P }) {
  const o = ROOF.overhang;
  const rise = ROOF.rise;
  const th = 0.16;
  const ridgeY = D / 2;
  const span = D / 2 + o;
  const heightAt = (y: number) => (rise * (D + o - Math.max(y, ridgeY))) / span;
  const courses: ReactNode[] = [];
  for (let k = 1; k < 12; k++) {
    const s = k / 12;
    const y = D + o - s * span;
    const z = th + s * rise;
    const [ax, ay] = project(-o, y, z);
    const [bx, by] = project(W + o, y, z);
    courses.push(<line key={k} x1={ax} y1={ay} x2={bx} y2={by} stroke={p.roofLine} strokeWidth={0.035} />);
  }
  const sky = (y: number) => heightAt(y) + th + 0.005;
  return (
    <g>
      {/* gable end wall over the street-facing front */}
      <polygon
        points={pts([
          [W, 0, 0],
          [W, D, 0],
          [W, D, heightAt(D)],
          [W, ridgeY, rise],
          [W, 0, heightAt(D)],
        ])}
        fill={p.gable}
      />
      <Face plane="x" at={W}>
        <circle cx={ridgeY} cy={1.2} r={0.24} fill={shade(p.gable, -0.12)} />
        {[-0.1, 0, 0.1].map((d) => (
          <rect key={d} x={ridgeY - 0.16} y={1.18 + d} width={0.32} height={0.03} fill={p.gable} />
        ))}
      </Face>
      <polygon
        points={pts([
          [W + o, -o, 0],
          [W + o, ridgeY, rise],
          [W + o, ridgeY, rise + th],
          [W + o, -o, th],
        ])}
        fill={p.ridge}
      />
      <polygon
        points={pts([
          [-o, D + o, th],
          [W + o, D + o, th],
          [W + o, ridgeY, rise + th],
          [-o, ridgeY, rise + th],
        ])}
        fill={p.roof}
      />
      {courses}
      {/* skylight over the stairs */}
      <polygon
        points={pts([
          [1.2, 4.4, sky(4.4)],
          [2.2, 4.4, sky(4.4)],
          [2.2, 5.2, sky(5.2)],
          [1.2, 5.2, sky(5.2)],
        ])}
        fill={p.dark ? '#ffd27a' : '#cfe6f3'}
        stroke={p.windowFrame}
        strokeWidth={0.05}
      />
      <Cylinder at={[6.4, 4.2, sky(4.2)]} r={0.07} h={0.36} color={p.metal} />
      <Box at={[-o, ridgeY - 0.1, rise + th - 0.04]} size={[W + 2 * o, 0.2, 0.08]} color={p.ridge} />
      <polygon
        points={pts([
          [-o, D + o, 0],
          [W + o, D + o, 0],
          [W + o, D + o, th],
          [-o, D + o, th],
        ])}
        fill={p.ridge}
      />
      <polygon
        points={pts([
          [W + o, D + o, 0],
          [W + o, ridgeY, rise],
          [W + o, ridgeY, rise + th],
          [W + o, D + o, th],
        ])}
        fill={shade(p.ridge, -0.1)}
      />
      {/* gutter + downspout */}
      <Box at={[-o, D + o, -0.13]} size={[W + 2 * o, 0.14, 0.13]} color={p.metal} />
      <Box at={[W + o - 0.16, D + o + 0.02, -0.55]} size={[0.1, 0.1, 0.42]} color={p.metal} />
    </g>
  );
}
