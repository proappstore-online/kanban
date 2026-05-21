import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { BoardSummary, Feature, WorkspaceWithRole } from '../types'
import {
  createBoard,
  deleteBoard,
  listBoards,
  listFeatures,
  setBoardFeature,
} from '../lib/db'
import { TopBar } from '../components/TopBar'

interface BoardsProps {
  user: User
  workspace: WorkspaceWithRole
  onOpen: (id: string) => void
  onSettings: () => void
  onSwitch: () => void
  onMyTasks: () => void
}

export function Boards({
  user,
  workspace,
  onOpen,
  onSettings,
  onSwitch,
  onMyTasks,
}: BoardsProps) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [features, setFeatures] = useState<Feature[]>([])
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([listBoards(workspace.id), listFeatures(workspace.id)])
      .then(([bs, fs]) => {
        setBoards(bs)
        setFeatures(fs)
      })
      .catch(() => {
        setBoards([])
        setFeatures([])
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
    return map
  })()

  return (
    <div className="min-h-[100dvh]">
      <TopBar
        user={user}
        left={
          <button
            onClick={onSwitch}
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ← Workspaces
          </button>
        }
        center={<>{workspace.name}</>}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={onMyTasks}
              className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              My tasks
            </button>
            <button
              onClick={onSettings}
              className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Settings
            </button>
          </div>
        }
      />
      <main className="mx-auto max-w-[1540px] px-4 py-8 sm:px-6">
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
            <div className="font-semibold text-[var(--ink)]">{b.name}</div>
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
