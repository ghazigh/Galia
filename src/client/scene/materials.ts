import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MaterialKey } from './parts';

// One set of materials and unit geometries for the whole house, created on first use. Night
// glow (windows, lamps) is driven by updating a few shared materials once per frame.

type Spec = { color: string; roughness?: number; metalness?: number; emissive?: string; transparent?: number };

const PART_SPECS: Record<MaterialKey, Spec> = {
  linen: { color: '#efece6' },
  pillow: { color: '#fbfaf7' },
  sofa: { color: '#59657a', roughness: 0.95 },
  cushion: { color: '#6c7890', roughness: 0.95 },
  wood: { color: '#b08b64', roughness: 0.7 },
  woodDark: { color: '#6f5440', roughness: 0.7 },
  woodLight: { color: '#cdb391', roughness: 0.75 },
  cabinet: { color: '#e6e3de', roughness: 0.6 },
  counter: { color: '#8f8a85', roughness: 0.35 },
  appliance: { color: '#eff0f1', roughness: 0.4 },
  steel: { color: '#aeb5bd', roughness: 0.3, metalness: 0.7 },
  black: { color: '#1b1c1f', roughness: 0.5 },
  screen: { color: '#15181d', roughness: 0.2, metalness: 0.4 },
  plant: { color: '#4f7f4e', roughness: 0.9 },
  pot: { color: '#c48a62', roughness: 0.85 },
  rug: { color: '#cbbfb0', roughness: 1 },
  rugBlue: { color: '#97a8bd', roughness: 1 },
  car: { color: '#a3201b', roughness: 0.28, metalness: 0.45 },
  tire: { color: '#151618', roughness: 0.9 },
  carGlass: { color: '#11161c', roughness: 0.1, metalness: 0.6 },
  rim: { color: '#9aa1a9', roughness: 0.3, metalness: 0.8 },
  heatPump: { color: '#dde1e6', roughness: 0.5 },
  tank: { color: '#eceef0', roughness: 0.45 },
  copper: { color: '#b4744a', roughness: 0.35, metalness: 0.75 },
  red: { color: '#cf2e27', roughness: 0.45 },
  blue: { color: '#2f6fe0', roughness: 0.45 },
  panel: { color: '#a4abb4', roughness: 0.4, metalness: 0.4 },
  duct: { color: '#bcc3ca', roughness: 0.35, metalness: 0.6 },
  porcelain: { color: '#fbfbfb', roughness: 0.25 },
  water: { color: '#7fb9d6', roughness: 0.05, metalness: 0.1 },
  sage: { color: '#869f8b' },
  terracotta: { color: '#b9765d' },
  lavender: { color: '#9d93b8' },
  concrete: { color: '#8a8c8f', roughness: 0.95 },
  mat: { color: '#6f6255', roughness: 1 },
  lamp: { color: '#f3eadb', roughness: 0.8, emissive: '#ffcf8f' },
  glassPane: { color: '#cfe3ec', roughness: 0.05, transparent: 0.28 },
  leaves: { color: '#4d7a45', roughness: 0.9 },
  leavesDark: { color: '#3c6438', roughness: 0.9 },
  trunk: { color: '#5b4636', roughness: 0.95 },
  fence: { color: '#4a3d33', roughness: 0.85 },
  paver: { color: '#9d9a95', roughness: 0.95 },
  grille: { color: '#3a3d42', roughness: 0.6, metalness: 0.3 },
  hose: { color: '#3f6b46', roughness: 0.7 },
  spruce: { color: '#5f8079', roughness: 0.9 },
  cedar: { color: '#3d6b36', roughness: 0.9 },
  tuft: { color: '#a8a46b', roughness: 0.95 },
  shrubGold: { color: '#c8b23f', roughness: 0.9 },
  planter: { color: '#3b3c40', roughness: 0.6 },
};

let parts: Record<MaterialKey, MeshStandardMaterial> | null = null;

