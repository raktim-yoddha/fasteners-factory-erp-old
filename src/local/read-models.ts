import manifest from './schema-manifest.json'
import type { CommandContext } from './context'
import type { Row } from './database'
import { add, decimal, format, subtract } from './exact'
import { materialPositions, issuePositions } from './production'
import { vendorWorkspace } from './custody'
import { derivedRows } from './queries'
import { plantDate } from '@/lib/decimal'

const records: Record<string, [string, string, string]> = {
  customer: ['customers', 'Customer', 'code'], supplier: ['suppliers', 'Supplier', 'code'], item: ['items', 'Item', 'sku'], drawing: ['drawings', 'Drawing', 'drawing_number'], rfq: ['rfqs', 'RFQ', 'rfq_number'], quotation: ['quotations', 'Quotation', 'quotation_number'], 'sales-order': ['sales_orders', 'Sales order', 'sales_order_number'], lot: ['stock_lots', 'Lot', 'lot_code'], shipment: ['shipments', 'Shipment', 'shipment_number'], 'purchase-requisition': ['purchase_requisitions', 'Purchase requisition', 'requisition_number'], 'purchase-order': ['purchase_orders', 'Purchase order', 'purchase_order_number'], 'goods-receipt': ['goods_receipts', 'Goods receipt', 'receipt_number'], 'work-order': ['work_orders', 'Work order', 'number'], 'job-card': ['job_cards', 'Job card', 'name'], inspection: ['inspections', 'Inspection', 'result'], ncr: ['ncrs', 'NCR', 'reason'],
}
export function searchRecords(c: CommandContext, query: unknown, exact = false) {
  if (typeof query !== 'string' || query.length > 100 || !query.trim()) throw new Error('INVALID_SEARCH')
  const text = query.trim().toLowerCase()
  const result = Object.entries(records).flatMap(([, [table, record_type, field]]) => c.rows(table).filter((row) => {
    const identifier = String(row[field]).toLowerCase()
    return exact ? identifier === text || row.id === text : `${identifier} ${row.name ?? row.description ?? ''}`.toLowerCase().includes(text)
  }).map((row) => ({ record_type, record_id: row.id, label: `${row[field]}${row.name || row.description ? ` · ${row.name ?? row.description}` : ''}` })))
  for (const row of c.rows('shipment_packages')) if ((exact ? String(row.package_code).toLowerCase() === text : String(row.package_code).toLowerCase().includes(text))) result.push({ record_type: 'Shipment', record_id: c.one('shipment_lines', row.shipment_line_id).shipment_id, label: String(row.package_code) })
  for (const row of c.rows('customer_item_references')) if (!row.retired_at && (exact ? String(row.part_number).toLowerCase() === text : String(row.part_number).toLowerCase().includes(text))) result.push({ record_type: 'Item', record_id: row.item_id, label: `${row.part_number} · ${c.one('items', row.item_id).sku}` })
  return result.slice(0, 50)
}
export function recordLinks(c: CommandContext, a: Row) {
  const source = records[String(a.p_kind)]
  if (!source) throw new Error('INVALID_RECORD_KIND')
  const root = c.one(source[0], a.p_record_id)
  const links = new Map<string, { kind: string; id: unknown; label: string }>(), visited = new Set<string>()
  function visit(table: string, row: Row, depth: number) {
    const key = `${table}:${row.id ?? JSON.stringify(row)}`
    if (visited.has(key) || depth > 2) return
    visited.add(key)
    const target = Object.entries(records).find(([, definition]) => definition[0] === table)
    if (target && key !== `${source![0]}:${root.id}`) {
      links.set(key, { kind: target[0], id: row.id, label: String(row[target[1][2]]) }); return
    }
    const definition = manifest.tables.find((entry) => entry.name === table)!
    for (const relation of definition.constraints.filter((entry) => entry.kind === 'f' && entry.foreignSchema === 'public')) {
      const keys = relation.columns.filter((name) => name !== 'company_id')
      if (keys.length !== 1 || !row[keys[0]!]) continue
      const next = c.rows(relation.foreignTable!, { [relation.foreignColumns!.find((name) => name !== 'company_id')!]: row[keys[0]!] })[0]
      if (next) visit(relation.foreignTable!, next, depth + 1)
    }
    for (const other of manifest.tables) for (const relation of other.constraints.filter((entry) => entry.kind === 'f' && entry.foreignTable === table)) {
      const keys = relation.columns.filter((name) => name !== 'company_id'), foreign = relation.foreignColumns?.filter((name) => name !== 'company_id')
      if (keys.length !== 1 || foreign?.length !== 1 || !row[foreign[0]!]) continue
      for (const next of c.rows(other.name, { [keys[0]!]: row[foreign[0]!] })) visit(other.name, next, depth + 1)
    }
  }
  visit(source[0], root, 0)
  const after = `${a.p_after_kind ?? ''}:${a.p_after_id ?? ''}`
  const rows = [...links.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)).filter((row) => !a.p_after_kind || `${row.kind}:${row.id}` > after)
  return { rows: rows.slice(0, 20), has_more: rows.length > 20 }
}
export function auditPage(c: CommandContext, a: Row) {
  const rows = c.rows('audit_log').filter((row) => (!a.p_before_id || BigInt(String(row.id)) < BigInt(String(a.p_before_id))) && (!a.p_from_date || plantDate(new Date(String(row.occurred_at))) >= String(a.p_from_date)) && (!a.p_to_date || plantDate(new Date(String(row.occurred_at))) <= String(a.p_to_date)) && `${row.action} ${row.entity_type} ${row.reason ?? ''}`.toLowerCase().includes(String(a.p_search ?? '').toLowerCase())).sort((a, b) => Number(b.id) - Number(a.id)).map((row) => ({ ...row, id: String(row.id) }))
  return { rows: rows.slice(0, 50), has_more: rows.length > 50 }
}
export function factoryReport(c: CommandContext, a: Row) {
  const rows: Row[] = [], kind = String(a.p_kind)
  function append(record: Row, recordKind: string, label: unknown, itemId: unknown, amount: unknown, unit: unknown, quantityLabel: string, details: string, party: unknown = null, key: unknown = record.id) {
    const occurred = String(record.created_at ?? record.occurred_at), due = record.due_date ?? record.promised_date ?? null, date = plantDate(new Date(occurred)), today = plantDate()
    rows.push({ key: String(key), record_id: record.id, record_kind: recordKind, label: String(label), sku: c.one('items', itemId).sku, party, status: String(record.status ?? record.movement_type), occurred_at: occurred, due_date: due, age_days: Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86400000)), overdue: Boolean(due && String(due) < today && record.status !== 'closed'), quantity: String(amount), quantity_label: quantityLabel, uom: unit, details })
  }
  if (kind === 'backlog') for (const line of c.rows('sales_order_lines')) {
    const order = c.one('sales_orders', line.sales_order_id), outstanding = subtract(line.ordered_quantity, add(...c.rows('stock_reservations', { sales_order_line_id: line.id }).map((row) => row.consumed_quantity)))
    if (['open', 'partially_shipped'].includes(String(order.status)) && decimal(outstanding) > 0n) append(order, 'sales-order', order.sales_order_number, line.item_id, outstanding, line.uom, 'Unshipped', `Ordered ${line.ordered_quantity} ${line.uom}.`, c.one('customers', order.customer_id).name, line.id)
  }
  else if (kind === 'shortages') for (const material of materialPositions(c)) {
    const work = c.one('work_orders', material.work_order_id), shortage = subtract(material.required_quantity, add(material.consumed_quantity, material.wip_quantity, material.available_quantity))
    if (work.status !== 'closed' && decimal(shortage) > 0n) append(work, 'work-order', work.number, material.item_id, shortage, material.uom, 'Material shortage', `Required ${material.required_quantity}; consumed ${material.consumed_quantity}; WIP ${material.wip_quantity}; available ${material.available_quantity}. Expected receipts are not usable stock.`, null, `${work.id}:${material.item_id}`)
  }
  else if (kind === 'wip') for (const issue of issuePositions(c)) {
    const work = c.one('work_orders', issue.work_order_id)
    if (decimal(issue.remaining_quantity) > 0n) append({ ...work, created_at: issue.created_at }, 'work-order', work.number, issue.item_id, issue.remaining_quantity, issue.uom, 'Unaccounted WIP', `Source ${c.one('stock_lots', issue.lot_id).lot_code}. Record consumption or unused return.`, null, issue.id)
  }
  else if (kind === 'receipts') for (const position of derivedRows(c.store, 'purchase_order_positions').filter((row) => row.company_id === c.companyId)) {
    const order = c.one('purchase_orders', position.purchase_order_id)
    if (order.status !== 'draft' && decimal(position.outstanding_quantity) > 0n) append(order, 'purchase-order', order.purchase_order_number, order.item_id, position.outstanding_quantity, order.uom, 'Outstanding receipt', `Net received ${position.received_quantity}.`, c.one('suppliers', order.supplier_id).name)
  }
  else if (kind === 'ncr') for (const ncr of c.rows('ncrs')) {
    const lot = c.one('stock_lots', ncr.lot_id)
    if (ncr.status !== 'resolved') append(ncr, 'ncr', `NCR · ${lot.lot_code}`, lot.item_id, ncr.quantity, ncr.uom, 'Affected quantity', `${ncr.reason}; disposition: ${ncr.disposition ?? 'awaiting review'}`)
  }
  else if (kind === 'yield') for (const work of c.rows('work_orders')) append(work, 'work-order', work.number, work.item_id, add(...c.rows('job_cards', { work_order_id: work.id }).map((row) => row.scrap_quantity)), work.uom, 'Recorded operation scrap', `Planned ${work.quantity}; output ${add(...c.rows('production_outputs', { work_order_id: work.id }).map((row) => row.quantity))}. Incomplete work is pending, not loss.`)
  else if (kind === 'vendor') for (const order of vendorWorkspace(c).orders) {
    if (decimal(order.at_vendor_quantity) > 0n) append({ ...order, id: order.source_lot_id }, 'lot', order.number, order.item_id, order.at_vendor_quantity, order.uom, 'At vendor', `${order.process}; returned ${order.returned_quantity}; loss ${order.loss_quantity}.`, c.one('suppliers', order.supplier_id).name, order.id)
  }
  else if (kind === 'movements') for (const entry of c.rows('stock_ledger_entries')) append({ ...entry, id: entry.lot_id }, 'lot', c.one('stock_lots', entry.lot_id).lot_code, entry.item_id, format(decimal(entry.quantity_delta)), entry.uom, 'Signed movement', `${entry.source_type}; ${entry.reason ?? ''}`, null, entry.id)
  else throw new Error('INVALID_REPORT_FILTER')
  const filtered = rows.filter((row) => (!a.p_from || plantDate(new Date(String(row.occurred_at))) >= String(a.p_from)) && (!a.p_to || plantDate(new Date(String(row.occurred_at))) <= String(a.p_to)) && `${row.label} ${row.sku} ${row.party ?? ''} ${row.details}`.toLowerCase().includes(String(a.p_search ?? '').toLowerCase())).sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)) || String(a.key).localeCompare(String(b.key)))
  const page = Number(a.p_page ?? 0)
  if (!Number.isInteger(page) || page < 0 || page > 10000 || (a.p_from && a.p_to && String(a.p_from) > String(a.p_to))) throw new Error('INVALID_REPORT_FILTER')
  return { total: filtered.length, page, page_size: 50, as_of: new Date().toISOString(), rows: filtered.slice(page * 50, page * 50 + 50) }
}
