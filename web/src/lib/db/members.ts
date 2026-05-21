import { app } from '../app'
import type { Member, Role } from '../../types'
import { ensureMigrated } from './core'

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
  const { rows } = await app.db.query<MemberRow>(
    `SELECT * FROM members WHERE tenant_id = ? ORDER BY joined_at ASC`,
    [tenantId],
  )
  return rows.map(rowToMember)
}

export async function updateMemberRole(
  tenantId: string,
  memberId: string,
  role: Role,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE members SET role = ? WHERE id = ? AND tenant_id = ?`,
    [role, memberId, tenantId],
  )
}

export async function removeMember(tenantId: string, memberId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM members WHERE id = ? AND tenant_id = ?`, [memberId, tenantId])
}
