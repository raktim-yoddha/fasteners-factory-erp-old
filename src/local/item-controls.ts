import { itemControlCommandSchema } from '@/features/master-data/itemControlsContract'
import { customerPartCommandSchema } from '@/features/master-data/customerPartsContract'
import { z } from 'zod'
import { type CommandHandler } from './context'
import { decimal, quantity } from './exact'
import type { Row } from './database'

export const itemControlCommands: Record<string, CommandHandler> = {
  item_control_command(c, a) {
    const command = itemControlCommandSchema.parse({ action: a.p_action, data: a.p_data }), d = command.data as Row
    const table = command.action.includes('specification') ? 'item_specification_versions' : 'item_unit_conversions'
    let result: Row
    if (command.action.startsWith('create_')) {
      const item = c.one('items', d.item_id)
      const previous = c.rows(table, { item_id: item.id })
      const values: Row = { ...d, version: Math.max(0, ...previous.map((row) => Number(row.version))) + 1 }
      if (table === 'item_specification_versions') for (const key of ['diameter_mm', 'length_mm', 'thread_pitch_mm']) values[key] = values[key] || null
      else {
        values.to_uom = item.base_uom
        if (values.from_uom === item.base_uom) throw new Error('CONVERSION_NOT_NEEDED')
        quantity(values.to_quantity, item.base_uom)
      }
      result = c.insert(table, values)
    } else {
      result = c.one(table, d.id)
      if (command.action.startsWith('approve_')) {
        c.state(result, 'draft')
        c.update(table, result, { status: 'approved', approved_by: c.actor, approved_at: new Date().toISOString() })
      } else {
        c.state(result, 'approved'); c.update(table, result, { status: 'retired', retired_by: c.actor, retired_at: new Date().toISOString(), retirement_reason: d.reason })
      }
    }
    c.audit(table, result.id, command.action, d.reason ?? d.evidence); return result.id
  },
  create_customer_part_reference(c, a) {
    const { data: d } = customerPartCommandSchema.options[0].parse({ action: 'create', data: a.p_data })
    c.one('customers', d.customer_id); c.one('items', d.item_id)
    if (d.drawing_revision_id) {
      const drawing = c.one('drawing_revisions', d.drawing_revision_id); c.state(drawing, 'approved')
      if (c.one('drawings', drawing.drawing_id).item_id !== d.item_id) throw new Error('CUSTOMER_PART_DRAWING_MISMATCH')
    }
    const previous = c.rows('customer_item_references', { customer_id: d.customer_id, part_number: d.part_number, part_revision: d.part_revision })
    if (previous.some((row) => !row.retired_at)) throw new Error('CUSTOMER_PART_ALREADY_ACTIVE')
    const row = c.insert('customer_item_references', { ...d, reference_version: previous.length + 1 })
    c.audit('customer_item_references', row.id, 'customer_part_created', d.reason); return row.id
  },
  retire_customer_part_reference(c, a) {
    const row = c.one('customer_item_references', a.p_reference_id)
    if (row.retired_at) throw new Error('INVALID_TRANSITION')
    c.update('customer_item_references', row, { retired_by: c.actor, retired_at: new Date().toISOString(), retirement_reason: c.reason(a.p_reason) }); c.audit('customer_item_references', row.id, 'customer_part_retired', a.p_reason); return row.id
  },
  create_drawing_revision(c, a) {
    c.one('drawings', a.p_drawing_id)
    const row = c.insert('drawing_revisions', { drawing_id: a.p_drawing_id, revision: z.string().trim().min(1).max(24).parse(a.p_revision) })
    c.audit('drawing_revisions', row.id, 'drawing_revision_created', c.reason(a.p_reason)); return row.id
  },
  approve_drawing_revision(c, a) {
    const row = c.one('drawing_revisions', a.p_revision_id); c.state(row, 'draft')
    const file = c.rows('drawing_documents', { drawing_revision_id: row.id, status: 'ready' })[0]
    if (!file) throw new Error('DRAWING_DOCUMENT_REQUIRED')
    c.update('drawing_revisions', row, { status: 'approved', approved_at: new Date().toISOString(), approved_by: c.actor, file_path: file.object_path, checksum: file.sha256 })
    c.audit('drawing_revisions', row.id, 'drawing_owner_approved', c.reason(a.p_reason)); return row.id
  },
}
export function validateMaster(table: string, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (key.endsWith('_id')) { if (value !== null) z.uuid().parse(value) }
    else if (['reorder_quantity'].includes(key)) { if (value !== null && decimal(value) < 0n) throw new Error('INVALID_QUANTITY') }
    else if (key === 'base_uom') z.enum(['pcs', 'kg', 'm', 'set']).parse(value)
    else if (value !== null) z.string().trim().max(2000).parse(value)
  }
  if ('sku' in data) z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{1,63}$/).parse(data.sku)
  if ('code' in data) z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/).parse(data.code)
  if ('name' in data) z.string().trim().min(1).max(160).parse(data.name)
  if (table === 'items' && 'description' in data) z.string().trim().min(1).max(500).parse(data.description)
}
