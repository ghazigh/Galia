import type { ZoneHealth } from '@shared/status';
import type { FixtureId } from '@shared/types';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { BufferAttribute, BufferGeometry, Color, InstancedMesh, Object3D, RingGeometry, type Group, type Material } from 'three';
import { damp, healthKey, lawnGlow, statusFill, type LayerOffsets } from './House';
import { drapedPatch, slabGeometry } from './geometry';
import {
  COURT,
  D,
  DRIVE,
  driveHeight,
  GRADE,
  PORCH,
  SIDE_STREET,
  STONE_WALL,
  STREET,
  terrainRaised,
  W,
  WALK,
  walkHeight,
  YARD,
  type SceneView,
} from './layout';
import { ballGeometry, partMaterial, roundedBox, shellMaterials, unitBox, unitCone, unitCylinder } from './materials';
import { siteParts, type MaterialKey, type SitePart } from './parts';
import { terrainGrid, terrainHeight } from './terrain';

// The lot around the house: lawns on a height field, the sloped driveway into the garage, the
// porch with its steps and railings, the paved court under the porch behind an armour-stone
// wall, the walkway stepping down to the drive, the fenced backyard level with the ground floor,
// and the planting from the photos (a blue spruce, emerald cedars, grasses).

const FLAT = 0.04; // how far the lot settles when the view looks into the basement

// ── Terrain ───────────────────────────────────────────────────────────────────────────────────

const GRASS = new Color('#5d7c41');
const GRASS_DARK = new Color('#55733b');
const FAR = new Color('#4b5145');

function terrainGeometry(): BufferGeometry {
  const { xs, zs, h } = terrainGrid();
  const nx = xs.length;
  const nz = zs.length;
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const color = new Color();
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      positions.set([x, h[k], z], k * 3);
      // Mowing stripes on the lawns near the house, fading into the plain ground far away.
      const stripe = Math.abs(((x + 40) / 2.2) % 2 - 1);
      color.copy(GRASS).lerp(GRASS_DARK, stripe);
      const reach = Math.max(Math.abs(x - 1) / 1.15, Math.abs(z - 2));
      const t = Math.min(1, Math.max(0, (reach - 19) / 14));
      color.lerp(FAR, t * t * (3 - 2 * t));
      colors.set([color.r, color.g, color.b], k * 3);
    }
  }
  const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index.set([a, c, b, b, c, d], n);
      n += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// ── Small builders ───────────────────────────────────────────────────────────────────────────

/** A solid with world-mapped texture, built once. */
const Slab = memo(function Slab({
  x0,
  x1,
  z0,
  z1,
  top,
  bottom,
  material,
  shadow = true,
}: {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number | ((x: number, z: number) => number);
  bottom: number;
  material: Material;
  shadow?: boolean;
}) {
  const geometry = useMemo(() => slabGeometry(x0, x1, z0, z1, top, bottom), [x0, x1, z0, z1, top, bottom]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} castShadow={shadow} receiveShadow />;
});

