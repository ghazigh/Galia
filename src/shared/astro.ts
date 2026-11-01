// Sun and moon positions, sun times and moon phases for the live sky on the home screen.
//
// The formulas follow Vladimir Agafonkin's SunCalc (BSD-2), which implements the low-precision
// methods from aa.quae.nl and Jean Meeus' "Astronomical Algorithms": good to about a minute for
// sun times and a few hours for moon phases — plenty for a sky. Angles are radians; azimuths are
// compass bearings (0 = north, π/2 = east), unlike SunCalc's south-based convention.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397;

const toJulian = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date: Date) => toJulian(date) - J2000;

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));

/** Azimuth measured from south, positive toward west (SunCalc's convention). */
const southAzimuth = (h: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitudeOf = (h: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
const siderealTime = (d: number, lw: number) => RAD * (280.16 + 360.9856235 * d) - lw;

/** South-based azimuth → compass bearing in [0, 2π). */
const toBearing = (azimuth: number) => {
  const bearing = (azimuth + Math.PI) % (2 * Math.PI);
  return bearing < 0 ? bearing + 2 * Math.PI : bearing;
};

/** Atmospheric refraction near the horizon (Meeus 16.4), for altitudes in radians. */
function refraction(h: number): number {
  const altitude = Math.max(0, h);
  return 0.0002967 / Math.tan(altitude + 0.00312536 / (altitude + 0.08901179));
}

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(m: number): number {
  const center = RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const perihelion = RAD * 102.9372;
  return m + center + perihelion + Math.PI;
}

function sunCoords(d: number) {
  const l = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(l, 0), ra: rightAscension(l, 0) };
}

export interface SkyPosition {
  /** Angle above the horizon (negative below it). */
  altitude: number;
  /** Compass bearing: 0 north, π/2 east, π south, 3π/2 west. */
  azimuth: number;
}

export function sunPosition(date: Date, lat: number, lng: number): SkyPosition {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const h = siderealTime(d, lw) - c.ra;
  return { altitude: altitudeOf(h, phi, c.dec), azimuth: toBearing(southAzimuth(h, phi, c.dec)) };
}

// ── Sun times ─────────────────────────────────────────────────────────────────────────────────

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (ht: number, lw: number, n: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, m: number, l: number) => J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
const hourAngle = (h: number, phi: number, dec: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

/** Sun altitudes (degrees) that mark the day's transitions: [angle, morning, evening]. */
const SUN_EVENTS = [
  [-0.833, 'sunrise', 'sunset'],
  [-6, 'dawn', 'dusk'],
  [-12, 'nauticalDawn', 'nauticalDusk'],
  [-18, 'nightEnd', 'night'],
  [6, 'goldenHourEnd', 'goldenHour'],
] as const;

type SunEvent = (typeof SUN_EVENTS)[number][1 | 2];

export type SunTimes = { solarNoon: Date; nadir: Date } & Record<SunEvent, Date | null>;

/**
 * Sun times for the solar day whose noon is nearest `date` (pass any moment of the local day,
 * ideally around midday). Events that do not happen — polar day or night — are null.
 */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l, 0);
  const noon = solarTransitJ(ds, m, l);

  const result = { solarNoon: fromJulian(noon), nadir: fromJulian(noon - 0.5) } as SunTimes;
  for (const [angle, morning, evening] of SUN_EVENTS) {
    const w = hourAngle(angle * RAD, phi, dec);
    if (Number.isNaN(w)) {
      result[morning] = null;
      result[evening] = null;
      continue;
    }
    const set = solarTransitJ(approxTransit(w, lw, n), m, l);
    result[morning] = fromJulian(noon - (set - noon));
    result[evening] = fromJulian(set);
  }
  return result;
}

// ── Moon ──────────────────────────────────────────────────────────────────────────────────────

