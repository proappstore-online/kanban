import { expect, test } from '@playwright/test'
import { sawSQL, signInAs } from './_fixtures/auth'
import { WS, BOARD, CARD, boardQueries } from './_fixtures/data'

test.describe('Mutation flows', () => {
  test('Onboarding submit fires INSERT INTO workspaces + INSERT INTO members', async ({
    page,
  }) => {
    const handle = await signInAs(page)

    await page.goto('/')
    await page
      .getByRole('textbox', { name: /workspace name/i })
      .fill('My new workspace')
    await page.getByRole('button', { name: /create workspace/i }).click()

    await page.waitForURL(/#\/w\//, { timeout: 5_000 })

    expect(sawSQL(handle.executes, /INSERT INTO workspaces/)).toBe(true)
    expect(sawSQL(handle.executes, /INSERT INTO members/)).toBe(true)
  })

  test('"+ Add a card" fires INSERT INTO cards', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: boardQueries(),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    const addCard = page.getByRole('button', { name: /^\+ add a card$/i }).nth(1)
    await expect(addCard).toBeVisible({ timeout: 10_000 })
    await addCard.click()
    await page.getByRole('textbox', { name: /new card title/i }).fill(
      'Wire the realtime broadcast',
    )
    await page.getByRole('button', { name: /^add$/i }).click()

    await expect.poll(() => sawSQL(handle.executes, /INSERT INTO cards/)).toBe(true)
  })

  test('deep-link `/board/X/card/Y` opens the modal on load', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards: [CARD] }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}/card/${CARD.id}`)

    await expect(
      page.getByRole('textbox', { name: /card title/i }),
    ).toHaveValue(CARD.title, { timeout: 10_000 })
    await expect(page.getByText(/^Assignees$/)).toBeVisible()
    await expect(page.getByText(/^Acceptance criteria$/)).toBeVisible()
  })

  test('Quick status change fires UPDATE cards SET list_id', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards: [CARD] }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    const pill = page.locator('button[aria-haspopup="menu"]:has-text("In progress")')
    await expect(pill).toBeVisible({ timeout: 10_000 })
    await pill.dispatchEvent('click')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByRole('button', { name: /^testing$/i }).click()

    await expect
      .poll(() => sawSQL(handle.executes, /UPDATE cards.*SET list_id/s), { timeout: 5_000 })
      .toBe(true)
  })

  test('Add a list fires INSERT INTO lists', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: boardQueries(),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    // With 4 lists the button is the small +
    const addListBtn = page.getByRole('button', { name: 'Add a list' })
    await expect(addListBtn).toBeVisible({ timeout: 10_000 })
    await addListBtn.click()

    await page.getByRole('textbox', { name: /new list title/i }).fill('Backlog')
    await page.getByRole('button', { name: /^add list$/i }).click()

    await expect.poll(() => sawSQL(handle.executes, /INSERT INTO lists/)).toBe(true)
  })

  test('Card modal archive fires UPDATE cards SET archived', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards: [CARD] }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}/card/${CARD.id}`)

    await expect(page.getByRole('textbox', { name: /card title/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /^archive$/i }).click()

    await expect.poll(() => sawSQL(handle.executes, /UPDATE cards SET archived/)).toBe(true)
  })

  test('Post comment fires INSERT INTO comments', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards: [CARD] }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}/card/${CARD.id}`)

    await expect(page.getByRole('textbox', { name: /card title/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('textbox', { name: /new comment/i }).fill('Looks good, shipping it!')
    await page.getByRole('button', { name: /^comment$/i }).click()

    await expect.poll(() => sawSQL(handle.executes, /INSERT INTO comments/)).toBe(true)
  })
})
