import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './http';

/** Serves the built PWA: immutable hashed assets, no-cache shell files, SPA fallback. */
export function mountClient(app: Hono<Env>, clientDir: string): void {
  const root = path.relative(process.cwd(), clientDir) || '.';
  const indexFile = path.join(clientDir, 'index.html');

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      crossOriginEmbedderPolicy: false,
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );

  app.use(
    '/assets/*',
    serveStatic({
      root,
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  app.use(
    '*',
    serveStatic({
      root,
      onFound: (filePath, c) => {
        const revalidate = /(sw\.js|\.html|\.webmanifest|workbox-[^/]*\.js)$/.test(filePath);
        c.header('Cache-Control', revalidate ? 'no-cache' : 'public, max-age=86400');
      },
    }),
  );

  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
    c.header('Cache-Control', 'no-cache');
    return c.html(fs.readFileSync(indexFile, 'utf8'));
  });
}
