// playwright.config.ts
// Tests launch their own production Electron app and isolated temporary repositories.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  use: {
    headless: true,
  },
  reporter: [['list']],
})
