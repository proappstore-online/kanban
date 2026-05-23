import { app } from '../app'
import { ensureMigrated } from './core'

export async function watchCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await app.db.execute(
    `INSERT OR IGNORE INTO card_watchers (tenant_id, card_id, user_id, watched_at) VALUES (?,?,?,?)`,
    [tenantId, cardId, me.id, Date.now()],
  )
}

export async function unwatchCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await app.db.execute(
    `DELETE FROM card_watchers WHERE tenant_id = ? AND card_id = ? AND user_id = ?`,
    [tenantId, cardId, me.id],
  )
}

export async function isWatchingCard(tenantId: string, cardId: string): Promise<boolean> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return false
  const { rows } = await app.db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card_watchers WHERE tenant_id = ? AND card_id = ? AND user_id = ?`,
    [tenantId, cardId, me.id],
  )
  return Number(rows[0]?.n ?? 0) > 0
}

export async function listCardWatcherIds(tenantId: string, cardId: string): Promise<string[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<{ user_id: string }>(
    `SELECT user_id FROM card_watchers WHERE tenant_id = ? AND card_id = ?`,
    [tenantId, cardId],
  )
  return rows.map((r) => r.user_id)
}
