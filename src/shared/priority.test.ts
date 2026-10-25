import { describe, expect, it } from 'vitest';
import { fitsIn, rankTasks } from './priority';
import { makeTask } from './testing';

const today = '2026-10-22';

describe('rankTasks', () => {
  it('puts overdue fire-safety work ahead of everything else', () => {
    const ranked = rankTasks(
      [
        makeTask({ id: 'call', title: 'Call dentist', quickWin: true }),
        makeTask({ id: 'vent', title: 'Dryer vent', priority: 'critical', risks: ['fire'], dueDate: '2026-10-19' }),
        makeTask({ id: 'filter', title: 'Filter', priority: 'high', dueDate: today }),
        makeTask({ id: 'later', title: 'Later', kind: 'maintenance', dueDate: '2026-12-01' }),
      ],
      { today, userId: 'u1' },
    );
    expect(ranked.map((r) => r.task.id)).toEqual(['vent', 'filter', 'call']);
    expect(ranked[0].reasons.map((r) => r.kind)).toEqual(['overdue', 'fire', 'priority']);
    expect(ranked[0].reasons[0].label).toBe('3 days overdue');
  });

  it('only includes the current user’s work unless asked', () => {
    const tasks = [makeTask({ id: 'mine' }), makeTask({ id: 'theirs', assigneeId: 'u2' })];
    expect(rankTasks(tasks, { today, userId: 'u1' }).map((r) => r.task.id)).toEqual(['mine']);
    expect(rankTasks(tasks, { today, userId: 'u1' }, { includeOthers: true })).toHaveLength(2);
  });

  it('explains who handed you a task', () => {
    const [ranked] = rankTasks(
      [makeTask({ assigneeId: 'u1', assignedById: 'u2' })],
      { today, userId: 'u1', memberName: (id) => (id === 'u2' ? 'Sam' : undefined) },
    );
    expect(ranked.reasons.some((r) => r.label === 'From Sam')).toBe(true);
  });

  it('hides snoozed tasks until the snooze ends', () => {
    const tasks = [makeTask({ dueDate: '2026-10-22', snoozedUntil: '2026-10-25' })];
    expect(rankTasks(tasks, { today, userId: 'u1' })).toHaveLength(0);
    expect(rankTasks(tasks, { today: '2026-10-25', userId: 'u1' })).toHaveLength(1);
  });

  it('filters by available time', () => {
    const tasks = [
      makeTask({ id: 'quick', quickWin: true }),
      makeTask({ id: 'short', estimateMinutes: 15 }),
      makeTask({ id: 'long', estimateMinutes: 90 }),
      makeTask({ id: 'unknown' }),
    ];
    const ids = rankTasks(tasks, { today, userId: 'u1' }, { availableMinutes: 15 }).map(
      (r) => r.task.id,
    );
    expect(ids.sort()).toEqual(['quick', 'short']);
    expect(fitsIn(makeTask({ quickWin: true }), 5)).toBe(false);
  });
});
