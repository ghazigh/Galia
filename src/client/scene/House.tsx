import type { ZoneHealth, ZoneSummary } from '@shared/status';
import type { FixtureId, ZoneId } from '@shared/types';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import {
  BufferAttribute,
  ExtrudeGeometry,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Shape,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
  type Mesh,
} from 'three';
import { mergeGeometries, polygonGeometry, setWorldBoxSpan, TILE, worldBox } from './geometry';
import {
  ALCOVE,
  BAY,
  CORNER,
  D,
  DRYER_VENT_Z,
  EAVE_DROP,
  fromPlan,
  GABLE,
  H,
  HOSE_BIB_Z,
  layerLift,
  levelBase,
  levelOpen,
  OPENINGS,
  partitions,
  RECTS,
  ROOF,
  SLAB,
  T,
  terrainRaised,
  W,
  WALL,
  wallFace,
  WALL_NORMAL,
  wallPieces,
  type Layer,
  type Opening,
  type Rect3D,
  type SceneView,
  type WallSide,
} from './layout';
import { ballGeometry, partMaterial, roundedBox, shellMaterials, unitBox, unitCylinder, wallFaces } from './materials';
import { rectParts, type Part } from './parts';
import { terrainHeight } from './terrain';

export type LayerOffsets = Record<Layer, number>;

export const STATUS_COLORS: Record<Exclude<ZoneHealth, 'empty'> | 'accent', string> = {
  overdue: '#ff4d47',
  today: '#ff9a3d',
  soon: '#f2c14e',
  ok: '#3ccf8e',
  accent: '#5a83ff',
};

// Status floors and outlines share one material per state, pulsed once per frame.
export const statusFill = Object.fromEntries(
  Object.entries(STATUS_COLORS).map(([key, color]) => [
    key,
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }),
  ]),
) as Record<keyof typeof STATUS_COLORS, MeshBasicMaterial>;
export const statusEdge = Object.fromEntries(
  Object.entries(STATUS_COLORS).map(([key, color]) => [key, new MeshBasicMaterial({ color, toneMapped: false })]),
) as Record<keyof typeof STATUS_COLORS, MeshBasicMaterial>;
/** Washes over the lawn when a task is about it. */
export const lawnGlow = new MeshBasicMaterial({ color: '#4f7bff', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });

export function pulseStatus(time: number, animate: boolean) {
  const wave = animate ? (Math.sin(time * 2.6) + 1) / 2 : 0.5;
  statusFill.overdue.opacity = 0.2 + 0.28 * wave;
  statusFill.today.opacity = 0.3;
  statusFill.soon.opacity = 0.22;
  statusFill.ok.opacity = 0.1;
  statusFill.accent.opacity = 0.07 + 0.07 * wave;
  statusEdge.accent.color.set(STATUS_COLORS.accent).multiplyScalar(0.75 + 0.5 * wave);
  lawnGlow.opacity = 0.18 + 0.3 * wave;
  const highlight = shellMaterials().highlight;
  highlight.emissiveIntensity = animate ? 0.5 + 1.3 * wave : 1.1;
}

export function healthKey(health: ZoneHealth | undefined): keyof typeof STATUS_COLORS | null {
  return health && health !== 'empty' ? health : null;
}

export const damp = (current: number, target: number, lambda: number, dt: number) => MathUtils.damp(current, target, lambda, Math.min(dt, 0.1));

// ── Furniture ─────────────────────────────────────────────────────────────────────────────────

