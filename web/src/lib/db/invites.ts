import { app } from '../app'
import type { Invite, Role, Workspace } from '../../types'
import { ensureMigrated, rid } from './core'
import { rowToWorkspace } from './workspaces'

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
  await app.db.execute(
    `INSERT INTO invites (id, tenant_id, code, role, created_by, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, tenantId, code, role, me.id, expires, now],
  )
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
  const { rows } = await app.db.query<InviteRow>(
    `SELECT * FROM invites
      WHERE tenant_id = ? AND accepted_at IS NULL
   ORDER BY created_at DESC`,
    [tenantId],
  )
  return rows.map(rowToInvite)
}

export async function revokeInvite(tenantId: string, inviteId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM invites WHERE id = ? AND tenant_id = ?`, [inviteId, tenantId])
}

/**
 * Redeem an invite code. Adds the current user as a member of the workspace,
 * marks the invite consumed, and returns the workspace they joined. Returns
 * null if the code is invalid, expired, already used, OR if the underlying
 * workspace has been deleted — the UI surfaces all four as a generic
 * "invite invalid" because we don't want to leak workspace existence.
 * Idempotent for the same user joining the same workspace twice.
 */
export async function redeemInvite(code: string): Promise<Workspace | null> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const now = Date.now()
  const { rows } = await app.db.query<InviteRow>(
    `SELECT * FROM invites
      WHERE code = ?
        AND accepted_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1`,
    [code, now],
  )
  const invite = rows[0]
  if (!invite) return null

  const { rows: existingMembers } = await app.db.query<{ id: string }>(
    `SELECT id FROM members WHERE tenant_id = ? AND user_id = ?`,
    [invite.tenant_id, me.id],
  )
  if (existingMembers.length === 0) {
    await app.db.execute(
      `INSERT INTO members (id, tenant_id, user_id, role, display_name, avatar_url, joined_at)
       VALUES (?,?,?,?,?,?,?)`,
      [rid(), invite.tenant_id, me.id, invite.role, me.login ?? 'New member', me.avatarUrl ?? null, now],
    )
  }
  await app.db.execute(
    `UPDATE invites SET accepted_at = ?, accepted_by = ? WHERE id = ?`,
    [now, me.id, invite.id],
  )

  const { rows: ws } = await app.db.query<WorkspaceRow>(
    `SELECT * FROM workspaces WHERE id = ? LIMIT 1`,
    [invite.tenant_id],
  )
  return ws[0] ? rowToWorkspace(ws[0]) : null
}
