import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION } from './src/shared/brand';

const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8787';
// Keep the browser's Host header so the API's same-origin (CSRF) check sees matching hosts.
const apiProxy = { '/api': { target: API_TARGET, changeOrigin: false, xfwd: true } };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/client',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Latin covers the UI; other scripts still load from the server when someone types them.
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: APP_DESCRIPTION,
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0d0e10',
        background_color: '#0d0e10',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Libraries change less often than the app, so their chunks stay cached across releases.
        // The 3D engine gets its own chunk, loaded only when a scene is on screen.
        manualChunks: (id) => {
          if (!id.includes('/node_modules/')) return undefined;
          if (/\/node_modules\/(three|@react-three|camera-controls|its-fine|suspend-react|react-use-measure|zustand)\//.test(id)) {
            return 'scene-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
});
