import { expect, test } from '@playwright/test'
import { sawSQL, signInAs } from './_fixtures/auth'
import { WS } from './_fixtures/data'

const INVITE_CODE = 'abc123test'

// Redemption only receives the workspace ID, never creator/recipient fields.
const VALID_INVITE = { tenant_id: WS.id }

test.describe('Invite link redemption', () => {
  test('valid invite adds user as member and navigates to workspace', async ({ page }) => {
    let lookups = 0
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        { match: /SELECT tenant_id FROM invites\s+WHERE code = \?/, rows: () => ++lookups === 1 ? [] : [VALID_INVITE] },
        { match: /FROM members WHERE tenant_id = \? AND user_id = \?/, rows: [] },
        { match: /FROM boards WHERE tenant_id = \? AND archived = 0/, rows: [] },
        { match: /FROM workspaces WHERE id = \?/, rows: [WS] },
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'member' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/${INVITE_CODE}`)

    await expect(page.getByText("You've joined")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Acme')).toBeVisible()
    expect(sawSQL(handle.executes, /INSERT INTO members/)).toBe(true)
  })

  test('already-a-member user skips INSERT and still joins', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        { match: /SELECT tenant_id FROM invites\s+WHERE code = \?/, rows: [VALID_INVITE] },
        { match: /FROM members WHERE tenant_id = \? AND user_id = \?/, rows: [{ id: 'member-1' }] },
        { match: /FROM workspaces WHERE id = \?/, rows: [WS] },
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'member' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/${INVITE_CODE}`)

    await expect(page.getByText("You've joined")).toBeVisible({ timeout: 10_000 })
    expect(sawSQL(handle.executes, /INSERT INTO members/)).toBe(false)
  })

  test('expired invite shows "Invite invalid"', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /SELECT tenant_id FROM invites\s+WHERE code = \?/, rows: [] },
      ],
    })

    await page.goto(`/#/invite/expired123`)

    await expect(page.getByText('Invite invalid')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/expired.*already been used/i)).toBeVisible()
  })

  test('unknown code shows "Invite invalid"', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /SELECT tenant_id FROM invites\s+WHERE code = \?/, rows: [] },
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

    await expect(page.getByRole('heading', { name: /^boards$/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /^invite$/i })).not.toBeVisible()
  })
})
