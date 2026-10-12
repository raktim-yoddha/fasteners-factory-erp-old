import type { Store, Row } from './database'
import { add, decimal, quantity, subtract } from './exact'

export class CommandContext {
  constructor(readonly store: Store, readonly companyId: string, readonly key: string) {}
  get actor() { return this.store.actorId }
  rows(table: string, where: Row = {}) { return this.store.rows(table, { ...where, company_id: this.companyId }) }
  one(table: string, id: unknown) { return this.store.one(table, id, this.companyId) }
  insert(table: string, data: Row) { return this.store.insert(table, { ...data, company_id: this.companyId }) }
  update(table: string, row: Row, values: Row) {
    this.one(table, row.id)
    this.store.update(table, row.id, values)
  }
  revision(row: Row, expected: unknown) {
    if (!Number.isSafeInteger(expected) || Number(row.revision) !== expected) throw new Error('REVISION_CONFLICT')
  }
  state(row: Row, ...allowed: string[]) {
    if (!allowed.includes(String(row.status))) throw new Error('INVALID_TRANSITION')
  }
  bump(table: string, row: Row, values: Row = {}) { this.update(table, row, { ...values, revision: Number(row.revision) + 1 }) }
  reason(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('REASON_REQUIRED')
    return value.trim()
  }
  unit(itemId: unknown, value: unknown, unit: unknown): string {
    const item = this.one('items', itemId)
    if (item.base_uom !== unit || item.active !== true) throw new Error('UNIT_MISMATCH')
    return quantity(value, unit)
  }
  position(lotId: unknown): Row {
    const lot = this.one('stock_lots', lotId)
    const onHand = add(...this.rows('stock_ledger_entries', { lot_id: lotId }).map((row) => row.quantity_delta))
    const reserved = add(...this.rows('stock_reservations', { lot_id: lotId, status: 'active' }).map((row) => subtract(row.quantity, row.consumed_quantity)))
    return { ...lot, lot_id: lot.id, on_hand: onHand, reserved, available_to_promise: lot.qc_status === 'released' ? subtract(onHand, reserved) : '0' }
  }
  available(lot: Row, amount: unknown) {
    if (lot.qc_status !== 'released') throw new Error('LOT_QC_HOLD')
    if (this.rows('ncrs', { lot_id: lot.id }).some((row) => row.status !== 'resolved')) throw new Error('LOT_NCR_OPEN')
    if (decimal(this.position(lot.id).available_to_promise) < decimal(amount)) throw new Error('INSUFFICIENT_AVAILABLE_STOCK')
  }
  ledger(lot: Row, amount: unknown, type: string, sourceType: string, sourceId: unknown, reason: unknown = null) {
    const next = decimal(this.position(lot.id).on_hand) + decimal(amount)
    if (next < 0n) throw new Error('INSUFFICIENT_AVAILABLE_STOCK')
    this.insert('stock_ledger_entries', { lot_id: lot.id, item_id: lot.item_id, location_id: lot.location_id, movement_type: type, quantity_delta: String(amount), uom: this.one('items', lot.item_id).base_uom, source_type: sourceType, source_id: sourceId, idempotency_key: `${this.key}:${crypto.randomUUID()}`, reason })
  }
  newLot(itemId: unknown, locationId: unknown, code: unknown) {
    this.one('items', itemId); const location = this.one('stock_locations', locationId)
    if (location.active !== true || typeof code !== 'string' || !/^[A-Z0-9][A-Z0-9/-]{2,63}$/.test(code)) throw new Error('INVALID_LOT')
    return this.insert('stock_lots', { item_id: itemId, location_id: locationId, lot_code: code, qc_status: 'hold' })
  }
  audit(table: string, id: unknown, action: string, reason: unknown = null, metadata: Row = {}) {
    this.insert('audit_log', { actor_id: this.actor, entity_type: table, entity_id: id, action, correlation_id: crypto.randomUUID(), idempotency_key: this.key, reason, metadata: { ...metadata, authority: 'solo_owner', workspace: 'device' } })
  }
}
export type CommandHandler = (context: CommandContext, args: Row) => unknown
