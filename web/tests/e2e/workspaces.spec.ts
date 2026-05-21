import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'

/**
 * Workspace picker smoke test. Stubs `listMyWorkspaces` to return a single
 * row so the app skips Onboarding and lands on the picker. Asserts the
 * row renders with its name + slug role badge, and clicking it navigates
 * into the boards view.
 */

test.describe('Workspace picker (authenticated, one workspace)', () => {
  test('shows the workspace card and navigates on click', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        // listMyWorkspaces — return one row for the current user.
        {
          match: /FROM workspaces w\s+JOIN members m/,
          rows: [
            {
              id: 'ws-test-1',
              slug: 'acme-zx7y',
              name: 'Acme',
              owner_user_id: 'gh:999000',
              created_at: 1_700_000_000_000,
              role: 'owner',
            },
          ],
        },
        // listBoards on the workspace's board page — empty so we don't
        // need to seed lists / cards too.
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        // listFeatures on Boards page sidebar.
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto('/')

    // Workspace card displays the workspace name + role label.
    await expect(page.getByText('Acme', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('owner')).toBeVisible()

    // Click the card → board list page, URL switches to the workspace slug.
    await page.getByText('Acme', { exact: true }).click()
    await expect(page).toHaveURL(/#\/w\/acme-zx7y$/)
    // "Boards" heading is rendered on the boards page.
    await expect(page.getByRole('heading', { name: /^boards$/i })).toBeVisible()
  })
})