/** A part in plan coordinates (x back→garage end, y right→entry side, z up), placed in the scene. */
const PartMesh = memo(function PartMesh({ part, highlighted }: { part: Part; highlighted: boolean }) {
  const material = highlighted ? shellMaterials().highlight : partMaterial(part.m);
  if (part.kind === 'box') {
    const [x, y, z] = part.p;
    const [sx, sy, sz] = part.s;
    const [cx, cz] = fromPlan(x + sx / 2, y + sy / 2);
    // Plan x runs along scene x and plan y along scene z.
    const big = sx * sy * sz > 0.04;
    if (part.r) {
      return <mesh geometry={roundedBox(sx, sz, sy, part.r)} material={material} position={[cx, z + sz / 2, cz]} castShadow={big} receiveShadow />;
    }
    return <mesh geometry={unitBox} material={material} position={[cx, z + sz / 2, cz]} scale={[sx, sz, sy]} castShadow={big} receiveShadow />;
  }
  if (part.kind === 'cyl') {
    const [x, y, z] = part.p;
    const [cx, cz] = fromPlan(x, y);
    const big = part.r * part.r * part.h > 0.015;
    if (part.axis) {
      return (
        <mesh
          geometry={unitCylinder(part.seg)}
          material={material}
          position={[cx, z, cz]}
          rotation={part.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
          scale={[part.r, part.h, part.r]}
          castShadow={big}
        />
      );
    }
    return <mesh geometry={unitCylinder(part.seg)} material={material} position={[cx, z + part.h / 2, cz]} scale={[part.r, part.h, part.r]} castShadow={big} receiveShadow />;
  }
  const [x, y, z] = part.p;
  const [cx, cz] = fromPlan(x, y);
  return <mesh geometry={ballGeometry(Boolean(part.facet))} material={material} position={[cx, z, cz]} scale={[part.r, part.r * (part.sy ?? 1), part.r]} castShadow />;
});

function Parts({ parts, highlight }: { parts: readonly Part[]; highlight: FixtureId | null }) {
  return (
    <>
      {parts.map((part, i) => (
        <PartMesh key={i} part={part} highlighted={Boolean(highlight && 'f' in part && part.f === highlight)} />
      ))}
    </>
  );
}

// ── Walls that lower themselves on the side facing the camera ────────────────────────────────

interface Clipped {
  mesh: Mesh;
  v0: number;
  v1: number;
  /** Shown only while the wall stands at full height (lights, canopy, downspouts). */
  whole?: boolean;
}

/** Shows the part of [v0, v1] below `height` (a wall or window cut to that height). */
function clip(items: Clipped[], height: number, full: number) {
  for (const item of items) {
    const { mesh, v0, v1 } = item;
    if (item.whole) {
      mesh.visible = height >= full - 0.02;
      continue;
    }
    const top = Math.min(v1, height);
    const span = top - v0;
    if (span <= 0.005) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.scale.y = span;
    mesh.position.y = v0 + span / 2;
    setWorldBoxSpan(mesh.geometry, span);
  }
}

interface WallRegistry {
  sides: Record<WallSide, Clipped[]>;
  partitions: Clipped[];
}

type Level = 'basement' | 'ground' | 'upper';

/** A box against a wall: `out` is its center's distance outside the wall's outer face. */
function onWall(side: WallSide, face: number, u: number, out: number, length: number, thickness: number) {
  const [nx, nz] = WALL_NORMAL[side];
  const offset = face + out;
  return side === 'front' || side === 'back'
    ? { x: u, z: nz * offset, w: length, d: thickness }
    : { x: nx * offset, z: u, w: thickness, d: length };
}

interface Piece {
  key: string;
  x: number;
  z: number;
  w: number;
  d: number;
  v0: number;
  v1: number;
  material: Material;
}

/** Frames, glass, sills, door leaves and the garage door for one opening. */
function openingPieces(level: Level, side: WallSide, opening: Opening, lit: boolean, highlight: FixtureId | null, stacked: boolean): Piece[] {
  const m = shellMaterials();
  const u = (opening.u0 + opening.u1) / 2;
  const length = opening.u1 - opening.u0;
  const face = wallFace(level, side, u);
  const top = level === 'upper' ? H : WALL;
  const below = opening.v0 <= -SLAB + 1e-3; // continues from the storey below
  const above = opening.v1 >= top - 1e-3 && level !== 'upper'; // continues into the storey above
  const v0 = Math.max(opening.v0, -SLAB);
  const v1 = Math.min(opening.v1, top);
  const out: Piece[] = [];
  const add = (key: string, du: number, depth: number, lu: number, thickness: number, a: number, b: number, material: Material) =>
    out.push({ key, ...onWall(side, face, u + du, depth, lu, thickness), v0: a, v1: b, material });
  const glass = highlight === 'windows' ? m.highlight : lit ? m.glass : m.glassDim;

  switch (opening.kind) {
    case 'window': {
      add('frame', 0, -0.07, length, 0.08, v0, v1, m.frame);
      add('glass', 0, -0.06, length - 0.12, 0.03, below ? v0 : v0 + 0.06, above ? v1 : v1 - 0.06, glass);
      if (length > 1.25) add('mullion', -length * 0.12, -0.04, 0.06, 0.05, v0, v1, m.frame);
      if (!below && !stacked) add('sill', 0, 0.03, length + 0.12, 0.12, v0 - 0.06, v0, m.sill);
      break;
    }
    case 'patio': {
      add('frame', 0, -0.07, length, 0.08, v0, v1, m.frame);
      add('fixed', -length / 4, -0.075, length / 2 - 0.1, 0.025, v0 + 0.07, v1 - 0.07, glass);
      add('slider', length / 4, -0.04, length / 2 - 0.1, 0.025, v0 + 0.07, v1 - 0.07, glass);
      add('stile', 0, -0.03, 0.08, 0.06, v0, v1, m.frame);
      add('handle', 0.1, 0.0, 0.03, 0.04, 0.95, 1.2, m.metal);
      add('sill', 0, 0.02, length + 0.1, 0.1, v0 - 0.05, v0 + 0.01, m.sill);
      break;
    }
    case 'door': {
      const leaf = highlight === 'front-door' ? m.highlight : m.door;
      add('frame', 0, -0.07, length, 0.08, v0, v1, m.frame);
      add('leaf', 0, -0.06, length - 0.1, 0.05, v0, v1 - 0.05, leaf);
      add('handle', length * 0.3, 0.0, 0.03, 0.05, 0.95, 1.2, m.metal);
      break;
    }
    case 'garage': {
      add('door', 0, -0.07, length, 0.06, v0, v1, highlight === 'garage-door' ? m.highlight : m.garage);
      add('header', 0, 0.0, length + 0.12, 0.06, v1, v1 + 0.09, m.trim);
      break;
    }
    case 'panel':
      add('panel', 0, -0.05, length, 0.05, v0, v1, m.metal);
      break;
  }
  return out;
}

interface Fixture {
  key: string;
  side: WallSide;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: Material;
  /** Lying cylinder instead of a box (along the wall normal). */
  cylinder?: boolean;
}

/** Things fixed to the outside of a storey: canopy, lights, faucet, vent, downspouts. */
function exteriorFixtures(level: Level, highlight: FixtureId | null): Fixture[] {
  const m = shellMaterials();
  const out: Fixture[] = [];
  const top = level === 'upper' ? H - 0.62 : WALL;
  // Downspouts run down the corners from the gutters to the ground.
  const spouts: { side: WallSide; x: number; z: number }[] = [
    { side: 'front', x: -W / 2 + 0.32, z: D / 2 + 0.07 },
    { side: 'right', x: W / 2 + 0.07, z: D / 2 - 0.3 },
    { side: 'right', x: W / 2 + 0.07, z: -D / 2 + 0.3 },
    { side: 'left', x: -W / 2 - 0.07, z: -D / 2 + 0.3 },
  ];
  const base = levelBase(level);
  for (const [i, s] of spouts.entries()) {
    const grade = terrainHeight(s.x, s.z) - base;
    const from = Math.max(-SLAB, grade + 0.08);
    if (from >= top - 0.1) continue;
    out.push({ key: `spout${i}`, side: s.side, x: s.x, y: (from + top) / 2, z: s.z, w: 0.08, h: top - from, d: 0.08, material: m.gutter });
  }
  if (level === 'ground') {
    const canopyFront = D / 2 + BAY.out + 0.55;
    out.push(
      // Flat dark canopy over the entry alcove.
      { key: 'canopy', side: 'front', x: (ALCOVE.x0 - 0.3 + BAY.x1 - 0.35) / 2, y: 2.65, z: (D / 2 + canopyFront) / 2, w: BAY.x1 - 0.35 - (ALCOVE.x0 - 0.3), h: 0.8, d: canopyFront - D / 2, material: m.metal },
      { key: 'canopyCap', side: 'front', x: (ALCOVE.x0 - 0.3 + BAY.x1 - 0.35) / 2, y: 3.09, z: (D / 2 + canopyFront - 0.12) / 2, w: BAY.x1 - 0.45 - (ALCOVE.x0 - 0.3), h: 0.08, d: canopyFront - 0.12 - D / 2, material: m.trim },
      { key: 'potlight', side: 'front', x: (ALCOVE.x0 + ALCOVE.x1) / 2, y: 2.245, z: D / 2 + 0.55, w: 0.1, h: 0.012, d: 0.1, material: m.sconce },
      // Small cube light beside the door, and the floodlight on the brick by the bay.
      { key: 'sconce', side: 'front', x: ALCOVE.x0 + 1.05, y: 2.02, z: D / 2 + 0.06, w: 0.11, h: 0.16, d: 0.11, material: m.sconce },
      { key: 'flood', side: 'front', x: BAY.x1 + 0.75, y: 2.45, z: D / 2 + 0.06, w: 0.24, h: 0.16, d: 0.1, material: m.trim },
      { key: 'floodLens', side: 'front', x: BAY.x1 + 0.75, y: 2.36, z: D / 2 + 0.08, w: 0.2, h: 0.02, d: 0.08, material: m.sconce },
      // Backyard end: light over the patio door, the dryer vent hood and the outdoor faucet.
      { key: 'patioLight', side: 'left', x: -W / 2 - 0.06, y: 2.15, z: 0.75, w: 0.11, h: 0.16, d: 0.11, material: m.sconce },
      { key: 'dryerVent', side: 'left', x: -W / 2 - 0.09, y: -0.05, z: DRYER_VENT_Z, w: 0.18, h: 0.24, d: 0.28, material: highlight === 'dryer-vent' ? m.highlight : partMaterial('steel') },
      { key: 'hoseBib', side: 'left', x: -W / 2 - 0.07, y: 0.25, z: HOSE_BIB_Z, w: 0.14, h: 0.04, d: 0.04, material: highlight === 'hose-bib' ? m.highlight : partMaterial('copper'), cylinder: true },
    );
  }
  if (level === 'basement') {
    out.push({ key: 'garageLight', side: 'right', x: W / 2 + 0.06, y: 2.0, z: CORNER.z0 + 0.35, w: 0.11, h: 0.16, d: 0.11, material: m.sconce });
  }
  return out;
}

function ExteriorWalls({ level, registry, highlight, view }: { level: Level; registry: MutableRefObject<WallRegistry>; highlight: FixtureId | null; view: SceneView }) {
  const m = shellMaterials();
  const sides: WallSide[] = ['front', 'back', 'left', 'right'];
  const base = levelBase(level);
  // Each wall piece gets its own geometry, so its texture follows the world (and survives cuts).
  const pieces = useMemo(
    () =>
      sides.map((side) =>
        wallPieces(level, side).map((piece) => ({
          ...piece,
          geometry: worldBox(piece.w, piece.d, piece.v1 - piece.v0, [piece.x, piece.z], base + piece.v0),
          material: wallFaces(side, m.cladding[piece.m]),
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level],
  );
  useEffect(() => () => pieces.flat().forEach((piece) => piece.geometry.dispose()), [pieces]);
  const raised = terrainRaised(view);
  const fixtures = useMemo(() => exteriorFixtures(level, highlight), [level, highlight]);
  const register = (side: WallSide, v0: number, v1: number, whole = false) => (mesh: Mesh | null) => {
    const list = registry.current.sides[side];
    if (mesh && !list.some((item) => item.mesh === mesh)) list.push({ mesh, v0, v1, whole });
  };
  return (
    <>
      {sides.map((side, s) => (
        <group key={side}>
          {pieces[s].map((piece, i) => (
            <mesh
              key={`w${i}`}
              ref={register(side, piece.v0, piece.v1)}
              geometry={piece.geometry}
              material={piece.material}
              position={[piece.x, (piece.v0 + piece.v1) / 2, piece.z]}
              scale={[1, piece.v1 - piece.v0, 1]}
              castShadow
              receiveShadow
            />
          ))}
          {OPENINGS[level][side].flatMap((opening, i) =>
            // A few windows stay dark at night so the house doesn't read as a lantern.
            openingPieces(
              level,
              side,
              opening,
              (i + level.length + s) % 3 !== 1,
              highlight,
              // Stacked on another opening (a dark panel below): no sill between them.
              OPENINGS[level][side].some((o) => o !== opening && Math.abs(o.v1 - opening.v0) < 1e-3 && o.u0 < opening.u1 && o.u1 > opening.u0),
            ).map((p) => (
              <mesh
                key={`o${i}${p.key}`}
                ref={register(side, p.v0, p.v1)}
                geometry={unitBox}
                material={p.material}
                position={[p.x, (p.v0 + p.v1) / 2, p.z]}
                scale={[p.w, p.v1 - p.v0, p.d]}
                receiveShadow
              />
            )),
          )}
        </group>
      ))}
      {fixtures.map((f) =>
        // Downspouts below the yard level only exist while the lot stands at its real heights.
        f.key.startsWith('spout') && level === 'basement' && !raised ? null : (
          <mesh
            key={f.key}
            ref={register(f.side, f.y - f.h / 2, f.y + f.h / 2, true)}
            geometry={f.cylinder ? unitCylinder(12) : unitBox}
            material={f.material}
            position={[f.x, f.y, f.z]}
            rotation={f.cylinder ? [0, 0, Math.PI / 2] : undefined}
            scale={f.cylinder ? [f.d / 2, f.w, f.d / 2] : [f.w, f.h, f.d]}
            castShadow={f.h * f.w > 0.05}
          />
        ),
      )}
    </>
  );
}

// ── A storey ──────────────────────────────────────────────────────────────────────────────────

export interface StoreyProps {
  level: Level;
  view: SceneView;
  summaries: Partial<Record<ZoneId, ZoneSummary>>;
  selectedZone: ZoneId | null;
  highlight: FixtureId | null;
  offsets: MutableRefObject<LayerOffsets>;
  animate: boolean;
  onRoomTap: (zone: ZoneId, level: Level) => void;
}

/** Clamps a plan part to the inside faces of the exterior walls. */
function inner(rect: Rect3D) {
  return {
    x0: Math.max(rect.x0, -W / 2 + T),
    x1: Math.min(rect.x1, W / 2 - T),
    z0: Math.max(rect.z0, -D / 2 + T),
    z1: Math.min(rect.z1, D / 2 - T),
  };
}

function RoomStatus({ rect, health, selected }: { rect: Rect3D; health: ZoneHealth | undefined; selected: boolean }) {
  const key = selected ? 'accent' : healthKey(health);
  if (!key) return null;
  const b = inner(rect);
  const w = b.x1 - b.x0 - 0.1;
  const d = b.z1 - b.z0 - 0.1;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const edge = selected ? 0.07 : 0.035;
  const edgeMaterial = statusEdge[key];
  return (
    <group>
      <mesh geometry={unitBox} material={statusFill[key]} position={[cx, 0.03, cz]} scale={[w, 0.004, d]} renderOrder={2} />
      {key !== 'ok' && (
        <>
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx, 0.035, cz + d / 2]} scale={[w, 0.01, edge]} />
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx, 0.035, cz - d / 2]} scale={[w, 0.01, edge]} />
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx - w / 2, 0.035, cz]} scale={[edge, 0.01, d]} />
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx + w / 2, 0.035, cz]} scale={[edge, 0.01, d]} />
        </>
      )}
    </group>
  );
}

