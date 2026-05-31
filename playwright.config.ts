import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Gravix Sales Trainer operational workflow tests.
 * Tests focus on workflow stability, not pixel-perfect UI.
 *
 * Run against the Next.js dev server (auto-started) or an existing server.
 * Set PLAYWRIGHT_BASE_URL to override the default http://localhost:3000.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Give client-side rendering time to hydrate
    actionTimeout: 12_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
