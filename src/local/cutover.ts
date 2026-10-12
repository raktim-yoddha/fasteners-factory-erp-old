import { z } from 'zod'
import type { CommandContext } from './context'
import { decimal } from './exact'

export const cutoverMasterTables = ['plants', 'customers', 'suppliers', 'items', 'warehouses', 'stock_locations', 'work_centres', 'drawings', 'drawing_revisions', 'boms', 'bom_revisions', 'bom_lines', 'routings', 'routing_revisions', 'routing_operations', 'engineering_packages', 'inspection_plans', 'item_specification_versions', 'item_unit_conversions', 'customer_item_references', 'equipment_assets', 'inspection_plan_gauges'] as const
export const cutoverReceiptSchema = z.object({ id: z.uuid(), company_id: z.uuid(), workspace_id: z.uuid(), snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['committed', 'aborted']), created_at: z.string() })
export type CutoverReceipt = z.infer<typeof cutoverReceiptSchema>
export function cutoverPreview(c: CommandContext) {
  const blockers: string[] = []
  for (const [table, label, complete] of [
    ['sales_orders', 'Sales order', ['fulfilled', 'cancelled']], ['work_orders', 'Work order', ['closed']],
    ['ncrs', 'NCR', ['resolved']], ['shipments', 'Shipment', ['dispatched', 'cancelled']], ['vendor_orders', 'Vendor order', ['closed', 'cancelled']],
  ] as const) for (const row of c.rows(table)) if (!(complete as readonly string[]).includes(String(row.status))) blockers.push(`${label} ${row.number ?? row.sales_order_number ?? row.shipment_number ?? row.id} is ${row.status}.`)
  if (c.rows('stock_reservations', { status: 'active' }).some((row) => decimal(row.quantity) > decimal(row.consumed_quantity))) blockers.push('Release or fulfill active stock reservations.')
  if (c.rows('material_issues').some((issue) => decimal(issue.quantity) > c.rows('material_events', { issue_id: issue.id }).reduce((sum, row) => sum + decimal(row.quantity), 0n))) blockers.push('Consume or return all outstanding WIP.')
  if (c.rows('stock_count_proposals', { status: 'proposed' }).length) blockers.push('Pending stock counts require reconciliation; they cannot become an independent team approval.')
  const masters = Object.fromEntries(cutoverMasterTables.map((table) => [table, c.rows(table).map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !['company_id', 'created_by', 'approved_by', 'retired_by', 'reviewed_by', 'created_at', 'updated_at', 'approved_at', 'retired_at', 'retirement_reason', 'file_path', 'checksum'].includes(key))))]))
  const openings = c.rows('stock_lots').map((lot) => ({ source_lot_id: lot.id, item_id: lot.item_id, location_id: lot.location_id, lot_code: lot.lot_code, quantity: String(c.position(lot.id).on_hand), uom: String(c.one('items', lot.item_id).base_uom) })).filter((row) => decimal(row.quantity) > 0n)
  return { blockers, masters, openings, source_company_id: c.companyId }
}
