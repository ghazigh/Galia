import { householdPatchSchema, profilePatchSchema } from '@shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../context';
import { bootstrapFor, loadActor, parseBody, publicOrigin, requireActor, type Env } from '../http';
import { updateHousehold } from '../repos/households';
import { createInvite } from '../repos/invites';
import { updateUser } from '../repos/users';
import { hashPassword, verifyPassword } from '../services/passwords';
import { HttpError } from '../util';

const passwordChangeSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8, 'Use at least 8 characters').max(200),
});

export function accountRoutes(ctx: AppContext) {
  const app = new Hono<Env>();

  app.get('/me', (c) => c.json(bootstrapFor(ctx, requireActor(c))));

  app.patch('/me', async (c) => {
    const actor = requireActor(c);
    const patch = await parseBody(c, profilePatchSchema);
    updateUser(ctx.db, actor.user.id, patch);
    return c.json(bootstrapFor(ctx, loadActor(ctx, actor.user.id)!));
  });

  app.post('/me/password', async (c) => {
    const actor = requireActor(c);
    const { current, next } = await parseBody(c, passwordChangeSchema);
    if (!(await verifyPassword(current, actor.user.passwordHash))) {
      throw new HttpError(422, 'Your current password is incorrect.');
    }
    updateUser(ctx.db, actor.user.id, { passwordHash: await hashPassword(next) });
    return c.body(null, 204);
  });

  app.patch('/household', async (c) => {
    const actor = requireActor(c);
    const patch = await parseBody(c, householdPatchSchema);
    updateHousehold(ctx.db, actor.household.id, patch);
    return c.json(bootstrapFor(ctx, loadActor(ctx, actor.user.id)!));
  });

  app.post('/household/invites', (c) => {
    const actor = requireActor(c);
    if (actor.members.length >= ctx.config.maxMembers) {
      throw new HttpError(409, `A household can have up to ${ctx.config.maxMembers} members.`);
    }
    const { token, invite } = createInvite(ctx.db, actor.household.id, actor.user.id);
    return c.json({ url: `${publicOrigin(c, ctx)}/join/${token}`, expiresAt: invite.expiresAt }, 201);
  });

  return app;
}
