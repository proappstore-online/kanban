import { expect, test } from '@playwright/test'
import { FAKE_USER, signInAs } from './_fixtures/auth'

/**
 * Authenticated first-run smoke test.
 *
 * Stubs an empty workspace list and asserts the Onboarding page renders.
 * Doesn't drive the "create workspace" form to completion — that would
 * mean stubbing the INSERT round-trips + the subsequent listMyWorkspaces
 * refetch, which is its own follow-up. This catches the regression where
 * auth-stub mishaps land the user on the wrong screen.
 */

test.describe('First-run onboarding (authenticated, no workspaces)', () => {
  test('renders Onboarding when user has no workspaces', async ({ page }) => {
    await signInAs(page, {
      login: 'test-user',
    })

    await page.goto('/')

    // The Onboarding component greets the user by login and shows a
    // "Create workspace" call to action.
    await expect(
      page.getByRole('heading', { name: `Welcome, @${FAKE_USER.login}` }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /create workspace/i }),
    ).toBeVisible({ timeout: 10_000 })
  })
})
