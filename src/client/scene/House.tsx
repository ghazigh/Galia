import type { ZoneHealth, ZoneSummary } from '@shared/status';
import type { FixtureId, ZoneId } from '@shared/types';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import {
  CircleGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  Shape,
  type Group,
  type Material,
  type Mesh,
} from 'three';
import {
  D,
  DRIVE,
  EAVE_DROP,
  H,
  layerLift,
  levelBase,
  levelOpen,
  OPENINGS,
  ROOF,
  ROOMS,
  SLAB,
  STAIR,
  T,
  W,
  WALL,
  WALL_NORMAL,
  wallPieces,
  YARD,
  type Layer,
  type Opening,
  type SceneView,
  type WallSide,
} from './layout';
import { ballGeometry, partMaterial, roundedBox, shellMaterials, unitBox, unitCylinder, wallFaces } from './materials';
import { roomParts, SCONCES, siteParts, type Part } from './parts';

export type LayerOffsets = Record<Layer, number>;

export const STATUS_COLORS: Record<Exclude<ZoneHealth, 'empty'> | 'accent', string> = {
  overdue: '#ff4d47',
  today: '#ff9a3d',
  soon: '#f2c14e',
  ok: '#3ccf8e',
  accent: '#5a83ff',
};

// Status floors and outlines share one material per state, pulsed once per frame.
const statusFill = Object.fromEntries(
  Object.entries(STATUS_COLORS).map(([key, color]) => [
    key,
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }),
  ]),
) as Record<keyof typeof STATUS_COLORS, MeshBasicMaterial>;
const statusEdge = Object.fromEntries(
  Object.entries(STATUS_COLORS).map(([key, color]) => [key, new MeshBasicMaterial({ color, toneMapped: false })]),
) as Record<keyof typeof STATUS_COLORS, MeshBasicMaterial>;

export function pulseStatus(time: number, animate: boolean) {
  const wave = animate ? (Math.sin(time * 2.6) + 1) / 2 : 0.5;
  statusFill.overdue.opacity = 0.2 + 0.28 * wave;
  statusFill.today.opacity = 0.3;
  statusFill.soon.opacity = 0.22;
  statusFill.ok.opacity = 0.1;
  statusFill.accent.opacity = 0.07 + 0.07 * wave;
  statusEdge.accent.color.set(STATUS_COLORS.accent).multiplyScalar(0.75 + 0.5 * wave);
  const highlight = shellMaterials().highlight;
  highlight.emissiveIntensity = animate ? 0.5 + 1.3 * wave : 1.1;
}

const damp = (current: number, target: number, lambda: number, dt: number) => MathUtils.damp(current, target, lambda, Math.min(dt, 0.1));

// ── Parts ─────────────────────────────────────────────────────────────────────────────────────

