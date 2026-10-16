import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the same build works on GitHub Pages under /<repo>/
// and on any local preview server.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ちいかわ 人魚の島ぐらし',
        short_name: '人魚の島',
        description: 'ちいかわ「人魚の島のひみつ」の島でのんびり暮らすファンメイドゲーム',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#6EC6F0',
        theme_color: '#6EC6F0',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,glb}'],
      },
    }),
  ],
});
