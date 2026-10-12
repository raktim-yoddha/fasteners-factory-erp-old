import { z } from 'zod'
import { positiveDecimalSchema } from '@/lib/decimal'

const id = z.uuid()
const revision = z.number().int().positive()
const unit = z.enum(['pcs', 'kg', 'm', 'set'])
const reason = z.string().trim().min(1).max(2000)
const number = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/)
const order = { order_id: id, revision, reason }
const movement = { ...order, quantity: positiveDecimalSchema, uom: unit, reference: z.string().trim().min(1).max(160) }
export const vendorCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: z.object({
    lot_id: id, supplier_id: id, number, process: z.string().trim().min(1).max(160),
    quantity: positiveDecimalSchema, uom: unit, due_date: z.string().date(),
  }) }),
  z.object({ action: z.literal('send'), data: z.object({ ...movement, lot_revision: revision }) }),
  z.object({ action: z.literal('receive'), data: z.object({
    ...movement, location_id: id, lot_code: number, certificate_reference: z.string().trim().max(1000),
  }) }),
  z.object({ action: z.literal('loss'), data: z.object(movement) }),
  z.object({ action: z.literal('close'), data: z.object({ ...order, cancel_unsent: z.boolean() }) }),
  z.object({ action: z.literal('cancel'), data: z.object(order) }),
])
export type VendorCommand = z.input<typeof vendorCommandSchema>
const quantity = z.string()
export const vendorWorkspaceSchema = z.object({
  orders: z.array(z.object({
    id, number: z.string(), supplier_id: id, source_lot_id: id, item_id: id, process: z.string(),
    due_date: z.string().date(), status: z.enum(['draft', 'open', 'closed', 'cancelled']), revision,
    quantity, uom: unit, sent_quantity: quantity, returned_quantity: quantity, loss_quantity: quantity,
    at_vendor_quantity: quantity, remaining_to_send: quantity, cancelled_unsent_quantity: quantity,
    close_reason: z.string().nullable(),
  })),
  events: z.array(z.object({
    id, vendor_order_id: id, kind: z.enum(['send', 'return', 'loss']), quantity_delta: quantity, uom: unit,
    output_lot_id: id.nullable(), reference: z.string(), certificate_reference: z.string().nullable(),
    reason: z.string(), created_at: z.string(),
  })),
})
export type VendorWorkspace = z.infer<typeof vendorWorkspaceSchema>
