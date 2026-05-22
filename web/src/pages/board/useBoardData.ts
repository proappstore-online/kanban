import { useCallback, useEffect, useState } from 'react'
import type { ActivityEntry, BoardWithLists, Comment, Member } from '../../types'
import {
  getBoardFull,
  listBoardActivity,
  listComments,
  listMembers,
} from '../../lib/db'
import { app } from '../../lib/app'
import { useBoardRoom, type BoardPatch } from '../../lib/realtime'

interface UseBoardDataResult {
  /** `undefined` = still loading, `null` = not found / no access. */
  board: BoardWithLists | null | undefined
  setBoard: React.Dispatch<React.SetStateAction<BoardWithLists | null | undefined>>
  members: Member[]
  /** Comments for the currently-open card (empty when none). */
  openCardComments: Comment[]
  setOpenCardComments: React.Dispatch<React.SetStateAction<Comment[]>>
  /** Last 50 activity rows for this board. Populated when the drawer opens. */
  activity: ActivityEntry[]
  showActivity: boolean
  setShowActivity: React.Dispatch<React.SetStateAction<boolean>>
  refetchActivity: () => Promise<void>
  /** Connected peers in the per-board room (presence avatars). */
  peers: ReturnType<typeof useBoardRoom>['peers']
  /** Send a patch to the room. */
  broadcast: ReturnType<typeof useBoardRoom>['broadcast']
  /** Full board re-read. Called after a failed write or non-trivial patch. */
  refetch: () => Promise<void>
}

/**
 * Owns all board-page server state: the board itself, the workspace
 * members, the open card's comment thread, the activity drawer's rows,
 * and the realtime room. Keeps Board.tsx focused on rendering + mutation
 * handlers.
 *
 * Pass `openCardId` so the hook knows which card's comments to track. A
 * remote `card.comment-added` / `card.comment-deleted` patch that matches
 * the open card triggers a comments refetch; otherwise the whole board is
 * re-read to update card-level state (comment counts, assignees, etc.).
 */
export function useBoardData(
  tenantId: string,
  boardId: string,
  openCardId: string | null,
): UseBoardDataResult {
  const [board, setBoard] = useState<BoardWithLists | null | undefined>(undefined)
  const [members, setMembers] = useState<Member[]>([])
  const [openCardComments, setOpenCardComments] = useState<Comment[]>([])
  const [showActivity, setShowActivity] = useState(false)
  const [activity, setActivity] = useState<ActivityEntry[]>([])

  const refetch = useCallback(async () => {
    const next = await getBoardFull(tenantId, boardId)
    setBoard(next)
  }, [tenantId, boardId])

  // Initial load + members.
  useEffect(() => {
    let cancelled = false
    Promise.all([getBoardFull(tenantId, boardId), listMembers(tenantId)])
      .then(([b, m]) => {
        if (cancelled) return
        setBoard(b)
        setMembers(m)
      })
      .catch(() => {
        if (!cancelled && app.auth.user) setBoard(null)
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, boardId])

  // Load comments when a card opens. Refetched on demand when realtime
  // patches indicate a remote comment change for the same card.
  useEffect(() => {
    if (!openCardId) {
      setOpenCardComments([])
      return
    }
    let cancelled = false
    listComments(tenantId, openCardId)
      .then((cs) => {
        if (!cancelled) setOpenCardComments(cs)
      })
      .catch(() => {
        if (!cancelled) setOpenCardComments([])
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, openCardId])

  // Activity feed: fetched when the drawer opens, refreshed when an
  // `activity.added` patch arrives.
  const refetchActivity = useCallback(async () => {
    const a = await listBoardActivity(tenantId, boardId, 50)
    setActivity(a)
  }, [tenantId, boardId])

  useEffect(() => {
    if (!showActivity) return
    refetchActivity().catch(() => {})
  }, [showActivity, refetchActivity])

  // Realtime: apply incoming patches by either patching local state directly
  // for trivial cases (board / list renames) or refetching the whole board
  // for anything structural. v1 trade: simpler + always correct. The
  // surgical patches can land later if/when board sizes make the full
  // re-read measurable.
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
              lists: b.lists.map((l) =>
                l.id === patch.listId ? { ...l, title: patch.title } : l,
              ),
            }
          })
          return
        case 'card.comment-added':
        case 'card.comment-deleted':
          // Refetch the open card's comments if it matches, and always
          // refetch the board for comment count updates on card previews.
          // But skip the full refetch if the comment is for the open card
          // and no other state is affected — the comment list handles it.
          if (openCardId === patch.cardId) {
            listComments(tenantId, patch.cardId)
              .then(setOpenCardComments)
              .catch(() => {})
          }
          // Update comment counts on card previews
          setBoard((b) => {
            if (!b) return b
            const delta = patch.kind === 'card.comment-added' ? 1 : -1
            return {
              ...b,
              lists: b.lists.map((l) => ({
                ...l,
                cards: l.cards.map((c) =>
                  c.id === patch.cardId
                    ? { ...c, commentCount: Math.max(0, c.commentCount + delta) }
                    : c,
                ),
              })),
            }
          })
          return
        case 'activity.added':
          if (showActivity) refetchActivity().catch(() => {})
          return
        default:
          refetch().catch(() => {})
      }
    },
    [refetch, refetchActivity, openCardId, showActivity, tenantId],
  )

  const { peers, broadcast } = useBoardRoom(boardId, handlePatch)

  return {
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
  }
}
