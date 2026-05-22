import { expect, test } from '@playwright/test'
import { FAKE_USER, sawSQL, signInAs } from './_fixtures/auth'

/**
 * Profile page tests. Covers:
 * - Renders user info (avatar placeholder + @login)
 * - Shows workspaces with role + display name
 * - Edit display name fires UPDATE members
 * - Edit email fires UPDATE members
 * - Dark mode toggle persists to localStorage
 * - Sign out button present
 */

const WS = {
  id: 'ws-test-1',
  slug: 'acme-zx7y',
  name: 'Acme',
  owner_user_id: 'gh:999000',
  created_at: 1_700_000_000_000,
}

const MEMBER = {
  id: 'mem-1',
  tenant_id: WS.id,
  user_id: FAKE_USER.id,
  role: 'owner',
  display_name: 'Test User',
  email: null,
  avatar_url: null,
  joined_at: 1_700_000_000_000,
}

test.describe('Profile page', () => {
  test('renders user login and workspace membership', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        // listMembers for the workspace (Profile fetches all members to find self)
        { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [MEMBER] },
      ],
    })

    await page.goto('/#/profile')

    await expect(page.getByRole('heading', { name: `@${FAKE_USER.login}` })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Signed in via GitHub')).toBeVisible()
    await expect(page.getByText('Acme')).toBeVisible()
    await expect(page.getByText('Test User')).toBeVisible()
    await expect(page.getByText('owner', { exact: false })).toBeVisible()
  })

  test('edit display name fires UPDATE members SET display_name', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [MEMBER] },
      ],
    })

    await page.goto('/#/profile')

    await expect(page.getByText('Acme')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /^edit$/i }).click()

    const nameInput = page.getByLabel(/display name/i)
    await expect(nameInput).toBeVisible()
    await nameInput.fill('New Name')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect.poll(() => sawSQL(handle.executes, /UPDATE members SET display_name/)).toBe(true)
  })

  test('edit email fires UPDATE members SET email', async ({ page }) => {
    const handle = await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [MEMBER] },
      ],
    })

    await page.goto('/#/profile')

    await expect(page.getByText('Acme')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /^edit$/i }).click()

    const emailInput = page.getByLabel(/email/i)
    await expect(emailInput).toBeVisible()
    await emailInput.fill('test@example.com')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect.poll(() => sawSQL(handle.executes, /UPDATE members SET email/)).toBe(true)
  })

  test('theme toggle sets localStorage and data-theme', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [MEMBER] },
      ],
    })

    await page.goto('/#/profile')

    // Click "dark" toggle
    const darkBtn = page.getByRole('button', { name: /^dark$/i })
    await expect(darkBtn).toBeVisible({ timeout: 10_000 })
    await darkBtn.click()

    // Verify localStorage was set
    const theme = await page.evaluate(() => localStorage.getItem('theme'))
    expect(theme).toBe('dark')

    // Verify data-theme attribute was applied
    const dataTheme = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(dataTheme).toBe('dark')

    // Switch to light
    await page.getByRole('button', { name: /^light$/i }).click()
    const lightTheme = await page.evaluate(() => localStorage.getItem('theme'))
    expect(lightTheme).toBe('light')
    const lightData = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(lightData).toBe('')
  })

  test('avatar in TopBar links to profile', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM boards WHERE tenant_id/, rows: [] },
        { match: /FROM features WHERE tenant_id/, rows: [] },
      ],
    })

    await page.goto(`/#/w/${WS.slug}`)

    // Wait for the boards page to render
    await expect(page.getByRole('heading', { name: /^boards$/i })).toBeVisible({ timeout: 10_000 })

    // Click the avatar/profile link
    const profileLink = page.getByRole('link', { name: /profile/i })
    await expect(profileLink).toBeVisible()
    await profileLink.click()

    await expect(page).toHaveURL(/#\/profile$/)
    await expect(page.getByRole('heading', { name: `@${FAKE_USER.login}` })).toBeVisible()
  })

  test('sign out button is present', async ({ page }) => {
    await signInAs(page, undefined, {
      queryResponses: [
        { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: 'owner' }] },
        { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: [MEMBER] },
      ],
    })

    await page.goto('/#/profile')

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 10_000 })
  })
})
