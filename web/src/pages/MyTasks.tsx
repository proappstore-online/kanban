import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { AssignedTask, ListKind, WorkspaceWithRole } from '../types'
import { STATUS_KINDS, STATUS_LABEL } from '../types'
import { getStatusListId, listMyTasks, logActivity, moveCard } from '../lib/db'
import { fireBoardPatch } from '../lib/realtime'
import { TopBar } from '../components/TopBar'

interface MyTasksProps {
  user: User
  workspace: WorkspaceWithRole
  onBack: () => void
  onOpenBoard: (boardId: string) => void
}

const STATUS_FILTERS: { value: ListKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: STATUS_LABEL.new },
  { value: 'wip', label: STATUS_LABEL.wip },
  { value: 'testing', label: STATUS_LABEL.testing },
  { value: 'launched', label: STATUS_LABEL.launched },
]

export function MyTasks({ user, workspace, onBack, onOpenBoard }: MyTasksProps) {
  const [tasks, setTasks] = useState<AssignedTask[] | null>(null)
  const [filter, setFilter] = useState<ListKind | 'all'>('all')

  // Track in-flight moves keyed by cardId so a double-click on the status
  // dropdown can't fire two concurrent moveCard requests for the same
  // card. Using a ref so the guard takes effect synchronously without
  // waiting for a state re-render between clicks.
  const movingCardsRef = useRef<Set<string>>(new Set())

  const refetch = useCallback(() => {
    listMyTasks(workspace.id)
      .then(setTasks)
      .catch(() => setTasks([]))
  }, [workspace.id])

  useEffect(() => {
    refetch()
  }, [refetch])

  /**
   * Quick-status from a My Tasks row: find the matching list on that card's
   * board, move the card to the end of it, refetch. Also fire a one-shot
   * `card.moved` patch into the board's room so peers viewing that board
   * see the move in realtime — same as a drag-drop would — and write an
   * activity row so the board's activity feed picks it up. Cross-board
   * status change without leaving the inbox-style view.
   */
  async function handleChangeStatus(task: AssignedTask, targetKind: ListKind) {
    if (targetKind === task.listKind) return
    if (movingCardsRef.current.has(task.cardId)) return
    movingCardsRef.current.add(task.cardId)
    try {
      const targetListId = await getStatusListId(workspace.id, task.boardId, targetKind)
      if (!targetListId) return
      const position = await moveCard(workspace.id, task.cardId, targetListId, null, null)
      fireBoardPatch(task.boardId, {
        kind: 'card.moved',
        cardId: task.cardId,
        fromListId: task.listId,
        toListId: targetListId,
        position,
      })
      logActivity(
        workspace.id,
        task.boardId,
        'card.moved',
        {
          title: task.cardTitle,
          from: task.listTitle,
          to: STATUS_LABEL[targetKind],
        },
        task.cardId,
      ).catch(() => {})
      fireBoardPatch(task.boardId, { kind: 'activity.added' })
      refetch()
    } finally {
      movingCardsRef.current.delete(task.cardId)
    }
  }

  /**
   * Group filtered tasks by epic (=board). Each group also remembers the
   * feature label so the user can see which product line a task belongs to.
   * Status filter narrows the rows; an "all-filter, all-status" view shows
   * everything assigned to me across the workspace.
   */
  const groups = useMemo(() => {
    if (!tasks) return null
    const filtered =
      filter === 'all' ? tasks : tasks.filter((t) => t.listKind === filter)
    const byBoard = new Map<string, AssignedTask[]>()
    for (const t of filtered) {
      const arr = byBoard.get(t.boardId) ?? []
      arr.push(t)
      byBoard.set(t.boardId, arr)
    }
    return Array.from(byBoard.entries()).map(([boardId, items]) => ({
      boardId,
      boardName: items[0].boardName,
      featureId: items[0].featureId,
      featureName: items[0].featureName,
      items,
    }))
  }, [tasks, filter])

  return (
    <div className="min-h-[100dvh]">
      <TopBar
        user={user}
        left={
          <button
            onClick={onBack}
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ← Boards
          </button>
        }
        center={<>My tasks — {workspace.name}</>}
      />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="display-font text-2xl font-bold text-[var(--ink)]">
            Assigned to me
          </h1>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === f.value
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'border border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {tasks === null ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center text-sm text-[var(--muted)]">
            Nothing assigned to you yet. When a teammate (or you) adds you as an assignee
            on a card, it'll show up here grouped by epic.
          </p>
        ) : groups && groups.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center text-sm text-[var(--muted)]">
            No tasks in this status.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {groups?.map((g) => (
              <section key={g.boardId}>
                <div className="flex items-center justify-between">
                  <div>
                    {g.featureName && (
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                        {g.featureName}
                      </div>
                    )}
                    <h2 className="text-sm font-semibold text-[var(--ink)]">
                      {g.boardName}
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        ({g.items.length})
                      </span>
                    </h2>
                  </div>
                  <button
                    onClick={() => onOpenBoard(g.boardId)}
                    className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Open board →
                  </button>
                </div>
                <ul className="mt-3 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
                  {g.items.map((t) => (
                    <li
                      key={t.cardId}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--paper-deep)]"
                    >
                      <StatusBadge
                        kind={t.listKind}
                        onChange={(k) => handleChangeStatus(t, k)}
                      />
                      <button
                        onClick={() => onOpenBoard(t.boardId)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[var(--ink)]">
                            {t.cardTitle}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                            {t.listTitle}
                          </div>
                        </div>
                        <DateBadges dueAt={t.dueAt} etaAt={t.etaAt} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

/**
 * Status indicator that doubles as a quick-change picker. Renders as a
 * colored dot for compactness; clicking opens a small menu of the four
 * workflow stages. Picking one moves the card on its origin board to the
 * matching list. Rows with `kind: 'other'` get a neutral dot but no
 * picker (we don't know where to put the card without a kind mapping).
 */
function StatusBadge({
  kind,
  onChange,
}: {
  kind: ListKind
  onChange: (next: ListKind) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const dotColor = statusDotColor(kind)
  if (kind === 'other') {
    return (
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: dotColor }}
        title={STATUS_LABEL[kind]}
      />
    )
  }

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex size-5 items-center justify-center rounded-full hover:bg-[var(--paper-deep)]"
        title={`${STATUS_LABEL[kind]} — click to change`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className="size-2 rounded-full"
          style={{ background: dotColor }}
        />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-[8rem] rounded-xl border border-[var(--line)] bg-[var(--paper)] py-1 shadow-[var(--shadow-soft)]"
        >
          {STATUS_KINDS.map((k) => {
            const active = k === kind
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    if (!active) onChange(k)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--paper-deep)] ${
                    active ? 'font-semibold' : ''
                  }`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: statusDotColor(k) }}
                  />
                  <span className="flex-1 text-[var(--ink)]">{STATUS_LABEL[k]}</span>
                  {active && (
                    <span aria-hidden className="text-[var(--muted)]">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </span>
  )
}

function statusDotColor(kind: ListKind): string {
  switch (kind) {
    case 'new':
      return 'var(--muted)'
    case 'wip':
      return 'var(--sky-deep)'
    case 'testing':
      return 'var(--warning)'
    case 'launched':
      return 'var(--mint-deep)'
    default:
      return 'var(--muted)'
  }
}

function DateBadges({ dueAt, etaAt }: { dueAt?: number; etaAt?: number }) {
  if (dueAt === undefined && etaAt === undefined) return null
  const atRisk = dueAt !== undefined && etaAt !== undefined && etaAt > dueAt
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {dueAt !== undefined && (
        <span
          className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
          title={`Due ${new Date(dueAt).toLocaleString()}`}
        >
          Due {fmt(dueAt)}
        </span>
      )}
      {etaAt !== undefined && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px]"
          style={
            atRisk
              ? { background: 'var(--error)', color: '#fff' }
              : { border: '1px solid var(--line)', color: 'var(--muted)' }
          }
          title={atRisk ? `ETA ${new Date(etaAt).toLocaleString()} — past deadline` : `ETA ${new Date(etaAt).toLocaleString()}`}
        >
          ETA {fmt(etaAt)}
        </span>
      )}
    </div>
  )
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
