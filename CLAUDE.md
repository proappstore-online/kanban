# kanban (Pro)

Team kanban boards on ProAppStore — workspaces, members, drag-drop, realtime
presence, assignees, comments + @mentions, status/ETA/requirement/AC, board
filters, text search, dark mode, and quick-status change.

- Subdomain: `kanban.proappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build` _(runs platform `compliance check` first via prebuild — don't bypass with `--filter`)_
- Deploy: `git push origin main` (auto-deploys via Cloudflare Pages)
- Tests: `pnpm --filter @kanban/web test:e2e` (35 Playwright tests)

For platform conventions (tech stack, brand, mobile rules, deploy flow),
read the SKILLS.md before writing or changing anything:
https://raw.githubusercontent.com/proappstore-online/proappstore/main/SKILLS.md

## Repo-specific notes

- **Schema lives in code.** D1 migrations are an inline array in
  `web/src/lib/db/core.ts` and run lazily via `ensureMigrated()`. The
  data layer is split per-domain under `web/src/lib/db/` — see
  `db/index.ts` for the public surface.

- **SDK hooks.** App uses `useProAuth` from `@proappstore/sdk/hooks`.
  Theme preference stored under `fas:theme` (platform convention).
  `useTheme` not yet published in SDK 1.9.0 — custom code aligned
  to the same localStorage key for forward-compat.

- **Invite links are reusable.** Multiple people can join with the same
  link until it expires (7 days) or is revoked. The invite hash is
  saved to `sessionStorage` before OAuth redirect and restored after
  `auth.init()` to survive the sign-in flow.

- **Launched column cap.** The "Launched" (done) list shows only 10
  cards by default with an expand toggle, keeping the board fast.
