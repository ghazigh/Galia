import { MONTH_SHORT, parseYmd, WEEKDAY_SHORT, weekday, type Ymd } from './dates';
import type { TaskTiming } from './status';

/** "Nov 3", or "Nov 3, 2027" outside the current year. */
export function formatShortDate(date: Ymd, today?: Ymd): string {
  const { y, m, d } = parseYmd(date);
  const sameYear = !today || parseYmd(today).y === y;
  return `${MONTH_SHORT[m - 1]} ${d}${sameYear ? '' : `, ${y}`}`;
}

/** "Mon, Nov 3". */
export function formatDayDate(date: Ymd, today?: Ymd): string {
  return `${WEEKDAY_SHORT[weekday(date)]}, ${formatShortDate(date, today)}`;
}

/** Compact due label for list rows. */
export function dueLabel(timing: TaskTiming, today: Ymd): string {
  const { state, days, effectiveDue } = timing;
  if (state === 'done') return 'Done';
  if (!effectiveDue || days === null) return 'No date';
  if (days < 0) return days === -1 ? '1 day late' : `${-days} days late`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return WEEKDAY_SHORT[weekday(effectiveDue)];
  return formatShortDate(effectiveDue, today);
}

/** Longer sentence for detail views. */
export function dueSentence(timing: TaskTiming, today: Ymd): string {
  const { state, days, effectiveDue, snoozed } = timing;
  if (state === 'done') return 'Completed';
  if (!effectiveDue || days === null) return 'No due date';
  const prefix = snoozed ? 'Snoozed until' : 'Due';
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} overdue (was due ${formatShortDate(effectiveDue, today)})`;
  if (days === 0) return snoozed ? 'Snoozed until today' : 'Due today';
  if (days === 1) return `${prefix} tomorrow`;
  if (days < 7) return `${prefix} ${formatDayDate(effectiveDue, today)} · in ${days} days`;
  return `${prefix} ${formatShortDate(effectiveDue, today)} · in ${days} days`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Turns a free-form contact into an actionable href (tel: for phone numbers). */
export function contactHref(contact: string | null): string | null {
  if (!contact) return null;
  const trimmed = contact.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[+\d][\d\s().-]{5,}$/.test(trimmed)) return `tel:${trimmed.replace(/[^\d+]/g, '')}`;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(trimmed)) return `mailto:${trimmed}`;
  return null;
}
