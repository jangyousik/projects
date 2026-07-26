import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '여행온',
        short_name: '여행온',
        description: '여행의 모든 순간을 켜다. 일정, 경비, 환율과 기록을 한곳에서 관리하는 여행 앱',
        theme_color: '#24a8ed',
        background_color: '#f7f8fc',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'ko-KR',
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'travelon-weather', expiration: { maxEntries: 12, maxAgeSeconds: 21600 } },
          },
          {
            urlPattern: /^https:\/\/open\.er-api\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'travelon-rates', expiration: { maxEntries: 4, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
})
