import { diffDays, type Ymd } from './dates';
import { cycleDays } from './recurrence';
import type { Priority, Task, ZoneId } from './types';
import { ZONE_IDS } from './zones';

export type DueState = 'overdue' | 'today' | 'soon' | 'upcoming' | 'unscheduled' | 'done';

export interface TaskTiming {
  state: DueState;
  /** Due date after applying any snooze. */
  effectiveDue: Ymd | null;
  /** Days until due (negative when overdue); null when unscheduled. */
  days: number | null;
  snoozed: boolean;
}

const LEAD_BY_PRIORITY: Record<Priority, number> = { critical: 3, high: 3, normal: 2, low: 1 };

/** How many days ahead a task counts as "coming up" (and gets mentioned in reminders). */
export function leadDays(task: Pick<Task, 'priority' | 'remindDaysBefore' | 'recurrence'>): number {
  if (task.remindDaysBefore !== null && task.remindDaysBefore !== undefined) {
    return task.remindDaysBefore;
  }
  const base = LEAD_BY_PRIORITY[task.priority];
  if (!task.recurrence) return base;
  // A weekly chore should not spend half its life "coming up".
  return Math.min(base, Math.max(0, Math.floor(cycleDays(task.recurrence) / 5)));
}

export function isOpen(task: Pick<Task, 'completedAt'>): boolean {
  return task.completedAt === null;
}

export function taskTiming(task: Task, today: Ymd): TaskTiming {
  const snoozed = task.snoozedUntil !== null && task.snoozedUntil > today;
  if (task.completedAt) {
    return { state: 'done', effectiveDue: task.dueDate, days: null, snoozed: false };
  }
  const effectiveDue =
    task.snoozedUntil && (!task.dueDate || task.snoozedUntil > task.dueDate)
      ? task.snoozedUntil
      : task.dueDate;
  if (!effectiveDue) return { state: 'unscheduled', effectiveDue: null, days: null, snoozed };
  const days = diffDays(today, effectiveDue);
  let state: DueState;
  if (days < 0) state = 'overdue';
  else if (days === 0) state = 'today';
  else if (days <= leadDays(task)) state = 'soon';
  else state = 'upcoming';
  return { state, effectiveDue, days, snoozed };
}

/** Whether `userId` may see the task: everything shared, plus their own and assigned personal items. */
export function canView(
  task: Pick<Task, 'visibility' | 'ownerId' | 'assigneeId'>,
  userId: string,
): boolean {
  return task.visibility === 'shared' || task.ownerId === userId || task.assigneeId === userId;
}

/** Tasks that are this user's to act on: assigned to them, or shared and unassigned, or personal. */
export function isMine(
  task: Pick<Task, 'visibility' | 'ownerId' | 'assigneeId'>,
  userId: string,
): boolean {
  if (task.assigneeId) return task.assigneeId === userId;
  return task.visibility === 'shared' || task.ownerId === userId;
}

export type ZoneHealth = 'overdue' | 'today' | 'soon' | 'ok' | 'empty';

export interface ZoneSummary {
  zoneId: ZoneId;
  open: number;
  overdue: number;
  today: number;
  soon: number;
  fireOverdue: boolean;
  health: ZoneHealth;
  /** Soonest effective due date among open tasks. */
  nextDue: Ymd | null;
}

export function summarizeZones(tasks: Task[], today: Ymd): Record<ZoneId, ZoneSummary> {
  const result = {} as Record<ZoneId, ZoneSummary>;
  for (const zoneId of ZONE_IDS) {
    result[zoneId] = {
      zoneId,
      open: 0,
      overdue: 0,
      today: 0,
      soon: 0,
      fireOverdue: false,
      health: 'empty',
      nextDue: null,
    };
  }
  for (const task of tasks) {
    if (!task.zoneId || task.completedAt) continue;
    const summary = result[task.zoneId];
    if (!summary) continue;
    const timing = taskTiming(task, today);
    summary.open += 1;
    if (timing.state === 'overdue') {
      summary.overdue += 1;
      if (task.risks.includes('fire')) summary.fireOverdue = true;
    } else if (timing.state === 'today') summary.today += 1;
    else if (timing.state === 'soon') summary.soon += 1;
    if (timing.effectiveDue && (!summary.nextDue || timing.effectiveDue < summary.nextDue)) {
      summary.nextDue = timing.effectiveDue;
    }
  }
  for (const summary of Object.values(result)) {
    if (summary.overdue > 0) summary.health = 'overdue';
    else if (summary.today > 0) summary.health = 'today';
    else if (summary.soon > 0) summary.health = 'soon';
    else if (summary.open > 0) summary.health = 'ok';
  }
  return result;
}

const OVERDUE_PENALTY: Record<Priority, number> = { critical: 18, high: 12, normal: 7, low: 3 };

export interface HouseHealth {
  score: number;
  label: 'Great shape' | 'Good' | 'Needs attention' | 'At risk';
  overdue: number;
  dueSoon: number;
}

/** 0–100 score over shared maintenance: overdue safety items weigh the most. */
export function houseHealth(tasks: Task[], today: Ymd): HouseHealth {
  let penalty = 0;
  let overdue = 0;
  let dueSoon = 0;
  for (const task of tasks) {
    if (task.kind !== 'maintenance' || task.completedAt) continue;
    const timing = taskTiming(task, today);
    if (timing.state === 'overdue' && timing.days !== null) {
      overdue += 1;
      const weeksLate = Math.min(6, Math.floor(-timing.days / 7));
      penalty += OVERDUE_PENALTY[task.priority] + weeksLate + (task.risks.includes('fire') ? 6 : 0);
    } else if (timing.state === 'today') {
      dueSoon += 1;
      penalty += 2;
    } else if (timing.state === 'soon') {
      dueSoon += 1;
    }
  }
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const label =
    score >= 90 ? 'Great shape' : score >= 75 ? 'Good' : score >= 50 ? 'Needs attention' : 'At risk';
  return { score, label, overdue, dueSoon };
}
