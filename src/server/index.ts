import fs from 'node:fs';
import { serve } from '@hono/node-server';
import { createAiProvider } from './ai';
import { createApp } from './app';
import { loadConfig } from './config';
import type { AppContext } from './context';
import { openDatabase } from './db';
import { GcsPersistence, LocalPersistence, metadataToken, type Persistence } from './persistence';
import { purgeOutbox } from './repos/push';
import { purgeExpiredSessions } from './repos/sessions';
import { purgeDeletedTasks } from './repos/tasks';
import { createWebPushSender, disabledPushSender, Notifier } from './services/notifications';
import { runReminders } from './services/reminders';
import { mountClient } from './static';

async function main() {
  const config = loadConfig();

  const persistence: Persistence = config.gcs
    ? new GcsPersistence({ ...config.gcs, token: metadataToken() })
    : new LocalPersistence();
  await persistence.restore(config.databasePath);
  const db = openDatabase(config.databasePath);
  persistence.attach(db);

  const ctx: AppContext = {
    config,
    db,
    notifier: new Notifier(db, config.vapid ? createWebPushSender(config.vapid) : disabledPushSender),
    ai: createAiProvider(config),
    persistence,
    now: () => new Date(),
  };

  const housekeeping = () => {
    purgeExpiredSessions(db);
    purgeDeletedTasks(db);
    purgeOutbox(db);
  };
  housekeeping();

  const app = createApp(ctx);
  if (fs.existsSync(config.clientDir)) {
    mountClient(app, config.clientDir);
  } else if (config.env === 'production') {
    console.warn(`[startup] client build not found at ${config.clientDir}; serving the API only`);
  }

  if (!config.vapid) console.warn('[startup] VAPID keys missing — push notifications disabled (run `npm run vapid`)');
  if (!config.cronSecret && config.reminderIntervalMinutes === 0) {
    console.warn('[startup] no CRON_SECRET and no in-process reminder loop — scheduled reminders will not run');
  }
  console.info(
    `[startup] persistence=${persistence.kind} push=${ctx.notifier.enabled} ai=${ctx.ai?.name ?? 'off'}`,
  );

  const server = serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
    console.info(`[startup] Household OS listening on http://localhost:${info.port}`);
  });

  const timers: NodeJS.Timeout[] = [setInterval(housekeeping, 24 * 60 * 60 * 1000)];
  if (config.reminderIntervalMinutes > 0) {
    const tick = () =>
      runReminders(ctx)
        .then(() => persistence.flush())
        .catch((err) => console.error('[reminders] run failed', err));
    timers.push(setInterval(tick, config.reminderIntervalMinutes * 60_000));
    setTimeout(tick, 5_000);
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[shutdown] ${signal} received`);
    timers.forEach(clearInterval);
    server.close();
    try {
      await persistence.flush();
    } catch (err) {
      console.error('[shutdown] final snapshot failed', err);
    }
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[startup] fatal', err);
  process.exit(1);
});
