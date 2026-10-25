import type { Ymd } from './dates';

export type Priority = 'critical' | 'high' | 'normal' | 'low';
export const PRIORITIES: readonly Priority[] = ['critical', 'high', 'normal', 'low'];

/** Risk flags shown as badges; fire-safety items get the loudest treatment. */
export type Risk = 'fire' | 'water' | 'safety' | 'air' | 'efficiency';
export const RISKS: readonly Risk[] = ['fire', 'water', 'safety', 'air', 'efficiency'];

export type TaskKind = 'maintenance' | 'todo';
export type Visibility = 'shared' | 'personal';

export type ZoneId =
  | 'garage'
  | 'mechanical'
  | 'entry'
  | 'living'
  | 'kitchen'
  | 'bedroom1'
  | 'bedroom2'
  | 'bedroom3'
  | 'bathroom'
  | 'roof'
  | 'backyard'
  | 'house';

/** Illustrated objects in the house view that a task can point at (highlighted on selection). */
export type FixtureId =
  | 'garage-door'
  | 'car'
  | 'heat-pump'
  | 'water-heater'
  | 'dryer'
  | 'dryer-vent'
  | 'washer'
  | 'electrical-panel'
  | 'water-main'
  | 'front-door'
  | 'dishwasher'
  | 'range-hood'
  | 'fridge'
  | 'fire-extinguisher'
  | 'bath-fan'
  | 'bathtub'
  | 'shower'
  | 'gutters'
  | 'lawn'
  | 'heat-pump-outdoor'
  | 'hose-bib'
  | 'smoke-detectors'
  | 'windows';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

/** "Every N units", counted from the last completion (completing resets the clock). */
export interface IntervalRecurrence {
  kind: 'interval';
  every: number;
  unit: RecurrenceUnit;
  /** Optional season (1–12): occurrences outside it roll forward to the next active month. */
  activeMonths?: number[];
}

/** Fixed points in the year, e.g. a spring and fall tune-up. */
export interface MonthsRecurrence {
  kind: 'months';
  months: number[];
  /** Day of month the task falls due (default 1). */
  day?: number;
}

export type Recurrence = IntervalRecurrence | MonthsRecurrence;

/** Expert guidance attached to maintenance tasks. */
export interface TaskGuide {
  why: string;
  steps: string[];
  supplies?: string[];
  safety?: string;
  /** Typically done by a professional (book it rather than DIY). */
  pro?: boolean;
}

export interface Task {
  id: string;
  kind: TaskKind;
  visibility: Visibility;
  title: string;
  notes: string;
  guide: TaskGuide | null;
  zoneId: ZoneId | null;
  fixtureId: FixtureId | null;
  priority: Priority;
  risks: Risk[];
  quickWin: boolean;
  estimateMinutes: number | null;
  /** Phone number or URL used for one-tap quick actions ("Call"). */
  contact: string | null;
  /** Next due calendar date (household time zone). */
  dueDate: Ymd | null;
  recurrence: Recurrence | null;
  /** Lead time override for "coming up" reminders. */
  remindDaysBefore: number | null;
  snoozedUntil: Ymd | null;
  ownerId: string;
  assigneeId: string | null;
  assignedById: string | null;
  /** Set when a one-off task is done. Recurring tasks never complete; they reschedule. */
  completedAt: string | null;
  lastCompletedAt: string | null;
  lastCompletedById: string | null;
  seedKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Completion {
  id: string;
  taskId: string;
  userId: string;
  completedAt: string;
  completedOn: Ymd;
  note: string;
  previousDueDate: Ymd | null;
  nextDueDate: Ymd | null;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  color: string;
  role: 'owner' | 'member';
}

export interface Household {
  id: string;
  name: string;
  timeZone: string;
  zoneNames: Partial<Record<ZoneId, string>>;
  createdAt: string;
}

export interface QuickWinWindow {
  id: string;
  label: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  time: string;
}

export interface NotificationPrefs {
  digest: { enabled: boolean; time: string };
  safetyAlerts: { enabled: boolean; time: string };
  quickWins: { enabled: boolean; windows: QuickWinWindow[] };
  assignments: { enabled: boolean };
  quietHours: { enabled: boolean; start: string; end: string };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  digest: { enabled: true, time: '07:45' },
  safetyAlerts: { enabled: true, time: '18:30' },
  quickWins: {
    enabled: true,
    windows: [
      { id: 'lunch', label: 'Lunch break', days: [1, 2, 3, 4, 5], time: '12:15' },
      { id: 'weekend', label: 'Weekend morning', days: [6], time: '10:00' },
    ],
  },
  assignments: { enabled: true },
  quietHours: { enabled: true, start: '22:00', end: '07:00' },
};

export interface Me extends Member {
  prefs: NotificationPrefs;
}

/** Everything the app needs after sign-in, in one round trip. */
export interface Bootstrap {
  me: Me;
  household: Household;
  members: Member[];
  ai: { enabled: boolean; provider: string | null };
  push: { publicKey: string | null };
}
