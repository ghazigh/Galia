import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from './index';
import { MIGRATIONS } from './migrations';

describe('migrations', () => {
  it('moves laundry tasks into the new laundry room', () => {
    const db = new Database(':memory:');
    db.exec(MIGRATIONS[0]);
    db.pragma('user_version = 1');
    const now = '2026-10-01T00:00:00Z';
    db.prepare('INSERT INTO households VALUES (?, ?, ?, ?, ?)').run(
      'h1',
      'Home',
      'America/Toronto',
      '{}',
      now,
    );
    db.prepare(
      `INSERT INTO users (id, household_id, email, name, password_hash, color, role, prefs, created_at)
       VALUES ('u1', 'h1', 'g@example.com', 'Ghazi', 'x', '#000', 'owner', '{}', ?)`,
    ).run(now);
    const insert = db.prepare(
      `INSERT INTO tasks (id, household_id, kind, visibility, title, zone_id, fixture_id, priority, owner_id, created_at, updated_at)
       VALUES (?, 'h1', 'maintenance', 'shared', ?, ?, ?, 'normal', 'u1', ?, ?)`,
    );
    insert.run('t2', 'Clean the dryer vent', 'mechanical', 'dryer-vent', now, now);
    insert.run('t3', 'Flush the water heater', 'mechanical', 'water-heater', now, now);

    migrate(db);

    const zone = (id: string) => (db.prepare('SELECT zone_id FROM tasks WHERE id = ?').get(id) as { zone_id: string | null }).zone_id;
    expect(zone('t2')).toBe('laundry');
    expect(zone('t3')).toBe('mechanical');
    // The house is in Montréal: the household's clock follows it, whatever was chosen at setup.
    expect((db.prepare('SELECT time_zone FROM households').get() as { time_zone: string }).time_zone).toBe('America/Montreal');
  });
});
