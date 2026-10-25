import { parseHm, zonedNow, type Ymd } from './dates';
import { isActionable, rankTasks, scoreTask } from './priority';
import { canView, isMine, taskTiming } from './status';
import type { NotificationPrefs, Task } from './types';

export type NotificationKind = 'digest' | 'safety' | 'quick-wins' | 'assignment' | 'test';

export interface PlannedNotification {
  userId: string;
  /** Dedupe key: the same key is never delivered twice to a user. */
  key: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url: string;
  /** Notifications sharing a tag replace each other on the device. */
  tag: string;
  /** ISO instant before which the notification must not be sent. */
  deliverAfter: string;
}

export interface PlannerUser {
  id: string;
  name: string;
  prefs: NotificationPrefs;
}

export interface PlanInput {
  now: Date;
  timeZone: string;
  users: PlannerUser[];
  tasks: Task[];
  memberName?: (id: string) => string | undefined;
}

/** A scheduled reminder still goes out if the cron run lands within this many minutes after its time. */
const DIGEST_CATCH_UP_MINUTES = 120;
const QUICK_WIN_CATCH_UP_MINUTES = 60;
/** Overdue safety items are re-announced every N days. */
const SAFETY_REPEAT_DAYS = 3;

function inWindow(nowMinutes: number, startHm: string, catchUp: number): boolean {
  const start = parseHm(startHm);
  return nowMinutes >= start && nowMinutes < start + catchUp;
}

export function inQuietHours(nowMinutes: number, prefs: NotificationPrefs): boolean {
  if (!prefs.quietHours.enabled) return false;
  const start = parseHm(prefs.quietHours.start);
  const end = parseHm(prefs.quietHours.end);
  if (start === end) return false;
  return start < end
    ? nowMinutes >= start && nowMinutes < end
    : nowMinutes >= start || nowMinutes < end;
}

/** Instant at which an event-driven push may go out (now, or when quiet hours end). */
export function deliverAfterQuietHours(now: Date, timeZone: string, prefs: NotificationPrefs): Date {
  const { minutes } = zonedNow(timeZone, now);
  if (!inQuietHours(minutes, prefs)) return now;
  const wait = (parseHm(prefs.quietHours.end) - minutes + 1440) % 1440;
  return new Date(now.getTime() + wait * 60_000);
}

