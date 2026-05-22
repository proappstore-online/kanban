import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { Member, WorkspaceWithRole } from '../types'
import { listMembers, updateMyDisplayName } from '../lib/db'
import { app } from '../lib/app'
import { TopBar } from '../components/TopBar'

interface ProfileProps {
  user: User
  workspaces: WorkspaceWithRole[]
}

export function Profile({ user, workspaces }: ProfileProps) {
  const [memberships, setMemberships] = useState<Map<string, Member> | null>(null)
  const [editingWs, setEditingWs] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all(
      workspaces.map((ws) =>
        listMembers(ws.id).then((members) => {
          const me = members.find((m) => m.userId === user.id)
          return [ws.id, me] as const
        }),
      ),
    ).then((results) => {
      if (cancelled) return
      const map = new Map<string, Member>()
      for (const [wsId, member] of results) {
        if (member) map.set(wsId, member)
      }
      setMemberships(map)
    })
    return () => { cancelled = true }
  }, [user.id, workspaces])

  async function handleSaveName(wsId: string) {
    const trimmed = editName.trim()
    if (!trimmed) {
      setEditingWs(null)
      return
    }
    await updateMyDisplayName(wsId, trimmed)
    setMemberships((prev) => {
      if (!prev) return prev
      const next = new Map(prev)
      const m = next.get(wsId)
      if (m) next.set(wsId, { ...m, displayName: trimmed })
      return next
    })
    setEditingWs(null)
  }

  return (
    <div className="min-h-[100dvh]">
      <TopBar
        user={user}
        left={
          <button
            onClick={() => history.back()}
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ← Back
          </button>
        }
        center={<>Profile</>}
      />
      <main className="mx-auto max-w-[600px] px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.login}
              className="size-20 rounded-full object-cover ring-2 ring-[var(--line)]"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl font-bold text-[var(--accent-deep)] ring-2 ring-[var(--line)]">
              {user.login[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="text-center">
            <h1 className="display-font text-xl font-bold text-[var(--ink)]">
              @{user.login}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Signed in via GitHub
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Workspaces
          </h2>
          {memberships === null ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Loading...</p>
          ) : workspaces.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">No workspaces yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
              {workspaces.map((ws) => {
                const member = memberships.get(ws.id)
                return (
                  <li key={ws.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--ink)]">
                          {ws.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
                          <span className="uppercase tracking-wider">{ws.role}</span>
                          {member && (
                            <>
                              <span>·</span>
                              <span>Display name: {member.displayName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {member && editingWs !== ws.id && (
                        <button
                          onClick={() => {
                            setEditingWs(ws.id)
                            setEditName(member.displayName)
                          }}
                          className="shrink-0 rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                        >
                          Edit name
                        </button>
                      )}
                    </div>
                    {editingWs === ws.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName(ws.id)
                            if (e.key === 'Escape') setEditingWs(null)
                          }}
                          autoFocus
                          className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
                        />
                        <button
                          onClick={() => handleSaveName(ws.id)}
                          className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingWs(null)}
                          className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)]"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <button
            onClick={() => app.auth.signOut()}
            className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm text-[var(--error)] hover:bg-[var(--error)]/10"
          >
            Sign out
          </button>
        </section>
      </main>
    </div>
  )
}