function moonCoords(d: number) {
  const l0 = RAD * (218.316 + 13.176396 * d); // ecliptic longitude
  const m = RAD * (134.963 + 13.064993 * d); // mean anomaly
  const f = RAD * (93.272 + 13.22935 * d); // mean distance
  const l = l0 + RAD * 6.289 * Math.sin(m);
  const b = RAD * 5.128 * Math.sin(f);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385_001 - 20_905 * Math.cos(m) };
}

export interface MoonPosition extends SkyPosition {
  /** Kilometers from Earth. */
  distance: number;
  /** Tilt of the moon's disc as seen by the observer (Meeus 14.1). */
  parallacticAngle: number;
}

export function moonPosition(date: Date, lat: number, lng: number): MoonPosition {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const h = siderealTime(d, lw) - c.ra;
  const altitude = altitudeOf(h, phi, c.dec);
  return {
    altitude: altitude + refraction(altitude),
    azimuth: toBearing(southAzimuth(h, phi, c.dec)),
    distance: c.dist,
    parallacticAngle: Math.atan2(Math.sin(h), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(h)),
  };
}

export interface MoonIllumination {
  /** Illuminated fraction of the disc, 0–1. */
  fraction: number;
  /** 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter → 1 new. */
  phase: number;
  /** Position angle of the bright limb's midpoint, eastward from north. */
  angle: number;
}

export function moonIllumination(date: Date): MoonIllumination {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sunDistance = 149_598_000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sunDistance * Math.sin(phi), m.dist - sunDistance * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    angle,
  };
}

const SYNODIC = 29.530588853;
const PHASE_NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
] as const;

export type MoonPhaseName = (typeof PHASE_NAMES)[number];

/** Name of a moon phase; the four principal phases each span about a day either side. */
export function moonPhaseName(phase: number): MoonPhaseName {
  const p = ((phase % 1) + 1) % 1;
  const day = 1 / SYNODIC;
  const principal = [0, 0.25, 0.5, 0.75, 1];
  for (const [i, at] of principal.entries()) {
    if (Math.abs(p - at) <= day) return PHASE_NAMES[(i * 2) % 8];
  }
  if (p < 0.25) return 'Waxing crescent';
  if (p < 0.5) return 'Waxing gibbous';
  if (p < 0.75) return 'Waning gibbous';
  return 'Waning crescent';
}

// ── Daylight ──────────────────────────────────────────────────────────────────────────────────

export type DaylightPhase = 'night' | 'astronomical' | 'nautical' | 'civil' | 'golden' | 'day';

/** Where the sun's altitude puts the sky: twilight bands follow the standard definitions. */
export function daylightPhase(sunAltitude: number): DaylightPhase {
  const deg = sunAltitude / RAD;
  if (deg >= 6) return 'day';
  if (deg >= -0.833) return 'golden';
  if (deg >= -6) return 'civil';
  if (deg >= -12) return 'nautical';
  if (deg >= -18) return 'astronomical';
  return 'night';
}

export interface DaylightEvent {
  kind: 'sunrise' | 'sunset';
  at: Date;
}

/** The next sunrise or sunset after `date`, looking up to two days ahead (null in polar day/night). */
export function nextSunEvent(date: Date, lat: number, lng: number): DaylightEvent | null {
  const events: DaylightEvent[] = [];
  for (const offset of [-1, 0, 1, 2]) {
    const times = sunTimes(new Date(date.valueOf() + offset * DAY_MS), lat, lng);
    if (times.sunrise) events.push({ kind: 'sunrise', at: times.sunrise });
    if (times.sunset) events.push({ kind: 'sunset', at: times.sunset });
  }
  return events.filter((e) => e.at > date).sort((a, b) => a.at.valueOf() - b.at.valueOf())[0] ?? null;
}

/** The instant of local solar noon closest to a calendar day (for "today's" sun times). */
export function solarNoonOf(year: number, month: number, day: number, lng: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12) - (lng / 15) * 3_600_000);
}

export const DEG = RAD;
