/**
 * Shared test data for all e2e specs. Single source of truth for
 * workspace, board, lists, and card fixtures so they don't drift.
 */

export const WS = {
  id: 'ws-test-1',
  slug: 'acme-zx7y',
  name: 'Acme',
  owner_user_id: 'gh:999000',
  created_at: 1_700_000_000_000,
}

export const BOARD = {
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

export const LISTS = [
  { id: 'list-new', tenant_id: WS.id, board_id: BOARD.id, title: 'New', position: 1024, archived: 0, kind: 'new', created_at: 1_700_000_001_000 },
  { id: 'list-wip', tenant_id: WS.id, board_id: BOARD.id, title: 'In progress', position: 2048, archived: 0, kind: 'wip', created_at: 1_700_000_001_000 },
  { id: 'list-testing', tenant_id: WS.id, board_id: BOARD.id, title: 'Testing', position: 3072, archived: 0, kind: 'testing', created_at: 1_700_000_001_000 },
  { id: 'list-launched', tenant_id: WS.id, board_id: BOARD.id, title: 'Launched', position: 4096, archived: 0, kind: 'launched', created_at: 1_700_000_001_000 },
]

export const CARD = {
  id: 'card-1',
  tenant_id: WS.id,
  board_id: BOARD.id,
  list_id: LISTS[1].id,
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

export const MEMBER = {
  id: 'mem-1',
  tenant_id: WS.id,
  user_id: 'gh:999000',
  role: 'owner',
  display_name: 'test-user',
  email: null,
  avatar_url: null,
  joined_at: 1_700_000_000_000,
}

/** Standard query responses for a board page with canonical 4 lists. */
export function boardQueries(opts: {
  cards?: unknown[]
  role?: string
  members?: unknown[]
} = {}) {
  return [
    { match: /FROM workspaces w\s+JOIN members m/, rows: [{ ...WS, role: opts.role ?? 'owner' }] },
    { match: /FROM boards WHERE id = \?/, rows: [BOARD] },
    { match: /FROM lists WHERE board_id = \?.*ORDER BY position/, rows: LISTS },
    { match: /FROM cards WHERE board_id = \?/, rows: opts.cards ?? [] },
    { match: /FROM labels WHERE board_id = \?/, rows: [] },
    { match: /FROM card_labels/, rows: [] },
    { match: /FROM card_assignees/, rows: [] },
    { match: /FROM checklist_items/, rows: [] },
    { match: /FROM comments/, rows: [] },
    { match: /FROM members WHERE tenant_id = \? ORDER BY/, rows: opts.members ?? [MEMBER] },
    { match: /FROM features WHERE tenant_id/, rows: [] },
    { match: /FROM mentions/, rows: [{ n: 0 }] },
  ]
}

/** Generate N cards in a specific list. */
export function makeCards(listId: string, count: number, titlePrefix = 'Task') {
  return Array.from({ length: count }, (_, i) => ({
    ...CARD,
    id: `card-${listId}-${i + 1}`,
    list_id: listId,
    position: (i + 1) * 1024,
    title: `${titlePrefix} ${i + 1}`,
    created_at: 1_700_000_002_000 + i * 1000,
    updated_at: 1_700_000_002_000 + i * 1000,
  }))
}
