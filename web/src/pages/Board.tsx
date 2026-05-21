import { useEffect, useRef, useState } from 'react'
import { DndContext, closestCorners } from '@dnd-kit/core'
import type { User } from '@proappstore/sdk'
import type {
  ActivityKind,
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
  addComment,
  createCard,
  createList,
  deleteCard,
  deleteComment,
  deleteList,
  ensureBoardLabels,
  logActivity,
  moveCard,
  removeAssignee,
  renameBoard,
  renameBoardLabel,
  renameList,
  setCardLabels,
  setChecklist,
  updateCard,
} from '../lib/db'
import { TopBar } from '../components/TopBar'
import { ListColumn } from '../components/ListColumn'
import { CardModal } from '../components/CardModal'
import { PresenceBar } from '../components/PresenceBar'
import { ActivityPanel } from '../components/ActivityPanel'
import { MentionsBell } from '../components/MentionsBell'
import {
  BoardFilters,
  EMPTY_FILTER,
  matchesFilter,
  type BoardFilter,
} from '../components/BoardFilters'
import { useBoardData } from './board/useBoardData'
import { useBoardDragDrop } from './board/useBoardDragDrop'

interface BoardProps {
  boardId: string
  user: User
  workspace: WorkspaceWithRole
  onBack: () => void
}

