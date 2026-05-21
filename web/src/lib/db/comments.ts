import { app } from '../app'
import type { Comment, Member } from '../../types'
import { ensureMigrated, rid } from './core'

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

const COMMENT_SELECT = `
  SELECT c.id, c.tenant_id, c.card_id, c.author_id, c.body, c.created_at, c.updated_at, c.deleted_at,
         m.display_name AS author_display_name, m.avatar_url AS author_avatar_url
    FROM comments c
    LEFT JOIN members m ON m.tenant_id = c.tenant_id AND m.user_id = c.author_id
`

export async function listComments(tenantId: string, cardId: string): Promise<Comment[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<CommentRow>(
    `${COMMENT_SELECT}
     WHERE c.tenant_id = ? AND c.card_id = ? AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC`,
    [tenantId, cardId],
  )
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
  const { rows } = await app.db.query<{ card_id: string; n: number }>(
    `SELECT c.card_id, COUNT(*) AS n
       FROM comments c
       JOIN cards cards ON cards.id = c.card_id
      WHERE c.tenant_id = ? AND cards.board_id = ? AND c.deleted_at IS NULL
      GROUP BY c.card_id`,
    [tenantId, boardId],
  )
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
  await app.db.execute(
    `INSERT INTO comments (id, tenant_id, card_id, author_id, body, created_at)
     VALUES (?,?,?,?,?,?)`,
    [id, tenantId, cardId, me.id, trimmed, now],
  )

  const mentioned = parseMentions(trimmed, members).filter((uid) => uid !== me.id)
  for (const uid of mentioned) {
    await app.db.execute(
      `INSERT INTO mentions
         (id, tenant_id, comment_id, card_id, board_id, mentioned_user_id, actor_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [rid(), tenantId, id, cardId, boardId, uid, me.id, now],
    )
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
  // Soft delete — keeps activity-feed audit trail intact. Authors only
  // (verified by the WHERE clause so users can't tamper with others').
  await app.db.execute(
    `UPDATE comments SET deleted_at = ? WHERE id = ? AND tenant_id = ? AND author_id = ?`,
    [Date.now(), commentId, tenantId, me.id],
  )
  // Also clear mention rows for this comment so the bell doesn't show
  // stale references to a deleted comment.
  await app.db.execute(`DELETE FROM mentions WHERE comment_id = ?`, [commentId])
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
