import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Household } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { client, createTestApp } from '../testing';
import { strictJsonSchema } from './azure-openai';
import { parseTaskText, suggestMaintenance } from './features';
import { AiError, type AiProvider, type GenerateRequest } from './types';

const household: Household = {
  id: 'h1',
  name: 'Home',
  timeZone: 'America/Toronto',
  zoneNames: { bedroom3: 'Office' },
  createdAt: '2026-10-01T00:00:00Z',
};

/** Returns a canned answer and records what it was asked. */
function fakeProvider(answer: unknown) {
  const requests: GenerateRequest<unknown>[] = [];
  const provider: AiProvider = {
    name: 'Fake',
    async generate<T>(request: GenerateRequest<T>): Promise<T> {
      requests.push(request as GenerateRequest<unknown>);
      return request.schema.parse(answer);
    },
  };
  return { provider, requests };
}

describe('maintenance suggestions', () => {
  it('maps and sanitizes model output', async () => {
    const { provider, requests } = fakeProvider({
      suggestions: [
        {
          title: '  Refill the softener salt ',
          why: 'Keeps the resin regenerating.',
          steps: ['Check the brine tank', 'Add salt pellets', ''],
          zoneId: 'mechanical',
          priority: 'normal',
          risks: ['water', 'water'],
          every: 0,
          unit: 'month',
          estimateMinutes: 10,
          pro: false,
        },
      ],
    });
    const [suggestion] = await suggestMaintenance(provider, {
      household,
      prompt: 'We just added a water softener',
      existingTitles: ['Flush the hot water tank'],
    });
    expect(suggestion).toEqual({
      title: 'Refill the softener salt',
      zoneId: 'mechanical',
      priority: 'normal',
      risks: ['water'],
      recurrence: { kind: 'interval', every: 1, unit: 'month' },
      estimateMinutes: 10,
      guide: { why: 'Keeps the resin regenerating.', steps: ['Check the brine tank', 'Add salt pellets'], pro: false },
    });
    expect(requests[0].system).toContain('bedroom3: Office');
    expect(requests[0].user).toContain('- Flush the hot water tank');
    expect(requests[0].effort).toBe('medium');
  });
});

describe('natural-language task entry', () => {
  const base = {
    title: 'Call the dentist',
    notes: null,
    dueDate: '2026-10-26',
    priority: 'normal',
    quickWin: true,
    estimateMinutes: 5,
    zoneId: null,
    visibility: 'personal',
    assignee: 'unassigned',
    contact: '514-555-0100',
    repeatEvery: null,
    repeatUnit: null,
  };
  const input = {
    household,
    text: 'remind me to call the dentist next week 514-555-0100',
    today: '2026-10-22',
    meId: 'u1',
    meName: 'Ghazi',
    partner: { id: 'u2', name: 'Sam' },
  };

  it('produces a valid task draft', async () => {
    const { provider } = fakeProvider(base);
    expect(await parseTaskText(provider, input)).toMatchObject({
      kind: 'todo',
      title: 'Call the dentist',
      dueDate: '2026-10-26',
      quickWin: true,
      visibility: 'personal',
      contact: '514-555-0100',
      assigneeId: null,
    });
  });

  it('drops implausible dates and shares tasks handed to the partner', async () => {
    const { provider } = fakeProvider({ ...base, dueDate: '1999-01-01', assignee: 'partner' });
    expect(await parseTaskText(provider, input)).toMatchObject({
      dueDate: null,
      assigneeId: 'u2',
      visibility: 'shared',
    });
  });
});

describe('provider schemas', () => {
  const schema = z.object({
    title: z.string(),
    count: z.number().int(),
    zone: z.enum(['a', 'b']).nullable(),
    items: z.array(z.object({ label: z.string() })),
  });

  it('builds an Anthropic structured-output format', () => {
    const format = betaZodOutputFormat(schema);
    expect(format.type).toBe('json_schema');
    expect(format.schema).toMatchObject({ type: 'object' });
  });

  it('builds a strict Azure OpenAI schema', () => {
    const json = strictJsonSchema(schema) as {
      additionalProperties: boolean;
      required: string[];
      properties: { count: Record<string, unknown>; items: { items: { additionalProperties: boolean } } };
    };
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(['title', 'count', 'zone', 'items']);
    expect(json.properties.count).not.toHaveProperty('maximum');
    expect(json.properties.items.items.additionalProperties).toBe(false);
  });
});

describe('AI routes', () => {
  it('reports when AI is not configured', async () => {
    const { app } = createTestApp();
    const user = client(app);
    await user.post('/api/setup', {
      householdName: 'Home',
      timeZone: 'America/Toronto',
      name: 'Ghazi',
      email: 'g@example.com',
      password: 'long enough password',
      seedGroups: [],
    });
    const res = await user.post('/api/ai/maintenance', { prompt: 'water softener' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ai_disabled');
  });

  it('maps provider failures to HTTP errors', async () => {
    const failing: AiProvider = {
      name: 'Failing',
      async generate() {
        throw new AiError('rate_limited', 'Busy');
      },
    };
    const { app } = createTestApp({ ai: failing });
    const user = client(app);
    await user.post('/api/setup', {
      householdName: 'Home',
      timeZone: 'America/Toronto',
      name: 'Ghazi',
      email: 'g@example.com',
      password: 'long enough password',
      seedGroups: [],
    });
    const res = await user.post('/api/ai/parse-task', { text: 'call the dentist' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Busy', code: 'ai_rate_limited' });
  });
});
