import type { Board, BoardSummary } from '../../types'
import { STATUS_LABEL } from '../../types'
import { app } from '../app'
import { ensureMigrated, rid } from './core'
import { q, x } from '../actions'

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
  const rows = await q<BoardRow>('list_boards', { tenant_id: tenantId })
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
  // One atomic action creates the board and seeds the four canonical workflow
  // lists (New / In progress / Testing / Launched), spaced by 1024 so reorders
  // never collide with the seed positions.
  await x('create_board', {
    id,
    tenant_id: tenantId,
    name,
    feature_id: featureId ?? null,
    list_new_id: rid(),
    list_new_title: STATUS_LABEL.new,
    list_wip_id: rid(),
    list_wip_title: STATUS_LABEL.wip,
    list_testing_id: rid(),
    list_testing_title: STATUS_LABEL.testing,
    list_launched_id: rid(),
    list_launched_title: STATUS_LABEL.launched,
  })
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
  await x('set_board_feature', { tenant_id: tenantId, board_id: boardId, feature_id: featureId })
}

export async function renameBoard(
  tenantId: string,
  boardId: string,
  name: string,
): Promise<void> {
  await ensureMigrated()
  await x('rename_board', { tenant_id: tenantId, board_id: boardId, name })
}

export async function setBoardBackground(
  tenantId: string,
  boardId: string,
  background: string | null,
): Promise<void> {
  await ensureMigrated()
  await x('set_board_background', { tenant_id: tenantId, board_id: boardId, background })
}

export async function deleteBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  // Atomic cascade — one D1 transaction, membership-guarded per statement.
  await x('delete_board', { tenant_id: tenantId, board_id: boardId })
}

/**
 * Bump `boards.updated_at` to now. Used by mutation sites whose row
 * primarily touches a child table (lists / cards) so the board appears at
 * the top of the "recently updated" sort.
 */
export async function touchBoard(tenantId: string, boardId: string): Promise<void> {
  await x('touch_board', { tenant_id: tenantId, board_id: boardId })
}
