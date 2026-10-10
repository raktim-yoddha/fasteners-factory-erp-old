import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

for (const file of ['.env', '.env.e2e.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm vite preview --host 127.0.0.1 --port 4173',
        url: baseURL,
        reuseExistingServer: true,
      },
  reporter: [['list'], ['html', { open: 'never' }]]
})
