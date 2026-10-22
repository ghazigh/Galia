import { timingSafeEqual } from 'node:crypto';
import type { Bootstrap } from '@shared/types';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { z } from 'zod';
import type { Actor, AppContext } from './context';
import { getHousehold } from './repos/households';
import { resolveSession, SESSION_TTL_DAYS } from './repos/sessions';
import { getUser, listUsers, toMe, toMember } from './repos/users';
import { HttpError } from './util';

export type Env = { Variables: { actor: Actor | null } };

export const SESSION_COOKIE = 'hos_session';

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'Expected a JSON body');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(422, `${where}${issue?.message ?? 'Invalid input'}`, 'validation');
  }
  return result.data;
}

export function requireActor(c: Context<Env>): Actor {
  const actor = c.get('actor');
  if (!actor) throw new HttpError(401, 'Please sign in', 'unauthenticated');
  return actor;
}

function isSecureRequest(c: Context, ctx: AppContext): boolean {
  if (ctx.config.env === 'production') return true;
  return c.req.header('x-forwarded-proto') === 'https' || c.req.url.startsWith('https:');
}

export function setSessionCookie(c: Context, ctx: AppContext, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c, ctx),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Public origin of this deployment, for links handed to users (invites). */
export function publicOrigin(c: Context, ctx: AppContext): string {
  if (ctx.config.appOrigin) return ctx.config.appOrigin;
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host;
  return `${proto}://${host}`;
}

export function loadActor(ctx: AppContext, userId: string): Actor | null {
  const user = getUser(ctx.db, userId);
  const household = user ? getHousehold(ctx.db, user.householdId) : null;
  if (!user || !household) return null;
  return { user, household, members: listUsers(ctx.db, household.id) };
}

export function bootstrapFor(ctx: AppContext, actor: Actor): Bootstrap {
  return {
    me: toMe(actor.user),
    household: actor.household,
    members: actor.members.map(toMember),
    ai: { enabled: ctx.ai !== null, provider: ctx.ai?.name ?? null },
    push: { publicKey: ctx.config.vapid?.publicKey ?? null },
  };
}

export function sessionMiddleware(ctx: AppContext): MiddlewareHandler<Env> {
  return async (c, next) => {
    c.set('actor', null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const session = resolveSession(ctx.db, token);
      const actor = session ? loadActor(ctx, session.userId) : null;
      if (session && actor) {
        c.set('actor', actor);
        if (session.renewed) setSessionCookie(c, ctx, token);
      } else {
        clearSessionCookie(c);
      }
    }
    await next();
  };
}

/**
 * CSRF guard: state-changing requests must come from our own origin. SameSite=Lax cookies
 * already stop most cross-site posts; this closes the gap for older browsers.
 */
export function originGuard(ctx: AppContext): MiddlewareHandler<Env> {
  return async (c, next) => {
    const method = c.req.method;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !c.req.path.startsWith('/api/cron/')) {
      const origin = c.req.header('origin');
      if (origin) {
        const allowed = new Set<string>();
        if (ctx.config.appOrigin) allowed.add(new URL(ctx.config.appOrigin).host);
        const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
        if (host) allowed.add(host);
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch {
          // fall through to rejection
        }
        if (!allowed.has(originHost)) throw new HttpError(403, 'Cross-site request blocked');
      }
    }
    await next();
  };
}

/** After a successful write, make the database durable before the response goes out. */
export function persistMiddleware(ctx: AppContext): MiddlewareHandler<Env> {
  return async (c, next) => {
    await next();
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.res.status >= 500) return;
    try {
      await ctx.persistence.flush();
    } catch (err) {
      console.error('[persistence] snapshot upload failed; will retry on the next write', err);
    }
  };
}

/** Small fixed-window limiter for sign-in style endpoints (per client IP). */
export function createRateLimiter() {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (name: string, limit: number, windowMs = 60_000): MiddlewareHandler<Env> =>
    async (c, next) => {
      const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
      const key = `${name}:${ip}`;
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (bucket.count > limit) throw new HttpError(429, 'Too many attempts — wait a minute and try again.');
      await next();
    };
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
