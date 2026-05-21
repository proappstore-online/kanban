import { useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { Workspace, WorkspaceWithRole } from '../types'
import { createWorkspace } from '../lib/db'
import { TopBar } from '../components/TopBar'

interface WorkspacesProps {
  user: User
  workspaces: WorkspaceWithRole[]
  onOpen: (id: string) => void
  onCreated: (ws: Workspace) => void
}

export function Workspaces({ user, workspaces, onOpen, onCreated }: WorkspacesProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const ws = await createWorkspace(name)
      setNewName('')
      setCreating(false)
      onCreated(ws)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh]">
      <TopBar user={user} />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Your workspaces</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick a workspace to open its boards, or create a new one for another team.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => onOpen(ws.id)}
              className="flex h-32 flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--card-gradient)] p-4 text-left shadow-[var(--shadow-card)] hover:border-[var(--line-strong)]"
            >
              <div className="font-semibold text-[var(--ink)]">{ws.name}</div>
              <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                {ws.role}
              </div>
            </button>
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
                placeholder="Workspace name"
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
              + New workspace
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
