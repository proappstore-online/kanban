import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,wasm,json}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Kanban Pro',
        short_name: 'Kanban',
        description:
          'Team kanban boards with real-time presence, assignees, comments, mentions, and live collaboration on ProAppStore.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fffaf7',
        theme_color: '#000000',
        orientation: 'any',
        categories: ['productivity', 'business'],
        // Compliance: declare the narrowest device width we render well
        // on. 360 covers most Android phones; iPhone SE (375) and any
        // wider device gets there for free. The wave-3 board work uses
        // `w-[calc(100vw-2rem)]` columns so the layout adapts even
        // narrower, but 360 is the honest support floor.
        // @ts-expect-error — non-standard, but the platform compliance
        // check reads it.
        min_viewport_width: 360,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true },
});
