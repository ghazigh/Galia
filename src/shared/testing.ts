import type { Task } from './types';

/** Builds a Task with sensible defaults for unit tests. */
export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'todo',
    visibility: 'shared',
    title: 'Task',
    notes: '',
    guide: null,
    zoneId: null,
    fixtureId: null,
    priority: 'normal',
    risks: [],
    quickWin: false,
    estimateMinutes: null,
    contact: null,
    dueDate: null,
    recurrence: null,
    remindDaysBefore: null,
    snoozedUntil: null,
    ownerId: 'u1',
    assigneeId: null,
    assignedById: null,
    completedAt: null,
    lastCompletedAt: null,
    lastCompletedById: null,
    seedKey: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}
