import type { Bootstrap, Task } from '@shared/types';
import { SEED_TASKS } from '@shared/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, createTestApp } from './testing';

const SETUP = {
  householdName: 'Our house',
  timeZone: 'America/Toronto',
  name: 'Ghazi',
  email: 'ghazi@example.com',
  password: 'correct horse battery',
  seedGroups: ['essential', 'recommended', 'new-home'],
};

// Thursday 2026-10-22, 14:00 in Toronto.
const NOW = new Date('2026-10-22T18:00:00Z');

async function setUpHousehold() {
  const env = createTestApp({ now: () => NOW });
  const owner = client(env.app);
  const res = await owner.post('/api/setup', SETUP);
  expect(res.status).toBe(201);
  return { ...env, owner, bootstrap: res.body as Bootstrap };
}

async function invitePartner(env: Awaited<ReturnType<typeof setUpHousehold>>) {
  const invite = await env.owner.post('/api/household/invites');
  expect(invite.status).toBe(201);
  const token = (invite.body.url as string).split('/join/')[1];
  const partner = client(env.app);
  const preview = await partner.get(`/api/invites/${token}`);
  expect(preview.body).toMatchObject({ householdName: 'Our house', invitedBy: 'Ghazi' });
  const joined = await partner.post(`/api/invites/${token}/accept`, {
    name: 'Sam',
    email: 'sam@example.com',
    password: 'another long password',
  });
  expect(joined.status).toBe(201);
  return { partner, partnerId: (joined.body as Bootstrap).me.id, token };
}

describe('setup and sign-in', () => {
  it('reports setup state before anything exists', async () => {
    const { app } = createTestApp();
    const res = await client(app).get('/api/session');
    expect(res.body).toEqual({ setupRequired: true, bootstrap: null });
  });

  it('creates the household, signs the owner in and seeds the expert schedule', async () => {
    const { owner, bootstrap } = await setUpHousehold();
    expect(bootstrap.me).toMatchObject({ name: 'Ghazi', role: 'owner' });
    expect(bootstrap.household.timeZone).toBe('America/Toronto');
    const tasks = (await owner.get('/api/tasks')).body as Task[];
    expect(tasks).toHaveLength(SEED_TASKS.length);
    expect(tasks.every((t) => t.kind === 'maintenance' && t.visibility === 'shared')).toBe(true);
    const vent = tasks.find((t) => t.seedKey === 'dryer-vent-cleaning')!;
    expect(vent).toMatchObject({ dueDate: '2026-11-01', priority: 'critical', zoneId: 'mechanical' });
  });

  it('refuses a second setup and rejects bad passwords', async () => {
    const { app } = await setUpHousehold();
    const stranger = client(app);
    expect((await stranger.post('/api/setup', SETUP)).status).toBe(409);
    expect((await stranger.post('/api/auth/login', { email: SETUP.email, password: 'nope' })).status).toBe(401);
    const ok = await stranger.post('/api/auth/login', { email: 'GHAZI@example.com', password: SETUP.password });
    expect(ok.status).toBe(200);
    expect((await stranger.get('/api/me')).status).toBe(200);
    await stranger.post('/api/auth/logout');
    expect((await stranger.get('/api/me')).status).toBe(401);
  });

  it('blocks cross-site writes', async () => {
    const { owner } = await setUpHousehold();
    const res = await owner.post('/api/tasks', { title: 'x' }, { origin: 'https://evil.example', host: 'localhost' });
    expect(res.status).toBe(403);
  });
});

describe('invites', () => {
  it('lets the partner join once', async () => {
    const env = await setUpHousehold();
    const { partner, token } = await invitePartner(env);
    const me = (await partner.get('/api/me')).body as Bootstrap;
    expect(me.members.map((m) => m.name)).toEqual(['Ghazi', 'Sam']);
    expect((await client(env.app).get(`/api/invites/${token}`)).status).toBe(410);
  });
});

