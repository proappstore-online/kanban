import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'

/**
 * Verifies that the invite hash is preserved across the sign-in flow.
 *
 * When a non-authenticated user clicks an invite link:
 * 1. They land on SignIn (hash is #/invite/code)
 * 2. They click "Sign in with GitHub"
 * 3. The hash is saved to sessionStorage before redirect
 * 4. After OAuth return, auth.init() restores the hash
 * 5. The invite page renders and redeems the code
 */

test.describe('Invite link preservation across sign-in', () => {
  test('sign-in button saves invite hash to sessionStorage', async ({ page }) => {
    // Don't stub auth — user is signed out so SignIn renders.
    await page.route('**/api.proappstore.online/v1/auth/me', (route) =>
      route.fulfill({ status: 401, body: '{}' }),
    )
    await page.route('**/api.proappstore.online/**', (route) => {
      if (route.request().url().includes('/v1/auth/me')) return route.fallback()
      return route.fulfill({ status: 200, body: '{}' })
    })

    // Navigate to an invite link
    await page.goto('/#/invite/test-code-123')

    // Should show the sign-in page since user is not authenticated
    await expect(page.getByRole('button', { name: /sign in with github/i })).toBeVisible({
      timeout: 10_000,
    })

    // Exercise the real click. A 204 intercept cancels navigation while preserving the local document.
    await page.route('**/api.proappstore.online/v1/auth/github/start*', (route) => route.fulfill({ status: 204 }))
    const started = page.waitForRequest((request) => request.url().includes('/v1/auth/github/start'))
    await page.getByRole('button', { name: /sign in with github/i }).click()
    await started

    const saved = await page.evaluate(() =>
      sessionStorage.getItem('kanban:returnHash'),
    )
    expect(saved).toBe('#/invite/test-code-123')
  })

  test('returnHash is restored after auth init (simulated OAuth return)', async ({ page }) => {
    // Simulate: user is coming back from OAuth. sessionStorage has the saved hash.
    // Auth init will succeed (fake session), and the hash should be restored.
    await page.addInitScript(`
      window.sessionStorage.setItem('kanban:returnHash', '#/invite/restored-code');
    `)

    await signInAs(page)

    // Go to root (simulating OAuth return — hash was cleared by SDK)
    await page.goto('/')

    // The app should restore the hash and land on the invite page.
    // The invite will show "invalid" since we stub empty rows, but the
    // URL proves the hash was restored.
    await page.waitForURL(/#\/invite\/restored-code/, { timeout: 10_000 })
  })
})
