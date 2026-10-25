import {
  DEFAULT_NOTIFICATION_PREFS,
  type Me,
  type Member,
  type NotificationPrefs,
} from '@shared/types';
import type { Db } from '../db';
import { parseJson } from '../util';

interface UserRow {
  id: string;
  household_id: string;
  email: string;
  name: string;
  password_hash: string;
  color: string;
  role: 'owner' | 'member';
  prefs: string;
  created_at: string;
}

export interface UserRecord {
  id: string;
  householdId: string;
  email: string;
  name: string;
  passwordHash: string;
  color: string;
  role: 'owner' | 'member';
  prefs: NotificationPrefs;
  createdAt: string;
}

/** Stored prefs merged over defaults, so new preference fields get sane values. */
function mergePrefs(stored: Partial<NotificationPrefs>): NotificationPrefs {
  const d = DEFAULT_NOTIFICATION_PREFS;
  return {
    digest: { ...d.digest, ...stored.digest },
    safetyAlerts: { ...d.safetyAlerts, ...stored.safetyAlerts },
    quickWins: { ...d.quickWins, ...stored.quickWins },
    assignments: { ...d.assignments, ...stored.assignments },
    quietHours: { ...d.quietHours, ...stored.quietHours },
  };
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    color: row.color,
    role: row.role,
    prefs: mergePrefs(parseJson(row.prefs, {})),
    createdAt: row.created_at,
  };
}

export function toMember(user: UserRecord): Member {
  return { id: user.id, name: user.name, email: user.email, color: user.color, role: user.role };
}

export function toMe(user: UserRecord): Me {
  return { ...toMember(user), prefs: user.prefs };
}

/** Avatar colors handed out in join order. */
export const MEMBER_COLORS = ['#5b5bd6', '#e5734a', '#12a594'] as const;

export function getUser(db: Db, id: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getUserByEmail(db: Db, email: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function listUsers(db: Db, householdId: string): UserRecord[] {
  return (
    db
      .prepare('SELECT * FROM users WHERE household_id = ? ORDER BY created_at')
      .all(householdId) as UserRow[]
  ).map(toUser);
}

export function insertUser(db: Db, user: UserRecord): void {
  db.prepare(
    `INSERT INTO users (id, household_id, email, name, password_hash, color, role, prefs, created_at)
     VALUES (@id, @householdId, @email, @name, @passwordHash, @color, @role, @prefs, @createdAt)`,
  ).run({ ...user, prefs: JSON.stringify(user.prefs) });
}

export function updateUser(
  db: Db,
  id: string,
  patch: Partial<Pick<UserRecord, 'name' | 'prefs' | 'passwordHash'>>,
): void {
  const current = getUser(db, id);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare('UPDATE users SET name = ?, prefs = ?, password_hash = ? WHERE id = ?').run(
    next.name,
    JSON.stringify(next.prefs),
    next.passwordHash,
    id,
  );
}
