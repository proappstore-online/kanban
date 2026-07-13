import { app } from '../app'
import type { Invite, Role, Workspace } from '../../types'
import { ensureMigrated, rid } from './core'
import { rowToWorkspace } from './workspaces'
import { logActivity } from './activity'
import { fireBoardPatch } from '../realtime'
import { q, x } from '../actions'

interface InviteRow {
  id: string
  tenant_id: string
  code: string
  role: Role
  created_by: string
  expires_at: number | null
  accepted_at: number | null
  accepted_by: string | null
  created_at: number
}

interface WorkspaceRow {
  id: string
  slug: string
  name: string
  owner_user_id: string
  created_at: number
}

function rowToInvite(r: InviteRow): Invite {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    code: r.code,
    role: r.role,
    createdBy: r.created_by,
    expiresAt: r.expires_at ?? undefined,
    acceptedAt: r.accepted_at ?? undefined,
    acceptedBy: r.accepted_by ?? undefined,
    createdAt: r.created_at,
  }
}

/**
 * Short, URL-safe invite code. ~20 bits of entropy is plenty for a
 * single-tenant single-use code; we also check uniqueness at the DB layer.
 */
function inviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
}

export async function createInvite(tenantId: string, role: Role = 'member'): Promise<Invite> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const code = inviteCode()
  const now = Date.now()
  const expires = now + 7 * 24 * 60 * 60 * 1000 // 7-day default
  await x('create_invite', {
    id,
    tenant_id: tenantId,
    code,
    role,
    expires_at: expires,
  })
  return {
    id,
    tenantId,
    code,
    role,
    createdBy: me.id,
    expiresAt: expires,
    createdAt: now,
  }
}

export async function listInvites(tenantId: string): Promise<Invite[]> {
  await ensureMigrated()
  const rows = await q<InviteRow>('list_invites', { tenant_id: tenantId })
  return rows.map(rowToInvite)
}

export async function revokeInvite(tenantId: string, inviteId: string): Promise<void> {
  await ensureMigrated()
  await x('revoke_invite', { tenant_id: tenantId, invite_id: inviteId })
}

/**
 * Redeem an invite code. Adds the current user as a member of the workspace
 * and returns the workspace they joined. Invite links are reusable — any
 * number of people can join with the same link until it expires or is
 * revoked. Returns null if the code is invalid, expired, or the workspace
 * no longer exists. Idempotent: if already a member, just returns the
 * workspace without re-adding.
 */
export async function redeemInvite(code: string): Promise<Workspace | null> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const rows = await q<InviteRow>('find_invite_by_code', { code })
  const invite = rows[0]
  if (!invite) return null

  const existingMembers = await q<{ id: string }>('get_my_membership', {
    tenant_id: invite.tenant_id,
  })
  if (existingMembers.length === 0) {
    // The action derives the role from the server-side invite row (never the
    // client) and is a no-op if the caller is somehow already a member.
    await x('redeem_invite', {
      id: rid(),
      code,
      display_name: me.login ?? 'New member',
      avatar_url: me.avatarUrl ?? null,
    })

    // Notify existing members via activity feed on all boards
    const boardIds = await q<{ id: string }>('list_active_board_ids', {
      tenant_id: invite.tenant_id,
    })
    for (const b of boardIds) {
      logActivity(invite.tenant_id, b.id, 'member.joined', {
        displayName: me.login ?? 'New member',
      }).catch(() => {})
      fireBoardPatch(b.id, { kind: 'activity.added' })
    }
  }

  const ws = await q<WorkspaceRow>('get_workspace', { tenant_id: invite.tenant_id })
  return ws[0] ? rowToWorkspace(ws[0]) : null
}
