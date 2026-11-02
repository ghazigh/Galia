import type { Ymd } from '@shared/dates';
import type { PrayerDay } from '@shared/prayer';
import type { Db } from '../db';

/** The mosque's published times for a day, if fetched. */
export function getMosqueDay(db: Db, date: Ymd): { day: PrayerDay; fetchedAt: string } | null {
  const row = db.prepare('SELECT times, fetched_at FROM prayer_times WHERE date = ?').get(date) as { times: string; fetched_at: string } | undefined;
  return row ? { day: JSON.parse(row.times) as PrayerDay, fetchedAt: row.fetched_at } : null;
}

/** The most recent day the mosque's times were fetched for, on or before `date`. */
export function latestMosqueDay(db: Db, date: Ymd): PrayerDay | null {
  const row = db.prepare('SELECT times FROM prayer_times WHERE date <= ? ORDER BY date DESC LIMIT 1').get(date) as { times: string } | undefined;
  return row ? (JSON.parse(row.times) as PrayerDay) : null;
}

export function putMosqueDay(db: Db, day: PrayerDay, fetchedAt: string) {
  db.prepare(
    `INSERT INTO prayer_times (date, times, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET times = excluded.times, fetched_at = excluded.fetched_at`,
  ).run(day.date, JSON.stringify(day), fetchedAt);
  // A year is plenty of history.
  db.prepare("DELETE FROM prayer_times WHERE date < date(?, '-370 days')").run(day.date);
}
