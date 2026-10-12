import { type CommandHandler, type CommandContext } from './context'
import type { Row } from './database'
import { add, decimal, format, ratio, subtract } from './exact'

function orderRemaining(c: CommandContext, order: Row) {
  return subtract(order.quantity, add(...c.rows('goods_receipts', { purchase_order_id: order.id }).map((receipt) => subtract(receipt.quantity, add(...c.rows('goods_returns', { receipt_id: receipt.id }).map((row) => row.quantity))))))
}
const createPurchase: CommandHandler = (c, a) => {
  const requisition = c.one('purchase_requisitions', a.p_requisition_id); c.revision(requisition, a.p_expected_revision)
  const supplier = c.one('suppliers', a.p_supplier_id)
  if (!supplier.active) throw new Error('SUPPLIER_INACTIVE')
  const allocated = add(...c.rows('purchase_orders', { requisition_id: requisition.id }).filter((row) => row.status !== 'cancelled').map((row) => row.quantity))
  const amount = c.unit(requisition.item_id, a.p_quantity ?? subtract(requisition.quantity, allocated), requisition.uom)
  if (decimal(add(allocated, amount)) > decimal(requisition.quantity) || decimal(a.p_unit_price) < 0n) throw new Error('REQUISITION_QUANTITY_EXCEEDED')
  const order = c.insert('purchase_orders', { purchase_order_number: a.p_number, requisition_id: requisition.id, supplier_id: supplier.id, item_id: requisition.item_id, quantity: amount, uom: requisition.uom, unit_price: String(a.p_unit_price), currency_code: a.p_currency, promised_date: a.p_promised_date })
  c.bump('purchase_requisitions', requisition, { status: decimal(add(allocated, amount)) === decimal(requisition.quantity) ? 'ordered' : 'partially_ordered' }); c.audit('purchase_orders', order.id, 'purchase_order_created'); return order.id
}
const receive: CommandHandler = (c, a) => {
  const order = c.one('purchase_orders', a.p_order_id); c.revision(order, a.p_expected_revision); c.state(order, 'approved', 'partially_received')
  const amount = c.unit(order.item_id, a.p_quantity, a.p_uom)
  if (decimal(amount) > decimal(orderRemaining(c, order))) throw new Error('PURCHASE_ORDER_QUANTITY_EXCEEDED')
  const supplier = c.one('suppliers', order.supplier_id)
  if (supplier.certificate_requirements && !String(a.p_certificate_reference ?? '').trim()) throw new Error('CERTIFICATE_REQUIRED')
  const lot = c.newLot(order.item_id, a.p_location_id, a.p_lot_code)
  const receipt = c.insert('goods_receipts', { purchase_order_id: order.id, receipt_number: a.p_number, lot_id: lot.id, quantity: amount, uom: order.uom, supplier_lot: c.reason(a.p_supplier_lot), certificate_reference: a.p_certificate_reference || null })
  c.ledger(lot, amount, 'receipt', 'goods_receipt', receipt.id)
  c.bump('purchase_orders', order, { status: decimal(orderRemaining(c, order)) === 0n ? 'received' : 'partially_received' }); c.audit('goods_receipts', receipt.id, 'goods_received'); return receipt.id
}
export const procurementCommands: Record<string, CommandHandler> = {
  request_material(c, a) {
    const amount = c.unit(a.p_item_id, a.p_quantity, a.p_uom)
    if (a.p_sales_order_line_id) c.one('sales_order_lines', a.p_sales_order_line_id)
    const row = c.insert('purchase_requisitions', { requisition_number: a.p_number, item_id: a.p_item_id, quantity: amount, uom: a.p_uom, demand_source: c.reason(a.p_demand_source), needed_by: a.p_needed_by, sales_order_line_id: a.p_sales_order_line_id ?? null })
    c.audit('purchase_requisitions', row.id, 'material_requested'); return row.id
  },
  create_purchase_order: createPurchase,
  create_partial_purchase_order: createPurchase,
  approve_purchase_order(c, a) {
    const order = c.one('purchase_orders', a.p_order_id); c.revision(order, a.p_expected_revision); c.state(order, 'draft')
    c.bump('purchase_orders', order, { status: 'approved', approved_by: c.actor, approved_at: new Date().toISOString() }); c.audit('purchase_orders', order.id, 'purchase_order_owner_approved'); return order.id
  },
  receive_purchase_order: receive,
  receive_purchase_order_in_unit(c, a) {
    const d = a.p_data as Row, order = c.one('purchase_orders', d.order_id), conversion = c.one('item_unit_conversions', d.conversion_id)
    c.state(conversion, 'approved')
    if (conversion.item_id !== order.item_id || conversion.from_uom !== d.uom || conversion.to_uom !== order.uom) throw new Error('UNIT_MISMATCH')
    const converted = ratio(d.quantity, conversion.to_quantity, conversion.from_quantity)
    const receipt = receive(c, { p_order_id: d.order_id, p_expected_revision: d.expected_revision, p_number: d.number, p_lot_code: d.lot_code, p_location_id: d.location_id, p_quantity: converted, p_uom: order.uom, p_supplier_lot: d.supplier_lot, p_certificate_reference: d.certificate_reference })
    c.insert('unit_conversion_events', { item_id: order.item_id, conversion_id: conversion.id, entity_type: 'goods_receipt', entity_id: receipt, input_quantity: String(d.quantity), input_uom: d.uom, base_quantity: converted, base_uom: order.uom }); return receipt
  },
  return_goods_receipt(c, a) {
    const receipt = c.one('goods_receipts', a.p_receipt_id), lot = c.one('stock_lots', receipt.lot_id); c.revision(lot, a.p_expected_lot_revision)
    const amount = c.unit(lot.item_id, a.p_quantity, receipt.uom)
    const position = c.position(lot.id)
    if (decimal(amount) > decimal(subtract(position.on_hand, position.reserved)) || decimal(add(amount, ...c.rows('goods_returns', { receipt_id: receipt.id }).map((row) => row.quantity))) > decimal(receipt.quantity)) throw new Error('INSUFFICIENT_AVAILABLE_STOCK')
    const row = c.insert('goods_returns', { receipt_id: receipt.id, quantity: amount, reason: c.reason(a.p_reason) })
    c.ledger(lot, format(-decimal(amount)), 'issue', 'supplier_return', row.id, row.reason); c.bump('stock_lots', lot, { qc_status: decimal(c.position(lot.id).on_hand) === 0n ? 'rejected' : 'hold' })
    const order = c.one('purchase_orders', receipt.purchase_order_id); c.bump('purchase_orders', order, { status: 'partially_received' })
    for (const ncr of c.rows('ncrs', { lot_id: lot.id, status: 'awaiting_return' })) {
      const returned = add(...c.rows('goods_receipts', { lot_id: lot.id }).flatMap((r) => c.rows('goods_returns', { receipt_id: r.id }).filter((entry) => String(entry.created_at) >= String(ncr.created_at)).map((entry) => entry.quantity)))
      if (decimal(returned) >= decimal(ncr.quantity)) c.bump('ncrs', ncr, { status: 'resolved' })
    }
    c.audit('goods_returns', row.id, 'supplier_returned', row.reason); return row.id
  },
}
