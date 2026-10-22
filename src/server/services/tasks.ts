import { todayIn } from '@shared/dates';
import { initialDueDate, nextDueAfterCompletion } from '@shared/recurrence';
import { planAssignment } from '@shared/reminders';
import type { CompleteInput, TaskCreateInput, TaskPatchInput } from '@shared/schemas';
import { resolveSeed, SEED_TASKS } from '@shared/seed';
import { canView } from '@shared/status';
import type { FixtureId, Task, ZoneId } from '@shared/types';
import { fixtureDef } from '@shared/zones';
import type { Actor, AppContext } from '../context';
import {
  deleteCompletion,
  getTask,
  insertCompletion,
  insertTask,
  listCompletions,
  listTasksForUser,
  seedKeys,
  setTaskDeleted,
  updateTask,
  type CompletionRecord,
} from '../repos/tasks';
import { HttpError, newId } from '../util';

function today(ctx: AppContext, actor: Actor) {
  return todayIn(actor.household.timeZone, ctx.now());
}

export function listTasks(ctx: AppContext, actor: Actor): Task[] {
  return listTasksForUser(ctx.db, actor.household.id, actor.user.id);
}

export function requireTask(ctx: AppContext, actor: Actor, id: string): Task {
  const task = getTask(ctx.db, actor.household.id, id);
  if (!task || !canView(task, actor.user.id)) throw new HttpError(404, 'Task not found');
  return task;
}

function assertMember(actor: Actor, userId: string | null | undefined): string | null {
  if (!userId) return null;
  if (!actor.members.some((member) => member.id === userId)) {
    throw new HttpError(422, 'That person is not part of this household');
  }
  return userId;
}

/** Keeps zone and fixture consistent: a fixture implies its zone; a mismatch drops the fixture. */
function placement(zoneId: ZoneId | null, fixtureId: FixtureId | null) {
  if (!fixtureId) return { zoneId, fixtureId: null };
  const fixtureZone = fixtureDef(fixtureId).zoneId;
  if (!zoneId) return { zoneId: fixtureZone, fixtureId };
  return { zoneId, fixtureId: fixtureZone === zoneId ? fixtureId : null };
}

function notifyAssignment(ctx: AppContext, actor: Actor, task: Task): void {
  if (!task.assigneeId || task.assigneeId === actor.user.id) return;
  const assignee = actor.members.find((member) => member.id === task.assigneeId);
  if (!assignee) return;
  const planned = planAssignment({
    task,
    assignee: { id: assignee.id, name: assignee.name, prefs: assignee.prefs },
    assignerName: actor.user.name,
    now: ctx.now(),
    timeZone: actor.household.timeZone,
  });
  if (!planned) return;
  ctx.notifier.enqueue([planned]);
  void ctx.notifier.dispatch().catch((err) => console.error('Push dispatch failed', err));
}

export function createTask(ctx: AppContext, actor: Actor, input: TaskCreateInput): Task {
  const kind = input.kind ?? 'todo';
  const assigneeId = assertMember(actor, input.assigneeId);
  const recurrence = input.recurrence ?? null;
  const { zoneId, fixtureId } = placement(input.zoneId ?? null, input.fixtureId ?? null);
  const now = ctx.now().toISOString();
  const task: Task = {
    id: newId(),
    kind,
    // Home maintenance is always a household matter.
    visibility: kind === 'maintenance' ? 'shared' : (input.visibility ?? 'shared'),
    title: input.title,
    notes: input.notes ?? '',
    guide: input.guide ?? null,
    zoneId,
    fixtureId,
    priority: input.priority ?? 'normal',
    risks: input.risks ?? [],
    quickWin: input.quickWin ?? false,
    estimateMinutes: input.estimateMinutes ?? null,
    contact: input.contact || null,
    dueDate: input.dueDate ?? (recurrence ? initialDueDate(recurrence, today(ctx, actor)) : null),
    recurrence,
    remindDaysBefore: input.remindDaysBefore ?? null,
    snoozedUntil: null,
    ownerId: actor.user.id,
    assigneeId,
    assignedById: assigneeId && assigneeId !== actor.user.id ? actor.user.id : null,
    completedAt: null,
    lastCompletedAt: null,
    lastCompletedById: null,
    seedKey: null,
    createdAt: now,
    updatedAt: now,
  };
  insertTask(ctx.db, actor.household.id, task);
  notifyAssignment(ctx, actor, task);
  return task;
}

export function patchTask(ctx: AppContext, actor: Actor, id: string, patch: TaskPatchInput): Task {
  const task = requireTask(ctx, actor, id);
  const next: Partial<Task> = {};
  const copy = <K extends keyof TaskPatchInput & keyof Task>(key: K) => {
    if (patch[key] !== undefined) (next as Record<string, unknown>)[key] = patch[key];
  };
  for (const key of [
    'title',
    'notes',
    'guide',
    'priority',
    'risks',
    'quickWin',
    'estimateMinutes',
    'dueDate',
    'recurrence',
    'remindDaysBefore',
    'snoozedUntil',
    'kind',
    'visibility',
  ] as const) {
    copy(key);
  }
  if (patch.contact !== undefined) next.contact = patch.contact || null;
  if (patch.zoneId !== undefined || patch.fixtureId !== undefined) {
    Object.assign(
      next,
      placement(
        patch.zoneId !== undefined ? patch.zoneId : task.zoneId,
        patch.fixtureId !== undefined ? patch.fixtureId : task.fixtureId,
      ),
    );
  }
  if ((next.kind ?? task.kind) === 'maintenance') next.visibility = 'shared';
  const recurrence = next.recurrence !== undefined ? next.recurrence : task.recurrence;
  if (recurrence && (next.dueDate === null || (next.dueDate === undefined && !task.dueDate))) {
    next.dueDate = initialDueDate(recurrence, today(ctx, actor));
  }
  let reassigned = false;
  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    next.assigneeId = assertMember(actor, patch.assigneeId);
    next.assignedById =
      next.assigneeId && next.assigneeId !== actor.user.id ? actor.user.id : null;
    reassigned = Boolean(next.assignedById);
  }
  if (Object.keys(next).length > 0) updateTask(ctx.db, task.id, next);
  const updated = requireTask(ctx, actor, id);
  if (reassigned) notifyAssignment(ctx, actor, updated);
  return updated;
}

