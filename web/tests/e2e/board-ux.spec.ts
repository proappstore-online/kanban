import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'

/**
 * Board UX improvements:
 * - Launched column caps at 10 cards with expand/collapse
 * - "Add list" shows as big button when < 2 lists, small + when >= 2
 * - Settings gear icon visible on workspace-scoped pages
 */

const WS = {
  id: 'ws-test-1',
  slug: 'acme-zx7y',
  name: 'Acme',
  owner_user_id: 'gh:999000',
  created_at: 1_700_000_000_000,
}

const BOARD = {
  id: 'board-1',
  tenant_id: WS.id,
  name: 'Sprint Board',
  feature_id: null,
  background: null,
  archived: 0,
  created_by: 'gh:999000',
  created_at: 1_700_000_001_000,
  updated_at: 1_700_000_001_000,
}

const LISTS = [
  { id: 'list-new', tenant_id: WS.id, board_id: BOARD.id, title: 'New', position: 1024, archived: 0, kind: 'new', created_at: 1_700_000_001_000 },
  { id: 'list-wip', tenant_id: WS.id, board_id: BOARD.id, title: 'In progress', position: 2048, archived: 0, kind: 'wip', created_at: 1_700_000_001_000 },
  { id: 'list-testing', tenant_id: WS.id, board_id: BOARD.id, title: 'Testing', position: 3072, archived: 0, kind: 'testing', created_at: 1_700_000_001_000 },
  { id: 'list-launched', tenant_id: WS.id, board_id: BOARD.id, title: 'Launched', position: 4096, archived: 0, kind: 'launched', created_at: 1_700_000_001_000 },
]

// Generate 15 cards in the launched list
function makeLaunchedCards(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `card-launched-${i + 1}`,
    tenant_id: WS.id,
    board_id: BOARD.id,
    list_id: 'list-launched',
    position: (i + 1) * 1024,
    title: `Done task ${i + 1}`,
    description: null,
    requirement: null,
    acceptance_criteria: null,
    due_at: null,
    eta_at: null,
    archived: 0,
    created_by: 'gh:999000',
    created_at: 1_700_000_002_000 + i * 1000,
    updated_at: 1_700_000_002_000 + i * 1000,
    version: 1,
  }))
}

const BOARD_QUERIES_BASE = [
  { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
  { match: /FROM boards WHERE id = \?/, rows: [BOARD] },
  { match: /FROM lists WHERE board_id = \?.*ORDER BY position/, rows: LISTS },
  { match: /FROM labels WHERE board_id = \?/, rows: [] },
  { match: /FROM card_labels/, rows: [] },
  { match: /FROM card_assignees/, rows: [] },
  { match: /FROM checklist_items/, rows: [] },
  { match: /FROM comments/, rows: [] },
  { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [] },
  { match: /FROM features WHERE tenant_id/, rows: [] },
  { match: /FROM mentions/, rows: [{ n: 0 }] },
]

test.describe('Launched column card cap', () => {
  test('shows only 10 cards and "Show all" button when > 10 in launched', async ({ page }) => {
    const cards = makeLaunchedCards(15)
    await signInAs(page, undefined, {
      queryResponses: [
        ...BOARD_QUERIES_BASE,
        { match: /FROM cards WHERE board_id = \?/, rows: cards },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    // Wait for the board to render
    await expect(page.getByText('Launched', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Should show first 10 cards
    await expect(page.getByText('Done task 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Done task 10', { exact: true })).toBeVisible()

    // Card 11 should NOT be visible (capped)
    await expect(page.getByText('Done task 11', { exact: true })).not.toBeVisible()

    // "Show all 15 cards" button should be visible
    const showAll = page.getByRole('button', { name: 'Show all 15 cards', exact: true })
    await expect(showAll).toBeVisible()

    // Click expand
    await showAll.click()

    // Now card 11-15 should be visible
    await expect(page.getByText('Done task 11', { exact: true })).toBeVisible()
    await expect(page.getByText('Done task 15', { exact: true })).toBeVisible()

    // Collapse button should appear
    const collapse = page.getByRole('button', { name: 'Show recent 10 only', exact: true })
    await expect(collapse).toBeVisible()

    // Collapse it back
    await collapse.click()
    await expect(page.getByText('Done task 11', { exact: true })).not.toBeVisible()
  })

  test('no cap button when launched has <= 10 cards', async ({ page }) => {
    const cards = makeLaunchedCards(5)
    await signInAs(page, undefined, {
      queryResponses: [
        ...BOARD_QUERIES_BASE,
        { match: /FROM cards WHERE board_id = \?/, rows: cards },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('Done task 5')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /show all/i })).not.toBeVisible()
  })
})

test.describe('Add list button tucking', () => {
  test('shows big "Add a list" button when fewer than 2 lists', async ({ page }) => {
    const singleList = [LISTS[0]] // Only the "New" list
    await signInAs(page, undefined, {
      queryResponses: [
        ...BOARD_QUERIES_BASE.filter((q) => !/FROM lists WHERE board_id/.test(q.match.source)),
        { match: /FROM lists WHERE board_id = \?.*ORDER BY position/, rows: singleList },
        { match: /FROM cards WHERE board_id = \?/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Big button with full text
    const bigBtn = page.getByRole('button', { name: /^\+ add a list$/i })
    await expect(bigBtn).toBeVisible()
  })

  test('shows small + button when 2+ lists exist', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        ...BOARD_QUERIES_BASE,
        { match: /FROM cards WHERE board_id = \?/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('Launched', { exact: true })).toBeVisible({ timeout: 10_000 })

    // Big button (with text "+ Add a list") should NOT be visible
    await expect(page.getByRole('button', { name: '+ Add a list' })).not.toBeVisible()

    // Small + button should be visible (aria-label="Add a list")
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
      queryResponses: [
        ...BOARD_QUERIES_BASE,
        { match: /FROM cards WHERE board_id = \?/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })

    const gear = page.getByRole('link', { name: /workspace settings/i })
    await expect(gear).toBeVisible()
  })
})
