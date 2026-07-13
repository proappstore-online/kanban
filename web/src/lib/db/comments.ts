import { app } from '../app'
import type { Comment, Member } from '../../types'
import { ensureMigrated, rid } from './core'
import { q, x } from '../actions'

interface CommentRow {
  id: string
  tenant_id: string
  card_id: string
  author_id: string
  author_display_name: string
  author_avatar_url: string | null
  body: string
  created_at: number
  updated_at: number | null
  deleted_at: number | null
}

function rowToComment(r: CommentRow): Comment {
  return {
    id: r.id,
    cardId: r.card_id,
    authorId: r.author_id,
    authorDisplayName: r.author_display_name,
    authorAvatarUrl: r.author_avatar_url ?? undefined,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
    deletedAt: r.deleted_at ?? undefined,
  }
}

export async function listComments(tenantId: string, cardId: string): Promise<Comment[]> {
  await ensureMigrated()
  const rows = await q<CommentRow>('list_comments', { tenant_id: tenantId, card_id: cardId })
  return rows.map(rowToComment)
}

/**
 * Map of card_id -> comment count for an entire board. Used to render the
 * comment-count chip on the card preview without round-tripping per card.
 */
export async function listCommentCountsByCard(
  tenantId: string,
  boardId: string,
): Promise<Map<string, number>> {
  await ensureMigrated()
  const rows = await q<{ card_id: string; n: number }>('list_board_comment_counts', {
    tenant_id: tenantId,
    board_id: boardId,
  })
  return new Map(rows.map((r) => [r.card_id, Number(r.n)]))
}

/**
 * Add a comment, extract @mentions against the workspace member list, and
 * insert one mention row per mentioned user (skipping self). Returns the
 * newly-created Comment plus the mentioned userIds for caller side effects.
 */
export async function addComment(
  tenantId: string,
  boardId: string,
  cardId: string,
  body: string,
  members: Pick<Member, 'userId' | 'displayName'>[],
): Promise<{ comment: Comment; mentionedUserIds: string[] }> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Comment cannot be empty.')

  const id = rid()
  const now = Date.now()
  await x('add_comment', { id, tenant_id: tenantId, card_id: cardId, body: trimmed })

  const mentioned = parseMentions(trimmed, members).filter((uid) => uid !== me.id)
  for (const uid of mentioned) {
    await x('add_mention', {
      id: rid(),
      tenant_id: tenantId,
      comment_id: id,
      card_id: cardId,
      board_id: boardId,
      mentioned_user_id: uid,
    })
  }

  return {
    comment: {
      id,
      cardId,
      authorId: me.id,
      authorDisplayName: me.login,
      authorAvatarUrl: me.avatarUrl ?? undefined,
      body: trimmed,
      createdAt: now,
    },
    mentionedUserIds: mentioned,
  }
}

export async function deleteComment(tenantId: string, commentId: string): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  // Soft delete (authors only) + clear mention rows so the bell doesn't show
  // stale references. Atomic; the action guards author-only server-side.
  await x('delete_comment', { tenant_id: tenantId, comment_id: commentId })
}

/**
 * Extract @login tokens from a comment body and resolve them against the
 * member list. Returns the matched member userIds (deduped). Match is
 * case-insensitive against `displayName` (which is the GitHub login for
 * members created via OAuth).
 */
export function parseMentions(
  body: string,
  members: Pick<Member, 'userId' | 'displayName'>[],
): string[] {
  const byLogin = new Map(members.map((m) => [m.displayName.toLowerCase(), m.userId]))
  const seen = new Set<string>()
  // `@` followed by a GitHub-shaped login (letters/digits/hyphens, up to 39).
  const re = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9-]{1,39})/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const uid = byLogin.get(match[1].toLowerCase())
    if (uid) seen.add(uid)
  }
  return [...seen]
}
