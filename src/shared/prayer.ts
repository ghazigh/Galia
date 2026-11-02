// Daily prayer times for the house, computed on the spot (no network, same answer on every device
// and on the server). The method follows the widely used PrayTimes.org calculation: the sun's
// declination and the equation of time from the U.S. Naval Observatory's approximate formulas,
// each time refined twice from the previous estimate. It agrees with published timetables to the
// minute.
//
// Calculation: ISNA (Fajr and Isha at 15° below the horizon), the convention most mosques in
// Québec and North America use; Asr by the standard (Shafi'i, Maliki, Hanbali) shadow length.

import { parseYmd, type Ymd } from './dates';

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type Prayer = (typeof PRAYERS)[number];

export const PRAYER_NAMES: Record<Prayer, string> = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

export interface PrayerMethod {
  /** Sun's depression for Fajr and Isha, degrees. */
  fajr: number;
  isha: number;
  /** Asr shadow factor: 1 standard, 2 Hanafi. */
  asr: 1 | 2;
}

export const ISNA: PrayerMethod = { fajr: 15, isha: 15, asr: 1 };

export interface PrayerTimes {
  date: Ymd;
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const tan = (d: number) => Math.tan(d * RAD);
const asin = (x: number) => Math.asin(x) / RAD;
const acos = (x: number) => Math.acos(Math.max(-1, Math.min(1, x))) / RAD;
const atan2 = (y: number, x: number) => Math.atan2(y, x) / RAD;
const acot = (x: number) => Math.atan(1 / x) / RAD;
const fix = (a: number, b: number) => {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
};

function julian(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** Sun's declination (degrees) and equation of time (hours) at a Julian date. */
function sunPosition(jd: number): { declination: number; equation: number } {
  const d = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * d, 360);
  const q = fix(280.459 + 0.98564736 * d, 360);
  const l = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = fix(atan2(cos(e) * sin(l), cos(l)) / 15, 24);
  return { declination: asin(sin(e) * sin(l)), equation: q / 15 - ra };
}

/**
 * Prayer times for a local calendar day at a place, as instants. `date` is that day in the
 * place's time zone (the computation itself is in UTC, so daylight saving needs no special care).
 */
export function prayerTimes(date: Ymd, lat: number, lng: number, method: PrayerMethod = ISNA): PrayerTimes {
  const { y, m, d } = parseYmd(date);
  const jd = julian(y, m, d) - lng / (15 * 24);
  // Hours of the day (local mean solar time ≈ UTC + lng/15) for each event.
  const noon = (t: number) => fix(12 - sunPosition(jd + t).equation, 24);
  const angleTime = (angle: number, t: number, before: boolean) => {
    const { declination } = sunPosition(jd + t);
    const span = acos((-sin(angle) - sin(declination) * sin(lat)) / (cos(declination) * cos(lat))) / 15;
    return noon(t) + (before ? -span : span);
  };
  const asrTime = (t: number) => {
    const { declination } = sunPosition(jd + t);
    return angleTime(-acot(method.asr + tan(Math.abs(lat - declination))), t, false);
  };
  // First guesses, then two refinements from the previous estimate.
  let times = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let i = 0; i < 2; i += 1) {
    const p = Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v / 24])) as typeof times;
    times = {
      fajr: angleTime(method.fajr, p.fajr, true),
      sunrise: angleTime(0.833, p.sunrise, true),
      dhuhr: noon(p.dhuhr),
      asr: asrTime(p.asr),
      maghrib: angleTime(0.833, p.maghrib, false),
      isha: angleTime(method.isha, p.isha, false),
    };
  }
  // Local mean solar time → UTC, rounded to the nearest minute.
  const midnight = Date.UTC(y, m - 1, d);
  const at = (hours: number) => new Date(Math.round((midnight + (hours - lng / 15) * 3_600_000) / 60_000) * 60_000);
  return {
    date,
    fajr: at(times.fajr),
    sunrise: at(times.sunrise),
    dhuhr: at(times.dhuhr),
    asr: at(times.asr),
    maghrib: at(times.maghrib),
    isha: at(times.isha),
  };
}
