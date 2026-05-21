import { app } from '../app'
import type { AssignedTask, ListKind } from '../../types'
import { ensureMigrated } from './core'

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
  const { rows } = await app.db.query<AssignedTaskRow>(
    `SELECT
       c.id          AS card_id,
       c.title       AS card_title,
       b.id          AS board_id,
       b.name        AS board_name,
       b.feature_id  AS feature_id,
       f.name        AS feature_name,
       l.id          AS list_id,
       l.title       AS list_title,
       l.kind        AS list_kind,
       c.due_at      AS due_at,
       c.eta_at      AS eta_at,
       c.updated_at  AS updated_at
     FROM card_assignees ca
     JOIN cards c    ON c.id = ca.card_id
     JOIN boards b   ON b.id = c.board_id
     JOIN lists  l   ON l.id = c.list_id
     LEFT JOIN features f ON f.id = b.feature_id
     WHERE ca.tenant_id = ? AND ca.user_id = ?
       AND c.archived = 0 AND b.archived = 0 AND l.archived = 0
     ORDER BY
       CASE l.kind
         WHEN 'new' THEN 0
         WHEN 'wip' THEN 1
         WHEN 'testing' THEN 2
         WHEN 'launched' THEN 3
         ELSE 4
       END,
       c.updated_at DESC`,
    [tenantId, me.id],
  )
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