export function Storey({ level, view, summaries, selectedZone, highlight, offsets, animate, onRoomTap }: StoreyProps) {
  const group = useRef<Group>(null);
  const registry = useRef<WallRegistry>({ sides: { front: [], back: [], left: [], right: [] }, partitions: [] });
  // The top storey's walls run up to the roof plate.
  const full = level === 'upper' ? H : WALL;
  const heights = useRef<Record<WallSide | 'partitions', number>>({ front: full, back: full, left: full, right: full, partitions: WALL });
  // Wall pieces start at full height; the first frame clips them to the view's heights.
  const initialized = useRef(false);
  const rects = RECTS[level];
  const walls = useMemo(() => partitions(level), [level]);
  const base = levelBase(level);
  const open = levelOpen(level, view);
  const m = shellMaterials();
  const furniture = useMemo(() => rects.map((rect) => rectParts(rect.id)), [rects]);

  useEffect(() => {
    const y = base + layerLift(level, view);
    if (group.current && !animate) group.current.position.y = y;
  }, [animate, base, level, view]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const lift = layerLift(level, view);
    const targetY = base + lift;
    g.position.y = animate ? damp(g.position.y, targetY, 5.5, dt) : targetY;
    offsets.current[level] = g.position.y - base;
    // Storeys flown out of the way stop rendering once they're out of sight.
    g.visible = !(lift > 10 && g.position.y - base > 9);

    // Walls facing the camera drop so the rooms read from any angle.
    const cam = state.camera.position;
    const len = Math.hypot(cam.x, cam.z) || 1;
    const cx = cam.x / len;
    const cz = cam.z / len;
    for (const side of ['front', 'back', 'left', 'right'] as WallSide[]) {
      const [nx, nz] = WALL_NORMAL[side];
      const facing = nx * cx + nz * cz > 0.2;
      const target = !open ? full : view.kind === 'exploded' ? (facing ? 0.3 : 1.15) : facing ? 0.3 : full;
      const next = animate ? damp(heights.current[side], target, 7, dt) : target;
      if (Math.abs(next - heights.current[side]) > 0.0005 || !initialized.current) {
        heights.current[side] = next;
        clip(registry.current.sides[side], next, full);
      }
    }
    initialized.current = true;
    const partitionTarget = !open ? WALL : view.kind === 'exploded' ? 0.55 : 0.95;
    const partitionHeight = animate ? damp(heights.current.partitions, partitionTarget, 7, dt) : partitionTarget;
    heights.current.partitions = partitionHeight;
    clip(registry.current.partitions, partitionHeight, WALL);
  });

  const registerPartition = (mesh: Mesh | null) => {
    if (mesh && !registry.current.partitions.some((item) => item.mesh === mesh)) registry.current.partitions.push({ mesh, v0: 0, v1: WALL });
  };

  const tap = (zone: ZoneId) => (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 8) return;
    event.stopPropagation();
    onRoomTap(zone, level);
  };

  return (
    <group ref={group} position={[0, base, 0]}>
      {/* Floor slab, tucked inside the walls. */}
      <mesh geometry={unitBox} material={m.cut} position={[0, -SLAB / 2, 0]} scale={[W - 0.04, SLAB, D - 0.04]} receiveShadow />
      {rects.map((rect, index) => {
        const b = inner(rect);
        const zone = rect.zone;
        return (
          <group key={rect.id}>
            <mesh
              geometry={unitBox}
              material={m.floors[rect.floor]}
              position={[(b.x0 + b.x1) / 2, 0.01, (b.z0 + b.z1) / 2]}
              scale={[b.x1 - b.x0, 0.02, b.z1 - b.z0]}
              receiveShadow
            />
            {open && zone && <RoomStatus rect={rect} health={summaries[zone]?.health} selected={selectedZone === zone} />}
            {open && <Parts parts={furniture[index]} highlight={highlight} />}
            {zone && (
              // Invisible volume that makes the room tappable.
              <mesh
                geometry={unitBox}
                material={m.hidden}
                position={[(rect.x0 + rect.x1) / 2, WALL / 2, (rect.z0 + rect.z1) / 2]}
                scale={[rect.x1 - rect.x0, WALL, rect.z1 - rect.z0]}
                onClick={tap(zone)}
                onPointerOver={() => (document.body.style.cursor = 'pointer')}
                onPointerOut={() => (document.body.style.cursor = '')}
              />
            )}
          </group>
        );
      })}
      {walls.map((wall, i) => (
        <mesh
          key={i}
          ref={registerPartition}
          geometry={unitBox}
          material={wallFaces('partition')}
          position={[wall.x, WALL / 2, wall.z]}
          scale={[wall.w, WALL, wall.d]}
          castShadow
          receiveShadow
        />
      ))}
      <ExteriorWalls level={level} registry={registry} highlight={highlight} view={view} />
    </group>
  );
}

