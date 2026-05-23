import { app } from '../app'
import type { CustomField, CustomFieldKind } from '../../types'
import { between } from '../frac'
import { ensureMigrated, rid } from './core'

interface FieldRow {
  id: string
  tenant_id: string
  board_id: string
  name: string
  kind: CustomFieldKind
  options: string | null
  position: number
  created_at: number
}

function rowToField(r: FieldRow): CustomField {
  return {
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    kind: r.kind,
    options: r.options ?? undefined,
    position: r.position,
  }
}

export async function listCustomFields(tenantId: string, boardId: string): Promise<CustomField[]> {
  await ensureMigrated()
  const { rows } = await app.db.query<FieldRow>(
    `SELECT * FROM custom_fields WHERE tenant_id = ? AND board_id = ? ORDER BY position`,
    [tenantId, boardId],
  )
  return rows.map(rowToField)
}

export async function createCustomField(
  tenantId: string,
  boardId: string,
  name: string,
  kind: CustomFieldKind = 'text',
  options?: string,
  afterPosition?: number | null,
): Promise<CustomField> {
  await ensureMigrated()
  const id = rid()
  const position = between(afterPosition ?? null, null)
  const now = Date.now()
  await app.db.execute(
    `INSERT INTO custom_fields (id, tenant_id, board_id, name, kind, options, position, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, tenantId, boardId, name, kind, options ?? null, position, now],
  )
  return { id, boardId, name, kind, options, position }
}

export async function updateCustomField(
  tenantId: string,
  fieldId: string,
  patch: { name?: string; kind?: CustomFieldKind; options?: string | null },
): Promise<void> {
  await ensureMigrated()
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name) }
  if (patch.kind !== undefined) { sets.push('kind = ?'); params.push(patch.kind) }
  if (patch.options !== undefined) { sets.push('options = ?'); params.push(patch.options) }
  if (sets.length === 0) return
  params.push(fieldId, tenantId)
  await app.db.execute(
    `UPDATE custom_fields SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`,
    params,
  )
}

export async function deleteCustomField(tenantId: string, fieldId: string): Promise<void> {
  await ensureMigrated()
  await app.db.execute(`DELETE FROM card_field_values WHERE field_id = ? AND tenant_id = ?`, [fieldId, tenantId])
  await app.db.execute(`DELETE FROM custom_fields WHERE id = ? AND tenant_id = ?`, [fieldId, tenantId])
}

export async function setCardFieldValue(
  tenantId: string,
  cardId: string,
  fieldId: string,
  value: string | null,
): Promise<void> {
  await ensureMigrated()
  if (value === null || value === '') {
    await app.db.execute(
      `DELETE FROM card_field_values WHERE card_id = ? AND field_id = ? AND tenant_id = ?`,
      [cardId, fieldId, tenantId],
    )
  } else {
    await app.db.execute(
      `INSERT INTO card_field_values (tenant_id, card_id, field_id, value)
       VALUES (?,?,?,?)
       ON CONFLICT(card_id, field_id) DO UPDATE SET value = ?`,
      [tenantId, cardId, fieldId, value, value],
    )
  }
}
