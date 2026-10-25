import type { ReactNode } from 'react';
import { boxFaces, ellipseRadii, faceTransform, project, pts, shades, type P3 } from './iso';

export type V3 = readonly [number, number, number];

export interface BoxProps {
  at: V3;
  size: V3;
  color: string;
  top?: string;
  left?: string;
  right?: string;
  /** Soft contact shadow cast on the surface the box stands on. */
  shadow?: string;
}

/** Axis-aligned box: three flat-shaded faces, light from the upper left. */
export function Box({ at: [x, y, z], size: [w, d, h], color, top, left, right, shadow }: BoxProps) {
  const s = shades(color);
  const faces = boxFaces({ x, y, z, w, d, h });
  const spread = Math.min(0.32, 0.08 + h * 0.12);
  return (
    <g>
      {shadow && (
        <polygon
          points={pts([
            [x + 0.04, y + 0.04, z],
            [x + w + spread, y + 0.04, z],
            [x + w + spread, y + d + spread * 0.5, z],
            [x + 0.04, y + d + spread * 0.5, z],
          ])}
          fill={shadow}
        />
      )}
      <polygon points={faces.left} fill={left ?? s.left} />
      <polygon points={faces.right} fill={right ?? s.right} />
      <polygon points={faces.top} fill={top ?? s.top} />
    </g>
  );
}

/** Vertical cylinder (tanks, pots, lamp shades). */
export function Cylinder({
  at: [cx, cy, z],
  r,
  h,
  color,
  top,
  shadow,
}: {
  at: V3;
  r: number;
  h: number;
  color: string;
  top?: string;
  shadow?: string;
}) {
  const s = shades(color);
  const [sx, sy] = project(cx, cy, z);
  const syTop = sy - h;
  const { rx, ry } = ellipseRadii(r);
  return (
    <g>
      {shadow && <ellipse cx={sx + rx * 0.35} cy={sy + ry * 0.2} rx={rx * 1.15} ry={ry * 1.1} fill={shadow} />}
      <path
        d={`M${sx - rx} ${syTop}L${sx - rx} ${sy}A${rx} ${ry} 0 0 0 ${sx + rx} ${sy}L${sx + rx} ${syTop}Z`}
        fill={s.left}
      />
      <path d={`M${sx} ${syTop}L${sx + rx} ${syTop}L${sx + rx} ${sy}A${rx} ${ry} 0 0 1 ${sx} ${sy + ry}Z`} fill={s.right} />
      <ellipse cx={sx} cy={syTop} rx={rx} ry={ry} fill={top ?? s.top} />
    </g>
  );
}

/** A ball (shrubs, tree canopies): a circle with a soft highlight. */
export function Ball({ at: [x, y, z], r, color }: { at: V3; r: number; color: string }) {
  const [sx, sy] = project(x, y, z);
  const s = shades(color);
  const radius = r * Math.SQRT2 * Math.cos(Math.PI / 6);
  return (
    <g>
      <circle cx={sx} cy={sy} r={radius} fill={s.left} />
      <circle cx={sx - radius * 0.22} cy={sy - radius * 0.24} r={radius * 0.62} fill={s.top} opacity={0.55} />
    </g>
  );
}

/** Group whose children are drawn in 2D coordinates on a world plane (see faceTransform). */
export function Face({ plane, at, children }: { plane: 'x' | 'y' | 'z'; at: number; children: ReactNode }) {
  return <g transform={faceTransform(plane, at)}>{children}</g>;
}

/** Flat quad on a horizontal plane (rugs, mats, pads). */
export function FloorRect({
  x0,
  y0,
  x1,
  y1,
  z = 0,
  fill,
  opacity,
}: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z?: number;
  fill: string;
  opacity?: number;
}) {
  return (
    <polygon
      points={pts([
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ])}
      fill={fill}
      opacity={opacity}
    />
  );
}

export function Line({ from, to, stroke, width = 0.03, opacity }: { from: P3; to: P3; stroke: string; width?: number; opacity?: number }) {
  const [x1, y1] = project(...from);
  const [x2, y2] = project(...to);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" opacity={opacity} />;
}