// ── Roof ──────────────────────────────────────────────────────────────────────────────────────

// A hip roof over the main block (ridge along the house), with a steeper front gable over the
// entry bay. Built in roof-local coordinates: y = 0 is the top of the walls.
const O = ROOF.overhang;
const YE = -EAVE_DROP; // eave line
const XR = W / 2 - D / 2; // half-length of the ridge
const FASCIA = 0.2;
const GX = (GABLE.x0 + GABLE.x1) / 2;
const GF = GABLE.face + GABLE.front; // front edge of the gable roof
const GB = (D / 2) * (1 - GABLE.rise / ROOF.rise) - 0.15; // where its ridge has run into the hip roof
// The hip roof's front stops at the valleys where the gable's slopes run into it.
const NOTCH = [GX - (GABLE.rise - YE), GX + (GABLE.rise - YE)] as const;

const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

function roofGeometry(): BufferGeometry {
  // Every plane of the hip roof has the same pitch.
  const slope = Math.hypot(ROOF.rise, D / 2);
  const front = polygonGeometry(
    [
      v3(-(W / 2 + O), YE, D / 2 + O),
      v3(NOTCH[0], YE, D / 2 + O),
      v3(GABLE.x0, 0, D / 2),
      v3(GABLE.x1, 0, D / 2),
      v3(NOTCH[1], YE, D / 2 + O),
      v3(W / 2 + O, YE, D / 2 + O),
      v3(XR, ROOF.rise, 0),
      v3(-XR, ROOF.rise, 0),
    ],
    v3(0, D / 2, ROOF.rise).normalize(),
    v3(1, 0, 0),
    v3(0, ROOF.rise / slope, -D / 2 / slope),
    v3(0, YE, D / 2 + O),
  );
  const back = polygonGeometry(
    [v3(W / 2 + O, YE, -(D / 2 + O)), v3(-(W / 2 + O), YE, -(D / 2 + O)), v3(-XR, ROOF.rise, 0), v3(XR, ROOF.rise, 0)],
    v3(0, D / 2, -ROOF.rise).normalize(),
    v3(-1, 0, 0),
    v3(0, ROOF.rise / slope, D / 2 / slope),
    v3(0, YE, -(D / 2 + O)),
  );
  const left = polygonGeometry(
    [v3(-(W / 2 + O), YE, -(D / 2 + O)), v3(-(W / 2 + O), YE, D / 2 + O), v3(-XR, ROOF.rise, 0)],
    v3(-D / 2, ROOF.rise, 0).normalize(),
    v3(0, 0, 1),
    v3(D / 2 / slope, ROOF.rise / slope, 0),
    v3(-(W / 2 + O), YE, 0),
  );
  const right = polygonGeometry(
    [v3(W / 2 + O, YE, D / 2 + O), v3(W / 2 + O, YE, -(D / 2 + O)), v3(XR, ROOF.rise, 0)],
    v3(D / 2, ROOF.rise, 0).normalize(),
    v3(0, 0, -1),
    v3(-D / 2 / slope, ROOF.rise / slope, 0),
    v3(W / 2 + O, YE, 0),
  );
  // The front gable's two 45° slopes, running back until they disappear into the hip roof.
  const diag = Math.SQRT1_2;
  const gableLeft = polygonGeometry(
    [v3(GABLE.x0 - GABLE.side, -GABLE.side, GB), v3(GABLE.x0 - GABLE.side, -GABLE.side, GF), v3(GX, GABLE.rise, GF), v3(GX, GABLE.rise, GB)],
    v3(-diag, diag, 0),
    v3(0, 0, -1),
    v3(diag, diag, 0),
    v3(GABLE.x0 - GABLE.side, -GABLE.side, 0),
  );
  const gableRight = polygonGeometry(
    [v3(GABLE.x1 + GABLE.side, -GABLE.side, GF), v3(GABLE.x1 + GABLE.side, -GABLE.side, GB), v3(GX, GABLE.rise, GB), v3(GX, GABLE.rise, GF)],
    v3(diag, diag, 0),
    v3(0, 0, 1),
    v3(-diag, diag, 0),
    v3(GABLE.x1 + GABLE.side, -GABLE.side, 0),
  );
  return mergeGeometries([front, back, left, right, gableLeft, gableRight]);
}

