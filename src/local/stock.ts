import { type CommandHandler } from './context'
import { add, decimal, format, quantity, subtract } from './exact'
import { lotTrace } from './trace'

export const stockCommands: Record<string, CommandHandler> = {
  receive_finished_goods(c, a) {
    const amount = c.unit(a.p_item_id, a.p_quantity, a.p_uom)
    const existing = c.rows('stock_lots', { lot_code: a.p_lot_code })[0]
    const lot = existing ?? c.newLot(a.p_item_id, a.p_location_id, a.p_lot_code)
    if (lot.item_id !== a.p_item_id || lot.location_id !== a.p_location_id) throw new Error('LOT_IDENTITY_MISMATCH')
    if (existing) {
      if (lot.qc_status !== 'hold' || ['production_outputs', 'goods_receipts', 'customer_return_receipts', 'lot_transformations'].some((table) => c.rows(table).some((row) => (row.lot_id ?? row.output_lot_id) === lot.id)) || c.rows('lot_genealogy', { child_lot_id: lot.id }).length) throw new Error('MANAGED_LOT_TOP_UP_REJECTED')
      c.bump('stock_lots', lot)
    }
    c.ledger(lot, amount, 'receipt', 'manual_receipt', lot.id); c.audit('stock_lots', lot.id, 'stock_received'); return lot.id
  },
  release_stock_lot(c, a) {
    const lot = c.one('stock_lots', a.p_lot_id); c.revision(lot, a.p_expected_revision)
    if (lot.qc_status !== 'hold') throw new Error('INVALID_TRANSITION')
    if (c.rows('ncrs', { lot_id: lot.id }).some((row) => row.status !== 'resolved')) throw new Error('LOT_NCR_OPEN')
    const requiredKind = lotTrace(c, lot.id).requires_final ? 'final' : 'incoming'
    const evidence = c.rows('inspections', { lot_id: lot.id }).filter((row) => row.lot_revision === lot.revision && row.kind === requiredKind).at(-1)
    if (evidence?.result !== 'passed') throw new Error('CURRENT_PASSED_INSPECTION_REQUIRED')
    c.bump('stock_lots', lot, { qc_status: 'released' }); c.audit('stock_lots', lot.id, 'lot_owner_released'); return lot.id
  },
  reserve_finished_goods(c, a) {
    const line = c.one('sales_order_lines', a.p_sales_order_line_id); const order = c.one('sales_orders', line.sales_order_id)
    c.revision(order, a.p_expected_sales_order_revision); c.state(order, 'open', 'partially_shipped')
    const lot = c.one('stock_lots', a.p_lot_id); const amount = c.unit(line.item_id, a.p_quantity, line.uom)
    if (lot.item_id !== line.item_id) throw new Error('LOT_ITEM_MISMATCH')
    c.available(lot, amount)
    const allocated = add(...c.rows('stock_reservations', { sales_order_line_id: line.id }).filter((row) => row.status !== 'released').map((row) => row.quantity))
    if (decimal(add(allocated, amount)) > decimal(line.ordered_quantity)) throw new Error('ORDER_QUANTITY_EXCEEDED')
    const reservation = c.insert('stock_reservations', { sales_order_line_id: line.id, lot_id: lot.id, quantity: amount, idempotency_key: c.key })
    c.bump('sales_orders', order); c.audit('stock_reservations', reservation.id, 'stock_reserved'); return reservation.id
  },
  release_stock_reservation(c, a) {
    const reservation = c.one('stock_reservations', a.p_reservation_id); c.state(reservation, 'active')
    const order = c.one('sales_orders', c.one('sales_order_lines', reservation.sales_order_line_id).sales_order_id)
    c.revision(order, a.p_expected_sales_order_revision)
    if (c.rows('shipment_lines', { reservation_id: reservation.id }).some((row) => c.one('shipments', row.shipment_id).status === 'draft')) throw new Error('PREPARED_SHIPMENT_EXISTS')
    c.update('stock_reservations', reservation, { status: 'released', released_at: new Date().toISOString() }); c.bump('sales_orders', order); c.audit('stock_reservations', reservation.id, 'reservation_released', c.reason(a.p_reason)); return reservation.id
  },
  reject_stock_lot(c, a) {
    const lot = c.one('stock_lots', a.p_lot_id); c.revision(lot, a.p_expected_revision)
    if (lot.qc_status !== 'hold') throw new Error('INVALID_TRANSITION')
    c.bump('stock_lots', lot, { qc_status: 'rejected' }); c.audit('stock_lots', lot.id, 'lot_rejected', c.reason(a.p_reason)); return lot.id
  },
  propose_stock_count(c, a) {
    const lot = c.one('stock_lots', a.p_lot_id); c.revision(lot, a.p_expected_revision)
    if (decimal(a.p_counted_quantity) < 0n) throw new Error('INVALID_QUANTITY')
    const row = c.insert('stock_count_proposals', { lot_id: lot.id, expected_on_hand: c.position(lot.id).on_hand, counted_quantity: String(a.p_counted_quantity), expected_lot_revision: lot.revision, reason: c.reason(a.p_reason) })
    c.audit('stock_count_proposals', row.id, 'count_proposed'); return row.id
  },
  review_stock_count() { throw new Error('TEAM_INDEPENDENT_REVIEW_REQUIRED') },
  prepare_packing_shipment(c, a) {
    const order = c.one('sales_orders', a.p_sales_order_id); c.revision(order, a.p_expected_sales_order_revision); c.state(order, 'open', 'partially_shipped')
    if (!Array.isArray(a.p_lines) || !a.p_lines.length) throw new Error('INVALID_LINES')
    const packing = c.insert('packing_orders', { sales_order_id: order.id, packing_number: a.p_packing_number, status: 'packed' })
    const shipment = c.insert('shipments', { packing_order_id: packing.id, shipment_number: a.p_shipment_number })
    for (const line of a.p_lines as { reservation_id: string; quantity: string }[]) {
      const reservation = c.one('stock_reservations', line.reservation_id); c.state(reservation, 'active')
      const orderLine = c.one('sales_order_lines', reservation.sales_order_line_id)
      if (orderLine.sales_order_id !== order.id) throw new Error('RESERVATION_ORDER_MISMATCH')
      const amount = quantity(line.quantity, orderLine.uom); const lot = c.one('stock_lots', reservation.lot_id)
      if (lot.qc_status !== 'released') throw new Error('LOT_QC_HOLD')
      const prepared = add(...c.rows('shipment_lines', { reservation_id: reservation.id }).filter((row) => c.one('shipments', row.shipment_id).status === 'draft').map((row) => row.quantity))
      if (decimal(add(prepared, amount)) > decimal(subtract(reservation.quantity, reservation.consumed_quantity))) throw new Error('RESERVATION_QUANTITY_EXCEEDED')
      c.insert('packing_order_lines', { packing_order_id: packing.id, reservation_id: reservation.id, quantity: amount })
      c.insert('shipment_lines', { shipment_id: shipment.id, reservation_id: reservation.id, lot_id: reservation.lot_id, quantity: amount })
    }
    c.bump('sales_orders', order); c.audit('shipments', shipment.id, 'shipment_prepared'); return shipment.id
  },
  dispatch_shipment(c, a) {
    const shipment = c.one('shipments', a.p_shipment_id); c.revision(shipment, a.p_expected_shipment_revision); c.state(shipment, 'draft')
    for (const line of c.rows('shipment_lines', { shipment_id: shipment.id })) {
      const reservation = c.one('stock_reservations', line.reservation_id); c.state(reservation, 'active')
      const lot = c.one('stock_lots', line.lot_id)
      if (lot.qc_status !== 'released' || c.rows('ncrs', { lot_id: lot.id }).some((row) => row.status !== 'resolved')) throw new Error('LOT_QC_HOLD')
      const packed = add(...c.rows('shipment_packages', { shipment_line_id: line.id }).map((row) => row.quantity))
      if (decimal(packed) !== decimal(line.quantity)) throw new Error('PACKAGE_QUANTITY_MISMATCH')
      const consumed = add(reservation.consumed_quantity, line.quantity)
      if (decimal(consumed) > decimal(reservation.quantity)) throw new Error('RESERVATION_QUANTITY_EXCEEDED')
      c.ledger(lot, format(-decimal(line.quantity)), 'dispatch', 'shipment', shipment.id)
      c.update('stock_reservations', reservation, { consumed_quantity: consumed, status: decimal(consumed) === decimal(reservation.quantity) ? 'consumed' : 'active' }); c.bump('stock_lots', lot)
    }
    c.bump('shipments', shipment, { status: 'dispatched', dispatched_at: new Date().toISOString(), dispatched_by: c.actor })
    const order = c.one('sales_orders', c.one('packing_orders', shipment.packing_order_id).sales_order_id)
    const lines = c.rows('sales_order_lines', { sales_order_id: order.id })
    const full = lines.every((line) => decimal(add(...c.rows('stock_reservations', { sales_order_line_id: line.id }).map((row) => row.consumed_quantity))) === decimal(line.ordered_quantity))
    c.bump('sales_orders', order, { status: full ? 'fulfilled' : 'partially_shipped' }); c.audit('shipments', shipment.id, 'shipment_dispatched'); return shipment.id
  },
  cancel_prepared_shipment(c, a) {
    const shipment = c.one('shipments', a.p_shipment_id); c.revision(shipment, a.p_expected_shipment_revision); c.state(shipment, 'draft')
    c.bump('shipments', shipment, { status: 'cancelled' }); c.audit('shipments', shipment.id, 'shipment_cancelled', c.reason(a.p_reason)); return shipment.id
  },
}
