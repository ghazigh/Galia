import type { ReactNode } from 'react';
import type { ZoneId } from '@shared/types';
import { project, pts, shade } from './iso';
import { D, LOW_WALL, ROOF, T, W, YARD } from './model';
import { C, type HousePalette } from './palette';
import { Ball, Box, Cylinder, Face, FloorRect, Line } from './primitives';

// All coordinates are storey-local: z = 0 is the finished floor.

type P = HousePalette;

// ── Wall-mounted details (drawn in face-local u/v coordinates on the back wall y = T) ────────

function WindowPane({ p, u0, u1, v0, v1 }: { p: P; u0: number; u1: number; v0: number; v1: number }) {
  const w = u1 - u0;
  const h = v1 - v0;
  return (
    <g>
      <rect x={u0 - 0.07} y={v0 - 0.07} width={w + 0.14} height={h + 0.14} fill={p.windowFrame} />
      <rect x={u0} y={v0} width={w} height={h} fill={p.glass} />
      <polygon
        points={`${u0 + w * 0.12},${v0 + h * 0.15} ${u0 + w * 0.3},${v0 + h * 0.15} ${u0 + w * 0.12},${v0 + h * 0.62}`}
        fill="#ffffff"
        opacity={p.dark ? 0.12 : 0.45}
      />
      <rect x={u0 + w / 2 - 0.025} y={v0} width={0.05} height={h} fill={p.windowFrame} />
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

function SmokeAlarm({ p, u }: { p: P; u: number }) {
  return (
    <g>
      <circle cx={u} cy={2.42} r={0.13} fill={p.tint('#ffffff')} />
      <circle cx={u} cy={2.42} r={0.05} fill={p.tint('#d7dbe0')} />
      <circle cx={u + 0.06} cy={2.46} r={0.018} fill={p.status.ok} />
    </g>
  );
}

/** Decorations on a room's back wall, revealed as the wall grows when its storey is in focus. */
export function backWallDetails(zone: ZoneId, p: P): ReactNode {
  switch (zone) {
    case 'garage':
      return (
        <g>
          <rect x={2.6} y={0.95} width={1.7} height={0.95} fill={p.tint('#c9b79f')} />
          {[0, 1, 2, 3, 4, 5].map((i) =>
            [0, 1, 2].map((j) => (
              <circle key={`${i}-${j}`} cx={2.75 + i * 0.28} cy={1.1 + j * 0.3} r={0.025} fill={p.tint('#8c7a64')} />
            )),
          )}
          <rect x={2.85} y={1.25} width={0.08} height={0.45} fill={p.tint(C.red)} />
          <rect x={3.35} y={1.3} width={0.32} height={0.06} fill={p.tint('#5e6673')} />
          <rect x={3.85} y={1.15} width={0.1} height={0.5} fill={p.tint('#5e6673')} />
        </g>
      );
    case 'mechanical':
      return (
        <g>
          {/* electrical panel */}
          <rect x={6.85} y={1.0} width={0.5} height={0.76} fill={p.tint(C.panel)} />
          <rect x={6.89} y={1.04} width={0.42} height={0.68} fill={p.tint(shade(C.panel, 0.25))} />
          <rect x={6.94} y={1.55} width={0.32} height={0.08} fill={p.tint('#ffd35a')} />
          <rect x={7.02} y={1.76} width={0.05} height={0.92} fill={p.tint(C.panel)} />
          <rect x={7.17} y={1.76} width={0.05} height={0.92} fill={p.tint(C.panel)} />
          {/* main water line + shutoff valve */}
          <rect x={7.42} y={0} width={0.07} height={0.95} fill={p.tint(C.copper)} />
          <rect x={7.33} y={0.48} width={0.25} height={0.08} fill={p.tint('#2f6fe0')} />
          {/* dryer exhaust duct up the wall */}
          <rect x={11.17} y={0.9} width={0.22} height={1.8} fill={p.tint(C.duct)} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={11.17} y={1.0 + i * 0.2} width={0.22} height={0.03} fill={p.tint(shade(C.duct, -0.15))} />
          ))}
          <SmokeAlarm p={p} u={8.9} />
        </g>
      );
    case 'entry':
      return (
        <g>
          <rect x={0.35} y={1.55} width={0.55} height={0.05} fill={p.tint(C.woodDark)} />
          {[0.45, 0.62, 0.79].map((u) => (
            <circle key={u} cx={u} cy={1.52} r={0.035} fill={p.tint('#4a4a52')} />
          ))}
          <rect x={0.5} y={0.95} width={0.24} height={0.56} rx={0.06} fill={p.tint(C.terracotta)} />
          <SmokeAlarm p={p} u={2.1} />
        </g>
      );
    case 'living':
      return (
        <g>
          <WindowPane p={p} u0={4.0} u1={5.4} v0={1.38} v1={2.35} />
          <ArtFrame p={p} u0={6.15} v0={1.5} w={0.85} h={0.6} color="#f2b33a" />
        </g>
      );
    case 'kitchen':
      return (
        <g>
          <rect x={7.85} y={0.92} width={3.15} height={0.6} fill={p.tint('#f1eee9')} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <rect key={i} x={7.85 + i * 0.3} y={0.92} width={0.012} height={0.6} fill={p.tint('#dcd6cd')} />
          ))}
          <rect x={7.85} y={1.21} width={3.15} height={0.012} fill={p.tint('#dcd6cd')} />
          <WindowPane p={p} u0={8.05} u1={8.95} v0={1.55} v1={2.3} />
        </g>
      );
    case 'bedroom1':
      return (
        <g>
          <WindowPane p={p} u0={1.45} u1={2.4} v0={1.4} v1={2.3} />
          <SmokeAlarm p={p} u={3.2} />
        </g>
      );
    case 'bathroom':
      return (
        <g>
          <WindowPane p={p} u0={4.4} u1={5.25} v0={1.5} v1={2.2} />
          <rect x={3.98} y={1.22} width={0.36} height={0.04} fill={p.tint(C.steel)} />
          <rect x={4.02} y={0.86} width={0.28} height={0.36} fill={p.tint(C.sage)} />
          {/* exhaust fan grille */}
          <rect x={5.64} y={2.15} width={0.32} height={0.3} fill={p.tint('#ffffff')} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={5.68} y={2.2 + i * 0.06} width={0.24} height={0.02} fill={p.tint('#c7ccd3')} />
          ))}
        </g>
      );
    case 'bedroom2':
      return (
        <g>
          <WindowPane p={p} u0={6.95} u1={7.85} v0={1.4} v1={2.3} />
          <rect x={8.2} y={1.5} width={0.75} height={0.05} fill={p.tint(C.woodDark)} />
          {[
            [8.25, 0.24, C.terracotta],
            [8.33, 0.28, C.sage],
            [8.41, 0.22, C.lavender],
            [8.49, 0.27, '#f2b33a'],
          ].map(([u, h, color]) => (
            <rect key={u as number} x={u as number} y={1.55} width={0.07} height={h as number} fill={p.tint(color as string)} />
          ))}
        </g>
      );
    case 'bedroom3':
      return (
        <g>
          <WindowPane p={p} u0={9.7} u1={10.65} v0={1.4} v1={2.3} />
          <ArtFrame p={p} u0={11.1} v0={1.25} w={0.55} h={0.7} color="#d6977f" />
        </g>
      );
    default:
      return null;
  }
}

