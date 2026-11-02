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
import { addDays, parseYmd, zonedNow } from '@shared/dates';
import { HOME } from '@shared/home';
import { PRAYERS, prayerTimes, type Prayer, type PrayerTimes } from '@shared/prayer';
import { useMemo, useSyncExternalStore } from 'react';

// ── Clock: one shared ticker, plus an optional "preview" time for scrubbing the sky ─────────────

const TICK_MS = 30_000;
/** Server clock minus device clock: phones can run minutes fast or slow. */
let offset = 0;
let lastSync = 0;
/** The current moment by the server's clock (NTP-synced), not the device's. */
export function clockNow(): number {
  return Date.now() + offset;
}

/** Measures the device clock against the server's, at most every ten minutes. */
async function syncClock() {
  if (typeof fetch === 'undefined' || Date.now() - lastSync < 10 * 60_000) return;
  lastSync = Date.now();
  try {
    const sent = performance.now();
    const res = await fetch('/api/time', { cache: 'no-store', credentials: 'same-origin' });
    const trip = performance.now() - sent;
    const { now: server } = (await res.json()) as { now: number };
    // The server read its clock about halfway through the round trip.
    if (Number.isFinite(server) && trip < 5_000) offset = server - (Date.now() - trip / 2);
    tick();
  } catch {
    lastSync = 0; // offline: try again on the next tick
  }
}

let now = clockNow();
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
  now = clockNow();
  emit();
  void syncClock();
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
  if (preview === null) now = clockNow();
  emit();
}

/** The moment the sky shows: a previewed time, or now in 30-second steps. */
export function useSkyTime(): { at: Date; live: boolean } {
  return useSyncExternalStore(subscribeClock, getSnapshot, getSnapshot);
}

// ── Where and when: always the house, in Montréal time ──────────────────────────────────────

/** Kept for callers; the sky always follows the house's time zone. */
export function setSkyTimeZone(timeZone: string | null) {
  void timeZone;
}

// ── Daylight ──────────────────────────────────────────────────────────────────────────────────

export interface SkyLocation {
  lat: number;
  lng: number;
  /** "Saint-Philippe, QC" */
  label: string;
}

export interface NextPrayer {
  prayer: Prayer;
  at: Date;
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
  /** Today's prayer times at the house, and the next one to come. */
  prayers: PrayerTimes;
  nextPrayer: NextPrayer;
}

const HOME_LOCATION: SkyLocation = { lat: HOME.lat, lng: HOME.lng, label: HOME.label };

export function useSkyLocation(): SkyLocation {
  return HOME_LOCATION;
}

/** The next prayer after `at` (tomorrow's Fajr once Isha has passed). */
export function nextPrayerAfter(at: Date, today: PrayerTimes): NextPrayer {
  for (const prayer of PRAYERS) if (today[prayer] > at) return { prayer, at: today[prayer] };
  return { prayer: 'fajr', at: prayerTimes(addDays(today.date, 1), HOME.lat, HOME.lng).fajr };
}

export function computeDaylight(at: Date, live: boolean, timeZone: string, location: SkyLocation): Daylight {
  const { lat, lng } = location;
  const sun = sunPosition(at, lat, lng);
  const { y, m, d } = parseYmd(zonedNow(timeZone, at).date);
  const today = sunTimes(solarNoonOf(y, m, d, lng), lat, lng);
  const prayers = prayerTimes(zonedNow(timeZone, at).date, HOME.lat, HOME.lng);
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
    prayers,
    nextPrayer: nextPrayerAfter(at, prayers),
  };
}

/** Live sun, moon and prayer times at the house (or a previewed moment), every 30 seconds. */
export function useDaylight(): Daylight {
  const { at, live } = useSkyTime();
  return useMemo(() => computeDaylight(at, live, HOME.timeZone, HOME_LOCATION), [at, live]);
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
