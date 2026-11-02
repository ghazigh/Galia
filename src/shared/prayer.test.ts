import { describe, expect, it } from 'vitest';
import { sunPosition } from './astro';
import { addDays } from './dates';
import { HOME } from './home';
import { prayerTimes } from './prayer';

const DEG = 180 / Math.PI;
const altitude = (at: Date) => sunPosition(at, HOME.lat, HOME.lng).altitude * DEG;
const local = (at: Date) => at.toLocaleTimeString('en-CA', { timeZone: HOME.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

describe('prayer times at the house', () => {
  // Every day of a year, checked against the app's independent sun-position code.
  const days = Array.from({ length: 366 }, (_, i) => addDays('2026-01-01', i));

  it('puts Fajr and Isha where the sun is 15° below the horizon', () => {
    for (const day of days) {
      const t = prayerTimes(day, HOME.lat, HOME.lng);
      expect(Math.abs(altitude(t.fajr) + 15), `${day} fajr`).toBeLessThan(0.3);
      expect(Math.abs(altitude(t.isha) + 15), `${day} isha`).toBeLessThan(0.3);
    }
  });

  it('matches sunrise, solar noon and sunset', () => {
    for (const day of days) {
      const t = prayerTimes(day, HOME.lat, HOME.lng);
      // Sun's upper limb on the horizon, refraction included: geometric altitude −0.833°.
      expect(Math.abs(altitude(t.sunrise) + 0.833), `${day} sunrise`).toBeLessThan(0.3);
      expect(Math.abs(altitude(t.maghrib) + 0.833), `${day} maghrib`).toBeLessThan(0.3);
      // Dhuhr: the sun due south.
      const bearing = sunPosition(t.dhuhr, HOME.lat, HOME.lng).azimuth * DEG;
      expect(Math.abs(bearing - 180), `${day} dhuhr`).toBeLessThan(0.6);
    }
  });

  it('starts Asr when a shadow equals its object plus the noon shadow', () => {
    for (const day of days) {
      const t = prayerTimes(day, HOME.lat, HOME.lng);
      const noonAltitude = altitude(t.dhuhr);
      // Shadow length per unit height = cot(altitude); Asr adds one full length to noon's.
      const target = Math.atan(1 / (1 + 1 / Math.tan(noonAltitude / DEG))) * DEG;
      expect(Math.abs(altitude(t.asr) - target), `${day} asr`).toBeLessThan(0.3);
    }
  });

  it('keeps the five prayers in order, in Montréal time across daylight saving', () => {
    for (const day of days) {
      const t = prayerTimes(day, HOME.lat, HOME.lng);
      const order = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => d.valueOf());
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
    // The day after the clocks went back (Nov 1, 2026).
    const t = prayerTimes('2026-11-02', HOME.lat, HOME.lng);
    expect([t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map(local)).toEqual(['05:11', '06:35', '11:37', '14:15', '16:40', '18:03']);
  });
});
