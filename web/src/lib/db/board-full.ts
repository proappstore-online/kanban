import { app } from '../app'
import type {
  Assignee,
  BoardWithLists,
  Card,
  ChecklistItem,
  Label,
  LabelColor,
  List,
  ListKind,
} from '../../types'
import { ensureMigrated } from './core'
import type { BoardRow } from './boards'
import { rowToBoard } from './boards'

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
  const [boardQ, listsQ, cardsQ, labelsQ, cardLabelsQ, assigneesQ, checklistQ, commentCountQ] =
    await Promise.all([
      app.db.query<BoardRow>(
        `SELECT * FROM boards WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [boardId, tenantId],
      ),
      app.db.query<ListRow>(
        `SELECT * FROM lists WHERE board_id = ? AND tenant_id = ? AND archived = 0 ORDER BY position`,
        [boardId, tenantId],
      ),
      app.db.query<CardRow>(
        `SELECT * FROM cards WHERE board_id = ? AND tenant_id = ? AND archived = 0 ORDER BY list_id, position`,
        [boardId, tenantId],
      ),
      app.db.query<LabelRow>(
        `SELECT * FROM labels WHERE board_id = ? AND tenant_id = ?`,
        [boardId, tenantId],
      ),
      app.db.query<{ card_id: string; label_id: string }>(
        `SELECT cl.card_id, cl.label_id
           FROM card_labels cl
           JOIN cards c ON c.id = cl.card_id
          WHERE c.board_id = ? AND c.tenant_id = ?`,
        [boardId, tenantId],
      ),
      app.db.query<AssigneeRow>(
        `SELECT ca.card_id, ca.user_id, m.display_name, m.avatar_url
           FROM card_assignees ca
           JOIN cards   c ON c.id = ca.card_id
           JOIN members m ON m.tenant_id = ca.tenant_id AND m.user_id = ca.user_id
          WHERE c.board_id = ? AND c.tenant_id = ?`,
        [boardId, tenantId],
      ),
      app.db.query<ChecklistRow>(
        `SELECT ci.*
           FROM checklist_items ci
           JOIN cards c ON c.id = ci.card_id
          WHERE c.board_id = ? AND c.tenant_id = ?
       ORDER BY ci.position`,
        [boardId, tenantId],
      ),
      app.db.query<{ card_id: string; n: number }>(
        `SELECT c.card_id, COUNT(*) AS n
           FROM comments c
           JOIN cards cards ON cards.id = c.card_id
          WHERE c.tenant_id = ? AND cards.board_id = ? AND c.deleted_at IS NULL
          GROUP BY c.card_id`,
        [tenantId, boardId],
      ),
    ])

  const boardRow = boardQ.rows[0]
  if (!boardRow) return null

  const labelById = new Map<string, Label>()
  for (const l of labelsQ.rows) labelById.set(l.id, { id: l.id, color: l.color, name: l.name })

  const labelsByCard = new Map<string, Label[]>()
  for (const { card_id, label_id } of cardLabelsQ.rows) {
    const label = labelById.get(label_id)
    if (!label) continue
    const arr = labelsByCard.get(card_id) ?? []
    arr.push(label)
    labelsByCard.set(card_id, arr)
  }

  const assigneesByCard = new Map<string, Assignee[]>()
  for (const a of assigneesQ.rows) {
    const arr = assigneesByCard.get(a.card_id) ?? []
    arr.push({
      userId: a.user_id,
      displayName: a.display_name,
      avatarUrl: a.avatar_url ?? undefined,
    })
    assigneesByCard.set(a.card_id, arr)
  }

  const checklistByCard = new Map<string, ChecklistItem[]>()
  for (const c of checklistQ.rows) {
    const arr = checklistByCard.get(c.card_id) ?? []
    arr.push({ id: c.id, text: c.text, done: c.done !== 0, position: c.position })
    checklistByCard.set(c.card_id, arr)
  }

  const commentCountByCard = new Map<string, number>(
    commentCountQ.rows.map((r) => [r.card_id, Number(r.n)]),
  )

  const lists: List[] = listsQ.rows.map((lr) => ({
    id: lr.id,
    boardId: lr.board_id,
    title: lr.title,
    position: lr.position,
    kind: lr.kind,
    cards: [],
  }))
  const listById = new Map(lists.map((l) => [l.id, l]))

  for (const cr of cardsQ.rows) {
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