/** Details on the inner face of the left exterior wall (plane x = T; u = y, v = z). */
export function leftWallDetails(zone: ZoneId, p: P): ReactNode {
  if (zone === 'garage') {
    return (
      <g>
        <rect x={0.45} y={0} width={2.9} height={2.25} fill={p.tint('#c9ced5')} />
        <rect x={0.52} y={0} width={2.76} height={2.18} fill={p.tint(C.garageDoor)} />
        {[0.44, 0.88, 1.32, 1.76].map((v) => (
          <rect key={v} x={0.52} y={v} width={2.76} height={0.03} fill={p.tint('#cdd2d8')} />
        ))}
        {[0.75, 1.35, 1.95, 2.55].map((u) => (
          <rect key={u} x={u} y={1.86} width={0.42} height={0.2} fill={p.glass} opacity={0.85} />
        ))}
      </g>
    );
  }
  if (zone === 'entry') {
    return (
      <g>
        <rect x={2.1} y={0} width={1.2} height={2.22} fill={p.tint('#efe8dc')} />
        <rect x={2.18} y={0} width={1.04} height={2.14} fill={p.tint(C.door)} />
        <rect x={2.32} y={1.25} width={0.76} height={0.7} fill={p.tint(shade(C.door, -0.12))} />
        <rect x={2.32} y={0.2} width={0.76} height={0.85} fill={p.tint(shade(C.door, -0.12))} />
        <rect x={2.42} y={1.4} width={0.56} height={0.42} fill={p.glass} />
        <circle cx={3.08} cy={1.05} r={0.05} fill={p.tint('#e2c26c')} />
      </g>
    );
  }
  if (zone === 'bedroom1') {
    return <WindowPane p={p} u0={1.5} u1={2.7} v0={1.35} v1={2.25} />;
  }
  return null;
}

// ── Floors ──────────────────────────────────────────────────────────────────────────────────

export function floorTexture(material: keyof P['floors'], x0: number, x1: number, p: P): ReactNode {
  const { line } = p.floors[material];
  const lines: ReactNode[] = [];
  const add = (key: string, ax: number, ay: number, bx: number, by: number) =>
    lines.push(<line key={key} x1={ax} y1={ay} x2={bx} y2={by} stroke={line} strokeWidth={0.022} />);
  if (material === 'oak') {
    for (let y = T + 0.2, i = 0; y < D; y += 0.2, i++) {
      add(`h${i}`, x0, y, x1, y);
      // staggered plank joints
      const offset = (i * 0.73) % 1.6;
      for (let x = x0 + 0.4 + offset; x < x1 - 0.1; x += 1.6) add(`j${i}-${x.toFixed(2)}`, x, y - 0.2, x, y);
    }
  } else if (material === 'tile' || material === 'mosaic' || material === 'stone') {
    const step = material === 'mosaic' ? 0.25 : material === 'stone' ? 0.6 : 0.45;
    for (let y = T + step; y < D; y += step) add(`h${y.toFixed(2)}`, x0, y, x1, y);
    for (let x = x0 + step; x < x1; x += step) add(`v${x.toFixed(2)}`, x, T, x, D);
  } else if (material === 'concrete') {
    for (const x of [2.3, 4.5]) if (x > x0 && x < x1) add(`c${x}`, x, T, x, D);
    add('c-mid', x0, 2.6, x1, 2.6);
  }
  return (
    <Face plane="z" at={0.002}>
      {lines}
    </Face>
  );
}

