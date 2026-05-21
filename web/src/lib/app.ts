import { initPro } from '@proappstore/sdk'

// Temporary override pending platform redeploy. The platform fix that
// attaches data-<appId>.proappstore.online as a Worker custom domain on
// publish has shipped (proappstore-online/platform 043c2a4) but the PAS
// backend Worker has not been redeployed yet, and `pas publish` hasn't
// been re-run for kanban. To drop this override:
//   1. wrangler deploy the PAS backend
//   2. pas publish (from this repo root) — idempotent; attaches the domain
//   3. confirm `curl https://data-kanban.proappstore.online/tables` resolves
//   4. delete the dataApiBase line below — the SDK defaults to it anyway
export const app = initPro({
  appId: 'kanban',
  dataApiBase: 'https://pas-data-kanban.serge-the-dev.workers.dev',
})
