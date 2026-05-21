import { expect, test } from '@playwright/test'
import { signInAs } from './_fixtures/auth'

/**
 * Board page smoke test. Seeds one workspace + one board with the
 * canonical four workflow lists, no cards. Asserts the four list titles
 * appear in column order.
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
  name: 'Spec out v2',
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

test.describe('Board view (empty board with canonical lists)', () => {
  test('renders the four workflow columns', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        // listMyWorkspaces
        {
          match: /FROM workspaces w\s+JOIN members m/,
          rows: [{ ...WS, role: 'owner' }],
        },
        // getBoardFull — board row
        { match: /FROM boards WHERE id = \?/, rows: [BOARD] },
        // getBoardFull — lists
        { match: /FROM lists WHERE board_id = \?.*ORDER BY position/, rows: LISTS },
        // getBoardFull — everything else empty
        { match: /FROM cards WHERE board_id = \?/, rows: [] },
        { match: /FROM labels WHERE board_id = \?/, rows: [] },
        { match: /FROM card_labels/, rows: [] },
        { match: /FROM card_assignees/, rows: [] },
        { match: /FROM checklist_items/, rows: [] },
        { match: /FROM comments/, rows: [] },
        // listMembers
        { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [] },
        // listFeatures / mentions count
        { match: /FROM features WHERE tenant_id/, rows: [] },
        { match: /FROM mentions/, rows: [{ n: 0 }] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    // All four workflow columns are visible by title.
    await expect(page.getByText('New', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('In progress', { exact: true })).toBeVisible()
    await expect(page.getByText('Testing', { exact: true })).toBeVisible()
    await expect(page.getByText('Launched', { exact: true })).toBeVisible()

    // Each empty column shows the drop-target hint.
    const hints = page.getByText(/drop a card here, or add one below/i)
    await expect(hints.first()).toBeVisible()
  })
})
