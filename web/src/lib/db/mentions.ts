import { app } from '../app'
import type { Mention } from '../../types'
import { ensureMigrated } from './core'
import { q, x } from '../actions'

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
  const rows = await q<MentionRow>('list_my_mentions', { tenant_id: tenantId, limit })
  return rows.map(rowToMention)
}

export async function countUnreadMentions(tenantId: string): Promise<number> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return 0
  const rows = await q<{ n: number }>('count_unread_mentions', { tenant_id: tenantId })
  return Number(rows[0]?.n ?? 0)
}

export async function markMentionRead(tenantId: string, mentionId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return
  await x('mark_mention_read', { tenant_id: tenantId, mention_id: mentionId })
}

export async function markAllMentionsRead(tenantId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return
  await x('mark_all_mentions_read', { tenant_id: tenantId })
}
