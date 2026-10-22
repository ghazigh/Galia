import { describe, expect, it } from 'vitest';
import type { Recurrence } from './types';
import {
  clampToActiveMonths,
  describeRecurrence,
  initialDueDate,
  nextDueAfterCompletion,
  nextMonthsDate,
} from './recurrence';

describe('interval recurrence', () => {
  it('restarts the clock from the completion date', () => {
    const yearly: Recurrence = { kind: 'interval', every: 1, unit: 'year' };
    expect(nextDueAfterCompletion(yearly, '2026-11-05', '2026-11-01')).toBe('2027-11-05');
    // Completing early also resets from the completion day.
    expect(nextDueAfterCompletion(yearly, '2026-10-01', '2026-11-01')).toBe('2027-10-01');
  });

  it('handles weeks and months', () => {
    expect(
      nextDueAfterCompletion({ kind: 'interval', every: 2, unit: 'week' }, '2026-10-22', null),
    ).toBe('2026-11-05');
    expect(
      nextDueAfterCompletion({ kind: 'interval', every: 3, unit: 'month' }, '2026-11-30', null),
    ).toBe('2027-02-28');
  });

  it('rolls out-of-season occurrences to the next active month', () => {
    const mowing: Recurrence = {
      kind: 'interval',
      every: 1,
      unit: 'week',
      activeMonths: [5, 6, 7, 8, 9, 10],
    };
    expect(nextDueAfterCompletion(mowing, '2026-10-20', null)).toBe('2026-10-27');
    expect(nextDueAfterCompletion(mowing, '2026-10-28', null)).toBe('2027-05-01');
    expect(clampToActiveMonths('2026-12-15', [5, 6])).toBe('2027-05-01');
    expect(clampToActiveMonths('2026-05-15', [5, 6])).toBe('2026-05-15');
  });
});

describe('fixed-month recurrence', () => {
  const tuneUp: Recurrence = { kind: 'months', months: [4, 10] };

  it('finds the next listed month strictly after a date', () => {
    expect(nextMonthsDate('2026-10-22', [4, 10])).toBe('2027-04-01');
    expect(nextMonthsDate('2026-03-31', [4, 10])).toBe('2026-04-01');
    expect(nextMonthsDate('2026-04-01', [4, 10])).toBe('2026-10-01');
    expect(nextMonthsDate('2026-01-10', [2], 31)).toBe('2026-02-28');
  });

  it('counts an early completion toward the upcoming occurrence', () => {
    expect(nextDueAfterCompletion(tuneUp, '2027-03-15', '2027-04-01')).toBe('2027-10-01');
  });

  it('schedules from the completion when done late', () => {
    expect(nextDueAfterCompletion(tuneUp, '2027-04-20', '2027-04-01')).toBe('2027-10-01');
    expect(nextDueAfterCompletion(tuneUp, '2027-11-02', '2027-10-01')).toBe('2028-04-01');
  });
});

describe('initial due dates', () => {
  it('honors an explicit first-due offset', () => {
    expect(
      initialDueDate({ kind: 'interval', every: 1, unit: 'year' }, '2026-10-22', 10),
    ).toBe('2026-11-01');
    expect(initialDueDate({ kind: 'months', months: [4, 10] }, '2026-10-22', 14)).toBe(
      '2026-11-05',
    );
  });

  it('derives fixed-month dates, including today when it matches', () => {
    expect(initialDueDate({ kind: 'months', months: [4, 6, 9, 11] }, '2026-10-22')).toBe(
      '2026-11-01',
    );
    expect(initialDueDate({ kind: 'months', months: [11] }, '2026-11-01')).toBe('2026-11-01');
  });
});

describe('describeRecurrence', () => {
  it('reads naturally', () => {
    expect(describeRecurrence(null)).toBe('One-time');
    expect(describeRecurrence({ kind: 'interval', every: 1, unit: 'month' })).toBe('Monthly');
    expect(describeRecurrence({ kind: 'interval', every: 3, unit: 'month' })).toBe(
      'Every 3 months',
    );
    expect(describeRecurrence({ kind: 'interval', every: 2, unit: 'week' })).toBe('Every 2 weeks');
    expect(
      describeRecurrence({
        kind: 'interval',
        every: 1,
        unit: 'week',
        activeMonths: [5, 6, 7, 8, 9, 10],
      }),
    ).toBe('Weekly · May–Oct');
    expect(describeRecurrence({ kind: 'months', months: [10, 4] })).toBe(
      'Every April & October',
    );
    expect(describeRecurrence({ kind: 'months', months: [4, 6, 9, 11] })).toBe(
      'Every Apr, Jun, Sep & Nov',
    );
  });
});