/** Flat patch lying on the lawn (mulch beds). */
const Bed = memo(function Bed({ x0, x1, z0, z1, round = false }: { x0: number; x1: number; z0: number; z1: number; round?: boolean }) {
  const geometry = useMemo(() => drapedPatch(x0, x1, z0, z1, terrainHeight, { round, lift: 0.025 }), [x0, x1, z0, z1, round]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={shellMaterials().mulch} receiveShadow />;
});

interface Rail {
  /** Start and end of the run (world x, z) and the deck it stands on. */
  a: readonly [number, number];
  b: readonly [number, number];
  y: number;
}

/** One instanced mesh of boxes (posts, rails, pickets), each a position, size and turn about y. */
function Boxes({ boxes, material, shadow = true }: { boxes: readonly Box[]; material: Material; shadow?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    boxes.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.angle ?? 0, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  return <instancedMesh key={boxes.length} ref={ref} args={[unitBox, material, boxes.length]} castShadow={shadow} receiveShadow />;
}

interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  angle?: number;
}

/** Aluminum railings: posts, top and bottom rails and pickets, drawn as one instanced mesh. */
function Railings({ rails, height = 1.0 }: { rails: readonly Rail[]; height?: number }) {
  const boxes = useMemo(() => {
    const out: Box[] = [];
    for (const { a, b, y } of rails) {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(-dz, dx);
      const sections = Math.max(1, Math.ceil(length / 1.7));
      for (let i = 0; i <= sections; i += 1) {
        out.push({ x: a[0] + (dx * i) / sections, y: y + (height + 0.06) / 2, z: a[1] + (dz * i) / sections, w: 0.07, h: height + 0.06, d: 0.07 });
      }
      const x = (a[0] + b[0]) / 2;
      const z = (a[1] + b[1]) / 2;
      out.push({ x, y: y + height - 0.03, z, w: length, h: 0.05, d: 0.05, angle }, { x, y: y + 0.1, z, w: length, h: 0.05, d: 0.05, angle });
      const count = Math.floor(length / 0.12);
      for (let i = 1; i < count; i += 1) {
        out.push({ x: a[0] + (dx * i) / count, y: y + height / 2, z: a[1] + (dz * i) / count, w: 0.022, h: height - 0.12, d: 0.022 });
      }
    }
    return out;
  }, [rails, height]);
  return <Boxes boxes={boxes} material={shellMaterials().railing} />;
}

/** Chain-link fence along a path on the ground, with a framed gate. */
function Fence({ path, gate }: { path: readonly (readonly [number, number])[]; gate: readonly [number, number] }) {
  const m = shellMaterials();
  const { mesh, posts, rails } = useMemo(() => {
    const height = 1.2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const posts: { x: number; y: number; z: number; r: number; h: number }[] = [];
    const rails: { x: number; y: number; z: number; length: number; angle: number }[] = [];
    let along = 0;
    for (let s = 0; s < path.length - 1; s += 1) {
      const [ax, az] = path[s];
      const [bx, bz] = path[s + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(length / 2.4));
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const x0 = ax + (bx - ax) * t0;
        const z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1;
        const z1 = az + (bz - az) * t1;
        const y0 = terrainHeight(x0, z0) + 0.03;
        const y1 = terrainHeight(x1, z1) + 0.03;
        const u0 = (along + length * t0) / 0.06;
        const u1 = (along + length * t1) / 0.06;
        positions.push(x0, y0, z0, x1, y1, z1, x1, y1 + height, z1, x0, y0, z0, x1, y1 + height, z1, x0, y0 + height, z0);
        uvs.push(u0, 0, u1, 0, u1, height / 0.06, u0, 0, u1, height / 0.06, u0, height / 0.06);
        const segment = Math.hypot(x1 - x0, z1 - z0);
        rails.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 + height, z: (z0 + z1) / 2, length: segment, angle: Math.atan2(-(z1 - z0), x1 - x0) });
        posts.push({ x: x0, y: y0, z: z0, r: 0.03, h: height + 0.05 });
      }
      along += length;
    }
    const [lx, lz] = path[path.length - 1];
    posts.push({ x: lx, y: terrainHeight(lx, lz) + 0.03, z: lz, r: 0.03, h: 1.25 });
    // Gate posts are heavier, and the gate leaf has its own frame.
    const gz = path[1][1];
    for (const gx of gate) posts.push({ x: gx, y: terrainHeight(gx, gz) + 0.03, z: gz, r: 0.045, h: 1.3 });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { mesh: geometry, posts, rails };
  }, [path, gate]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  const black = partMaterial('black');
  const frame = useMemo(() => {
    const gz = path[1][1];
    const gy = terrainHeight((gate[0] + gate[1]) / 2, gz) + 0.03;
    const span = Math.abs(gate[1] - gate[0]);
    const mid = (gate[0] + gate[1]) / 2;
    const inset = Math.sign(gate[1] - gate[0]) * 0.07;
    const out: Box[] = [
      ...posts.map((p) => ({ x: p.x, y: p.y + p.h / 2, z: p.z, w: p.r * 1.6, h: p.h, d: p.r * 1.6 })),
      ...rails.map((r) => ({ x: r.x, y: r.y, z: r.z, w: r.length, h: 0.035, d: 0.035, angle: r.angle })),
      // The gate leaf's own frame.
      { x: mid, y: gy + 0.08, z: gz, w: span - 0.1, h: 0.035, d: 0.035 },
      { x: mid, y: gy + 1.12, z: gz, w: span - 0.1, h: 0.035, d: 0.035 },
      { x: gate[0] + inset, y: gy + 0.6, z: gz, w: 0.035, h: 1.1, d: 0.035 },
      { x: gate[1] - inset, y: gy + 0.6, z: gz, w: 0.035, h: 1.1, d: 0.035 },
    ];
    return out;
  }, [path, gate, posts, rails]);
  return (
    <group>
      <mesh geometry={mesh} material={m.chainLink} />
      <Boxes boxes={frame} material={black} />
    </group>
  );
}

