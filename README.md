# Kanban Pro

Team kanban boards with real-time collaboration on [ProAppStore](https://proappstore.online).

Workspaces, member invites, assigned cards, drag-and-drop, and live presence — everyone on
the same board sees the same board at the same time.

Live: <https://kanban.proappstore.online>

- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Deploy: `git push origin main`

MIT-licensed. Part of [ProAppStore](https://proappstore.online).

## Marketing

Public product site: <https://about-kanban.proappstore.online/>. Edit product copy in `marketing/src/site.ts`. `pnpm build:marketing` builds three static brochure pages and crawl files; `PAS_MARKETING_PREVIEW=true pnpm build:marketing` produces a separate noindex artifact. `pnpm test:marketing` verifies production/preview output. Main CI runs this and the existing local mocked browser suite through the required runner router.