const PartMesh = memo(function PartMesh({ part, highlighted }: { part: Part; highlighted: boolean }) {
  const material = highlighted ? shellMaterials().highlight : partMaterial(part.m);
  if (part.kind === 'box') {
    const [x, y, z] = part.p;
    const [w, h, d] = part.s;
    const big = w * h * d > 0.04;
    if (part.r) {
      return (
        <mesh geometry={roundedBox(w, h, d, part.r)} material={material} position={[x, y + h / 2, z]} rotation-y={part.ry ?? 0} castShadow={big} receiveShadow />
      );
    }
    return <mesh geometry={unitBox} material={material} position={[x, y + h / 2, z]} scale={[w, h, d]} rotation-y={part.ry ?? 0} castShadow={big} receiveShadow />;
  }
  if (part.kind === 'cyl') {
    const [x, y, z] = part.p;
    const big = part.r * part.r * part.h > 0.015;
    if (part.axis) {
      return (
        <mesh
          geometry={unitCylinder(part.seg)}
          material={material}
          position={[x, y, z]}
          rotation={part.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
          scale={[part.r, part.h, part.r]}
          castShadow={big}
        />
      );
    }
    return <mesh geometry={unitCylinder(part.seg)} material={material} position={[x, y + part.h / 2, z]} scale={[part.r, part.h, part.r]} castShadow={big} receiveShadow />;
  }
  const [x, y, z] = part.p;
  return (
    <mesh geometry={ballGeometry(Boolean(part.facet))} material={material} position={[x, y, z]} scale={[part.r, part.r * (part.sy ?? 1), part.r]} castShadow />
  );
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
}

/** Shows the part of [v0, v1] below `height` (a wall or window cut to that height). */
function clip(items: Clipped[], height: number) {
  for (const { mesh, v0, v1 } of items) {
    const top = Math.min(v1, height);
    const span = top - v0;
    if (span <= 0.005) {
      mesh.visible = false;
      continue;
    }
    mesh.visible = true;
    mesh.scale.y = span;
    mesh.position.y = v0 + span / 2;
  }
}

/** Glass, mullions and sill for a window; the panel and handle for a door. */
function openingMeshes(side: WallSide, opening: Opening, lit: boolean, highlight: FixtureId | null) {
  const m = shellMaterials();
  const along = side === 'front' || side === 'back';
  const offset = along ? (side === 'front' ? D / 2 - T / 2 : -D / 2 + T / 2) : side === 'right' ? W / 2 - T / 2 : -W / 2 + T / 2;
  const u = (opening.u0 + opening.u1) / 2;
  const length = opening.u1 - opening.u0;
  const pieces: { key: string; x: number; z: number; w: number; d: number; v0: number; v1: number; material: Material }[] = [];
  const at = (du: number, depth: number) =>
    along ? { x: u + du, z: offset + depth, w: 0, d: 0 } : { x: offset + depth, z: u + du, w: 0, d: 0 };
  const outward = side === 'front' || side === 'right' ? 1 : -1;
  if (opening.kind === 'window') {
    const glass = at(0, outward * 0.02);
    const glassMaterial = highlight === 'windows' ? m.highlight : lit ? m.glass : m.glassDim;
    pieces.push({ key: 'glass', ...glass, w: along ? length : 0.05, d: along ? 0.05 : length, v0: opening.v0, v1: opening.v1, material: glassMaterial });
    // Mullions split wide windows.
    const panes = Math.max(1, Math.round(length / 1.3));
    for (let i = 1; i < panes; i += 1) {
      const p = at(-length / 2 + (length / panes) * i, outward * 0.05);
      pieces.push({ key: `mullion${i}`, ...p, w: along ? 0.05 : 0.06, d: along ? 0.06 : 0.05, v0: opening.v0, v1: opening.v1, material: m.frame });
    }
    const sill = at(0, outward * 0.1);
    pieces.push({ key: 'sill', ...sill, w: along ? length + 0.08 : 0.12, d: along ? 0.12 : length + 0.08, v0: opening.v0 - 0.04, v1: opening.v0, material: m.frame });
  } else {
    const panel = at(0, outward * 0.03);
    const material = opening.kind === 'garage' ? (highlight === 'garage-door' ? m.highlight : m.garage) : highlight === 'front-door' ? m.highlight : m.door;
    pieces.push({ key: 'panel', ...panel, w: along ? length : 0.06, d: along ? 0.06 : length, v0: opening.v0, v1: opening.v1, material });
    if (opening.kind === 'door') {
      const handle = at(length * 0.32, outward * 0.09);
      pieces.push({ key: 'handle', ...handle, w: along ? 0.04 : 0.05, d: along ? 0.05 : 0.04, v0: 0.95, v1: 1.15, material: m.frame });
    }
  }
  return pieces;
}

interface WallRegistry {
  sides: Record<WallSide, Clipped[]>;
  partitions: Clipped[];
}

function ExteriorWalls({
  level,
  registry,
  highlight,
}: {
  level: 'basement' | 'ground' | 'upper';
  registry: MutableRefObject<WallRegistry>;
  highlight: FixtureId | null;
}) {
  const sides: WallSide[] = ['front', 'back', 'left', 'right'];
  const register = (side: WallSide, v0: number, v1: number) => (mesh: Mesh | null) => {
    const list = registry.current.sides[side];
    const index = list.findIndex((item) => item.mesh === mesh);
    if (mesh && index === -1) list.push({ mesh, v0, v1 });
  };
  return (
    <>
      {sides.map((side) => {
        const openings = OPENINGS[level][side];
        const faces = wallFaces(side);
        return (
          <group key={side}>
            {wallPieces(side, openings).map((piece, i) => (
              <mesh
                key={`w${i}`}
                ref={register(side, piece.v0, piece.v1)}
                geometry={unitBox}
                material={faces}
                position={[piece.x, (piece.v0 + piece.v1) / 2, piece.z]}
                scale={[piece.w, piece.v1 - piece.v0, piece.d]}
                castShadow
                receiveShadow
              />
            ))}
            {openings.flatMap((opening, i) =>
              // A few windows stay dark at night so the house doesn't read as a lantern.
              openingMeshes(side, opening, (i + level.length) % 3 !== 1, highlight).map((p) => (
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
        );
      })}
    </>
  );
}

// ── A storey ──────────────────────────────────────────────────────────────────────────────────

export interface StoreyProps {
  level: 'basement' | 'ground' | 'upper';
  view: SceneView;
  summaries: Partial<Record<ZoneId, ZoneSummary>>;
  selectedZone: ZoneId | null;
  highlight: FixtureId | null;
  offsets: MutableRefObject<LayerOffsets>;
  animate: boolean;
  onRoomTap: (zone: ZoneId, level: 'basement' | 'ground' | 'upper') => void;
}

function healthKey(health: ZoneHealth | undefined): keyof typeof STATUS_COLORS | null {
  return health && health !== 'empty' ? health : null;
}

function RoomStatus({ x0, x1, health, selected }: { x0: number; x1: number; health: ZoneHealth | undefined; selected: boolean }) {
  const key = selected ? 'accent' : healthKey(health);
  if (!key) return null;
  const w = x1 - x0 - 0.12;
  const d = D - 2 * T - 0.12;
  const cx = (x0 + x1) / 2;
  const edge = selected ? 0.07 : 0.035;
  const edgeMaterial = statusEdge[key];
  return (
    <group>
      <mesh geometry={unitBox} material={statusFill[key]} position={[cx, 0.03, 0]} scale={[w, 0.004, d]} renderOrder={2} />
      {key !== 'ok' && (
        <>
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx, 0.035, d / 2]} scale={[w, 0.01, edge]} />
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx, 0.035, -d / 2]} scale={[w, 0.01, edge]} />
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx - w / 2, 0.035, 0]} scale={[edge, 0.01, d]} />
          <mesh geometry={unitBox} material={edgeMaterial} position={[cx + w / 2, 0.035, 0]} scale={[edge, 0.01, d]} />
        </>
      )}
    </group>
  );
}

