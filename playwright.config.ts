import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL, browserName: 'chromium', trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]]
})
