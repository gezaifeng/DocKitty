// e2e/smoke.spec.ts
//
// Full-flow smoke tests for word_git desktop app.
//
// NOTE: These tests require a running Electron app.
// Before running manually:
//   1. cd apps/desktop
//   2. pnpm run dev
//   3. Then run: pnpm exec playwright test
//
// All tests are marked with test.skip so they do NOT run in the unit-test
// pipeline (pnpm test). They are intentional stubs that document the full
// E2E flow and will be wired to a real Electron process in a future CI step.

import { test, expect } from '@playwright/test'

test.describe('word_git smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    // Skip all tests — requires running Electron app via `pnpm run dev`
    test.skip(true, 'Requires running Electron app: pnpm run dev in apps/desktop')
    await page.goto('http://localhost:5173')
  })

  test('app loads and shows the main layout', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    await expect(page.locator('body')).toBeVisible()
  })

  test('first run page shows workspace picker when no repo is configured', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    // First-run page should show a "选择监控目录" or similar prompt
    await expect(page.getByText(/选择监控目录/)).toBeVisible()
  })

  test('doc list panel loads after workspace is set', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    // After selecting a workspace, the doc list panel should appear
    await expect(page.locator('[data-testid="doc-list-panel"]')).toBeVisible()
  })

  test('selecting a doc shows its commit timeline', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    // Click first doc card, verify timeline panel shows commit history
    const firstDocCard = page.locator('[data-testid="doc-card"]').first()
    await firstDocCard.click()
    await expect(page.getByText(/时间线/)).toBeVisible()
  })

  test('theme toggle cycles through light / dark / system', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    const toggleBtn = page.getByRole('button', { name: /切换主题/ })
    await toggleBtn.click() // system → light
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await toggleBtn.click() // light → dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await toggleBtn.click() // dark → system
    await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  })

  test('edit loop card appears after file save event', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    // Simulate a watcher event (in real E2E this would be a file write)
    // Verify the EditLoopCard slides in from the bottom
    await expect(page.getByText(/检测到文件已保存/)).toBeVisible()
  })

  test('committing from EditLoopCard creates a new timeline entry', async ({ page }) => {
    test.skip(true, 'Requires running Electron app')
    await page.getByPlaceholder('描述本次修改…').fill('E2E 测试提交')
    await page.getByRole('button', { name: '提交新版本' }).click()
    await expect(page.getByText('E2E 测试提交')).toBeVisible()
  })
})
