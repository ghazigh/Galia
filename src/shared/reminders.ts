import { addDays, parseHm, zonedNow, type Ymd } from './dates';
import { HOME } from './home';
import { PRAYER_NAMES, PRAYERS, prayerTimes } from './prayer';
import { isActionable, rankTasks, scoreTask } from './priority';
import { canView, isMine, taskTiming } from './status';
import type { NotificationPrefs, Task } from './types';

export type NotificationKind = 'digest' | 'safety' | 'quick-wins' | 'assignment' | 'poke' | 'prayer' | 'test';

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
/** A prayer push still goes out if the run lands this many minutes late; after that it is stale. */
export const PRAYER_CATCH_UP_MINUTES = 10;
/** The Dhuhr reminder: this many minutes before Asr. */
export const DHUHR_REMINDER_MINUTES = 15;
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

function clockTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at);
}

/**
 * Prayer pushes due at `now`: each of the five prayers at its time, plus a reminder before Asr
 * so Dhuhr isn't missed. They ignore quiet hours (Fajr is before most people's quiet hours end).
 */
export function planPrayers(user: PlannerUser, now: Date, timeZone: string): PlannedNotification[] {
  const { prayers } = user.prefs;
  if (!prayers?.enabled) return [];
  const today = zonedNow(timeZone, now).date;
  const out: PlannedNotification[] = [];
  const due = (at: Date) => now.getTime() >= at.getTime() && now.getTime() < at.getTime() + PRAYER_CATCH_UP_MINUTES * 60_000;
  // Yesterday too, in case a late prayer (Isha in midsummer) crosses midnight.
  for (const date of [addDays(today, -1), today]) {
    const times = prayerTimes(date, HOME.lat, HOME.lng);
    for (const prayer of PRAYERS) {
      const at = times[prayer];
      if (!due(at)) continue;
      out.push({
        userId: user.id,
        key: `prayer:${date}:${prayer}`,
        kind: 'prayer',
        title: `🕌 ${PRAYER_NAMES[prayer]}`,
        body: `It's time for ${PRAYER_NAMES[prayer]} · ${clockTime(at, timeZone)}`,
        url: '/?daylight=1',
        tag: 'prayer',
        deliverAfter: at.toISOString(),
      });
    }
    const reminder = new Date(times.asr.getTime() - DHUHR_REMINDER_MINUTES * 60_000);
    if (prayers.dhuhrReminder && due(reminder) && now.getTime() < times.asr.getTime()) {
      out.push({
        userId: user.id,
        key: `prayer:${date}:dhuhr-reminder`,
        kind: 'prayer',
        title: `⏳ Dhuhr ends in ${DHUHR_REMINDER_MINUTES} min`,
        body: `Asr comes in at ${clockTime(times.asr, timeZone)} — pray Dhuhr now if you haven't.`,
        url: '/?daylight=1',
        tag: 'prayer',
        deliverAfter: reminder.toISOString(),
      });
    }
  }
  return out;
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

    planned.push(...planPrayers(user, now, timeZone));
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

/** Minutes during which a second poke about the same task to the same person is refused. */
export const POKE_COOLDOWN_MINUTES = 10;

/** Push sent when someone pokes a household member to have a look at a task. */
export function planPoke(input: {
  task: Pick<Task, 'id' | 'title'>;
  target: PlannerUser;
  pokerName: string;
  now: Date;
  timeZone: string;
}): PlannedNotification {
  const { task, target, pokerName, now, timeZone } = input;
  const bucket = Math.floor(now.getTime() / (POKE_COOLDOWN_MINUTES * 60_000));
  return {
    userId: target.id,
    // One poke per task, person and cooldown window: the outbox ignores a repeated key.
    key: `poke:${task.id}:${target.id}:${bucket}`,
    kind: 'poke',
    title: `👉 ${pokerName} poked you`,
    body: `Have a look at “${task.title}”`,
    url: `/task/${task.id}`,
    tag: `poke-${task.id}`,
    deliverAfter: deliverAfterQuietHours(now, timeZone, target.prefs).toISOString(),
  };
}
