import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'
import { WS } from './_fixtures/data'

test.describe('Workspace picker (authenticated, one workspace)', () => {
  test('shows the workspace card and navigates on click', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto('/')

    await expect(page.getByText('Acme', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('owner')).toBeVisible()

    await page.getByText('Acme', { exact: true }).click()
    await expect(page).toHaveURL(/#\/w\/acme-zx7y$/)
    await expect(page.getByRole('heading', { name: /^boards$/i })).toBeVisible()
  })
})
