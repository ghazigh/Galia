import { Hono } from 'hono';
import { AiError } from './ai/types';
import type { AppContext } from './context';
import {
  createRateLimiter,
  originGuard,
  persistMiddleware,
  sessionMiddleware,
  type Env,
} from './http';
import { accountRoutes } from './routes/account';
import { aiRoutes } from './routes/ai';
import { authRoutes } from './routes/auth';
import { cronRoutes } from './routes/cron';
import { pushRoutes } from './routes/push';
import { taskRoutes } from './routes/tasks';
import { HttpError } from './util';

const AI_STATUS = {
  auth: 503,
  rate_limited: 429,
  unavailable: 503,
  refused: 422,
  invalid: 502,
  upstream: 502,
} as const;

/** The JSON API. Static client serving is mounted separately (see static.ts). */
export function createApp(ctx: AppContext): Hono<Env> {
  const app = new Hono<Env>();
  const limit = createRateLimiter();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, code: err.code }, err.status);
    if (err instanceof AiError) {
      return c.json({ error: err.message, code: `ai_${err.code}` }, AI_STATUS[err.code]);
    }
    console.error(err);
    return c.json({ error: 'Something went wrong on our side.' }, 500);
  });

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.use('/api/*', originGuard(ctx), sessionMiddleware(ctx), persistMiddleware(ctx));

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      persistence: ctx.persistence.kind,
      push: ctx.notifier.enabled,
      ai: ctx.ai?.name ?? null,
    }),
  );

  app.route('/api', authRoutes(ctx, limit));
  app.route('/api', accountRoutes(ctx));
  app.route('/api', taskRoutes(ctx));
  app.route('/api', pushRoutes(ctx));
  app.route('/api', aiRoutes(ctx, limit));
  app.route('/api', cronRoutes(ctx));

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
  return app;
}
