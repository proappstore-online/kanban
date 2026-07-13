import { app } from '../app'
import type { Role, Workspace, WorkspaceWithRole } from '../../types'
import { ensureMigrated, rid } from './core'
import { q, x } from '../actions'

interface WorkspaceRow {
  id: string
  slug: string
  name: string
  owner_user_id: string
  created_at: number
}

interface WorkspaceWithRoleRow extends WorkspaceRow {
  role: Role
}

export function rowToWorkspace(r: WorkspaceRow): Workspace {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    ownerUserId: r.owner_user_id,
    createdAt: r.created_at,
  }
}

/**
 * URL-safe slug for a workspace. We append 4 random chars to keep the
 * slug unique even when two workspaces are named identically, and so
 * that a typed-out URL can't be guessed for any private workspace.
 */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const tail = Math.random().toString(36).slice(2, 6)
  return base ? `${base}-${tail}` : `ws-${tail}`
}

export async function listMyWorkspaces(): Promise<WorkspaceWithRole[]> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return []
  const rows = await q<WorkspaceWithRoleRow>('list_my_workspaces')
  return rows.map((r) => ({ ...rowToWorkspace(r), role: r.role }))
}

export async function createWorkspace(name: string): Promise<Workspace> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const slug = slugify(name)
  const now = Date.now()
  await x('create_workspace', {
    id,
    member_id: rid(),
    slug,
    name,
    display_name: me.login ?? 'You',
    avatar_url: me.avatarUrl ?? null,
  })
  return { id, slug, name, ownerUserId: me.id, createdAt: now }
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await ensureMigrated()
  await x('rename_workspace', { tenant_id: workspaceId, name })
}

/**
 * The current user leaves a workspace. Owners are blocked at the UI layer
 * (they must transfer ownership first); we double-check server-side as a
 * defence-in-depth measure: the DELETE silently no-ops if the row is the
 * owner because we additionally require `role != 'owner'`. Caller should
 * still surface a UX message for the owner case.
 */
export async function leaveWorkspace(workspaceId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('leave_workspace', { tenant_id: workspaceId })
}

/**
 * Owner-only: transfer ownership to another member. Idempotent if the
 * target is already the owner. The previous owner is demoted to `admin`
 * so they don't suddenly lose all management capability.
 */
/**
 * Owner-only: permanently delete a workspace and all its data.
 * Cascades through boards → lists → cards → comments/mentions/labels/assignees/checklist.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  // Verify caller is owner (the action also guards owner-only server-side).
  const rows = await q<{ owner_user_id: string }>('get_workspace_owner', { tenant_id: workspaceId })
  if (!rows[0] || rows[0].owner_user_id !== me.id) throw new Error('Only the owner can delete a workspace.')
  // Atomic cascade delete — one D1 transaction, owner-guarded per statement.
  await x('delete_workspace', { tenant_id: workspaceId })
}

export async function transferOwnership(
  workspaceId: string,
  newOwnerUserId: string,
): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  if (newOwnerUserId === me.id) return
  const target = await q<{ id: string }>('get_workspace_member', {
    tenant_id: workspaceId,
    user_id: newOwnerUserId,
  })
  if (target.length === 0) throw new Error('Target user is not a member.')
  await x('transfer_ownership', { tenant_id: workspaceId, new_owner_user_id: newOwnerUserId })
}
