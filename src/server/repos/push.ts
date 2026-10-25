import type { PlannedNotification } from '@shared/reminders';
import type { Db } from '../db';
import { newId } from '../util';

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const toSubscription = (row: SubscriptionRow): PushSubscriptionRecord => ({
  id: row.id,
  userId: row.user_id,
  endpoint: row.endpoint,
  p256dh: row.p256dh,
  auth: row.auth,
});

export function upsertSubscription(
  db: Db,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
): void {
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, failure_count = 0`,
  ).run(
    newId(),
    userId,
    sub.endpoint,
    sub.keys.p256dh,
    sub.keys.auth,
    userAgent?.slice(0, 300) ?? null,
    new Date().toISOString(),
  );
}

export function deleteSubscription(db: Db, endpoint: string, userId?: string): void {
  if (userId) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }
}

export function listSubscriptions(db: Db, userId: string): PushSubscriptionRecord[] {
  return (
    db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as SubscriptionRow[]
  ).map(toSubscription);
}

export function recordPushResult(db: Db, id: string, ok: boolean): void {
  if (ok) {
    db.prepare(
      'UPDATE push_subscriptions SET last_success_at = ?, failure_count = 0 WHERE id = ?',
    ).run(new Date().toISOString(), id);
  } else {
    db.prepare('UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?').run(id);
  }
}

// ── Outbox ───────────────────────────────────────────────────────────────────────────────────

export interface OutboxRecord {
  id: string;
  userId: string;
  key: string;
  kind: string;
  payload: { title: string; body: string; url: string; tag: string };
  attempts: number;
}

interface OutboxRow {
  id: string;
  user_id: string;
  key: string;
  kind: string;
  payload: string;
  attempts: number;
}

/** Queues notifications; a key already queued for that user is ignored (idempotent planning). */
export function enqueue(db: Db, planned: PlannedNotification[], now: Date = new Date()): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO outbox (id, user_id, key, kind, payload, deliver_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let added = 0;
  db.transaction(() => {
    for (const n of planned) {
      const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag });
      added += insert.run(newId(), n.userId, n.key, n.kind, payload, n.deliverAfter, now.toISOString())
        .changes;
    }
  })();
  return added;
}

export const MAX_ATTEMPTS = 5;

export function pendingOutbox(db: Db, now: Date, limit = 100): OutboxRecord[] {
  // Anything older than two days is stale news; it is dropped rather than sent late.
  const staleBefore = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  return (
    db
      .prepare(
        `SELECT id, user_id, key, kind, payload, attempts FROM outbox
         WHERE sent_at IS NULL AND deliver_after <= ? AND attempts < ? AND created_at >= ?
         ORDER BY deliver_after LIMIT ?`,
      )
      .all(now.toISOString(), MAX_ATTEMPTS, staleBefore, limit) as OutboxRow[]
  ).map((row) => ({
    id: row.id,
    userId: row.user_id,
    key: row.key,
    kind: row.kind,
    payload: JSON.parse(row.payload),
    attempts: row.attempts,
  }));
}

export function markOutbox(db: Db, id: string, result: { sent: boolean; error?: string }): void {
  if (result.sent) {
    db.prepare('UPDATE outbox SET sent_at = ?, attempts = attempts + 1, last_error = ? WHERE id = ?').run(
      new Date().toISOString(),
      result.error ?? null,
      id,
    );
  } else {
    db.prepare('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?').run(
      result.error ?? 'unknown error',
      id,
    );
  }
}

export function purgeOutbox(db: Db, olderThanDays = 60): void {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  db.prepare('DELETE FROM outbox WHERE created_at < ?').run(cutoff);
}
