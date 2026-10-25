import { completeSchema, snoozeSchema, taskCreateSchema, taskPatchSchema } from '@shared/schemas';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../context';
import { parseBody, requireActor, type Env } from '../http';
import {
  addSeedTasks,
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  patchTask,
  requireTask,
  restoreTask,
  seedCatalog,
  snoozeTask,
  taskHistory,
  undoCompletion,
} from '../services/tasks';

const seedRequestSchema = z.object({ keys: z.array(z.string().max(80)).min(1).max(100) });

export function taskRoutes(ctx: AppContext) {
  const app = new Hono<Env>();

  app.get('/tasks', (c) => c.json(listTasks(ctx, requireActor(c))));

  app.post('/tasks', async (c) => {
    const actor = requireActor(c);
    const input = await parseBody(c, taskCreateSchema);
    return c.json(createTask(ctx, actor, input), 201);
  });

  app.get('/tasks/:id', (c) => c.json(requireTask(ctx, requireActor(c), c.req.param('id'))));

  app.patch('/tasks/:id', async (c) => {
    const actor = requireActor(c);
    const patch = await parseBody(c, taskPatchSchema);
    return c.json(patchTask(ctx, actor, c.req.param('id'), patch));
  });

  app.delete('/tasks/:id', (c) => {
    deleteTask(ctx, requireActor(c), c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/tasks/:id/restore', (c) => c.json(restoreTask(ctx, requireActor(c), c.req.param('id'))));

  app.post('/tasks/:id/complete', async (c) => {
    const actor = requireActor(c);
    const input = c.req.header('content-type')?.includes('json') ? await parseBody(c, completeSchema) : {};
    return c.json(completeTask(ctx, actor, c.req.param('id'), input));
  });

  app.post('/tasks/:id/undo-complete', (c) =>
    c.json(undoCompletion(ctx, requireActor(c), c.req.param('id'))),
  );

  app.post('/tasks/:id/snooze', async (c) => {
    const actor = requireActor(c);
    const { until } = await parseBody(c, snoozeSchema);
    return c.json(snoozeTask(ctx, actor, c.req.param('id'), until));
  });

  app.get('/tasks/:id/history', (c) => c.json(taskHistory(ctx, requireActor(c), c.req.param('id'))));

  app.get('/maintenance/catalog', (c) => c.json(seedCatalog(ctx, requireActor(c))));

  app.post('/maintenance/catalog', async (c) => {
    const actor = requireActor(c);
    const { keys } = await parseBody(c, seedRequestSchema);
    return c.json(addSeedTasks(ctx, actor.household, actor.user.id, keys), 201);
  });

  return app;
}
