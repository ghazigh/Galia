import path from 'node:path';

export type AiProviderName = 'foundry' | 'azure-openai';

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  databasePath: string;
  /** Directory with the built client (index.html, assets, sw.js). */
  clientDir: string;
  /** Public origin, e.g. https://home.example.com — used for CSRF checks and push links. */
  appOrigin: string | null;
  maxMembers: number;
  cronSecret: string | null;
  /** Run the reminder loop in-process every N minutes (0 = rely on an external scheduler). */
  reminderIntervalMinutes: number;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  gcs: { bucket: string; object: string } | null;
  ai: {
    provider: AiProviderName | null;
    model: string;
    foundry: { resource: string | null; baseUrl: string | null; apiKey: string | null };
    azureOpenAi: {
      endpoint: string | null;
      apiKey: string | null;
      deployment: string | null;
      apiVersion: string;
    };
  };
}

function str(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function int(name: string, fallback: number): number {
  const value = str(name);
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function resolveAiProvider(): AiProviderName | null {
  const explicit = str('AI_PROVIDER');
  if (explicit === 'none' || explicit === 'off') return null;
  if (explicit === 'foundry' || explicit === 'azure-openai') return explicit;
  if (explicit) throw new Error(`AI_PROVIDER must be "foundry", "azure-openai" or "none"`);
  // Auto-detect from whichever credentials are present.
  if (str('ANTHROPIC_FOUNDRY_API_KEY')) return 'foundry';
  if (str('AZURE_OPENAI_API_KEY') && str('AZURE_OPENAI_ENDPOINT')) return 'azure-openai';
  return null;
}

export function loadConfig(): Config {
  const nodeEnv = str('NODE_ENV');
  const env = nodeEnv === 'production' ? 'production' : nodeEnv === 'test' ? 'test' : 'development';
  const vapidPublic = str('VAPID_PUBLIC_KEY');
  const vapidPrivate = str('VAPID_PRIVATE_KEY');
  const bucket = str('GCS_BUCKET');

  return {
    env,
    port: int('PORT', 8787),
    databasePath: path.resolve(str('DATABASE_PATH') ?? 'data/household.db'),
    clientDir: path.resolve(str('CLIENT_DIR') ?? 'dist/client'),
    appOrigin: str('APP_ORIGIN')?.replace(/\/+$/, '') ?? null,
    maxMembers: int('MAX_MEMBERS', 3),
    cronSecret: str('CRON_SECRET'),
    reminderIntervalMinutes: int('REMINDER_INTERVAL_MINUTES', env === 'development' ? 5 : 0),
    vapid:
      vapidPublic && vapidPrivate
        ? {
            publicKey: vapidPublic,
            privateKey: vapidPrivate,
            subject: str('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
          }
        : null,
    gcs: bucket ? { bucket, object: str('GCS_OBJECT') ?? 'household.db' } : null,
    ai: {
      provider: resolveAiProvider(),
      model: str('AI_MODEL') ?? 'claude-opus-5-5',
      foundry: {
        resource: str('ANTHROPIC_FOUNDRY_RESOURCE'),
        baseUrl: str('ANTHROPIC_FOUNDRY_BASE_URL'),
        apiKey: str('ANTHROPIC_FOUNDRY_API_KEY'),
      },
      azureOpenAi: {
        endpoint: str('AZURE_OPENAI_ENDPOINT')?.replace(/\/+$/, '') ?? null,
        apiKey: str('AZURE_OPENAI_API_KEY'),
        deployment: str('AZURE_OPENAI_DEPLOYMENT'),
        apiVersion: str('AZURE_OPENAI_API_VERSION') ?? '2024-10-21',
      },
    },
  };
}
