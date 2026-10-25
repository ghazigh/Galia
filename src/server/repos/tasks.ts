import type { Completion, Task } from '@shared/types';
import type { Db } from '../db';
import { parseJson } from '../util';

interface TaskRow {
  id: string;
  household_id: string;
  kind: Task['kind'];
  visibility: Task['visibility'];
  title: string;
  notes: string;
  guide: string | null;
  zone_id: Task['zoneId'];
  fixture_id: Task['fixtureId'];
  priority: Task['priority'];
  risks: string;
  quick_win: number;
  estimate_minutes: number | null;
  contact: string | null;
  due_date: string | null;
  recurrence: string | null;
  remind_days_before: number | null;
  snoozed_until: string | null;
  owner_id: string;
  assignee_id: string | null;
  assigned_by_id: string | null;
  completed_at: string | null;
  last_completed_at: string | null;
  last_completed_by_id: string | null;
  seed_key: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    kind: row.kind,
    visibility: row.visibility,
    title: row.title,
    notes: row.notes,
    guide: parseJson(row.guide, null),
    zoneId: row.zone_id,
    fixtureId: row.fixture_id,
    priority: row.priority,
    risks: parseJson(row.risks, []),
    quickWin: row.quick_win === 1,
    estimateMinutes: row.estimate_minutes,
    contact: row.contact,
    dueDate: row.due_date,
    recurrence: parseJson(row.recurrence, null),
    remindDaysBefore: row.remind_days_before,
    snoozedUntil: row.snoozed_until,
    ownerId: row.owner_id,
    assigneeId: row.assignee_id,
    assignedById: row.assigned_by_id,
    completedAt: row.completed_at,
    lastCompletedAt: row.last_completed_at,
    lastCompletedById: row.last_completed_by_id,
    seedKey: row.seed_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type Writable = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

const json = (value: unknown) => (value === null || value === undefined ? null : JSON.stringify(value));

/** camelCase field → column + encoder, shared by insert and update. */
const COLUMNS: Record<keyof Writable, readonly [column: string, encode?: (value: unknown) => unknown]> = {
  kind: ['kind'],
  visibility: ['visibility'],
  title: ['title'],
  notes: ['notes'],
  guide: ['guide', json],
  zoneId: ['zone_id'],
  fixtureId: ['fixture_id'],
  priority: ['priority'],
  risks: ['risks', (risks) => JSON.stringify(risks ?? [])],
  quickWin: ['quick_win', (quick) => (quick ? 1 : 0)],
  estimateMinutes: ['estimate_minutes'],
  contact: ['contact'],
  dueDate: ['due_date'],
  recurrence: ['recurrence', json],
  remindDaysBefore: ['remind_days_before'],
  snoozedUntil: ['snoozed_until'],
  ownerId: ['owner_id'],
  assigneeId: ['assignee_id'],
  assignedById: ['assigned_by_id'],
  completedAt: ['completed_at'],
  lastCompletedAt: ['last_completed_at'],
  lastCompletedById: ['last_completed_by_id'],
  seedKey: ['seed_key'],
};

function encode(key: keyof Writable, value: unknown): unknown {
  const [, encoder] = COLUMNS[key];
  return encoder ? encoder(value) : value;
}

const VISIBLE_SQL = `household_id = ? AND deleted_at IS NULL
  AND (visibility = 'shared' OR owner_id = ? OR assignee_id = ?)`;

export function listTasksForUser(db: Db, householdId: string, userId: string): Task[] {
  return (
    db
      .prepare(`SELECT * FROM tasks WHERE ${VISIBLE_SQL} ORDER BY created_at`)
      .all(householdId, userId, userId) as TaskRow[]
  ).map(toTask);
}

export function listHouseholdTasks(db: Db, householdId: string): Task[] {
  return (
    db
      .prepare('SELECT * FROM tasks WHERE household_id = ? AND deleted_at IS NULL')
      .all(householdId) as TaskRow[]
  ).map(toTask);
}

export function getTask(
  db: Db,
  householdId: string,
  id: string,
  { includeDeleted = false } = {},
): Task | null {
  const row = db
    .prepare(
      `SELECT * FROM tasks WHERE id = ? AND household_id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`,
    )
    .get(id, householdId) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

export function insertTask(db: Db, householdId: string, task: Task): void {
  const keys = Object.keys(COLUMNS) as (keyof Writable)[];
  const columns = ['id', 'household_id', 'created_at', 'updated_at', ...keys.map((k) => COLUMNS[k][0])];
  const values = [
    task.id,
    householdId,
    task.createdAt,
    task.updatedAt,
    ...keys.map((key) => encode(key, task[key])),
  ];
  db.prepare(
    `INSERT INTO tasks (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).run(...values);
}

export function updateTask(db: Db, id: string, patch: Partial<Writable>): void {
  const keys = (Object.keys(patch) as (keyof Writable)[]).filter(
    (key) => key in COLUMNS && patch[key] !== undefined,
  );
  const sets = keys.map((key) => `${COLUMNS[key][0]} = ?`);
  const values = keys.map((key) => encode(key, patch[key]));
  db.prepare(`UPDATE tasks SET ${[...sets, 'updated_at = ?'].join(', ')} WHERE id = ?`).run(
    ...values,
    new Date().toISOString(),
    id,
  );
}

export function setTaskDeleted(db: Db, id: string, deleted: boolean): void {
  db.prepare('UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
    deleted ? new Date().toISOString() : null,
    new Date().toISOString(),
    id,
  );
}

export function purgeDeletedTasks(db: Db, olderThanDays = 30): void {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  db.prepare('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
}

export function seedKeys(db: Db, householdId: string): Set<string> {
  const rows = db
    .prepare(
      'SELECT seed_key FROM tasks WHERE household_id = ? AND seed_key IS NOT NULL AND deleted_at IS NULL',
    )
    .all(householdId) as { seed_key: string }[];
  return new Set(rows.map((row) => row.seed_key));
}

// ── Completions ──────────────────────────────────────────────────────────────────────────────

interface CompletionRow {
  id: string;
  task_id: string;
  user_id: string;
  completed_at: string;
  completed_on: string;
  note: string;
  previous_due_date: string | null;
  previous_snoozed_until: string | null;
  next_due_date: string | null;
}

export interface CompletionRecord extends Completion {
  previousSnoozedUntil: string | null;
}

function toCompletion(row: CompletionRow): CompletionRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    completedAt: row.completed_at,
    completedOn: row.completed_on,
    note: row.note,
    previousDueDate: row.previous_due_date,
    previousSnoozedUntil: row.previous_snoozed_until,
    nextDueDate: row.next_due_date,
  };
}

export function insertCompletion(db: Db, completion: CompletionRecord): void {
  db.prepare(
    `INSERT INTO completions (id, task_id, user_id, completed_at, completed_on, note,
       previous_due_date, previous_snoozed_until, next_due_date)
     VALUES (@id, @taskId, @userId, @completedAt, @completedOn, @note,
       @previousDueDate, @previousSnoozedUntil, @nextDueDate)`,
  ).run(completion);
}

export function listCompletions(db: Db, taskId: string, limit = 50): CompletionRecord[] {
  return (
    db
      .prepare(
        'SELECT * FROM completions WHERE task_id = ? ORDER BY completed_at DESC, rowid DESC LIMIT ?',
      )
      .all(taskId, limit) as CompletionRow[]
  ).map(toCompletion);
}

export function deleteCompletion(db: Db, id: string): void {
  db.prepare('DELETE FROM completions WHERE id = ?').run(id);
}
