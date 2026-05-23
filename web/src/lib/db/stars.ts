import { app } from '../app'
import { ensureMigrated } from './core'

export async function starBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await app.db.execute(
    `INSERT OR IGNORE INTO starred_boards (tenant_id, board_id, user_id, starred_at) VALUES (?,?,?,?)`,
    [tenantId, boardId, me.id, Date.now()],
  )
}

export async function unstarBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await app.db.execute(
    `DELETE FROM starred_boards WHERE tenant_id = ? AND board_id = ? AND user_id = ?`,
    [tenantId, boardId, me.id],
  )
}

export async function listStarredBoardIds(tenantId: string): Promise<Set<string>> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return new Set()
  const { rows } = await app.db.query<{ board_id: string }>(
    `SELECT board_id FROM starred_boards WHERE tenant_id = ? AND user_id = ?`,
    [tenantId, me.id],
  )
  return new Set(rows.map((r) => r.board_id))
}
