import type { Page } from '@playwright/test'

/**
 * Test fixtures for stubbing the SDK's auth + data layer so e2e tests
 * can exercise the React shell without a real GitHub OAuth roundtrip or
 * a live D1 backend.
 *
 * Auth model (from `@freeappstore/sdk` Auth class):
 *  - Session lives in `localStorage['fas:session']` as
 *    `{token, user, obtainedAt}`.
 *  - `auth.init()` reads it, then validates by hitting `/v1/auth/me`.
 *  - If that 401s, the session is cleared and the user is logged out.
 *
 * Data worker model (per-app, currently `pas-data-kanban` on workers.dev):
 *  - POST /migrate → run schema migrations (idempotent server-side)
 *  - POST /query   → SELECT, returns `{ rows: T[] }`
 *  - POST /execute → INSERT/UPDATE/DELETE, returns `{ ... }`
 *
 * Stubs here intercept all four endpoints. Tests can override individual
 * query responses by chaining a more specific `page.route()` AFTER
 * calling `signInAs(...)` — Playwright resolves the most-recently-added
 * route first.
 */

export const FAKE_USER = {
  id: 'gh:999000',
  login: 'test-user',
  avatarUrl: null as string | null,
  dateOfBirth: null as string | null,
}

const FAKE_TOKEN = 'fake-test-session-token'

const STORAGE_KEY = 'fas:session'

/**
 * Pre-seed a logged-in session and stub the auth + data worker
 * endpoints. Call from `test.beforeEach(...)` before `page.goto(...)`.
 *
 * `queryResponses` lets a test override the default empty
 * `listMyWorkspaces` response by SQL substring match. Useful for
 * priming the app with a workspace, board, etc.
 */
export async function signInAs(
  page: Page,
  user: Partial<typeof FAKE_USER> = {},
  opts: {
    queryResponses?: { match: RegExp; rows: unknown[] }[]
  } = {},
): Promise<void> {
  const resolved = { ...FAKE_USER, ...user }
  const queryResponses = opts.queryResponses ?? []

  // Seed the session in localStorage BEFORE the page loads. Using a
  // string init-script (not a function with args) because the arg-passing
  // form silently no-op'd in some chromium versions — symptoms: the
  // script ran but localStorage stayed null. String form is reliably
  // serialized + executed on every navigation in this context.
  const session = { token: FAKE_TOKEN, user: resolved, obtainedAt: Date.now() }
  await page.addInitScript(
    `window.localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(
      JSON.stringify(session),
    )});`,
  )

  // /v1/auth/me — return the user so auth.init() resolves with a
  // session instead of clearing it.
  await page.route('**/api.freeappstore.online/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resolved),
    }),
  )

  // Stub everything else on the FAS API as 200/{} so the SDK doesn't
  // throw on background calls (usage telemetry, etc.).
  await page.route('**/api.freeappstore.online/**', (route) => {
    if (route.request().url().includes('/v1/auth/me')) return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Data worker: migrate, query, execute. The SDK uses
  // `data-<appId>.proappstore.online` by default; if a test setup overrides
  // `dataApiBase` to the workers.dev hostname, add that pattern too.
  await page.route('**/data-kanban.proappstore.online/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/migrate')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ applied: [] }),
      })
    }
    if (url.pathname.endsWith('/query')) {
      let body: { sql?: string } = {}
      try {
        body = (await route.request().postDataJSON()) as { sql?: string }
      } catch {
        /* ignore */
      }
      const sql = body.sql ?? ''
      for (const { match, rows } of queryResponses) {
        if (match.test(sql)) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ rows }),
          })
        }
      }
      // Default: empty result set — every list-* query returns [].
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [] }),
      })
    }
    if (url.pathname.endsWith('/execute')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, meta: {} }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}