export function partMaterial(key: MaterialKey): MeshStandardMaterial {
  if (!parts) {
    parts = {} as Record<MaterialKey, MeshStandardMaterial>;
    for (const [name, spec] of Object.entries(PART_SPECS) as [MaterialKey, Spec][]) {
      parts[name] = new MeshStandardMaterial({
        color: spec.color,
        roughness: spec.roughness ?? 0.85,
        metalness: spec.metalness ?? 0,
        emissive: spec.emissive ?? '#000000',
        emissiveIntensity: 0,
        transparent: spec.transparent !== undefined,
        opacity: spec.transparent ?? 1,
        depthWrite: spec.transparent === undefined,
      });
      if (spec.transparent !== undefined) parts[name].side = DoubleSide;
    }
  }
  return parts[key];
}

// ── The house shell ──────────────────────────────────────────────────────────────────────────

// ── Facade textures (drawn once on canvases; 512 px cover TILE meters) ──────────────────────

/** Small deterministic random generator, so the facade looks the same on every device. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 512): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Running-bond brick: 20 cm bricks, 22 courses per tile, each brick a slightly different tone. */
function brickTexture(palette: string[], mortar: string, seed: number) {
  return canvasTexture((ctx, size) => {
    const rand = seeded(seed);
    const courses = 22;
    const perRow = 8;
    const ch = size / courses;
    const bw = size / perRow;
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < courses; row += 1) {
      const shift = row % 2 ? bw / 2 : 0;
      for (let i = -1; i < perRow; i += 1) {
        const x = i * bw + shift;
        ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
        ctx.fillRect(x + 1.5, row * ch + 1.5, bw - 3, ch - 3);
        // Speckle and a darker fired edge for the mottled look.
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(x + 1.5, row * ch + ch - 4, bw - 3, 2.5);
        for (let k = 0; k < 5; k += 1) {
          ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
          ctx.fillRect(x + 2 + rand() * (bw - 8), row * ch + 2 + rand() * (ch - 6), 2 + rand() * 5, 1.5 + rand() * 2);
        }
      }
    }
  });
}

/** Cream horizontal composite siding: 16 cm boards with a shadow line and faint grain. */
function sidingTexture() {
  return canvasTexture((ctx, size) => {
    const rand = seeded(7);
    const boards = 10;
    const bh = size / boards;
    for (let i = 0; i < boards; i += 1) {
      const tone = 200 + Math.floor(rand() * 10);
      ctx.fillStyle = `rgb(${tone + 14}, ${tone + 4}, ${tone - 24})`;
      ctx.fillRect(0, i * bh, size, bh);
      for (let k = 0; k < 14; k += 1) {
        ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(120,100,70,0.08)';
        ctx.fillRect(rand() * size, i * bh + 3 + rand() * (bh - 8), 40 + rand() * 160, 1.2);
      }
      ctx.fillStyle = 'rgba(80,70,50,0.35)';
      ctx.fillRect(0, i * bh + bh - 3, size, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, i * bh, size, 1.5);
    }
  });
}

/** Architectural asphalt shingles in courses, staggered tabs. */
function shingleTexture() {
  return canvasTexture((ctx, size) => {
    const rand = seeded(11);
    const courses = 12;
    const ch = size / courses;
    for (let row = 0; row < courses; row += 1) {
      let x = -rand() * 60;
      while (x < size) {
        const w = 70 + rand() * 60;
        const tone = 64 + Math.floor(rand() * 16);
        ctx.fillStyle = `rgb(${tone + 4}, ${tone + 3}, ${tone + 2})`;
        ctx.fillRect(x, row * ch, w - 2, ch);
        x += w;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, row * ch + ch - 3, size, 3);
    }
    for (let k = 0; k < 2500; k += 1) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
      ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5);
    }
  });
}

/** Armour stone retaining wall: big rough blocks. */
function stoneTexture() {
  return canvasTexture((ctx, size) => {
    const rand = seeded(23);
    ctx.fillStyle = '#5f5d58';
    ctx.fillRect(0, 0, size, size);
    const rows = 4;
    const rh = size / rows;
    for (let row = 0; row < rows; row += 1) {
      let x = -rand() * 120;
      while (x < size) {
        const w = 150 + rand() * 140;
        const tone = 168 + Math.floor(rand() * 26);
        ctx.fillStyle = `rgb(${tone}, ${tone - 3}, ${tone - 10})`;
        ctx.fillRect(x + 4, row * rh + 4, w - 8, rh - 8);
        for (let k = 0; k < 40; k += 1) {
          ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
          ctx.fillRect(x + 6 + rand() * (w - 20), row * rh + 6 + rand() * (rh - 18), 3 + rand() * 12, 2 + rand() * 6);
        }
        x += w;
      }
    }
  });
}

