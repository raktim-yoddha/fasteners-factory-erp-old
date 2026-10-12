import type { CommandContext } from './context'
import type { Row } from './database'

export function lotTrace(c: CommandContext, lotId: unknown, path = new Set<unknown>()): { requires_final: boolean; signatures: Row[]; work_order_ids: unknown[]; sales_order_line_id: unknown } {
  if (path.has(lotId)) throw new Error('GENEALOGY_CYCLE')
  const next = new Set(path).add(lotId)
  const links = c.rows('lot_genealogy', { child_lot_id: lotId }).filter((row) => row.transformation_id || row.vendor_receipt_id || row.customer_return_id)
  const contexts = links.map((row) => lotTrace(c, row.parent_lot_id, next))
  const output = c.rows('production_outputs', { lot_id: lotId })[0]
  const work = output ? c.one('work_orders', output.work_order_id) : null
  const signatures = contexts.length ? contexts.flatMap((row) => row.signatures) : [{ kind: work ? 'final' : 'incoming', bom: work?.bom_revision_id ?? null, routing: work?.routing_revision_id ?? null, drawing: work?.drawing_revision_id ?? null, sales_line: work?.sales_order_line_id ?? null, specification: work?.item_specification_id ?? null, customer_part: work?.customer_part_reference_id ?? null }]
  const unique = [...new Map(signatures.map((row) => [JSON.stringify(row), row])).values()]
  return { requires_final: Boolean(work) || contexts.some((row) => row.requires_final) || c.rows('customer_return_receipts', { lot_id: lotId }).length > 0, signatures: unique, work_order_ids: [...new Set([...(work ? [work.id] : []), ...contexts.flatMap((row) => row.work_order_ids)])], sales_order_line_id: unique.length === 1 ? unique[0]!.sales_line : null }
}
