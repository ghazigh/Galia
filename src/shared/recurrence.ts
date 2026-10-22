import {
  addDays,
  addMonths,
  daysInMonth,
  MONTH_LONG,
  MONTH_SHORT,
  parseYmd,
  shiftMonth,
  toYmd,
  type Ymd,
} from './dates';
import type { Recurrence, RecurrenceUnit } from './types';

export function advance(from: Ymd, every: number, unit: RecurrenceUnit): Ymd {
  switch (unit) {
    case 'day':
      return addDays(from, every);
    case 'week':
      return addDays(from, every * 7);
    case 'month':
      return addMonths(from, every);
    case 'year':
      return addMonths(from, every * 12);
  }
}

/** Rolls a date forward to the 1st of the next active month when it falls outside the season. */
export function clampToActiveMonths(date: Ymd, activeMonths?: readonly number[]): Ymd {
  if (!activeMonths || activeMonths.length === 0 || activeMonths.length >= 12) return date;
  const { y, m } = parseYmd(date);
  if (activeMonths.includes(m)) return date;
  for (let step = 1; step <= 12; step++) {
    const next = shiftMonth(y, m, step);
    if (activeMonths.includes(next.month)) return toYmd(next.year, next.month, 1);
  }
  return date;
}

/** First date strictly after `after` that falls on `day` of one of `months`. */
export function nextMonthsDate(after: Ymd, months: readonly number[], day = 1): Ymd {
  if (months.length === 0) throw new Error('A months recurrence needs at least one month');
  const { y, m } = parseYmd(after);
  for (let step = 0; step <= 24; step++) {
    const { year, month } = shiftMonth(y, m, step);
    if (!months.includes(month)) continue;
    const candidate = toYmd(year, month, Math.min(day, daysInMonth(year, month)));
    if (candidate > after) return candidate;
  }
  throw new Error('No matching month found');
}

/**
 * Next due date once a recurring task is completed.
 * Interval rules restart from the completion date ("resetting the recurrence clock").
 * Fixed-month rules count an early completion toward the occurrence that was coming up.
 */
export function nextDueAfterCompletion(
  rule: Recurrence,
  completedOn: Ymd,
  currentDue: Ymd | null,
): Ymd {
  if (rule.kind === 'interval') {
    return clampToActiveMonths(advance(completedOn, rule.every, rule.unit), rule.activeMonths);
  }
  const anchor = currentDue && currentDue > completedOn ? currentDue : completedOn;
  return nextMonthsDate(anchor, rule.months, rule.day);
}

/** Due date for a newly created recurring task when no explicit date was chosen. */
export function initialDueDate(rule: Recurrence, today: Ymd, firstDueInDays?: number): Ymd {
  if (firstDueInDays !== undefined) {
    const date = addDays(today, firstDueInDays);
    return rule.kind === 'interval' ? clampToActiveMonths(date, rule.activeMonths) : date;
  }
  if (rule.kind === 'interval') return clampToActiveMonths(today, rule.activeMonths);
  return nextMonthsDate(addDays(today, -1), rule.months, rule.day);
}

/** Approximate length of one cycle in days (used to scale reminder lead times). */
export function cycleDays(rule: Recurrence): number {
  if (rule.kind === 'interval') {
    const unitDays = { day: 1, week: 7, month: 30, year: 365 }[rule.unit];
    return rule.every * unitDays;
  }
  return Math.round(365 / Math.max(1, rule.months.length));
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} & ${words[words.length - 1]}`;
}

function describeMonths(months: readonly number[]): string {
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted.every((month, i) => i === 0 || month === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) {
    return `${MONTH_SHORT[sorted[0] - 1]}–${MONTH_SHORT[sorted[sorted.length - 1] - 1]}`;
  }
  return joinWords(sorted.map((month) => MONTH_SHORT[month - 1]));
}

/** Human summary: "Every 3 months", "Weekly · May–Oct", "Every April & October". */
export function describeRecurrence(rule: Recurrence | null): string {
  if (!rule) return 'One-time';
  if (rule.kind === 'months') {
    const sorted = [...rule.months].sort((a, b) => a - b);
    if (sorted.length <= 2) return `Every ${joinWords(sorted.map((m) => MONTH_LONG[m - 1]))}`;
    return `Every ${joinWords(sorted.map((m) => MONTH_SHORT[m - 1]))}`;
  }
  const { every, unit } = rule;
  const singular: Record<RecurrenceUnit, string> = {
    day: 'Daily',
    week: 'Weekly',
    month: 'Monthly',
    year: 'Yearly',
  };
  let text = every === 1 ? singular[unit] : `Every ${every} ${unit}s`;
  if (unit === 'week' && every === 2) text = 'Every 2 weeks';
  if (rule.activeMonths && rule.activeMonths.length > 0 && rule.activeMonths.length < 12) {
    text += ` · ${describeMonths(rule.activeMonths)}`;
  }
  return text;
}
