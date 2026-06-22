import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Awecode',
        short_name: 'Awecode',
        display: 'standalone',
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: {
      '@awecode/gui/renderer/src': resolve(__dirname, '../gui/src/renderer/src'),
      '@awecode/gui/shared': resolve(__dirname, '../gui/src/shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5174', changeOrigin: true },
      '/agent': { target: 'ws://localhost:5174', ws: true },
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
