import { describe, expect, it } from 'vitest';
import { HOME } from './home';
import { prayerTimes } from './prayer';
import { planAssignment, planPrayers, planReminders, type PlannerUser } from './reminders';
import { makeTask } from './testing';
import { DEFAULT_NOTIFICATION_PREFS } from './types';

const tz = 'America/Toronto';
// Task reminders are tested on their own; prayer pushes have their own suite below.
const user: PlannerUser = { id: 'u1', name: 'Ghazi', prefs: { ...DEFAULT_NOTIFICATION_PREFS, prayers: { enabled: false, dhuhrReminder: false } } };
// 2026-10-22 is a Thursday. Toronto is UTC−4 in October.
const at = (localTime: string, date = '2026-10-22') => new Date(`${date}T${localTime}:00-04:00`);

describe('planReminders', () => {
  const tasks = [
    makeTask({ id: 'vent', title: 'Clean the dryer vent', priority: 'critical', risks: ['fire'], dueDate: '2026-10-21' }),
    makeTask({ id: 'filter', title: 'Check filter', dueDate: '2026-10-22' }),
    makeTask({ id: 'far', title: 'Far away', dueDate: '2026-12-22' }),
    makeTask({ id: 'call', title: 'Call dentist', quickWin: true }),
    makeTask({ id: 'theirs', title: 'Not mine', dueDate: '2026-10-20', assigneeId: 'u2' }),
  ];

  it('sends the morning digest within its window, listing urgent work first', () => {
    const [digest] = planReminders({ now: at('07:50'), timeZone: tz, users: [user], tasks });
    expect(digest).toMatchObject({
      kind: 'digest',
      key: 'digest:2026-10-22',
      title: '1 overdue · 1 due today',
      url: '/focus',
    });
    expect(digest.body).toBe('Clean the dryer vent (overdue) · Check filter (today)');
  });

  it('stays quiet outside every window', () => {
    expect(planReminders({ now: at('15:00'), timeZone: tz, users: [user], tasks })).toEqual([]);
  });

  it('nags about overdue safety items on day 1, 4, 7 …', () => {
    const plan = (date: string) =>
      planReminders({ now: at('18:35', date), timeZone: tz, users: [user], tasks }).filter(
        (n) => n.kind === 'safety',
      );
    expect(plan('2026-10-22')).toHaveLength(1); // 1 day late
    expect(plan('2026-10-23')).toHaveLength(0);
    expect(plan('2026-10-25')).toHaveLength(1); // 4 days late
    const [alert] = plan('2026-10-22');
    expect(alert).toMatchObject({ title: 'Fire-safety task overdue', url: '/task/vent' });
  });

  it('surfaces quick wins during a free window', () => {
    const quick = planReminders({ now: at('12:20'), timeZone: tz, users: [user], tasks });
    expect(quick).toHaveLength(1);
    expect(quick[0]).toMatchObject({ kind: 'quick-wins', key: 'quick:2026-10-22:lunch' });
    expect(quick[0].body).toBe('Call dentist');
    // Lunch window is weekdays only: Saturday has no lunch reminder.
    expect(planReminders({ now: at('12:20', '2026-10-24'), timeZone: tz, users: [user], tasks })).toEqual([]);
  });

  it('respects disabled reminder types', () => {
    const muted: PlannerUser = {
      ...user,
      prefs: { ...DEFAULT_NOTIFICATION_PREFS, digest: { enabled: false, time: '07:45' } },
    };
    expect(planReminders({ now: at('07:50'), timeZone: tz, users: [muted], tasks })).toEqual([]);
  });
});

describe('assignment pushes', () => {
  it('go out immediately during the day', () => {
    const now = at('14:00');
    const planned = planAssignment({
      task: { id: 't1', title: 'Book car service' },
      assignee: user,
      assignerName: 'Sam',
      now,
    });
    expect(planned).toMatchObject({
      title: 'Sam assigned you a task',
      body: 'Book car service',
      deliverAfter: now.toISOString(),
    });
  });
});

describe('prayer notifications', () => {
  const ghazi: PlannerUser = { id: 'u1', name: 'Ghazi', prefs: DEFAULT_NOTIFICATION_PREFS };
  const times = prayerTimes('2026-11-02', HOME.lat, HOME.lng);
  const minute = (at: Date, delta: number) => new Date(at.getTime() + delta * 60_000);

  it('sends each prayer on its minute, in Montréal time', () => {
    const [asr] = planPrayers(ghazi, times.asr, HOME.timeZone);
    expect(asr).toMatchObject({ kind: 'prayer', key: 'prayer:2026-11-02:asr', title: '🕌 Asr', body: "It's time for Asr · 2:15 PM" });
    for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const) {
      const keys = planPrayers(ghazi, minute(times[prayer], 1), HOME.timeZone).map((n) => n.key);
      expect(keys).toContain(`prayer:2026-11-02:${prayer}`);
    }
  });

  it('reminds about Dhuhr 15 minutes before Asr', () => {
    const plan = planPrayers(ghazi, minute(times.asr, -15), HOME.timeZone);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ key: 'prayer:2026-11-02:dhuhr-reminder', title: '⏳ Dhuhr ends in 15 min' });
    expect(plan[0].body).toContain('2:15 PM');
  });

  it('runs inside planReminders, every minute, without repeating or going stale', () => {
    const keys = new Set<string>();
    for (let t = new Date('2026-11-02T05:00:00Z'); t < new Date('2026-11-03T05:00:00Z'); t = minute(t, 1)) {
      for (const n of planReminders({ now: t, timeZone: HOME.timeZone, users: [ghazi], tasks: [] })) {
        if (n.kind === 'prayer') keys.add(n.key);
      }
    }
    expect([...keys].sort()).toEqual(
      ['asr', 'dhuhr', 'dhuhr-reminder', 'fajr', 'isha', 'maghrib'].map((k) => `prayer:2026-11-02:${k}`).sort(),
    );
    expect(planPrayers(ghazi, minute(times.isha, 11), HOME.timeZone)).toEqual([]);
  });

  it('respects the switches', () => {
    const off = { ...ghazi, prefs: { ...ghazi.prefs, prayers: { enabled: false, dhuhrReminder: true } } };
    expect(planPrayers(off, times.asr, HOME.timeZone)).toEqual([]);
    const noReminder = { ...ghazi, prefs: { ...ghazi.prefs, prayers: { enabled: true, dhuhrReminder: false } } };
    expect(planPrayers(noReminder, minute(times.asr, -15), HOME.timeZone)).toEqual([]);
  });
});
