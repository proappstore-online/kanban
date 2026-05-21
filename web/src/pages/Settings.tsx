import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { Invite, Member, Role, WorkspaceWithRole } from '../types'
import {
  createInvite,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from '../lib/db'
import { TopBar } from '../components/TopBar'

interface SettingsProps {
  user: User
  workspace: WorkspaceWithRole
  onBack: () => void
}

const ROLES: Role[] = ['owner', 'admin', 'member', 'guest']

export function Settings({ user, workspace, onBack }: SettingsProps) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [busy, setBusy] = useState(false)

  const canManage = workspace.role === 'owner' || workspace.role === 'admin'

  async function refresh() {
    const [m, i] = await Promise.all([
      listMembers(workspace.id),
      listInvites(workspace.id),
    ])
    setMembers(m)
    setInvites(i)
  }

  useEffect(() => {
    refresh().catch(() => {
      setMembers([])
      setInvites([])
    })
  }, [workspace.id])

  async function handleNewInvite() {
    if (!canManage || busy) return
    setBusy(true)
    try {
      await createInvite(workspace.id, 'member')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRevoke(inviteId: string) {
    if (!canManage) return
    await revokeInvite(workspace.id, inviteId)
    setInvites((prev) => prev?.filter((i) => i.id !== inviteId) ?? null)
  }

  async function handleRoleChange(memberId: string, role: Role) {
    if (!canManage) return
    await updateMemberRole(workspace.id, memberId, role)
    setMembers((prev) => prev?.map((m) => (m.id === memberId ? { ...m, role } : m)) ?? null)
  }

  async function handleRemove(member: Member) {
    if (!canManage) return
    if (member.userId === workspace.ownerUserId) return
    if (!confirm(`Remove ${member.displayName} from ${workspace.name}?`)) return
    await removeMember(workspace.id, member.id)
    setMembers((prev) => prev?.filter((m) => m.id !== member.id) ?? null)
  }

  function inviteUrl(code: string): string {
    return `${location.origin}/#/invite/${code}`
  }

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
        center={<>Settings — {workspace.name}</>}
      />
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <section>
          <SectionHeader>Members</SectionHeader>
          {members === null ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--paper)]">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Avatar name={m.displayName} url={m.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--ink)]">
                      {m.displayName}
                      {m.userId === user.id && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                          you
                        </span>
                      )}
                    </div>
                    {m.email && (
                      <div className="truncate text-xs text-[var(--muted)]">{m.email}</div>
                    )}
                  </div>
                  {canManage && m.userId !== workspace.ownerUserId ? (
                    <>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as Role)}
                        className="rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-2 py-1 text-xs text-[var(--ink)]"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemove(m)}
                        className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--error)] hover:bg-[var(--error)]/10"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                      {m.role}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <SectionHeader
            right={
              canManage && (
                <button
                  onClick={handleNewInvite}
                  disabled={busy}
                  className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-xs font-semibold text-[var(--paper)] disabled:opacity-40"
                >
                  {busy ? 'Creating…' : 'New invite link'}
                </button>
              )
            }
          >
            Invite links
          </SectionHeader>
          {invites === null ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
          ) : invites.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {canManage
                ? 'No active invites. Create one to invite teammates.'
                : 'No active invites.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {invites.map((iv) => (
                <li
                  key={iv.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3"
                >
                  <input
                    readOnly
                    value={inviteUrl(iv.code)}
                    onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                    className="min-w-0 flex-1 truncate rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none"
                  />
                  <button
                    onClick={() => navigator.clipboard?.writeText(inviteUrl(iv.code))}
                    className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    Copy
                  </button>
                  {canManage && (
                    <button
                      onClick={() => handleRevoke(iv.id)}
                      className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--error)] hover:bg-[var(--error)]/10"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

function SectionHeader({
  children,
  right,
}: {
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {children}
      </h2>
      {right}
    </div>
  )
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return <img src={url} alt={name} className="size-8 shrink-0 rounded-full object-cover" />
  }
  const initials = name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-deep)]">
      {initials || '?'}
    </div>
  )
}
