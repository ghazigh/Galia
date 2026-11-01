import {
  BoxGeometry,
  CanvasTexture,
  Color,
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

/** Vertical board texture for the siding: subtle grooves every 15 cm. */
function sidingTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 8);
  ctx.fillStyle = '#c9c9c9';
  for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 2, 8);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.repeat.set(1.6, 1);
  return texture;
}

/** Horizontal panel grooves for the garage door. */
function panelTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 8, 128);
  ctx.fillStyle = '#9a9a9a';
  for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y, 8, 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export interface ShellMaterials {
  exterior: MeshStandardMaterial;
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
  ground: MeshStandardMaterial;
  drive: MeshStandardMaterial;
  grass: MeshStandardMaterial;
  grassStripe: MeshStandardMaterial;
  sconce: MeshStandardMaterial;
  floors: Record<string, MeshStandardMaterial>;
  /** Pulses on a fixture the selected task is about. */
  highlight: MeshStandardMaterial;
  hidden: MeshBasicMaterial;
}

let shell: ShellMaterials | null = null;

export function shellMaterials(): ShellMaterials {
  if (shell) return shell;
  const siding = sidingTexture();
  const panels = panelTexture();
  shell = {
    exterior: new MeshStandardMaterial({ color: '#3b3e43', roughness: 0.82, map: siding }),
    interior: new MeshStandardMaterial({ color: '#e5e2dd', roughness: 0.95 }),
    cut: new MeshStandardMaterial({ color: '#25272b', roughness: 0.9 }),
    trim: new MeshStandardMaterial({ color: '#232528', roughness: 0.7 }),
    roof: new MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.35 }),
    frame: new MeshStandardMaterial({ color: '#17181a', roughness: 0.5, metalness: 0.3 }),
    glass: new MeshStandardMaterial({ color: '#2b3846', roughness: 0.08, metalness: 0.55, envMapIntensity: 1.6, emissive: '#ffb463', emissiveIntensity: 0 }),
    glassDim: new MeshStandardMaterial({ color: '#2b3846', roughness: 0.08, metalness: 0.55, envMapIntensity: 1.6, emissive: '#ffb463', emissiveIntensity: 0 }),
    garage: new MeshStandardMaterial({ color: '#4c4f55', roughness: 0.55, metalness: 0.4, map: panels }),
    door: new MeshStandardMaterial({ color: '#8c6a4c', roughness: 0.6 }),
    ground: new MeshStandardMaterial({ color: '#444340', roughness: 0.97, envMapIntensity: 0.4 }),
    drive: new MeshStandardMaterial({ color: '#77797d', roughness: 0.92 }),
    grass: new MeshStandardMaterial({ color: '#58733f', roughness: 0.95 }),
    grassStripe: new MeshStandardMaterial({ color: '#5f7c44', roughness: 0.95 }),
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
  return shell;
}

/** Material slots of a box ([+x, −x, +y, −y, +z, −z]) for a wall whose outside faces `side`. */
export function wallFaces(side: 'front' | 'back' | 'left' | 'right' | 'partition'): Material[] {
  const m = shellMaterials();
  const { exterior: e, interior: i, cut: c } = m;
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
