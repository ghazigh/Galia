import type { Config } from './config';
import type { AppContext } from './context';
import { openDatabase } from './db';
import { createApp } from './app';
import { LocalPersistence } from './persistence';
import type { PushPayload, PushSender } from './services/notifications';
import { Notifier } from './services/notifications';
import type { AiProvider } from './ai/types';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    env: 'test',
    port: 0,
    databasePath: ':memory:',
    clientDir: 'dist/client',
    appOrigin: null,
    maxMembers: 3,
    cronSecret: 'cron-secret',
    reminderIntervalMinutes: 0,
    vapid: { publicKey: 'test-public-key', privateKey: 'test-private-key', subject: 'mailto:test@example.com' },
    gcs: null,
    ai: {
      provider: null,
      model: 'claude-opus-5-5',
      foundry: { resource: null, baseUrl: null, apiKey: null },
      azureOpenAi: { endpoint: null, apiKey: null, deployment: null, apiVersion: '2024-10-21' },
    },
    ...overrides,
  };
}

/** Push sender that records what would have been delivered. */
export class FakePushSender implements PushSender {
  readonly enabled = true;
  readonly sent: { endpoint: string; payload: PushPayload }[] = [];
  gone = new Set<string>();
  async send(subscription: { endpoint: string }, payload: PushPayload) {
    if (this.gone.has(subscription.endpoint)) return { ok: false as const, gone: true, error: '410 Gone' };
    this.sent.push({ endpoint: subscription.endpoint, payload });
    return { ok: true as const };
  }
}

export function createTestApp(options: { now?: () => Date; ai?: AiProvider | null; config?: Partial<Config> } = {}) {
  const db = openDatabase(':memory:');
  const push = new FakePushSender();
  let clock = options.now ?? (() => new Date());
  const ctx: AppContext = {
    config: testConfig(options.config),
    db,
    notifier: new Notifier(db, push, () => clock()),
    ai: options.ai ?? null,
    persistence: new LocalPersistence(),
    now: () => clock(),
  };
  const app = createApp(ctx);
  return {
    app,
    ctx,
    push,
    setNow(date: Date) {
      clock = () => date;
    },
  };
}

/** Minimal cookie-aware client around `app.request`. */
export function client(app: ReturnType<typeof createApp>) {
  let cookie = '';
  const request = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = /hos_session=([^;]*)/.exec(setCookie);
      if (match) cookie = match[1] ? `hos_session=${match[1]}` : '';
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    get: (path: string) => request('GET', path),
    post: (path: string, body?: unknown, headers?: Record<string, string>) => request('POST', path, body, headers),
    patch: (path: string, body: unknown) => request('PATCH', path, body),
    del: (path: string) => request('DELETE', path),
    get cookie() {
      return cookie;
    },
  };
}
