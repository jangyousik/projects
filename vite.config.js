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
        name: 'Hanoi Trip V7',
        short_name: 'Hanoi',
        description: '2026 하노이 가족여행 일정과 경비를 관리하는 오프라인 여행 앱',
        theme_color: '#1b1b23',
        background_color: '#f7f8fc',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/hanoi-trip.html',
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
        navigateFallback: 'index.html',
      },
    }),
  ],
})
