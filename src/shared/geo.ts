import { timeZoneCoordinates } from './timezones';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ApproximateLocation extends GeoPoint {
  /** City the coordinates stand for ("Toronto"), or null for a pure UTC-offset guess. */
  city: string | null;
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityOfTimeZone(timeZone: string): string | null {
  const last = timeZone.split('/').pop();
  if (!last || !timeZone.includes('/') || timeZone.startsWith('Etc/')) return null;
  return last.replace(/_/g, ' ');
}

/** Current UTC offset of a time zone in minutes (east positive). */
export function utcOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(at);
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUtc - Math.floor(at.valueOf() / 60_000) * 60_000) / 60_000);
  } catch {
    return 0;
  }
}

/**
 * Where the household probably is, from its time zone alone: the zone's principal city when known,
 * otherwise a point on the zone's meridian. Good enough for sunrise within a few minutes.
 */
export function approximateLocation(timeZone: string): ApproximateLocation {
  const known = timeZoneCoordinates(timeZone);
  if (known) return { lat: known[0], lng: known[1], city: cityOfTimeZone(timeZone) };
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC' || timeZone === 'GMT') return { lat: 51.48, lng: 0, city: null };
  // Standard time meridian (15° per hour); a mid-northern latitude where most people live.
  const offset = utcOffsetMinutes(timeZone, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
  return { lat: 40, lng: Math.max(-180, Math.min(180, offset / 4)), city: null };
}

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng } = value as Record<string, unknown>;
  return typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
