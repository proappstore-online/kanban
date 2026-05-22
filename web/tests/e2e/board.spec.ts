import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'
import { WS, BOARD, boardQueries } from './_fixtures/data'

test.describe('Board view (empty board with canonical lists)', () => {
  test('renders the four workflow columns', async ({ page }) => {
    await signInAs(page, undefined, { queryResponses: boardQueries() })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('In progress', { exact: true })).toBeVisible()
    await expect(page.getByText('Testing', { exact: true })).toBeVisible()
    await expect(page.getByText('Launched', { exact: true })).toBeVisible()

    const hints = page.getByText(/drop a card here, or add one below/i)
    await expect(hints.first()).toBeVisible()
  })
})
