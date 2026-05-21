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

## v1.5 (not yet built)

- Per-card comments + mentions + in-app notifications.
- Attachments via `app.storage`.
- Email invites via `app.notifications.email`.
- Import-from-FAS button (pull boards from the FAS KV `board:<id>` blobs).
- Activity feed UI (rows are already written to the `activity` table — just no view).
- Per-board ACL (board-level guest membership).

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
