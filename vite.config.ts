import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base so the same build works on GitHub Pages under /<repo>/
// and on any local preview server.
export default defineConfig({
  base: './',
  server: { host: true, port: 5280, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
  plugins: [
    VitePWA({
      // Our own service worker (src/sw.ts), so the offline cache revalidates the files the game
      // has just fetched instead of downloading them all again.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        // The models (Draco-compressed, and the decoder's .wasm), the textures (.webp), the
        // island's height grid (.bin) and the layout (.json) are needed offline too. All of it is
        // cached together on the first visit, so the plants always match the ground they were
        // planted on (where each copy stands is kept with the ground). The limit sits just above
        // the biggest file, the plants at about 2.7 MB, so the build stops if they keep growing.
        globPatterns: ['**/*.{js,css,html,png,webp,svg,ico,webmanifest,glb,bin,json,wasm}'],
        // three's DRACOLoader brings its own copies of the decoder into assets/, unused: the game
        // decodes with the one in public/draco/ (see src/core/gltf.ts).
        globIgnores: ['assets/draco_*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        rollupFormat: 'iife',
      },
    }),
  ],
});
