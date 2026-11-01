import { addDays, isYmd, WEEKDAY_SHORT, weekday, type Ymd } from '@shared/dates';
import { dueSentence } from '@shared/format';
import { describeRecurrence } from '@shared/recurrence';
import { taskCreateSchema, type TaskCreateInput } from '@shared/schemas';
import { taskTiming } from '@shared/status';
import {
  PRIORITIES,
  RISKS,
  type Completion,
  type Household,
  type Priority,
  type Risk,
  type Task,
  type ZoneId,
} from '@shared/types';
import { fixtureDef, ZONE_IDS, ZONES, zoneName } from '@shared/zones';
import { z } from 'zod';
import type { AiProvider, ChatTurn } from './types';

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

// ── Ask about a task ("what filter size do I need?") ───────────────────────────────────────

const answerSchema = z.object({
  answer: z.string().describe('The reply, in plain text. Short paragraphs; "- " at the start of a line for list items.'),
});

export interface AskContext {
  household: Household;
  task: Task;
  today: Ymd;
  askerName: string;
  memberName: (id: string | null) => string | null;
  completions: Pick<Completion, 'completedOn' | 'userId' | 'note'>[];
}

/** Everything the app knows about a task, as plain text for the model. */
export function describeTaskForAi(input: AskContext): string {
  const { task, today, household, memberName } = input;
  const timing = taskTiming(task, today);
  const lines = [
    `Title: ${task.title}`,
    `Type: ${task.kind === 'maintenance' ? 'home maintenance' : 'to-do'}${task.visibility === 'personal' ? ' (private)' : ' (shared with the household)'}`,
    task.zoneId && `Where: ${zoneName(task.zoneId, household)}`,
    task.fixtureId && `Fixture: ${fixtureDef(task.fixtureId).name}`,
    `Status: ${task.completedAt ? `done on ${task.completedAt.slice(0, 10)}` : dueSentence(timing, today)}`,
    task.dueDate && `Due date: ${task.dueDate}`,
    task.snoozedUntil && `Snoozed until: ${task.snoozedUntil}`,
    task.recurrence && `Repeats: ${describeRecurrence(task.recurrence)} (the clock restarts when it is done)`,
    `Priority: ${task.priority}`,
    task.risks.length > 0 && `Risks if forgotten: ${task.risks.join(', ')}`,
    task.estimateMinutes && `Time estimate: ${task.estimateMinutes} minutes`,
    task.quickWin && 'Quick win: yes',
    task.contact && `Contact: ${task.contact}`,
    `Assigned to: ${memberName(task.assigneeId) ?? 'nobody in particular'}`,
    task.assignedById && `Assigned by: ${memberName(task.assignedById)}`,
    task.lastCompletedAt && `Last done: ${task.lastCompletedAt.slice(0, 10)} by ${memberName(task.lastCompletedById) ?? 'someone'}`,
    task.notes.trim() && `Notes:\n${task.notes.trim()}`,
  ];
  if (task.guide) {
    lines.push(`Why it matters: ${task.guide.why}`);
    if (task.guide.steps.length) lines.push(`Steps:\n${task.guide.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
    if (task.guide.supplies?.length) lines.push(`Supplies: ${task.guide.supplies.join(', ')}`);
    if (task.guide.safety) lines.push(`Safety: ${task.guide.safety}`);
    if (task.guide.pro) lines.push('Usually done by a professional.');
  }
  if (input.completions.length) {
    lines.push(
      `Recent completions:\n${input.completions
        .map((c) => `- ${c.completedOn} by ${memberName(c.userId) ?? 'someone'}${c.note ? ` — "${c.note}"` : ''}`)
        .join('\n')}`,
    );
  }
  return lines.filter(Boolean).join('\n');
}

export async function askAboutTask(
  ai: AiProvider,
  input: AskContext & { question: string; history: ChatTurn[] },
): Promise<string> {
  const system = `You are a friendly, practical home expert inside a household app. ${input.askerName} is asking about one of their tasks. Answer their questions about it: how to do it, what to buy, how long it takes, whether it is safe to do themselves, what happens if it waits, and anything else that helps get it done.

${HOUSE_PROFILE}
Time zone: ${input.household.timeZone} — infer the climate from it. Today is ${input.today}.

The task:
${describeTaskForAi(input)}

Keep answers short and concrete (a few sentences or a short list), suited to reading on a phone. Give measurements in both metric and imperial units. When something involves gas, electrical panels, refrigerant or work at height beyond a step ladder, say when to call a professional. If you are unsure of a detail specific to their equipment (a model number, a filter size), say how to find it rather than guessing.`;

  const result = await ai.generate({
    system,
    history: input.history,
    user: input.question,
    schema: answerSchema,
    schemaName: 'task_answer',
    effort: 'medium',
  });
  return result.answer.trim().slice(0, 8000);
}
