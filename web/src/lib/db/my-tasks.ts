import { app } from '../app'
import type { AssignedTask, ListKind } from '../../types'
import { ensureMigrated } from './core'
import { q } from '../actions'

interface AssignedTaskRow {
  card_id: string
  card_title: string
  board_id: string
  board_name: string
  feature_id: string | null
  feature_name: string | null
  list_id: string
  list_title: string
  list_kind: ListKind
  due_at: number | null
  eta_at: number | null
  updated_at: number
}

/**
 * Every non-archived card assigned to the current user across all boards in
 * the workspace, joined with board / feature / list context so the My Tasks
 * view can render rows without per-card roundtrips. Ordered by list-kind
 * priority (new → wip → testing → launched → other) then updated_at desc.
 */
export async function listMyTasks(tenantId: string): Promise<AssignedTask[]> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return []
  const rows = await q<AssignedTaskRow>('list_my_tasks', { tenant_id: tenantId })
  return rows.map((r) => ({
    cardId: r.card_id,
    cardTitle: r.card_title,
    boardId: r.board_id,
    boardName: r.board_name,
    featureId: r.feature_id ?? undefined,
    featureName: r.feature_name ?? undefined,
    listId: r.list_id,
    listTitle: r.list_title,
    listKind: r.list_kind,
    dueAt: r.due_at ?? undefined,
    etaAt: r.eta_at ?? undefined,
    updatedAt: r.updated_at,
  }))
}