/** Faint horizontal sections on the flush garage door (UVs span the door). */
function garageTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 8, 128);
  ctx.fillStyle = '#d4d4d4';
  for (let y = 32; y < 128; y += 32) ctx.fillRect(0, y, 8, 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Large-format concrete pavers in random-width courses, light grey with dark joints. */
function paverTexture() {
  return canvasTexture((ctx, size) => {
    const rand = seeded(31);
    ctx.fillStyle = '#6f706f';
    ctx.fillRect(0, 0, size, size);
    const rows = 4;
    const rh = size / rows;
    for (let row = 0; row < rows; row += 1) {
      let x = -rand() * 80;
      while (x < size) {
        const w = [rh, rh * 1.5, rh * 2][Math.floor(rand() * 3)];
        const tone = 176 + Math.floor(rand() * 22);
        ctx.fillStyle = `rgb(${tone}, ${tone + 1}, ${tone + 2})`;
        ctx.fillRect(x + 2, row * rh + 2, w - 4, rh - 4);
        for (let k = 0; k < 60; k += 1) {
          ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
          ctx.fillRect(x + 3 + rand() * (w - 8), row * rh + 3 + rand() * (rh - 8), 2 + rand() * 4, 2 + rand() * 4);
        }
        x += w;
      }
    }
  });
}

/** Fine asphalt grain. */
function asphaltTexture() {
  return canvasTexture((ctx, size) => {
    const rand = seeded(41);
    ctx.fillStyle = '#7d7e80';
    ctx.fillRect(0, 0, size, size);
    for (let k = 0; k < 9000; k += 1) {
      const tone = 90 + Math.floor(rand() * 90);
      ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone + 2}, 0.5)`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
  }, 256);
}

/** One diamond of chain-link fence; tiled at 6 cm it reads as a grey veil from afar. */
function chainLinkTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(16, 0);
  ctx.lineTo(32, 16);
  ctx.lineTo(16, 32);
  ctx.closePath();
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

export type CladdingKey = 'brickDark' | 'brickLight' | 'siding' | 'foundation';

export interface ShellMaterials {
  /** Main exterior finish (dark mottled brick). */
  exterior: MeshStandardMaterial;
  cladding: Record<CladdingKey, MeshStandardMaterial>;
  interior: MeshStandardMaterial;
  cut: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  frame: MeshStandardMaterial;
  /** Window glass: dark and reflective by day, warm when the lights are on. */
  glass: MeshStandardMaterial;
  /** Some windows stay dark at night, so the house doesn't look like a lantern. */
  glassDim: MeshStandardMaterial;
  garage: MeshStandardMaterial;
  door: MeshStandardMaterial;
  /** Dark grey metal: canopy, spandrel panels. */
  metal: MeshStandardMaterial;
  soffit: MeshStandardMaterial;
  gutter: MeshStandardMaterial;
  railing: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  sill: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  paver: MeshStandardMaterial;
  mulch: MeshStandardMaterial;
  chainLink: MeshStandardMaterial;
  /** The world beyond the lot. */
  ground: MeshStandardMaterial;
  /** The lot's height field: lawns fading into the ground (vertex colors). */
  terrain: MeshStandardMaterial;
  drive: MeshStandardMaterial;
  street: MeshStandardMaterial;
  sconce: MeshStandardMaterial;
  floors: Record<string, MeshStandardMaterial>;
  /** Pulses on a fixture the selected task is about. */
  highlight: MeshStandardMaterial;
  hidden: MeshBasicMaterial;
}

let shell: ShellMaterials | null = null;

export function shellMaterials(): ShellMaterials {
  if (shell) return shell;
  const brickDark = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    map: brickTexture(['#5f5e5d', '#6c6b69', '#545454', '#797774', '#4d4d4e', '#666463', '#817e7b', '#5b5a59', '#71706e'], '#8f8d89', 3),
  });
  const brickLight = new MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    map: brickTexture(['#b1b0ad', '#bbbab6', '#a8a7a4', '#c3c2be', '#adaca9', '#c8c7c3', '#a19f9c', '#b6b5b1'], '#cbc9c4', 5),
  });
  const siding = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, map: sidingTexture() });
  const foundation = new MeshStandardMaterial({ color: '#b3b0a9', roughness: 0.95 });
  const asphalt = asphaltTexture();
  const chain = chainLinkTexture();
  shell = {
    exterior: brickDark,
    cladding: { brickDark, brickLight, siding, foundation },
    interior: new MeshStandardMaterial({ color: '#e5e2dd', roughness: 0.95 }),
    cut: new MeshStandardMaterial({ color: '#25272b', roughness: 0.9 }),
    trim: new MeshStandardMaterial({ color: '#3f4146', roughness: 0.6, metalness: 0.2 }),
    roof: new MeshStandardMaterial({ color: '#f3ece4', roughness: 0.92, map: shingleTexture(), side: DoubleSide }),
    frame: new MeshStandardMaterial({ color: '#3a3c40', roughness: 0.45, metalness: 0.35 }),
    glass: new MeshStandardMaterial({ color: '#2b3846', roughness: 0.08, metalness: 0.55, envMapIntensity: 1.6, emissive: '#ffb463', emissiveIntensity: 0 }),
    glassDim: new MeshStandardMaterial({ color: '#2b3846', roughness: 0.08, metalness: 0.55, envMapIntensity: 1.6, emissive: '#ffb463', emissiveIntensity: 0 }),
    garage: new MeshStandardMaterial({ color: '#55585d', roughness: 0.5, metalness: 0.35, map: garageTexture() }),
    door: new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.45, metalness: 0.3 }),
    metal: new MeshStandardMaterial({ color: '#4a4c51', roughness: 0.5, metalness: 0.35 }),
    soffit: new MeshStandardMaterial({ color: '#3d3f43', roughness: 0.7, metalness: 0.15 }),
    gutter: new MeshStandardMaterial({ color: '#46484d', roughness: 0.45, metalness: 0.4 }),
    railing: new MeshStandardMaterial({ color: '#6e6c69', roughness: 0.45, metalness: 0.5 }),
    concrete: new MeshStandardMaterial({ color: '#b4b1ab', roughness: 0.9 }),
    sill: new MeshStandardMaterial({ color: '#c9c6bf', roughness: 0.85 }),
    stone: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, map: stoneTexture() }),
    paver: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, map: paverTexture() }),
    mulch: new MeshStandardMaterial({ color: '#2b2320', roughness: 1 }),
    chainLink: new MeshStandardMaterial({
      color: '#1b1c1f',
      roughness: 0.6,
      metalness: 0.4,
      alphaMap: chain,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
    ground: new MeshStandardMaterial({ color: '#4b5145', roughness: 0.97, envMapIntensity: 0.4 }),
    terrain: new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.96, envMapIntensity: 0.45 }),
    drive: new MeshStandardMaterial({ color: '#4a4b4e', roughness: 0.9, map: asphalt }),
    street: new MeshStandardMaterial({ color: '#626366', roughness: 0.92, map: asphalt }),
    sconce: new MeshStandardMaterial({ color: '#f1e6d4', emissive: '#ffd08f', emissiveIntensity: 0 }),
    floors: {
      oak: new MeshStandardMaterial({ color: '#b99872', roughness: 0.7 }),
      tile: new MeshStandardMaterial({ color: '#d2d4d6', roughness: 0.4 }),
      mosaic: new MeshStandardMaterial({ color: '#b5c5cd', roughness: 0.35 }),
      stone: new MeshStandardMaterial({ color: '#b3aca2', roughness: 0.8 }),
      concrete: new MeshStandardMaterial({ color: '#8d8f92', roughness: 0.9 }),
      epoxy: new MeshStandardMaterial({ color: '#8f9aa6', roughness: 0.35 }),
    },
    highlight: new MeshStandardMaterial({ color: '#3e6ae1', emissive: '#4f7bff', emissiveIntensity: 0.8, roughness: 0.4 }),
    hidden: new MeshBasicMaterial({ visible: false }),
  };
  // Paving, beds and walls sitting on the lawn win any depth tie with it (the lot can flatten).
  for (const material of [shell.concrete, shell.stone, shell.paver, shell.mulch, shell.drive, shell.street]) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -2;
  }
  // Matte outdoor finishes take less of the sky's blue from the environment, so the sun's
  // warmth (and the real colors of brick, siding and shingles) come through.
  for (const material of [
    ...Object.values(shell.cladding),
    shell.roof,
    shell.trim,
    shell.soffit,
    shell.concrete,
    shell.sill,
    shell.stone,
    shell.paver,
    shell.drive,
    shell.street,
    shell.metal,
    shell.gutter,
    shell.railing,
  ]) {
    material.envMapIntensity = 0.55;
  }
  return shell;
}

/**
 * Material slots of a box ([+x, −x, +y, −y, +z, −z]) for a wall whose outside faces `side`, finished
 * with `outside` (interior paint inside, dark cut on top).
 */
export function wallFaces(side: 'front' | 'back' | 'left' | 'right' | 'partition', outside: Material = shellMaterials().exterior): Material[] {
  const m = shellMaterials();
  const { interior: i, cut: c } = m;
  const e = outside;
  switch (side) {
    case 'front':
      return [e, e, c, c, e, i];
    case 'back':
      return [e, e, c, c, i, e];
    case 'left':
      return [i, e, c, c, e, e];
    case 'right':
      return [e, i, c, c, e, e];
    default:
      return [i, i, c, c, i, i];
  }
}

// ── Unit geometries ──────────────────────────────────────────────────────────────────────────

export const unitBox: BufferGeometry = new BoxGeometry(1, 1, 1);
const cylinders = new Map<number, BufferGeometry>();
const rounded = new Map<string, BufferGeometry>();
const balls = new Map<string, BufferGeometry>();

export function unitCylinder(segments = 24): BufferGeometry {
  let geometry = cylinders.get(segments);
  if (!geometry) {
    geometry = new CylinderGeometry(1, 1, 1, segments);
    cylinders.set(segments, geometry);
  }
  return geometry;
}

export function roundedBox(w: number, h: number, d: number, r: number): BufferGeometry {
  const key = [w, h, d, r].map((n) => n.toFixed(3)).join(':');
  let geometry = rounded.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) - 0.0001);
    rounded.set(key, geometry);
  }
  return geometry;
}

const cones = new Map<number, BufferGeometry>();

/** Unit cone (radius 1, height 1) standing on its base center. */
export function unitCone(segments = 9): BufferGeometry {
  let geometry = cones.get(segments);
  if (!geometry) {
    geometry = new ConeGeometry(1, 1, segments).translate(0, 0.5, 0);
    cones.set(segments, geometry);
  }
  return geometry;
}

export function ballGeometry(facet: boolean): BufferGeometry {
  const key = facet ? 'facet' : 'smooth';
  let geometry = balls.get(key);
  if (!geometry) {
    geometry = facet ? new IcosahedronGeometry(1, 1) : new SphereGeometry(1, 24, 16);
    balls.set(key, geometry);
  }
  return geometry;
}

const DAY_GLASS = new Color('#2b3846');
const LIT_GLASS = new Color('#3a2a1a');

/** Sets emissive glow on the night-light materials (0 = off, 1 = all lights on). */
export function setLightsOn(level: number, time: number) {
  const m = shellMaterials();
  const flicker = 1 + Math.sin(time * 0.7) * 0.015;
  m.glass.emissiveIntensity = 0.85 * level * flicker;
  m.glassDim.emissiveIntensity = 0.12 * level;
  m.sconce.emissiveIntensity = 2.2 * level;
  partMaterial('lamp').emissiveIntensity = 1.6 * level;
  // Glass loses its daytime mirror look once lit from inside.
  m.glass.metalness = 0.55 - 0.4 * level;
  m.glass.color.copy(DAY_GLASS).lerp(LIT_GLASS, level * 0.4);
}