/** Light brick triangle closing the front gable, textured to continue the bay below it. */
function pedimentGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(GABLE.x0, 0);
  shape.lineTo(GABLE.x1, 0);
  shape.lineTo(GX, GABLE.rise);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  geometry.translate(0, 0, GABLE.face - T);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < position.count; i += 1) uv.setXY(i, position.getX(i) / TILE, (position.getY(i) + ROOF.base) / TILE);
  uv.needsUpdate = true;
  return geometry;
}

/** A box from `a` to `b` (its long axis), `w` wide and `h` thick, `up` choosing its roll. */
function Beam({ a, b, w, h, up = v3(0, 1, 0), material }: { a: Vector3; b: Vector3; w: number; h: number; up?: Vector3; material: Material }) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const side = up.clone().cross(dir).normalize();
    const realUp = dir.clone().cross(side).normalize();
    // Local x along the beam, y up, z to the side.
    const basis = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir, realUp, dir.clone().cross(realUp)));
    return { position: a.clone().add(b).multiplyScalar(0.5), quaternion: basis, length: len };
  }, [a, b, up]);
  return <mesh geometry={unitBox} material={material} position={position} quaternion={quaternion} scale={[length, h, w]} castShadow />;
}

export function RoofLayer({
  view,
  highlight,
  selected,
  health,
  offsets,
  animate,
  onTap,
}: {
  view: SceneView;
  highlight: FixtureId | null;
  selected: boolean;
  health: ZoneHealth | undefined;
  offsets: MutableRefObject<LayerOffsets>;
  animate: boolean;
  onTap: () => void;
}) {
  const group = useRef<Group>(null);
  const m = shellMaterials();
  const roof = useMemo(() => roofGeometry(), []);
  const pediment = useMemo(() => pedimentGeometry(), []);
  useEffect(
    () => () => {
      roof.dispose();
      pediment.dispose();
    },
    [roof, pediment],
  );

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const lift = layerLift('roof', view);
    g.position.y = animate ? damp(g.position.y, ROOF.base + lift, 5, dt) : ROOF.base + lift;
    offsets.current.roof = g.position.y - ROOF.base;
    g.visible = !(lift > 10 && g.position.y - ROOF.base > 9);
  });

  const tap = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 8) return;
    event.stopPropagation();
    onTap();
  };
  const gutter = highlight === 'gutters' ? m.highlight : m.gutter;
  const edge = selected ? statusEdge.accent : health && health !== 'empty' && health !== 'ok' ? statusEdge[health] : null;

  // Eave runs (fascia, gutter, soffit), the front one interrupted by the gable.
  const eaves: { key: string; a: number; b: number; side: WallSide }[] = [
    { key: 'fl', a: -(W / 2 + O), b: NOTCH[0], side: 'front' },
    { key: 'fr', a: NOTCH[1], b: W / 2 + O, side: 'front' },
    { key: 'bk', a: -(W / 2 + O), b: W / 2 + O, side: 'back' },
    { key: 'lt', a: -(D / 2 + O), b: D / 2 + O, side: 'left' },
    { key: 'rt', a: -(D / 2 + O), b: D / 2 + O, side: 'right' },
  ];
  const along = (side: WallSide, a: number, b: number, out: number, y: number, h: number, t: number) => {
    const [nx, nz] = WALL_NORMAL[side];
    const reach = (side === 'front' || side === 'back' ? D / 2 : W / 2) + out;
    return side === 'front' || side === 'back'
      ? { position: [(a + b) / 2, y, nz * reach] as const, scale: [b - a, h, t] as const }
      : { position: [nx * reach, y, (a + b) / 2] as const, scale: [t, h, b - a] as const };
  };
  const soffit = (side: WallSide, a: number, b: number) => {
    const [nx, nz] = WALL_NORMAL[side];
    const mid = (side === 'front' || side === 'back' ? D / 2 : W / 2) + O / 2;
    const y = YE - FASCIA + 0.01;
    return side === 'front' || side === 'back'
      ? { position: [(a + b) / 2, y, nz * mid] as const, scale: [b - a, 0.02, O] as const }
      : { position: [nx * mid, y, (a + b) / 2] as const, scale: [O, 0.02, Math.min(b - a, D)] as const };
  };
  const spoutTops: { x: number; z: number; side: WallSide }[] = [
    { x: -W / 2 + 0.32, z: D / 2, side: 'front' },
    { x: W / 2, z: D / 2 - 0.3, side: 'right' },
    { x: W / 2, z: -D / 2 + 0.3, side: 'right' },
    { x: -W / 2, z: -D / 2 + 0.3, side: 'left' },
  ];
  const caps = [
    [v3(-XR, ROOF.rise, 0), v3(XR, ROOF.rise, 0)],
    [v3(-XR, ROOF.rise, 0), v3(-(W / 2 + O), YE, D / 2 + O)],
    [v3(-XR, ROOF.rise, 0), v3(-(W / 2 + O), YE, -(D / 2 + O))],
    [v3(XR, ROOF.rise, 0), v3(W / 2 + O, YE, D / 2 + O)],
    [v3(XR, ROOF.rise, 0), v3(W / 2 + O, YE, -(D / 2 + O))],
    [v3(GX, GABLE.rise, GB), v3(GX, GABLE.rise, GF)],
  ];

  return (
    <group ref={group} position={[0, ROOF.base, 0]}>
      {/* Attic floor, seen from below when the roof lifts off. */}
      <mesh geometry={unitBox} material={m.cut} position={[0, -SLAB / 2, 0]} scale={[W - 0.04, SLAB, D - 0.04]} />
      <mesh geometry={roof} material={m.roof} castShadow receiveShadow onClick={tap} />
      <mesh geometry={pediment} material={m.cladding.brickLight} castShadow receiveShadow />
      {caps.map(([a, b], i) => (
        <Beam key={i} a={a.clone().add(v3(0, 0.035, 0))} b={b.clone().add(v3(0, 0.035, 0))} w={0.26} h={0.06} material={m.trim} />
      ))}
      {/* Dark rake boards along the gable's front edge. */}
      <Beam a={v3(GABLE.x0 - GABLE.side, -GABLE.side - 0.06, GF)} b={v3(GX, GABLE.rise - 0.06, GF)} w={0.05} h={0.2} up={v3(0, 0, 1)} material={m.trim} />
      <Beam a={v3(GX, GABLE.rise - 0.06, GF)} b={v3(GABLE.x1 + GABLE.side, -GABLE.side - 0.06, GF)} w={0.05} h={0.2} up={v3(0, 0, 1)} material={m.trim} />
      {/* Soffit under the gable's side overhangs. */}
      {[GABLE.x0 - GABLE.side / 2, GABLE.x1 + GABLE.side / 2].map((x) => (
        <mesh key={x} geometry={unitBox} material={m.soffit} position={[x, -GABLE.side - 0.12, (D / 2 + GF) / 2]} scale={[GABLE.side, 0.02, GF - D / 2]} />
      ))}
      {eaves.map(({ key, a, b, side }) => {
        const fascia = along(side, a, b, O, YE - FASCIA / 2 + 0.02, FASCIA, 0.04);
        const gut = along(side, a, b, O + 0.08, YE - 0.08, 0.13, 0.13);
        const sof = soffit(side, a, b);
        return (
          <group key={key}>
            <mesh geometry={unitBox} material={m.trim} position={fascia.position} scale={fascia.scale} castShadow />
            <mesh geometry={unitBox} material={gutter} position={gut.position} scale={gut.scale} castShadow />
            <mesh geometry={unitBox} material={m.soffit} position={sof.position} scale={sof.scale} />
            {edge && side === 'front' && (
              <mesh geometry={unitBox} material={edge} {...along(side, a, b, O + 0.09, YE - 0.17, 0.03, 0.15)} />
            )}
          </group>
        );
      })}
      {/* Frieze closing the gap between soffit and attic floor (inside the walls when assembled). */}
      {(['front', 'back', 'left', 'right'] as WallSide[]).map((side) => {
        const len = side === 'front' || side === 'back' ? W - 0.1 : D - 0.1;
        const f = along(side, -len / 2, len / 2, -0.06, (YE - FASCIA) / 2, -(YE - FASCIA), 0.04);
        return <mesh key={side} geometry={unitBox} material={m.soffit} position={f.position} scale={f.scale} />;
      })}
      {/* Pot lights in the front soffit. */}
      {[-3.6, -2.1, 3.4].map((x) => (
        <mesh key={x} geometry={unitCylinder(12)} material={m.sconce} position={[x, YE - FASCIA + 0.0, D / 2 + O / 2]} scale={[0.05, 0.012, 0.05]} />
      ))}
      {/* Downspouts start at the gutters and swing back to the wall. */}
      {spoutTops.map(({ x, z, side }, i) => {
        const [nx, nz] = WALL_NORMAL[side];
        const top = v3(x + nx * (O + 0.08), YE - 0.14, z + nz * (O + 0.08));
        const bottom = v3(x + nx * 0.07, -0.62, z + nz * 0.07);
        return <Beam key={i} a={top} b={bottom} w={0.08} h={0.08} up={v3(nx, 0, nz)} material={m.gutter} />;
      })}
      {/* Roof vents near the ridge, on the back slope. */}
      {[-2.4, 1.3].map((x) => (
        <mesh key={x} geometry={unitBox} material={m.trim} position={[x, ROOF.rise * (1 - 0.75 / (D / 2)) + 0.1, -0.75]} scale={[0.32, 0.22, 0.32]} castShadow />
      ))}
    </group>
  );
}