export function completeTask(
  ctx: AppContext,
  actor: Actor,
  id: string,
  input: CompleteInput,
): { task: Task; completion: CompletionRecord } {
  const task = requireTask(ctx, actor, id);
  if (task.completedAt) throw new HttpError(409, 'This task is already done');
  const todayYmd = today(ctx, actor);
  const completedOn = input.completedOn && input.completedOn <= todayYmd ? input.completedOn : todayYmd;
  const now = ctx.now().toISOString();
  const nextDueDate = task.recurrence
    ? nextDueAfterCompletion(task.recurrence, completedOn, task.dueDate)
    : null;
  const completion: CompletionRecord = {
    id: newId(),
    taskId: task.id,
    userId: actor.user.id,
    completedAt: now,
    completedOn,
    note: input.note?.trim() ?? '',
    previousDueDate: task.dueDate,
    previousSnoozedUntil: task.snoozedUntil,
    nextDueDate,
  };
  ctx.db.transaction(() => {
    insertCompletion(ctx.db, completion);
    updateTask(ctx.db, task.id, {
      ...(task.recurrence ? { dueDate: nextDueDate } : { completedAt: now }),
      snoozedUntil: null,
      lastCompletedAt: now,
      lastCompletedById: actor.user.id,
    });
  })();
  return { task: requireTask(ctx, actor, id), completion };
}

/** Reverts the most recent completion (the "Undo" in the toast). */
export function undoCompletion(ctx: AppContext, actor: Actor, id: string): Task {
  const task = requireTask(ctx, actor, id);
  const [latest, previous] = listCompletions(ctx.db, task.id, 2);
  if (!latest) throw new HttpError(409, 'Nothing to undo');
  ctx.db.transaction(() => {
    deleteCompletion(ctx.db, latest.id);
    updateTask(ctx.db, task.id, {
      completedAt: null,
      dueDate: task.recurrence ? latest.previousDueDate : task.dueDate,
      snoozedUntil: latest.previousSnoozedUntil,
      lastCompletedAt: previous?.completedAt ?? null,
      lastCompletedById: previous?.userId ?? null,
    });
  })();
  return requireTask(ctx, actor, id);
}

export function snoozeTask(ctx: AppContext, actor: Actor, id: string, until: string): Task {
  const task = requireTask(ctx, actor, id);
  if (until <= today(ctx, actor)) throw new HttpError(422, 'Pick a date after today');
  updateTask(ctx.db, task.id, { snoozedUntil: until });
  return requireTask(ctx, actor, id);
}

export function deleteTask(ctx: AppContext, actor: Actor, id: string): void {
  const task = requireTask(ctx, actor, id);
  setTaskDeleted(ctx.db, task.id, true);
}

export function restoreTask(ctx: AppContext, actor: Actor, id: string): Task {
  const task = getTask(ctx.db, actor.household.id, id, { includeDeleted: true });
  if (!task || !canView(task, actor.user.id)) throw new HttpError(404, 'Task not found');
  setTaskDeleted(ctx.db, task.id, false);
  return requireTask(ctx, actor, id);
}

export function taskHistory(ctx: AppContext, actor: Actor, id: string): CompletionRecord[] {
  const task = requireTask(ctx, actor, id);
  return listCompletions(ctx.db, task.id);
}

/** Adds expert seed tasks (by key) that are not already in the household. */
export function addSeedTasks(
  ctx: AppContext,
  household: { id: string; timeZone: string },
  ownerId: string,
  keys: readonly string[],
): Task[] {
  const present = seedKeys(ctx.db, household.id);
  const todayYmd = todayIn(household.timeZone, ctx.now());
  const now = ctx.now().toISOString();
  const added: Task[] = [];
  ctx.db.transaction(() => {
    for (const seed of SEED_TASKS) {
      if (!keys.includes(seed.key) || present.has(seed.key)) continue;
      const task: Task = {
        ...resolveSeed(seed, todayYmd),
        id: newId(),
        remindDaysBefore: null,
        snoozedUntil: null,
        ownerId,
        assigneeId: null,
        assignedById: null,
        completedAt: null,
        lastCompletedAt: null,
        lastCompletedById: null,
        createdAt: now,
        updatedAt: now,
      };
      insertTask(ctx.db, household.id, task);
      added.push(task);
    }
  })();
  return added;
}

export function seedCatalog(ctx: AppContext, actor: Actor) {
  const present = seedKeys(ctx.db, actor.household.id);
  return SEED_TASKS.map((seed) => ({
    key: seed.key,
    group: seed.group,
    title: seed.title,
    zoneId: seed.zoneId,
    priority: seed.priority,
    risks: seed.risks,
    recurrence: seed.recurrence,
    estimateMinutes: seed.estimateMinutes,
    added: present.has(seed.key),
  }));
}