function listTitles(titles: string[], max = 3): string {
  const shown = titles.slice(0, max);
  const rest = titles.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} · +${rest} more` : shown.join(' · ');
}

function dueLabel(task: Task, today: Ymd): string {
  const timing = taskTiming(task, today);
  if (timing.state === 'overdue') return 'overdue';
  if (timing.state === 'today') return 'today';
  if (timing.days === 1) return 'tomorrow';
  return `in ${timing.days} days`;
}

function planDigest(user: PlannerUser, tasks: Task[], today: Ymd, nowIso: string, ctxName: PlanInput['memberName']) {
  const ranked = rankTasks(tasks, { today, userId: user.id, memberName: ctxName }).filter(
    ({ timing }) =>
      timing.state === 'overdue' || timing.state === 'today' || timing.state === 'soon',
  );
  if (ranked.length === 0) return null;
  const overdue = ranked.filter(({ timing }) => timing.state === 'overdue').length;
  const dueToday = ranked.filter(({ timing }) => timing.state === 'today').length;
  let title: string;
  if (overdue > 0 && dueToday > 0) title = `${overdue} overdue · ${dueToday} due today`;
  else if (overdue > 0) title = `${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`;
  else if (dueToday > 0) title = `${dueToday} ${dueToday === 1 ? 'thing' : 'things'} due today`;
  else title = `Coming up: ${ranked.length} ${ranked.length === 1 ? 'task' : 'tasks'}`;
  const body = listTitles(ranked.map(({ task }) => `${task.title} (${dueLabel(task, today)})`));
  const notification: PlannedNotification = {
    userId: user.id,
    key: `digest:${today}`,
    kind: 'digest',
    title,
    body,
    url: '/focus',
    tag: 'digest',
    deliverAfter: nowIso,
  };
  return notification;
}

function planSafety(user: PlannerUser, tasks: Task[], today: Ymd, nowIso: string) {
  const overdue = tasks
    .map((task) => ({ task, timing: taskTiming(task, today) }))
    .filter(
      ({ task, timing }) =>
        timing.state === 'overdue' &&
        (task.risks.includes('fire') || task.priority === 'critical'),
    );
  // Speak up on day 1, 4, 7 … of being late for any item, and mention every overdue one.
  const due = overdue.some(({ timing }) => (-(timing.days ?? 0) - 1) % SAFETY_REPEAT_DAYS === 0);
  if (!due) return null;
  overdue.sort((a, b) => (a.timing.days ?? 0) - (b.timing.days ?? 0));
  const [first] = overdue;
  const late = -(first.timing.days ?? 0);
  const single = overdue.length === 1;
  const notification: PlannedNotification = {
    userId: user.id,
    key: `safety:${today}`,
    kind: 'safety',
    title: single
      ? `${first.task.risks.includes('fire') ? 'Fire-safety' : 'Safety'} task overdue`
      : `${overdue.length} safety tasks overdue`,
    body: single
      ? `${first.task.title} is ${late} ${late === 1 ? 'day' : 'days'} overdue.${first.task.guide?.why ? ` ${first.task.guide.why}` : ''}`
      : listTitles(overdue.map(({ task }) => task.title)),
    url: single ? `/task/${first.task.id}` : '/focus',
    tag: 'safety',
    deliverAfter: nowIso,
  };
  return notification;
}

function planQuickWins(
  user: PlannerUser,
  tasks: Task[],
  today: Ymd,
  nowIso: string,
  windowId: string,
  ctxName: PlanInput['memberName'],
) {
  const quick = tasks
    .filter((task) => task.quickWin)
    .map((task) => scoreTask(task, { today, userId: user.id, memberName: ctxName }))
    .filter(({ task, timing }) => isActionable(timing, task))
    .sort((a, b) => b.score - a.score);
  if (quick.length === 0) return null;
  const notification: PlannedNotification = {
    userId: user.id,
    key: `quick:${today}:${windowId}`,
    kind: 'quick-wins',
    title:
      quick.length === 1 ? 'Got a few minutes? One quick win' : `Got a few minutes? ${quick.length} quick wins`,
    body: listTitles(quick.map(({ task }) => task.title)),
    url: '/focus?quick=1',
    tag: 'quick-wins',
    deliverAfter: nowIso,
  };
  return notification;
}

/**
 * Pure reminder planner: given the household state at `now`, returns every scheduled
 * notification that should exist. Callers dedupe on `key`, so running it every few minutes
 * (or after a missed run) is safe.
 */
export function planReminders(input: PlanInput): PlannedNotification[] {
  const { now, timeZone, users, memberName } = input;
  const local = zonedNow(timeZone, now);
  const nowIso = now.toISOString();
  const planned: PlannedNotification[] = [];

  for (const user of users) {
    const { prefs } = user;
    const mine = input.tasks.filter(
      (task) => !task.completedAt && canView(task, user.id) && isMine(task, user.id),
    );

    if (prefs.digest.enabled && inWindow(local.minutes, prefs.digest.time, DIGEST_CATCH_UP_MINUTES)) {
      const digest = planDigest(user, mine, local.date, nowIso, memberName);
      if (digest) planned.push(digest);
    }

    if (
      prefs.safetyAlerts.enabled &&
      inWindow(local.minutes, prefs.safetyAlerts.time, DIGEST_CATCH_UP_MINUTES)
    ) {
      const safety = planSafety(user, mine, local.date, nowIso);
      if (safety) planned.push(safety);
    }

    if (prefs.quickWins.enabled) {
      for (const window of prefs.quickWins.windows) {
        if (!window.days.includes(local.weekday)) continue;
        if (!inWindow(local.minutes, window.time, QUICK_WIN_CATCH_UP_MINUTES)) continue;
        const quick = planQuickWins(user, mine, local.date, nowIso, window.id, memberName);
        if (quick) planned.push(quick);
      }
    }
  }
  return planned;
}

/** Push sent to the assignee right after someone hands them a task. */
export function planAssignment(input: {
  task: Pick<Task, 'id' | 'title'>;
  assignee: PlannerUser;
  assignerName: string;
  now: Date;
  timeZone: string;
}): PlannedNotification | null {
  const { task, assignee, assignerName, now, timeZone } = input;
  if (!assignee.prefs.assignments.enabled) return null;
  return {
    userId: assignee.id,
    key: `assign:${task.id}:${now.getTime()}`,
    kind: 'assignment',
    title: `${assignerName} assigned you a task`,
    body: task.title,
    url: `/task/${task.id}`,
    tag: `assign-${task.id}`,
    deliverAfter: deliverAfterQuietHours(now, timeZone, assignee.prefs).toISOString(),
  };
}
