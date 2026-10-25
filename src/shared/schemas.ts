import { z } from 'zod';
import { isHm, isValidTimeZone, isYmd } from './dates';
import type { SeedGroup } from './seed';
import { PRIORITIES, RISKS, type FixtureId, type ZoneId } from './types';
import { FIXTURES, ZONE_IDS } from './zones';

const ymd = z.string().refine(isYmd, 'Expected a calendar date (YYYY-MM-DD)');
const hm = z.string().refine(isHm, 'Expected a time (HH:MM)');
const month = z.number().int().min(1).max(12);

export const zoneIdSchema = z.enum(ZONE_IDS as [ZoneId, ...ZoneId[]]);
export const fixtureIdSchema = z.enum(FIXTURES.map((f) => f.id) as [FixtureId, ...FixtureId[]]);

export const recurrenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interval'),
    every: z.number().int().min(1).max(365),
    unit: z.enum(['day', 'week', 'month', 'year']),
    activeMonths: z.array(month).max(12).optional(),
  }),
  z.object({
    kind: z.literal('months'),
    months: z.array(month).min(1).max(12),
    day: z.number().int().min(1).max(28).optional(),
  }),
]);

export const guideSchema = z.object({
  why: z.string().max(2000),
  steps: z.array(z.string().max(600)).max(30),
  supplies: z.array(z.string().max(200)).max(30).optional(),
  safety: z.string().max(1000).optional(),
  pro: z.boolean().optional(),
});

const taskFields = {
  kind: z.enum(['maintenance', 'todo']),
  visibility: z.enum(['shared', 'personal']),
  title: z.string().trim().min(1, 'Give the task a title').max(200),
  notes: z.string().max(5000),
  guide: guideSchema.nullable(),
  zoneId: zoneIdSchema.nullable(),
  fixtureId: fixtureIdSchema.nullable(),
  priority: z.enum(PRIORITIES as ['critical', 'high', 'normal', 'low']),
  risks: z.array(z.enum(RISKS as ['fire', 'water', 'safety', 'air', 'efficiency'])).max(5),
  quickWin: z.boolean(),
  estimateMinutes: z.number().int().min(1).max(1440).nullable(),
  contact: z.string().trim().max(300).nullable(),
  dueDate: ymd.nullable(),
  recurrence: recurrenceSchema.nullable(),
  remindDaysBefore: z.number().int().min(0).max(60).nullable(),
  assigneeId: z.string().max(64).nullable(),
};

/** Create: only a title is required; the server fills in defaults. */
export const taskCreateSchema = z.object(taskFields).partial().required({ title: true });
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskPatchSchema = z
  .object({ ...taskFields, snoozedUntil: ymd.nullable() })
  .partial();
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;

export const completeSchema = z.object({
  note: z.string().max(2000).optional(),
  /** Backdate a completion ("did it yesterday"). */
  completedOn: ymd.optional(),
});
export type CompleteInput = z.infer<typeof completeSchema>;

export const snoozeSchema = z.object({ until: ymd });

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));
const password = z.string().min(8, 'Use at least 8 characters').max(200);
const personName = z.string().trim().min(1, 'Enter your name').max(60);

export const SEED_GROUP_IDS: readonly SeedGroup[] = ['essential', 'recommended', 'new-home'];

export const setupSchema = z.object({
  householdName: z.string().trim().min(1).max(80),
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  name: personName,
  email,
  password,
  seedGroups: z.array(z.enum(SEED_GROUP_IDS as ['essential', 'recommended', 'new-home'])).max(3),
});
export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export const acceptInviteSchema = z.object({ name: personName, email, password });

export const notificationPrefsSchema = z.object({
  digest: z.object({ enabled: z.boolean(), time: hm }),
  safetyAlerts: z.object({ enabled: z.boolean(), time: hm }),
  quickWins: z.object({
    enabled: z.boolean(),
    windows: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          label: z.string().trim().max(40),
          days: z.array(z.number().int().min(0).max(6)).max(7),
          time: hm,
        }),
      )
      .max(8),
  }),
  assignments: z.object({ enabled: z.boolean() }),
  quietHours: z.object({ enabled: z.boolean(), start: hm, end: hm }),
});

export const profilePatchSchema = z.object({
  name: personName.optional(),
  prefs: notificationPrefsSchema.optional(),
});

export const householdPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional(),
  zoneNames: z.partialRecord(zoneIdSchema, z.string().trim().max(40)).optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export const aiSuggestSchema = z.object({ prompt: z.string().trim().min(3).max(500) });
export const aiParseSchema = z.object({ text: z.string().trim().min(2).max(500) });
