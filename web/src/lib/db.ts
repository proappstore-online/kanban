import { app } from './app'
import type {
  ActivityEntry,
  ActivityKind,
  Assignee,
  AssignedTask,
  Board,
  BoardSummary,
  BoardWithLists,
  Card,
  ChecklistItem,
  Comment,
  Feature,
  Invite,
  Label,
  LabelColor,
  List,
  ListKind,
  Member,
  Mention,
  Role,
  Workspace,
  WorkspaceWithRole,
} from '../types'
import { STATUS_KINDS, STATUS_LABEL } from '../types'
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
  {
    name: '0002_comments_mentions',
    sql: `
      CREATE TABLE IF NOT EXISTS comments (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        card_id    TEXT NOT NULL,
        author_id  TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(tenant_id, card_id, created_at);

      CREATE TABLE IF NOT EXISTS mentions (
        id                TEXT PRIMARY KEY,
        tenant_id         TEXT NOT NULL,
        comment_id        TEXT NOT NULL,
        card_id           TEXT NOT NULL,
        board_id          TEXT NOT NULL,
        mentioned_user_id TEXT NOT NULL,
        actor_id          TEXT NOT NULL,
        read_at           INTEGER,
        created_at        INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions(tenant_id, mentioned_user_id, read_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mentions_comment ON mentions(comment_id);
    `,
  },
  {
    name: '0003_features_status_eta_reqs',
    sql: `
      CREATE TABLE IF NOT EXISTS features (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        name       TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_features_tenant ON features(tenant_id, sort_order);

      ALTER TABLE boards ADD COLUMN feature_id TEXT;
      ALTER TABLE lists  ADD COLUMN kind TEXT NOT NULL DEFAULT 'other';
      ALTER TABLE cards  ADD COLUMN eta_at INTEGER;
      ALTER TABLE cards  ADD COLUMN requirement TEXT;
      ALTER TABLE cards  ADD COLUMN acceptance_criteria TEXT;
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

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE workspaces SET name = ? WHERE id = ?`,
    [name, workspaceId],
  )
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
  // Verify the target is actually a member.
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
  feature_id: string | null
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
    featureId: r.feature_id ?? undefined,
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
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    featureId: r.feature_id ?? undefined,
    updatedAt: r.updated_at,
  }))
}

/**
 * Create a board and auto-seed the four canonical workflow lists
 * (New / In progress / Testing / Launched). Per the agreed "status IS the
 * list" model, every new board ships with the same starting columns.
 * Users can still rename or delete them — the `kind` column persists
 * regardless of title, so the cross-board My Tasks view keeps grouping
 * correctly.
 */
