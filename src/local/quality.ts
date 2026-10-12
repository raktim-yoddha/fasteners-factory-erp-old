import { qualityCommandSchema } from '@/features/quality/qualityWorkspaceContract'
import { type CommandContext, type CommandHandler } from './context'
import { createWork } from './production'
import type { Row } from './database'
import { decimal, format, quantity, subtract } from './exact'
import { assetBlockReason } from './equipment'
import { lotTrace } from './trace'

export function qualityWorkspace(c: CommandContext) {
  return {
    plans: c.rows('inspection_plans'), inspections: c.rows('inspections').reverse(),
    ncrs: c.rows('ncrs').map((row) => ({ ...row, rework_work_order_id: c.rows('work_orders', { source_ncr_id: row.id })[0]?.id ?? null })),
    genealogy: c.rows('lot_genealogy'),
    contexts: c.rows('stock_lots').map((lot) => ({ lot_id: lot.id, ...lotTrace(c, lot.id) })),
    receipts: c.rows('goods_receipts').map((receipt) => ({ ...receipt, supplier_name: c.one('suppliers', c.one('purchase_orders', receipt.purchase_order_id).supplier_id).name })),
    shipments: c.rows('shipment_lines').map((line) => ({ ...line, shipment_number: c.one('shipments', line.shipment_id).shipment_number, status: c.one('shipments', line.shipment_id).status, uom: c.one('items', c.one('stock_lots', line.lot_id).item_id).base_uom })),
    customerReceipts: c.rows('customer_return_receipts').map((row) => ({ ...row, shipment_number: c.one('shipments', c.one('shipment_lines', row.shipment_line_id).shipment_id).shipment_number })),
    processReceipts: c.rows('vendor_custody_events', { kind: 'return' }).map((row) => { const order = c.one('vendor_orders', row.vendor_order_id); return { ...row, lot_id: row.output_lot_id, vendor_order_number: order.number, process: order.process, supplier_name: c.one('suppliers', order.supplier_id).name } }),
  }
}
export const qualityCommand: CommandHandler = (c, args) => {
  const command = qualityCommandSchema.parse({ action: args.p_action, data: args.p_data }), d = command.data as Row
  let result: Row
  if (command.action === 'create_plan') {
    c.one('items', d.item_id)
    for (const row of d.characteristics as Row[]) if (row.type === 'numeric' && decimal(row.min) > decimal(row.max)) throw new Error('INSPECTION_PLAN_INVALID')
    result = c.insert('inspection_plans', d)
  } else if (command.action === 'approve_plan') {
    result = c.one('inspection_plans', d.plan_id); c.state(result, 'draft')
    c.update('inspection_plans', result, { status: 'approved', approved_by: c.actor, approved_at: new Date().toISOString() })
  } else if (command.action === 'inspect') {
    const plan = c.one('inspection_plans', d.plan_id); c.state(plan, 'approved')
    for (const gauge of c.rows('inspection_plan_gauges', { plan_id: plan.id })) {
      const reason = assetBlockReason(c, gauge.asset_id)
      if (reason) throw new Error(`EQUIPMENT_NOT_READY: ${reason}`)
    }
    const lot = d.lot_id ? c.one('stock_lots', d.lot_id) : null, job = d.job_card_id ? c.one('job_cards', d.job_card_id) : null
    c.revision((lot ?? job)!, d.revision)
    const itemId = lot?.item_id ?? c.one('work_orders', job!.work_order_id).item_id
    if (plan.item_id !== itemId || (lot && lot.qc_status === 'released') || (job && (job.status !== 'in_progress' || d.kind !== 'in_process'))) throw new Error('INSPECTION_CONTEXT_MISMATCH')
    if (lot) {
      const requiresFinal = qualityWorkspace(c).contexts.find((row) => row.lot_id === lot.id)!.requires_final || c.rows('customer_return_receipts', { lot_id: lot.id }).length > 0
      if ((d.kind === 'final') !== requiresFinal) throw new Error('INSPECTION_CONTEXT_MISMATCH')
    }
    const prior = c.rows('inspections', { lot_id: lot?.id ?? null, job_card_id: job?.id ?? null }).at(-1)
    if ((prior?.id ?? null) !== (d.supersedes_id ?? null)) throw new Error('INSPECTION_SUPERSESSION_REQUIRED')
    const characteristics = plan.characteristics as Row[], readings = d.readings as Row[]
    if (readings.length !== characteristics.length) throw new Error('MEASUREMENTS_REQUIRED')
    let passed = true
    for (const characteristic of characteristics) {
      const matches = readings.filter((row) => row.key === characteristic.key)
      if (matches.length !== 1) throw new Error('MEASUREMENTS_REQUIRED')
      const reading = matches[0]!, values = reading.values as string[]
      if (values.length !== plan.sample_size) throw new Error('SAMPLE_COUNT_MISMATCH')
      if (characteristic.type === 'numeric') {
        if (characteristic.uom !== reading.uom) throw new Error('UNIT_MISMATCH')
        for (const value of values) if (decimal(value) < decimal(characteristic.min) || decimal(value) > decimal(characteristic.max)) passed = false
      } else if (values.some((value) => value.trim().toLowerCase() !== String(characteristic.expected).trim().toLowerCase())) passed = false
    }
    result = c.insert('inspections', { ...d, lot_revision: lot?.revision ?? null, job_revision: job?.revision ?? null, result: passed ? 'passed' : 'failed', inspector_id: c.actor })
  } else if (command.action === 'create_ncr') {
    const lot = c.one('stock_lots', d.lot_id); c.revision(lot, d.revision)
    const amount = quantity(d.quantity, c.one('items', lot.item_id).base_uom)
    if (decimal(amount) > decimal(c.position(lot.id).on_hand)) throw new Error('INSUFFICIENT_ON_HAND_STOCK')
    if (c.rows('ncrs', { lot_id: lot.id }).some((row) => row.status !== 'resolved')) throw new Error('NCR_ALREADY_OPEN')
    result = c.insert('ncrs', { lot_id: lot.id, quantity: amount, uom: c.one('items', lot.item_id).base_uom, reason: d.reason, inspection_id: c.rows('inspections', { lot_id: lot.id }).at(-1)?.id ?? null })
    c.bump('stock_lots', lot, { qc_status: 'hold' })
  } else {
    result = c.one('ncrs', d.ncr_id); c.revision(result, d.revision); c.state(result, 'open')
    const lot = c.one('stock_lots', result.lot_id)
    let status = 'resolved'
    if (d.disposition === 'scrap') {
      const position = c.position(lot.id)
      if (decimal(result.quantity) > decimal(subtract(position.on_hand, position.reserved))) throw new Error('INSUFFICIENT_AVAILABLE_STOCK')
      c.ledger(lot, format(-decimal(result.quantity)), 'issue', 'ncr_scrap', result.id, d.reason)
      c.bump('stock_lots', lot, { qc_status: decimal(c.position(lot.id).on_hand) === 0n ? 'rejected' : 'hold' })
    } else if (d.disposition === 'supplier_return') {
      if (!c.rows('goods_receipts', { lot_id: lot.id }).length) throw new Error('RECEIPT_NOT_FOUND')
      status = 'awaiting_return'
    } else if (d.disposition === 'rework') {
      const pkg = c.one('engineering_packages', d.package_id)
      if (!c.rows('bom_lines', { bom_revision_id: pkg.bom_revision_id }).some((row) => row.component_item_id === lot.item_id)) throw new Error('REWORK_PACKAGE_REQUIRED')
      const output = c.rows('production_outputs', { lot_id: lot.id })[0]
      const parent = output ? c.one('work_orders', output.work_order_id) : null
      const line = parent?.sales_order_line_id ? c.one('sales_order_lines', parent.sales_order_line_id) : { id: null, item_id: lot.item_id, uom: result.uom }
      const work = createWork(c, { ...d, quantity: result.quantity }, line, pkg, result)
      if (parent) c.update('work_orders', work, { parent_work_order_id: parent.id })
      status = 'awaiting_rework'
    } else c.bump('stock_lots', lot, { qc_status: 'hold' })
    c.bump('ncrs', result, { disposition: d.disposition, status, review_reason: d.reason, reviewed_by: c.actor })
  }
  c.audit('quality', result.id, `quality.${command.action}`, d.reason ?? null); return result.id
}
