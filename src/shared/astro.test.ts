import { describe, expect, it } from 'vitest';
import {
  DEG,
  daylightPhase,
  moonIllumination,
  moonPhaseName,
  moonPosition,
  nextSunEvent,
  solarNoonOf,
  sunPosition,
  sunTimes,
} from './astro';
import { approximateLocation, cityOfTimeZone, utcOffsetMinutes } from './geo';

const TORONTO = { lat: 43.65, lng: -79.38 };

/** Wall-clock HH:MM of an instant in a time zone. */
function clock(date: Date | null, timeZone = 'America/Toronto'): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function minutesApart(a: string | null, b: string): number {
  if (!a) return Infinity;
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  return Math.abs(toMin(a) - toMin(b));
}

describe('sun', () => {
  it('matches the SunCalc reference position', () => {
    // SunCalc's own test case, with its south-based azimuth turned into a compass bearing.
    const position = sunPosition(new Date('2013-03-05T00:00:00Z'), 50.5, 30.5);
    expect(position.altitude).toBeCloseTo(-0.7000406838781611, 10);
    expect(position.azimuth).toBeCloseTo(-2.5003175907168385 + Math.PI, 10);
  });

  it('stands overhead at the equator at an equinox noon and below the horizon at midnight', () => {
    const noon = sunPosition(new Date('2026-03-20T12:07:00Z'), 0, 0);
    expect(noon.altitude / DEG).toBeGreaterThan(88);
    const midnight = sunPosition(new Date('2026-03-20T00:07:00Z'), 0, 0);
    expect(midnight.altitude / DEG).toBeLessThan(-88);
  });

  it('rises in the east and sets in the west', () => {
    const times = sunTimes(solarNoonOf(2026, 9, 23, TORONTO.lng), TORONTO.lat, TORONTO.lng);
    const rise = sunPosition(times.sunrise!, TORONTO.lat, TORONTO.lng);
    const set = sunPosition(times.sunset!, TORONTO.lat, TORONTO.lng);
    expect(rise.azimuth / DEG).toBeGreaterThan(80);
    expect(rise.azimuth / DEG).toBeLessThan(100);
    expect(set.azimuth / DEG).toBeGreaterThan(260);
    expect(set.azimuth / DEG).toBeLessThan(280);
  });

  it('gives Toronto its published sunrise and sunset times', () => {
    const summer = sunTimes(solarNoonOf(2026, 6, 21, TORONTO.lng), TORONTO.lat, TORONTO.lng);
    expect(minutesApart(clock(summer.sunrise), '05:36')).toBeLessThanOrEqual(2);
    expect(minutesApart(clock(summer.sunset), '21:03')).toBeLessThanOrEqual(2);
    const winter = sunTimes(solarNoonOf(2026, 12, 21, TORONTO.lng), TORONTO.lat, TORONTO.lng);
    expect(minutesApart(clock(winter.sunrise), '07:48')).toBeLessThanOrEqual(2);
    expect(minutesApart(clock(winter.sunset), '16:44')).toBeLessThanOrEqual(2);
    // Twilight brackets the day in order.
    expect(winter.nightEnd! < winter.nauticalDawn! && winter.nauticalDawn! < winter.dawn!).toBe(true);
    expect(winter.dawn! < winter.sunrise! && winter.sunset! < winter.dusk!).toBe(true);
    expect(winter.goldenHour! < winter.sunset!).toBe(true);
  });

  it('reports polar day and night as missing events', () => {
    const midsummer = sunTimes(new Date('2026-06-21T12:00:00Z'), 78.2, 15.6); // Svalbard
    expect(midsummer.sunrise).toBeNull();
    expect(midsummer.sunset).toBeNull();
    expect(midsummer.solarNoon).toBeInstanceOf(Date);
    expect(nextSunEvent(new Date('2026-06-21T12:00:00Z'), 78.2, 15.6)).toBeNull();
  });

  it('finds the next sunrise or sunset', () => {
    const afternoon = new Date('2026-11-01T19:00:00Z'); // 14:00 in Toronto
    expect(nextSunEvent(afternoon, TORONTO.lat, TORONTO.lng)?.kind).toBe('sunset');
    const lateEvening = new Date('2026-11-02T03:00:00Z'); // 22:00 in Toronto
    const next = nextSunEvent(lateEvening, TORONTO.lat, TORONTO.lng);
    expect(next?.kind).toBe('sunrise');
    expect(clock(next!.at)).toMatch(/^06:5\d$/);
  });

  it('names the twilight bands by sun altitude', () => {
    expect(daylightPhase(30 * DEG)).toBe('day');
    expect(daylightPhase(3 * DEG)).toBe('golden');
    expect(daylightPhase(-3 * DEG)).toBe('civil');
    expect(daylightPhase(-9 * DEG)).toBe('nautical');
    expect(daylightPhase(-15 * DEG)).toBe('astronomical');
    expect(daylightPhase(-40 * DEG)).toBe('night');
  });
});

