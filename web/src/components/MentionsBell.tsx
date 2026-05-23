import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mention } from '../types'
import {
  countUnreadMentions,
  listMyMentions,
  markAllMentionsRead,
  markMentionRead,
} from '../lib/db'

interface MentionsBellProps {
  workspaceId: string
  /**
   * Called when the user clicks a mention. The bell only knows the card id +
   * board id; the parent route either navigates (different board) or opens
   * the card in place (same board).
   */
  onOpenCard: (cardId: string, boardId: string) => void
}

const POLL_INTERVAL_MS = 30_000

/**
 * Top-bar bell that surfaces @mentions across the current workspace.
 *
 * Polls every 30s for the unread count. Could be swapped for a workspace-
 * level room push later; v1 keeps it simple. Click opens a dropdown with
 * recent mentions; clicking a row marks-read and navigates to the card.
 */
export function MentionsBell({ workspaceId, onOpenCard }: MentionsBellProps) {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [mentions, setMentions] = useState<Mention[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await countUnreadMentions(workspaceId))
    } catch {
      /* swallow */
    }
  }, [workspaceId])

  useEffect(() => {
    refreshCount()
    const t = setInterval(refreshCount, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [refreshCount])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next) {
      setFetchError(false)
      try {
        const ms = await listMyMentions(workspaceId, 25)
        setMentions(ms)
      } catch {
        setMentions([])
        setFetchError(true)
      }
    }
  }

  async function clickMention(m: Mention) {
    if (!m.readAt) {
      await markMentionRead(workspaceId, m.id)
      setMentions((prev) => prev?.map((x) => (x.id === m.id ? { ...x, readAt: Date.now() } : x)) ?? null)
      setUnread((n) => Math.max(0, n - 1))
    }
    setOpen(false)
    onOpenCard(m.cardId, m.boardId)
  }

  async function markAll() {
    await markAllMentionsRead(workspaceId)
    setMentions((prev) => prev?.map((x) => ({ ...x, readAt: x.readAt ?? Date.now() })) ?? null)
    setUnread(0)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        title="Mentions"
        className={`relative rounded-full border px-3 py-1 text-xs ${
          open
            ? 'border-[var(--accent)] text-[var(--ink)]'
            : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span aria-hidden>@</span>
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--error)] px-1 text-[10px] font-semibold text-white"
            aria-label={`${unread} unread mentions`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Mentions
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[10px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Mark all read
              </button>
            )}
          </div>
          {mentions === null ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--muted)]">Loading…</div>
          ) : fetchError ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--muted)]">
              Couldn't load mentions. Try again.
            </div>
          ) : mentions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--muted)]">
              No one's mentioned you yet.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {mentions.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => clickMention(m)}
                    className={`flex w-full items-start gap-2 border-b border-[var(--line)] px-4 py-3 text-left text-sm hover:bg-[var(--paper-deep)] ${
                      m.readAt ? 'opacity-60' : ''
                    }`}
                  >
                    <Avatar name={m.actorDisplayName} url={m.actorAvatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs">
                        <span className="font-semibold text-[var(--ink)]">
                          {m.actorDisplayName}
                        </span>
                        <span className="text-[var(--muted)]"> mentioned you on </span>
                        <span className="font-semibold text-[var(--ink)]">{m.cardTitle}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-[var(--muted)]">
                        {m.commentBody}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                    {!m.readAt && (
                      <span
                        className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                        aria-label="unread"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return <img src={url} alt={name} className="size-7 shrink-0 rounded-full object-cover" />
  }
  const initial = name[0]?.toUpperCase() ?? '?'
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent-deep)]">
      {initial}
    </span>
  )
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
