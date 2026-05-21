import { app } from '../app'
import type { Board, BoardSummary } from '../../types'
import { STATUS_KINDS, STATUS_LABEL } from '../../types'
import { ensureMigrated, rid } from './core'

export interface BoardRow {
  id: string
  tenant_id: string
  name: string
  feature_id: string | null
  background: string | null
  archived: number
  created_by: string
  created_at: number
  updated_at: number
}

export function rowToBoard(r: BoardRow): Board {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    featureId: r.feature_id ?? undefined,
    background: r.background ?? undefined,
    archived: r.archived !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listBoards(tenantId: string): Promise<BoardSummary[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<BoardRow>(
    `SELECT * FROM boards WHERE tenant_id = ? AND archived = 0 ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    featureId: r.feature_id ?? undefined,
    updatedAt: r.updated_at,
  }))
}

/**
 * Create a board and auto-seed the four canonical workflow lists
 * (New / In progress / Testing / Launched). Per the agreed "status IS the
 * list" model, every new board ships with the same starting columns.
 * Users can still rename or delete them — the `kind` column persists
 * regardless of title, so the cross-board My Tasks view keeps grouping
 * correctly.
 */
export async function createBoard(
  tenantId: string,
  name: string,
  featureId?: string,
): Promise<Board> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO boards (id, tenant_id, name, feature_id, archived, created_by, created_at, updated_at)
     VALUES (?,?,?,?,0,?,?,?)`,
    [id, tenantId, name, featureId ?? null, me.id, now, now],
  )
  // Seed four canonical workflow lists, spaced by 1024 so reorders never
  // collide with the seed positions.
  for (let i = 0; i < STATUS_KINDS.length; i++) {
    const kind = STATUS_KINDS[i]
    await app.db.execute(
      `INSERT INTO lists (id, tenant_id, board_id, title, position, archived, kind, created_at)
       VALUES (?,?,?,?,?,0,?,?)`,
      [rid(), tenantId, id, STATUS_LABEL[kind], (i + 1) * 1024, kind, now],
    )
  }
  return {
    id,
    tenantId,
    name,
    featureId,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

export async function setBoardFeature(
  tenantId: string,
  boardId: string,
  featureId: string | null,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE boards SET feature_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [featureId, Date.now(), boardId, tenantId],
  )
}

export async function renameBoard(
  tenantId: string,
  boardId: string,
  name: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [name, Date.now(), boardId, tenantId],
  )
}

export async function deleteBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  // Cascade by hand — D1 doesn't enforce FK cascades. Each subquery scopes
  // to `WHERE board_id = ?` rather than threading card_id lists through JS,
  // so cleanup is one round-trip per child table. SQL inlined per table
  // (rather than via a shared template-string fragment) so static scanners
  // can see each statement is fully parameterized.
  await app.db.execute(
    `DELETE FROM mentions WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`,
    [boardId],
  )
  await app.db.execute(
    `DELETE FROM comments WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`,
    [boardId],
  )
  await app.db.execute(
    `DELETE FROM card_labels WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`,
    [boardId],
  )
  await app.db.execute(
    `DELETE FROM card_assignees WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`,
    [boardId],
  )
  await app.db.execute(
    `DELETE FROM checklist_items WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`,
    [boardId],
  )
  await app.db.execute(`DELETE FROM cards    WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM lists    WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM labels   WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM activity WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM boards   WHERE id       = ? AND tenant_id = ?`, [boardId, tenantId])
}

/**
 * Bump `boards.updated_at` to now. Used by mutation sites whose row
 * primarily touches a child table (lists / cards) so the board appears at
 * the top of the "recently updated" sort.
 */
export async function touchBoard(tenantId: string, boardId: string): Promise<void> {
  await app.db.execute(
    `UPDATE boards SET updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [Date.now(), boardId, tenantId],
  )
}
