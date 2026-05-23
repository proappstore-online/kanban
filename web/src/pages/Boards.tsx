import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { BoardSummary, Feature, WorkspaceWithRole } from '../types'
import {
  createBoard,
  createInvite,
  deleteBoard,
  listBoards,
  listFeatures,
  listStarredBoardIds,
  setBoardFeature,
  starBoard,
  unstarBoard,
} from '../lib/db'
import { app } from '../lib/app'
import { toast } from '../lib/toast'
import { TopBar } from '../components/TopBar'

interface BoardsProps {
  user: User
  workspace: WorkspaceWithRole
  onOpen: (id: string) => void
  onSwitch: () => void
  onMyTasks: () => void
}

export function Boards({
  user,
  workspace,
  onOpen,
  onSwitch,
  onMyTasks,
}: BoardsProps) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [starred, setStarred] = useState<Set<string>>(new Set())
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)

  const canManage = workspace.role === 'owner' || workspace.role === 'admin'

  async function handleInvite() {
    if (inviteBusy) return
    setInviteBusy(true)
    try {
      const inv = await createInvite(workspace.id, 'member')
      const url = `${location.origin}/#/invite/${inv.code}`
      await navigator.clipboard?.writeText(url)
      toast.success('Invite link copied!')
    } finally {
      setInviteBusy(false)
    }
  }

  useEffect(() => {
    Promise.all([listBoards(workspace.id), listFeatures(workspace.id), listStarredBoardIds(workspace.id)])
      .then(([bs, fs, st]) => {
        setBoards(bs)
        setFeatures(fs)
        setStarred(st)
      })
      .catch(() => {
        if (app.auth.user) {
          setBoards([])
          setFeatures([])
        }
      })
  }, [workspace.id])

  /**
   * `creatingIn` is the feature bucket where the new board will live.
   * `null` means Ungrouped; `undefined` means the composer is closed.
   */
  async function handleCreate() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const board = await createBoard(workspace.id, name, creatingIn ?? undefined)
      setNewName('')
      setCreatingIn(undefined)
      onOpen(board.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return
    await deleteBoard(workspace.id, id)
    setBoards((prev) => prev?.filter((b) => b.id !== id) ?? null)
  }

  async function handleToggleStar(boardId: string) {
    const isStarred = starred.has(boardId)
    const next = new Set(starred)
    if (isStarred) { next.delete(boardId); unstarBoard(workspace.id, boardId) }
    else { next.add(boardId); starBoard(workspace.id, boardId) }
    setStarred(next)
  }

  async function handleMoveToFeature(boardId: string, featureId: string | null) {
    await setBoardFeature(workspace.id, boardId, featureId)
    setBoards((prev) =>
      prev?.map((b) =>
        b.id === boardId ? { ...b, featureId: featureId ?? undefined } : b,
      ) ?? null,
    )
  }

  // Group boards by feature. Ungrouped boards live under a synthetic
  // null-keyed bucket rendered last.
  const grouped = (() => {
    if (!boards) return null
    const map = new Map<string | null, BoardSummary[]>()
    for (const f of features) map.set(f.id, [])
    map.set(null, [])
    for (const b of boards) {
      const key = b.featureId ?? null
      const bucket = map.get(key) ?? map.get(null)!
      bucket.push(b)
    }
    // Sort starred boards to the top within each group
    for (const bucket of map.values()) {
      bucket.sort((a, b) => (starred.has(b.id) ? 1 : 0) - (starred.has(a.id) ? 1 : 0))
    }
    return map
  })()

  return (
    <div className="min-h-[100dvh]">
      <TopBar
        user={user}
        left={
          <button
            onClick={onSwitch}
            aria-label="Back to workspaces"
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] sm:px-3"
          >
            <span className="sm:hidden">←</span>
            <span className="hidden sm:inline">← Workspaces</span>
          </button>
        }
        center={<>{workspace.name}</>}
        settingsHref={`#/w/${workspace.slug}/settings`}
        right={
          <>
            {canManage && (
              <button
                onClick={handleInvite}
                disabled={inviteBusy}
                aria-label="Invite"
                className="flex items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-deep)] hover:opacity-80 disabled:opacity-40 sm:px-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 sm:hidden"><path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.058.468.172.92.57 1.175A9.953 9.953 0 0 0 8 18a9.953 9.953 0 0 0 5.384-1.572.898.898 0 0 0 .57-1.175 6.001 6.001 0 0 0-11.908 0ZM16.75 5.75a.75.75 0 0 0-1.5 0v2h-2a.75.75 0 0 0 0 1.5h2v2a.75.75 0 0 0 1.5 0v-2h2a.75.75 0 0 0 0-1.5h-2v-2Z" /></svg>
                <span className="hidden sm:inline">{inviteBusy ? 'Creating…' : 'Invite'}</span>
              </button>
            )}
            <button
              onClick={onMyTasks}
              aria-label="My tasks"
              className="flex items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] sm:px-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4 sm:hidden"><path fillRule="evenodd" d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.99a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM1.99 15.24a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1v-.01ZM1.99 10a1 1 0 0 1 1-1H3a1 1 0 0 1 1 1v.01a1 1 0 0 1-1 1h-.01a1 1 0 0 1-1-1V10Z" clipRule="evenodd" /></svg>
              <span className="hidden sm:inline">My tasks</span>
            </button>
          </>
        }
      />
      <main className="mx-auto max-w-[1540px] px-2 py-4 sm:px-6 sm:py-8">
        <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Boards</h1>

        {grouped === null ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="mt-6 space-y-10">
            {[...features, null as Feature | null].map((f) => {
              const key = f?.id ?? null
              const bucket = grouped.get(key) ?? []
              // Skip empty Ungrouped section unless there are no features
              // configured yet (then it's the only section).
              if (
                key === null &&
                bucket.length === 0 &&
                features.length > 0 &&
                creatingIn !== null
              ) {
                return null
              }
              return (
                <FeatureSection
                  key={key ?? '__ungrouped'}
                  title={f?.name ?? 'Ungrouped'}
                  boards={bucket}
                  features={features}
                  isCreating={creatingIn === key}
                  newName={newName}
                  busy={busy}
                  onStartCreate={() => {
                    setCreatingIn(key)
                    setNewName('')
                  }}
                  onCommitCreate={handleCreate}
                  onCancelCreate={() => {
                    setCreatingIn(undefined)
                    setNewName('')
                  }}
                  setNewName={setNewName}
                  onOpen={onOpen}
                  onDelete={handleDelete}
                  onMoveToFeature={handleMoveToFeature}
                  starred={starred}
                  onToggleStar={handleToggleStar}
                />
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

interface FeatureSectionProps {
  title: string
  boards: BoardSummary[]
  features: Feature[]
  isCreating: boolean
  newName: string
  busy: boolean
  onStartCreate: () => void
  onCommitCreate: () => void
  onCancelCreate: () => void
  setNewName: (v: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string, name: string) => void
  onMoveToFeature: (boardId: string, featureId: string | null) => void
  starred: Set<string>
  onToggleStar: (boardId: string) => void
}

function FeatureSection({
  title,
  boards,
  features,
  isCreating,
  newName,
  busy,
  onStartCreate,
  onCommitCreate,
  onCancelCreate,
  setNewName,
  onOpen,
  onDelete,
  onMoveToFeature,
  starred,
  onToggleStar,
}: FeatureSectionProps) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {boards.map((b) => (
          <div
            key={b.id}
            className="group relative flex h-32 cursor-pointer flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--card-gradient)] p-4 shadow-[var(--shadow-card)] hover:border-[var(--line-strong)]"
            onClick={() => onOpen(b.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-[var(--ink)]">{b.name}</div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStar(b.id) }}
                className="shrink-0 text-base"
                aria-label={starred.has(b.id) ? 'Unstar board' : 'Star board'}
                title={starred.has(b.id) ? 'Unstar' : 'Star'}
              >
                {starred.has(b.id) ? '★' : '☆'}
              </button>
            </div>
            <div className="text-xs text-[var(--muted)]">
              Updated {new Date(b.updatedAt).toLocaleDateString()}
            </div>
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100">
              <select
                value={b.featureId ?? ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  onMoveToFeature(b.id, e.target.value || null)
                }}
                className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                title="Move to feature"
              >
                <option value="">Ungrouped</option>
                {features.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(b.id, b.name)
                }}
                className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--error)]"
                aria-label={`Delete ${b.name}`}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {isCreating ? (
          <div className="flex h-32 flex-col rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--glass)] p-4">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitCreate()
                if (e.key === 'Escape') onCancelCreate()
              }}
              placeholder="Board name"
              aria-label="New board name"
              className="bg-transparent text-base font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
            />
            <div className="mt-auto flex gap-2">
              <button
                onClick={onCommitCreate}
                disabled={!newName.trim() || busy}
                className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)] disabled:opacity-40"
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={onCancelCreate}
                className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onStartCreate}
            className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--line-strong)] text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          >
            + New board
          </button>
        )}
      </div>
    </section>
  )
}
