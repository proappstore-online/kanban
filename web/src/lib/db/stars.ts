import { app } from '../app'
import { ensureMigrated } from './core'
import { q, x } from '../actions'

export async function starBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('star_board', { tenant_id: tenantId, board_id: boardId })
}

export async function unstarBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('unstar_board', { tenant_id: tenantId, board_id: boardId })
}

export async function listStarredBoardIds(tenantId: string): Promise<Set<string>> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return new Set()
  const rows = await q<{ board_id: string }>('list_starred_board_ids', { tenant_id: tenantId })
  return new Set(rows.map((r) => r.board_id))
}
