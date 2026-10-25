import { addDays, isYmd, WEEKDAY_SHORT, weekday, type Ymd } from '@shared/dates';
import { taskCreateSchema, type TaskCreateInput } from '@shared/schemas';
import { PRIORITIES, RISKS, type Household, type Priority, type Risk, type ZoneId } from '@shared/types';
import { ZONE_IDS, ZONES, zoneName } from '@shared/zones';
import { z } from 'zod';
import type { AiProvider } from './types';

const zoneEnum = z.enum(ZONE_IDS as [ZoneId, ...ZoneId[]]);
const priorityEnum = z.enum(PRIORITIES as [Priority, ...Priority[]]);
const riskEnum = z.enum(RISKS as [Risk, ...Risk[]]);
const unitEnum = z.enum(['day', 'week', 'month', 'year']);

const HOUSE_PROFILE = `House profile:
- Level −1 (basement): garage; mechanical room with the central heat pump (heating and cooling), the hot water tank and the laundry (washer, vented dryer)
- Level 0 (ground floor): entry, living room, kitchen with dishwasher
- Level +1 (upper floor): three bedrooms, one bathroom with a shower and a bathtub
- Outside: backyard lawn, heat pump outdoor unit; pitched roof with gutters`;

function zoneList(household: Household): string {
  return ZONES.map((zone) => `- ${zone.id}: ${zoneName(zone.id, household)}`).join('\n');
}

// ── Maintenance suggestions ("I just added a water softener — what does it need?") ──────────

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().describe('Short imperative title, e.g. "Refill the water softener salt"'),
      why: z.string().describe('One or two sentences on why it matters'),
      steps: z.array(z.string()).describe('3–6 concrete steps'),
      zoneId: zoneEnum,
      priority: priorityEnum,
      risks: z.array(riskEnum),
      every: z.number().int().describe('Recurrence interval count'),
      unit: unitEnum,
      estimateMinutes: z.number().int(),
      pro: z.boolean().describe('True when a professional usually does it'),
    }),
  ),
});

export interface MaintenanceSuggestion {
  title: string;
  zoneId: ZoneId;
  priority: Priority;
  risks: Risk[];
  recurrence: { kind: 'interval'; every: number; unit: 'day' | 'week' | 'month' | 'year' };
  estimateMinutes: number;
  guide: { why: string; steps: string[]; pro: boolean };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

export async function suggestMaintenance(
  ai: AiProvider,
  input: { household: Household; prompt: string; existingTitles: string[] },
): Promise<MaintenanceSuggestion[]> {
  const system = `You are a home-maintenance expert helping a two-person household look after their house. They will describe something new in their home (an appliance, a renovation, a feature) or ask what something needs. Propose the recurring maintenance it requires so nothing important is forgotten.

${HOUSE_PROFILE}
Time zone: ${input.household.timeZone} — infer the climate from it.

Zones (use the id):
${zoneList(input.household)}

Suggest 1 to 6 tasks — only what the item genuinely needs, and nothing already on their list. Give each a realistic interval, a time estimate in minutes, and practical steps a homeowner can follow. Flag fire, water-damage, electrical and gas hazards with the matching risk and a high or critical priority. Give measurements in both metric and imperial units.`;

  const user = `Already on their maintenance list:\n${
    input.existingTitles.length ? input.existingTitles.map((t) => `- ${t}`).join('\n') : '(nothing yet)'
  }\n\nTheir request: ${input.prompt}`;

  const result = await ai.generate({
    system,
    user,
    schema: suggestionsSchema,
    schemaName: 'maintenance_suggestions',
    effort: 'medium',
  });

  return result.suggestions.slice(0, 6).map((s) => ({
    title: s.title.trim().slice(0, 200),
    zoneId: s.zoneId,
    priority: s.priority,
    risks: [...new Set(s.risks)].slice(0, 5),
    recurrence: { kind: 'interval', every: clamp(s.every, 1, 365), unit: s.unit },
    estimateMinutes: clamp(s.estimateMinutes, 1, 1440),
    guide: {
      why: s.why.trim().slice(0, 2000),
      steps: s.steps.map((step) => step.trim().slice(0, 600)).filter(Boolean).slice(0, 12),
      pro: s.pro,
    },
  }));
}

// ── Natural-language quick add ("remind me to call the dentist next week") ─────────────────

const parsedTaskSchema = z.object({
  title: z.string().describe('Short imperative title without the date or who does it'),
  notes: z.string().nullable(),
  dueDate: z.string().nullable().describe('YYYY-MM-DD, or null when no date is implied'),
  priority: priorityEnum,
  quickWin: z.boolean().describe('Short call, booking, email or errand under ~15 minutes'),
  estimateMinutes: z.number().int().nullable(),
  zoneId: zoneEnum.nullable(),
  visibility: z.enum(['shared', 'personal']),
  assignee: z.enum(['me', 'partner', 'unassigned']),
  contact: z.string().nullable().describe('Phone number, email or URL mentioned in the note'),
  repeatEvery: z.number().int().nullable(),
  repeatUnit: unitEnum.nullable(),
});

export async function parseTaskText(
  ai: AiProvider,
  input: { household: Household; text: string; today: Ymd; meName: string; partner: { id: string; name: string } | null; meId: string },
): Promise<TaskCreateInput> {
  const dayName = WEEKDAY_SHORT[weekday(input.today)];
  const system = `You turn a quick note into a structured task for a household app shared by ${input.meName}${
    input.partner ? ` and ${input.partner.name}` : ''
  }. ${input.meName} wrote the note. Today is ${dayName} ${input.today} (${input.household.timeZone}).

Zones (use the id, only when the task clearly happens there):
${zoneList(input.household)}

Resolve relative dates to YYYY-MM-DD ("tomorrow", "Friday" = the coming Friday, "next week" = next Monday, "end of month" = the last day of this month). Mark short calls, bookings and errands as quick wins. Use "personal" visibility for private matters (health, personal appointments) and "shared" for household matters. Set the assignee to "partner" only when the note says ${input.partner?.name ?? 'the other person'} should do it. Only fill the repeat fields when the note says it repeats.`;

  const parsed = await ai.generate({
    system,
    user: input.text,
    schema: parsedTaskSchema,
    schemaName: 'task_draft',
    effort: 'low',
  });

  const recurrence =
    parsed.repeatEvery && parsed.repeatUnit
      ? { kind: 'interval' as const, every: clamp(parsed.repeatEvery, 1, 365), unit: parsed.repeatUnit }
      : null;
  // Never trust a date the model made up outside a sane window.
  const dueDate =
    parsed.dueDate && isYmd(parsed.dueDate) && parsed.dueDate >= addDays(input.today, -1) && parsed.dueDate <= addDays(input.today, 3 * 365)
      ? parsed.dueDate
      : null;
  const assigneeId =
    parsed.assignee === 'partner' && input.partner
      ? input.partner.id
      : parsed.assignee === 'me'
        ? input.meId
        : null;

  return taskCreateSchema.parse({
    kind: 'todo',
    title: parsed.title.trim().slice(0, 200) || input.text.slice(0, 200),
    notes: parsed.notes?.trim().slice(0, 5000) ?? '',
    dueDate,
    priority: parsed.priority,
    quickWin: parsed.quickWin,
    estimateMinutes: parsed.estimateMinutes ? clamp(parsed.estimateMinutes, 1, 1440) : null,
    zoneId: parsed.zoneId,
    visibility: assigneeId && assigneeId !== input.meId ? 'shared' : parsed.visibility,
    assigneeId,
    contact: parsed.contact?.trim().slice(0, 300) || null,
    recurrence,
  });
}
