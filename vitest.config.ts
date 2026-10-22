import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Cheap password hashing keeps API tests fast; production uses the OWASP cost.
    env: { PASSWORD_SCRYPT_N: '1024', NODE_ENV: 'test' },
  },
});
