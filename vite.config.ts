import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  worker: { format: 'es' },
  server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
      includeAssets: ['pwa-icon.svg','pwa-icon-192.png','pwa-icon-512.png'],
      manifest: {
        name: 'Fasteners Factory ERP',
        short_name: 'Fasteners ERP',
        description: 'Internal operations system for fastener manufacturers.',
        theme_color: '#1f2937',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-icon-192.png',sizes: '192x192',type: 'image/png',purpose: 'any' },
          { src: 'pwa-icon-512.png',sizes: '512x512',type: 'image/png',purpose: 'any maskable' },
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx,mjs}', 'scripts/**/*.test.mjs'],
    exclude: ['tests/e2e/**'],
    css: true
  }
})
