import { useEffect, useState } from 'react'
import type { User } from '@proappstore/sdk'
import type { Feature, Invite, Member, Role, WorkspaceWithRole } from '../types'
import {
  createFeature,
  createInvite,
  deleteFeature,
  deleteWorkspace,
  leaveWorkspace,
  listFeatures,
  listInvites,
  listMembers,
  removeMember,
  renameFeature,
  renameWorkspace,
  revokeInvite,
  transferOwnership,
  updateMemberRole,
} from '../lib/db'
import { app } from '../lib/app'
import { TopBar } from '../components/TopBar'

interface SettingsProps {
  user: User
  workspace: WorkspaceWithRole
  onBack: () => void
  onLeft: () => void
  onWorkspaceChanged?: (patch: Partial<WorkspaceWithRole>) => void
}

const ROLES: Role[] = ['owner', 'admin', 'member', 'guest']

export function Settings({ user, workspace, onBack, onLeft, onWorkspaceChanged }: SettingsProps) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [features, setFeatures] = useState<Feature[] | null>(null)
  const [newFeatureName, setNewFeatureName] = useState('')
  const [busy, setBusy] = useState(false)
  const [workspaceName, setWorkspaceName] = useState(workspace.name)

  const canManage = workspace.role === 'owner' || workspace.role === 'admin'
  const isOwner = workspace.role === 'owner'

  async function handleRenameWorkspace() {
    const trimmed = workspaceName.trim()
    if (!trimmed || trimmed === workspace.name || !canManage) {
      setWorkspaceName(workspace.name)
      return
    }
    await renameWorkspace(workspace.id, trimmed)
    onWorkspaceChanged?.({ name: trimmed })
  }

  async function handleLeave() {
    if (isOwner) {
      alert('Transfer ownership to another member before leaving the workspace.')
      return
    }
    if (!confirm(`Leave "${workspace.name}"? You'll lose access until invited back.`)) return
    await leaveWorkspace(workspace.id)
    onLeft()
  }

  async function handleDelete() {
    if (!isOwner) return
    if (!confirm(`Delete "${workspace.name}"? All boards, cards, comments, and members will be permanently removed.`)) return
    if (!confirm(`Are you absolutely sure? This cannot be undone.`)) return
    try {
      await deleteWorkspace(workspace.id)
      onLeft()
    } catch {
      alert('Could not delete workspace.')
    }
  }

  async function handleTransfer(member: Member) {
    if (!isOwner) return
    if (member.userId === user.id) return
    if (
      !confirm(
        `Transfer ownership of "${workspace.name}" to ${member.displayName}? You'll be demoted to admin.`,
      )
    ) {
      return
    }
    await transferOwnership(workspace.id, member.userId)
    onWorkspaceChanged?.({ role: 'admin', ownerUserId: member.userId })
    setMembers((prev) =>
      prev?.map((m) => {
        if (m.userId === member.userId) return { ...m, role: 'owner' as Role }
        if (m.userId === user.id) return { ...m, role: 'admin' as Role }
        return m
      }) ?? null,
    )
  }

  async function refresh() {
    const [m, i, f] = await Promise.all([
      listMembers(workspace.id),
      listInvites(workspace.id),
      listFeatures(workspace.id),
    ])
    setMembers(m)
    setInvites(i)
    setFeatures(f)
  }

  async function handleAddFeature() {
    const name = newFeatureName.trim()
    if (!name || !canManage) return
    const f = await createFeature(workspace.id, name)
    setFeatures((prev) => (prev ? [...prev, f] : [f]))
    setNewFeatureName('')
  }

  async function handleRenameFeature(featureId: string, name: string) {
    if (!canManage) return
    await renameFeature(workspace.id, featureId, name)
    setFeatures((prev) => prev?.map((f) => (f.id === featureId ? { ...f, name } : f)) ?? null)
  }

  async function handleDeleteFeature(feature: Feature) {
    if (!canManage) return
    if (
      !confirm(
        `Delete feature "${feature.name}"? Boards under it will become Ungrouped (the boards themselves are not deleted).`,
      )
    )
      return
    await deleteFeature(workspace.id, feature.id)
    setFeatures((prev) => prev?.filter((f) => f.id !== feature.id) ?? null)
  }

  useEffect(() => {
    refresh().catch(() => {
      if (app.auth.user) {
        setMembers([])
        setInvites([])
      }
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
    if (member.userId === user.id) {
      alert('Use "Leave workspace" to remove yourself.')
      return
    }
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
            aria-label="Back to boards"
            className="rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)] sm:px-3"
          >
            <span className="sm:hidden">←</span>
            <span className="hidden sm:inline">← Boards</span>
          </button>
        }
        center={<>Settings — {workspace.name}</>}
      />
      <main className="mx-auto max-w-[900px] px-2 py-4 sm:px-6 sm:py-8">
        <section>
          <SectionHeader>Workspace</SectionHeader>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)]">
              Name
            </label>
            <input
              value={workspaceName}
              readOnly={!canManage}
              aria-label="Workspace name"
              onChange={(e) => setWorkspaceName(e.target.value)}
              onBlur={handleRenameWorkspace}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
              }}
              className="mt-1 w-full bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="rounded-full bg-[var(--paper-deep)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                {workspace.slug}
              </code>
              <span className="text-[11px] text-[var(--muted)]">
                URL slug — appears in shared links. Stable across renames.
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={handleLeave}
                className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--error)] hover:bg-[var(--error)]/10"
                title={
                  isOwner
                    ? 'Transfer ownership to another member first'
                    : 'Leave this workspace'
                }
              >
                {isOwner ? 'Leave (owner must transfer first)' : 'Leave workspace'}
              </button>
              {isOwner && (
                <button
                  onClick={handleDelete}
                  className="rounded-full border border-[var(--error)] px-3 py-1.5 text-xs font-semibold text-[var(--error)] hover:bg-[var(--error)]/10"
                >
                  Delete workspace
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-10">
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
                        aria-label={`Role for ${m.displayName}`}
                        className="rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-2 py-1 text-xs text-[var(--ink)]"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {isOwner && m.userId !== user.id && (
                        <button
                          onClick={() => handleTransfer(m)}
                          className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                          title="Transfer ownership to this member"
                        >
                          Make owner
                        </button>
                      )}
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
                    aria-label="Invite link"
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

        <section className="mt-10">
          <SectionHeader>Features</SectionHeader>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Group your boards (epics) by feature — e.g. "Free apps", "Games", "Premium apps".
            Each board can optionally belong to one feature.
          </p>
          {features === null ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Loading…</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {features.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3"
                >
                  <input
                    defaultValue={f.name}
                    readOnly={!canManage}
                    aria-label={`Feature name: ${f.name}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== f.name) handleRenameFeature(f.id, v)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                    }}
                    className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
                  />
                  {canManage && (
                    <button
                      onClick={() => handleDeleteFeature(f)}
                      className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs text-[var(--error)] hover:bg-[var(--error)]/10"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
              {canManage && (
                <li className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--glass)] px-4 py-3">
                  <input
                    value={newFeatureName}
                    onChange={(e) => setNewFeatureName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddFeature()
                    }}
                    placeholder="New feature name (e.g. Premium apps)"
                    aria-label="New feature name"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                  />
                  <button
                    onClick={handleAddFeature}
                    disabled={!newFeatureName.trim()}
                    className="rounded-full bg-[var(--ink)] px-3 py-1 text-xs font-semibold text-[var(--paper)] disabled:opacity-40"
                  >
                    Add
                  </button>
                </li>
              )}
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
