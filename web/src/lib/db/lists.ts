import type { List, ListKind } from '../../types'
import { between } from '../frac'
import { ensureMigrated, rid } from './core'
import { touchBoard } from './boards'
import { q, x } from '../actions'

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
  await x('create_list', { id, tenant_id: tenantId, board_id: boardId, title, position, kind })
  await touchBoard(tenantId, boardId)
  return { id, boardId, title, position, kind, cards: [] }
}

export async function renameList(
  tenantId: string,
  listId: string,
  title: string,
): Promise<void> {
  await ensureMigrated()
  await x('rename_list', { tenant_id: tenantId, list_id: listId, title })
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
  const rows = await q<{ id: string }>('get_status_list_id', {
    tenant_id: tenantId,
    board_id: boardId,
    kind,
  })
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
  await x('move_list', { tenant_id: tenantId, list_id: listId, position })
  await touchBoard(tenantId, boardId)
  return position
}

export async function deleteList(tenantId: string, listId: string): Promise<void> {
  await ensureMigrated()
  // Atomic cascade — one D1 transaction, membership-guarded per statement.
  await x('delete_list', { tenant_id: tenantId, list_id: listId })
}
