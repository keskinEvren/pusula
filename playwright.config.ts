import { defineConfig } from '@playwright/test'
const qaAppPort = process.env.QA_APP_PORT || '3100'
const qaSupabaseUrl = process.env.QA_SUPABASE_URL || 'http://127.0.0.1:54321'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${qaAppPort}`,
    channel: process.env.QA_BROWSER_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node tests/e2e/mock-supabase.mjs', url: `${qaSupabaseUrl}/__qa/state`, reuseExistingServer: false,
      env: { QA_FIXTURE_PORT: new URL(qaSupabaseUrl).port } },
    { command: `npm run dev -- --hostname 127.0.0.1 --port ${qaAppPort}`, url: `http://127.0.0.1:${qaAppPort}/login`, reuseExistingServer: false, timeout: 180000,
      env: { NEXT_PUBLIC_SUPABASE_URL: qaSupabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-local-only' } },
  ],
})
