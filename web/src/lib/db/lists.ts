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

export async function deleteList(tenantId: string, listId: string): Promise<void> {
  await ensureMigrated()
  const inCards = `card_id IN (SELECT id FROM cards WHERE list_id = ?)`
  await app.db.execute(`DELETE FROM mentions        WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM comments        WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM card_labels     WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM card_assignees  WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM checklist_items WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM cards WHERE list_id = ? AND tenant_id = ?`, [listId, tenantId])
  await app.db.execute(`DELETE FROM lists WHERE id      = ? AND tenant_id = ?`, [listId, tenantId])
}
