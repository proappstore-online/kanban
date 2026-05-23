import { app } from '../app'
import type { Card, ChecklistItem, Label, LabelColor } from '../../types'
import { between, firstPosition } from '../frac'
import { ensureMigrated, rid } from './core'
import { touchBoard } from './boards'

export async function createCard(
  tenantId: string,
  boardId: string,
  listId: string,
  title: string,
  lastPositionInList: number | null,
): Promise<Card> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const position = lastPositionInList === null ? firstPosition() : between(lastPositionInList, null)
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO cards
      (id, tenant_id, board_id, list_id, position, title, archived, created_by, created_at, updated_at, version)
     VALUES (?,?,?,?,?,?,0,?,?,?,1)`,
    [id, tenantId, boardId, listId, position, title, me.id, now, now],
  )
  await touchBoard(tenantId, boardId)
  return {
    id,
    boardId,
    listId,
    title,
    position,
    labels: [],
    checklist: [],
    assignees: [],
    commentCount: 0,
    createdBy: me.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export interface CardPatch {
  title?: string
  description?: string | null
  requirement?: string | null
  acceptanceCriteria?: string | null
  dueAt?: number | null
  etaAt?: number | null
}

export async function updateCard(
  tenantId: string,
  cardId: string,
  patch: CardPatch,
): Promise<void> {
  await ensureMigrated()
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.title !== undefined) {
    sets.push('title = ?')
    params.push(patch.title)
  }
  if (patch.description !== undefined) {
    sets.push('description = ?')
    params.push(patch.description)
  }
  if (patch.requirement !== undefined) {
    sets.push('requirement = ?')
    params.push(patch.requirement)
  }
  if (patch.acceptanceCriteria !== undefined) {
    sets.push('acceptance_criteria = ?')
    params.push(patch.acceptanceCriteria)
  }
  if (patch.dueAt !== undefined) {
    sets.push('due_at = ?')
    params.push(patch.dueAt)
  }
  if (patch.etaAt !== undefined) {
    sets.push('eta_at = ?')
    params.push(patch.etaAt)
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now())
  sets.push('version = version + 1')
  params.push(cardId, tenantId)
  await app.db.execute(
    `UPDATE cards SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params,
  )
}

export interface ArchivedCardSummary {
  id: string
  title: string
  listId: string
  listTitle: string
  archivedAt: number
}

/**
 * List archived cards on a board, joined with their parent list's title
 * for display ("Archived: Spec out v2 (was in In progress)"). Ordered
 * most-recently-archived first; `updated_at` doubles as the archive
 * timestamp because the only thing that flips `archived` also bumps it.
 */
export async function listArchivedCards(
  tenantId: string,
  boardId: string,
): Promise<ArchivedCardSummary[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<{
    id: string
    title: string
    list_id: string
    list_title: string
    updated_at: number
  }>(
    `SELECT c.id, c.title, c.list_id, l.title AS list_title, c.updated_at
       FROM cards c
       LEFT JOIN lists l ON l.id = c.list_id
      WHERE c.tenant_id = ? AND c.board_id = ? AND c.archived = 1
      ORDER BY c.updated_at DESC`,
    [tenantId, boardId],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    listId: r.list_id,
    listTitle: r.list_title ?? '(deleted list)',
    archivedAt: r.updated_at,
  }))
}

/**
 * Soft-archive a card. The row stays in D1 (along with its comments,
 * mentions, labels, assignees, checklist) — `getBoardFull` already
 * filters on `archived = 0` so archived cards drop out of the live
 * board automatically. Reversible via `unarchiveCard`.
 */
export async function archiveCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE cards SET archived = 1, updated_at = ?, version = version + 1
      WHERE id = ? AND tenant_id = ?`,
    [Date.now(), cardId, tenantId],
  )
}

export async function unarchiveCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE cards SET archived = 0, updated_at = ?, version = version + 1
      WHERE id = ? AND tenant_id = ?`,
    [Date.now(), cardId, tenantId],
  )
}

