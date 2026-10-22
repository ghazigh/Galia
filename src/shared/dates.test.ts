import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  formatHm,
  isYmd,
  parseHm,
  weekday,
  zonedNow,
} from './dates';

describe('calendar dates', () => {
  it('validates real calendar dates only', () => {
    expect(isYmd('2026-02-28')).toBe(true);
    expect(isYmd('2028-02-29')).toBe(true);
    expect(isYmd('2026-02-29')).toBe(false);
    expect(isYmd('2026-13-01')).toBe(false);
    expect(isYmd('26-1-1')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('clamps month arithmetic to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-02-10', -3)).toBe('2025-11-10');
  });

  it('counts days between dates regardless of DST', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-11-02', '2026-10-30')).toBe(-3);
  });

  it('knows the weekday', () => {
    expect(weekday('2026-10-22')).toBe(4); // Thursday
  });

  it('reads wall-clock time in a time zone', () => {
    const instant = new Date('2026-10-22T03:30:00Z');
    expect(zonedNow('America/Toronto', instant)).toEqual({
      date: '2026-10-21',
      minutes: 23 * 60 + 30,
      weekday: 3,
    });
    expect(zonedNow('Europe/Paris', instant).date).toBe('2026-10-22');
  });

  it('parses and formats times of day', () => {
    expect(parseHm('07:45')).toBe(465);
    expect(formatHm(465)).toBe('07:45');
    expect(formatHm(-15)).toBe('23:45');
    expect(() => parseHm('7:45')).toThrow();
  });
});
