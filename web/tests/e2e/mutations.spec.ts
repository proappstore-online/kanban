import { expect, test } from '@playwright/test'
import { sawSQL, signInAs } from './_fixtures/auth'

/**
 * Mutation flow tests. These click through real user actions and
 * inspect the recorded SDK calls, so a regression in the write path
 * (missing INSERT, wrong UPDATE, etc.) fails the suite — not just
 * the render-still-renders-OK signal from earlier specs.
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

const CARD = {
  id: 'card-1',
  tenant_id: WS.id,
  board_id: BOARD.id,
  list_id: LISTS[1].id, // In progress
  position: 1024,
  title: 'Wire the rooms broadcast',
  description: null,
  requirement: null,
  acceptance_criteria: null,
  due_at: null,
  eta_at: null,
  archived: 0,
  created_by: 'gh:999000',
  created_at: 1_700_000_002_000,
  updated_at: 1_700_000_002_000,
  version: 1,
}

const EMPTY_BOARD_QUERIES = [
  { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
  { match: /FROM boards WHERE id = \?/, rows: [BOARD] },
  { match: /FROM lists WHERE board_id = \?.*ORDER BY position/, rows: LISTS },
  { match: /FROM cards WHERE board_id = \?/, rows: [] },
  { match: /FROM labels WHERE board_id = \?/, rows: [] },
  { match: /FROM card_labels/, rows: [] },
  { match: /FROM card_assignees/, rows: [] },
  { match: /FROM checklist_items/, rows: [] },
  { match: /FROM comments/, rows: [] },
  { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [] },
  { match: /FROM features WHERE tenant_id/, rows: [] },
  { match: /FROM mentions/, rows: [{ n: 0 }] },
]

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

    // App navigates to the new workspace's slug — wait for the URL to
    // shift past the onboarding screen as a proxy for "create succeeded".
    await page.waitForURL(/#\/w\//, { timeout: 5_000 })

    // Two executes fire from createWorkspace: the workspace row + the
    // owner-member row. Either may interleave with background writes.
    expect(sawSQL(handle.executes, /INSERT INTO workspaces/)).toBe(true)
    expect(sawSQL(handle.executes, /INSERT INTO members/)).toBe(true)
  })

  test('"+ Add a card" fires INSERT INTO cards', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: EMPTY_BOARD_QUERIES,
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    // ListColumn renders one "+ Add a card" per column. Index 1 is
    // the In-progress (WIP) column — order follows STATUS_KINDS
    // (new, wip, testing, launched). Picking by index is the least
    // brittle selector here; column scoping by text matches multiple
    // ancestors and trips strict mode.
    const addCard = page
      .getByRole('button', { name: /^\+ add a card$/i })
      .nth(1)
    await expect(addCard).toBeVisible({ timeout: 10_000 })
    await addCard.click()
    await page.getByRole('textbox', { name: /new card title/i }).fill(
      'Wire the realtime broadcast',
    )
    await page.getByRole('button', { name: /^add$/i }).click()

    // Wait for the optimistic insert to settle. Even if the new card
    // doesn't render immediately (depends on local state), the recorded
    // execute must have fired.
    await expect.poll(() => sawSQL(handle.executes, /INSERT INTO cards/)).toBe(true)
  })

  test('deep-link `/board/X/card/Y` opens the modal on load', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        ...EMPTY_BOARD_QUERIES.filter((q) => !/FROM cards WHERE board_id/.test(q.match.source)),
        // Seed one card in WIP so deep-link can match it.
        { match: /FROM cards WHERE board_id = \?/, rows: [CARD] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}/card/${CARD.id}`)

    // Card title in the modal header (input value).
    await expect(
      page.getByRole('textbox', { name: /card title/i }),
    ).toHaveValue(CARD.title, { timeout: 10_000 })
    // Modal-specific section that doesn't appear on the card preview.
    await expect(page.getByText(/^Assignees$/)).toBeVisible()
    await expect(page.getByText(/^Acceptance criteria$/)).toBeVisible()
  })

  test('Quick status change fires UPDATE cards SET list_id', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        ...EMPTY_BOARD_QUERIES.filter((q) => !/FROM cards WHERE board_id/.test(q.match.source)),
        { match: /FROM cards WHERE board_id = \?/, rows: [CARD] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}/board/${BOARD.id}`)

    // The status pill on the card preview reads "IN PROGRESS" (from
    // kind=wip). It's a button with aria-haspopup="menu"; its accessible
    // name comes from text content (the status label + ▾ glyph).
    // The card is itself a `role="button"` (dnd-kit drag wrapper), so a
    // fuzzy match on "In progress" hits BOTH the card and the nested
    // StatusPill. Use aria-haspopup="menu" to pin the pill specifically;
    // dnd-kit listens for pointer-down on the card, so dispatch the
    // click directly rather than via mouse hover-and-click (which would
    // start a drag interaction).
    const pill = page.locator(
      'button[aria-haspopup="menu"]:has-text("In progress")',
    )
    await expect(pill).toBeVisible({ timeout: 10_000 })
    await pill.dispatchEvent('click')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible({ timeout: 5_000 })
    await menu.getByRole('button', { name: /^testing$/i }).click()

    // The handler issues UPDATE cards SET list_id = ?, position = ?, …
    // The SDK's SQL has a newline between `UPDATE cards` and `SET list_id`,
    // so the regex needs the `s` flag (dotAll) for `.` to span lines.
    await expect
      .poll(() => sawSQL(handle.executes, /UPDATE cards.*SET list_id/s), {
        timeout: 5_000,
      })
      .toBe(true)
  })
})
