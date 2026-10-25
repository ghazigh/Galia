import { Hono } from 'hono';
import type { AppContext } from '../context';
import { safeEqual, type Env } from '../http';
import { runReminders } from '../services/reminders';
import { HttpError } from '../util';

/** Called by Cloud Scheduler (or any cron) every ~15 minutes with the shared secret header. */
export function cronRoutes(ctx: AppContext) {
  const app = new Hono<Env>();

  app.post('/cron/reminders', async (c) => {
    const secret = ctx.config.cronSecret;
    if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured.');
    const provided =
      c.req.header('x-cron-secret') ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!provided || !safeEqual(provided, secret)) throw new HttpError(401, 'Unauthorized');
    return c.json(await runReminders(ctx));
  });

  return app;
}
