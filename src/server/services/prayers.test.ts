import { HOME } from '@shared/home';
import { describe, expect, it } from 'vitest';
import feed from './fixtures/icc-brossard-2026-11-01.json';
import { parseMosqueFeed } from './prayers';

const local = (at: Date) => at.toLocaleTimeString('en-CA', { timeZone: HOME.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

describe('the mosque timetable (ICC Brossard)', () => {
  it('reads the adhan times, not the iqama, and skips Jumu’ah', () => {
    const times = parseMosqueFeed(feed, '2026-11-01');
    expect(times).not.toBeNull();
    const t = times!;
    expect([t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map(local)).toEqual(['05:10', '06:33', '11:37', '14:17', '16:43', '18:04']);
    // Montréal is on EST (UTC−5) that day.
    expect(t.fajr.toISOString()).toBe('2026-11-01T10:10:00.000Z');
  });

  it('uses Dhuhr on Fridays, whatever the Jumu’ah entries say', () => {
    const friday = { ...feed, PrayerDate: '2026-11-06T00:00:00' };
    expect(local(parseMosqueFeed(friday, '2026-11-06')!.dhuhr)).toBe('11:37');
  });

  it('refuses a feed for another day, a missing prayer or garbage', () => {
    expect(parseMosqueFeed(feed, '2026-11-02')).toBeNull();
    expect(parseMosqueFeed({ ...feed, prayers: feed.prayers.filter((p) => p.PrayerName !== 'Asr') }, '2026-11-01')).toBeNull();
    const broken = { ...feed, prayers: feed.prayers.map((p) => (p.PrayerName === 'Isha' ? { ...p, Time: '6:04 AM' } : p)) };
    expect(parseMosqueFeed(broken, '2026-11-01')).toBeNull();
    expect(parseMosqueFeed('<html>', '2026-11-01')).toBeNull();
  });
});
