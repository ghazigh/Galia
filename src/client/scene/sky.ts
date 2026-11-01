// How the sky, light and windows look for a given sun and moon — pure numbers and sRGB colors, so
// the renderer just copies them into uniforms. Keyframes are indexed by the sun's altitude.

const DEG = Math.PI / 180;

type Rgb = readonly [number, number, number];

function hex(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Interpolate in linear light so twilight blends don't go muddy.
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function mix(a: string, b: string, t: number): string {
  const ca = hex(a).map(toLinear);
  const cb = hex(b).map(toLinear);
  return toHex(ca.map((v, i) => toSrgb(v + (cb[i] - v) * t)) as unknown as Rgb);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (e0: number, e1: number, v: number) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

interface Key {
  alt: number;
  zenith: string;
  horizon: string;
  ground: string;
  glow: string;
  cloudLit: string;
  cloudShade: string;
}

// Sun altitude in degrees → palette. Night is deep blue-black, the blue hour is steel blue, sunset
// burns at the horizon, and the day is a slightly muted, cinematic blue.
const KEYS: readonly Key[] = [
  { alt: -90, zenith: '#060a14', horizon: '#111a2c', ground: '#090c13', glow: '#141d36', cloudLit: '#222b3d', cloudShade: '#0b0f18' },
  { alt: -18, zenith: '#070c18', horizon: '#141e32', ground: '#0a0e15', glow: '#18223d', cloudLit: '#252f42', cloudShade: '#0c1019' },
  { alt: -12, zenith: '#081127', horizon: '#18243d', ground: '#0a0e17', glow: '#2b2a48', cloudLit: '#2c3247', cloudShade: '#0d111c' },
  { alt: -6, zenith: '#16264b', horizon: '#47506e', ground: '#151a26', glow: '#a25c5e', cloudLit: '#6a5266', cloudShade: '#1d2233' },
  { alt: -2, zenith: '#253a69', horizon: '#b0715d', ground: '#24242d', glow: '#ff7a3c', cloudLit: '#d07a62', cloudShade: '#33303d' },
  { alt: 2, zenith: '#33508a', horizon: '#e39a68', ground: '#3a3a3f', glow: '#ffa25a', cloudLit: '#ffb98a', cloudShade: '#5b5560' },
  { alt: 8, zenith: '#416aa6', horizon: '#c7c2b9', ground: '#55575c', glow: '#ffd09a', cloudLit: '#fbe6cf', cloudShade: '#8a8f9c' },
  { alt: 20, zenith: '#4472b2', horizon: '#adc1d6', ground: '#606368', glow: '#fff0d8', cloudLit: '#f4f6fa', cloudShade: '#9aa5b6' },
  { alt: 45, zenith: '#3b6db4', horizon: '#a3bcd6', ground: '#64676c', glow: '#ffffff', cloudLit: '#f8f9fb', cloudShade: '#a3aebe' },
  { alt: 90, zenith: '#3769b2', horizon: '#9fbad6', ground: '#65686d', glow: '#ffffff', cloudLit: '#f8f9fb', cloudShade: '#a6b1c0' },
];

function paletteAt(alt: number): Omit<Key, 'alt'> {
  const a = Math.max(-90, Math.min(90, alt));
  let i = 0;
  while (i < KEYS.length - 2 && a > KEYS[i + 1].alt) i += 1;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = smooth(0, 1, (a - k0.alt) / (k1.alt - k0.alt));
  return {
    zenith: mix(k0.zenith, k1.zenith, t),
    horizon: mix(k0.horizon, k1.horizon, t),
    ground: mix(k0.ground, k1.ground, t),
    glow: mix(k0.glow, k1.glow, t),
    cloudLit: mix(k0.cloudLit, k1.cloudLit, t),
    cloudShade: mix(k0.cloudShade, k1.cloudShade, t),
  };
}

export interface SkyLook {
  zenith: string;
  horizon: string;
  /** Below the horizon, and the fog the ground fades into. */
  ground: string;
  glow: string;
  /** Strength of the warm band toward the sun near the horizon. */
  horizonWarm: number;
  sunColor: string;
  sunDisc: number;
  sunHalo: number;
  stars: number;
  moonGlow: number;
  /** Moon disc brightness (dim in daylight). */
  moonDisc: number;
  cloudLit: string;
  cloudShade: string;
  /** The one shadow-casting light: the sun, or the moon at night. */
  key: { source: 'sun' | 'moon'; color: string; intensity: number };
  ambient: { sky: string; ground: string; intensity: number };
  envIntensity: number;
  /** 0–1: interior lights on (around sunset until sunrise). */
  lightsOn: number;
  /** 0–1: cool "moonlit" self-light on the exterior so the house reads at night. */
  nightFill: number;
  exposure: number;
}

/** Everything the scene needs to render a sky for the sun's and moon's altitudes (radians). */
export function skyLook(sunAltitude: number, moonAltitude: number, moonFraction: number): SkyLook {
  const sun = sunAltitude / DEG;
  const moon = moonAltitude / DEG;
  const p = paletteAt(sun);

  const sunColor =
    sun < 2 ? mix('#ff5a1f', '#ff9a4a', smooth(-2, 2, sun)) : sun < 12 ? mix('#ff9a4a', '#ffe0b6', smooth(2, 12, sun)) : mix('#ffe0b6', '#fff7ec', smooth(12, 40, sun));
  const sunUp = smooth(-1.5, 1.5, sun);
  const night = 1 - smooth(-10, -2, sun);
  const moonUp = smooth(-1, 4, moon) * (0.35 + 0.65 * moonFraction);

  // Key light: the sun when it is up; the moon once the sun is well down.
  const sunIntensity = sun <= -1 ? 0 : lerp(0, 0.7, smooth(-1, 1, sun)) + lerp(0, 1.6, smooth(1, 8, sun)) + lerp(0, 1.2, smooth(8, 35, sun));
  const moonIntensity = 0.42 * moonUp * night;
  const key =
    sunIntensity > 0.05 || moonIntensity <= 0.02
      ? { source: 'sun' as const, color: sunColor, intensity: sunIntensity }
      : { source: 'moon' as const, color: '#a9bcff', intensity: moonIntensity };

  return {
    ...p,
    horizonWarm: smooth(-14, -4, sun) * (1 - smooth(6, 22, sun)),
    sunColor,
    sunDisc: sunUp,
    sunHalo: lerp(0.95, 0.38, smooth(0, 30, sun)) * sunUp,
    stars: 1 - smooth(-14, -4, sun),
    moonGlow: moonUp * lerp(1, 0.15, smooth(-6, 6, sun)),
    moonDisc: smooth(-1, 2, moon) * lerp(1, 0.55, smooth(-4, 8, sun)),
    key,
    // Night keeps a cool blue fill so the house still reads after dark.
    ambient: {
      sky: mix('#5a6c96', mix(p.zenith, '#ffffff', 0.55), smooth(-8, 4, sun)),
      ground: mix('#1b2130', p.ground, smooth(-8, 4, sun)),
      intensity: lerp(1.25, 1.05, smooth(-12, 12, sun)),
    },
    envIntensity: lerp(0.8, 1.35, smooth(-12, 10, sun)),
    lightsOn: 1 - smooth(-3, 5, sun),
    nightFill: 1 - smooth(-12, -1, sun),
    exposure: lerp(1.25, 0.92, smooth(-14, 12, sun)),
  };
}

// ── Directions ───────────────────────────────────────────────────────────────────────────────

/**
 * Unit vector (x, y, z) in scene space for a compass bearing and altitude, given the bearing the
 * front of the house (+z) faces. East sits to the right of the front when the house faces south.
 */
export function skyDirection(azimuth: number, altitude: number, facing: number): [number, number, number] {
  const rel = azimuth - facing;
  const c = Math.cos(altitude);
  return [-Math.sin(rel) * c, Math.sin(altitude), Math.cos(rel) * c];
}

/**
 * Altitude at which to draw a body so it stays inside the band of sky the camera shows: low
 * altitudes stay near the horizon, high ones are squeezed below ~12°. Lighting keeps the true altitude.
 */
export function displayAltitude(altitude: number): number {
  if (altitude <= 0) return altitude;
  const max = 12.5 * DEG;
  return (max * (1 - Math.exp(-altitude / (18 * DEG)))) / (1 - Math.exp(-(90 / 18)));
}

/**
 * Bearing the front of the house faces when the user hasn't said: away from the midday sun (north
 * in the northern hemisphere), so the default view looks toward the sun and moon.
 */
export function defaultFacing(lat: number): number {
  return lat >= 0 ? 0 : Math.PI;
}