// ── Room furniture ──────────────────────────────────────────────────────────────────────────

function Car({ p, x, y }: { p: P; x: number; y: number }) {
  const body = p.tint(C.car);
  const glass = p.tint(C.carGlass);
  return (
    <g>
      <FloorRect x0={x + 0.1} y0={y + 0.15} x1={x + 4.6} y1={y + 2.05} fill={p.shadow} />
      <Box at={[x, y, 0.2]} size={[4.4, 1.85, 0.6]} color={body} />
      <Box
        at={[x + 1.15, y + 0.12, 0.8]}
        size={[2.3, 1.61, 0.48]}
        color={body}
        left={glass}
        right={shade(glass, -0.12)}
        top={shade(body, -0.05)}
      />
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

function Bed({
  p,
  x,
  width,
  blanket,
  double,
}: {
  p: P;
  x: number;
  width: number;
  blanket: string;
  double?: boolean;
}) {
  const headboard = double ? p.tint(C.cushion) : p.tint(C.wood);
  return (
    <g>
      <Box at={[x - 0.05, 0.16, 0]} size={[width + 0.1, 0.14, double ? 1.05 : 0.92]} color={headboard} />
      <Box at={[x, 0.3, 0]} size={[width, 2.05, 0.3]} color={p.tint(C.wood)} shadow={p.shadow} />
      <Box at={[x + 0.04, 0.32, 0.3]} size={[width - 0.08, 2.0, 0.22]} color={p.tint(C.linen)} />
      {double ? (
        <>
          <Box at={[x + 0.16, 0.4, 0.52]} size={[width / 2 - 0.22, 0.38, 0.13]} color={p.tint(C.pillow)} />
          <Box at={[x + width / 2 + 0.06, 0.4, 0.52]} size={[width / 2 - 0.22, 0.38, 0.13]} color={p.tint(C.pillow)} />
        </>
      ) : (
        <Box at={[x + 0.18, 0.4, 0.52]} size={[width - 0.36, 0.36, 0.12]} color={p.tint(C.pillow)} />
      )}
      <Box at={[x - 0.02, 1.02, 0.27]} size={[width + 0.04, 1.36, 0.31]} color={p.tint(blanket)} />
      <Box at={[x - 0.02, 1.02, 0.58]} size={[width + 0.04, 0.16, 0.012]} color={p.tint(shade(blanket, 0.35))} />
    </g>
  );
}

function Nightstand({ p, x }: { p: P; x: number }) {
  return (
    <g>
      <Box at={[x, 0.18, 0]} size={[0.45, 0.42, 0.5]} color={p.tint(C.wood)} shadow={p.shadow} />
      <Cylinder at={[x + 0.22, 0.38, 0.5]} r={0.05} h={0.18} color={p.tint('#8a8f99')} />
      <Cylinder at={[x + 0.22, 0.38, 0.66]} r={0.14} h={0.17} color={p.dark ? '#ffd27a' : p.tint(C.linen)} />
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

function Chair({ p, x, y, facing, seat }: { p: P; x: number; y: number; facing: 'east' | 'west'; seat: string }) {
  const backX = facing === 'east' ? x - 0.02 : x + 0.38;
  return (
    <g>
      <Box at={[x, y, 0]} size={[0.4, 0.4, 0.42]} color={p.tint(C.woodDark)} />
      <Box at={[x - 0.02, y - 0.02, 0.42]} size={[0.44, 0.44, 0.05]} color={p.tint(seat)} />
      <Box at={[backX, y - 0.02, 0.47]} size={[0.06, 0.44, 0.42]} color={p.tint(C.woodDark)} />
    </g>
  );
}

export function roomFurniture(zone: ZoneId, p: P): ReactNode {
  const shadow = p.shadow;
  switch (zone) {
    case 'garage':
      return (
        <g>
          <Face plane="z" at={0.003}>
            <ellipse cx={4.1} cy={2.1} rx={0.5} ry={0.3} fill="#000" opacity={0.05} />
          </Face>
          <Box at={[0.42, 0.16, 0]} size={[1.5, 0.46, 1.45]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Face plane="y" at={0.62}>
            {[0.48, 0.96].map((v) => (
              <rect key={v} x={0.42} y={v} width={1.5} height={0.04} fill={p.tint(shade(C.woodDark, 0.25))} />
            ))}
            {[
              [0.52, 0.05, C.terracotta],
              [0.98, 0.05, C.sage],
              [1.42, 0.05, C.rugBlue],
              [0.6, 0.53, C.steel],
              [1.2, 0.53, '#f2b33a'],
              [0.75, 1.01, C.lavender],
            ].map(([u, v, color]) => (
              <rect key={`${u}-${v}`} x={u as number} y={v as number} width={0.38} height={0.36} fill={p.tint(color as string)} />
            ))}
          </Face>
          <Car p={p} x={1.65} y={1.2} />
        </g>
      );
    case 'mechanical':
      return (
        <g>
          <Face plane="z" at={0.003}>
            <circle cx={8.55} cy={2.45} r={0.13} fill={p.tint('#9aa3ad')} />
            <circle cx={8.55} cy={2.45} r={0.08} fill={p.tint('#7d8691')} />
          </Face>
          {/* heat pump indoor unit (air handler) */}
          <Box at={[7.55, 0.18, 0]} size={[1.05, 0.82, 1.65]} color={p.tint(C.heatPump)} shadow={shadow} />
          <Face plane="y" at={1.0}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect key={i} x={7.65} y={0.18 + i * 0.09} width={0.85} height={0.03} fill={p.tint('#b8c0ca')} />
            ))}
            <rect x={7.62} y={0.9} width={0.91} height={0.02} fill={p.tint('#b8c0ca')} />
            <rect x={7.8} y={1.22} width={0.4} height={0.16} fill={p.tint('#ffffff')} />
            <circle cx={8.38} cy={1.3} r={0.04} fill={p.status.ok} />
          </Face>
          {/* hot water tank */}
          <Cylinder at={[9.35, 0.62, 0]} r={0.4} h={1.5} color={p.tint(C.tank)} shadow={shadow} />
          {(() => {
            const [sx, sy] = project(9.35, 0.62, 0);
            return (
              <g>
                <rect x={sx - 0.14} y={sy - 1.0} width={0.28} height={0.36} rx={0.03} fill={p.tint('#e6eaee')} />
                <rect x={sx - 0.1} y={sy - 0.94} width={0.2} height={0.06} fill={p.tint(C.red)} />
                <rect x={sx - 0.1} y={sy - 0.84} width={0.2} height={0.04} fill={p.tint('#2f6fe0')} />
                <circle cx={sx} cy={sy - 0.12} r={0.05} fill={p.tint(C.copper)} />
              </g>
            );
          })()}
          {/* washer + dryer */}
          {[9.98, 10.88].map((x) => (
            <g key={x}>
              <Box at={[x, 0.18, 0]} size={[0.8, 0.8, 0.92]} color={p.tint(C.appliance)} shadow={shadow} />
              <Face plane="y" at={0.98}>
                <rect x={x + 0.03} y={0.78} width={0.74} height={0.1} fill={p.tint('#eef0f3')} />
                <circle cx={x + 0.62} cy={0.83} r={0.03} fill={p.tint('#9aa3ad')} />
                <circle cx={x + 0.4} cy={0.42} r={0.27} fill={p.tint(C.steel)} />
                <circle cx={x + 0.4} cy={0.42} r={0.2} fill={p.dark ? '#1e2733' : '#5f6f80'} />
                <circle cx={x + 0.33} cy={0.48} r={0.06} fill="#ffffff" opacity={0.25} />
              </Face>
            </g>
          ))}
          <Cylinder at={[10.45, 1.6, 0]} r={0.2} h={0.36} color={p.tint('#d8b98c')} shadow={shadow} />
          <Ball at={[10.45, 1.6, 0.4]} r={0.13} color={p.tint(C.rugBlue)} />
        </g>
      );
    case 'entry':
      return (
        <g>
          <FloorRect x0={0.3} y0={2.3} x1={0.95} y1={3.1} fill={p.tint(C.mat)} />
          {[5, 4, 3, 2, 1].map((step) => (
            <Box
              key={step}
              at={[2.45 - step * 0.3, 0.16, 0]}
              size={[0.3, 0.9, step * 0.3]}
              color={p.tint(C.wood)}
              top={p.tint(shade(C.wood, 0.25))}
            />
          ))}
          <Line from={[2.45, 1.06, 0.95]} to={[0.95, 1.06, 2.45]} stroke={p.tint(C.woodDark)} width={0.05} />
          <Box at={[0.18, 1.2, 0]} size={[0.42, 0.8, 0.45]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[0.7, 1.32, 0]} size={[0.22, 0.12, 0.1]} color={p.tint('#4a4a52')} />
          <Box at={[0.72, 1.55, 0]} size={[0.22, 0.12, 0.1]} color={p.tint('#4a4a52')} />
          <Plant p={p} x={2.2} y={3.3} />
        </g>
      );
    case 'living':
      return (
        <g>
          <FloorRect x0={3.15} y0={1.4} x1={6.45} y1={3.3} fill={p.tint(C.rug)} />
          <FloorRect x0={3.35} y0={1.58} x1={6.25} y1={3.12} fill={p.tint(shade(C.rug, 0.18))} />
          <Plant p={p} x={3.0} y={0.5} size={1.15} />
          {/* sofa */}
          <Box at={[3.5, 0.2, 0]} size={[0.22, 0.95, 0.64]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[3.72, 0.2, 0]} size={[1.96, 0.95, 0.42]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[3.72, 0.2, 0.42]} size={[1.96, 0.26, 0.45]} color={p.tint(C.sofa)} />
          <Box at={[3.74, 0.46, 0.42]} size={[0.96, 0.66, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[4.72, 0.46, 0.42]} size={[0.94, 0.66, 0.1]} color={p.tint(C.cushion)} />
          <Box at={[3.86, 0.48, 0.52]} size={[0.42, 0.14, 0.3]} color={p.tint(C.terracotta)} />
          <Box at={[5.16, 0.48, 0.52]} size={[0.42, 0.14, 0.3]} color={p.tint(C.sage)} />
          <Box at={[5.68, 0.2, 0]} size={[0.22, 0.95, 0.64]} color={p.tint(C.sofa)} />
          {/* coffee table */}
          <Box at={[4.22, 1.9, 0]} size={[0.96, 0.5, 0.3]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Box at={[4.1, 1.8, 0.3]} size={[1.2, 0.7, 0.06]} color={p.tint(C.wood)} />
          <Box at={[4.32, 1.94, 0.36]} size={[0.36, 0.26, 0.05]} color={p.tint(C.terracotta)} />
          <Cylinder at={[4.95, 2.15, 0.36]} r={0.05} h={0.09} color={p.tint('#ffffff')} />
          {/* side table + radon monitor */}
          <Box at={[6.02, 0.25, 0]} size={[0.38, 0.38, 0.5]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[6.12, 0.33, 0.5]} size={[0.16, 0.12, 0.1]} color={p.tint('#ffffff')} />
          {/* floor lamp */}
          <Cylinder at={[6.6, 0.5, 0]} r={0.14} h={0.03} color={p.tint('#5e6673')} />
          <Cylinder at={[6.6, 0.5, 0.03]} r={0.022} h={1.28} color={p.tint('#5e6673')} />
          <Cylinder at={[6.6, 0.5, 1.3]} r={0.22} h={0.3} color={p.dark ? '#ffd27a' : p.tint(C.linen)} />
        </g>
      );
    case 'kitchen':
      return (
        <g>
          {/* base cabinets + counter with dishwasher and range */}
          <Box at={[7.85, 0.16, 0]} size={[3.15, 0.66, 0.86]} color={p.tint(C.cabinet)} shadow={shadow} />
          <Face plane="y" at={0.82}>
            <rect x={7.85} y={0} width={3.15} height={0.08} fill={p.tint('#d9d3ca')} />
            {[8.45, 9.05, 9.55, 10.15].map((u) => (
              <rect key={u} x={u} y={0.08} width={0.015} height={0.78} fill={p.tint('#ddd7ce')} />
            ))}
            {[8.12, 8.72, 9.3].map((u) => (
              <rect key={u} x={u} y={0.66} width={0.18} height={0.03} fill={p.tint('#9aa0a8')} />
            ))}
            <rect x={9.56} y={0.08} width={0.58} height={0.76} fill={p.tint(C.steel)} />
            <rect x={9.62} y={0.7} width={0.46} height={0.035} fill={p.tint('#5e6673')} />
            <rect x={10.2} y={0.08} width={0.78} height={0.76} fill={p.tint('#e9ecef')} />
            <rect x={10.27} y={0.14} width={0.64} height={0.45} fill={p.dark ? '#151a22' : '#3d4652'} />
            {[10.34, 10.5, 10.66, 10.82].map((u) => (
              <circle key={u} cx={u} cy={0.72} r={0.035} fill={p.tint('#5e6673')} />
            ))}
          </Face>
          <Box at={[7.82, 0.14, 0.86]} size={[3.21, 0.72, 0.06]} color={p.tint(C.counter)} />
          <Face plane="z" at={0.921}>
            <rect x={8.3} y={0.3} width={0.7} height={0.42} rx={0.05} fill={p.tint('#a9b1ba')} />
            <rect x={8.34} y={0.34} width={0.62} height={0.34} rx={0.04} fill={p.tint('#c7ced6')} />
            {[
              [10.42, 0.36],
              [10.78, 0.36],
              [10.42, 0.64],
              [10.78, 0.64],
            ].map(([u, v]) => (
              <g key={`${u}-${v}`}>
                <circle cx={u} cy={v} r={0.11} fill={p.tint('#4a515c')} />
                <circle cx={u} cy={v} r={0.05} fill={p.tint('#2c3138')} />
              </g>
            ))}
          </Face>
          <Cylinder at={[8.65, 0.22, 0.92]} r={0.03} h={0.3} color={p.tint(C.steel)} />
          {/* fridge */}
          <Box at={[11.12, 0.16, 0]} size={[0.72, 0.74, 1.78]} color={p.tint('#eef1f4')} shadow={shadow} />
          <Face plane="y" at={0.9}>
            <rect x={11.12} y={1.12} width={0.72} height={0.015} fill={p.tint('#c9cfd6')} />
            <rect x={11.2} y={1.3} width={0.03} height={0.35} fill={p.tint('#9aa0a8')} />
            <rect x={11.2} y={0.7} width={0.03} height={0.35} fill={p.tint('#9aa0a8')} />
          </Face>
          {/* dining table */}
          <Chair p={p} x={7.98} y={2.25} facing="east" seat={C.cushion} />
          {[
            [8.6, 2.06],
            [10.38, 2.06],
            [8.6, 2.78],
            [10.38, 2.78],
          ].map(([x, y]) => (
            <Box key={`${x}-${y}`} at={[x, y, 0]} size={[0.06, 0.06, 0.7]} color={p.tint(C.woodDark)} />
          ))}
          <FloorRect x0={8.55} y0={2.05} x1={10.6} y1={3.0} fill={shadow} />
          <Box at={[8.5, 2.0, 0.7]} size={[2.0, 0.9, 0.06]} color={p.tint(C.wood)} />
          <Cylinder at={[9.5, 2.45, 0.76]} r={0.17} h={0.07} color={p.tint('#ffffff')} />
          <Ball at={[9.45, 2.42, 0.86]} r={0.06} color={p.tint(C.red)} />
          <Ball at={[9.56, 2.48, 0.86]} r={0.06} color={p.tint('#f2b33a')} />
          <Chair p={p} x={10.62} y={2.25} facing="west" seat={C.cushion} />
          {/* fire extinguisher by the exit */}
          <Cylinder at={[7.95, 3.4, 0]} r={0.09} h={0.46} color={p.tint(C.red)} shadow={shadow} />
          <Cylinder at={[7.95, 3.4, 0.46]} r={0.04} h={0.07} color={p.tint('#2c3138')} />
        </g>
      );
    case 'bedroom1':
      return (
        <g>
          <FloorRect x0={0.55} y0={2.55} x1={3.25} y1={3.55} fill={p.tint(C.rug)} />
          <Nightstand p={p} x={0.4} />
          <Bed p={p} x={1.0} width={1.8} blanket={C.terracotta} double />
          <Nightstand p={p} x={2.95} />
          <Plant p={p} x={3.45} y={3.35} />
        </g>
      );
    case 'bathroom':
      return (
        <g>
          <FloorRect x0={4.4} y0={1.02} x1={5.3} y1={1.42} fill={p.tint(C.sage)} />
          {/* bathtub */}
          <Box at={[3.95, 0.16, 0]} size={[2.0, 0.78, 0.56]} color={p.tint(C.porcelain)} shadow={shadow} />
          <Face plane="z" at={0.561}>
            <rect x={4.06} y={0.27} width={1.78} height={0.57} rx={0.18} fill={p.tint('#dfe5ea')} />
            <rect x={4.12} y={0.32} width={1.66} height={0.47} rx={0.15} fill={p.tint(C.water)} opacity={0.85} />
          </Face>
          <Cylinder at={[4.06, 0.5, 0.56]} r={0.03} h={0.14} color={p.tint(C.steel)} />
          {/* vanity */}
          <Box at={[3.92, 2.45, 0]} size={[0.5, 0.95, 0.82]} color={p.tint(C.wood)} shadow={shadow} />
          <Box at={[3.9, 2.43, 0.82]} size={[0.54, 0.99, 0.05]} color={p.tint(C.porcelain)} />
          <Face plane="z" at={0.871}>
            <ellipse cx={4.17} cy={2.92} rx={0.16} ry={0.26} fill={p.tint('#dfe5ea')} />
          </Face>
          {/* toilet */}
          <Box at={[5.42, 1.55, 0]} size={[0.44, 0.4, 0.4]} color={p.tint(C.porcelain)} shadow={shadow} />
          <Box at={[5.88, 1.5, 0]} size={[0.22, 0.5, 0.78]} color={p.tint(C.porcelain)} />
          {/* glass shower */}
          <Box at={[5.15, 2.6, 0]} size={[0.97, 1.05, 0.08]} color={p.tint(C.porcelain)} />
          <Cylinder at={[6.05, 2.68, 0.08]} r={0.025} h={1.78} color={p.tint(C.steel)} />
          <Cylinder at={[5.95, 2.72, 1.8]} r={0.09} h={0.03} color={p.tint(C.steel)} />
          <polygon
            points={pts([
              [5.15, 2.6, 0.08],
              [5.15, 3.65, 0.08],
              [5.15, 3.65, 1.95],
              [5.15, 2.6, 1.95],
            ])}
            fill={p.dark ? '#7fa7c6' : '#bfe0f2'}
            opacity={0.3}
            stroke={p.tint('#c7d3dc')}
            strokeWidth={0.025}
          />
          <polygon
            points={pts([
              [5.15, 3.65, 0.08],
              [6.12, 3.65, 0.08],
              [6.12, 3.65, 1.95],
              [5.15, 3.65, 1.95],
            ])}
            fill={p.dark ? '#7fa7c6' : '#bfe0f2'}
            opacity={0.3}
            stroke={p.tint('#c7d3dc')}
            strokeWidth={0.025}
          />
        </g>
      );
    case 'bedroom2':
      return (
        <g>
          <FloorRect x0={6.5} y0={2.5} x1={8.25} y1={3.6} fill={p.tint(C.rugBlue)} />
          <Bed p={p} x={6.65} width={1.35} blanket={C.sage} />
          <Chair p={p} x={7.86} y={2.8} facing="east" seat={C.sofa} />
          <Box at={[8.38, 2.45, 0]} size={[0.6, 0.05, 0.7]} color={p.tint(C.woodDark)} />
          <Box at={[8.38, 3.52, 0]} size={[0.6, 0.05, 0.7]} color={p.tint(C.woodDark)} shadow={shadow} />
          <Box at={[8.35, 2.42, 0.7]} size={[0.66, 1.18, 0.05]} color={p.tint(C.wood)} />
          <Box at={[8.5, 2.75, 0.75]} size={[0.34, 0.46, 0.02]} color={p.tint('#3d4652')} />
        </g>
      );
    case 'bedroom3':
      return (
        <g>
          <FloorRect x0={9.4} y0={2.55} x1={10.85} y1={3.55} fill={p.tint(C.rug)} />
          <Bed p={p} x={9.55} width={1.35} blanket={C.lavender} />
          <Box at={[11.15, 0.16, 0]} size={[0.7, 0.46, 0.86]} color={p.tint(C.wood)} shadow={shadow} />
          <Face plane="y" at={0.62}>
            {[0.3, 0.58].map((v) => (
              <rect key={v} x={11.15} y={v} width={0.7} height={0.015} fill={p.tint(C.woodDark)} />
            ))}
          </Face>
          <Cylinder at={[11.5, 0.38, 0.86]} r={0.08} h={0.16} color={p.tint(C.pot)} />
          <Ball at={[11.5, 0.38, 1.12]} r={0.13} color={p.tint(C.plant)} />
          {/* reading chair */}
          <Box at={[10.95, 2.75, 0]} size={[0.7, 0.72, 0.38]} color={p.tint(C.sofa)} shadow={shadow} />
          <Box at={[10.95, 2.75, 0.38]} size={[0.55, 0.12, 0.18]} color={p.tint(C.sofa)} />
          <Box at={[10.95, 3.35, 0.38]} size={[0.55, 0.12, 0.18]} color={p.tint(C.sofa)} />
          <Box at={[11.5, 2.75, 0.38]} size={[0.15, 0.72, 0.42]} color={p.tint(C.sofa)} />
        </g>
      );
    default:
      return null;
  }
}

/** 3D items hung on the back wall; they only make sense once the wall is full height. */
export function wallMounted(zone: ZoneId, p: P): ReactNode {
  switch (zone) {
    case 'mechanical':
      return (
        <g>
          <Box at={[7.65, 0.18, 1.65]} size={[0.85, 0.6, 1.0]} color={p.tint(C.duct)} />
          <Cylinder at={[9.22, 0.52, 1.5]} r={0.035} h={1.15} color={p.tint(C.copper)} />
          <Cylinder at={[9.5, 0.66, 1.5]} r={0.035} h={1.15} color={p.tint(C.copper)} />
        </g>
      );
    case 'kitchen':
      return (
        <g>
          <Box at={[9.15, 0.16, 1.55]} size={[0.98, 0.36, 0.72]} color={p.tint(C.cabinet)} />
          <Box at={[10.22, 0.14, 1.92]} size={[0.76, 0.48, 0.22]} color={p.tint(C.steel)} />
          <Box at={[10.45, 0.14, 2.14]} size={[0.3, 0.24, 0.54]} color={p.tint(C.steel)} />
        </g>
      );
    default:
      return null;
  }
}

// ── Yard (part of the ground storey) ─────────────────────────────────────────────────────────

export function Yard({ p }: { p: P }) {
  const { x0, x1, y0, y1, thickness } = YARD;
  const stripes: ReactNode[] = [];
  for (let i = 0, y = y0; y < y1; i++, y += 0.75) {
    if (i % 2) stripes.push(<rect key={i} x={x0} y={y} width={x1 - x0} height={Math.min(0.75, y1 - y)} fill={p.grassStripe} />);
  }
  return (
    <g>
      <Box at={[x0, y0, -thickness]} size={[x1 - x0, y1 - y0, thickness]} color={p.soil} top={p.grass} />
      <Face plane="z" at={0.001}>
        {stripes}
        {[
          [13.55, 2.15],
          [14.35, 2.55],
          [15.15, 2.95],
        ].map(([u, v]) => (
          <ellipse key={u} cx={u} cy={v} rx={0.28} ry={0.2} fill={p.tint(C.stone)} />
        ))}
      </Face>
      {/* back fence */}
      <Box at={[x0, y0, 0]} size={[x1 - x0, 0.07, 0.78]} color={p.tint(C.fence)} />
      <Face plane="y" at={y0 + 0.07}>
        {[0.26, 0.52].map((v) => (
          <rect key={v} x={x0} y={v} width={x1 - x0} height={0.02} fill={p.tint(shade(C.fence, -0.15))} />
        ))}
      </Face>
      {/* tree */}
      <Cylinder at={[16.55, -0.55, 0]} r={0.11} h={1.3} color={p.tint(C.trunk)} shadow={p.shadow} />
      <Ball at={[16.75, -0.8, 1.85]} r={0.6} color={p.tint(C.leavesDark)} />
      <Ball at={[16.4, -0.4, 2.0]} r={0.68} color={p.tint(C.leaves)} />
      <Ball at={[16.85, -0.3, 1.55]} r={0.48} color={p.tint(C.leaves)} />
      {/* heat pump outdoor unit on its pad */}
      <Box at={[12.22, 0.12, 0]} size={[1.18, 0.92, 0.08]} color={p.tint(C.stone)} />
      <Box at={[12.28, 0.18, 0.08]} size={[1.06, 0.8, 0.86]} color={p.tint(C.heatPump)} shadow={p.shadow} />
      <Face plane="z" at={0.941}>
        <circle cx={12.81} cy={0.58} r={0.31} fill={p.tint('#b8c0ca')} />
        <circle cx={12.81} cy={0.58} r={0.26} fill={p.tint('#8c96a3')} />
        {[0, 45, 90, 135].map((a) => (
          <rect
            key={a}
            x={12.79}
            y={0.33}
            width={0.04}
            height={0.5}
            fill={p.tint('#c9cfd6')}
            transform={`rotate(${a} 12.81 0.58)`}
          />
        ))}
      </Face>
      <Face plane="x" at={13.34}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={0.26} y={0.2 + i * 0.1} width={0.68} height={0.035} fill={p.tint('#b8c0ca')} />
        ))}
      </Face>
      <Line from={[12.28, 0.4, 0.45]} to={[12.0, 0.4, 0.45]} stroke={p.tint(C.copper)} width={0.05} />
      {/* outdoor faucet + hose reel by the wall */}
      <Face plane="x" at={W}>
        <circle cx={2.4} cy={0.42} r={0.06} fill={p.tint(C.steel)} />
        <rect x={2.37} y={0.42} width={0.06} height={0.12} fill={p.tint(C.steel)} />
      </Face>
      <Cylinder at={[12.4, 2.05, 0]} r={0.17} h={0.14} color={p.tint('#4f9a5c')} shadow={p.shadow} />
      {/* right fence */}
      <Box at={[x1 - 0.07, y0 + 0.07, 0]} size={[0.07, y1 - y0 - 0.07, 0.78]} color={p.tint(C.fence)} />
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
  for (let k = 1; k < 9; k++) {
    const s = k / 9;
    const y = D + o - s * span;
    const z = th + s * rise;
    const [ax, ay] = project(-o, y, z);
    const [bx, by] = project(W + o, y, z);
    courses.push(<line key={k} x1={ax} y1={ay} x2={bx} y2={by} stroke={p.roofLine} strokeWidth={0.035} />);
  }
  const sky = (y: number) => heightAt(y) + th + 0.005;
  return (
    <g>
      {/* gable end wall under the roof */}
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
        <circle cx={ridgeY} cy={1.1} r={0.22} fill={shade(p.gable, -0.12)} />
        {[-0.1, 0, 0.1].map((d) => (
          <rect key={d} x={ridgeY - 0.15} y={1.08 + d} width={0.3} height={0.03} fill={p.gable} />
        ))}
      </Face>
      {/* back slope's end */}
      <polygon
        points={pts([
          [W + o, -o, 0],
          [W + o, ridgeY, rise],
          [W + o, ridgeY, rise + th],
          [W + o, -o, th],
        ])}
        fill={p.ridge}
      />
      {/* front slope */}
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
      {/* skylight */}
      <polygon
        points={pts([
          [2.2, 2.55, sky(2.55)],
          [3.1, 2.55, sky(2.55)],
          [3.1, 3.3, sky(3.3)],
          [2.2, 3.3, sky(3.3)],
        ])}
        fill={p.dark ? '#ffd27a' : '#cfe6f3'}
        stroke={p.windowFrame}
        strokeWidth={0.05}
      />
      <Cylinder at={[8.6, 2.4, sky(2.4)]} r={0.07} h={0.36} color={p.metal} />
      {/* ridge cap */}
      <Box at={[-o, ridgeY - 0.1, rise + th - 0.04]} size={[W + 2 * o, 0.2, 0.08]} color={p.ridge} />
      {/* fascia + slope end */}
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
      {/* gutter */}
      <Box at={[-o, D + o, -0.13]} size={[W + 2 * o, 0.14, 0.13]} color={p.metal} />
      <Box at={[W + o - 0.16, D + o + 0.02, -0.55]} size={[0.1, 0.1, 0.42]} color={p.metal} />
    </g>
  );
}

export { LOW_WALL };
