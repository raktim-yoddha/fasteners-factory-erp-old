import { transferCommandSchema } from '@/features/data-transfer/dataTransferContract'
import { importRowSchemas, type ImportKind } from '@/features/data-transfer/importCsv'
import { plantDate } from '@/lib/decimal'
import { type CommandHandler, type CommandContext } from './context'
import { stockCommands } from './stock'
import { format, decimal, multiply, sumAmounts } from './exact'
import type { Row } from './database'

function validateRows(c: CommandContext, kind: ImportKind, rows: Row[]) {
  const seen = new Set(), errors: { row: number; message: string }[] = []
  rows.forEach((row, index) => {
    const parsed = importRowSchemas[kind].safeParse(row)
    try {
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join('; '))
      const key = String(row[kind === 'items' ? 'sku' : kind === 'opening_stock' ? 'lot_code' : 'code']).toUpperCase()
      if (seen.has(key)) throw new Error('Duplicate identifier in this import.')
      seen.add(key)
      if (kind === 'opening_stock') {
        const item = c.rows('items', { sku: row.sku, active: true })[0], locations = c.rows('stock_locations', { code: row.location_code, active: true })
        if (!item || locations.length !== 1) throw new Error('Choose a known item and an unambiguous active location code.')
        c.unit(item.id, row.quantity, row.uom)
        if (c.rows('stock_lots', { lot_code: key }).length) throw new Error('Opening lot already exists.')
      } else if (c.rows(kind, { [kind === 'items' ? 'sku' : 'code']: key }).length) throw new Error('Identifier already exists.')
    } catch (error) { errors.push({ row: index + 1, message: error instanceof Error ? error.message : 'Invalid import row.' }) }
  })
  return errors
}
export function accountingRows(c: CommandContext): Row[] {
  const rows: Row[] = []
  function purchase(receipt: Row, event: Row, returned = false) {
    const order = c.one('purchase_orders', receipt.purchase_order_id), supplier = c.one('suppliers', order.supplier_id), item = c.one('items', order.item_id)
    const amount = returned ? format(-decimal(event.quantity)) : String(event.quantity)
    rows.push({ event_type: returned ? 'supplier_return' : 'purchase_receipt', record_id: event.id, reference: receipt.receipt_number, occurred_at: event.created_at, party_code: supplier.code, sku: item.sku, quantity: amount, uom: receipt.uom, currency: order.currency_code, unit_price: order.unit_price, amount: multiply(amount, order.unit_price) })
  }
  for (const receipt of c.rows('goods_receipts')) { purchase(receipt, receipt); for (const returned of c.rows('goods_returns', { receipt_id: receipt.id })) purchase(receipt, returned, true) }
  for (const line of c.rows('shipment_lines')) {
    const shipment = c.one('shipments', line.shipment_id)
    if (shipment.status !== 'dispatched') continue
    const orderLine = c.one('sales_order_lines', c.one('stock_reservations', line.reservation_id).sales_order_line_id), order = c.one('sales_orders', orderLine.sales_order_id), quote = c.one('quotations', order.quotation_id)
    const customer = c.one('customers', order.customer_id), item = c.one('items', orderLine.item_id)
    const base = { party_code: customer.code, sku: item.sku, uom: item.base_uom, currency: quote.currency_code, unit_price: orderLine.unit_price }
    rows.push({ ...base, event_type: 'dispatch', record_id: line.id, reference: shipment.shipment_number, occurred_at: shipment.dispatched_at, quantity: line.quantity, amount: multiply(line.quantity, orderLine.unit_price) })
    for (const returned of c.rows('customer_return_receipts', { shipment_line_id: line.id })) {
      const amount = format(-decimal(returned.quantity))
      rows.push({ ...base, event_type: 'customer_return', record_id: returned.id, reference: returned.return_number, occurred_at: returned.created_at, quantity: amount, amount: multiply(amount, orderLine.unit_price) })
    }
  }
  return rows
}
export const transferCommands: Record<string, CommandHandler> = {
  preview_data_import(c, a) {
    const { data: d } = transferCommandSchema.options[0].parse({ action: 'preview', data: a.p_data })
    const batch = c.insert('import_batches', { ...d, errors: validateRows(c, d.kind, d.rows) })
    c.audit('import_batches', batch.id, 'import_previewed'); return batch.id
  },
  apply_data_import(c, a) {
    const batch = c.one('import_batches', a.p_batch_id); c.state(batch, 'preview'); c.reason(a.p_reason)
    const kind = batch.kind as ImportKind, rows = batch.rows as Row[]
    if ((batch.errors as unknown[]).length || validateRows(c, kind, rows).length) throw new Error('IMPORT_VALIDATION_FAILED')
    rows.forEach((row, index) => {
      let id: unknown
      if (kind === 'opening_stock') {
        const item = c.rows('items', { sku: row.sku, active: true })[0]!, location = c.rows('stock_locations', { code: row.location_code, active: true })[0]!
        id = stockCommands.receive_finished_goods!(c, { p_item_id: item.id, p_location_id: location.id, p_lot_code: row.lot_code, p_quantity: row.quantity, p_uom: row.uom })
      } else id = c.insert(kind, row).id
      c.insert('import_records', { batch_id: batch.id, row_number: index + 1, entity_type: kind === 'opening_stock' ? 'stock_lot' : kind === 'items' ? 'item' : kind.slice(0, -1), entity_id: id })
    })
    c.update('import_batches', batch, { status: 'applied', applied_by: c.actor, applied_at: new Date().toISOString(), approval_reason: a.p_reason }); c.audit('import_batches', batch.id, 'import_owner_applied', a.p_reason); return batch.id
  },
  prepare_accounting_export(c, a) {
    const d = transferCommandSchema.options[2].parse({ action: 'prepare_export', from: a.p_from_date, to: a.p_to_date })
    if (d.from > d.to) throw new Error('INVALID_DATE_RANGE')
    const rows = accountingRows(c).filter((row) => { const date = plantDate(new Date(String(row.occurred_at))); return date >= d.from && date <= d.to })
    if (rows.length > 1000) throw new Error('EXPORT_RANGE_TOO_LARGE')
    const groups = new Map<string, Row[]>()
    for (const row of rows) { const key = `${row.event_type}:${row.currency}`; groups.set(key, [...(groups.get(key) ?? []), row]) }
    const totals = [...groups.values()].map((entries) => ({ event_type: entries[0]!.event_type, currency: entries[0]!.currency, record_count: entries.length, amount: sumAmounts(...entries.map((row) => row.amount)) }))
    const batch = c.insert('accounting_export_batches', { from_date: d.from, to_date: d.to, rows, totals }); c.audit('accounting_export_batches', batch.id, 'accounting_export_prepared'); return batch.id
  },
  approve_accounting_export(c, a) {
    const row = c.one('accounting_export_batches', a.p_batch_id); c.state(row, 'draft')
    c.update('accounting_export_batches', row, { status: 'approved', approved_by: c.actor, approved_at: new Date().toISOString(), approval_reason: c.reason(a.p_reason) }); c.audit('accounting_export_batches', row.id, 'accounting_export_owner_approved', a.p_reason); return row.id
  },
}
