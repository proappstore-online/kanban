import { useEffect, useState } from 'react'
import type { ArchivedCardSummary } from '../lib/db'

interface ArchivedPanelProps {
  cards: ArchivedCardSummary[] | null
  onClose: () => void
  onRestore: (cardId: string) => Promise<void> | void
  onDeleteForever: (cardId: string) => Promise<void> | void
}

/**
 * Right-side drawer listing archived cards on the board. Mirrors the
 * ActivityPanel layout — same width, same Escape-to-close handling, same
 * inset positioning. Each row gets Restore (un-archive) and Delete
 * forever (hard delete). Drawer state is owned by the parent so opening
 * it triggers the data fetch on the page side.
 */
export function ArchivedPanel({
  cards,
  onClose,
  onRestore,
  onDeleteForever,
}: ArchivedPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function withBusy(id: string, fn: () => Promise<void> | void) {
    setBusyId(id)
    try {
      await fn()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,24rem)] flex-col border-l border-[var(--line)] bg-[var(--paper)] shadow-[var(--shadow-soft)] sm:w-96"
      aria-label="Archived cards"
    >
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Archived
        </h2>
        <button
          onClick={onClose}
          className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Close
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        {cards === null ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
            Nothing archived. Archived cards stay reversible — they disappear from the
            board but their comments and history are preserved.
          </p>
        ) : (
          <ul>
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 border-b border-[var(--line)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--ink)]">
                    {c.title}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    was in {c.listTitle} · archived {formatTime(c.archivedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => withBusy(c.id, () => onRestore(c.id))}
                    disabled={busyId === c.id}
                    className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)] disabled:opacity-40"
                  >
                    {busyId === c.id ? '…' : 'Restore'}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Permanently delete "${c.title}"? Comments and history are also removed. Cannot be undone.`,
                        )
                      )
                        withBusy(c.id, () => onDeleteForever(c.id))
                    }}
                    disabled={busyId === c.id}
                    className="rounded-full px-3 py-1 text-xs text-[var(--error)] hover:bg-[var(--error)]/10 disabled:opacity-40"
                  >
                    Delete forever
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
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