// ── Plants ────────────────────────────────────────────────────────────────────────────────────

type Plant =
  | { kind: 'spruce'; x: number; z: number; h: number; r: number }
  | { kind: 'cedar'; x: number; z: number; h: number; r: number; y?: number }
  | { kind: 'tuft'; x: number; z: number; s: number }
  | { kind: 'shrub'; x: number; z: number; s: number }
  | { kind: 'tree'; x: number; z: number; h: number; r: number }
  | { kind: 'sapling'; x: number; z: number; h: number };

const PlantMesh = memo(function PlantMesh({ plant }: { plant: Plant }) {
  const y = 'y' in plant && plant.y !== undefined ? plant.y : terrainHeight(plant.x, plant.z);
  const mat = (key: MaterialKey) => partMaterial(key);
  switch (plant.kind) {
    case 'spruce': {
      // Stacked tiers, widest at the bottom, on a short trunk.
      const tiers = [0, 1, 2, 3];
      return (
        <group position={[plant.x, y, plant.z]}>
          <mesh geometry={unitCylinder(8)} material={mat('trunk')} position={[0, 0.2, 0]} scale={[0.06, 0.4, 0.06]} />
          {tiers.map((i) => {
            const r = plant.r * (1 - i * 0.22);
            const base = 0.25 + i * plant.h * 0.2;
            return <mesh key={i} geometry={unitCone(9)} material={mat('spruce')} position={[0, base, 0]} rotation={[0, i * 0.7, 0]} scale={[r, plant.h * 0.42, r]} castShadow />;
          })}
        </group>
      );
    }
    case 'cedar':
      return (
        <group position={[plant.x, y, plant.z]}>
          <mesh geometry={unitCone(8)} material={mat('cedar')} position={[0, 0.25, 0]} scale={[plant.r, plant.h - 0.2, plant.r]} castShadow />
          <mesh geometry={ballGeometry(true)} material={mat('cedar')} position={[0, 0.35, 0]} scale={[plant.r * 0.95, 0.4, plant.r * 0.95]} castShadow />
        </group>
      );
    case 'tuft':
      // Ornamental grass: a fountain of thin blades leaning out from the crown.
      return (
        <group position={[plant.x, y, plant.z]}>
          {[0, 1.3, 2.5, 3.8, 5.0, 0.6, 3.1].map((a, i) => {
            const lean = i < 5 ? 0.32 : 0.08;
            return (
              <mesh
                key={i}
                geometry={unitCone(5)}
                material={mat('tuft')}
                position={[Math.cos(a) * 0.05 * plant.s, 0, Math.sin(a) * 0.05 * plant.s]}
                rotation={[Math.sin(a) * lean, 0, -Math.cos(a) * lean]}
                scale={[0.05 * plant.s, (i < 5 ? 0.62 : 0.8) * plant.s, 0.05 * plant.s]}
                castShadow
              />
            );
          })}
        </group>
      );
    case 'shrub':
      return <mesh geometry={ballGeometry(true)} material={mat('shrubGold')} position={[plant.x, y + 0.14 * plant.s, plant.z]} scale={[0.26 * plant.s, 0.2 * plant.s, 0.26 * plant.s]} castShadow />;
    case 'tree':
      return (
        <group position={[plant.x, y, plant.z]}>
          <mesh geometry={unitCylinder(10)} material={mat('trunk')} position={[0, plant.h * 0.32, 0]} scale={[0.15, plant.h * 0.64, 0.15]} castShadow />
          <mesh geometry={ballGeometry(true)} material={mat('leaves')} position={[0, plant.h * 0.72, 0]} scale={[plant.r, plant.r * 0.9, plant.r]} castShadow />
          <mesh geometry={ballGeometry(true)} material={mat('leavesDark')} position={[plant.r * 0.5, plant.h * 0.6, plant.r * 0.35]} scale={[plant.r * 0.68, plant.r * 0.6, plant.r * 0.68]} castShadow />
          <mesh geometry={ballGeometry(true)} material={mat('leaves')} position={[-plant.r * 0.45, plant.h * 0.62, -plant.r * 0.3]} scale={[plant.r * 0.62, plant.r * 0.58, plant.r * 0.62]} castShadow />
        </group>
      );
    case 'sapling':
      return (
        <group position={[plant.x, y, plant.z]}>
          <mesh geometry={unitCylinder(6)} material={mat('trunk')} position={[0, plant.h * 0.4, 0]} scale={[0.035, plant.h * 0.8, 0.035]} castShadow />
          <mesh geometry={ballGeometry(true)} material={mat('leaves')} position={[0, plant.h * 0.85, 0]} scale={[0.42, 0.55, 0.42]} castShadow />
        </group>
      );
  }
});

