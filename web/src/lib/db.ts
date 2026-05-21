import { app } from './app'
import type {
  Assignee,
  Board,
  BoardSummary,
  BoardWithLists,
  Card,
  ChecklistItem,
  Invite,
  Label,
  LabelColor,
  List,
  Member,
  Role,
  Workspace,
  WorkspaceWithRole,
} from '../types'
import { between, firstPosition } from './frac'

const MIGRATIONS = [
  {
    name: '0001_init',
    sql: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id            TEXT PRIMARY KEY,
        slug          TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);

      CREATE TABLE IF NOT EXISTS members (
        id           TEXT PRIMARY KEY,
        tenant_id    TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        role         TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email        TEXT,
        avatar_url   TEXT,
        joined_at    INTEGER NOT NULL,
        UNIQUE (tenant_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_members_tenant ON members(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_members_user   ON members(user_id);

      CREATE TABLE IF NOT EXISTS invites (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL,
        code        TEXT NOT NULL UNIQUE,
        role        TEXT NOT NULL,
        created_by  TEXT NOT NULL,
        expires_at  INTEGER,
        accepted_at INTEGER,
        accepted_by TEXT,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_invites_tenant ON invites(tenant_id);

      CREATE TABLE IF NOT EXISTS boards (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        name       TEXT NOT NULL,
        background TEXT,
        archived   INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_boards_tenant ON boards(tenant_id, archived, updated_at DESC);

      CREATE TABLE IF NOT EXISTS lists (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        board_id   TEXT NOT NULL,
        title      TEXT NOT NULL,
        position   REAL NOT NULL,
        archived   INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(tenant_id, board_id, archived, position);

      CREATE TABLE IF NOT EXISTS cards (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL,
        board_id    TEXT NOT NULL,
        list_id     TEXT NOT NULL,
        position    REAL NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        due_at      INTEGER,
        archived    INTEGER NOT NULL DEFAULT 0,
        created_by  TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        version     INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_cards_list  ON cards(tenant_id, list_id, archived, position);
      CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(tenant_id, board_id, archived);

      CREATE TABLE IF NOT EXISTS labels (
        id        TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        board_id  TEXT NOT NULL,
        color     TEXT NOT NULL,
        name      TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_labels_board ON labels(tenant_id, board_id);

      CREATE TABLE IF NOT EXISTS card_labels (
        tenant_id TEXT NOT NULL,
        card_id   TEXT NOT NULL,
        label_id  TEXT NOT NULL,
        PRIMARY KEY (card_id, label_id)
      );
      CREATE INDEX IF NOT EXISTS idx_card_labels_label ON card_labels(label_id);

      CREATE TABLE IF NOT EXISTS card_assignees (
        tenant_id   TEXT NOT NULL,
        card_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        assigned_at INTEGER NOT NULL,
        assigned_by TEXT NOT NULL,
        PRIMARY KEY (card_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_card_assignees_user ON card_assignees(tenant_id, user_id);

      CREATE TABLE IF NOT EXISTS checklist_items (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        card_id    TEXT NOT NULL,
        text       TEXT NOT NULL,
        done       INTEGER NOT NULL DEFAULT 0,
        position   REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_checklist_card ON checklist_items(tenant_id, card_id, position);

      CREATE TABLE IF NOT EXISTS activity (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        board_id   TEXT NOT NULL,
        card_id    TEXT,
        actor_id   TEXT NOT NULL,
        kind       TEXT NOT NULL,
        payload    TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_board ON activity(tenant_id, board_id, created_at DESC);
    `,
  },
]

let migrated = false
export async function ensureMigrated(): Promise<void> {
  if (migrated) return
  await app.db.migrate(MIGRATIONS)
  migrated = true
}

// Identifiers -----------------------------------------------------------------

function rid(): string {
  return crypto.randomUUID()
}

/** Short, URL-safe invite code. ~20 bits of entropy is plenty for a
 * single-tenant single-use code; we also check uniqueness at the DB layer. */
function inviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const tail = Math.random().toString(36).slice(2, 6)
  return base ? `${base}-${tail}` : `ws-${tail}`
}

// Workspace -------------------------------------------------------------------

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

function rowToWorkspace(r: WorkspaceRow): Workspace {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    ownerUserId: r.owner_user_id,
    createdAt: r.created_at,
  }
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

// Members ---------------------------------------------------------------------

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

// Invites ---------------------------------------------------------------------

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
 * null if the code is invalid / expired / already used. Idempotent for the
 * same user joining the same workspace twice.
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

// Boards ----------------------------------------------------------------------

interface BoardRow {
  id: string
  tenant_id: string
  name: string
  background: string | null
  archived: number
  created_by: string
  created_at: number
  updated_at: number
}

function rowToBoard(r: BoardRow): Board {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    background: r.background ?? undefined,
    archived: r.archived !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listBoards(tenantId: string): Promise<BoardSummary[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<BoardRow>(
    `SELECT * FROM boards WHERE tenant_id = ? AND archived = 0 ORDER BY updated_at DESC`,
    [tenantId],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at }))
}

export async function createBoard(tenantId: string, name: string): Promise<Board> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO boards (id, tenant_id, name, archived, created_by, created_at, updated_at)
     VALUES (?,?,?,0,?,?,?)`,
    [id, tenantId, name, me.id, now, now],
  )
  return {
    id,
    tenantId,
    name,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

export async function renameBoard(
  tenantId: string,
  boardId: string,
  name: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [name, Date.now(), boardId, tenantId],
  )
}

export async function deleteBoard(tenantId: string, boardId: string): Promise<void> {
  await ensureMigrated()
  // Cascade by hand — D1 doesn't enforce FK cascades.
  await app.db.execute(`DELETE FROM card_labels WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`, [boardId])
  await app.db.execute(`DELETE FROM card_assignees WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`, [boardId])
  await app.db.execute(`DELETE FROM checklist_items WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?)`, [boardId])
  await app.db.execute(`DELETE FROM cards  WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM lists  WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM labels WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM boards WHERE id = ? AND tenant_id = ?`, [boardId, tenantId])
}

// Full board (lists + cards + labels + assignees + checklist) ----------------

interface ListRow {
  id: string
  tenant_id: string
  board_id: string
  title: string
  position: number
  archived: number
  created_at: number
}

interface CardRow {
  id: string
  tenant_id: string
  board_id: string
  list_id: string
  position: number
  title: string
  description: string | null
  due_at: number | null
  archived: number
  created_by: string
  created_at: number
  updated_at: number
  version: number
}

interface LabelRow {
  id: string
  tenant_id: string
  board_id: string
  color: LabelColor
  name: string
}

interface ChecklistRow {
  id: string
  tenant_id: string
  card_id: string
  text: string
  done: number
  position: number
  created_at: number
}

interface AssigneeRow {
  card_id: string
  user_id: string
  display_name: string
  avatar_url: string | null
}

export async function getBoardFull(
  tenantId: string,
  boardId: string,
): Promise<BoardWithLists | null> {
  await ensureMigrated()
  const [boardQ, listsQ, cardsQ, labelsQ, cardLabelsQ, assigneesQ, checklistQ] = await Promise.all([
    app.db.query<BoardRow>(
      `SELECT * FROM boards WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [boardId, tenantId],
    ),
    app.db.query<ListRow>(
      `SELECT * FROM lists WHERE board_id = ? AND tenant_id = ? AND archived = 0 ORDER BY position`,
      [boardId, tenantId],
    ),
    app.db.query<CardRow>(
      `SELECT * FROM cards WHERE board_id = ? AND tenant_id = ? AND archived = 0 ORDER BY list_id, position`,
      [boardId, tenantId],
    ),
    app.db.query<LabelRow>(
      `SELECT * FROM labels WHERE board_id = ? AND tenant_id = ?`,
      [boardId, tenantId],
    ),
    app.db.query<{ card_id: string; label_id: string }>(
      `SELECT cl.card_id, cl.label_id
         FROM card_labels cl
         JOIN cards c ON c.id = cl.card_id
        WHERE c.board_id = ? AND c.tenant_id = ?`,
      [boardId, tenantId],
    ),
    app.db.query<AssigneeRow>(
      `SELECT ca.card_id, ca.user_id, m.display_name, m.avatar_url
         FROM card_assignees ca
         JOIN cards   c ON c.id = ca.card_id
         JOIN members m ON m.tenant_id = ca.tenant_id AND m.user_id = ca.user_id
        WHERE c.board_id = ? AND c.tenant_id = ?`,
      [boardId, tenantId],
    ),
    app.db.query<ChecklistRow>(
      `SELECT ci.*
         FROM checklist_items ci
         JOIN cards c ON c.id = ci.card_id
        WHERE c.board_id = ? AND c.tenant_id = ?
     ORDER BY ci.position`,
      [boardId, tenantId],
    ),
  ])

  const boardRow = boardQ.rows[0]
  if (!boardRow) return null

  const labelById = new Map<string, Label>()
  for (const l of labelsQ.rows) labelById.set(l.id, { id: l.id, color: l.color, name: l.name })

  const labelsByCard = new Map<string, Label[]>()
  for (const { card_id, label_id } of cardLabelsQ.rows) {
    const label = labelById.get(label_id)
    if (!label) continue
    const arr = labelsByCard.get(card_id) ?? []
    arr.push(label)
    labelsByCard.set(card_id, arr)
  }

  const assigneesByCard = new Map<string, Assignee[]>()
  for (const a of assigneesQ.rows) {
    const arr = assigneesByCard.get(a.card_id) ?? []
    arr.push({
      userId: a.user_id,
      displayName: a.display_name,
      avatarUrl: a.avatar_url ?? undefined,
    })
    assigneesByCard.set(a.card_id, arr)
  }

  const checklistByCard = new Map<string, ChecklistItem[]>()
  for (const c of checklistQ.rows) {
    const arr = checklistByCard.get(c.card_id) ?? []
    arr.push({ id: c.id, text: c.text, done: c.done !== 0, position: c.position })
    checklistByCard.set(c.card_id, arr)
  }

  const lists: List[] = listsQ.rows.map((lr) => ({
    id: lr.id,
    boardId: lr.board_id,
    title: lr.title,
    position: lr.position,
    cards: [],
  }))
  const listById = new Map(lists.map((l) => [l.id, l]))

  for (const cr of cardsQ.rows) {
    const list = listById.get(cr.list_id)
    if (!list) continue
    const card: Card = {
      id: cr.id,
      boardId: cr.board_id,
      listId: cr.list_id,
      title: cr.title,
      description: cr.description ?? undefined,
      dueAt: cr.due_at ?? undefined,
      position: cr.position,
      labels: labelsByCard.get(cr.id) ?? [],
      checklist: checklistByCard.get(cr.id) ?? [],
      assignees: assigneesByCard.get(cr.id) ?? [],
      createdBy: cr.created_by,
      createdAt: cr.created_at,
      updatedAt: cr.updated_at,
      version: cr.version,
    }
    list.cards.push(card)
  }

  return { ...rowToBoard(boardRow), lists }
}

// Lists -----------------------------------------------------------------------

export async function createList(
  tenantId: string,
  boardId: string,
  title: string,
  afterPosition: number | null,
): Promise<List> {
  await ensureMigrated()
  const id = rid()
  const position = between(afterPosition, null) // append at end
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO lists (id, tenant_id, board_id, title, position, archived, created_at)
     VALUES (?,?,?,?,?,0,?)`,
    [id, tenantId, boardId, title, position, now],
  )
  await touchBoard(tenantId, boardId)
  return { id, boardId, title, position, cards: [] }
}

export async function renameList(
  tenantId: string,
  listId: string,
  title: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE lists SET title = ? WHERE id = ? AND tenant_id = ?`,
    [title, listId, tenantId],
  )
}

export async function deleteList(tenantId: string, listId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM card_labels WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`, [listId])
  await app.db.execute(`DELETE FROM card_assignees WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`, [listId])
  await app.db.execute(`DELETE FROM checklist_items WHERE card_id IN (SELECT id FROM cards WHERE list_id = ?)`, [listId])
  await app.db.execute(`DELETE FROM cards WHERE list_id = ? AND tenant_id = ?`, [listId, tenantId])
  await app.db.execute(`DELETE FROM lists WHERE id = ? AND tenant_id = ?`, [listId, tenantId])
}

// Cards -----------------------------------------------------------------------

export async function createCard(
  tenantId: string,
  boardId: string,
  listId: string,
  title: string,
  lastPositionInList: number | null,
): Promise<Card> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const position = lastPositionInList === null ? firstPosition() : between(lastPositionInList, null)
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO cards
      (id, tenant_id, board_id, list_id, position, title, archived, created_by, created_at, updated_at, version)
     VALUES (?,?,?,?,?,?,0,?,?,?,1)`,
    [id, tenantId, boardId, listId, position, title, me.id, now, now],
  )
  await touchBoard(tenantId, boardId)
  return {
    id,
    boardId,
    listId,
    title,
    position,
    labels: [],
    checklist: [],
    assignees: [],
    createdBy: me.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export interface CardPatch {
  title?: string
  description?: string | null
  dueAt?: number | null
}

export async function updateCard(
  tenantId: string,
  cardId: string,
  patch: CardPatch,
): Promise<void> {
  await ensureMigrated()
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.title !== undefined) {
    sets.push('title = ?')
    params.push(patch.title)
  }
  if (patch.description !== undefined) {
    sets.push('description = ?')
    params.push(patch.description)
  }
  if (patch.dueAt !== undefined) {
    sets.push('due_at = ?')
    params.push(patch.dueAt)
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(Date.now())
  sets.push('version = version + 1')
  params.push(cardId, tenantId)
  await app.db.execute(
    `UPDATE cards SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params,
  )
}

export async function deleteCard(tenantId: string, cardId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM card_labels    WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM card_assignees WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM checklist_items WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM cards WHERE id = ? AND tenant_id = ?`, [cardId, tenantId])
}

export async function moveCard(
  tenantId: string,
  cardId: string,
  toListId: string,
  prevPos: number | null,
  nextPos: number | null,
): Promise<number> {
  await ensureMigrated()
  const position = between(prevPos, nextPos)
  await app.db.execute(
    `UPDATE cards
        SET list_id = ?, position = ?, updated_at = ?, version = version + 1
      WHERE id = ? AND tenant_id = ?`,
    [toListId, position, Date.now(), cardId, tenantId],
  )
  return position
}

// Assignees -------------------------------------------------------------------

export async function addAssignee(
  tenantId: string,
  cardId: string,
  userId: string,
): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  await app.db.execute(
    `INSERT OR IGNORE INTO card_assignees (tenant_id, card_id, user_id, assigned_at, assigned_by)
     VALUES (?,?,?,?,?)`,
    [tenantId, cardId, userId, Date.now(), me.id],
  )
}

export async function removeAssignee(
  tenantId: string,
  cardId: string,
  userId: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `DELETE FROM card_assignees WHERE tenant_id = ? AND card_id = ? AND user_id = ?`,
    [tenantId, cardId, userId],
  )
}

// Labels ----------------------------------------------------------------------

export async function ensureBoardLabels(
  tenantId: string,
  boardId: string,
  colors: LabelColor[],
): Promise<Label[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<LabelRow>(
    `SELECT * FROM labels WHERE board_id = ? AND tenant_id = ?`,
    [boardId, tenantId],
  )
  const existing = new Set(rows.map((r) => r.color))
  const toCreate = colors.filter((c) => !existing.has(c))
  for (const color of toCreate) {
    await app.db.execute(
      `INSERT INTO labels (id, tenant_id, board_id, color, name) VALUES (?,?,?,?,'')`,
      [rid(), tenantId, boardId, color],
    )
  }
  const { rows: after } = await app.db.query<LabelRow>(
    `SELECT * FROM labels WHERE board_id = ? AND tenant_id = ?`,
    [boardId, tenantId],
  )
  return after.map((r) => ({ id: r.id, color: r.color, name: r.name }))
}

export async function setCardLabels(
  tenantId: string,
  cardId: string,
  labelIds: string[],
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM card_labels WHERE card_id = ?`, [cardId])
  for (const labelId of labelIds) {
    await app.db.execute(
      `INSERT INTO card_labels (tenant_id, card_id, label_id) VALUES (?,?,?)`,
      [tenantId, cardId, labelId],
    )
  }
}

// Checklist -------------------------------------------------------------------

export async function setChecklist(
  tenantId: string,
  cardId: string,
  items: ChecklistItem[],
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM checklist_items WHERE card_id = ?`, [cardId])
  for (const item of items) {
    await app.db.execute(
      `INSERT INTO checklist_items (id, tenant_id, card_id, text, done, position, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [item.id, tenantId, cardId, item.text, item.done ? 1 : 0, item.position, Date.now()],
    )
  }
}

// Internal helpers ------------------------------------------------------------

async function touchBoard(tenantId: string, boardId: string): Promise<void> {
  await app.db.execute(
    `UPDATE boards SET updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [Date.now(), boardId, tenantId],
  )
}
