import type { Household } from '@shared/types';
import type { Db } from '../db';
import { parseJson } from '../util';

interface HouseholdRow {
  id: string;
  name: string;
  time_zone: string;
  zone_names: string;
  created_at: string;
}

function toHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    timeZone: row.time_zone,
    zoneNames: parseJson(row.zone_names, {}),
    createdAt: row.created_at,
  };
}

export function countHouseholds(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM households').get() as { n: number }).n;
}

export function getHousehold(db: Db, id: string): Household | null {
  const row = db.prepare('SELECT * FROM households WHERE id = ?').get(id) as HouseholdRow | undefined;
  return row ? toHousehold(row) : null;
}

export function listHouseholds(db: Db): Household[] {
  return (db.prepare('SELECT * FROM households').all() as HouseholdRow[]).map(toHousehold);
}

export function insertHousehold(db: Db, household: Household): void {
  db.prepare(
    `INSERT INTO households (id, name, time_zone, zone_names, created_at)
     VALUES (@id, @name, @timeZone, @zoneNames, @createdAt)`,
  ).run({ ...household, zoneNames: JSON.stringify(household.zoneNames) });
}

export function updateHousehold(
  db: Db,
  id: string,
  patch: Partial<Pick<Household, 'name' | 'timeZone' | 'zoneNames'>>,
): void {
  const current = getHousehold(db, id);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(
    'UPDATE households SET name = ?, time_zone = ?, zone_names = ? WHERE id = ?',
  ).run(next.name, next.timeZone, JSON.stringify(next.zoneNames), id);
}
