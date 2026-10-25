import { describe, expect, it } from 'vitest';
import { canView, houseHealth, isMine, leadDays, summarizeZones, taskTiming } from './status';
import { makeTask } from './testing';

const today = '2026-10-22';

describe('taskTiming', () => {
  it('classifies due dates relative to today', () => {
    expect(taskTiming(makeTask({ dueDate: '2026-10-20' }), today)).toMatchObject({
      state: 'overdue',
      days: -2,
    });
    expect(taskTiming(makeTask({ dueDate: today }), today).state).toBe('today');
    expect(taskTiming(makeTask({ dueDate: '2026-10-24' }), today).state).toBe('soon');
    expect(taskTiming(makeTask({ dueDate: '2026-11-24' }), today).state).toBe('upcoming');
    expect(taskTiming(makeTask(), today).state).toBe('unscheduled');
    expect(taskTiming(makeTask({ completedAt: '2026-10-21T10:00:00Z' }), today).state).toBe(
      'done',
    );
  });

  it('applies snoozes on top of the due date', () => {
    const timing = taskTiming(
      makeTask({ dueDate: '2026-10-20', snoozedUntil: '2026-10-29' }),
      today,
    );
    expect(timing).toMatchObject({ state: 'upcoming', effectiveDue: '2026-10-29', snoozed: true });
  });

  it('keeps lead time short for frequent chores', () => {
    expect(leadDays(makeTask({ priority: 'critical' }))).toBe(3);
    expect(
      leadDays(
        makeTask({ priority: 'critical', recurrence: { kind: 'interval', every: 1, unit: 'week' } }),
      ),
    ).toBe(1);
    expect(leadDays(makeTask({ remindDaysBefore: 10 }))).toBe(10);
  });
});

describe('visibility', () => {
  const personal = makeTask({ visibility: 'personal', ownerId: 'u1' });
  it('hides personal tasks from the other member', () => {
    expect(canView(personal, 'u1')).toBe(true);
    expect(canView(personal, 'u2')).toBe(false);
    expect(canView({ ...personal, assigneeId: 'u2' }, 'u2')).toBe(true);
  });

  it('routes shared tasks by assignee', () => {
    const shared = makeTask({ assigneeId: 'u2' });
    expect(isMine(shared, 'u1')).toBe(false);
    expect(isMine(shared, 'u2')).toBe(true);
    expect(isMine(makeTask(), 'u1')).toBe(true);
  });
});

describe('zones and house health', () => {
  const tasks = [
    makeTask({
      kind: 'maintenance',
      zoneId: 'mechanical',
      dueDate: '2026-10-10',
      priority: 'critical',
      risks: ['fire'],
    }),
    makeTask({ kind: 'maintenance', zoneId: 'mechanical', dueDate: '2026-11-30' }),
    makeTask({ kind: 'maintenance', zoneId: 'kitchen', dueDate: '2026-10-23' }),
    makeTask({ kind: 'maintenance', zoneId: 'garage', dueDate: '2027-01-01' }),
  ];

  it('rolls tasks up into a worst-first zone health', () => {
    const zones = summarizeZones(tasks, today);
    expect(zones.mechanical).toMatchObject({ open: 2, overdue: 1, health: 'overdue', fireOverdue: true });
    expect(zones.kitchen.health).toBe('soon');
    expect(zones.garage.health).toBe('ok');
    expect(zones.bathroom.health).toBe('empty');
  });

  it('penalizes overdue safety items the most', () => {
    const health = houseHealth(tasks, today);
    expect(health.overdue).toBe(1);
    expect(health.score).toBe(100 - (18 + 1 + 6));
    expect(houseHealth([], today)).toMatchObject({ score: 100, label: 'Great shape' });
  });
});
