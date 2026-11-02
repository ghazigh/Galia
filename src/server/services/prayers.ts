import { addDays, todayIn, type Ymd } from '@shared/dates';
import { utcOffsetMinutes } from '@shared/geo';
import { HOME } from '@shared/home';
import { adjustedTimes, prayerTimes, toPrayerDay, toPrayerTimes, type PrayerDay, type PrayerTimes } from '@shared/prayer';
import type { AppContext } from '../context';
import { getMosqueDay, latestMosqueDay, putMosqueDay } from '../repos/prayers';

// Adhan times come from the mosque (ICC Brossard publishes today's timetable as JSON — the same
// feed its website shows). The server fetches it each day and stores it; notifications and the
// app use it. Only if the feed can't be reached does a day fall back to the calculation, nudged by
// the mosque's most recent offsets.

/** Names in the feed → our keys. Jumu'ah entries (Jumma1, Jumma2) are ignored: Friday uses Dhuhr. */
const FEED_NAMES: Record<string, keyof Omit<PrayerTimes, 'date'>> = {
  fajr: 'fajr',
  sunrise: 'sunrise',
  dhuhr: 'dhuhr',
  asr: 'asr',
  maghrib: 'maghrib',
  isha: 'isha',
};

/** Retry a failed fetch this often; refresh a stored day this often (the mosque may correct it). */
const RETRY_MS = 5 * 60_000;
const REFRESH_MS = 6 * 60 * 60_000;
/** Feed times further than this from the calculation are treated as a broken feed. */
const SANITY_MS = 90 * 60_000;

/** "5:10 AM" → minutes after midnight. */
function parseClock(value: string): number | null {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AP])\.?M\.?\s*$/i.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  return ((hours % 12) + (match[3].toUpperCase() === 'P' ? 12 : 0)) * 60 + minutes;
}

/** A wall-clock time on a date in the house's time zone, as an instant. */
function houseInstant(date: Ymd, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = utcOffsetMinutes(HOME.timeZone, new Date(wall + 5 * 3_600_000));
  return new Date(wall - offset * 60_000);
}

/**
 * Reads the mosque's feed: today's adhan times (not iqama). Returns null unless the feed is for
 * `expected` and every prayer is present, in order and close to the calculation.
 */
export function parseMosqueFeed(json: unknown, expected: Ymd): PrayerTimes | null {
  if (!json || typeof json !== 'object') return null;
  const feed = json as { PrayerDate?: unknown; prayers?: unknown };
  const date = typeof feed.PrayerDate === 'string' ? feed.PrayerDate.slice(0, 10) : '';
  if (date !== expected || !Array.isArray(feed.prayers)) return null;
  const found: Partial<PrayerTimes> = { date };
  for (const entry of feed.prayers as { PrayerName?: unknown; Time?: unknown }[]) {
    const key = typeof entry?.PrayerName === 'string' ? FEED_NAMES[entry.PrayerName.trim().toLowerCase()] : undefined;
    if (!key || typeof entry.Time !== 'string') continue;
    const minutes = parseClock(entry.Time);
    if (minutes === null) return null;
    found[key] = houseInstant(date, minutes);
  }
  const keys = Object.values(FEED_NAMES);
  if (!keys.every((key) => found[key] instanceof Date)) return null;
  const times = found as PrayerTimes;
  const calculated = prayerTimes(date, HOME.lat, HOME.lng);
  for (let i = 0; i < keys.length; i += 1) {
    if (i > 0 && times[keys[i]] <= times[keys[i - 1]]) return null;
    if (Math.abs(times[keys[i]].getTime() - calculated[keys[i]].getTime()) > SANITY_MS) return null;
  }
  return times;
}

const lastAttempt = new WeakMap<AppContext, number>();

/** Makes sure today's mosque times are stored (fetching when missing or stale). Never throws. */
export async function refreshMosqueTimes(ctx: AppContext): Promise<'fresh' | 'fetched' | 'unavailable'> {
  const url = ctx.config.mosquePrayerUrl;
  const now = ctx.now();
  const today = todayIn(HOME.timeZone, now);
  const stored = getMosqueDay(ctx.db, today);
  if (stored && now.getTime() - Date.parse(stored.fetchedAt) < REFRESH_MS) return 'fresh';
  if (!url) return stored ? 'fresh' : 'unavailable';
  if (now.getTime() - (lastAttempt.get(ctx) ?? 0) < RETRY_MS) return stored ? 'fresh' : 'unavailable';
  lastAttempt.set(ctx, now.getTime());
  try {
    const res = await (ctx.fetch ?? fetch)(url, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const times = parseMosqueFeed(await res.json(), today);
    if (!times) throw new Error('unexpected feed (wrong day or format)');
    putMosqueDay(ctx.db, toPrayerDay(times, 'mosque'), now.toISOString());
    return 'fetched';
  } catch (err) {
    console.warn('[prayers] could not read the mosque timetable; using the calculation for now', err);
    return stored ? 'fresh' : 'unavailable';
  }
}

/** A day's adhan times: the mosque's when stored, else the calculation nudged by its latest offsets. */
export function prayerDay(ctx: AppContext, date: Ymd): PrayerDay {
  const stored = getMosqueDay(ctx.db, date);
  if (stored) return stored.day;
  const reference = latestMosqueDay(ctx.db, date);
  const recent = reference && reference.date >= addDays(date, -14) ? toPrayerTimes(reference) : null;
  return toPrayerDay(adjustedTimes(date, HOME.lat, HOME.lng, recent), 'calculated');
}
