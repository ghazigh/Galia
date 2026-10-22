import type { ZoneHealth, ZoneSummary } from '@shared/status';
import type { FixtureId, ZoneId } from '@shared/types';
import { motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { memo, useEffect, useId, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { backWallDetails, floorTexture, leftWallDetails, roomFurniture, Roof, wallMounted, Yard } from './furniture';
import { project, pts, shade, type Bounds } from './iso';
import {
  BACK_WALL,
  cameraFor,
  D,
  FIXTURE_ANCHORS,
  focusForZone,
  LEVEL_KEYS,
  levelBase,
  LOW_WALL,
  ROOF,
  ROOF_BASE,
  ROOMS,
  SLAB,
  T,
  W,
  YARD,
  zoneAnchor,
  type FocusTarget,
  type LevelKey,
  type RoomDef,
} from './model';
import { getPalette, type HousePalette } from './palette';
import { Box } from './primitives';

export interface HouseViewProps {
  summaries: Partial<Record<ZoneId, ZoneSummary>>;
  selectedZone: ZoneId | null;
  highlightFixture?: FixtureId | null;
  /** Camera target when no zone is selected. */
  focus?: FocusTarget;
  dark?: boolean;
  zoneLabel: (zone: ZoneId) => string;
  onSelectZone?: (zone: ZoneId | null) => void;
  /** Hide status pins (e.g. in a compact picker). */
  pins?: boolean;
  className?: string;
}

const SPRING = { type: 'spring', stiffness: 120, damping: 22, mass: 0.9 } as const;
const LIFT = 7; // how far other storeys slide away when one is in focus

type Layer = LevelKey | 'roof';

function layerMotion(layer: Layer, focus: FocusTarget): { y: number; opacity: number } {
  if (focus === 'overview') return { y: 0, opacity: 1 };
  if (focus === 'yard') return { y: 0, opacity: layer === 'ground' ? 1 : 0.28 };
  const order: Layer[] = [...LEVEL_KEYS, 'roof'];
  const target = order.indexOf(focus);
  const index = order.indexOf(layer);
  if (index === target) return { y: 0, opacity: 1 };
  // Screen y grows downward: storeys above slide up, storeys below slide down.
  return index > target ? { y: -LIFT, opacity: 0 } : { y: LIFT * 0.8, opacity: 0 };
}

function padded(b: Bounds, focus: FocusTarget): string {
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const pad = focus === 'overview' ? 0.025 : 0.07;
  // Extra headroom for the status pins floating above floors.
  const top = focus === 'overview' ? 1.0 : 1.2;
  const x = b.minX - w * pad;
  const y = b.minY - h * pad - top;
  return `${x.toFixed(2)} ${y.toFixed(2)} ${(w * (1 + 2 * pad)).toFixed(2)} ${(h * (1 + 2 * pad) + top).toFixed(2)}`;
}

function healthColor(health: ZoneHealth, p: HousePalette): string | null {
  switch (health) {
    case 'overdue':
      return p.status.overdue;
    case 'today':
      return p.status.today;
    case 'soon':
      return p.status.soon;
    case 'ok':
      return p.status.ok;
    default:
      return null;
  }
}

function onActivate(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}

function describeZone(label: string, summary: ZoneSummary | undefined): string {
  if (!summary || summary.open === 0) return `${label}: nothing scheduled`;
  const parts = [`${summary.open} open`];
  if (summary.overdue) parts.push(`${summary.overdue} overdue`);
  if (summary.today) parts.push(`${summary.today} due today`);
  if (summary.soon) parts.push(`${summary.soon} due soon`);
  return `${label}: ${parts.join(', ')}`;
}

// ── Walls whose height animates (back wall segments and the left exterior wall) ──────────────

function BackWall({ x0, x1, height, p, clipId }: { x0: number; x1: number; height: MotionValue<number>; p: HousePalette; clipId: string }) {
  const face = useTransform(height, (h) =>
    pts([
      [x0, T, 0],
      [x1, T, 0],
      [x1, T, h],
      [x0, T, h],
    ]),
  );
  const cap = useTransform(height, (h) =>
    pts([
      [x0, 0, h],
      [x1, 0, h],
      [x1, T, h],
      [x0, T, h],
    ]),
  );
  return (
    <>
      <clipPath id={clipId}>
        <motion.polygon points={face} />
      </clipPath>
      <motion.polygon points={face} fill={p.wallBack} />
      <motion.polygon points={cap} fill={p.poche} />
    </>
  );
}

function LeftWall({ height, p, clipId }: { height: MotionValue<number>; p: HousePalette; clipId: string }) {
  const face = useTransform(height, (h) =>
    pts([
      [T, 0, 0],
      [T, D, 0],
      [T, D, h],
      [T, 0, h],
    ]),
  );
  const end = useTransform(height, (h) =>
    pts([
      [0, D, 0],
      [T, D, 0],
      [T, D, h],
      [0, D, h],
    ]),
  );
  const cap = useTransform(height, (h) =>
    pts([
      [0, 0, h],
      [T, 0, h],
      [T, D, h],
      [0, D, h],
    ]),
  );
  return (
    <>
      <clipPath id={clipId}>
        <motion.polygon points={face} />
      </clipPath>
      <motion.polygon points={face} fill={p.wallLeft} />
      <motion.polygon points={end} fill={p.poche} />
      <motion.polygon points={cap} fill={p.poche} />
    </>
  );
}

// ── Rooms ────────────────────────────────────────────────────────────────────────────────────

interface RoomProps {
  room: RoomDef;
  index: number;
  last: boolean;
  p: HousePalette;
  wallHeight: MotionValue<number>;
  state: 'normal' | 'selected' | 'dimmed';
  health: ZoneHealth;
  label: string;
  ariaLabel: string;
  showLabel: boolean;
  idPrefix: string;
  onSelect?: (zone: ZoneId) => void;
}

const Room = memo(function Room({
  room,
  index,
  last,
  p,
  wallHeight,
  state,
  health,
  label,
  ariaLabel,
  showLabel,
  idPrefix,
  onSelect,
}: RoomProps) {
  const fx0 = room.x0 + (index === 0 ? T : T / 2);
  const fx1 = room.x1 - (last ? T : T / 2);
  const floorPts = pts([
    [fx0, T, 0],
    [fx1, T, 0],
    [fx1, D, 0],
    [fx0, D, 0],
  ]);
  const wallClip = `${idPrefix}-${room.zone}-wall`;
  const leftClip = `${idPrefix}-${room.zone}-left`;
  const tint = healthColor(health, p);
  const select = () => onSelect?.(room.zone);
  const furniture = useMemo(() => roomFurniture(room.zone, p), [room.zone, p]);
  const wallArt = useMemo(() => backWallDetails(room.zone, p), [room.zone, p]);
  const mounted = useMemo(() => wallMounted(room.zone, p), [room.zone, p]);
  const leftArt = useMemo(() => (index === 0 ? leftWallDetails(room.zone, p) : null), [index, room.zone, p]);
  const texture = useMemo(() => floorTexture(room.floor, fx0, fx1, p), [room.floor, fx0, fx1, p]);
  const [lx, ly] = project(fx0 + 0.22, D - 0.22, 0);

  return (
    <motion.g
      className="house-room"
      role="button"
      tabIndex={onSelect ? 0 : -1}
      aria-label={ariaLabel}
      aria-pressed={state === 'selected'}
      onClick={(event) => {
        event.stopPropagation();
        select();
      }}
      onKeyDown={onActivate(select)}
      initial={false}
      animate={{ opacity: state === 'dimmed' ? 0.4 : 1 }}
      transition={{ duration: 0.35 }}
      style={{ cursor: onSelect ? 'pointer' : undefined }}
    >
      {index === 0 && (
        <>
          <LeftWall height={wallHeight} p={p} clipId={leftClip} />
          <g clipPath={`url(#${leftClip})`}>{leftArt}</g>
        </>
      )}
      <polygon points={floorPts} fill={p.floors[room.floor].base} />
      {texture}
      {tint && (
        <polygon
          points={floorPts}
          fill={tint}
          className={health === 'overdue' ? 'house-pulse' : undefined}
          opacity={health === 'ok' ? 0.1 : health === 'soon' ? 0.2 : 0.3}
        />
      )}
      {state === 'selected' && <polygon points={floorPts} fill={p.accent} opacity={0.12} />}
      <BackWall x0={room.x0} x1={room.x1} height={wallHeight} p={p} clipId={wallClip} />
      <g clipPath={`url(#${wallClip})`}>{wallArt}</g>
      {mounted && (
        <motion.g initial={false} animate={{ opacity: showLabel ? 1 : 0 }} transition={{ duration: 0.4, delay: showLabel ? 0.25 : 0 }}>
          {mounted}
        </motion.g>
      )}
      {furniture}
      {state === 'selected' && (
        <polygon
          points={floorPts}
          fill="none"
          stroke={p.accent}
          strokeWidth={0.07}
          strokeLinejoin="round"
          className="house-outline"
        />
      )}
      {showLabel && (
        <text
          className="house-floor-label"
          transform={`translate(${lx} ${ly}) matrix(0.866 0.5 -0.866 0.5 0 0)`}
          fontSize={0.3}
          fill={p.poche}
          opacity={0.55}
        >
          {label.toUpperCase()}
        </text>
      )}
    </motion.g>
  );
});

function Partition({ x, p }: { x: number; p: HousePalette }) {
  return (
    <Box
      at={[x - T / 2, T, 0]}
      size={[T, D - T, LOW_WALL]}
      color={p.wallLeft}
      left={p.poche}
      right={p.wallLeft}
      top={p.poche}
    />
  );
}

interface StoreyProps {
  level: LevelKey;
  p: HousePalette;
  focus: FocusTarget;
  selectedZone: ZoneId | null;
  summaries: HouseViewProps['summaries'];
  zoneLabel: (zone: ZoneId) => string;
  idPrefix: string;
  onSelect?: (zone: ZoneId) => void;
}

function Storey({ level, p, focus, selectedZone, summaries, zoneLabel, idPrefix, onSelect }: StoreyProps) {
  const focused = focus === level;
  const wallHeight = useSpring(focused ? BACK_WALL.focus : BACK_WALL.overview, { stiffness: 110, damping: 20 });
  useEffect(() => {
    wallHeight.set(focused ? BACK_WALL.focus : BACK_WALL.overview);
  }, [focused, wallHeight]);

  const rooms = ROOMS[level];
  const base = levelBase(level);
  const motionTarget = layerMotion(level, focus);
  const anySelected = selectedZone !== null && selectedZone !== 'house';

  const slab = (
    <Box
      at={[0, 0, -SLAB]}
      size={[W, D, SLAB]}
      color={p.poche}
      left={p.poche}
      right={shade(p.poche, -0.18)}
      top={p.floors[rooms[0].floor].base}
    />
  );

  return (
    <motion.g initial={false} animate={motionTarget} transition={SPRING} style={{ pointerEvents: motionTarget.opacity < 0.05 ? 'none' : undefined }}>
      <g transform={`translate(0 ${-base})`}>
        {slab}
        {rooms.map((room, index) => {
          const summary = summaries[room.zone];
          const label = zoneLabel(room.zone);
          return (
            <g key={room.zone}>
              <Room
                room={room}
                index={index}
                last={index === rooms.length - 1}
                p={p}
                wallHeight={wallHeight}
                state={!anySelected ? 'normal' : selectedZone === room.zone ? 'selected' : 'dimmed'}
                health={summary?.health ?? 'empty'}
                label={label}
                ariaLabel={describeZone(label, summary)}
                showLabel={focused}
                idPrefix={idPrefix}
                onSelect={onSelect}
              />
              {index < rooms.length - 1 && <Partition x={room.x1} p={p} />}
            </g>
          );
        })}
        <Box
          at={[W - T, T, 0]}
          size={[T, D - T, LOW_WALL]}
          color={p.wallExterior}
          left={p.poche}
          right={p.wallExterior}
          top={p.poche}
        />
        {level === 'ground' && (
          <YardZone
            p={p}
            summary={summaries.backyard}
            state={!anySelected ? 'normal' : selectedZone === 'backyard' ? 'selected' : 'dimmed'}
            label={zoneLabel('backyard')}
            onSelect={onSelect}
          />
        )}
      </g>
    </motion.g>
  );
}

function YardZone({
  p,
  summary,
  state,
  label,
  onSelect,
}: {
  p: HousePalette;
  summary?: ZoneSummary;
  state: 'normal' | 'selected' | 'dimmed';
  label: string;
  onSelect?: (zone: ZoneId) => void;
}) {
  const yard = useMemo(() => <Yard p={p} />, [p]);
  const tint = healthColor(summary?.health ?? 'empty', p);
  const top = pts([
    [YARD.x0 + 0.05, YARD.y0 + 0.08, 0.004],
    [YARD.x1 - 0.08, YARD.y0 + 0.08, 0.004],
    [YARD.x1 - 0.08, YARD.y1, 0.004],
    [YARD.x0 + 0.05, YARD.y1, 0.004],
  ]);
  const select = () => onSelect?.('backyard');
  return (
    <motion.g
      className="house-room"
      role="button"
      tabIndex={onSelect ? 0 : -1}
      aria-label={describeZone(label, summary)}
      aria-pressed={state === 'selected'}
      onClick={(event) => {
        event.stopPropagation();
        select();
      }}
      onKeyDown={onActivate(select)}
      initial={false}
      animate={{ opacity: state === 'dimmed' ? 0.4 : 1 }}
      style={{ cursor: onSelect ? 'pointer' : undefined }}
    >
      {yard}
      {tint && summary && summary.health !== 'ok' && (
        <polygon
          points={top}
          fill="none"
          stroke={tint}
          strokeWidth={0.12}
          strokeLinejoin="round"
          opacity={0.9}
          className={summary.health === 'overdue' ? 'house-pulse-strong' : undefined}
        />
      )}
      {state === 'selected' && (
        <polygon points={top} fill="none" stroke={p.accent} strokeWidth={0.07} className="house-outline" />
      )}
    </motion.g>
  );
}

function RoofLayer({
  p,
  focus,
  summary,
  state,
  label,
  onSelect,
}: {
  p: HousePalette;
  focus: FocusTarget;
  summary?: ZoneSummary;
  state: 'normal' | 'selected' | 'dimmed';
  label: string;
  onSelect?: (zone: ZoneId) => void;
}) {
  const roof = useMemo(() => <Roof p={p} />, [p]);
  const motionTarget = layerMotion('roof', focus);
  const select = () => onSelect?.('roof');
  const tint = healthColor(summary?.health ?? 'empty', p);
  const o = ROOF.overhang;
  const slope = pts([
    [-o, D + o, 0.16],
    [W + o, D + o, 0.16],
    [W + o, D / 2, ROOF.rise + 0.16],
    [-o, D / 2, ROOF.rise + 0.16],
  ]);
  const [gx0, gy0] = project(-o, D + o + 0.07, -0.06);
  const [gx1, gy1] = project(W + o, D + o + 0.07, -0.06);
  return (
    <motion.g initial={false} animate={motionTarget} transition={SPRING} style={{ pointerEvents: motionTarget.opacity < 0.05 ? 'none' : undefined }}>
      <motion.g
        transform={`translate(0 ${-ROOF_BASE})`}
        className="house-room"
        role="button"
        tabIndex={onSelect ? 0 : -1}
        aria-label={describeZone(label, summary)}
        aria-pressed={state === 'selected'}
        onClick={(event) => {
          event.stopPropagation();
          select();
        }}
        onKeyDown={onActivate(select)}
        initial={false}
        animate={{ opacity: state === 'dimmed' ? 0.4 : 1 }}
        style={{ cursor: onSelect ? 'pointer' : undefined }}
      >
        {roof}
        {tint && summary && summary.health !== 'ok' && (
          <line
            x1={gx0}
            y1={gy0}
            x2={gx1}
            y2={gy1}
            stroke={tint}
            strokeWidth={0.2}
            strokeLinecap="round"
            className={summary.health === 'overdue' ? 'house-pulse-strong' : undefined}
          />
        )}
        {state === 'selected' && <polygon points={slope} fill="none" stroke={p.accent} strokeWidth={0.07} className="house-outline" />}
      </motion.g>
    </motion.g>
  );
}

// ── Overlay: status pins and fixture highlights ─────────────────────────────────────────────

function layerBase(layer: Layer): number {
  return layer === 'roof' ? ROOF_BASE : levelBase(layer);
}

function Pin({
  zone,
  summary,
  p,
  label,
  onSelect,
}: {
  zone: ZoneId;
  summary: ZoneSummary;
  p: HousePalette;
  label: string;
  onSelect?: (zone: ZoneId) => void;
}) {
  const anchor = zoneAnchor(zone);
  if (!anchor) return null;
  const color = healthColor(summary.health, p);
  if (!color || summary.health === 'ok') return null;
  const [x, y] = project(anchor.point[0], anchor.point[1], anchor.point[2] + layerBase(anchor.level));
  const count = summary.overdue + summary.today + summary.soon;
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="house-pin"
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.(zone);
      }}
      style={{ cursor: onSelect ? 'pointer' : undefined }}
      aria-hidden
    >
      <title>{label}</title>
      <line x1={0} y1={0} x2={0} y2={-0.95} stroke={color} strokeWidth={0.05} strokeLinecap="round" />
      <circle cx={0} cy={0} r={0.08} fill={color} />
      {summary.health === 'overdue' && <circle cx={0} cy={-1.35} r={0.5} fill={color} className="house-ping" />}
      <circle cx={0} cy={-1.35} r={0.46} fill={color} stroke={p.dark ? '#0e1117' : '#ffffff'} strokeWidth={0.09} />
      <text x={0} y={-1.17} textAnchor="middle" fontSize={0.52} fontWeight={700} fill="#ffffff">
        {count}
      </text>
      {summary.fireOverdue && (
        <g transform="translate(0.42 -1.78)">
          <circle r={0.24} fill="#ffffff" />
          <path d="M0 -0.15 C0.1 -0.05 0.14 0.03 0.1 0.1 C0.06 0.16 -0.06 0.16 -0.1 0.1 C-0.14 0.03 -0.08 -0.04 -0.03 -0.08 C-0.03 0 0.02 0.02 0.03 -0.02 C0.05 -0.07 0.02 -0.11 0 -0.15Z" fill={p.status.overdue} />
        </g>
      )}
    </g>
  );
}