export function Storey({ level, view, summaries, selectedZone, highlight, offsets, animate, onRoomTap }: StoreyProps) {
  const group = useRef<Group>(null);
  const registry = useRef<WallRegistry>({ sides: { front: [], back: [], left: [], right: [] }, partitions: [] });
  const heights = useRef<Record<WallSide | 'partitions', number>>({ front: WALL, back: WALL, left: WALL, right: WALL, partitions: WALL });
  // Wall pieces start at full height; the first frame clips them to the view's heights.
  const initialized = useRef(false);
  const rooms = ROOMS[level];
  const base = levelBase(level);
  const open = levelOpen(level, view);
  const m = shellMaterials();
  const furniture = useMemo(() => rooms.map((room) => roomParts(room.zone)), [rooms]);

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
      const target = !open ? WALL : view.kind === 'exploded' ? (facing ? 0.3 : 1.15) : facing ? 0.3 : WALL;
      const next = animate ? damp(heights.current[side], target, 7, dt) : target;
      if (Math.abs(next - heights.current[side]) > 0.0005 || !initialized.current) {
        heights.current[side] = next;
        clip(registry.current.sides[side], next);
      }
    }
    initialized.current = true;
    const partitionTarget = !open ? WALL : view.kind === 'exploded' ? 0.55 : 0.95;
    const partitions = animate ? damp(heights.current.partitions, partitionTarget, 7, dt) : partitionTarget;
    heights.current.partitions = partitions;
    clip(registry.current.partitions, partitions);
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
      {/* Floor slab: its edge reads as a dark band between storeys on the facade. */}
      <mesh geometry={unitBox} material={m.trim} position={[0, -SLAB / 2, 0]} scale={[W, SLAB, D]} castShadow receiveShadow />
      {rooms.map((room, index) => {
        const x0 = room.x0 + (index === 0 ? T : T / 2);
        const x1 = room.x1 - (index === rooms.length - 1 ? T : T / 2);
        const selected = selectedZone === room.zone;
        return (
          <group key={room.zone}>
            <mesh
              geometry={unitBox}
              material={m.floors[room.floor]}
              position={[(x0 + x1) / 2, 0.01, 0]}
              scale={[x1 - x0, 0.02, D - 2 * T]}
              receiveShadow
            />
            {open && <RoomStatus x0={x0} x1={x1} health={summaries[room.zone]?.health} selected={selected} />}
            {open && <Parts parts={furniture[index]} highlight={highlight} />}
            {index < rooms.length - 1 && (
              <mesh
                ref={registerPartition}
                geometry={unitBox}
                material={wallFaces('partition')}
                position={[room.x1, WALL / 2, 0]}
                scale={[T * 0.75, WALL, D - 2 * T]}
                castShadow
                receiveShadow
              />
            )}
            {/* Invisible volume that makes the whole room tappable. */}
            <mesh
              geometry={unitBox}
              material={m.hidden}
              position={[(room.x0 + room.x1) / 2, WALL / 2, 0]}
              scale={[room.x1 - room.x0, WALL, D]}
              onClick={tap(room.zone)}
              onPointerOver={() => (document.body.style.cursor = 'pointer')}
              onPointerOut={() => (document.body.style.cursor = '')}
            />
          </group>
        );
      })}
      <ExteriorWalls level={level} registry={registry} highlight={highlight} />
    </group>
  );
}

