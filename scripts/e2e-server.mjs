// Starts the production build against a throwaway database for the Playwright suite.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

if (!fs.existsSync('dist/server/index.js') || !fs.existsSync('dist/client/index.html')) {
  execSync('npm run build', { stdio: 'inherit' });
}

const dir = path.resolve('test-results/e2e-db');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const vapid = webpush.generateVAPIDKeys();
const server = spawn(process.execPath, ['dist/server/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.E2E_PORT ?? '4321',
    DATABASE_PATH: path.join(dir, 'household.db'),
    PASSWORD_SCRYPT_N: '16384',
    CRON_SECRET: 'e2e-secret',
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    AI_PROVIDER: 'none',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
