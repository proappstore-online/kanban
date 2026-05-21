# kanban (Pro)

Team kanban boards on ProAppStore — workspaces, members, invite links, drag-drop,
assignees, and real-time presence + patch broadcast.

- Subdomain: `kanban.proappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Deploy: `git push origin main` (auto-deploys via Cloudflare Pages)

For platform conventions, read
https://proappstore.online/skills.md
before writing or changing anything.

## v1 scope (shipped)

- Workspaces (tenant unit), member roles (owner/admin/member/guest), invite-link redemption.
- Boards belong to workspaces; all workspace members can edit (no per-board ACL yet).
- Lists + cards with fractional positions for cheap reorders.
- Drag-drop within and across lists via `@dnd-kit`.
- Per-card labels, due dates, checklists, **assignees**.
- Real-time **presence avatars** (who's looking at this board) + patch broadcasts on
  card create/move/update/delete and list create/rename/delete. One Durable Object room
  per board (`board:<id>`).
- No Pro paywall: per the platform decision, all Pro apps are unlocked pre-launch.

## v1.5 (shipped)

- **Comments** on cards with realtime broadcast (`card.comment-added` /
  `card.comment-deleted` patches). Soft delete (`deleted_at`) preserves the
  activity-feed audit trail.
- **@mentions** in comment bodies. `parseMentions` resolves `@<login>` tokens
  against the workspace member list; matched users get a row in `mentions`
  with an unread state.
- **Mentions inbox bell** in the board's TopBar — unread count, dropdown of
  recent mentions across the workspace, mark-as-read on click, "Mark all read"
  shortcut. Polls every 30s.
- **Activity feed drawer** on the board view. Each mutation (card create /
  move / update / delete / assign, comment add, list create / rename / delete,
  board rename) writes an `activity` row + broadcasts `activity.added`; the
  drawer refetches the last 50 entries with a human-readable summary line.
- **Comment-count chip** on the card preview.

## v2 (shipped) — PO portfolio model

The PO's working model maps onto Kanban Pro as:
**Workspace = team → Features (Free apps / Games / Premium apps) → Epics
(boards, one per app) → Stories (cards).**

- **Features**: top-level groupings inside a workspace (managed in
  Settings). Boards optionally belong to one feature; the Boards page
  renders boards bucketed by feature with an "Ungrouped" fallback. Moving a
  board between features is a hover-dropdown on the card.
- **Status as list-kind**: every new board auto-seeds four canonical lists
  — New / In progress / Testing / Launched — each tagged with a stable
  `kind` column. The list title can be renamed freely; the `kind` persists
  and drives the colored status pill on card previews + the My Tasks
  filter. Older boards (or user-added columns) get `kind='other'` and
  render without a pill.
- **Requirement & Acceptance Criteria**: two new long-text fields on cards
  (sitting alongside Description in the modal).
- **ETA vs Due date**: separate fields. `dueAt` is the hard deadline,
  `etaAt` is the current best-estimate ship date. When ETA > deadline the
  ETA chip turns red ("at risk") — the gap between the two is the slip
  signal.
- **My Tasks** view (`#/w/<id>/my`): every card across the workspace
  assigned to the current user, grouped by epic (board) with the parent
  feature label, filterable by status. SQL does the join and prioritises
  by `new → wip → testing → launched → other`.

## v3 (not yet built)

- Attachments via `app.storage`.
- Email invites via `app.notifications.email`.
- Import-from-FAS button (pull boards from the FAS KV `board:<id>` blobs).
- Per-board ACL (board-level guest membership).
- Workspace-level mentions room push (replace 30s polling).
- Status changes via dropdown on the card preview (without dragging across lists).

## Architecture

```
web/src/
├── App.tsx                     auth gate + workspace gate + hash routing
├── lib/
│   ├── app.ts                  initPro singleton (uses workers.dev data hostname)
│   ├── db.ts                   D1 migrations + typed CRUD (workspaces, members,
│   │                           invites, boards, lists, cards, labels, assignees,
│   │                           checklists, activity)
│   ├── realtime.ts             useBoardRoom() — peers + broadcast/onPatch
│   └── frac.ts                 fractional position math for lists & cards
├── pages/
│   ├── SignIn.tsx              GitHub sign-in
│   ├── Onboarding.tsx          first-time, create first workspace
│   ├── Workspaces.tsx          workspace picker
│   ├── Boards.tsx              board list inside a workspace
│   ├── Board.tsx               lists + cards + drag-drop + realtime
│   ├── Settings.tsx            members + invite links
│   └── AcceptInvite.tsx        redeem an invite code
├── components/
│   ├── TopBar.tsx              brand + back + center + right slot
│   ├── PresenceBar.tsx         live avatar stack (RoomPeer[])
│   ├── ListColumn.tsx
│   ├── CardItem.tsx            includes assignee avatar stack
│   ├── CardModal.tsx           assignees + labels + checklist + due
│   └── MemberPicker.tsx
└── types.ts
```

## Data model

D1 tables, all tenant-scoped except `workspaces` itself. Every multi-tenant table
carries `tenant_id` (= `workspaces.id`). Migrations live inline in `lib/db.ts` and run
lazily via `ensureMigrated()`.

```
workspaces                  (id, slug, name, owner_user_id, created_at)
members                     (tenant_id, user_id, role, display_name, …)
invites                     (tenant_id, code, role, expires_at, accepted_*)
boards                      (tenant_id, name, background, archived, …)
lists                       (tenant_id, board_id, title, position REAL, archived)
cards                       (tenant_id, board_id, list_id, position REAL,
                             title, description, due_at, version, …)
labels                      (tenant_id, board_id, color, name)
card_labels                 (card_id, label_id)
card_assignees              (tenant_id, card_id, user_id, …)
checklist_items             (tenant_id, card_id, text, done, position)
activity                    (tenant_id, board_id, card_id?, actor_id, kind, payload)
```

Positions are `REAL` for fractional indexing — reorders only update one row.
`rebalance` not yet wired (positions are spaced 1024 apart so collision is rare).

## Realtime

D1 is the source of truth. Each mutation:

1. Optimistic local state update.
2. D1 write via the appropriate `lib/db.ts` function.
3. `broadcast(patch)` to the per-board room.

Other peers receive the patch and either update local state directly (for trivial
patches like `board.renamed` and `list.renamed`) or refetch the whole board
(everything else). The full-refetch fallback is intentionally simple for v1 — D1 is
fast and boards are small. Surgical patches are easy to add later.

Room limits (enforced by the platform):
- 32 peers per board room
- 64 active rooms per app (LRU evicts oldest)
- 4KB per message — board patches are well under this

## Data Worker hostname workaround

The platform provisioner currently deploys per-app data Workers at the
`workers.dev` hostname only — the `data-<appId>.proappstore.online` DNS records
aren't created at publish time. `lib/app.ts` overrides `dataApiBase` with
`https://pas-data-kanban.serge-the-dev.workers.dev`. Sibling apps `dating` and
`carsads` use the same workaround. Long-term fix: the publish flow should
CNAME `data-<appId>` automatically — track in `pas/platform/PLATFORM-NOTES.md`.

## Tests

None yet for v1. The FAS kanban had no tests either; the realtime + multi-user
flow really wants Playwright-driven integration tests before more behaviour
lands — punt to v1.5 alongside per-card comments.
