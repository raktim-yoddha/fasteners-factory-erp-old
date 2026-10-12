import { vendorCommandSchema } from '@/features/jobwork/vendorJobworkContract'
import { transformationSchema } from '@/features/stock/lotTransformationsContract'
import { customerReturnSchema } from '@/features/dispatch/customerReturnsContract'
import { shipmentPackageSchema } from '@/features/dispatch/shipmentPackagesContract'
import { type CommandContext, type CommandHandler } from './context'
import type { Row } from './database'
import { add, decimal, format, quantity, ratio, subtract } from './exact'
import { lotTrace } from './trace'

export function vendorWorkspace(c: CommandContext) {
  return { events: c.rows('vendor_custody_events'), orders: c.rows('vendor_orders').map((row): Row => {
    const events = c.rows('vendor_custody_events', { vendor_order_id: row.id })
    const sent = add(...events.filter((event) => event.kind === 'send').map((event) => event.quantity_delta))
    const returned = format(-decimal(add(...events.filter((event) => event.kind === 'return').map((event) => event.quantity_delta))))
    const loss = format(-decimal(add(...events.filter((event) => event.kind === 'loss').map((event) => event.quantity_delta))))
    return { ...row, item_id: c.one('stock_lots', row.source_lot_id).item_id, sent_quantity: sent, returned_quantity: returned, loss_quantity: loss, at_vendor_quantity: subtract(sent, add(returned, loss)), remaining_to_send: row.status === 'closed' || row.status === 'cancelled' ? '0' : subtract(row.quantity, sent), cancelled_unsent_quantity: row.status === 'closed' || row.status === 'cancelled' ? subtract(row.quantity, sent) : '0' }
  }) }
}
export function packingWorkspace(c: CommandContext) {
  return { lines: c.rows('shipment_lines').map((line) => {
    const shipment = c.one('shipments', line.shipment_id), lot = c.one('stock_lots', line.lot_id), item = c.one('items', lot.item_id)
    const orderLine = c.one('sales_order_lines', c.one('stock_reservations', line.reservation_id).sales_order_line_id)
    const part = orderLine.customer_part_reference_id ? c.one('customer_item_references', orderLine.customer_part_reference_id) : null
    const packaged = add(...c.rows('shipment_packages', { shipment_line_id: line.id }).map((row) => row.quantity))
    return { ...line, shipment_number: shipment.shipment_number, shipment_revision: shipment.revision, status: shipment.status, lot_code: lot.lot_code, sku: item.sku, item_id: item.id, item_specification_id: orderLine.item_specification_id, customer_part_number: part?.part_number ?? null, customer_part_revision: part?.part_revision ?? null, uom: item.base_uom, packaged_quantity: packaged, remaining_quantity: subtract(line.quantity, packaged) }
  }), packages: c.rows('shipment_packages').map((row) => ({ ...row, ...c.rows('unit_conversion_events', { entity_id: row.id })[0] })) }
}
export function returnWorkspace(c: CommandContext) {
  return { shipments: c.rows('shipment_lines').filter((line) => c.one('shipments', line.shipment_id).status === 'dispatched').map((line) => {
    const shipment = c.one('shipments', line.shipment_id), lot = c.one('stock_lots', line.lot_id), item = c.one('items', lot.item_id)
    const order = c.one('sales_orders', c.one('packing_orders', shipment.packing_order_id).sales_order_id)
    const returned = add(...c.rows('customer_return_receipts', { shipment_line_id: line.id }).map((row) => row.quantity))
    return { id: line.id, shipment_number: shipment.shipment_number, shipment_revision: shipment.revision, sales_order_number: order.sales_order_number, customer_name: c.one('customers', order.customer_id).name, item_id: item.id, sku: item.sku, source_lot_id: lot.id, source_lot_code: lot.lot_code, shipped_quantity: line.quantity, returned_quantity: returned, returnable_quantity: subtract(line.quantity, returned), uom: item.base_uom }
  }), receipts: c.rows('customer_return_receipts').map((row) => ({ ...row, lot_code: c.one('stock_lots', row.lot_id).lot_code, qc_status: c.one('stock_lots', row.lot_id).qc_status })) }
}
const addPackage: CommandHandler = (c, a) => {
  const d = shipmentPackageSchema.parse(a.p_data), line = c.one('shipment_lines', d.shipment_line_id), shipment = c.one('shipments', line.shipment_id)
  c.revision(shipment, d.shipment_revision); c.state(shipment, 'draft')
  const lot = c.one('stock_lots', line.lot_id), item = c.one('items', lot.item_id)
  let amount = d.quantity
  if (d.conversion_id) {
    const conversion = c.one('item_unit_conversions', d.conversion_id); c.state(conversion, 'approved')
    if (conversion.item_id !== item.id || conversion.from_uom !== d.uom || conversion.to_uom !== item.base_uom) throw new Error('UNIT_MISMATCH')
    amount = ratio(d.quantity, conversion.to_quantity, conversion.from_quantity)
  } else if (d.uom !== item.base_uom) throw new Error('UNIT_MISMATCH')
  quantity(amount, item.base_uom)
  if (decimal(add(amount, ...c.rows('shipment_packages', { shipment_line_id: line.id }).map((row) => row.quantity))) > decimal(line.quantity)) throw new Error('PACKAGE_QUANTITY_EXCEEDED')
  const row = c.insert('shipment_packages', { shipment_line_id: line.id, package_code: d.package_code, quantity: amount, uom: item.base_uom })
  if (d.conversion_id) c.insert('unit_conversion_events', { item_id: item.id, conversion_id: d.conversion_id, entity_type: 'shipment_package', entity_id: row.id, input_quantity: d.quantity, input_uom: d.uom, base_quantity: amount, base_uom: item.base_uom })
  c.bump('shipments', shipment); c.audit('shipment_packages', row.id, 'package_created'); return row.id
}
export const custodyCommands: Record<string, CommandHandler> = {
  add_shipment_package: addPackage, add_shipment_package_in_unit: addPackage,
  transform_stock_lot(c, a) {
    const d = transformationSchema.parse({ ...(a.p_data as Row), kind: a.p_kind })
    const sources = d.sources.map((source) => {
      const lot = c.one('stock_lots', source.lot_id); c.revision(lot, source.revision); c.unit(lot.item_id, source.quantity, d.uom); c.available(lot, source.quantity); return lot
    })
    const first = sources[0]!, signature = JSON.stringify(lotTrace(c, first.id).signatures)
    if (lotTrace(c, first.id).signatures.length !== 1 || sources.some((lot) => lot.item_id !== first.item_id || JSON.stringify(lotTrace(c, lot.id).signatures) !== signature)) throw new Error('LOT_CONTEXT_MISMATCH')
    const lot = c.newLot(first.item_id, d.location_id, d.lot_code), amount = add(...d.sources.map((row) => row.quantity))
    const operation = c.insert('lot_transformations', { kind: d.kind, output_lot_id: lot.id, quantity: amount, uom: d.uom, reason: d.reason })
    for (const [index, source] of sources.entries()) {
      const value = d.sources[index]!.quantity
      c.ledger(source, format(-decimal(value)), 'issue', `lot_${d.kind}`, operation.id, d.reason)
      c.insert('lot_genealogy', { parent_lot_id: source.id, child_lot_id: lot.id, transformation_id: operation.id, quantity: value, uom: d.uom }); c.bump('stock_lots', source)
    }
    c.ledger(lot, amount, 'receipt', `lot_${d.kind}`, operation.id, d.reason); c.audit('stock_lots', lot.id, `lot_${d.kind}`, d.reason); return lot.id
  },
  receive_customer_return(c, a) {
    const d = customerReturnSchema.parse(a.p_data), line = c.one('shipment_lines', d.shipment_line_id), shipment = c.one('shipments', line.shipment_id)
    c.revision(shipment, d.shipment_revision); c.state(shipment, 'dispatched')
    const source = c.one('stock_lots', line.lot_id), amount = c.unit(source.item_id, d.quantity, d.uom)
    if (decimal(add(amount, ...c.rows('customer_return_receipts', { shipment_line_id: line.id }).map((row) => row.quantity))) > decimal(line.quantity)) throw new Error('RETURN_QUANTITY_EXCEEDED')
    const lot = c.newLot(source.item_id, d.location_id, d.lot_code)
    const row = c.insert('customer_return_receipts', { ...d, source_lot_id: source.id, lot_id: lot.id, quantity: amount })
    c.ledger(lot, amount, 'receipt', 'customer_return', row.id, d.reason)
    c.insert('lot_genealogy', { parent_lot_id: source.id, child_lot_id: lot.id, customer_return_id: row.id, quantity: amount, uom: d.uom })
    c.bump('shipments', shipment); c.audit('customer_return_receipts', row.id, 'customer_return_received', d.reason); return row.id
  },
  vendor_jobwork_command(c, a) {
    const command = vendorCommandSchema.parse({ action: a.p_action, data: a.p_data }), d = command.data as Row
    if (command.action === 'create') {
      const lot = c.one('stock_lots', d.lot_id); const amount = c.unit(lot.item_id, d.quantity, d.uom); c.available(lot, amount); c.one('suppliers', d.supplier_id)
      const row = c.insert('vendor_orders', { ...d, source_lot_id: lot.id, quantity: amount }); c.audit('vendor_orders', row.id, 'vendor_order_created'); return row.id
    }
    const order = c.one('vendor_orders', d.order_id); c.revision(order, d.revision); c.state(order, 'draft', 'open')
    const position = vendorWorkspace(c).orders.find((row) => row.id === order.id)!, source = c.one('stock_lots', order.source_lot_id)
    let result: Row
    if (command.action === 'close' || command.action === 'cancel') {
      if (decimal(position.at_vendor_quantity) !== 0n || (command.action === 'cancel' && decimal(position.sent_quantity) !== 0n) || (command.action === 'close' && !d.cancel_unsent && decimal(position.remaining_to_send) !== 0n)) throw new Error('VENDOR_CUSTODY_UNACCOUNTED')
      c.bump('vendor_orders', order, { status: command.action === 'close' ? 'closed' : 'cancelled', closed_at: new Date().toISOString(), close_reason: d.reason }); result = order
    } else {
      const amount = c.unit(source.item_id, d.quantity, d.uom)
      if (command.action === 'send') {
        c.revision(source, d.lot_revision); c.available(source, amount)
        if (decimal(amount) > decimal(position.remaining_to_send)) throw new Error('VENDOR_QUANTITY_EXCEEDED')
        result = c.insert('vendor_custody_events', { vendor_order_id: order.id, kind: 'send', quantity_delta: amount, uom: order.uom, reference: d.reference, reason: d.reason })
        c.ledger(source, format(-decimal(amount)), 'issue', 'vendor_send', result.id, d.reason); c.bump('stock_lots', source)
      } else {
        if (decimal(amount) > decimal(position.at_vendor_quantity)) throw new Error('VENDOR_CUSTODY_EXCEEDED')
        const lot = command.action === 'receive' ? c.newLot(source.item_id, d.location_id, d.lot_code) : null
        result = c.insert('vendor_custody_events', { vendor_order_id: order.id, kind: lot ? 'return' : 'loss', quantity_delta: format(-decimal(amount)), uom: order.uom, output_lot_id: lot?.id ?? null, reference: d.reference, certificate_reference: d.certificate_reference || null, reason: d.reason })
        if (lot) { c.ledger(lot, amount, 'receipt', 'vendor_return', result.id, d.reason); c.insert('lot_genealogy', { parent_lot_id: source.id, child_lot_id: lot.id, vendor_receipt_id: result.id, quantity: amount, uom: order.uom }) }
      }
      c.bump('vendor_orders', order, { status: 'open' })
    }
    c.audit('vendor_orders', order.id, `vendor.${command.action}`, d.reason); return result.id
  },
}
