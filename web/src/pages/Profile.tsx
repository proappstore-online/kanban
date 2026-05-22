import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import { useProNotifications } from '@proappstore/sdk/hooks'
import type { Member, WorkspaceWithRole } from '../types'
import { listMembers, updateMyDisplayName, updateMyEmail } from '../lib/db'
import { app } from '../lib/app'
import { TopBar } from '../components/TopBar'

type ThemePref = 'light' | 'dark' | 'system'

function getThemePref(): ThemePref {
  return (localStorage.getItem('fas:theme') as ThemePref) ?? 'system'
}

function applyTheme(pref: ThemePref) {
  localStorage.setItem('fas:theme', pref)
  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : ''
}

interface ProfileProps {
  user: User
  workspaces: WorkspaceWithRole[]
}

export function Profile({ user, workspaces }: ProfileProps) {
  const [memberships, setMemberships] = useState<Map<string, Member> | null>(null)
  const [editingWs, setEditingWs] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [themePref, setThemePref] = useState<ThemePref>(getThemePref)
  const { permission, isSubscribed, subscribe, unsubscribe, loading: notifLoading } = useProNotifications(app)

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

  async function handleSave(wsId: string) {
    const trimmedName = editName.trim()
    const trimmedEmail = editEmail.trim()
    const member = memberships?.get(wsId)
    if (trimmedName && trimmedName !== member?.displayName) {
      await updateMyDisplayName(wsId, trimmedName)
    }
    if (trimmedEmail !== (member?.email ?? '')) {
      await updateMyEmail(wsId, trimmedEmail)
    }
    setMemberships((prev) => {
      if (!prev) return prev
      const next = new Map(prev)
      const m = next.get(wsId)
      if (m) next.set(wsId, { ...m, displayName: trimmedName || m.displayName, email: trimmedEmail || undefined })
      return next
    })
    setEditingWs(null)
  }

  return (
    <div className="min-h-[100dvh]">
      <TopBar
        user={user}
        left={
          <a
            href="#"
            aria-label="Back to workspaces"
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] sm:px-3"
          >
            <span className="sm:hidden">←</span>
            <span className="hidden sm:inline">← Workspaces</span>
          </a>
        }
        center={<>Profile</>}
      />
      <main className="mx-auto max-w-[600px] px-2 py-4 sm:px-6 sm:py-8">
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                          <span className="uppercase tracking-wider">{ws.role}</span>
                          {member && (
                            <>
                              <span>·</span>
                              <span>{member.displayName}</span>
                            </>
                          )}
                          {member?.email && (
                            <>
                              <span>·</span>
                              <span>{member.email}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {member && editingWs !== ws.id && (
                        <button
                          onClick={() => {
                            setEditingWs(ws.id)
                            setEditName(member.displayName)
                            setEditEmail(member.email ?? '')
                          }}
                          className="shrink-0 rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingWs === ws.id && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                            Display name
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave(ws.id)
                                if (e.key === 'Escape') setEditingWs(null)
                              }}
                              autoFocus
                              className="mt-1 block w-full rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
                            />
                          </label>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                            Email
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave(ws.id)
                                if (e.key === 'Escape') setEditingWs(null)
                              }}
                              placeholder="you@example.com"
                              className="mt-1 block w-full rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--line-strong)] placeholder:text-[var(--muted)]"
                            />
                          </label>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleSave(ws.id)}
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
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Theme
          </h2>
          <div className="mt-4 flex gap-2">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => { setThemePref(opt); applyTheme(opt) }}
                className={`rounded-full border px-4 py-1.5 text-xs capitalize ${
                  themePref === opt
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] font-semibold'
                    : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>

        {typeof Notification !== 'undefined' && permission !== 'denied' && (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Notifications
            </h2>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => (isSubscribed ? unsubscribe() : subscribe())}
                disabled={notifLoading}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                  isSubscribed
                    ? 'border-[var(--mint)] bg-[var(--mint-soft)] text-[var(--mint-deep)]'
                    : 'border-[var(--line-strong)] text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {notifLoading ? 'Loading...' : isSubscribed ? 'Notifications on' : 'Enable notifications'}
              </button>
              {isSubscribed && (
                <span className="text-xs text-[var(--muted)]">
                  You'll be notified when someone @mentions you or assigns you a card.
                </span>
              )}
            </div>
          </section>
        )}

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
