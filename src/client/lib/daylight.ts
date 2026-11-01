import {
  daylightPhase,
  moonIllumination,
  moonPosition,
  nextSunEvent,
  solarNoonOf,
  sunPosition,
  sunTimes,
  type DaylightEvent,
  type DaylightPhase,
  type MoonIllumination,
  type MoonPosition,
  type SkyPosition,
  type SunTimes,
} from '@shared/astro';
import { zonedNow, parseYmd } from '@shared/dates';
import { approximateLocation } from '@shared/geo';
import { useMemo, useSyncExternalStore } from 'react';
import { usePrefs } from './prefs';

// ── Clock: one shared ticker, plus an optional "preview" time for scrubbing the sky ─────────────

const TICK_MS = 30_000;
let now = Date.now();
let preview: number | null = null;
let snapshot = { at: new Date(now), live: true };
const clockListeners = new Set<() => void>();
let timer: number | undefined;

function emit() {
  const ms = preview ?? now;
  const live = preview === null;
  if (ms === snapshot.at.valueOf() && live === snapshot.live) return;
  snapshot = { at: new Date(ms), live };
  for (const listener of clockListeners) listener();
}

function tick() {
  now = Date.now();
  emit();
}

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    tick();
    timer = window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    }
  };
}

const getSnapshot = () => snapshot;

/** Shows the sky at another moment (the Daylight sheet's time scrubber); null returns to live. */
export function setSkyPreview(at: Date | null) {
  preview = at ? at.valueOf() : null;
  if (preview === null) now = Date.now();
  emit();
}

/** The moment the sky shows: a previewed time, or now in 30-second steps. */
export function useSkyTime(): { at: Date; live: boolean } {
  return useSyncExternalStore(subscribeClock, getSnapshot, getSnapshot);
}

// ── Which time zone the sky follows (the household's once signed in, else the browser's) ──────

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

let activeTimeZone = typeof window === 'undefined' ? 'UTC' : browserTimeZone();
const zoneListeners = new Set<() => void>();

export function setSkyTimeZone(timeZone: string | null) {
  const next = timeZone || browserTimeZone();
  if (next === activeTimeZone) return;
  activeTimeZone = next;
  for (const listener of zoneListeners) listener();
}

function useSkyTimeZone(): string {
  return useSyncExternalStore(
    (listener) => {
      zoneListeners.add(listener);
      return () => zoneListeners.delete(listener);
    },
    () => activeTimeZone,
    () => activeTimeZone,
  );
}

// ── Daylight ──────────────────────────────────────────────────────────────────────────────────

export interface SkyLocation {
  lat: number;
  lng: number;
  /** "Toronto", "This device" … */
  label: string;
  source: 'device' | 'time-zone';
}

export interface Daylight {
  at: Date;
  live: boolean;
  timeZone: string;
  location: SkyLocation;
  sun: SkyPosition;
  moon: MoonPosition;
  illumination: MoonIllumination;
  phase: DaylightPhase;
  /** Before solar noon (dawn and sunrise rather than dusk and sunset). */
  morning: boolean;
  /** The sun is below the horizon. */
  isNight: boolean;
  /** Sun times for the local calendar day of `at`. */
  today: SunTimes;
  next: DaylightEvent | null;
}

export function useSkyLocation(timeZone: string): SkyLocation {
  const { location } = usePrefs();
  return useMemo(() => {
    if (location.mode === 'device') return { lat: location.lat, lng: location.lng, label: 'This device', source: 'device' };
    const approx = approximateLocation(timeZone);
    return { lat: approx.lat, lng: approx.lng, label: approx.city ?? timeZone, source: 'time-zone' };
  }, [location, timeZone]);
}

export function computeDaylight(at: Date, live: boolean, timeZone: string, location: SkyLocation): Daylight {
  const { lat, lng } = location;
  const sun = sunPosition(at, lat, lng);
  const { y, m, d } = parseYmd(zonedNow(timeZone, at).date);
  const today = sunTimes(solarNoonOf(y, m, d, lng), lat, lng);
  return {
    at,
    live,
    timeZone,
    location,
    sun,
    moon: moonPosition(at, lat, lng),
    illumination: moonIllumination(at),
    phase: daylightPhase(sun.altitude),
    morning: at < today.solarNoon,
    isNight: sun.altitude < (-0.833 * Math.PI) / 180,
    today,
    next: nextSunEvent(at, lat, lng),
  };
}

/** Live sun and moon for the household (or a previewed moment), refreshed every 30 seconds. */
export function useDaylight(timeZoneOverride?: string): Daylight {
  const activeZone = useSkyTimeZone();
  const timeZone = timeZoneOverride ?? activeZone;
  const { at, live } = useSkyTime();
  const location = useSkyLocation(timeZone);
  return useMemo(() => computeDaylight(at, live, timeZone, location), [at, live, timeZone, location]);
}

/** "16:52" in the household's time zone. */
export function formatClock(date: Date | null, timeZone: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat(undefined, { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
}

export const PHASE_LABEL: Record<DaylightPhase, { morning: string; evening: string }> = {
  day: { morning: 'Daytime', evening: 'Daytime' },
  golden: { morning: 'Sunrise glow', evening: 'Golden hour' },
  civil: { morning: 'Dawn', evening: 'Dusk' },
  nautical: { morning: 'Blue hour', evening: 'Blue hour' },
  astronomical: { morning: 'First light', evening: 'Last light' },
  night: { morning: 'Night', evening: 'Night' },
};
