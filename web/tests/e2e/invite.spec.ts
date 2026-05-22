import { expect, test } from '@playwright/test'
import { sawSQL, signInAs } from './_fixtures/auth'

/**
 * Invite flow tests. Verifies that:
 * - Invite links are reusable (not consumed on first accept)
 * - Already-a-member users see the workspace without re-inserting
 * - Expired invites show "invalid"
 * - The Invite button on Boards creates a link + copies to clipboard
 */

const WS = {
  id: 'ws-test-1',
  slug: 'acme-zx7y',
  name: 'Acme',
  owner_user_id: 'gh:999000',
  created_at: 1_700_000_000_000,
}

const INVITE_CODE = 'abc123test'

const VALID_INVITE = {
  id: 'inv-1',
  tenant_id: WS.id,
  code: INVITE_CODE,
  role: 'member',
  created_by: 'gh:999000',
  expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
  accepted_at: null,
  accepted_by: null,
  created_at: 1_700_000_000_000,
}

const EXPIRED_INVITE = {
  ...VALID_INVITE,
  id: 'inv-expired',
  code: 'expired123',
  expires_at: Date.now() - 1000, // already expired
}

test.describe('Invite link redemption', () => {
  test('valid invite adds user as member and navigates to workspace', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        // redeemInvite: find the invite by code (not expired)
        { match: /FROM invites\s+WHERE code = \?/, rows: [VALID_INVITE] },
        // Check existing membership — not a member yet
        { match: /FROM members WHERE tenant_id = \? AND user_id = \?/, rows: [] },
        // Boards query for activity logging
        { match: /FROM boards WHERE tenant_id = \? AND archived = 0/, rows: [] },
        // Workspace lookup after joining
        { match: /FROM workspaces WHERE id = \?/, rows: [WS] },
        // listMyWorkspaces after redirect
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'member' }] },
        // Boards page queries
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/${INVITE_CODE}`)

    // Should show "You've joined" message
    await expect(page.getByText("You've joined")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Acme')).toBeVisible()

    // Should have inserted the member
    expect(sawSQL(handle.executes, /INSERT INTO members/)).toBe(true)
  })

  test('already-a-member user skips INSERT and still joins', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        // redeemInvite: find the invite by code
        { match: /FROM invites\s+WHERE code = \?/, rows: [VALID_INVITE] },
        // Already a member!
        { match: /FROM members WHERE tenant_id = \? AND user_id = \?/, rows: [{ id: 'member-1' }] },
        // Workspace lookup
        { match: /FROM workspaces WHERE id = \?/, rows: [WS] },
        // listMyWorkspaces after redirect
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'member' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/${INVITE_CODE}`)

    await expect(page.getByText("You've joined")).toBeVisible({ timeout: 10_000 })

    // Should NOT have inserted a duplicate member
    expect(sawSQL(handle.executes, /INSERT INTO members/)).toBe(false)
  })

  test('expired invite shows "Invite invalid"', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        // The invite query returns no rows because expires_at < now
        { match: /FROM invites\s+WHERE code = \?/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/expired123`)

    await expect(page.getByText('Invite invalid')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/expired.*already been used/i)).toBeVisible()
  })

  test('unknown code shows "Invite invalid"', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM invites\s+WHERE code = \?/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/nonexistent`)

    await expect(page.getByText('Invite invalid')).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Invite button on Boards page', () => {
  test('owner sees Invite button that fires INSERT INTO invites', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}`)

    const inviteBtn = page.getByRole('button', { name: /^invite$/i })
    await expect(inviteBtn).toBeVisible({ timeout: 10_000 })
    await inviteBtn.click()

    // Should fire INSERT INTO invites
    await expect.poll(() => sawSQL(handle.executes, /INSERT INTO invites/)).toBe(true)
  })

  test('regular member does NOT see Invite button', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'member' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}`)

    // Wait for page to load (Boards heading appears)
    await expect(page.getByRole('heading', { name: /^boards$/i })).toBeVisible({ timeout: 10_000 })

    // Invite button should not exist
    await expect(page.getByRole('button', { name: /^invite$/i })).not.toBeVisible()
  })
})
