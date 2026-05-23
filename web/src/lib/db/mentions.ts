import { app } from '../app'
import type { Mention } from '../../types'
import { ensureMigrated } from './core'

interface MentionRow {
  id: string
  tenant_id: string
  comment_id: string
  card_id: string
  board_id: string
  mentioned_user_id: string
  actor_id: string
  read_at: number | null
  created_at: number
  // Joined columns:
  actor_display_name: string | null
  actor_avatar_url: string | null
  comment_body: string | null
  card_title: string | null
}

function rowToMention(r: MentionRow): Mention {
  return {
    id: r.id,
    commentId: r.comment_id,
    cardId: r.card_id,
    boardId: r.board_id,
    mentionedUserId: r.mentioned_user_id,
    actorId: r.actor_id,
    actorDisplayName: r.actor_display_name ?? '(former member)',
    actorAvatarUrl: r.actor_avatar_url ?? undefined,
    commentBody: r.comment_body ?? '(deleted comment)',
    cardTitle: r.card_title ?? '(deleted card)',
    readAt: r.read_at ?? undefined,
    createdAt: r.created_at,
  }
}

/**
 * List the current user's @mentions in the given workspace, newest first.
 * Joined to comments/cards/members to render the inbox row inline without
 * per-row roundtrips. Limit kept small — this is the bell dropdown, not a
 * page.
 */
export async function listMyMentions(tenantId: string, limit = 25): Promise<Mention[]> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return []
  const { rows } = await app.db.query<MentionRow>(
    `SELECT m.*,
            actor.display_name AS actor_display_name,
            actor.avatar_url   AS actor_avatar_url,
            c.body             AS comment_body,
            cards.title        AS card_title
       FROM mentions m
       LEFT JOIN members actor ON actor.tenant_id = m.tenant_id AND actor.user_id = m.actor_id
       LEFT JOIN comments c    ON c.id = m.comment_id AND c.deleted_at IS NULL
       LEFT JOIN cards         ON cards.id = m.card_id
      WHERE m.tenant_id = ? AND m.mentioned_user_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?`,
    [tenantId, me.id, limit],
  )
  return rows.map(rowToMention)
}

export async function countUnreadMentions(tenantId: string): Promise<number> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return 0
  const { rows } = await app.db.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM mentions m
       JOIN comments c ON c.id = m.comment_id AND c.deleted_at IS NULL
      WHERE m.tenant_id = ? AND m.mentioned_user_id = ? AND m.read_at IS NULL`,
    [tenantId, me.id],
  )
  return Number(rows[0]?.n ?? 0)
}

export async function markMentionRead(tenantId: string, mentionId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return
  await app.db.execute(
    `UPDATE mentions SET read_at = ?
      WHERE id = ? AND tenant_id = ? AND mentioned_user_id = ? AND read_at IS NULL`,
    [Date.now(), mentionId, tenantId, me.id],
  )
}

export async function markAllMentionsRead(tenantId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return
  await app.db.execute(
    `UPDATE mentions SET read_at = ?
      WHERE tenant_id = ? AND mentioned_user_id = ? AND read_at IS NULL`,
    [Date.now(), tenantId, me.id],
  )
}
