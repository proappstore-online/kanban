import { app } from '../app'
import type { ActivityEntry, ActivityKind } from '../../types'
import { ensureMigrated, rid } from './core'
import { q, x } from '../actions'

interface ActivityRow {
  id: string
  tenant_id: string
  board_id: string
  card_id: string | null
  actor_id: string
  kind: string
  payload: string | null
  created_at: number
  // Joined:
  actor_display_name: string | null
  actor_avatar_url: string | null
}

function rowToActivity(r: ActivityRow): ActivityEntry {
  let payload: Record<string, unknown> = {}
  if (r.payload) {
    try {
      payload = JSON.parse(r.payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }
  return {
    id: r.id,
    boardId: r.board_id,
    cardId: r.card_id ?? undefined,
    actorId: r.actor_id,
    actorDisplayName: r.actor_display_name ?? '(former member)',
    actorAvatarUrl: r.actor_avatar_url ?? undefined,
    kind: r.kind as ActivityKind,
    payload,
    createdAt: r.created_at,
  }
}

/**
 * Write an activity row. Fire-and-forget — activity is observability, not
 * a hard invariant; if it fails the parent mutation still succeeded.
 */
export async function logActivity(
  tenantId: string,
  boardId: string,
  kind: ActivityKind,
  payload: Record<string, unknown> = {},
  cardId?: string,
): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return
  try {
    await x('log_activity', {
      id: rid(),
      tenant_id: tenantId,
      board_id: boardId,
      card_id: cardId ?? null,
      kind,
      payload: JSON.stringify(payload),
    })
  } catch {
    /* swallow */
  }
}

export async function listBoardActivity(
  tenantId: string,
  boardId: string,
  limit = 50,
): Promise<ActivityEntry[]> {
  await ensureMigrated()
  const rows = await q<ActivityRow>('list_board_activity', {
    tenant_id: tenantId,
    board_id: boardId,
    limit,
  })
  return rows.map(rowToActivity)
}
