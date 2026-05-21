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
 * Data worker model (per-app, currently `data-<appId>.proappstore.online`):
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

export interface RecordedCall {
  sql: string
  params: unknown[]
}

/**
 * Handle returned from `signInAs`. Tests assert mutations by inspecting
 * `queries` (SELECTs) and `executes` (INSERT/UPDATE/DELETE) — every call
 * the SDK makes to the data worker is recorded here in order.
 *
 * Use `executes.some(e => /INSERT INTO cards/.test(e.sql))` to assert
 * "the user action triggered a card insert" without coupling to exact
 * column order, generated IDs, or timing.
 */
export interface FixtureHandle {
  queries: RecordedCall[]
  executes: RecordedCall[]
}

/**
 * Pre-seed a logged-in session and stub the auth + data worker
 * endpoints. Call from `test.beforeEach(...)` before `page.goto(...)`.
 *
 * `queryResponses` lets a test override the default empty
 * `listMyWorkspaces` response by SQL substring match. Useful for
 * priming the app with a workspace, board, etc.
 *
 * Returns a FixtureHandle for assertion-style tests; ignoring it is
 * fine for read-only render tests.
 */
export async function signInAs(
  page: Page,
  user: Partial<typeof FAKE_USER> = {},
  opts: {
    queryResponses?: { match: RegExp; rows: unknown[] }[]
  } = {},
): Promise<FixtureHandle> {
  const resolved = { ...FAKE_USER, ...user }
  const queryResponses = opts.queryResponses ?? []
  const handle: FixtureHandle = { queries: [], executes: [] }

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

  // Data worker: migrate, query, execute. Every query + execute is
  // recorded into `handle` so tests can assert mutations after the fact.
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
      let body: { sql?: string; params?: unknown[] } = {}
      try {
        body = (await route.request().postDataJSON()) as typeof body
      } catch {
        /* ignore */
      }
      const sql = body.sql ?? ''
      handle.queries.push({ sql, params: body.params ?? [] })
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
      let body: { sql?: string; params?: unknown[] } = {}
      try {
        body = (await route.request().postDataJSON()) as typeof body
      } catch {
        /* ignore */
      }
      handle.executes.push({ sql: body.sql ?? '', params: body.params ?? [] })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, meta: {} }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  return handle
}

/**
 * Convenience: did any recorded SQL match this regex? Used in tests as
 * `expect(sawSQL(handle.executes, /INSERT INTO cards/)).toBe(true)`.
 */
export function sawSQL(calls: RecordedCall[], match: RegExp): boolean {
  return calls.some((c) => match.test(c.sql))
}
