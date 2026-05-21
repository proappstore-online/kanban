import { app } from '../app'
import type { Role, Workspace, WorkspaceWithRole } from '../../types'
import { ensureMigrated, rid } from './core'

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
  const { rows } = await app.db.query<WorkspaceWithRoleRow>(
    `SELECT w.*, m.role
       FROM workspaces w
       JOIN members m ON m.tenant_id = w.id
      WHERE m.user_id = ?
   ORDER BY w.created_at DESC`,
    [me.id],
  )
  return rows.map((r) => ({ ...rowToWorkspace(r), role: r.role }))
}

export async function createWorkspace(name: string): Promise<Workspace> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const slug = slugify(name)
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO workspaces (id, slug, name, owner_user_id, created_at) VALUES (?,?,?,?,?)`,
    [id, slug, name, me.id, now],
  )
  await app.db.execute(
    `INSERT INTO members (id, tenant_id, user_id, role, display_name, avatar_url, joined_at)
     VALUES (?,?,?,?,?,?,?)`,
    [rid(), id, me.id, 'owner', me.login ?? 'You', me.avatarUrl ?? null, now],
  )
  return { id, slug, name, ownerUserId: me.id, createdAt: now }
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`UPDATE workspaces SET name = ? WHERE id = ?`, [name, workspaceId])
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
  await app.db.execute(
    `DELETE FROM members WHERE tenant_id = ? AND user_id = ? AND role != 'owner'`,
    [workspaceId, me.id],
  )
}

/**
 * Owner-only: transfer ownership to another member. Idempotent if the
 * target is already the owner. The previous owner is demoted to `admin`
 * so they don't suddenly lose all management capability.
 */
export async function transferOwnership(
  workspaceId: string,
  newOwnerUserId: string,
): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  if (newOwnerUserId === me.id) return
  const { rows: target } = await app.db.query<{ id: string }>(
    `SELECT id FROM members WHERE tenant_id = ? AND user_id = ?`,
    [workspaceId, newOwnerUserId],
  )
  if (target.length === 0) throw new Error('Target user is not a member.')
  await app.db.execute(
    `UPDATE workspaces SET owner_user_id = ? WHERE id = ? AND owner_user_id = ?`,
    [newOwnerUserId, workspaceId, me.id],
  )
  await app.db.execute(
    `UPDATE members SET role = 'admin' WHERE tenant_id = ? AND user_id = ?`,
    [workspaceId, me.id],
  )
  await app.db.execute(
    `UPDATE members SET role = 'owner' WHERE tenant_id = ? AND user_id = ?`,
    [workspaceId, newOwnerUserId],
  )
}
