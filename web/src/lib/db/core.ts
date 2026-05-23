import { app } from '../app'

/**
 * Schema migrations. The data-worker's migrate endpoint tracks applied
 * migrations by `name` in a meta table, so adding new entries here is
 * safe — existing apps run only the new ones on next call.
 *
 * Conventions:
 * - Every multi-tenant table carries `tenant_id` (= workspaces.id).
 * - `CREATE TABLE IF NOT EXISTS` is mandatory; this lets a single
 *   migration be replayed without exploding if the runner ever gets
 *   into an odd state.
 * - `ALTER TABLE` is allowed only in dedicated migrations and only
 *   forward (D1 / SQLite can't drop columns cleanly).
 */
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
  {
    name: '0004_stars_covers_watchers',
    sql: `
      CREATE TABLE IF NOT EXISTS starred_boards (
        tenant_id TEXT NOT NULL,
        board_id  TEXT NOT NULL,
        user_id   TEXT NOT NULL,
        starred_at INTEGER NOT NULL,
        PRIMARY KEY (board_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_starred_user ON starred_boards(tenant_id, user_id);

      ALTER TABLE cards ADD COLUMN cover_url TEXT;

      CREATE TABLE IF NOT EXISTS card_watchers (
        tenant_id  TEXT NOT NULL,
        card_id    TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        watched_at INTEGER NOT NULL,
        PRIMARY KEY (card_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_watchers_card ON card_watchers(card_id);
      CREATE INDEX IF NOT EXISTS idx_watchers_user ON card_watchers(tenant_id, user_id);
    `,
  },
  {
    name: '0005_custom_fields',
    sql: `
      CREATE TABLE IF NOT EXISTS custom_fields (
        id         TEXT PRIMARY KEY,
        tenant_id  TEXT NOT NULL,
        board_id   TEXT NOT NULL,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL DEFAULT 'text',
        options    TEXT,
        position   REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_custom_fields_board ON custom_fields(tenant_id, board_id, position);

      CREATE TABLE IF NOT EXISTS card_field_values (
        tenant_id TEXT NOT NULL,
        card_id   TEXT NOT NULL,
        field_id  TEXT NOT NULL,
        value     TEXT,
        PRIMARY KEY (card_id, field_id)
      );
      CREATE INDEX IF NOT EXISTS idx_card_field_values_field ON card_field_values(field_id);
    `,
  },
]

let migrated = false

/**
 * Idempotent migration runner. Each db/<module>.ts function calls this
 * before its first SQL; subsequent calls are no-ops (the `migrated` flag
 * + the data-worker's own meta table both guard against double-applies).
 */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return
  await app.db.migrate(MIGRATIONS)
  migrated = true
}

/** UUIDv4 row IDs. Centralised so the implementation can swap without sed. */
export function rid(): string {
  return crypto.randomUUID()
}
