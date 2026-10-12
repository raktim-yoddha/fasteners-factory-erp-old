import { z } from 'zod'
import { positiveDecimalSchema } from '@/lib/decimal'

const id = z.uuid()
export const shipmentPackageSchema = z.object({
  shipment_line_id: id, shipment_revision: z.number().int().positive(), quantity: positiveDecimalSchema,
  uom: z.enum(['pcs', 'kg', 'm', 'set', 'box', 'bundle']), conversion_id: id.nullable().optional(), package_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9/-]{2,63}$/),
})
export type ShipmentPackageInput = z.input<typeof shipmentPackageSchema>
export const packingWorkspaceSchema = z.object({
  lines: z.array(z.object({
    id, shipment_id: id, shipment_number: z.string(), shipment_revision: z.number().int().positive(),
    status: z.enum(['draft', 'dispatched', 'cancelled']), lot_id: id, lot_code: z.string(), sku: z.string(),
    item_id: id.optional(), item_specification_id: id.nullable().optional(),
    customer_part_number: z.string().nullable().optional(), customer_part_revision: z.string().nullable().optional(),
    quantity: z.string(), uom: z.enum(['pcs', 'kg', 'm', 'set']), packaged_quantity: z.string(), remaining_quantity: z.string(),
  })),
  packages: z.array(z.object({ id, shipment_line_id: id, package_code: z.string(), quantity: z.string(), uom: z.string(), created_at: z.string(), input_quantity: z.string().nullable().optional(), input_uom: z.string().nullable().optional() })),
})
export type PackingWorkspace = z.infer<typeof packingWorkspaceSchema>
