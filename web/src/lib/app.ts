import { initPro } from '@proappstore/sdk'

// The platform's current provisioner deploys per-app data Workers at the
// `workers.dev` hostname; the `data-*.proappstore.online` DNS records aren't
// created yet. Sibling apps `dating` and `carsads` use the same workaround.
// See `pas/platform/PLATFORM-NOTES.md` for the long-term fix (CNAME on publish).
export const app = initPro({
  appId: 'kanban',
  dataApiBase: 'https://pas-data-kanban.serge-the-dev.workers.dev',
})
