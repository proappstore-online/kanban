import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright runs against `vite dev` on localhost:5173. Web-server boot is
 * managed by the config so a fresh checkout's first `pnpm test:e2e` works
 * with no preflight. `reuseExistingServer` lets a developer keep `pnpm dev`
 * running in another terminal and have tests connect to it.
 *
 * Single project (chromium) for v1 of the suite — Firefox/WebKit can come
 * later once we have stable selectors and want to spot Safari-only bugs.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5181',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5181',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
