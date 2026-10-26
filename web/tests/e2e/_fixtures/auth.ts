import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../../../../mcp.json', import.meta.url), 'utf8')) as { tools: { name: string; operation: string; sql?: string; statements?: (string | { sql: string })[] }[] }

/**
 * Test fixtures for stubbing the SDK's auth + data layer so e2e tests
 * can exercise the React shell without a real GitHub OAuth roundtrip or
 * a live D1 backend.
 *
 * Auth model (from `@proappstore/sdk` Auth class):
 *  - Session lives in `localStorage['pas:session']` as
 *    `{token, user, obtainedAt}`.
 *  - `auth.init()` reads it, then validates by hitting `/v1/auth/me`.
 *  - If that 401s, the session is cleared and the user is logged out.
 *
 * Data model: registered PAS actions use the checked-in manifest. Responses
 * are local UI mocks; SQL records support assertions but are not executed here.
 * Only migration bootstrap uses data-<appId>; unexpected raw SQL fails locally.
 * Tests can override individual
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

const STORAGE_KEY = 'pas:session'

export interface RecordedCall {
  sql: string
  params: unknown[]
}

/**
 * Handle returned from `signInAs`. Tests assert mutations by inspecting
 * `queries` (SELECTs) and `executes` (INSERT/UPDATE/DELETE) — every call
 * the SDK makes through registered actions is recorded here in order.
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
 * Pre-seed a logged-in session and stub the auth + registered action
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
    queryResponses?: { match: RegExp; rows: unknown[] | (() => unknown[]) }[]
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
  await page.route('**/api.proappstore.online/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resolved),
    }),
  )

  // Stub everything else on the PAS API as 200/{} so the SDK doesn't
  // throw on background calls (usage telemetry, etc.).
  await page.route('**/api.proappstore.online/**', (route) => {
    if (route.request().url().includes('/v1/auth/me')) return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Current app reads/writes are registered actions. Translate the checked-in
  // manifest into SQL records so existing data matchers and assertions remain useful;
  // this is a local UI mock, not a claim to execute server authorization.
  await page.route('**/api.proappstore.online/v1/apps/kanban/actions/*', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    const action = manifest.tools.find((tool) => tool.name === name)
    if (!action) return route.fulfill({ status: 501, body: JSON.stringify({ error: `Unknown action ${name}` }) })
    const body = route.request().postDataJSON() as { params?: Record<string, unknown> }
    const params = { ...body.params, __user_id: resolved.id, __now: Date.now(), __uuid: crypto.randomUUID() } as Record<string, unknown>
    const statements = action.sql ? [action.sql] : (action.statements ?? []).map((statement) => typeof statement === 'string' ? statement : statement.sql)
    const records = statements.map((sql) => {
      const values: unknown[] = []
      const normalized = sql.replace(/:([a-z_][a-z0-9_]*)/gi, (_match, key: string) => { values.push(params[key]); return '?' }).replace(/\s+/g, ' ')
      return { sql: normalized, params: values }
    })
    if (action.operation === 'query') {
      handle.queries.push(...records)
      for (const { match, rows } of queryResponses) {
        if (records.some((record) => match.test(record.sql))) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: typeof rows === 'function' ? rows() : rows }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"rows":[]}' })
    }
    handle.executes.push(...records)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"meta":{"changes":1}}' })
  })

  // Only schema bootstrap uses the data-worker endpoint. Unexpected raw SQL must
  // fail locally instead of accidentally making a live request or hiding drift.
  await page.route('**/data-kanban.proappstore.online/**', (route) => route.fulfill({
    status: new URL(route.request().url()).pathname.endsWith('/migrate') ? 200 : 501,
    contentType: 'application/json',
    body: new URL(route.request().url()).pathname.endsWith('/migrate') ? '{"applied":[]}' : '{"error":"Use registered actions"}',
  }))

  return handle
}

/**
 * Convenience: did any recorded SQL match this regex? Used in tests as
 * `expect(sawSQL(handle.executes, /INSERT INTO cards/)).toBe(true)`.
 */
export function sawSQL(calls: RecordedCall[], match: RegExp): boolean {
  return calls.some((c) => match.test(c.sql))
}
