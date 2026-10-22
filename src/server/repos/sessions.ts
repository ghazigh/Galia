import type { Db } from '../db';
import { randomToken, sha256 } from '../util';

/** Installed PWAs should rarely ask to sign in again; browsers cap cookies at 400 days. */
export const SESSION_TTL_DAYS = 400;
const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  last_seen_at: string;
}

function expiry(from = Date.now()): string {
  return new Date(from + SESSION_TTL_DAYS * 86_400_000).toISOString();
}

/** Creates a session and returns the raw token (only its hash is stored). */
export function createSession(db: Db, userId: string, userAgent: string | null): string {
  const token = randomToken();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), userId, now, expiry(), now, userAgent?.slice(0, 300) ?? null);
  return token;
}

/** Resolves a token to its user id, sliding the expiry forward at most once a day. */
export function resolveSession(db: Db, token: string): { userId: string; renewed: boolean } | null {
  const id = sha256(token);
  const row = db
    .prepare('SELECT id, user_id, expires_at, last_seen_at FROM sessions WHERE id = ?')
    .get(id) as SessionRow | undefined;
  if (!row) return null;
  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > TOUCH_AFTER_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      new Date(now).toISOString(),
      expiry(now),
      id,
    );
    return { userId: row.user_id, renewed: true };
  }
  return { userId: row.user_id, renewed: false };
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
}

export function purgeExpiredSessions(db: Db): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}