export function Board({ boardId, user, workspace, onBack }: BoardProps) {
  // Local UI state — anything else lives in the data hook.
  const [openCard, setOpenCard] = useState<{ cardId: string; listId: string } | null>(null)
  const [addingList, setAddingList] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [renamingBoard, setRenamingBoard] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER)

  // Reset per-board UI state when navigating between boards. Without this,
  // a filter set on board A stays applied when you open board B in the
  // same Board component instance (React reuses the component across hash
  // changes since we don't key on boardId at the App.tsx level).
  useEffect(() => {
    setFilter(EMPTY_FILTER)
    setOpenCard(null)
    setAddingList(false)
    setRenamingBoard(false)
  }, [boardId])

  // Guard against double-click on the status pill firing two concurrent
  // moveCard requests for the same card — second one would race against
  // the first and leave position math unstable.
  const movingCardsRef = useRef<Set<string>>(new Set())

  const {
    board,
    setBoard,
    members,
    openCardComments,
    setOpenCardComments,
    activity,
    showActivity,
    setShowActivity,
    refetchActivity,
    peers,
    broadcast,
    refetch,
  } = useBoardData(workspace.id, boardId, openCard?.cardId ?? null)

  /**
   * Write an activity row (fire-and-forget) and broadcast an
   * `activity.added` patch so any open activity drawer refreshes. Kept
   * inline so each mutation site is a single call.
   */
  function logAndAnnounce(
    kind: ActivityKind,
    payload: Record<string, unknown>,
    cardId?: string,
  ) {
    if (!board) return
    logActivity(workspace.id, board.id, kind, payload, cardId).catch(() => {})
    broadcast({ kind: 'activity.added' })
    if (showActivity) refetchActivity().catch(() => {})
  }

  const { sensors, handleDragOver, handleDragEnd } = useBoardDragDrop({
    tenantId: workspace.id,
    board,
    setBoard,
    refetch,
    broadcast,
    onMovedAcross: (cardId, title, from, to) =>
      logAndAnnounce('card.moved', { title, from, to }, cardId),
  })

  // Loading / not-found guards before the mutation handlers reference `board`.
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

  // Mutation handlers ---------------------------------------------------------

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
    logAndAnnounce('list.created', { listId: next.id, title: t })
  }

  async function commitRenameBoard() {
    setRenamingBoard(false)
    if (!board) return
    const t = nameDraft.trim()
    if (!t || t === board.name) return
    const prev = board.name
    setBoard((b) => (b ? { ...b, name: t } : b))
    await renameBoard(workspace.id, board.id, t)
    broadcast({ kind: 'board.renamed', name: t })
    logAndAnnounce('board.renamed', { from: prev, to: t })
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
    logAndAnnounce('card.created', { title, listTitle: list.title }, card.id)
  }

  async function handleRenameList(listId: string, title: string) {
    setBoard((b) => {
      if (!b) return b
      return { ...b, lists: b.lists.map((l) => (l.id === listId ? { ...l, title } : l)) }
    })
    await renameList(workspace.id, listId, title)
    broadcast({ kind: 'list.renamed', listId, title })
    logAndAnnounce('list.renamed', { listId, title })
  }

  async function handleDeleteList(listId: string) {
    const list = board?.lists.find((l) => l.id === listId)
    setBoard((b) => (b ? { ...b, lists: b.lists.filter((l) => l.id !== listId) } : b))
    await deleteList(workspace.id, listId)
    broadcast({ kind: 'list.deleted', listId })
    logAndAnnounce('list.deleted', { listId, title: list?.title })
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
    patch: {
      title?: string
      description?: string | null
      requirement?: string | null
      acceptanceCriteria?: string | null
      dueAt?: number | null
      etaAt?: number | null
    },
  ) {
    updateCardLocal(cardId, listId, {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description ?? undefined }),
      ...(patch.requirement !== undefined && { requirement: patch.requirement ?? undefined }),
      ...(patch.acceptanceCriteria !== undefined && {
        acceptanceCriteria: patch.acceptanceCriteria ?? undefined,
      }),
      ...(patch.dueAt !== undefined && { dueAt: patch.dueAt ?? undefined }),
      ...(patch.etaAt !== undefined && { etaAt: patch.etaAt ?? undefined }),
    })
    await updateCard(workspace.id, cardId, patch)
    broadcast({ kind: 'card.updated', cardId })
    const card = board?.lists.find((l) => l.id === listId)?.cards.find((c) => c.id === cardId)
    logAndAnnounce('card.updated', { title: card?.title, changed: Object.keys(patch) }, cardId)
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

  /**
   * Persist a label's display name. Names are board-scoped, so this can
   * change other cards' previews too — we refetch the whole board to pick
   * up the rename across every chip rendered for that label.
   */
  async function handleRenameLabel(labelId: string, name: string) {
    if (!board) return
    await renameBoardLabel(workspace.id, labelId, name)
    broadcast({ kind: 'card.labels-changed', cardId: '' })
    refetch().catch(() => {})
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
    logAndAnnounce(
      exists ? 'card.unassigned' : 'card.assigned',
      { cardTitle: card.title, member: member.displayName },
      cardId,
    )
  }

  async function handlePostComment(cardId: string, body: string) {
    if (!board) return
    const result = await addComment(workspace.id, board.id, cardId, body, members)
    setOpenCardComments((prev) => [...prev, result.comment])
    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        lists: b.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) =>
            c.id === cardId ? { ...c, commentCount: c.commentCount + 1 } : c,
          ),
        })),
      }
    })
    broadcast({ kind: 'card.comment-added', cardId })
    const card = board.lists.flatMap((l) => l.cards).find((c) => c.id === cardId)
    logAndAnnounce(
      'comment.added',
      {
        cardTitle: card?.title,
        snippet: body.length > 80 ? body.slice(0, 80) + '…' : body,
        mentioned: result.mentionedUserIds.length,
      },
      cardId,
    )
  }

  async function handleDeleteComment(cardId: string, commentId: string) {
    setOpenCardComments((prev) => prev.filter((c) => c.id !== commentId))
    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        lists: b.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) =>
            c.id === cardId ? { ...c, commentCount: Math.max(0, c.commentCount - 1) } : c,
          ),
        })),
      }
    })
    await deleteComment(workspace.id, commentId)
    broadcast({ kind: 'card.comment-deleted', cardId })
  }

  async function handleDeleteCard(cardId: string, listId: string) {
    const card = board?.lists.find((l) => l.id === listId)?.cards.find((c) => c.id === cardId)
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
    logAndAnnounce('card.deleted', { title: card?.title }, cardId)
  }

  const open = openCard
    ? board.lists.find((l) => l.id === openCard.listId)?.cards.find((c) => c.id === openCard.cardId)
    : null

  // Filter counts shown in the BoardFilters toolbar. Computed once per
  // render — cheap on board sizes we care about; if it ever shows up in
  // a profile, memoize on (board, filter, user.id).
  const totalCards = board.lists.reduce((n, l) => n + l.cards.length, 0)
  const visibleCards = board.lists.reduce(
    (n, l) => n + l.cards.filter((c) => matchesFilter(c, filter, user.id)).length,
    0,
  )

  /**
   * Status pill quick-change: find the list on this board whose kind
   * matches the chosen status and move the card there. Reuses the same
   * moveCard + broadcast path as drag-drop, so other peers see it land
   * exactly as if the user had dragged the card.
   */
  async function handleQuickStatus(
    cardId: string,
    fromListId: string,
    targetKind: import('../types').ListKind,
  ) {
    if (!board) return
    if (movingCardsRef.current.has(cardId)) return
    const targetList = board.lists.find((l) => l.kind === targetKind)
    if (!targetList || targetList.id === fromListId) return

    const sourceList = board.lists.find((l) => l.id === fromListId)
    const card = sourceList?.cards.find((c) => c.id === cardId)
    if (!card) return

    movingCardsRef.current.add(cardId)

    // Optimistic local move to the end of the target list.
    setBoard((b) => {
      if (!b) return b
      const next = structuredClone(b) as typeof b
      const from = next.lists.find((l) => l.id === fromListId)!
      const to = next.lists.find((l) => l.id === targetList.id)!
      const idx = from.cards.findIndex((c) => c.id === cardId)
      if (idx === -1) return b
      const [moved] = from.cards.splice(idx, 1)
      moved.listId = targetList.id
      to.cards.push(moved)
      return next
    })

    const lastPos = targetList.cards[targetList.cards.length - 1]?.position ?? null
    try {
      const position = await moveCard(workspace.id, cardId, targetList.id, lastPos, null)
      setBoard((b) => {
        if (!b) return b
        const next = structuredClone(b) as typeof b
        const l = next.lists.find((l) => l.cards.some((c) => c.id === cardId))
        const c = l?.cards.find((c) => c.id === cardId)
        if (c) c.position = position
        return next
      })
      broadcast({
        kind: 'card.moved',
        cardId,
        fromListId,
        toListId: targetList.id,
        position,
      })
      logAndAnnounce(
        'card.moved',
        { title: card.title, from: sourceList?.title, to: targetList.title },
        cardId,
      )
    } catch {
      refetch().catch(() => {})
    } finally {
      movingCardsRef.current.delete(cardId)
    }
  }

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
        right={
          <div className="flex items-center gap-2">
            <PresenceBar peers={peers} selfId={user.id} />
            <button
              onClick={() => setShowActivity((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs ${
                showActivity
                  ? 'border-[var(--accent)] text-[var(--ink)]'
                  : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="Activity"
              aria-pressed={showActivity}
            >
              Activity
            </button>
            <MentionsBell
              workspaceId={workspace.id}
              onOpenCard={(cardId, targetBoardId) => {
                if (targetBoardId !== boardId) {
                  location.hash = `#/w/${workspace.slug}/board/${targetBoardId}`
                  return
                }
                const target = board?.lists.find((l) => l.cards.some((c) => c.id === cardId))
                if (target) setOpenCard({ cardId, listId: target.id })
              }}
            />
          </div>
        }
      />

      <BoardFilters
        board={board}
        members={members}
        selfUserId={user.id}
        value={filter}
        onChange={setFilter}
        totalCards={totalCards}
        visibleCards={visibleCards}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main className="flex flex-1 snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-4 px-4 py-6 sm:snap-none sm:px-6">
          {board.lists.map((list) => {
            const visible = list.cards.filter((c) => matchesFilter(c, filter, user.id))
            return (
              <ListColumn
                key={list.id}
                list={{ ...list, cards: visible }}
                onAddCard={(title) => handleAddCard(list, title)}
                onCardClick={(card) => setOpenCard({ cardId: card.id, listId: list.id })}
                onRename={(title) => handleRenameList(list.id, title)}
                onDelete={() => handleDeleteList(list.id)}
                onQuickStatus={(card, targetKind) =>
                  handleQuickStatus(card.id, list.id, targetKind)
                }
              />
            )
          })}

          {addingList ? (
            <div className="flex w-[calc(100vw-2rem)] shrink-0 snap-start flex-col gap-2 rounded-2xl bg-[var(--glass)] p-3 sm:w-72 sm:snap-align-none">
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
              className="flex h-12 w-[calc(100vw-2rem)] shrink-0 snap-start items-center justify-center rounded-2xl border-2 border-dashed border-[var(--line-strong)] text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)] sm:w-72 sm:snap-align-none"
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
          comments={openCardComments}
          selfUserId={user.id}
          onClose={() => setOpenCard(null)}
          onSaveBasics={(patch) => handleSaveBasics(open.id, openCard.listId, patch)}
          onLabelsChange={(labels) => handleLabelsChange(open.id, openCard.listId, labels)}
          onRenameLabel={handleRenameLabel}
          onChecklistChange={(items) => handleChecklistChange(open.id, openCard.listId, items)}
          onAssigneeToggle={(member) => handleAssigneeToggle(open.id, openCard.listId, member)}
          onPostComment={(body) => handlePostComment(open.id, body)}
          onDeleteComment={(commentId) => handleDeleteComment(open.id, commentId)}
          onDelete={() => handleDeleteCard(open.id, openCard.listId)}
        />
      ) : null}

      {showActivity && (
        <ActivityPanel
          entries={activity}
          onClose={() => setShowActivity(false)}
          onOpenCard={(cardId) => {
            const target = board.lists.find((l) => l.cards.some((c) => c.id === cardId))
            if (target) {
              setOpenCard({ cardId, listId: target.id })
              setShowActivity(false)
            }
          }}
        />
      )}
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
