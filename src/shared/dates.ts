// Calendar-date helpers. Due dates are plain calendar days in the household's time zone,
// stored as 'YYYY-MM-DD' strings. Keeping them out of `Date` avoids every DST/UTC-offset bug.

export type Ymd = string;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isYmd(value: unknown): value is Ymd {
  if (typeof value !== 'string') return false;
  const match = YMD_RE.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parseYmd(value: Ymd): { y: number; m: number; d: number } {
  const match = YMD_RE.exec(value);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function toYmd(year: number, month: number, day: number): Ymd {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toEpochDay(value: Ymd): number {
  const { y, m, d } = parseYmd(value);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromEpochDay(epochDay: number): Ymd {
  const date = new Date(epochDay * DAY_MS);
  return toYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(value: Ymd, days: number): Ymd {
  return fromEpochDay(toEpochDay(value) + days);
}

/** Adds calendar months, clamping to the end of shorter months (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: Ymd, months: number): Ymd {
  const { y, m, d } = parseYmd(value);
  const { year, month } = shiftMonth(y, m, months);
  return toYmd(year, month, Math.min(d, daysInMonth(year, month)));
}

/** Month arithmetic on (year, 1-based month) pairs. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  return { year: newYear, month: total - newYear * 12 + 1 };
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: Ymd, to: Ymd): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function maxYmd(a: Ymd, b: Ymd): Ymd {
  return a > b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(value: Ymd): number {
  return new Date(toEpochDay(value) * DAY_MS).getUTCDay();
}

export interface ZonedNow {
  date: Ymd;
  /** Minutes since local midnight. */
  minutes: number;
  weekday: number;
}

/** The wall-clock date and time in `timeZone` at instant `now`. */
export function zonedNow(timeZone: string, now: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const date = toYmd(get('year'), get('month'), get('day'));
  return { date, minutes: get('hour') * 60 + get('minute'), weekday: weekday(date) };
}

export function todayIn(timeZone: string, now: Date = new Date()): Ymd {
  return zonedNow(timeZone, now).date;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isHm(value: unknown): value is string {
  return typeof value === 'string' && HM_RE.test(value);
}

/** 'HH:MM' → minutes since midnight. */
export function parseHm(value: string): number {
  const match = HM_RE.exec(value);
  if (!match) throw new Error(`Invalid time of day: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatHm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}
