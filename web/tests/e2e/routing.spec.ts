import { expect, test } from '@playwright/test'

/**
 * Route gating. The SDK's `auth.init()` must complete before any
 * authenticated route renders; if there's no session we bounce to the
 * sign-in screen. Blocking the FAS auth endpoint so the SDK resolves
 * "no current user" mimics a fresh / logged-out visit.
 */

test.describe('Route gating (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api.freeappstore.online/**', (route) =>
      route.fulfill({ status: 401, body: '{"error":"not signed in"}' }),
    )
    await page.route('**/api.proappstore.online/**', (route) =>
      route.fulfill({ status: 401, body: '{"error":"not signed in"}' }),
    )
  })

  // Hash-based routing — deep links to a board / workspace / settings
  // all need to bounce back to sign-in when no session is present. The
  // SDK only writes the hash; the React shell decides what to render
  // based on the resolved user.
  const guardedHashes = [
    '#/w/anything',
    '#/w/anything/board/abc',
    '#/w/anything/settings',
    '#/w/anything/my',
    '#/w/anything/board/abc/card/xyz',
  ]
  for (const hash of guardedHashes) {
    test(`${hash} → sign-in when unauthenticated`, async ({ page }) => {
      await page.goto(`/${hash}`)
      await expect(
        page.getByRole('button', { name: /sign in with github/i }),
      ).toBeVisible()
    })
  }

  test('invite link → sign-in first, then redeem flow', async ({ page }) => {
    await page.goto('/#/invite/somecode')
    // Unauthenticated visitors to an invite URL hit SignIn first; after
    // login the AcceptInvite page redeems. We can't test the redeem step
    // here without an auth fixture, but the gating behavior is the
    // same as other authenticated routes.
    await expect(
      page.getByRole('button', { name: /sign in with github/i }),
    ).toBeVisible()
  })
})
