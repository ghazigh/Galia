import { describe, expect, it } from 'vitest';
import { recurrenceSchema, guideSchema } from './schemas';
import { resolveSeed, SEED_TASKS } from './seed';
import { taskTiming } from './status';
import { makeTask } from './testing';
import { fixtureDef, isZoneId } from './zones';

const today = '2026-10-22';

describe('expert seed schedule', () => {
  it('covers every maintenance item named in the PRD', () => {
    const titles = SEED_TASKS.map((seed) => seed.title.toLowerCase()).join('\n');
    for (const needle of [
      'dryer exhaust vent',
      'lint trap',
      'dishwasher filter',
      'deep clean the dishwasher',
      'heat pump filter',
      'outdoor heat pump',
      'heat pump tune-up',
      'hot water tank',
      'garage door',
      'mow the lawn',
      'gutter',
      'smoke & co',
    ]) {
      expect(titles).toContain(needle);
    }
  });

  it('has unique keys and valid zones, fixtures, recurrences and guides', () => {
    const keys = new Set(SEED_TASKS.map((seed) => seed.key));
    expect(keys.size).toBe(SEED_TASKS.length);
    for (const seed of SEED_TASKS) {
      expect(isZoneId(seed.zoneId)).toBe(true);
      if (seed.fixtureId) expect(fixtureDef(seed.fixtureId).zoneId).toBe(seed.zoneId);
      if (seed.recurrence) expect(recurrenceSchema.safeParse(seed.recurrence).success).toBe(true);
      expect(guideSchema.safeParse(seed.guide).success).toBe(true);
      expect(seed.guide.steps.length).toBeGreaterThan(0);
    }
  });

  it('flags fire-safety items as critical or high priority', () => {
    for (const seed of SEED_TASKS.filter((s) => s.risks.includes('fire'))) {
      if (seed.key === 'dryer-lint-trap') continue; // a weekly habit, not an emergency
      expect(['critical', 'high']).toContain(seed.priority);
    }
  });

  it('staggers first due dates so a new household starts with nothing overdue', () => {
    const resolved = SEED_TASKS.map((seed) => resolveSeed(seed, today));
    for (const task of resolved) {
      expect(task.dueDate).not.toBeNull();
      expect(taskTiming(makeTask(task), today).state).not.toBe('overdue');
    }
    const firstWeek = resolved.filter((task) => task.dueDate! <= '2026-10-29');
    expect(firstWeek.length).toBeLessThanOrEqual(10);
    const vent = resolved.find((task) => task.seedKey === 'dryer-vent-cleaning');
    expect(vent?.dueDate).toBe('2026-11-01');
  });
});
