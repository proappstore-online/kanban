import { useEffect } from 'react'
import type { ActivityEntry } from '../types'

interface ActivityPanelProps {
  entries: ActivityEntry[]
  onClose: () => void
  onOpenCard: (cardId: string) => void
}

/**
 * Right-side drawer showing recent board activity. Reads from the
 * `activity` table; mutation sites log via `logActivity` in lib/db. We
 * keep this lightweight — last 50 events, server-formatted lines.
 */
export function ActivityPanel({ entries, onClose, onOpenCard }: ActivityPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,24rem)] flex-col border-l border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)] sm:w-96"
      aria-label="Activity feed"
    >
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Activity
        </h2>
        <button
          onClick={onClose}
          className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Close
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
            No activity yet on this board.
          </p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-2 border-b border-[var(--line)] px-4 py-3"
              >
                <Avatar name={e.actorDisplayName} url={e.actorAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--ink)]">
                    <span className="font-semibold">{e.actorDisplayName}</span>{' '}
                    {summarize(e)}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {formatTime(e.createdAt)}
                  </p>
                </div>
                {e.cardId && (
                  <button
                    type="button"
                    onClick={() => onOpenCard(e.cardId!)}
                    className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Open
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

/**
 * Human-readable summary line for one activity row. Each `kind` consumes the
 * payload keys it cares about; missing keys fall back to "a card" / "a list".
 */
function summarize(e: ActivityEntry): string {
  const p = e.payload
  const cardTitle = (p.title ?? p.cardTitle ?? 'a card') as string
  const listTitle = (p.listTitle ?? p.title ?? 'a list') as string
  switch (e.kind) {
    case 'card.created':
      return `added card "${cardTitle}" to ${(p.listTitle ?? 'a list') as string}`
    case 'card.moved':
      return `moved "${cardTitle}" from ${(p.from ?? '?') as string} to ${(p.to ?? '?') as string}`
    case 'card.updated': {
      const fields = (p.changed as string[] | undefined) ?? []
      const what = fields.length > 0 ? fields.join(', ') : 'card'
      return `updated ${what} on "${cardTitle}"`
    }
    case 'card.deleted':
      return `deleted card "${cardTitle}"`
    case 'card.assigned':
      return `assigned ${(p.member ?? 'someone') as string} to "${cardTitle}"`
    case 'card.unassigned':
      return `unassigned ${(p.member ?? 'someone') as string} from "${cardTitle}"`
    case 'comment.added':
      return `commented on "${cardTitle}"${
        (p.mentioned as number | undefined) ? ` (@-mentioned ${p.mentioned})` : ''
      }`
    case 'list.created':
      return `added list "${listTitle}"`
    case 'list.renamed':
      return `renamed a list to "${(p.title ?? '') as string}"`
    case 'list.deleted':
      return `deleted list "${(p.title ?? 'a list') as string}"`
    case 'board.renamed':
      return `renamed the board to "${(p.to ?? '') as string}"`
    case 'member.joined':
      return 'joined the workspace'
    default:
      return `did ${e.kind}`
  }
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
