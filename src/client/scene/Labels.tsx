import { useFrame } from '@react-three/fiber';
import { Flame } from 'lucide-react';
import { useRef, type MutableRefObject } from 'react';
import { Vector3 } from 'three';
import { cx } from '../components/ui';
import type { LayerOffsets } from './House';
import { D, levelBase, ROOF, W, type Layer } from './layout';

export type LabelTone = 'overdue' | 'today' | 'soon' | 'ok' | 'muted' | 'accent';

export type LabelAnchor =
  | { type: 'point'; layer: Layer; point: readonly [number, number, number]; normal?: readonly [number, number] }
  /** A point on whichever facade faces the camera, `u` meters to the viewer's right of center. */
  | { type: 'facade'; layer: Layer; y: number; u: number };

export interface LabelSpec {
  id: string;
  anchor: LabelAnchor;
  title: string;
  value: string;
  tone: LabelTone;
  fire?: boolean;
  ariaLabel: string;
  onClick?: () => void;
  /** Higher priority labels keep the shortest leader when labels collide. */
  priority: number;
  emphasis?: boolean;
}

export interface MarkerSpec {
  id: string;
  anchor: LabelAnchor;
  label: string;
}

const TONE_TEXT: Record<LabelTone, string> = {
  overdue: 'text-[#ff6a63]',
  today: 'text-[#ffad5c]',
  soon: 'text-[#f5cd6a]',
  ok: 'text-[#5fe0a4]',
  muted: 'text-white/70',
  accent: 'text-[#9db4ff]',
};

const TONE_DOT: Record<LabelTone, string> = {
  overdue: 'bg-[#ff5a52] text-[#ff5a52]',
  today: 'bg-[#ff9f43] text-[#ff9f43]',
  soon: 'bg-[#f2c14e] text-[#f2c14e]',
  ok: 'bg-[#3ccf8e] text-[#3ccf8e]',
  muted: 'bg-white/80 text-white',
  accent: 'bg-[#7f9cff] text-[#7f9cff]',
};

export interface LabelRegistry {
  labels: Map<string, HTMLElement>;
  markers: Map<string, HTMLElement>;
}