/** A part outdoors, already in scene coordinates. */
const SiteMesh = memo(function SiteMesh({ part, highlighted }: { part: SitePart; highlighted: boolean }) {
  const material = highlighted ? shellMaterials().highlight : partMaterial(part.m);
  if (part.kind === 'box') {
    const [x, y, z] = part.at;
    const [w, h, d] = part.s;
    if (part.r) return <mesh geometry={roundedBox(w, h, d, part.r)} material={material} position={[x, y + h / 2, z]} castShadow receiveShadow />;
    return <mesh geometry={unitBox} material={material} position={[x, y + h / 2, z]} scale={[w, h, d]} castShadow={w * h * d > 0.04} receiveShadow />;
  }
  if (part.kind === 'cyl') {
    const [x, y, z] = part.at;
    if (part.axis) {
      return (
        <mesh
          geometry={unitCylinder(part.seg)}
          material={material}
          position={[x, y, z]}
          rotation={part.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
          scale={[part.r, part.h, part.r]}
          castShadow
        />
      );
    }
    return <mesh geometry={unitCylinder(part.seg)} material={material} position={[x, y + part.h / 2, z]} scale={[part.r, part.h, part.r]} castShadow receiveShadow />;
  }
  const [x, y, z] = part.p;
  return <mesh geometry={ballGeometry(Boolean(part.facet))} material={material} position={[x, y, z]} scale={[part.r, part.r * (part.sy ?? 1), part.r]} castShadow />;
});

// ── Layout of the built pieces ────────────────────────────────────────────────────────────────

const FENCE_PATH = [
  [YARD.wrap, D / 2],
  [YARD.wrap, YARD.z1],
  [YARD.x0, YARD.z1],
  [YARD.x0, YARD.z0],
  [-W / 2 + 0.6, YARD.z0],
  [-W / 2 + 0.6, -D / 2],
] as const;
const GATE = [YARD.wrap - 0.15, YARD.wrap - 1.15] as const;

const RISE = (PORCH.top - GRADE.front) / PORCH.steps.count;

interface Step {
  x0: number;
  x1: number;
  top: number;
}

/** The walkway as landings and steps, from the porch down to the drive. */
function walkPieces(): Step[] {
  const out: Step[] = [];
  const runs = WALK.runs;
  runs.forEach((run, i) => {
    out.push({ x0: run.x0, x1: run.x1, top: run.top });
    const next = runs[i + 1];
    const x1 = next ? next.x0 : WALK.end;
    const lower = next ? next.top : driveHeight(WALK.end);
    const count = Math.max(1, Math.round((run.top - lower) / 0.19));
    const tread = (x1 - run.x1) / count;
    for (let k = 0; k < count; k += 1) out.push({ x0: run.x1 + k * tread, x1: run.x1 + (k + 1) * tread, top: walkHeight(run.x1 + (k + 0.5) * tread) });
  });
  return out;
}

/** Armour-stone blocks along the walkway, each a little above the path beside it. */
function stonePieces(): Step[] {
  const cuts = [COURT.x0, 4.1, 5.4, 6.0, 6.6, 7.4, 7.85, WALK.end];
  return cuts.slice(0, -1).map((x0, i) => ({ x0, x1: cuts[i + 1], top: walkHeight(x0 + 0.02) + 0.08 }));
}

const PLANTS: Plant[] = [
  // Blue spruce in the front lawn, as in the photo.
  { kind: 'spruce', x: -1.7, z: D / 2 + 3.9, h: 2.3, r: 0.95 },
  // Emerald cedars by the backyard gate.
  { kind: 'cedar', x: YARD.wrap - 2.05, z: YARD.z1 + 0.45, h: 1.7, r: 0.3 },
  { kind: 'cedar', x: YARD.wrap + 0.35, z: YARD.z1 + 0.45, h: 1.6, r: 0.3 },
  // Gold shrubs and grasses in the bed along the porch.
  { kind: 'shrub', x: -0.8, z: PORCH.z1 + 0.32, s: 1 },
  { kind: 'shrub', x: -0.1, z: PORCH.z1 + 0.3, s: 0.9 },
  { kind: 'tuft', x: 0.5, z: PORCH.z1 + 0.32, s: 1.1 },
  { kind: 'tuft', x: 2.65, z: PORCH.z1 + 0.25, s: 1 },
  { kind: 'shrub', x: 3.0, z: PORCH.z1 + 0.25, s: 0.8 },
  // Grasses along the walkway and a young maple on the lawn.
  { kind: 'tuft', x: 1.6, z: WALK.z1 + 0.35, s: 1.2 },
  { kind: 'tuft', x: 4.7, z: WALK.z1 + 0.35, s: 1.2 },
  { kind: 'tuft', x: 7.1, z: WALK.z1 + 0.35, s: 1.1 },
  { kind: 'sapling', x: 6.3, z: D / 2 + 5.4, h: 2.6 },
  // Cedars in the planter at the court, at the corner of the drive.
  { kind: 'cedar', x: W / 2 + 0.35, z: D / 2 + 1.18, h: 1.5, r: 0.27, y: 0.42 },
  { kind: 'cedar', x: W / 2 + 0.85, z: D / 2 + 1.18, h: 1.45, r: 0.27, y: 0.42 },
  // Backyard: a shade tree and shrubs along the fence.
  { kind: 'tree', x: YARD.x0 + 1.8, z: YARD.z0 + 1.6, h: 4.6, r: 1.5 },
  { kind: 'shrub', x: YARD.x0 + 0.5, z: 0.6, s: 1.6 },
  { kind: 'shrub', x: YARD.x0 + 0.5, z: 1.6, s: 1.4 },
  { kind: 'cedar', x: YARD.x0 + 0.45, z: -1.0, h: 1.8, r: 0.32 },
];

// ── The site ──────────────────────────────────────────────────────────────────────────────────

export function Site({
  view,
  highlight,
  backyardHealth,
  backyardSelected,
  offsets,
  animate,
  onYardTap,
}: {
  view: SceneView;
  highlight: FixtureId | null;
  backyardHealth: ZoneHealth | undefined;
  backyardSelected: boolean;
  offsets: MutableRefObject<LayerOffsets>;
  animate: boolean;
  onYardTap: () => void;
}) {
  const m = shellMaterials();
  const lot = useRef<Group>(null);
  // Beyond the solved lot; it stops short of the house so it never covers the low driveway.
  const ground = useMemo(() => new RingGeometry(29, 170, 64, 1).rotateX(-Math.PI / 2), []);
  const terrain = useMemo(() => terrainGeometry(), []);
  useEffect(
    () => () => {
      ground.dispose();
      terrain.dispose();
    },
    [ground, terrain],
  );
  const parts = useMemo(() => siteParts(), []);
  const walk = useMemo(() => walkPieces(), []);
  const stones = useMemo(() => stonePieces(), []);
  const raised = terrainRaised(view);

  // Looking into the basement (or at the stacked floors) the whole lot settles flat.
  useFrame((_, dt) => {
    const g = lot.current;
    if (!g) return;
    const target = raised ? 1 : FLAT;
    const next = animate ? damp(g.scale.y, target, 6, dt) : target;
    g.scale.y = next;
    offsets.current.site = next;
  });

  const key = backyardSelected ? 'accent' : healthKey(backyardHealth);
  const tap = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 8) return;
    event.stopPropagation();
    onYardTap();
  };
  const yardW = YARD.x1 - YARD.x0;
  const yardD = YARD.z1 - YARD.z0;
  const porchRails: Rail[] = useMemo(
    () => [
      { a: [PORCH.x0 + 0.04, PORCH.z1 - 0.04], b: [PORCH.steps.x0, PORCH.z1 - 0.04], y: PORCH.top },
      { a: [PORCH.steps.x1, PORCH.z1 - 0.04], b: [PORCH.x1 - 0.04, PORCH.z1 - 0.04], y: PORCH.top },
      { a: [PORCH.x0 + 0.04, D / 2 + 0.05], b: [PORCH.x0 + 0.04, PORCH.z1 - 0.04], y: PORCH.top },
      { a: [PORCH.x1 - 0.04, D / 2 + 0.05], b: [PORCH.x1 - 0.04, PORCH.z1 - 0.04], y: PORCH.top },
      // Guard rails on the stone wall where the walkway lands above the drive.
      { a: [WALK.runs[1].x0 - 0.3, STONE_WALL.z0 + 0.18], b: [WALK.runs[1].x1, STONE_WALL.z0 + 0.18], y: WALK.runs[1].top + 0.08 },
      { a: [WALK.runs[2].x0 - 0.3, STONE_WALL.z0 + 0.18], b: [WALK.runs[2].x1, STONE_WALL.z0 + 0.18], y: WALK.runs[2].top + 0.08 },
    ],
    [],
  );

  return (
    <group>
      {/* The world beyond the lot. */}
      <mesh geometry={ground} material={m.ground} position={[0, GRADE.street - 0.12, 0]} receiveShadow />
      <group ref={lot}>
        <mesh geometry={terrain} material={m.terrain} receiveShadow />

        {/* Streets, sidewalks, the driveway sloping down into the garage, and the court. */}
        <Slab x0={-90} x1={90} z0={STREET.curb} z1={STREET.far} top={GRADE.street} bottom={GRADE.street - 0.3} material={m.street} shadow={false} />
        <Slab x0={-90} x1={SIDE_STREET.curb} z0={STREET.sidewalk} z1={STREET.curb} top={GRADE.street + 0.12} bottom={GRADE.street - 0.3} material={m.concrete} shadow={false} />
        <Slab x0={SIDE_STREET.curb} x1={SIDE_STREET.far} z0={-90} z1={STREET.curb} top={GRADE.street} bottom={GRADE.street - 0.3} material={m.street} shadow={false} />
        <Slab x0={SIDE_STREET.sidewalk} x1={SIDE_STREET.curb} z0={-90} z1={DRIVE.z0} top={GRADE.street + 0.12} bottom={GRADE.street - 0.3} material={m.concrete} shadow={false} />
        <Slab x0={SIDE_STREET.sidewalk} x1={SIDE_STREET.curb} z0={DRIVE.z1} z1={STREET.sidewalk} top={GRADE.street + 0.12} bottom={GRADE.street - 0.3} material={m.concrete} shadow={false} />
        <Slab x0={DRIVE.x0} x1={SIDE_STREET.curb} z0={DRIVE.z0} z1={DRIVE.z1} top={driveHeight} bottom={-0.3} material={m.drive} shadow={false} />
        <Slab x0={COURT.x0} x1={COURT.x1} z0={COURT.z0} z1={COURT.z1} top={COURT.floor} bottom={-0.2} material={m.concrete} shadow={false} />

        {/* Porch: solid concrete in front of the entry, a slab bridging over the court. */}
        <Slab x0={PORCH.x0} x1={COURT.x0} z0={PORCH.z0} z1={PORCH.z1} top={PORCH.top} bottom={0} material={m.concrete} />
        <Slab x0={COURT.x0} x1={PORCH.x1} z0={PORCH.z0} z1={PORCH.z1} top={PORCH.top} bottom={PORCH.top - 0.28} material={m.concrete} />
        <mesh geometry={unitBox} material={m.trim} position={[PORCH.x1 - 0.07, PORCH.top - 0.38, (PORCH.z0 + PORCH.z1) / 2]} scale={[0.14, 0.2, PORCH.z1 - PORCH.z0]} castShadow />
        <mesh geometry={unitBox} material={m.trim} position={[PORCH.x1 - 0.08, (COURT.floor + PORCH.top - 0.48) / 2, PORCH.z1 - 0.08]} scale={[0.1, PORCH.top - 0.48 - COURT.floor, 0.1]} castShadow />
        {/* Door under the porch, from the court. */}
        <mesh geometry={unitBox} material={m.frame} position={[COURT.x0 + 0.02, COURT.floor + 1.05, D / 2 + 0.78]} scale={[0.05, 2.1, 1.0]} />
        <mesh geometry={unitBox} material={m.door} position={[COURT.x0 + 0.035, COURT.floor + 1.02, D / 2 + 0.78]} scale={[0.04, 2.02, 0.9]} />
        {/* Steps from the porch down to the walkway. */}
        {Array.from({ length: PORCH.steps.count - 1 }, (_, i) => (
          <Slab
            key={i}
            x0={PORCH.steps.x0}
            x1={PORCH.steps.x1}
            z0={PORCH.z1 + i * 0.3 - 0.02}
            z1={PORCH.z1 + (i + 1) * 0.3}
            top={PORCH.top - (i + 1) * RISE}
            bottom={GRADE.front - 0.3}
            material={m.paver}
          />
        ))}
        <Railings rails={porchRails} />

        {/* Armour-stone retaining wall and the walkway stepping down beside it. */}
        {stones.map((s, i) => (
          <Slab key={i} x0={s.x0} x1={s.x1} z0={STONE_WALL.z0} z1={STONE_WALL.z1} top={s.top} bottom={-0.1} material={m.stone} />
        ))}
        {walk.map((s, i) => (
          <Slab key={i} x0={s.x0} x1={s.x1} z0={WALK.z0} z1={WALK.z1} top={s.top} bottom={s.top - 0.7} material={m.paver} />
        ))}
        <Slab x0={WALK.end} x1={WALK.end + 1.2} z0={STONE_WALL.z0} z1={WALK.z1} top={driveHeight(WALK.end + 0.6) + 0.03} bottom={-0.2} material={m.paver} />
        {/* Stone planter with two cedars at the corner of the drive. */}
        <Slab x0={W / 2 + 0.1} x1={W / 2 + 1.1} z0={D / 2 + 0.75} z1={PORCH.z1} top={0.45} bottom={-0.1} material={m.stone} />
        <Slab x0={W / 2 + 0.18} x1={W / 2 + 1.02} z0={D / 2 + 0.83} z1={PORCH.z1 - 0.08} top={0.47} bottom={0.3} material={m.mulch} shadow={false} />

        {/* Backyard: patio off the living room, beds, fence and gate. */}
        <Slab x0={-W / 2 - 3.2} x1={-W / 2} z0={-2.2} z1={0.85} top={GRADE.back + 0.08} bottom={GRADE.back - 0.2} material={m.paver} />
        <Fence path={FENCE_PATH} gate={GATE} />
        <Bed x0={-1.55} x1={0.75} z0={PORCH.z1} z1={PORCH.z1 + 0.62} />
        <Bed x0={PORCH.steps.x1} x1={COURT.x0} z0={PORCH.z1} z1={WALK.z0} />
        <Bed x0={-1.7 - 1.15} x1={-1.7 + 1.15} z0={D / 2 + 3.9 - 1.15} z1={D / 2 + 3.9 + 1.15} round />
        <Bed x0={6.3 - 0.8} x1={6.3 + 0.8} z0={D / 2 + 5.4 - 0.8} z1={D / 2 + 5.4 + 0.8} round />
        <Bed x0={YARD.wrap - 2.6} x1={YARD.wrap - 1.5} z0={YARD.z1 + 0.02} z1={YARD.z1 + 0.9} round />
        <Bed x0={YARD.wrap - 0.2} x1={YARD.wrap + 0.9} z0={YARD.z1 + 0.02} z1={YARD.z1 + 0.9} round />
        {PLANTS.map((plant, i) => (
          <PlantMesh key={i} plant={plant} />
        ))}
        {parts.map((part, i) => (
          <SiteMesh key={i} part={part} highlighted={Boolean(highlight && 'f' in part && part.f === highlight)} />
        ))}

        {/* Status wash over the backyard, and the invisible volume that makes it tappable. */}
        {(key || highlight === 'lawn') && (
          <mesh
            geometry={unitBox}
            material={highlight === 'lawn' ? lawnGlow : statusFill[key ?? 'accent']}
            position={[(YARD.x0 + YARD.x1) / 2, GRADE.back + 0.03, (YARD.z0 + YARD.z1) / 2]}
            scale={[yardW - 0.1, 0.004, yardD - 0.1]}
            renderOrder={2}
          />
        )}
        <mesh
          geometry={unitBox}
          material={m.hidden}
          position={[(YARD.x0 + YARD.x1) / 2, GRADE.back + 0.15, (YARD.z0 + YARD.z1) / 2]}
          scale={[yardW, 0.3, yardD]}
          onClick={tap}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        />
      </group>
    </group>
  );
}
