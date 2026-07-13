import type {
  Assignee,
  BoardWithLists,
  Card,
  CardFieldValue,
  ChecklistItem,
  Label,
  LabelColor,
  List,
  ListKind,
} from '../../types'
import { ensureMigrated } from './core'
import type { BoardRow } from './boards'
import { rowToBoard } from './boards'
import { q } from '../actions'

interface ListRow {
  id: string
  tenant_id: string
  board_id: string
  title: string
  position: number
  archived: number
  kind: ListKind
  created_at: number
}

interface CardRow {
  id: string
  tenant_id: string
  board_id: string
  list_id: string
  position: number
  title: string
  description: string | null
  requirement: string | null
  acceptance_criteria: string | null
  due_at: number | null
  eta_at: number | null
  cover_url: string | null
  archived: number
  created_by: string
  created_at: number
  updated_at: number
  version: number
}

interface LabelRow {
  id: string
  tenant_id: string
  board_id: string
  color: LabelColor
  name: string
}

interface ChecklistRow {
  id: string
  tenant_id: string
  card_id: string
  text: string
  done: number
  position: number
  created_at: number
}

interface AssigneeRow {
  card_id: string
  user_id: string
  display_name: string
  avatar_url: string | null
}

/**
 * One-shot read of an entire board: lists + cards + labels + assignees +
 * checklists + per-card comment counts. Runs 8 queries in parallel and
 * stitches the rows together client-side; cheaper than a deeply-nested
 * JOIN result on D1 and keeps each query trivially indexed.
 */
export async function getBoardFull(
  tenantId: string,
  boardId: string,
): Promise<BoardWithLists | null> {
  await ensureMigrated()
  const p = { tenant_id: tenantId, board_id: boardId }
  const [boardRows, listRows, cardRows, labelRows, cardLabelRows, assigneeRows, checklistRows, commentCountRows, fieldValueRows] =
    await Promise.all([
      q<BoardRow>('get_board', p),
      q<ListRow>('list_board_lists', p),
      q<CardRow>('list_board_cards', p),
      q<LabelRow>('list_board_labels', p),
      q<{ card_id: string; label_id: string }>('list_board_card_labels', p),
      q<AssigneeRow>('list_board_assignees', p),
      q<ChecklistRow>('list_board_checklists', p),
      q<{ card_id: string; n: number }>('list_board_comment_counts', p),
      q<{ card_id: string; field_id: string; value: string }>('list_board_field_values', p),
    ])

  const boardRow = boardRows[0]
  if (!boardRow) return null

  const labelById = new Map<string, Label>()
  for (const l of labelRows) labelById.set(l.id, { id: l.id, color: l.color, name: l.name })

  const labelsByCard = new Map<string, Label[]>()
  for (const { card_id, label_id } of cardLabelRows) {
    const label = labelById.get(label_id)
    if (!label) continue
    const arr = labelsByCard.get(card_id) ?? []
    arr.push(label)
    labelsByCard.set(card_id, arr)
  }

  const assigneesByCard = new Map<string, Assignee[]>()
  for (const a of assigneeRows) {
    const arr = assigneesByCard.get(a.card_id) ?? []
    arr.push({
      userId: a.user_id,
      displayName: a.display_name,
      avatarUrl: a.avatar_url ?? undefined,
    })
    assigneesByCard.set(a.card_id, arr)
  }

  const checklistByCard = new Map<string, ChecklistItem[]>()
  for (const c of checklistRows) {
    const arr = checklistByCard.get(c.card_id) ?? []
    arr.push({ id: c.id, text: c.text, done: c.done !== 0, position: c.position })
    checklistByCard.set(c.card_id, arr)
  }

  const commentCountByCard = new Map<string, number>(
    commentCountRows.map((r) => [r.card_id, Number(r.n)]),
  )

  const fieldValuesByCard = new Map<string, CardFieldValue[]>()
  for (const fv of fieldValueRows) {
    const arr = fieldValuesByCard.get(fv.card_id) ?? []
    arr.push({ fieldId: fv.field_id, value: fv.value })
    fieldValuesByCard.set(fv.card_id, arr)
  }

  const lists: List[] = listRows.map((lr) => ({
    id: lr.id,
    boardId: lr.board_id,
    title: lr.title,
    position: lr.position,
    kind: lr.kind,
    cards: [],
  }))
  const listById = new Map(lists.map((l) => [l.id, l]))

  for (const cr of cardRows) {
    const list = listById.get(cr.list_id)
    if (!list) continue
    const card: Card = {
      id: cr.id,
      boardId: cr.board_id,
      listId: cr.list_id,
      title: cr.title,
      description: cr.description ?? undefined,
      requirement: cr.requirement ?? undefined,
      acceptanceCriteria: cr.acceptance_criteria ?? undefined,
      dueAt: cr.due_at ?? undefined,
      etaAt: cr.eta_at ?? undefined,
      coverUrl: cr.cover_url ?? undefined,
      position: cr.position,
      labels: labelsByCard.get(cr.id) ?? [],
      checklist: checklistByCard.get(cr.id) ?? [],
      assignees: assigneesByCard.get(cr.id) ?? [],
      fieldValues: fieldValuesByCard.get(cr.id) ?? [],
      commentCount: commentCountByCard.get(cr.id) ?? 0,
      createdBy: cr.created_by,
      createdAt: cr.created_at,
      updatedAt: cr.updated_at,
      version: cr.version,
    }
    list.cards.push(card)
  }

  return { ...rowToBoard(boardRow), lists }
}