describe('tasks', () => {
  let env: Awaited<ReturnType<typeof setUpHousehold>>;
  let partner: ReturnType<typeof client>;
  let partnerId: string;

  beforeEach(async () => {
    env = await setUpHousehold();
    ({ partner, partnerId } = await invitePartner(env));
  });

  it('keeps personal tasks private', async () => {
    const created = await env.owner.post('/api/tasks', {
      title: 'Book a dentist appointment',
      visibility: 'personal',
      quickWin: true,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const partnerTasks = (await partner.get('/api/tasks')).body as Task[];
    expect(partnerTasks.some((t) => t.id === id)).toBe(false);
    expect((await partner.get(`/api/tasks/${id}`)).status).toBe(404);
  });

  it('assigns a task to the partner and pushes a notification', async () => {
    await partner.post('/api/push/subscribe', {
      endpoint: 'https://push.example/sam',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    const created = await env.owner.post('/api/tasks', {
      title: 'Book the car service',
      quickWin: true,
      assigneeId: partnerId,
    });
    expect(created.body).toMatchObject({ assigneeId: partnerId, assignedById: env.bootstrap.me.id });
    await env.ctx.notifier.dispatch();
    expect(env.push.sent).toHaveLength(1);
    expect(env.push.sent[0].payload).toMatchObject({
      title: 'Ghazi assigned you a task',
      body: 'Book the car service',
      url: `/task/${created.body.id}`,
    });
  });

  it('rejects assigning to someone outside the household', async () => {
    const res = await env.owner.post('/api/tasks', { title: 'x', assigneeId: 'nobody' });
    expect(res.status).toBe(422);
  });

  it('completes a recurring task, logs history and can undo it', async () => {
    const tasks = (await env.owner.get('/api/tasks')).body as Task[];
    const filter = tasks.find((t) => t.seedKey === 'heat-pump-filter-check')!;
    expect(filter.dueDate).toBe('2026-10-27');

    const done = await partner.post(`/api/tasks/${filter.id}/complete`, { note: 'Looked clean' });
    expect(done.status).toBe(200);
    expect(done.body.task).toMatchObject({ dueDate: '2026-11-22', lastCompletedById: partnerId });
    const history = (await env.owner.get(`/api/tasks/${filter.id}/history`)).body;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ note: 'Looked clean', completedOn: '2026-10-22' });

    const undone = await partner.post(`/api/tasks/${filter.id}/undo-complete`);
    expect(undone.body).toMatchObject({ dueDate: '2026-10-27', lastCompletedAt: null });
    expect((await env.owner.get(`/api/tasks/${filter.id}/history`)).body).toHaveLength(0);
  });

  it('completes one-off to-dos and snoozes others', async () => {
    const todo = (await env.owner.post('/api/tasks', { title: 'Call the insurer', dueDate: '2026-10-22' })).body;
    const done = await env.owner.post(`/api/tasks/${todo.id}/complete`);
    expect(done.body.task.completedAt).not.toBeNull();
    expect((await env.owner.post(`/api/tasks/${todo.id}/complete`)).status).toBe(409);

    const other = (await env.owner.post('/api/tasks', { title: 'Fix the gate', dueDate: '2026-10-22' })).body;
    expect((await env.owner.post(`/api/tasks/${other.id}/snooze`, { until: '2026-10-22' })).status).toBe(422);
    const snoozed = await env.owner.post(`/api/tasks/${other.id}/snooze`, { until: '2026-10-25' });
    expect(snoozed.body.snoozedUntil).toBe('2026-10-25');
  });

  it('keeps zone and fixture consistent and forces maintenance to be shared', async () => {
    const created = await env.owner.post('/api/tasks', {
      title: 'Descale the water heater',
      kind: 'maintenance',
      visibility: 'personal',
      fixtureId: 'water-heater',
      recurrence: { kind: 'interval', every: 1, unit: 'year' },
    });
    expect(created.body).toMatchObject({ zoneId: 'mechanical', visibility: 'shared', dueDate: '2026-10-22' });
    const moved = await env.owner.patch(`/api/tasks/${created.body.id}`, { zoneId: 'kitchen' });
    expect(moved.body).toMatchObject({ zoneId: 'kitchen', fixtureId: null });
  });

  it('soft-deletes and restores', async () => {
    const todo = (await env.owner.post('/api/tasks', { title: 'Temp' })).body;
    expect((await env.owner.del(`/api/tasks/${todo.id}`)).status).toBe(204);
    expect((await env.owner.get(`/api/tasks/${todo.id}`)).status).toBe(404);
    expect((await env.owner.post(`/api/tasks/${todo.id}/restore`)).body.id).toBe(todo.id);
  });

  it('validates input', async () => {
    const res = await env.owner.post('/api/tasks', { title: '', dueDate: '2026-02-31' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation');
  });

  it('lists and re-adds catalog items', async () => {
    const tasks = (await env.owner.get('/api/tasks')).body as Task[];
    const radon = tasks.find((t) => t.seedKey === 'radon-test')!;
    await env.owner.del(`/api/tasks/${radon.id}`);
    const catalog = (await env.owner.get('/api/maintenance/catalog')).body as { key: string; added: boolean }[];
    expect(catalog.find((item) => item.key === 'radon-test')?.added).toBe(false);
    const added = await env.owner.post('/api/maintenance/catalog', { keys: ['radon-test', 'smoke-co-test'] });
    expect(added.body.map((t: Task) => t.seedKey)).toEqual(['radon-test']);
  });
});

describe('scheduled reminders', () => {
  it('requires the cron secret and sends the morning digest once', async () => {
    const env = await setUpHousehold();
    await env.owner.post('/api/push/subscribe', {
      endpoint: 'https://push.example/ghazi',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    const cron = client(env.app);
    expect((await cron.post('/api/cron/reminders')).status).toBe(401);

    // 2026-11-01 07:50 in Toronto (EST, UTC−5): the dryer vent is due today.
    env.setNow(new Date('2026-11-01T12:50:00Z'));
    const first = await cron.post('/api/cron/reminders', undefined, { 'x-cron-secret': 'cron-secret' });
    expect(first.status).toBe(200);
    expect(first.body.dispatch.sent).toBeGreaterThanOrEqual(1);
    const digest = env.push.sent.find((s) => s.payload.tag === 'digest');
    expect(digest?.payload.body).toContain('Clean the dryer exhaust vent');

    const again = await cron.post('/api/cron/reminders', undefined, { 'x-cron-secret': 'cron-secret' });
    expect(again.body.queued).toBe(0);
  });

  it('drops subscriptions the push service reports as gone', async () => {
    const env = await setUpHousehold();
    await env.owner.post('/api/push/subscribe', {
      endpoint: 'https://push.example/old',
      keys: { p256dh: 'key', auth: 'auth' },
    });
    env.push.gone.add('https://push.example/old');
    const res = await env.owner.post('/api/push/test');
    expect(res.body).toMatchObject({ sent: 0, skipped: 1 });
    expect((await env.owner.get('/api/push/status')).body.devices).toBe(0);
  });
});
