import { z } from 'zod'
import { positiveDecimalSchema } from '@/lib/decimal'

const id = z.uuid()
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/)
export const customerReturnSchema = z.object({
  shipment_line_id: id, shipment_revision: z.number().int().positive(), location_id: id,
  return_number: code, lot_code: code, quantity: positiveDecimalSchema,
  uom: z.enum(['pcs', 'kg', 'm', 'set']),
  reference: z.string().trim().min(1).max(160), reason: z.string().trim().min(1).max(2000),
})
export type CustomerReturnInput = z.input<typeof customerReturnSchema>
export const customerReturnWorkspaceSchema = z.object({
  shipments: z.array(z.object({
    id, shipment_number: z.string(), shipment_revision: z.number().int().positive(),
    sales_order_number: z.string(), customer_name: z.string(), item_id: id, sku: z.string(),
    source_lot_id: id, source_lot_code: z.string(), shipped_quantity: z.string(),
    returned_quantity: z.string(), returnable_quantity: z.string(), uom: z.enum(['pcs', 'kg', 'm', 'set']),
  })),
  receipts: z.array(z.object({
    id, shipment_line_id: id, lot_id: id, lot_code: z.string(), return_number: z.string(),
    quantity: z.string(), uom: z.string(), reference: z.string(), reason: z.string(),
    qc_status: z.string(), created_at: z.string(),
  })),
})
export type CustomerReturnWorkspace = z.infer<typeof customerReturnWorkspaceSchema>
