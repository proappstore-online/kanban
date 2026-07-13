import { app } from '../app'
import { ensureMigrated } from './core'
import { q, x } from '../actions'

export async function watchCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('watch_card', { tenant_id: tenantId, card_id: cardId })
}

export async function unwatchCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('unwatch_card', { tenant_id: tenantId, card_id: cardId })
}

export async function isWatchingCard(tenantId: string, cardId: string): Promise<boolean> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return false
  const rows = await q<{ n: number }>('is_watching_card', { tenant_id: tenantId, card_id: cardId })
  return Number(rows[0]?.n ?? 0) > 0
}

export async function listCardWatcherIds(tenantId: string, cardId: string): Promise<string[]> {
  await ensureMigrated()
  const rows = await q<{ user_id: string }>('list_card_watcher_ids', {
    tenant_id: tenantId,
    card_id: cardId,
  })
  return rows.map((r) => r.user_id)
}
