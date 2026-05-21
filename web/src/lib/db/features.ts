import { app } from '../app'
import type { Feature } from '../../types'
import { ensureMigrated, rid } from './core'

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
