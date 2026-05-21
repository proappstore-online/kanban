import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { BoardSummary, WorkspaceWithRole } from '../types'
import { createBoard, deleteBoard, listBoards } from '../lib/db'
import { TopBar } from '../components/TopBar'

interface BoardsProps {
  user: User
  workspace: WorkspaceWithRole
  onOpen: (id: string) => void
  onSettings: () => void
  onSwitch: () => void
}

export function Boards({ user, workspace, onOpen, onSettings, onSwitch }: BoardsProps) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listBoards(workspace.id)
      .then(setBoards)
      .catch(() => setBoards([]))
  }, [workspace.id])

  async function handleCreate() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const board = await createBoard(workspace.id, name)
      setNewName('')
      setCreating(false)
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
          <button
            onClick={onSettings}
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Settings
          </button>
        }
      />
      <main className="mx-auto max-w-[1540px] px-4 py-8 sm:px-6">
        <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Boards</h1>

        {boards === null ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(b.id, b.name)
                  }}
                  className="absolute right-2 top-2 rounded-full bg-[var(--paper)] px-2 py-0.5 text-xs text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--error)]"
                  aria-label={`Delete ${b.name}`}
                >
                  Delete
                </button>
              </div>
            ))}

            {creating ? (
              <div className="flex h-32 flex-col rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--glass)] p-4">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') {
                      setCreating(false)
                      setNewName('')
                    }
                  }}
                  placeholder="Board name"
                  className="bg-transparent text-base font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                />
                <div className="mt-auto flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || busy}
                    className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)] disabled:opacity-40"
                  >
                    {busy ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setCreating(false)
                      setNewName('')
                    }}
                    className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--line-strong)] text-sm font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
              >
                + New board
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
