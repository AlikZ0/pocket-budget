import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Pocket Budget / Мой бюджет', short_name: 'Pocket Budget', description: 'Offline personal budget planner',
      lang: 'ru', display: 'standalone', start_url: './', scope: './', background_color: '#f5f5f0', theme_color: '#f5f6f2',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }, { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'], navigateFallback: 'index.html', cleanupOutdatedCaches: true },
    devOptions: { enabled: false }
  })],
  test: { environment: 'node', include: ['tests/*.test.ts'], exclude: ['tests/browser/**', 'node_modules/**', 'dist/**'] }
});