export async function createBoard(
  tenantId: string,
  name: string,
  featureId?: string,
): Promise<Board> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) throw new Error('Sign in required.')
  const id = rid()
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO boards (id, tenant_id, name, feature_id, archived, created_by, created_at, updated_at)
     VALUES (?,?,?,?,0,?,?,?)`,
    [id, tenantId, name, featureId ?? null, me.id, now, now],
  )
  // Seed four canonical workflow lists, spaced by 1024 so reorders never
  // collide with the seed positions.
  for (let i = 0; i < STATUS_KINDS.length; i++) {
    const kind = STATUS_KINDS[i]
    await app.db.execute(
      `INSERT INTO lists (id, tenant_id, board_id, title, position, archived, kind, created_at)
       VALUES (?,?,?,?,?,0,?,?)`,
      [rid(), tenantId, id, STATUS_LABEL[kind], (i + 1) * 1024, kind, now],
    )
  }
  return {
    id,
    tenantId,
    name,
    featureId,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

export async function setBoardFeature(
  tenantId: string,
  boardId: string,
  featureId: string | null,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE boards SET feature_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [featureId, Date.now(), boardId, tenantId],
  )
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
  // Cascade by hand — D1 doesn't enforce FK cascades. The subqueries scope
  // to `WHERE board_id = ?` rather than threading card_id lists through JS,
  // so cleanup is one round-trip per child table.
  const inCards = `card_id IN (SELECT id FROM cards WHERE board_id = ?)`
  await app.db.execute(`DELETE FROM mentions       WHERE ${inCards}`, [boardId])
  await app.db.execute(`DELETE FROM comments       WHERE ${inCards}`, [boardId])
  await app.db.execute(`DELETE FROM card_labels    WHERE ${inCards}`, [boardId])
  await app.db.execute(`DELETE FROM card_assignees WHERE ${inCards}`, [boardId])
  await app.db.execute(`DELETE FROM checklist_items WHERE ${inCards}`, [boardId])
  await app.db.execute(`DELETE FROM cards    WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM lists    WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM labels   WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM activity WHERE board_id = ? AND tenant_id = ?`, [boardId, tenantId])
  await app.db.execute(`DELETE FROM boards   WHERE id       = ? AND tenant_id = ?`, [boardId, tenantId])
}

// Full board (lists + cards + labels + assignees + checklist) ----------------

interface ListRow {
  id: string
  tenant_id: string
  board_id: string
  title: string
  position: number
  archived: number
  kind: ListKind
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
  requirement: string | null
  acceptance_criteria: string | null
  due_at: number | null
  eta_at: number | null
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
  const [boardQ, listsQ, cardsQ, labelsQ, cardLabelsQ, assigneesQ, checklistQ, commentCountQ] =
    await Promise.all([
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
      app.db.query<{ card_id: string; n: number }>(
        `SELECT c.card_id, COUNT(*) AS n
           FROM comments c
           JOIN cards cards ON cards.id = c.card_id
          WHERE c.tenant_id = ? AND cards.board_id = ? AND c.deleted_at IS NULL
          GROUP BY c.card_id`,
        [tenantId, boardId],
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

  const commentCountByCard = new Map<string, number>(
    commentCountQ.rows.map((r) => [r.card_id, Number(r.n)]),
  )

  const lists: List[] = listsQ.rows.map((lr) => ({
    id: lr.id,
    boardId: lr.board_id,
    title: lr.title,
    position: lr.position,
    kind: lr.kind,
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
      requirement: cr.requirement ?? undefined,
      acceptanceCriteria: cr.acceptance_criteria ?? undefined,
      dueAt: cr.due_at ?? undefined,
      etaAt: cr.eta_at ?? undefined,
      position: cr.position,
      labels: labelsByCard.get(cr.id) ?? [],
      checklist: checklistByCard.get(cr.id) ?? [],
      assignees: assigneesByCard.get(cr.id) ?? [],
      commentCount: commentCountByCard.get(cr.id) ?? 0,
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
  kind: ListKind = 'other',
): Promise<List> {
  await ensureMigrated()
  const id = rid()
  const position = between(afterPosition, null) // append at end
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO lists (id, tenant_id, board_id, title, position, archived, kind, created_at)
     VALUES (?,?,?,?,?,0,?,?)`,
    [id, tenantId, boardId, title, position, kind, now],
  )
  await touchBoard(tenantId, boardId)
  return { id, boardId, title, position, kind, cards: [] }
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
  const inCards = `card_id IN (SELECT id FROM cards WHERE list_id = ?)`
  await app.db.execute(`DELETE FROM mentions        WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM comments        WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM card_labels     WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM card_assignees  WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM checklist_items WHERE ${inCards}`, [listId])
  await app.db.execute(`DELETE FROM cards WHERE list_id = ? AND tenant_id = ?`, [listId, tenantId])
  await app.db.execute(`DELETE FROM lists WHERE id      = ? AND tenant_id = ?`, [listId, tenantId])
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
    commentCount: 0,
    createdBy: me.id,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export interface CardPatch {
  title?: string
  description?: string | null
  requirement?: string | null
  acceptanceCriteria?: string | null
  dueAt?: number | null
  etaAt?: number | null
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
  if (patch.requirement !== undefined) {
    sets.push('requirement = ?')
    params.push(patch.requirement)
  }
  if (patch.acceptanceCriteria !== undefined) {
    sets.push('acceptance_criteria = ?')
    params.push(patch.acceptanceCriteria)
  }
  if (patch.dueAt !== undefined) {
    sets.push('due_at = ?')
    params.push(patch.dueAt)
  }
  if (patch.etaAt !== undefined) {
    sets.push('eta_at = ?')
    params.push(patch.etaAt)
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
  await app.db.execute(`DELETE FROM mentions        WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM comments        WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM card_labels     WHERE card_id = ?`, [cardId])
  await app.db.execute(`DELETE FROM card_assignees  WHERE card_id = ?`, [cardId])
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

// Comments -------------------------------------------------------------------

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

// Mentions -------------------------------------------------------------------

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
    `SELECT COUNT(*) AS n FROM mentions
      WHERE tenant_id = ? AND mentioned_user_id = ? AND read_at IS NULL`,
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

// Activity feed --------------------------------------------------------------

interface ActivityRow {
  id: string
  tenant_id: string
  board_id: string
  card_id: string | null
  actor_id: string
  kind: string
  payload: string | null
  created_at: number
  // Joined:
  actor_display_name: string | null
  actor_avatar_url: string | null
}

function rowToActivity(r: ActivityRow): ActivityEntry {
  let payload: Record<string, unknown> = {}
  if (r.payload) {
    try {
      payload = JSON.parse(r.payload) as Record<string, unknown>
    } catch {
      payload = {}
    }
  }
  return {
    id: r.id,
    boardId: r.board_id,
    cardId: r.card_id ?? undefined,
    actorId: r.actor_id,
    actorDisplayName: r.actor_display_name ?? '(former member)',
    actorAvatarUrl: r.actor_avatar_url ?? undefined,
    kind: r.kind as ActivityKind,
    payload,
    createdAt: r.created_at,
  }
}

/**
 * Write an activity row. Fire-and-forget — activity is observability, not
 * a hard invariant; if it fails the parent mutation still succeeded.
 */
export async function logActivity(
  tenantId: string,
  boardId: string,
  kind: ActivityKind,
  payload: Record<string, unknown> = {},
  cardId?: string,
): Promise<void> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return
  try {
    await app.db.execute(
      `INSERT INTO activity (id, tenant_id, board_id, card_id, actor_id, kind, payload, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [rid(), tenantId, boardId, cardId ?? null, me.id, kind, JSON.stringify(payload), Date.now()],
    )
  } catch {
    /* swallow */
  }
}

export async function listBoardActivity(
  tenantId: string,
  boardId: string,
  limit = 50,
): Promise<ActivityEntry[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<ActivityRow>(
    `SELECT a.*, m.display_name AS actor_display_name, m.avatar_url AS actor_avatar_url
       FROM activity a
       LEFT JOIN members m ON m.tenant_id = a.tenant_id AND m.user_id = a.actor_id
      WHERE a.tenant_id = ? AND a.board_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?`,
    [tenantId, boardId, limit],
  )
  return rows.map(rowToActivity)
}

// Features -------------------------------------------------------------------

interface FeatureRow {
  id: string
  tenant_id: string
  name: string
  sort_order: number
  created_at: number
}

function rowToFeature(r: FeatureRow): Feature {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listFeatures(tenantId: string): Promise<Feature[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<FeatureRow>(
    `SELECT * FROM features WHERE tenant_id = ? ORDER BY sort_order, created_at`,
    [tenantId],
  )
  return rows.map(rowToFeature)
}

export async function createFeature(tenantId: string, name: string): Promise<Feature> {
  await ensureMigrated()
  const id = rid()
  const now = Date.now()
  // sort_order = next available; cheap to recompute on insert.
  const { rows: maxRows } = await app.db.query<{ n: number | null }>(
    `SELECT MAX(sort_order) AS n FROM features WHERE tenant_id = ?`,
    [tenantId],
  )
  const next = (Number(maxRows[0]?.n ?? 0) || 0) + 1
  await app.db.execute(
    `INSERT INTO features (id, tenant_id, name, sort_order, created_at) VALUES (?,?,?,?,?)`,
    [id, tenantId, name, next, now],
  )
  return { id, tenantId, name, sortOrder: next, createdAt: now }
}

export async function renameFeature(
  tenantId: string,
  featureId: string,
  name: string,
): Promise<void> {
  await ensureMigrated()
  await app.db.execute(
    `UPDATE features SET name = ? WHERE id = ? AND tenant_id = ?`,
    [name, featureId, tenantId],
  )
}

export async function deleteFeature(tenantId: string, featureId: string): Promise<void> {
  await ensureMigrated()
  // Boards under this feature get orphaned to "Ungrouped" (feature_id NULL).
  await app.db.execute(
    `UPDATE boards SET feature_id = NULL WHERE feature_id = ? AND tenant_id = ?`,
    [featureId, tenantId],
  )
  await app.db.execute(`DELETE FROM features WHERE id = ? AND tenant_id = ?`, [featureId, tenantId])
}

// My Tasks (cross-board, current user) ---------------------------------------

interface AssignedTaskRow {
  card_id: string
  card_title: string
  board_id: string
  board_name: string
  feature_id: string | null
  feature_name: string | null
  list_id: string
  list_title: string
  list_kind: ListKind
  due_at: number | null
  eta_at: number | null
  updated_at: number
}

/**
 * Every non-archived card assigned to the current user across all boards in
 * the workspace, joined with board / feature / list context so the My Tasks
 * view can render rows without per-card roundtrips. Ordered by list-kind
 * priority (new → wip → testing → launched → other) then updated_at desc.
 */
export async function listMyTasks(tenantId: string): Promise<AssignedTask[]> {
  await ensureMigrated()
  const me = app.auth.user
  if (!me) return []
  const { rows } = await app.db.query<AssignedTaskRow>(
    `SELECT
       c.id          AS card_id,
       c.title       AS card_title,
       b.id          AS board_id,
       b.name        AS board_name,
       b.feature_id  AS feature_id,
       f.name        AS feature_name,
       l.id          AS list_id,
       l.title       AS list_title,
       l.kind        AS list_kind,
       c.due_at      AS due_at,
       c.eta_at      AS eta_at,
       c.updated_at  AS updated_at
     FROM card_assignees ca
     JOIN cards c    ON c.id = ca.card_id
     JOIN boards b   ON b.id = c.board_id
     JOIN lists  l   ON l.id = c.list_id
     LEFT JOIN features f ON f.id = b.feature_id
     WHERE ca.tenant_id = ? AND ca.user_id = ?
       AND c.archived = 0 AND b.archived = 0 AND l.archived = 0
     ORDER BY
       CASE l.kind
         WHEN 'new' THEN 0
         WHEN 'wip' THEN 1
         WHEN 'testing' THEN 2
         WHEN 'launched' THEN 3
         ELSE 4
       END,
       c.updated_at DESC`,
    [tenantId, me.id],
  )
  return rows.map((r) => ({
    cardId: r.card_id,
    cardTitle: r.card_title,
    boardId: r.board_id,
    boardName: r.board_name,
    featureId: r.feature_id ?? undefined,
    featureName: r.feature_name ?? undefined,
    listId: r.list_id,
    listTitle: r.list_title,
    listKind: r.list_kind,
    dueAt: r.due_at ?? undefined,
    etaAt: r.eta_at ?? undefined,
    updatedAt: r.updated_at,
  }))
}

// Internal helpers ------------------------------------------------------------

async function touchBoard(tenantId: string, boardId: string): Promise<void> {
  await app.db.execute(
    `UPDATE boards SET updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [Date.now(), boardId, tenantId],
  )
}
