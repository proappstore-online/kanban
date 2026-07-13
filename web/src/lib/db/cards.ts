import { app } from '../app'
import type { Card, ChecklistItem, Label, LabelColor } from '../../types'
import { between, firstPosition } from '../frac'
import { ensureMigrated, rid } from './core'
import { touchBoard } from './boards'
import { q, x } from '../actions'

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
  await x('create_card', {
    id,
    tenant_id: tenantId,
    board_id: boardId,
    list_id: listId,
    position,
    title,
  })
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
    fieldValues: [],
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
  coverUrl?: string | null
}

export async function updateCard(
  tenantId: string,
  cardId: string,
  patch: CardPatch,
): Promise<void> {
  await ensureMigrated()
  // The registered `update_card` action applies only the fields whose `*_set`
  // flag is 1, so a field left out of `patch` is untouched while a field set
  // explicitly to null is cleared — mirroring the old dynamic-SET behaviour.
  // `title` is non-nullable, so COALESCE(:title, title) is enough for it.
  const anySet =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.requirement !== undefined ||
    patch.acceptanceCriteria !== undefined ||
    patch.dueAt !== undefined ||
    patch.etaAt !== undefined ||
    patch.coverUrl !== undefined
  if (!anySet) return
  await x('update_card', {
    tenant_id: tenantId,
    card_id: cardId,
    title: patch.title ?? null,
    description: patch.description ?? null,
    description_set: patch.description !== undefined ? 1 : 0,
    requirement: patch.requirement ?? null,
    requirement_set: patch.requirement !== undefined ? 1 : 0,
    acceptance_criteria: patch.acceptanceCriteria ?? null,
    acceptance_criteria_set: patch.acceptanceCriteria !== undefined ? 1 : 0,
    due_at: patch.dueAt ?? null,
    due_at_set: patch.dueAt !== undefined ? 1 : 0,
    eta_at: patch.etaAt ?? null,
    eta_at_set: patch.etaAt !== undefined ? 1 : 0,
    cover_url: patch.coverUrl ?? null,
    cover_url_set: patch.coverUrl !== undefined ? 1 : 0,
  })
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
  const rows = await q<{
    id: string
    title: string
    list_id: string
    list_title: string
    updated_at: number
  }>('list_archived_cards', { tenant_id: tenantId, board_id: boardId })
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
  await x('archive_card', { tenant_id: tenantId, card_id: cardId })
}

export async function unarchiveCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  await x('unarchive_card', { tenant_id: tenantId, card_id: cardId })
}

/**
 * Hard-delete a card and every child row (comments, mentions, labels,
 * assignees, checklist). Use sparingly — archive is the usual move so the
 * activity trail and audit context survive. The CardModal exposes both
 * with different visual weights.
 */
export async function deleteCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  // Atomic cascade — one D1 transaction, membership-guarded per statement.
  await x('delete_card', { tenant_id: tenantId, card_id: cardId })
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
  await x('move_card', { tenant_id: tenantId, card_id: cardId, to_list_id: toListId, position })
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
  await x('add_assignee', { tenant_id: tenantId, card_id: cardId, user_id: userId })
}

export async function removeAssignee(
  tenantId: string,
  cardId: string,
  userId: string,
): Promise<void> {
  await ensureMigrated()
  await x('remove_assignee', { tenant_id: tenantId, card_id: cardId, user_id: userId })
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
  const rows = await q<LabelRow>('list_board_labels', { tenant_id: tenantId, board_id: boardId })
  const existing = new Set(rows.map((r) => r.color))
  const toCreate = colors.filter((c) => !existing.has(c))
  for (const color of toCreate) {
    await x('create_label', { id: rid(), tenant_id: tenantId, board_id: boardId, color })
  }
  const after = await q<LabelRow>('list_board_labels', { tenant_id: tenantId, board_id: boardId })
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
  await x('rename_board_label', { tenant_id: tenantId, label_id: labelId, name })
}

export async function setCardLabels(
  tenantId: string,
  cardId: string,
  labelIds: string[],
): Promise<void> {
  await ensureMigrated()
  // Atomic clear + re-insert. The action expands a JSON array of label ids
  // via json_each, so the whole set replace is one guarded D1 transaction.
  await x('set_card_labels', {
    tenant_id: tenantId,
    card_id: cardId,
    label_ids_json: JSON.stringify(labelIds),
  })
}

// Checklist -------------------------------------------------------------------

export async function setChecklist(
  tenantId: string,
  cardId: string,
  items: ChecklistItem[],
): Promise<void> {
  await ensureMigrated()
  // Atomic clear + re-insert. The action expands a JSON array of
  // {id,text,done,position} via json_each, so this is one guarded D1 transaction.
  await x('set_checklist', {
    tenant_id: tenantId,
    card_id: cardId,
    items_json: JSON.stringify(
      items.map((item) => ({
        id: item.id,
        text: item.text,
        done: item.done ? 1 : 0,
        position: item.position,
      })),
    ),
  })
}
