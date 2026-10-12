import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

for (const file of ['.env', '.env.e2e.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const backendURL = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const hostedBackend = Boolean(backendURL && !['127.0.0.1', 'localhost', '::1'].includes(new URL(backendURL).hostname))

export default defineConfig({
  testDir: './tests/e2e',
  // The routine gate uses local Supabase. Cloud smoke checks also include network and pool latency.
  timeout: hostedBackend ? 120_000 : 60_000,
  expect: { timeout: hostedBackend ? 20_000 : 8_000 },
  fullyParallel: true,
  workers: hostedBackend ? 2 : 3,
  retries: 0,
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure', actionTimeout: hostedBackend ? 20_000 : 8_000 },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && node scripts/check-bundle.mjs && pnpm vite preview --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: false,
        env: {
          VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
          VITE_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
        },
      },
  reporter: [['list', { printSteps: true }], ['json', { outputFile: 'test-results/results.json' }], ['html', { open: 'never' }]]
})
