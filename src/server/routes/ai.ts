import { todayIn } from '@shared/dates';
import { aiParseSchema, aiSuggestSchema } from '@shared/schemas';
import { Hono, type MiddlewareHandler } from 'hono';
import { parseTaskText, suggestMaintenance } from '../ai/features';
import type { AppContext } from '../context';
import { parseBody, requireActor, type Env } from '../http';
import { listTasks } from '../services/tasks';
import { HttpError } from '../util';

type Limit = (name: string, limit: number) => MiddlewareHandler<Env>;

export function aiRoutes(ctx: AppContext, limit: Limit) {
  const app = new Hono<Env>();

  const provider = () => {
    if (!ctx.ai) throw new HttpError(503, 'AI features are not configured on this server.', 'ai_disabled');
    return ctx.ai;
  };

  app.post('/ai/maintenance', limit('ai', 20), async (c) => {
    const actor = requireActor(c);
    const { prompt } = await parseBody(c, aiSuggestSchema);
    const existingTitles = listTasks(ctx, actor)
      .filter((task) => task.kind === 'maintenance')
      .map((task) => task.title);
    const suggestions = await suggestMaintenance(provider(), {
      household: actor.household,
      prompt,
      existingTitles,
    });
    return c.json({ suggestions });
  });

  app.post('/ai/parse-task', limit('ai', 30), async (c) => {
    const actor = requireActor(c);
    const { text } = await parseBody(c, aiParseSchema);
    const partner = actor.members.find((member) => member.id !== actor.user.id) ?? null;
    const draft = await parseTaskText(provider(), {
      household: actor.household,
      text,
      today: todayIn(actor.household.timeZone, ctx.now()),
      meId: actor.user.id,
      meName: actor.user.name,
      partner: partner ? { id: partner.id, name: partner.name } : null,
    });
    return c.json({ draft });
  });

  return app;
}
