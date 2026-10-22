import { acceptInviteSchema, loginSchema, setupSchema } from '@shared/schemas';
import { SEED_TASKS } from '@shared/seed';
import { DEFAULT_NOTIFICATION_PREFS, type Household } from '@shared/types';
import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppContext } from '../context';
import {
  bootstrapFor,
  clearSessionCookie,
  loadActor,
  parseBody,
  SESSION_COOKIE,
  setSessionCookie,
  type Env,
} from '../http';
import { countHouseholds, getHousehold, insertHousehold } from '../repos/households';
import { findOpenInvite, markInviteUsed } from '../repos/invites';
import { createSession, deleteSession } from '../repos/sessions';
import { getUser, getUserByEmail, insertUser, listUsers, MEMBER_COLORS, type UserRecord } from '../repos/users';
import { hashPassword, verifyPassword } from '../services/passwords';
import { addSeedTasks } from '../services/tasks';
import { HttpError, newId } from '../util';

type Limit = (name: string, limit: number) => MiddlewareHandler<Env>;

export function authRoutes(ctx: AppContext, limit: Limit) {
  const app = new Hono<Env>();
  // Verified against on unknown emails so a miss costs the same time as a wrong password.
  let decoyHash: Promise<string> | null = null;

  app.get('/session', (c) => {
    const actor = c.get('actor');
    return c.json({
      setupRequired: countHouseholds(ctx.db) === 0,
      bootstrap: actor ? bootstrapFor(ctx, actor) : null,
    });
  });

  app.post('/setup', limit('setup', 10), async (c) => {
    const input = await parseBody(c, setupSchema);
    if (countHouseholds(ctx.db) > 0) {
      throw new HttpError(409, 'This home is already set up — sign in instead.');
    }
    const passwordHash = await hashPassword(input.password);
    const now = ctx.now().toISOString();
    const household: Household = {
      id: newId(),
      name: input.householdName,
      timeZone: input.timeZone,
      zoneNames: {},
      createdAt: now,
    };
    const user: UserRecord = {
      id: newId(),
      householdId: household.id,
      email: input.email,
      name: input.name,
      passwordHash,
      color: MEMBER_COLORS[0],
      role: 'owner',
      prefs: DEFAULT_NOTIFICATION_PREFS,
      createdAt: now,
    };
    ctx.db.transaction(() => {
      if (countHouseholds(ctx.db) > 0) throw new HttpError(409, 'This home is already set up.');
      insertHousehold(ctx.db, household);
      insertUser(ctx.db, user);
    })();
    const keys = SEED_TASKS.filter((seed) => input.seedGroups.includes(seed.group)).map((s) => s.key);
    addSeedTasks(ctx, household, user.id, keys);
    setSessionCookie(c, ctx, createSession(ctx.db, user.id, c.req.header('user-agent') ?? null));
    return c.json(bootstrapFor(ctx, loadActor(ctx, user.id)!), 201);
  });

  app.post('/auth/login', limit('login', 10), async (c) => {
    const { email, password } = await parseBody(c, loginSchema);
    const user = getUserByEmail(ctx.db, email);
    decoyHash ??= hashPassword('decoy-password');
    const ok = await verifyPassword(password, user?.passwordHash ?? (await decoyHash));
    if (!user || !ok) throw new HttpError(401, 'That email and password don’t match.');
    setSessionCookie(c, ctx, createSession(ctx.db, user.id, c.req.header('user-agent') ?? null));
    return c.json(bootstrapFor(ctx, loadActor(ctx, user.id)!));
  });

  app.post('/auth/logout', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) deleteSession(ctx.db, token);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.get('/invites/:token', (c) => {
    const invite = findOpenInvite(ctx.db, c.req.param('token'));
    if (!invite) throw new HttpError(410, 'This invite link has expired or was already used.');
    const household = getHousehold(ctx.db, invite.householdId);
    const inviter = getUser(ctx.db, invite.createdBy);
    return c.json({
      householdName: household?.name ?? 'Home',
      invitedBy: inviter?.name ?? 'Your partner',
      expiresAt: invite.expiresAt,
    });
  });

  app.post('/invites/:token/accept', limit('invite', 10), async (c) => {
    const token = c.req.param('token');
    const input = await parseBody(c, acceptInviteSchema);
    const invite = findOpenInvite(ctx.db, token);
    if (!invite) throw new HttpError(410, 'This invite link has expired or was already used.');
    if (getUserByEmail(ctx.db, input.email)) {
      throw new HttpError(409, 'There is already an account with this email — sign in instead.');
    }
    const passwordHash = await hashPassword(input.password);
    const members = listUsers(ctx.db, invite.householdId);
    const user: UserRecord = {
      id: newId(),
      householdId: invite.householdId,
      email: input.email,
      name: input.name,
      passwordHash,
      color: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
      role: 'member',
      prefs: DEFAULT_NOTIFICATION_PREFS,
      createdAt: ctx.now().toISOString(),
    };
    ctx.db.transaction(() => {
      if (!findOpenInvite(ctx.db, token)) throw new HttpError(410, 'This invite was just used.');
      if (listUsers(ctx.db, invite.householdId).length >= ctx.config.maxMembers) {
        throw new HttpError(409, 'This household already has the maximum number of members.');
      }
      insertUser(ctx.db, user);
      markInviteUsed(ctx.db, invite.id, user.id);
    })();
    setSessionCookie(c, ctx, createSession(ctx.db, user.id, c.req.header('user-agent') ?? null));
    return c.json(bootstrapFor(ctx, loadActor(ctx, user.id)!), 201);
  });

  return app;
}