// ── Roof ──────────────────────────────────────────────────────────────────────────────────────

const SLOPE = Math.atan2(ROOF.rise, D / 2);
const SLOPE_LENGTH = (D / 2 + ROOF.overhang) / Math.cos(SLOPE);
const ROOF_THICKNESS = 0.16;

function gableGeometry() {
  const shape = new Shape();
  shape.moveTo(-D / 2, 0);
  shape.lineTo(D / 2, 0);
  shape.lineTo(0, ROOF.rise);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function Seams({ side }: { side: 1 | -1 }) {
  const ref = useRef<InstancedMesh>(null);
  const count = 30;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const width = W + 2 * ROOF.overhang - 0.3;
    for (let i = 0; i < count; i += 1) {
      const x = -width / 2 + (width / (count - 1)) * i;
      dummy.position.set(x, 0, 0);
      dummy.scale.set(0.035, 0.04, SLOPE_LENGTH);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  const cz = (side * (D / 2 + ROOF.overhang)) / 2;
  const cy = (ROOF.rise - EAVE_DROP) / 2;
  const normal = [0, Math.cos(SLOPE), side * Math.sin(SLOPE)] as const;
  const lift = ROOF_THICKNESS / 2 + 0.02;
  return (
    <instancedMesh
      ref={ref}
      args={[unitBox, shellMaterials().trim, count]}
      position={[0, cy + normal[1] * lift, cz + normal[2] * lift]}
      rotation={[side * SLOPE, 0, 0]}
      castShadow
    />
  );
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
  const gable = useMemo(() => gableGeometry(), []);
  useEffect(() => () => gable.dispose(), [gable]);

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
  const gutter = highlight === 'gutters' ? m.highlight : m.frame;
  const cz = (D / 2 + ROOF.overhang) / 2;
  const cy = (ROOF.rise - EAVE_DROP) / 2;
  const edge = selected ? statusEdge.accent : health && health !== 'empty' && health !== 'ok' ? statusEdge[health] : null;

  return (
    <group ref={group} position={[0, ROOF.base, 0]}>
      <mesh geometry={unitBox} material={m.cut} position={[0, -SLAB / 2, 0]} scale={[W, SLAB, D]} castShadow />
      <mesh geometry={gable} material={m.exterior} position={[-W / 2, 0, 0]} castShadow receiveShadow />
      <mesh geometry={gable} material={m.exterior} position={[W / 2 - T, 0, 0]} castShadow receiveShadow />
      {([1, -1] as const).map((side) => (
        <group key={side}>
          <mesh
            geometry={unitBox}
            material={m.roof}
            position={[0, cy, side * cz]}
            rotation={[side * SLOPE, 0, 0]}
            scale={[W + 2 * ROOF.overhang, ROOF_THICKNESS, SLOPE_LENGTH]}
            castShadow
            receiveShadow
            onClick={tap}
          />
          <Seams side={side} />
          <mesh
            geometry={unitBox}
            material={gutter}
            position={[0, -EAVE_DROP - 0.06, side * (D / 2 + ROOF.overhang + 0.05)]}
            scale={[W + 2 * ROOF.overhang, 0.13, 0.15]}
            castShadow
          />
          {edge && (
            <mesh
              geometry={unitBox}
              material={edge}
              position={[0, -EAVE_DROP - 0.14, side * (D / 2 + ROOF.overhang + 0.06)]}
              scale={[W + 2 * ROOF.overhang, 0.03, 0.17]}
            />
          )}
        </group>
      ))}
      <mesh geometry={unitBox} material={m.trim} position={[0, ROOF.rise + 0.05, 0]} scale={[W + 2 * ROOF.overhang, 0.1, 0.34]} castShadow />
      {/* Skylight over the stair, glowing at night. */}
      <mesh
        geometry={unitBox}
        material={m.glass}
        position={[-4.2, cy + 0.42 + Math.cos(SLOPE) * 0.1, cz - 1.0 * Math.cos(SLOPE)]}
        rotation={[SLOPE, 0, 0]}
        scale={[1.0, 0.04, 1.3]}
      />
    </group>
  );
}

// ── Site: ground, drive, yard, stairs ────────────────────────────────────────────────────────

export function Site({
  view,
  highlight,
  backyardHealth,
  backyardSelected,
  onYardTap,
}: {
  view: SceneView;
  highlight: FixtureId | null;
  backyardHealth: ZoneHealth | undefined;
  backyardSelected: boolean;
  onYardTap: () => void;
}) {
  const m = shellMaterials();
  const ground = useMemo(() => new CircleGeometry(170, 64).rotateX(-Math.PI / 2), []);
  useEffect(() => () => ground.dispose(), [ground]);
  const parts = useMemo(() => siteParts(), []);
  const assembled = view.kind === 'exterior' || view.kind === 'roof' || view.kind === 'yard';
  const yardW = YARD.x1 - YARD.x0;
  const yardD = YARD.z1 - YARD.z0;
  const stripes = 7;
  const rise = H / (STAIR.steps + 1);
  const stairWidth = STAIR.x1 - STAIR.x0;
  const stairX = (STAIR.x0 + STAIR.x1) / 2;
  const key = backyardSelected ? 'accent' : healthKey(backyardHealth);
  const tap = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 8) return;
    event.stopPropagation();
    onYardTap();
  };

  return (
    <group>
      <mesh geometry={ground} material={m.ground} position={[0, -0.012, 0]} receiveShadow />
      <mesh geometry={unitBox} material={m.drive} position={[(DRIVE.x0 + DRIVE.x1) / 2, 0.005, (DRIVE.z0 + DRIVE.z1) / 2]} scale={[DRIVE.x1 - DRIVE.x0, 0.02, DRIVE.z1 - DRIVE.z0]} receiveShadow />
      {/* Lawn with mowing stripes. */}
      <mesh
        geometry={unitBox}
        material={m.grass}
        position={[(YARD.x0 + YARD.x1) / 2, 0.03, (YARD.z0 + YARD.z1) / 2]}
        scale={[yardW, 0.06, yardD]}
        receiveShadow
        onClick={tap}
      />
      {Array.from({ length: stripes }, (_, i) =>
        i % 2 ? null : (
          <mesh
            key={i}
            geometry={unitBox}
            material={highlight === 'lawn' ? m.highlight : m.grassStripe}
            position={[YARD.x0 + (yardW / stripes) * (i + 0.5), 0.062, (YARD.z0 + YARD.z1) / 2]}
            scale={[yardW / stripes, 0.004, yardD]}
            receiveShadow
          />
        ),
      )}
      {key && (
        <mesh
          geometry={unitBox}
          material={statusFill[key]}
          position={[(YARD.x0 + YARD.x1) / 2, 0.07, (YARD.z0 + YARD.z1) / 2]}
          scale={[yardW - 0.1, 0.004, yardD - 0.1]}
          renderOrder={2}
        />
      )}
      <Parts parts={parts} highlight={highlight} />
      {/* Side stair and landing up to the front door. */}
      <group visible={assembled}>
        <mesh geometry={unitBox} material={m.drive} position={[stairX, H / 2 - 0.01, (STAIR.landing[0] + STAIR.landing[1]) / 2]} scale={[stairWidth, H - 0.02, STAIR.landing[1] - STAIR.landing[0]]} castShadow receiveShadow />
        {Array.from({ length: STAIR.steps }, (_, i) => {
          const top = H - (i + 1) * rise;
          return (
            <mesh
              key={i}
              geometry={unitBox}
              material={m.drive}
              position={[stairX, top / 2, STAIR.landing[1] + (i + 0.5) * STAIR.run]}
              scale={[stairWidth, top, STAIR.run]}
              castShadow
              receiveShadow
            />
          );
        })}
        <mesh
          geometry={unitBox}
          material={m.frame}
          position={[STAIR.x0 + 0.05, H / 2 + 0.95, STAIR.landing[1] + (STAIR.steps * STAIR.run) / 2]}
          rotation={[Math.atan2(H, STAIR.steps * STAIR.run), 0, 0]}
          scale={[0.05, 0.05, Math.hypot(H, STAIR.steps * STAIR.run)]}
        />
        {SCONCES.slice(0, 1).map(([x, y, z], i) => (
          <mesh key={i} geometry={unitBox} material={m.sconce} position={[x, y, z]} scale={[0.1, 0.24, 0.1]} />
        ))}
      </group>
      {SCONCES.slice(1).map(([x, y, z], i) => (
        <mesh key={i} geometry={unitBox} material={m.sconce} position={[x, y, z]} scale={[0.12, 0.24, 0.1]} />
      ))}
    </group>
  );
}
