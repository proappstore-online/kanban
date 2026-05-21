import { useEffect, useRef, useState } from 'react'
import type { Room, RoomMessage, RoomPeer } from '@proappstore/sdk'
import { app } from './app'

/**
 * Room patch broadcast.
 *
 * D1 is the source of truth — every editor writes there. The board room is
 * used only to fan out tiny diff events so connected peers can apply them
 * locally without re-fetching the whole board. Apply optimistically; if
 * something looks inconsistent (e.g. a `card.moved` for an unknown listId),
 * fall back to a full board refetch.
 */
export type BoardPatch =
  | { kind: 'card.created'; listId: string; cardId: string }
  | { kind: 'card.moved'; cardId: string; fromListId: string; toListId: string; position: number }
  | { kind: 'card.updated'; cardId: string }
  | { kind: 'card.deleted'; cardId: string; listId: string }
  | { kind: 'card.assignees-changed'; cardId: string }
  | { kind: 'card.checklist-changed'; cardId: string }
  | { kind: 'card.labels-changed'; cardId: string }
  | { kind: 'card.comment-added'; cardId: string }
  | { kind: 'card.comment-deleted'; cardId: string }
  | { kind: 'list.created'; listId: string }
  | { kind: 'list.renamed'; listId: string; title: string }
  | { kind: 'list.deleted'; listId: string }
  | { kind: 'board.renamed'; name: string }
  | { kind: 'activity.added' }

const ROOM_PREFIX = 'board:'

function roomId(boardId: string): string {
  return ROOM_PREFIX + boardId
}

/**
 * Subscribe to a board's realtime room. Returns:
 * - `peers`     — live list of connected viewers (one entry per browser tab)
 * - `broadcast` — fire-and-forget patch fan-out (use AFTER the D1 write succeeds)
 *
 * `onPatch` is called for every patch received from OTHER peers (the SDK
 * already echoes our own messages back; we filter those out by uid).
 */
export function useBoardRoom(
  boardId: string | null,
  onPatch: (patch: BoardPatch, from: RoomPeer) => void,
): { peers: RoomPeer[]; broadcast: (patch: BoardPatch) => void } {
  const [peers, setPeers] = useState<RoomPeer[]>([])
  const roomRef = useRef<Room | null>(null)
  const onPatchRef = useRef(onPatch)
  useEffect(() => {
    onPatchRef.current = onPatch
  }, [onPatch])

  useEffect(() => {
    if (!boardId) return
    const room = app.rooms.join(roomId(boardId))
    roomRef.current = room

    const offMsg = room.onMessage<BoardPatch>((msg: RoomMessage<BoardPatch>) => {
      const me = app.auth.user?.id
      if (!me || msg.from.uid === me) return
      if (!msg.data || typeof msg.data !== 'object') return
      onPatchRef.current(msg.data, msg.from)
    })
    const offPeers = room.onPeers((p) => setPeers(p))

    return () => {
      offMsg()
      offPeers()
      room.close()
      roomRef.current = null
    }
  }, [boardId])

  function broadcast(patch: BoardPatch) {
    roomRef.current?.send(patch)
  }

  return { peers, broadcast }
}
