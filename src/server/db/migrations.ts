// Schema migrations, applied in order and tracked with PRAGMA user_version.
// Never edit a shipped migration — append a new one.
export const MIGRATIONS: readonly string[] = [
  /* 1 — initial schema */ `
  CREATE TABLE households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    zone_names TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    color TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    prefs TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_at TEXT
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('maintenance', 'todo')),
    visibility TEXT NOT NULL CHECK (visibility IN ('shared', 'personal')),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    guide TEXT,
    zone_id TEXT,
    fixture_id TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'normal', 'low')),
    risks TEXT NOT NULL DEFAULT '[]',
    quick_win INTEGER NOT NULL DEFAULT 0,
    estimate_minutes INTEGER,
    contact TEXT,
    due_date TEXT,
    recurrence TEXT,
    remind_days_before INTEGER,
    snoozed_until TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id),
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    completed_at TEXT,
    last_completed_at TEXT,
    last_completed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    seed_key TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX tasks_household ON tasks(household_id, deleted_at);
  CREATE UNIQUE INDEX tasks_seed ON tasks(household_id, seed_key)
    WHERE seed_key IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE completions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    completed_at TEXT NOT NULL,
    completed_on TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    previous_due_date TEXT,
    previous_snoozed_until TEXT,
    next_due_date TEXT
  );
  CREATE INDEX completions_task ON completions(task_id, completed_at DESC);

  CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    last_success_at TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

  CREATE TABLE outbox (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    deliver_after TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    UNIQUE (user_id, key)
  );
  CREATE INDEX outbox_pending ON outbox(sent_at, deliver_after);
  `,
];