export function SceneLabels({
  labels,
  markers,
  registry,
}: {
  labels: LabelSpec[];
  markers: MarkerSpec[];
  registry: MutableRefObject<LabelRegistry>;
}) {
  const bind = (map: 'labels' | 'markers', id: string) => (el: HTMLElement | null) => {
    if (el) registry.current[map].set(id, el);
    else registry.current[map].delete(id);
  };
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={labels.length === 0 ? true : undefined}>
      {markers.map((marker) => (
        <div key={marker.id} ref={bind('markers', marker.id)} className="scene-label" style={{ opacity: 0, visibility: 'hidden' }}>
          <span className="absolute -top-[17px] -left-[17px] block size-[34px] rounded-full bg-[#5a83ff]/35 scene-ping" />
          <svg className="absolute -top-[14px] -left-[14px] size-7 overflow-visible" viewBox="0 0 28 28" role="img" aria-label={marker.label}>
            <circle className="house-ring" cx="14" cy="14" r="10" fill="none" stroke="#7f9cff" strokeWidth="2.2" />
            <circle cx="14" cy="14" r="3" fill="#ffffff" />
          </svg>
        </div>
      ))}
      {labels.map((label) => (
        <div
          key={label.id}
          ref={bind('labels', label.id)}
          className="scene-label"
          style={{ opacity: 0, visibility: 'hidden', ['--L' as string]: '36px', ['--dx' as string]: '0px' }}
        >
          <span className={cx('absolute -top-[3.5px] -left-[3.5px] block size-[7px] rounded-full scene-dot', TONE_DOT[label.tone], label.tone === 'overdue' && 'scene-dot-live')} />
          <span className="absolute -left-px block w-px bg-gradient-to-t from-white/70 to-white/25" style={{ bottom: 3, height: 'calc(var(--L) - 3px)' }} data-leader />
          <button
            type="button"
            tabIndex={label.onClick ? 0 : -1}
            onClick={label.onClick}
            aria-label={label.ariaLabel}
            className={cx(
              'scene-label-hit absolute flex flex-col items-center rounded-[10px] bg-[rgb(10_11_13/0.34)] px-2.5 py-1.5 text-center whitespace-nowrap ring-1 ring-white/[0.06] backdrop-blur-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70',
              label.onClick && 'cursor-pointer hover:bg-[rgb(10_11_13/0.5)]',
              label.emphasis && 'bg-[rgb(10_11_13/0.5)] ring-white/15',
            )}
            style={{ left: 0, bottom: 'calc(var(--L) + 2px)', transform: 'translateX(calc(-50% + var(--dx)))' }}
            data-text
          >
            <span className="eyebrow text-[9.5px] leading-none text-white/65 [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">{label.title}</span>
            <span
              className={cx(
                'mt-1 inline-flex items-center gap-1 text-[14px] leading-none font-medium tracking-[-0.01em] tabular [text-shadow:0_1px_10px_rgb(0_0_0/0.55)]',
                TONE_TEXT[label.tone],
              )}
            >
              {label.fire && <Flame className="size-3.5" aria-hidden />}
              {label.value}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Projection ───────────────────────────────────────────────────────────────────────────────

function layerBaseY(layer: Layer): number {
  if (layer === 'site') return 0;
  if (layer === 'roof') return ROOF.base;
  return levelBase(layer);
}

const point = new Vector3();

function anchorWorld(anchor: LabelAnchor, offsets: LayerOffsets, cam: Vector3, out: Vector3): number {
  const base = layerBaseY(anchor.layer) + (anchor.layer === 'site' ? 0 : offsets[anchor.layer]);
  if (anchor.type === 'point') {
    out.set(anchor.point[0], base + anchor.point[1], anchor.point[2]);
    if (!anchor.normal) return 1;
    const dx = cam.x - out.x;
    const dz = cam.z - out.z;
    const len = Math.hypot(dx, dz) || 1;
    const facing = (anchor.normal[0] * dx + anchor.normal[1] * dz) / len;
    return Math.max(0, Math.min(1, (facing + 0.12) / 0.32));
  }
  // Facade facing the camera: walk from the center toward the camera to the footprint edge.
  const len = Math.hypot(cam.x, cam.z) || 1;
  const cx = cam.x / len;
  const cz = cam.z / len;
  const tx = Math.abs(cx) > 1e-4 ? W / 2 / Math.abs(cx) : Infinity;
  const tz = Math.abs(cz) > 1e-4 ? D / 2 / Math.abs(cz) : Infinity;
  const onFrontBack = tz <= tx;
  const t = Math.min(tx, tz);
  let x = cx * t;
  let z = cz * t;
  // Viewer's right along the facade.
  const rx = cz;
  const rz = -cx;
  if (onFrontBack) x = Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, x + Math.sign(rx || 1) * anchor.u));
  else z = Math.max(-D / 2 + 0.5, Math.min(D / 2 - 0.5, z + Math.sign(rz || 1) * anchor.u * (D / W)));
  out.set(x + cx * 0.06, base + anchor.y, z + cz * 0.06);
  return 1;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box, margin = 3) =>
  a.x < b.x + b.w + margin && a.x + a.w + margin > b.x && a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;

const round = (n: number) => Math.round(n * 2) / 2;

export function LabelProjector({
  labels,
  markers,
  registry,
  offsets,
  insetBottom,
  insetTop,
}: {
  labels: LabelSpec[];
  markers: MarkerSpec[];
  registry: MutableRefObject<LabelRegistry>;
  offsets: MutableRefObject<LayerOffsets>;
  insetBottom: MutableRefObject<number>;
  insetTop: number;
}) {
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const sorted = [...labels].sort((a, b) => b.priority - a.priority);

  useFrame((state) => {
    const { camera, size } = state;
    const visibleBottom = size.height - insetBottom.current;
    const placed: Box[] = [];

    for (const marker of markers) {
      const el = registry.current.markers.get(marker.id);
      if (!el) continue;
      const alpha = anchorWorld(marker.anchor, offsets.current, camera.position, point);
      point.project(camera);
      const sx = ((point.x + 1) / 2) * size.width;
      const sy = ((1 - point.y) / 2) * size.height;
      const show = alpha > 0.05 && point.z < 1 && sy < visibleBottom - 6 && sy > insetTop * 0.5;
      el.style.transform = `translate3d(${round(sx)}px, ${round(sy)}px, 0)`;
      el.style.opacity = show ? String(alpha) : '0';
      el.style.visibility = show ? 'visible' : 'hidden';
      if (show) placed.push({ x: sx - 16, y: sy - 16, w: 32, h: 32 });
    }

    // Pass 1: where every label's anchor lands on screen.
    const items: { label: LabelSpec; el: HTMLElement; sx: number; sy: number; alpha: number; w: number; h: number }[] = [];
    for (const label of sorted) {
      const el = registry.current.labels.get(label.id);
      if (!el) continue;
      const key = `${label.id}|${label.title}|${label.value}`;
      let measured = sizes.current.get(key);
      if (!measured || measured.w === 0) {
        const text = el.querySelector<HTMLElement>('[data-text]');
        measured = { w: text?.offsetWidth ?? 90, h: text?.offsetHeight ?? 36 };
        sizes.current.set(key, measured);
      }
      let alpha = anchorWorld(label.anchor, offsets.current, camera.position, point);
      point.project(camera);
      const sx = ((point.x + 1) / 2) * size.width;
      const sy = ((1 - point.y) / 2) * size.height;
      if (point.z > 1 || sx < -10 || sx > size.width + 10 || sy > visibleBottom - 4 || sy < insetTop * 0.6) alpha = 0;
      items.push({ label, el, sx, sy, alpha, ...measured });
      // Every visible anchor dot is an obstacle for the other labels' text.
      if (alpha > 0.02) placed.push({ x: sx - 7, y: sy - 7, w: 14, h: 14 });
    }

    // Pass 2: stack text above each anchor, lengthening the leader until nothing collides.
    const texts: Box[] = [];
    const lines: Box[] = [];
    for (const item of items) {
      const { el, sx, sy, w, h } = item;
      let { alpha } = item;
      let leader = 0;
      let dx = 0;
      let flip = false;
      if (alpha > 0.02) {
        let found = false;
        // Prefer a short leader with the text centered; then nudge the text sideways (the leader
        // still meets it); then lengthen the leader.
        flip = false;
        // Labels about something due may hang below their anchor or take a long leader; calm
        // ones only show where they fit easily.
        const important = item.label.priority >= 3;
        search: for (const below of important ? [false, true] : [false]) {
          for (const candidate of important ? [30, 54, 78, 102, 126, 150] : [30, 54, 78]) {
            for (const shift of [0, 0.32, -0.32]) {
              const left = Math.max(8, Math.min(size.width - 8 - w, sx - w / 2 + shift * w));
              const box = { x: left, y: below ? sy + candidate : sy - candidate - h, w, h };
              if (!below && box.y < insetTop) continue search;
              if (below && box.y + h > visibleBottom - 8) continue search;
              const line = below ? { x: sx - 2, y: sy + 9, w: 4, h: candidate - 9 } : { x: sx - 2, y: sy - candidate, w: 4, h: candidate - 9 };
              if (
                !placed.some((other) => overlaps(box, other)) &&
                !texts.some((other) => overlaps(line, other, 2)) &&
                !lines.some((other) => overlaps(line, other, 4))
              ) {
                leader = candidate;
                dx = left - (sx - w / 2);
                flip = below;
                placed.push(box, line);
                texts.push(box);
                lines.push(line);
                found = true;
                break search;
              }
            }
          }
        }
        if (!found) alpha = 0;
      }
      const show = alpha > 0.02;
      el.style.transform = `translate3d(${round(sx)}px, ${round(sy)}px, 0)`;
      el.style.setProperty('--L', `${leader}px`);
      el.style.setProperty('--dx', `${round(dx)}px`);
      if (el.dataset.flip !== (flip ? '1' : '0')) el.dataset.flip = flip ? '1' : '0';
      el.style.opacity = show ? String(Math.min(1, alpha)) : '0';
      el.style.visibility = show ? 'visible' : 'hidden';
    }
  });

  return null;
}
