import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

const pkg = createRequire(import.meta.url)('./package.json') as { version: string }

export default defineConfig({
  define: {
    // App version (from package.json), inlined at build time for the UI/About.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-maskable.svg', 'favicon.ico'],
      manifest: {
        name: 'Centering Work Manager',
        short_name: 'Centering',
        description: 'Centering / shuttering work, workers, owners, payments and profit tracker.',
        theme_color: '#d97706',
        background_color: '#faf8f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icon.svg', sizes: '192x192 512x512 any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: '192x192 512x512 any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, host: true },
})