/**
 * Hard-delete a card and every child row (comments, mentions, labels,
 * assignees, checklist). Use sparingly — archive is the usual move so the
 * activity trail and audit context survive. The CardModal exposes both
 * with different visual weights.
 */
export async function deleteCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM mentions        WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM comments        WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM card_labels     WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM card_assignees  WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM checklist_items WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM cards WHERE id = ? AND tenant_id = ?`, [cardId, tenantId])
}

export async function moveCard(
  tenantId: string,
  cardId: string,
  toListId: string,
  prevPos: number | null,
  nextPos: number | null,
): Promise<number> {
  await ensureMigrated()
  const position = between(prevPos, nextPos)
  await app.db.execute(
    `UPDATE cards
        SET list_id = ?, position = ?, updated_at = ?, version = version + 1
      WHERE id = ? AND tenant_id = ?`,
    [toListId, position, Date.now(), cardId, tenantId],
  )
  return position
}

// Assignees -------------------------------------------------------------------

export async function addAssignee(
  tenantId: string,
  cardId: string,
  userId: string,
): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await app.db.execute(
    `INSERT OR IGNORE INTO card_assignees (tenant_id, card_id, user_id, assigned_at, assigned_by)
     VALUES (?,?,?,?,?)`,
    [tenantId, cardId, userId, Date.now(), me.id],
  )
}

export async function removeAssignee(
  tenantId: string,
  cardId: string,
  userId: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `DELETE FROM card_assignees WHERE tenant_id = ? AND card_id = ? AND user_id = ?`,
    [tenantId, cardId, userId],
  )
}

// Labels ----------------------------------------------------------------------

interface LabelRow {
  id: string
  tenant_id: string
  board_id: string
  color: LabelColor
  name: string
}

export async function ensureBoardLabels(
  tenantId: string,
  boardId: string,
  colors: LabelColor[],
): Promise<Label[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<LabelRow>(
    `SELECT * FROM labels WHERE board_id = ? AND tenant_id = ?`,
    [boardId, tenantId],
  )
  const existing = new Set(rows.map((r) => r.color))
  const toCreate = colors.filter((c) => !existing.has(c))
  for (const color of toCreate) {
    await app.db.execute(
      `INSERT INTO labels (id, tenant_id, board_id, color, name) VALUES (?,?,?,?,'')`,
      [rid(), tenantId, boardId, color],
    )
  }
  const { rows: after } = await app.db.query<LabelRow>(
    `SELECT * FROM labels WHERE board_id = ? AND tenant_id = ?`,
    [boardId, tenantId],
  )
  return after.map((r) => ({ id: r.id, color: r.color, name: r.name }))
}

/**
 * Rename a board-scoped label. The name is shared across every card that
 * uses the label on this board — Trello semantics. Idempotent: setting the
 * same name is a no-op write.
 */
export async function renameBoardLabel(
  tenantId: string,
  labelId: string,
  name: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE labels SET name = ? WHERE id = ? AND tenant_id = ?`,
    [name, labelId, tenantId],
  )
}

export async function setCardLabels(
  tenantId: string,
  cardId: string,
  labelIds: string[],
): Promise<void> {
  await ensureMigrated()
  await app.db.batch([
    { sql: `DELETE FROM card_labels WHERE card_id = ?`, params: [cardId] },
    ...labelIds.map((labelId) => ({
      sql: `INSERT INTO card_labels (tenant_id, card_id, label_id) VALUES (?,?,?)`,
      params: [tenantId, cardId, labelId],
    })),
  ])
}

// Checklist -------------------------------------------------------------------

export async function setChecklist(
  tenantId: string,
  cardId: string,
  items: ChecklistItem[],
): Promise<void> {
  await ensureMigrated()
  const now = Date.now()
  await app.db.batch([
    { sql: `DELETE FROM checklist_items WHERE card_id = ?`, params: [cardId] },
    ...items.map((item) => ({
      sql: `INSERT INTO checklist_items (id, tenant_id, card_id, text, done, position, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      params: [item.id, tenantId, cardId, item.text, item.done ? 1 : 0, item.position, now],
    })),
  ])
}
