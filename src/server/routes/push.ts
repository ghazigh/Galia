import { pushSubscriptionSchema } from '@shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../context';
import { parseBody, requireActor, type Env } from '../http';
import { deleteSubscription, listSubscriptions, upsertSubscription } from '../repos/push';
import { HttpError } from '../util';

export function pushRoutes(ctx: AppContext) {
  const app = new Hono<Env>();

  app.get('/push/status', (c) => {
    const actor = requireActor(c);
    return c.json({
      configured: ctx.notifier.enabled,
      publicKey: ctx.config.vapid?.publicKey ?? null,
      devices: listSubscriptions(ctx.db, actor.user.id).length,
    });
  });

  app.post('/push/subscribe', async (c) => {
    const actor = requireActor(c);
    const subscription = await parseBody(c, pushSubscriptionSchema);
    upsertSubscription(ctx.db, actor.user.id, subscription, c.req.header('user-agent') ?? null);
    return c.body(null, 204);
  });

  app.post('/push/unsubscribe', async (c) => {
    const actor = requireActor(c);
    const { endpoint } = await parseBody(c, z.object({ endpoint: z.string().max(2000) }));
    deleteSubscription(ctx.db, endpoint, actor.user.id);
    return c.body(null, 204);
  });

  app.post('/push/test', async (c) => {
    const actor = requireActor(c);
    if (!ctx.notifier.enabled) throw new HttpError(503, 'Push is not configured on the server.');
    if (listSubscriptions(ctx.db, actor.user.id).length === 0) {
      throw new HttpError(409, 'Turn on notifications on this device first.');
    }
    const now = ctx.now();
    ctx.notifier.enqueue([
      {
        userId: actor.user.id,
        key: `test:${now.getTime()}`,
        kind: 'test',
        title: 'Notifications are on',
        body: 'Reminders will show up here — overdue safety items, your morning digest and quick wins.',
        url: '/',
        tag: 'test',
        deliverAfter: now.toISOString(),
      },
    ]);
    return c.json(await ctx.notifier.dispatch());
  });

  return app;
}
