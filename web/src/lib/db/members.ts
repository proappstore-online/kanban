import { app } from '../app'
import type { Member, Role } from '../../types'
import { ensureMigrated } from './core'
import { q, x } from '../actions'

interface MemberRow {
  id: string
  tenant_id: string
  user_id: string
  role: Role
  display_name: string
  email: string | null
  avatar_url: string | null
  joined_at: number
}

function rowToMember(r: MemberRow): Member {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    role: r.role,
    displayName: r.display_name,
    email: r.email ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    joinedAt: r.joined_at,
  }
}

export async function listMembers(tenantId: string): Promise<Member[]> {
  await ensureMigrated()
  const rows = await q<MemberRow>('list_members', { tenant_id: tenantId })
  return rows.map(rowToMember)
}

export async function updateMemberRole(
  tenantId: string,
  memberId: string,
  role: Role,
): Promise<void> {
  await ensureMigrated()
  await x('update_member_role', { tenant_id: tenantId, member_id: memberId, role })
}

export async function removeMember(tenantId: string, memberId: string): Promise<void> {
  await ensureMigrated()
  await x('remove_member', { tenant_id: tenantId, member_id: memberId })
}

export async function updateMyDisplayName(tenantId: string, displayName: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('update_my_display_name', { tenant_id: tenantId, display_name: displayName })
}

export async function updateMyEmail(tenantId: string, email: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await x('update_my_email', { tenant_id: tenantId, email: email || null })
}
