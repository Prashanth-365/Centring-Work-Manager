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
      includeAssets: ['icons/apple-touch-icon.png', 'icons/icon-32.png', 'icons/icon-16.png'],
      manifest: {
        name: 'Centering Manager',
        short_name: 'Centering',
        description: 'Centering / shuttering work, workers, owners, payments and profit tracker.',
        theme_color: '#F97316',
        background_color: '#F97316',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The PDF libs (jspdf/html2canvas/dompurify) power the NATIVE-only weekly
        // print path — the web build uses window.print(). Keep them out of the
        // PWA precache so web installs stay lean; they still load on demand and
        // are bundled into the APK on native.
        globIgnores: ['**/jspdf*.js', '**/html2canvas*.js', '**/purify*.js'],
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
