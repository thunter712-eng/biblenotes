import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub project pages are served from /<repo-name>/. Hash routing means no 404.html fallback is needed.
const base = process.env.VITE_BASE ?? '/biblenotes/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // "prompt": never reload underneath someone who is mid-stroke. The app shows an update toast instead.
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'splash/*.png'],
      manifest: {
        name: 'Bible Notes',
        short_name: 'Bible Notes',
        description: 'Read the Bible and take handwritten notes with Apple Pencil. Works offline.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FAFAF7',
        theme_color: '#FAFAF7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2 only: fontsource also ships .woff, which every target browser can skip.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
