// playwright.config.ts
// E2E tests require a running Electron app: pnpm run dev (in apps/desktop)
// All tests are currently skipped — they serve as living documentation of the
// intended smoke-test flow until CI spins up an Electron process.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    // Headless Electron is not configured here; tests are skipped.
    headless: true,
  },
  reporter: [['list']],
})
