import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { User } from '@proappstore/sdk'
import type {
  BoardWithLists,
  Card,
  ChecklistItem,
  Label,
  LabelColor,
  List,
  Member,
  WorkspaceWithRole,
} from '../types'
import {
  addAssignee,
  createCard,
  createList,
  deleteCard,
  deleteList,
  ensureBoardLabels,
  getBoardFull,
  listMembers,
  moveCard,
  removeAssignee,
  renameBoard,
  renameList,
  setCardLabels,
  setChecklist,
  updateCard,
} from '../lib/db'
import { useBoardRoom, type BoardPatch } from '../lib/realtime'
import { TopBar } from '../components/TopBar'
import { ListColumn } from '../components/ListColumn'
import { CardModal } from '../components/CardModal'
import { PresenceBar } from '../components/PresenceBar'

interface BoardProps {
  boardId: string
  user: User
  workspace: WorkspaceWithRole
  onBack: () => void
}

export function Board({ boardId, user, workspace, onBack }: BoardProps) {
  const [board, setBoard] = useState<BoardWithLists | null | undefined>(undefined)
  const [members, setMembers] = useState<Member[]>([])
  const [openCard, setOpenCard] = useState<{ cardId: string; listId: string } | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [renamingBoard, setRenamingBoard] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const refetch = useCallback(async () => {
    const next = await getBoardFull(workspace.id, boardId)
    setBoard(next)
  }, [workspace.id, boardId])

  // Initial load + members.
  useEffect(() => {
    let cancelled = false
    Promise.all([getBoardFull(workspace.id, boardId), listMembers(workspace.id)])
      .then(([b, m]) => {
        if (cancelled) return
        setBoard(b)
        setMembers(m)
      })
      .catch(() => {
        if (!cancelled) setBoard(null)
      })
    return () => {
      cancelled = true
    }
  }, [workspace.id, boardId])

  // Realtime: apply incoming patches by either patching local state directly
  // for the trivial cases (board rename, list rename) or refetching the whole
  // board for anything structural. v1 trade: simpler + always correct. We can
  // downgrade to surgical patches later.
  const handlePatch = useCallback(
    (patch: BoardPatch) => {
      switch (patch.kind) {
        case 'board.renamed':
          setBoard((b) => (b ? { ...b, name: patch.name } : b))
          return
        case 'list.renamed':
          setBoard((b) => {
            if (!b) return b
            return {
              ...b,
              lists: b.lists.map((l) => (l.id === patch.listId ? { ...l, title: patch.title } : l)),
            }
          })
          return
        default:
          refetch().catch(() => {})
      }
    },
    [refetch],
  )

  const { peers, broadcast } = useBoardRoom(boardId, handlePatch)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // The originating list of an in-flight drag, captured at drag-over time so
  // the drop handler can broadcast a `card.moved` even when the card returns
  // to its original list at a new index.
  const dragOriginRef = useRef<{ cardId: string; fromListId: string } | null>(null)

  function findListByCardId(b: BoardWithLists, cardId: string): List | undefined {
    return b.lists.find((l) => l.cards.some((c) => c.id === cardId))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || !board) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    setBoard((prev) => {
      if (!prev) return prev
      const fromList = findListByCardId(prev, activeId)
      if (!fromList) return prev
      if (!dragOriginRef.current) {
        dragOriginRef.current = { cardId: activeId, fromListId: fromList.id }
      }

      let toListId: string
      let toIndex: number
      if (overId.startsWith('list:')) {
        toListId = overId.slice(5)
        const toList = prev.lists.find((l) => l.id === toListId)
        if (!toList) return prev
        toIndex = toList.cards.length
      } else {
        const toList = findListByCardId(prev, overId)
        if (!toList) return prev
        toListId = toList.id
        toIndex = toList.cards.findIndex((c) => c.id === overId)
      }

      if (fromList.id === toListId) return prev

      const next = structuredClone(prev) as BoardWithLists
      const from = next.lists.find((l) => l.id === fromList.id)!
      const to = next.lists.find((l) => l.id === toListId)!
      const idx = from.cards.findIndex((c) => c.id === activeId)
      const [card] = from.cards.splice(idx, 1)
      card.listId = toListId
      to.cards.splice(toIndex, 0, card)
      return next
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const activeId = String(active.id)
    const overId = over ? String(over.id) : null
    const origin = dragOriginRef.current
    dragOriginRef.current = null

    // First commit any same-list reorder produced by the drop target.
    setBoard((prev) => {
      if (!prev || !overId) return prev
      const fromList = findListByCardId(prev, activeId)
      if (!fromList) return prev
      if (overId.startsWith('list:')) return prev
      const overList = findListByCardId(prev, overId)
      if (overList && overList.id === fromList.id) {
        const oldIndex = fromList.cards.findIndex((c) => c.id === activeId)
        const newIndex = fromList.cards.findIndex((c) => c.id === overId)
        if (oldIndex !== newIndex) {
          const next = structuredClone(prev) as BoardWithLists
          const list = next.lists.find((l) => l.id === fromList.id)!
          list.cards = arrayMove(list.cards, oldIndex, newIndex)
          return next
        }
      }
      return prev
    })

    // Then read the post-state and persist. setBoard's functional updater
    // gives us a guaranteed-fresh snapshot inside a microtask.
    setBoard((latest) => {
      if (!latest) return latest
      const list = findListByCardId(latest, activeId)
      if (!list) return latest
      const idx = list.cards.findIndex((c) => c.id === activeId)
      const prevPos = idx > 0 ? list.cards[idx - 1].position : null
      const nextPos = idx < list.cards.length - 1 ? list.cards[idx + 1].position : null
      const fromListId = origin?.fromListId ?? list.id
      // Skip the write if the card neither moved lists nor changed neighbours.
      const neighboursUnchanged =
        fromListId === list.id && prevPos === null && nextPos === null && list.cards.length === 1
      if (neighboursUnchanged) return latest

      moveCard(workspace.id, activeId, list.id, prevPos, nextPos)
        .then((position) => {
          setBoard((b) => {
            if (!b) return b
            const next = structuredClone(b) as BoardWithLists
            const l = findListByCardId(next, activeId)
            const c = l?.cards.find((c) => c.id === activeId)
            if (c) c.position = position
            return next
          })
          broadcast({
            kind: 'card.moved',
            cardId: activeId,
            fromListId,
            toListId: list.id,
            position,
          })
        })
        .catch(() => {
          refetch().catch(() => {})
        })
      return latest
    })
  }

  if (board === undefined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    )
  }

  if (board === null) {
    return (
      <div className="min-h-[100dvh]">
        <TopBar user={user} left={<BackButton onClick={onBack} />} />
        <main className="mx-auto max-w-[1540px] px-4 py-12 text-center">
          <p className="text-[var(--muted)]">Board not found.</p>
        </main>
      </div>
    )
  }

  async function commitAddList() {
    if (!board) return
    const t = newListTitle.trim()
    setNewListTitle('')
    setAddingList(false)
    if (!t) return
    const lastPos = board.lists.length > 0 ? board.lists[board.lists.length - 1].position : null
    const next = await createList(workspace.id, board.id, t, lastPos)
    setBoard((b) => (b ? { ...b, lists: [...b.lists, next] } : b))
    broadcast({ kind: 'list.created', listId: next.id })
  }

  async function commitRenameBoard() {
    setRenamingBoard(false)
    if (!board) return
    const t = nameDraft.trim()
    if (!t || t === board.name) return
    setBoard((b) => (b ? { ...b, name: t } : b))
    await renameBoard(workspace.id, board.id, t)
    broadcast({ kind: 'board.renamed', name: t })
  }

  async function handleAddCard(list: List, title: string) {
    if (!board) return
    const lastPos = list.cards.length > 0 ? list.cards[list.cards.length - 1].position : null
    const card = await createCard(workspace.id, board.id, list.id, title, lastPos)
    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        lists: b.lists.map((l) => (l.id === list.id ? { ...l, cards: [...l.cards, card] } : l)),
      }
    })
    broadcast({ kind: 'card.created', listId: list.id, cardId: card.id })
  }

  async function handleRenameList(listId: string, title: string) {
    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        lists: b.lists.map((l) => (l.id === listId ? { ...l, title } : l)),
      }
    })
    await renameList(workspace.id, listId, title)
    broadcast({ kind: 'list.renamed', listId, title })
  }

  async function handleDeleteList(listId: string) {
    setBoard((b) => {
      if (!b) return b
      return { ...b, lists: b.lists.filter((l) => l.id !== listId) }
    })
    await deleteList(workspace.id, listId)
    broadcast({ kind: 'list.deleted', listId })
  }

  function updateCardLocal(cardId: string, listId: string, patch: Partial<Card>) {
    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        lists: b.lists.map((l) =>
          l.id !== listId
            ? l
            : {
                ...l,
                cards: l.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
              },
        ),
      }
    })
  }

  async function handleSaveBasics(
    cardId: string,
    listId: string,
    patch: { title?: string; description?: string | null; dueAt?: number | null },
  ) {
    updateCardLocal(cardId, listId, {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && {
        description: patch.description ?? undefined,
      }),
      ...(patch.dueAt !== undefined && { dueAt: patch.dueAt ?? undefined }),
    })
    await updateCard(workspace.id, cardId, patch)
    broadcast({ kind: 'card.updated', cardId })
  }

  async function handleLabelsChange(cardId: string, listId: string, labels: Label[]) {
    if (!board) return
    updateCardLocal(cardId, listId, { labels })
    const colors: LabelColor[] = Array.from(new Set(labels.map((l) => l.color)))
    const ensured = await ensureBoardLabels(workspace.id, board.id, colors)
    const ids = labels
      .map((l) => ensured.find((e) => e.color === l.color)?.id)
      .filter((x): x is string => !!x)
    await setCardLabels(workspace.id, cardId, ids)
    broadcast({ kind: 'card.labels-changed', cardId })
  }

  async function handleChecklistChange(
    cardId: string,
    listId: string,
    items: ChecklistItem[],
  ) {
    const positioned = items.map((it, idx) => ({ ...it, position: idx }))
    updateCardLocal(cardId, listId, { checklist: positioned })
    await setChecklist(workspace.id, cardId, positioned)
    broadcast({ kind: 'card.checklist-changed', cardId })
  }

  async function handleAssigneeToggle(cardId: string, listId: string, member: Member) {
    if (!board) return
    const list = board.lists.find((l) => l.id === listId)
    const card = list?.cards.find((c) => c.id === cardId)
    if (!card) return
    const exists = card.assignees.some((a) => a.userId === member.userId)
    const nextAssignees = exists
      ? card.assignees.filter((a) => a.userId !== member.userId)
      : [
          ...card.assignees,
          { userId: member.userId, displayName: member.displayName, avatarUrl: member.avatarUrl },
        ]
    updateCardLocal(cardId, listId, { assignees: nextAssignees })
    if (exists) await removeAssignee(workspace.id, cardId, member.userId)
    else await addAssignee(workspace.id, cardId, member.userId)
    broadcast({ kind: 'card.assignees-changed', cardId })
  }

  async function handleDeleteCard(cardId: string, listId: string) {
    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        lists: b.lists.map((l) =>
          l.id !== listId ? l : { ...l, cards: l.cards.filter((c) => c.id !== cardId) },
        ),
      }
    })
    setOpenCard(null)
    await deleteCard(workspace.id, cardId)
    broadcast({ kind: 'card.deleted', cardId, listId })
  }

  const open = openCard
    ? board.lists.find((l) => l.id === openCard.listId)?.cards.find((c) => c.id === openCard.cardId)
    : null

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar
        user={user}
        left={<BackButton onClick={onBack} />}
        center={
          renamingBoard ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRenameBoard}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRenameBoard()
                if (e.key === 'Escape') setRenamingBoard(false)
              }}
              className="w-full bg-transparent text-center text-sm font-semibold text-[var(--ink)] outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setNameDraft(board.name)
                setRenamingBoard(true)
              }}
              className="truncate font-semibold text-[var(--ink)]"
            >
              {board.name}
            </button>
          )
        }
        right={<PresenceBar peers={peers} selfId={user.id} />}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main className="flex flex-1 gap-4 overflow-x-auto px-4 py-6 sm:px-6">
          {board.lists.map((list) => (
            <ListColumn
              key={list.id}
              list={list}
              onAddCard={(title) => handleAddCard(list, title)}
              onCardClick={(card) => setOpenCard({ cardId: card.id, listId: list.id })}
              onRename={(title) => handleRenameList(list.id, title)}
              onDelete={() => handleDeleteList(list.id)}
            />
          ))}

          {addingList ? (
            <div className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-[var(--glass)] p-3">
              <input
                autoFocus
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAddList()
                  if (e.key === 'Escape') {
                    setAddingList(false)
                    setNewListTitle('')
                  }
                }}
                placeholder="List title"
                className="bg-transparent text-sm font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
              />
              <div className="flex gap-2">
                <button
                  onClick={commitAddList}
                  className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)]"
                >
                  Add list
                </button>
                <button
                  onClick={() => {
                    setAddingList(false)
                    setNewListTitle('')
                  }}
                  className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingList(true)}
              className="flex h-12 w-72 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--line-strong)] text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
            >
              + Add a list
            </button>
          )}
        </main>
      </DndContext>

      {open && openCard ? (
        <CardModal
          card={open}
          members={members}
          onClose={() => setOpenCard(null)}
          onSaveBasics={(patch) => handleSaveBasics(open.id, openCard.listId, patch)}
          onLabelsChange={(labels) => handleLabelsChange(open.id, openCard.listId, labels)}
          onChecklistChange={(items) =>
            handleChecklistChange(open.id, openCard.listId, items)
          }
          onAssigneeToggle={(member) => handleAssigneeToggle(open.id, openCard.listId, member)}
          onDelete={() => handleDeleteCard(open.id, openCard.listId)}
        />
      ) : null}
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
      aria-label="Back to boards"
    >
      ← Boards
    </button>
  )
}
