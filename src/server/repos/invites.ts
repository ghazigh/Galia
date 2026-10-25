import type { Db } from '../db';
import { randomToken, sha256 } from '../util';

export const INVITE_TTL_DAYS = 7;

export interface InviteRecord {
  id: string;
  householdId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

interface InviteRow {
  id: string;
  household_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_by: string | null;
}

/** Creates a single-use invite and returns its secret token (stored hashed). */
export function createInvite(db: Db, householdId: string, createdBy: string) {
  const token = randomToken(18);
  const now = new Date();
  const invite: InviteRecord = {
    id: sha256(token),
    householdId,
    createdBy,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString(),
  };
  db.prepare(
    `INSERT INTO invites (id, household_id, created_by, created_at, expires_at)
     VALUES (@id, @householdId, @createdBy, @createdAt, @expiresAt)`,
  ).run(invite);
  return { token, invite };
}

export function findOpenInvite(db: Db, token: string): InviteRecord | null {
  const row = db.prepare('SELECT * FROM invites WHERE id = ?').get(sha256(token)) as
    | InviteRow
    | undefined;
  if (!row || row.used_by || Date.parse(row.expires_at) <= Date.now()) return null;
  return {
    id: row.id,
    householdId: row.household_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function markInviteUsed(db: Db, id: string, userId: string): void {
  db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?').run(
    userId,
    new Date().toISOString(),
    id,
  );
}
