import { expect, test } from '@playwright/test'

/**
 * Sign-in page smoke tests. These cover the unauthenticated landing
 * experience and assert the OAuth start request fires when the user
 * clicks the GitHub button. Doesn't exercise the auth callback itself
 * (that would mean wiring real GitHub OAuth into CI).
 *
 * Auth state across tests: the SDK persists session-tokens to
 * localStorage. We force a clean state by visiting `/` with the
 * platform's auth endpoint blocked so `auth.init()` resolves as
 * not-signed-in.
 */

test.describe('Sign-in', () => {
  test.beforeEach(async ({ page }) => {
    // Block both FAS and PAS auth checks so the SDK can't claim there's
    // an existing session. Each call resolves with 401, which the SDK
    // treats as "no current user."
    await page.route('**/api.freeappstore.online/v1/auth/**', (route) =>
      route.fulfill({ status: 401, body: '{"error":"not signed in"}' }),
    )
    await page.route('**/api.proappstore.online/v1/auth/**', (route) =>
      route.fulfill({ status: 401, body: '{"error":"not signed in"}' }),
    )
  })

  test('renders brand + GitHub sign-in button when unauthenticated', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /kanban pro/i })).toBeVisible()
    await expect(
      page.getByText(/team boards with real-time collaboration/i),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in with github/i })).toBeVisible()
    // ProAppStore attribution link is present (compliance check verifies
    // the canonical store-link too; this catches a UI regression earlier).
    await expect(page.getByRole('link', { name: /proappstore/i })).toBeVisible()
  })

  test('clicking the button fires an OAuth start request', async ({ page }) => {
    await page.goto('/')

    // Don't actually navigate to GitHub — intercept the OAuth start URL
    // and observe the redirect intent. We accept any FAS auth path since
    // the SDK may version it (`/v1/auth/start`, `/v1/auth/github`, etc.).
    const oauthRequest = page.waitForRequest(
      (req) => req.url().includes('api.freeappstore.online') && req.url().includes('/auth/'),
      { timeout: 5_000 },
    )

    await page.getByRole('button', { name: /sign in with github/i }).click()

    const req = await oauthRequest
    expect(req.url()).toMatch(/api\.freeappstore\.online/)
  })
})
