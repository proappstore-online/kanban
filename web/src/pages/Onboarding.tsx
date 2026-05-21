import { useState } from 'react'
import type { User } from '@proappstore/sdk'
import { app } from '../lib/app'
import { createWorkspace } from '../lib/db'
import type { Workspace } from '../types'

interface OnboardingProps {
  user: User
  onCreated: (ws: Workspace) => void
}

export function Onboarding({ user, onCreated }: OnboardingProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const ws = await createWorkspace(trimmed)
      onCreated(ws)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--glass-strong)] p-8 text-center shadow-[var(--shadow-soft)] backdrop-blur-xl">
        <h1 className="display-font text-2xl font-bold text-[var(--ink)]">
          Welcome, @{user.login}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Workspaces are how Kanban Pro groups your team. Create one to get started — you'll be
          able to invite teammates next.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          placeholder="e.g. Acme Marketing"
          aria-label="Workspace name"
          className="mt-6 w-full rounded-2xl border border-[var(--line)] bg-[var(--paper-deep)] px-4 py-3 text-center text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--line-strong)]"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || busy}
          className="mt-4 w-full rounded-2xl bg-[var(--ink)] py-3 text-sm font-semibold text-[var(--paper)] hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
        <button
          onClick={() => app.auth.signOut()}
          className="mt-4 text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