describe('moon', () => {
  it('is new during the April 2024 eclipse and full two weeks later', () => {
    const eclipse = moonIllumination(new Date('2024-04-08T18:21:00Z'));
    expect(eclipse.fraction).toBeLessThan(0.01);
    expect(moonPhaseName(eclipse.phase)).toBe('New moon');
    const full = moonIllumination(new Date('2024-04-23T23:49:00Z'));
    expect(full.fraction).toBeGreaterThan(0.99);
    expect(moonPhaseName(full.phase)).toBe('Full moon');
  });

  it('names every phase around the cycle', () => {
    expect(moonPhaseName(0)).toBe('New moon');
    expect(moonPhaseName(0.12)).toBe('Waxing crescent');
    expect(moonPhaseName(0.25)).toBe('First quarter');
    expect(moonPhaseName(0.37)).toBe('Waxing gibbous');
    expect(moonPhaseName(0.5)).toBe('Full moon');
    expect(moonPhaseName(0.62)).toBe('Waning gibbous');
    expect(moonPhaseName(0.75)).toBe('Last quarter');
    expect(moonPhaseName(0.88)).toBe('Waning crescent');
    expect(moonPhaseName(0.995)).toBe('New moon');
  });

  it('has a sensible position and distance', () => {
    const moon = moonPosition(new Date('2026-11-01T12:00:00Z'), TORONTO.lat, TORONTO.lng);
    expect(moon.distance).toBeGreaterThan(356_000);
    expect(moon.distance).toBeLessThan(407_000);
    expect(Math.abs(moon.altitude)).toBeLessThanOrEqual(Math.PI / 2);
    expect(moon.azimuth).toBeGreaterThanOrEqual(0);
    expect(moon.azimuth).toBeLessThan(2 * Math.PI);
  });
});

describe('location from time zone', () => {
  it('places known zones at their principal city, including legacy aliases', () => {
    expect(approximateLocation('America/Toronto')).toMatchObject({ lat: 43.65, lng: -79.38, city: 'Toronto' });
    expect(approximateLocation('Asia/Calcutta').city).toBe('Calcutta');
    expect(approximateLocation('Asia/Kolkata').lat).toBeCloseTo(22.53, 1);
    expect(approximateLocation('Australia/Sydney').lat).toBeLessThan(-30);
  });

  it('falls back to the zone meridian', () => {
    expect(approximateLocation('UTC')).toMatchObject({ lng: 0, city: null });
    const guess = approximateLocation('Etc/GMT+5');
    expect(guess.lng).toBe(-75);
    expect(guess.city).toBeNull();
  });

  it('reads city names and offsets', () => {
    expect(cityOfTimeZone('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(cityOfTimeZone('UTC')).toBeNull();
    expect(utcOffsetMinutes('America/Toronto', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(utcOffsetMinutes('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBe(330);
  });
});
