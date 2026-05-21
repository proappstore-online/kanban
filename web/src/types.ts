/**
 * Label color keys map to design tokens in index.css. Keeping this as an
 * enum-like union (not the raw hex) means a future theme switch lifts the
 * whole board's palette in one place.
 */
export type LabelColor = 'accent' | 'sky' | 'mint' | 'warning' | 'error' | 'muted'

export interface Label {
  id: string
  color: LabelColor
  name: string
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  position: number
}

export interface Assignee {
  userId: string
  displayName: string
  avatarUrl?: string
}

export interface Card {
  id: string
  boardId: string
  listId: string
  title: string
  description?: string
  dueAt?: number
  position: number
  labels: Label[]
  checklist: ChecklistItem[]
  assignees: Assignee[]
  /** Count of non-deleted comments. Rendered as a chip on the card preview. */
  commentCount: number
  createdBy: string
  createdAt: number
  updatedAt: number
  version: number
}

export interface List {
  id: string
  boardId: string
  title: string
  position: number
  cards: Card[]
}

export interface Board {
  id: string
  tenantId: string
  name: string
  background?: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface BoardWithLists extends Board {
  lists: List[]
}

export interface BoardSummary {
  id: string
  name: string
  updatedAt: number
}

export type Role = 'owner' | 'admin' | 'member' | 'guest'

export interface Member {
  id: string
  tenantId: string
  userId: string
  role: Role
  displayName: string
  email?: string
  avatarUrl?: string
  joinedAt: number
}

export interface Workspace {
  id: string
  slug: string
  name: string
  ownerUserId: string
  createdAt: number
}

export interface WorkspaceWithRole extends Workspace {
  role: Role
}

export interface Comment {
  id: string
  cardId: string
  authorId: string
  authorDisplayName: string
  authorAvatarUrl?: string
  body: string
  createdAt: number
  updatedAt?: number
  deletedAt?: number
}

export interface Mention {
  id: string
  commentId: string
  cardId: string
  boardId: string
  mentionedUserId: string
  actorId: string
  actorDisplayName: string
  actorAvatarUrl?: string
  commentBody: string
  cardTitle: string
  readAt?: number
  createdAt: number
}

export type ActivityKind =
  | 'card.created'
  | 'card.moved'
  | 'card.updated'
  | 'card.deleted'
  | 'card.assigned'
  | 'card.unassigned'
  | 'comment.added'
  | 'list.created'
  | 'list.renamed'
  | 'list.deleted'
  | 'board.renamed'
  | 'member.joined'

export interface ActivityEntry {
  id: string
  boardId: string
  cardId?: string
  actorId: string
  actorDisplayName: string
  actorAvatarUrl?: string
  kind: ActivityKind
  /** Arbitrary key/value blob with kind-specific context (card title, list title, etc.). */
  payload: Record<string, unknown>
  createdAt: number
}

export interface Invite {
  id: string
  tenantId: string
  code: string
  role: Role
  createdBy: string
  expiresAt?: number
  acceptedAt?: number
  acceptedBy?: string
  createdAt: number
}

/**
 * Palette presented in the card editor. Order matters — first item is the
 * default highlight color shown to new users.
 */
export const LABEL_PRESETS: { color: LabelColor; defaultName: string }[] = [
  { color: 'accent', defaultName: '' },
  { color: 'sky', defaultName: '' },
  { color: 'mint', defaultName: '' },
  { color: 'warning', defaultName: '' },
  { color: 'error', defaultName: '' },
  { color: 'muted', defaultName: '' },
]
