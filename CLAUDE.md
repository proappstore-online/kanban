# kanban (Pro)

Team kanban boards on ProAppStore — workspaces, members, drag-drop, realtime
presence, assignees, comments + @mentions, status/ETA/requirement/AC, board
filters, and quick-status change.

- Subdomain: `kanban.proappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build` _(runs platform `compliance check` first via prebuild — don't bypass with `--filter`)_
- Deploy: `git push origin main` (auto-deploys via Cloudflare Pages)

For platform conventions (tech stack, brand, mobile rules, deploy flow),
read the SKILLS.md before writing or changing anything:
https://raw.githubusercontent.com/proappstore-online/proappstore/main/SKILLS.md

## Repo-specific notes

- **Data Worker hostname workaround.** The platform provisioner currently
  deploys per-app data Workers at the `workers.dev` hostname only — the
  `data-<appId>.proappstore.online` DNS records aren't created at publish
  time. `web/src/lib/app.ts` overrides `dataApiBase` to the workers.dev
  URL. Sibling apps `dating` and `carsads` use the same workaround. Track
  the long-term fix in `pas/platform/PLATFORM-NOTES.md`.

- **Schema lives in code.** D1 migrations are an inline array in
  `web/src/lib/db/core.ts` and run lazily via `ensureMigrated()`. The
  data layer is split per-domain under `web/src/lib/db/` — see
  `db/index.ts` for the public surface.

- **No tests yet.** Realtime + multi-user flows are best tested with
  Playwright; punt until the next significant feature wave.
