import { CommandContext } from './context'
import type { Row, Store } from './database'
import { add, decimal, subtract } from './exact'
import { type LocalQuery } from './protocol'

export function derivedRows(store: Store, table: string): Row[] {
  if (table === 'stock_positions') return store.rows('stock_lots').map((lot) => new CommandContext(store, String(lot.company_id), '').position(lot.id))
  if (table === 'reservation_positions') return store.rows('stock_reservations').map((row) => ({ ...row, remaining_quantity: subtract(row.quantity, row.consumed_quantity) }))
  if (table === 'purchase_order_positions') return store.rows('purchase_orders').map((row) => {
    const received = add(...store.rows('goods_receipts', { purchase_order_id: row.id }).map((receipt) => subtract(receipt.quantity, add(...store.rows('goods_returns', { receipt_id: receipt.id }).map((entry) => entry.quantity)))))
    return { company_id: row.company_id, purchase_order_id: row.id, received_quantity: received, outstanding_quantity: subtract(row.quantity, received) }
  })
  if (table === 'purchase_requisition_positions') return store.rows('purchase_requisitions').map((row) => {
    const allocated = add(...store.rows('purchase_orders', { requisition_id: row.id }).filter((order) => order.status !== 'cancelled').map((order) => order.quantity))
    return { company_id: row.company_id, requisition_id: row.id, allocated_quantity: allocated, remaining_quantity: subtract(row.quantity, allocated) }
  })
  if (table === 'current_rfq_line_reviews') return store.rows('rfq_line_feasibility_reviews').filter((row, _, rows) => !rows.some((other) => other.rfq_line_id === row.rfq_line_id && Number(other.version) > Number(row.version))).map((row) => ({ ...row, rfq_lines: store.one('rfq_lines', row.rfq_line_id) }))
  return store.rows(table)
}
const joins: Record<string, [string, string]> = { drawing_revisions: ['drawings', 'drawing_id'], bom_revisions: ['boms', 'bom_id'], routing_revisions: ['routings', 'routing_id'] }
function compare(left: unknown, right: unknown): number {
  if (/^-?\d+(?:\.\d+)?$/.test(String(left)) && /^-?\d+(?:\.\d+)?$/.test(String(right))) {
    const a = decimal(left), b = decimal(right); return a === b ? 0 : a < b ? -1 : 1
  }
  return String(left ?? '').localeCompare(String(right ?? ''))
}
function field(row: Row, name: string): unknown {
  return name.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Row)[key] : undefined, row)
}
export function queryRows(store: Store, query: LocalQuery): { data: unknown; count: number } {
  let rows = derivedRows(store, query.table)
  for (const filter of query.filters) rows = rows.filter((row) => {
    const left = field(row, filter.column)
    return filter.operator === 'eq' ? left === filter.value : filter.operator === 'gt' ? compare(left, filter.value) > 0 : compare(left, filter.value) < 0
  })
  for (const order of [...query.orders].reverse()) rows.sort((a, b) => compare(a[order.column], b[order.column]) * (order.ascending ? 1 : -1))
  const count = rows.length
  if (query.limit) rows = rows.slice(0, query.limit)
  const join = joins[query.table]
  if (join && query.fields.includes(`${join[0]}!inner`)) rows = rows.map((row) => ({ ...row, [join[0]]: store.one(join[0], row[join[1]], row.company_id) }))
  // Keep requested text casts used by existing typed read adapters. No SQL arrives from UI.
  const castFields = [...query.fields.matchAll(/([a-z_]+)::text/g)].map((match) => match[1]!)
  rows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, castFields.includes(key) && value !== null ? String(value) : value])))
  if (query.fields !== '*') {
    const fields = query.fields.split(/,(?![^()]*\))/).map((entry) => entry.trim().split(/::|!/)[0]!).filter(Boolean)
    rows = rows.map((row) => Object.fromEntries(fields.map((key) => [key, row[key] ?? null])))
  }
  if (query.single === 'one' && rows.length !== 1) throw new Error('RECORD_NOT_FOUND')
  if (query.single === 'maybe' && rows.length > 1) throw new Error('MULTIPLE_RECORDS')
  return { data: query.head ? null : query.single ? rows[0] ?? null : rows, count }
}
