import { useRef } from 'react'
import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { BoardWithLists, List } from '../../types'
import { moveCard, moveList } from '../../lib/db'
import type { BoardPatch } from '../../lib/realtime'

interface UseBoardDragDropArgs {
  tenantId: string
  board: BoardWithLists | null | undefined
  setBoard: React.Dispatch<React.SetStateAction<BoardWithLists | null | undefined>>
  refetch: () => Promise<void>
  broadcast: (patch: BoardPatch) => void
  /** Called when a cross-list move persists, so the activity feed picks it up. */
  onMovedAcross: (
    cardId: string,
    title: string | undefined,
    fromTitle: string | undefined,
    toTitle: string,
  ) => void
}

/**
 * Owns the dnd-kit sensors and the two drag handlers (over + end). Pulling
 * this out of Board.tsx isolates the race-prone code: `handleDragEnd`
 * computes the post-move snapshot synchronously, applies it in one
 * `setBoard` call, and only then issues the async `moveCard` write — so a
 * remote realtime patch arriving mid-flight can't interleave inside a
 * setState updater.
 */
export function useBoardDragDrop({
  tenantId,
  board,
  setBoard,
  refetch,
  broadcast,
  onMovedAcross,
}: UseBoardDragDropArgs) {
  // Separate sensors for mouse and touch. PointerSensor doesn't reliably
  // distinguish "I'm trying to drag" from "I'm trying to scroll vertically
  // through a list of cards" on touch devices — every press starts a drag,
  // breaking touch-scroll. Using TouchSensor with a hold delay means a
  // quick swipe always scrolls, while a 200ms hold initiates the drag (the
  // standard mobile kanban affordance). MouseSensor keeps its small 4px
  // distance threshold for desktop responsiveness.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Captured at first drag-over so the drop handler knows the original
  // list even when the drop happens back in the same list at a new index.
  const dragOriginRef = useRef<{ cardId: string; fromListId: string } | null>(null)

  function findListByCardId(b: BoardWithLists, cardId: string): List | undefined {
    return b.lists.find((l) => l.cards.some((c) => c.id === cardId))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || !board) return
    const activeId = String(active.id)
    const overId = String(over.id)
    // Skip card-level logic for column drags
    if (activeId.startsWith('col:')) return
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

    // Column reorder
    if (activeId.startsWith('col:') && overId?.startsWith('col:')) {
      const fromColId = activeId.slice(4)
      const toColId = overId.slice(4)
      if (fromColId === toColId || !board) return
      const oldIndex = board.lists.findIndex((l) => l.id === fromColId)
      const newIndex = board.lists.findIndex((l) => l.id === toColId)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(board.lists, oldIndex, newIndex)
      setBoard({ ...board, lists: reordered })
      const prevPos = newIndex > 0 ? reordered[newIndex - 1].position : null
      const nextPos = newIndex < reordered.length - 1 ? reordered[newIndex + 1].position : null
      moveList(tenantId, board.id, fromColId, prevPos, nextPos)
        .then((position) => {
          setBoard((b) => {
            if (!b) return b
            return {
              ...b,
              lists: b.lists.map((l) => (l.id === fromColId ? { ...l, position } : l)),
            }
          })
          broadcast({ kind: 'list.moved' })
        })
        .catch(() => refetch().catch(() => {}))
      return
    }

    // Compute the final in-memory state synchronously: apply any same-list
    // reorder, then derive what to persist from the resulting snapshot.
    // Done this way (rather than two `setBoard` calls with an async write
    // nested inside one of them) because firing an async DB call from
    // inside a state-updater closure produces races: a remote realtime
    // patch can interleave between the updater and the .then() callback,
    // and `fromListId` captured at the start ends up reflecting a stale
    // view of the board. Compute → setState → persist in clear phases.
    if (!board) return
    let snapshot: BoardWithLists = board
    if (overId && !overId.startsWith('list:')) {
      const fromList = findListByCardId(snapshot, activeId)
      const overList = findListByCardId(snapshot, overId)
      if (fromList && overList && overList.id === fromList.id) {
        const oldIndex = fromList.cards.findIndex((c) => c.id === activeId)
        const newIndex = fromList.cards.findIndex((c) => c.id === overId)
        if (oldIndex !== newIndex) {
          snapshot = structuredClone(snapshot) as BoardWithLists
          const list = snapshot.lists.find((l) => l.id === fromList.id)!
          list.cards = arrayMove(list.cards, oldIndex, newIndex)
        }
      }
    }

    const listForActive = findListByCardId(snapshot, activeId)
    if (!listForActive) {
      // Active card vanished mid-drag (e.g. remote delete). Reconcile.
      setBoard(snapshot)
      refetch().catch(() => {})
      return
    }
    const idx = listForActive.cards.findIndex((c) => c.id === activeId)
    const prevPos = idx > 0 ? listForActive.cards[idx - 1].position : null
    const nextPos =
      idx < listForActive.cards.length - 1 ? listForActive.cards[idx + 1].position : null
    const fromListId = origin?.fromListId ?? listForActive.id
    const movedAcross = fromListId !== listForActive.id
    const neighboursUnchanged =
      !movedAcross && prevPos === null && nextPos === null && listForActive.cards.length === 1

    setBoard(snapshot)
    if (neighboursUnchanged) return

    const fromListTitle = snapshot.lists.find((l) => l.id === fromListId)?.title
    const toListTitle = listForActive.title
    const movedCardTitle = listForActive.cards.find((c) => c.id === activeId)?.title

    moveCard(tenantId, activeId, listForActive.id, prevPos, nextPos)
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
          toListId: listForActive.id,
          position,
        })
        if (movedAcross) onMovedAcross(activeId, movedCardTitle, fromListTitle, toListTitle)
      })
      .catch(() => {
        refetch().catch(() => {})
      })
  }

  return { sensors, handleDragOver, handleDragEnd }
}
