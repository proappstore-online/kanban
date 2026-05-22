import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'
import { WS, BOARD, LISTS, boardQueries, makeCards } from './_fixtures/data'

test.describe('Launched column card cap', () => {
  test('shows only 10 cards and "Show all" button when > 10 in launched', async ({ page }) => {
    const cards = makeCards('list-launched', 15, 'Done task')
    await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('Launched', { exact: true })).toBeVisible({ timeout: 10_000 })

    await expect(page.getByText('Done task 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Done task 10', { exact: true })).toBeVisible()
    await expect(page.getByText('Done task 11', { exact: true })).not.toBeVisible()

    const showAll = page.getByRole('button', { name: 'Show all 15 cards', exact: true })
    await expect(showAll).toBeVisible()
    await showAll.click()

    await expect(page.getByText('Done task 11', { exact: true })).toBeVisible()
    await expect(page.getByText('Done task 15', { exact: true })).toBeVisible()

    const collapse = page.getByRole('button', { name: 'Show recent 10 only', exact: true })
    await expect(collapse).toBeVisible()
    await collapse.click()
    await expect(page.getByText('Done task 11', { exact: true })).not.toBeVisible()
  })

  test('no cap button when launched has <= 10 cards', async ({ page }) => {
    const cards = makeCards('list-launched', 5, 'Done task')
    await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('Done task 5', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /show all/i })).not.toBeVisible()
  })
})

test.describe('Add list button tucking', () => {
  test('shows big "Add a list" button when fewer than 2 lists', async ({ page }) => {
    const singleList = [LISTS[0]]
    await signInAs(page, undefined, {
      queryResponses: [
        ...boardQueries().filter((q) => !/FROM lists WHERE board_id/.test(q.match.source)),
        { match: /FROM lists WHERE board_id = \?.*ORDER BY position/, rows: singleList },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })
    const bigBtn = page.getByRole('button', { name: /^\+ add a list$/i })
    await expect(bigBtn).toBeVisible()
  })

  test('shows small + button when 2+ lists exist', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: boardQueries(),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('Launched', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: '+ Add a list' })).not.toBeVisible()
    const smallBtn = page.getByRole('button', { name: 'Add a list' })
    await expect(smallBtn).toBeVisible()
  })
})

test.describe('Settings gear icon', () => {
  test('gear icon links to settings on Boards page', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}`)

    await expect(page.getByRole('heading', { name: /^boards$/i })).toBeVisible({ timeout: 10_000 })
    const gear = page.getByRole('link', { name: /workspace settings/i })
    await expect(gear).toBeVisible()
    await gear.click()
    await expect(page).toHaveURL(/#\/w\/acme-zx7y\/settings$/)
  })

  test('gear icon visible on Board page', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: boardQueries(),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })
    const gear = page.getByRole('link', { name: /workspace settings/i })
    await expect(gear).toBeVisible()
  })
})

test.describe('Text search filter', () => {
  test('typing in search input filters cards by title', async ({ page }) => {
    const cards = [
      ...makeCards('list-wip', 1, 'Fix login bug'),
      ...makeCards('list-new', 1, 'Add dark mode'),
    ]
    // Give unique IDs
    cards[0].id = 'card-login'
    cards[0].title = 'Fix login bug'
    cards[1].id = 'card-dark'
    cards[1].title = 'Add dark mode'

    await signInAs(page, undefined, {
      queryResponses: boardQueries({ cards }),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('Fix login bug')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Add dark mode')).toBeVisible()

    // Type in search
    const search = page.getByRole('textbox', { name: /search cards/i })
    await search.fill('login')

    // Only matching card visible
    await expect(page.getByText('Fix login bug')).toBeVisible()
    await expect(page.getByText('Add dark mode')).not.toBeVisible()

    // Clear search shows all
    await search.fill('')
    await expect(page.getByText('Add dark mode')).toBeVisible()
  })
})

test.describe('Keyboard shortcuts', () => {
  test('? key toggles shortcuts help overlay', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: boardQueries(),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)
    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Press ? (click body first to ensure no input focused)
    await page.locator('body').click()
    await page.keyboard.type('?')
    await expect(page.getByText('Keyboard shortcuts')).toBeVisible()

    // Close via button, then reopen
    await page.getByRole('button', { name: /^close$/i }).click()
    await expect(page.getByText('Keyboard shortcuts')).not.toBeVisible()
  })

  test('/ key focuses search input', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: boardQueries(),
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)
    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.keyboard.press('/')
    const search = page.getByRole('textbox', { name: /search cards/i })
    await expect(search).toBeFocused()
  })
})
