import type { CustomField, CustomFieldKind } from '../../types'
import { between } from '../frac'
import { ensureMigrated, rid } from './core'
import { q, x } from '../actions'

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
  const rows = await q<FieldRow>('list_custom_fields', { tenant_id: tenantId, board_id: boardId })
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
  await x('create_custom_field', {
    id,
    tenant_id: tenantId,
    board_id: boardId,
    name,
    kind,
    options: options ?? null,
    position,
  })
  return { id, boardId, name, kind, options, position }
}

export async function updateCustomField(
  tenantId: string,
  fieldId: string,
  patch: { name?: string; kind?: CustomFieldKind; options?: string | null },
): Promise<void> {
  await ensureMigrated()
  if (patch.name === undefined && patch.kind === undefined && patch.options === undefined) return
  // name/kind are non-nullable → COALESCE handles "skip"; options is nullable
  // so it uses an explicit *_set flag to distinguish skip from clear.
  await x('update_custom_field', {
    tenant_id: tenantId,
    field_id: fieldId,
    name: patch.name ?? null,
    kind: patch.kind ?? null,
    options: patch.options ?? null,
    options_set: patch.options !== undefined ? 1 : 0,
  })
}

export async function deleteCustomField(tenantId: string, fieldId: string): Promise<void> {
  await ensureMigrated()
  // Delete the field and its stored values — one atomic action.
  await x('delete_custom_field', { tenant_id: tenantId, field_id: fieldId })
}

export async function setCardFieldValue(
  tenantId: string,
  cardId: string,
  fieldId: string,
  value: string | null,
): Promise<void> {
  await ensureMigrated()
  if (value === null || value === '') {
    await x('clear_card_field_value', { tenant_id: tenantId, card_id: cardId, field_id: fieldId })
  } else {
    await x('set_card_field_value', { tenant_id: tenantId, card_id: cardId, field_id: fieldId, value })
  }
}
