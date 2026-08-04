import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { buildWahooCallbackHtml } from './scripts/wahooCallbackHtml.ts'

/** Static OAuth callback — bypasses SPA/SW app-shell so Wahoo return always works. */
function wahooCallbackPlugin(clientId: string): Plugin {
  return {
    name: 'wahoo-callback-html',
    closeBundle() {
      const dir = resolve(__dirname, 'dist/oauth/wahoo')
      mkdirSync(dir, { recursive: true })
      writeFileSync(resolve(dir, 'callback.html'), buildWahooCallbackHtml(clientId), 'utf8')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const wahooClientId = (env.VITE_WAHOO_CLIENT_ID || '').trim()

  return {
    plugins: [
      vue(),
      wahooCallbackPlugin(wahooClientId),
      VitePWA({
        registerType: 'autoUpdate',
        // Defer SW registration so it does not sit on the critical LCP path
        injectRegister: 'script-defer',
        includeAssets: [
          'favicon.ico',
          'favicon.svg',
          'favicon-32.png',
          'favicon-48.png',
          'favicon-192.png',
          'favicon-512.png',
          'apple-touch-icon.png',
          'logo-ultraplaner.png',
          'og-image.jpg',
        ],
        manifest: {
          name: 'UltraPlaner',
          short_name: 'UltraPlaner',
          description: 'Ultracycling-Routenplanung mit Versorgungspunkten — Ultra Planer',
          theme_color: '#2d6a4f',
          background_color: '#f8faf9',
          display: 'standalone',
          lang: 'de',
          start_url: '/',
          icons: [
            {
              src: 'favicon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'favicon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'favicon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          // Take over immediately after deploy so QR / deep links are not stuck on a stale shell
          skipWaiting: true,
          clientsClaim: true,
          // App-Shell only — no OSM tiles / Supabase bulk
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
          navigateFallback: '/index.html',
          // Never serve a precached shell for these — always network (Firebase SPA rewrite).
          // Stale shells after deploy caused white screens on /routes/import/:id (QR transfer).
          navigateFallbackDenylist: [/^\/oauth\//, /^\/routes\/import\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages-network-first',
                networkTimeoutSeconds: 3,
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  }
})