function FixtureRings({ fixture, layer, p }: { fixture: FixtureId; layer: Layer; p: HousePalette }) {
  return (
    <>
      {FIXTURE_ANCHORS[fixture].filter((anchor) => anchor.level === layer).map(({ level, point }, i) => {
        const [x, y] = project(point[0], point[1], point[2] + layerBase(level));
        return (
          <g key={i} transform={`translate(${x} ${y})`} pointerEvents="none">
            <circle r={0.55} fill={p.accent} opacity={0.18} className="house-ping" />
            <circle r={0.38} fill="none" stroke={p.accent} strokeWidth={0.08} className="house-ring" />
            <circle r={0.08} fill={p.accent} />
          </g>
        );
      })}
    </>
  );
}

function OverlayLayer({ layer, focus, children }: { layer: Layer; focus: FocusTarget; children: ReactNode }) {
  return (
    <motion.g initial={false} animate={layerMotion(layer, focus)} transition={SPRING}>
      {children}
    </motion.g>
  );
}

// ── The view ─────────────────────────────────────────────────────────────────────────────────

export function HouseView({
  summaries,
  selectedZone,
  highlightFixture = null,
  focus: focusProp = 'overview',
  dark = false,
  zoneLabel,
  onSelectZone,
  pins = true,
  className,
}: HouseViewProps) {
  const p = getPalette(dark);
  const idPrefix = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const focus: FocusTarget = selectedZone ? focusForZone(selectedZone) : focusProp;
  const viewBox = padded(cameraFor(focus, selectedZone), focus);
  const onSelect = onSelectZone ? (zone: ZoneId) => onSelectZone(zone === selectedZone ? null : zone) : undefined;
  const anySelected = selectedZone !== null && selectedZone !== 'house';

  const shadowCenter = project(W / 2 + 2, D / 2, -SLAB - 0.4);
  const layers: Layer[] = [...LEVEL_KEYS, 'roof'];

  return (
    <motion.svg
      className={className}
      viewBox={viewBox}
      initial={false}
      animate={{ viewBox }}
      transition={SPRING}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Your house. Select a room to see its tasks."
      onClick={() => onSelectZone?.(null)}
    >
      <defs>
        <radialGradient id={`${idPrefix}-shadow`}>
          <stop offset="0%" stopColor={p.dark ? '#000000' : '#3b2f22'} stopOpacity={p.dark ? 0.45 : 0.18} />
          <stop offset="100%" stopColor={p.dark ? '#000000' : '#3b2f22'} stopOpacity={0} />
        </radialGradient>
      </defs>
      <motion.ellipse
        cx={shadowCenter[0]}
        cy={shadowCenter[1] + 0.3}
        rx={10.5}
        ry={2.4}
        fill={`url(#${idPrefix}-shadow)`}
        initial={false}
        animate={{ opacity: focus === 'overview' || focus === 'basement' ? 1 : 0 }}
      />
      {LEVEL_KEYS.map((level) => (
        <Storey
          key={level}
          level={level}
          p={p}
          focus={focus}
          selectedZone={selectedZone}
          summaries={summaries}
          zoneLabel={zoneLabel}
          idPrefix={idPrefix}
          onSelect={onSelect}
        />
      ))}
      <RoofLayer
        p={p}
        focus={focus}
        summary={summaries.roof}
        state={!anySelected ? 'normal' : selectedZone === 'roof' ? 'selected' : 'dimmed'}
        label={zoneLabel('roof')}
        onSelect={onSelect}
      />
      {layers.map((layer) => (
        <OverlayLayer key={layer} layer={layer} focus={focus}>
          {pins &&
            Object.values(summaries)
              .filter((s): s is ZoneSummary => Boolean(s) && s?.zoneId !== selectedZone)
              .filter((s) => {
                const anchor = zoneAnchor(s.zoneId);
                return anchor !== null && anchor.level === layer;
              })
              .map((s) => (
                <Pin key={s.zoneId} zone={s.zoneId} summary={s} p={p} label={zoneLabel(s.zoneId)} onSelect={onSelect} />
              ))}
          {highlightFixture && <FixtureRings key={highlightFixture} fixture={highlightFixture} layer={layer} p={p} />}
        </OverlayLayer>
      ))}
    </motion.svg>
  );
}
