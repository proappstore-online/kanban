import type { Feature } from '../../types'
import { ensureMigrated, rid } from './core'
import { q, x } from '../actions'

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
  const rows = await q<FeatureRow>('list_features', { tenant_id: tenantId })
  return rows.map(rowToFeature)
}

export async function createFeature(tenantId: string, name: string): Promise<Feature> {
  await ensureMigrated()
  const id = rid()
  const now = Date.now()
  // sort_order = next available; cheap to recompute on insert.
  const maxRows = await q<{ n: number | null }>('max_feature_sort_order', { tenant_id: tenantId })
  const next = (Number(maxRows[0]?.n ?? 0) || 0) + 1
  await x('create_feature', { id, tenant_id: tenantId, name, sort_order: next })
  return { id, tenantId, name, sortOrder: next, createdAt: now }
}

export async function renameFeature(
  tenantId: string,
  featureId: string,
  name: string,
): Promise<void> {
  await ensureMigrated()
  await x('rename_feature', { tenant_id: tenantId, feature_id: featureId, name })
}

export async function deleteFeature(tenantId: string, featureId: string): Promise<void> {
  await ensureMigrated()
  // Boards under this feature get orphaned to "Ungrouped" (feature_id NULL),
  // then the feature is deleted — one atomic action.
  await x('delete_feature', { tenant_id: tenantId, feature_id: featureId })
}
