import { app } from '../app'
import type { List, ListKind } from '../../types'
import { between } from '../frac'
import { ensureMigrated, rid } from './core'
import { touchBoard } from './boards'

export async function createList(
  tenantId: string,
  boardId: string,
  title: string,
  afterPosition: number | null,
  kind: ListKind = 'other',
): Promise<List> {
  await ensureMigrated()
  const id = rid()
  const position = between(afterPosition, null) // append at end
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO lists (id, tenant_id, board_id, title, position, archived, kind, created_at)
     VALUES (?,?,?,?,?,0,?,?)`,
    [id, tenantId, boardId, title, position, kind, now],
  )
  await touchBoard(tenantId, boardId)
  return { id, boardId, title, position, kind, cards: [] }
}

export async function renameList(
  tenantId: string,
  listId: string,
  title: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE lists SET title = ? WHERE id = ? AND tenant_id = ?`,
    [title, listId, tenantId],
  )
}

/**
 * Look up the list on a board that represents a given workflow stage.
 * Used by the My Tasks quick-status changer: we know the card's board
 * but not which list on that board carries the chosen `kind`. Returns
 * null if the user has deleted that workflow column on that board.
 */
export async function getStatusListId(
  tenantId: string,
  boardId: string,
  kind: ListKind,
): Promise<string | null> {
  await ensureMigrated()
  const { rows } = await app.db.query<{ id: string }>(
    `SELECT id FROM lists
      WHERE tenant_id = ? AND board_id = ? AND kind = ? AND archived = 0
      LIMIT 1`,
    [tenantId, boardId, kind],
  )
  return rows[0]?.id ?? null
}

export async function moveList(
  tenantId: string,
  boardId: string,
  listId: string,
  prevPos: number | null,
  nextPos: number | null,
): Promise<number> {
  await ensureMigrated()
  const position = between(prevPos, nextPos)
  await app.db.execute(
    `UPDATE lists SET position = ? WHERE id = ? AND tenant_id = ?`,
    [position, listId, tenantId],
  )
  await touchBoard(tenantId, boardId)
  return position
}

export async function deleteList(tenantId: string, listId: string): Promise<void> {
  await ensureMigrated()
  // SQL inlined per child table so static scanners see each statement is
  // fully parameterized. The shared subquery still keeps the cleanup at
  // one round-trip per table without threading card_id lists through JS.
  await app.db.execute(
    `DELETE FROM mentions WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`,
    [listId],
  )
  await app.db.execute(
    `DELETE FROM comments WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`,
    [listId],
  )
  await app.db.execute(
    `DELETE FROM card_labels WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`,
    [listId],
  )
  await app.db.execute(
    `DELETE FROM card_assignees WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`,
    [listId],
  )
  await app.db.execute(
    `DELETE FROM checklist_items WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`,
    [listId],
  )
  await app.db.execute(`DELETE FROM cards WHERE list_id = ? AND tenant_id = ?`, [listId, tenantId])
  await app.db.execute(`DELETE FROM lists WHERE id      = ? AND tenant_id = ?`, [listId, tenantId])
}
