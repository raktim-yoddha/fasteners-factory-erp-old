import { productionCommandSchema } from '@/features/production/productionWorkspaceContract'
import { type CommandContext, type CommandHandler } from './context'
import type { Row } from './database'
import { add, decimal, format, quantity, requirement, subtract } from './exact'
import { activeAssignments, assetBlockReason } from './equipment'
import { lotTrace } from './trace'

export function issuePositions(c: CommandContext): Row[] {
  return c.rows('material_issues').map((row) => ({ ...row, remaining_quantity: subtract(row.quantity, add(...c.rows('material_events', { issue_id: row.id }).map((event) => event.quantity))) }))
}
export function materialPositions(c: CommandContext): Row[] {
  return c.rows('work_order_requirements').map((row) => {
    const issues = issuePositions(c).filter((issue) => issue.work_order_id === row.work_order_id && issue.item_id === row.item_id)
    const consumed = add(...issues.flatMap((issue) => c.rows('material_events', { issue_id: issue.id, kind: 'consume' }).map((event) => event.quantity)))
    return { ...row, consumed_quantity: consumed, wip_quantity: add(...issues.map((issue) => issue.remaining_quantity)), available_quantity: add(...c.rows('stock_lots', { item_id: row.item_id }).map((lot) => c.position(lot.id).available_to_promise)), expected_receipts: '0' }
  })
}
export function productionWorkspace(c: CommandContext) {
  return {
    packages: c.rows('engineering_packages').map((pkg) => {
      const bom = c.one('bom_revisions', pkg.bom_revision_id)
      return { ...pkg, basis_quantity: bom.output_basis_quantity, uom: bom.output_basis_uom, components: c.rows('bom_lines', { bom_revision_id: bom.id }).map((row) => ({ ...row, item_id: row.component_item_id })), operations: c.rows('routing_operations', { routing_revision_id: pkg.routing_revision_id }).map((row) => ({ ...row, name: row.operation_name })) }
    }),
    demand: c.rows('sales_order_lines').map((line): Row => {
      const order = c.one('sales_orders', line.sales_order_id)
      const planned = add(...c.rows('work_orders', { sales_order_line_id: line.id }).filter((row) => !row.source_ncr_id).map((row) => row.status === 'closed' ? subtract(row.quantity, add(...c.rows('job_cards', { work_order_id: row.id }).map((job) => job.scrap_quantity))) : row.quantity))
      return { ...line, order_number: order.sales_order_number, promised_date: order.promised_date, planned_quantity: planned, remaining_to_plan: subtract(line.ordered_quantity, planned) }
    }),
    works: c.rows('work_orders').map((row) => ({ ...row, approved_rework_lot_id: row.source_ncr_id ? c.one('ncrs', row.source_ncr_id).lot_id : null })),
    jobs: c.rows('job_cards'), requirements: materialPositions(c), issues: issuePositions(c), outputs: c.rows('production_outputs'), workCentres: c.rows('work_centres'),
  }
}
function materialsAccounted(c: CommandContext, workId: unknown, close = false) {
  if (materialPositions(c).some((row) => row.work_order_id === workId && (decimal(row.consumed_quantity) < decimal(row.required_quantity) || (close && decimal(row.wip_quantity) !== 0n)))) throw new Error('MATERIAL_UNACCOUNTED')
}
export function createWork(c: CommandContext, d: Row, line: Row, pkg: Row, sourceNcr: Row | null = null) {
  c.state(pkg, 'approved')
  if (pkg.item_id !== line.item_id || (!sourceNcr && ((line.bom_revision_id && line.bom_revision_id !== pkg.bom_revision_id) || (line.routing_revision_id && line.routing_revision_id !== pkg.routing_revision_id)))) throw new Error('ENGINEERING_PIN_MISMATCH')
  if (String(d.due_date) < String(d.start_date)) throw new Error('INVALID_DATES')
  const amount = c.unit(line.item_id, d.quantity, line.uom)
  const work = c.insert('work_orders', { ...d, sales_order_line_id: line.id, item_id: line.item_id, quantity: amount, uom: line.uom, bom_revision_id: pkg.bom_revision_id, routing_revision_id: pkg.routing_revision_id, drawing_revision_id: line.drawing_revision_id ?? null, item_specification_id: line.item_specification_id ?? null, customer_part_reference_id: line.customer_part_reference_id ?? null, source_ncr_id: sourceNcr?.id ?? null })
  const bom = c.one('bom_revisions', pkg.bom_revision_id)
  if (sourceNcr) c.insert('work_order_requirements', { work_order_id: work.id, item_id: line.item_id, required_quantity: amount, uom: line.uom })
  else for (const component of c.rows('bom_lines', { bom_revision_id: bom.id })) c.insert('work_order_requirements', { work_order_id: work.id, item_id: component.component_item_id, required_quantity: requirement(component.quantity, amount, bom.output_basis_quantity, component.scrap_allowance_pct, component.uom), uom: component.uom })
  return work
}
export const productionCommand: CommandHandler = (c, args) => {
  const command = productionCommandSchema.parse({ action: args.p_action, data: args.p_data })
  const d = command.data as Row
  let result: Row
  if (command.action === 'create_package') {
    const item = c.one('items', d.item_id); quantity(d.basis_quantity, item.base_uom)
    const components = d.components as Row[], operations = d.operations as Row[]
    if (new Set(components.map((row) => row.item_id)).size !== components.length || new Set(operations.map((row) => row.sequence)).size !== operations.length) throw new Error('DUPLICATE_ENGINEERING_LINE')
    const bomMaster = c.rows('boms', { output_item_id: item.id })[0] ?? c.insert('boms', { output_item_id: item.id, name: `${item.sku} BOM` })
    const routeMaster = c.rows('routings', { output_item_id: item.id })[0] ?? c.insert('routings', { output_item_id: item.id, name: `${item.sku} routing` })
    const bom = c.insert('bom_revisions', { bom_id: bomMaster.id, revision: d.revision_label, output_basis_quantity: d.basis_quantity, output_basis_uom: item.base_uom })
    const route = c.insert('routing_revisions', { routing_id: routeMaster.id, revision: d.revision_label })
    for (const line of components) { c.unit(line.item_id, line.quantity, line.uom); c.insert('bom_lines', { ...line, bom_revision_id: bom.id, component_item_id: line.item_id }) }
    for (const op of operations) { if (c.one('work_centres', op.work_centre_id).active !== true) throw new Error('WORK_CENTRE_UNAVAILABLE'); c.insert('routing_operations', { ...op, routing_revision_id: route.id, operation_name: op.name }) }
    result = c.insert('engineering_packages', { item_id: item.id, label: d.revision_label, bom_revision_id: bom.id, routing_revision_id: route.id })
  } else if (command.action === 'approve_package') {
    result = c.one('engineering_packages', d.package_id); c.state(result, 'draft')
    const bom = c.one('bom_revisions', result.bom_revision_id), route = c.one('routing_revisions', result.routing_revision_id)
    c.state(bom, 'draft'); c.state(route, 'draft')
    if (!c.rows('bom_lines', { bom_revision_id: bom.id }).length || !c.rows('routing_operations', { routing_revision_id: route.id }).length) throw new Error('ENGINEERING_INCOMPLETE')
    for (const [table, row] of [['bom_revisions', bom], ['routing_revisions', route]] as const) c.update(table, row, { status: 'approved', approved_by: c.actor, approved_at: new Date().toISOString() })
    c.update('engineering_packages', result, { status: 'approved' })
  } else if (command.action === 'create_work_order') {
    const line = c.one('sales_order_lines', d.sales_order_line_id); c.state(c.one('sales_orders', line.sales_order_id), 'open', 'partially_shipped')
    const demand = productionWorkspace(c).demand.find((row) => row.id === line.id)!
    const externalReservations = c.rows('stock_reservations', { sales_order_line_id: line.id }).filter((row) => !c.rows('production_outputs', { lot_id: row.lot_id }).length)
    const committed = add(demand.planned_quantity, ...externalReservations.map((row) => row.status === 'active' ? row.quantity : row.consumed_quantity))
    if (decimal(add(committed, d.quantity)) > decimal(line.ordered_quantity)) throw new Error('ORDER_QUANTITY_EXCEEDED')
    result = createWork(c, d, line, c.one('engineering_packages', d.package_id))
  } else if (command.action === 'release_work_order') {
    result = c.one('work_orders', d.work_order_id); c.revision(result, d.revision); c.state(result, 'draft')
    if (!result.source_ncr_id && materialPositions(c).some((row) => row.work_order_id === result.id && decimal(row.available_quantity) < decimal(row.required_quantity))) throw new Error('MATERIAL_SHORTAGE')
    for (const op of c.rows('routing_operations', { routing_revision_id: result.routing_revision_id })) { if (c.one('work_centres', op.work_centre_id).active !== true) throw new Error('WORK_CENTRE_UNAVAILABLE'); c.insert('job_cards', { work_order_id: result.id, sequence: op.sequence, name: op.operation_name, work_centre_id: op.work_centre_id, planned_quantity: result.quantity, uom: result.uom }) }
    c.bump('work_orders', result, { status: 'released' })
  } else if (command.action === 'start_job' || command.action === 'complete_job') {
    result = c.one('job_cards', d.job_card_id); c.revision(result, d.revision)
    const work = c.one('work_orders', result.work_order_id); c.state(work, 'released', 'in_progress')
    const jobs = c.rows('job_cards', { work_order_id: work.id }).sort((a, b) => Number(a.sequence) - Number(b.sequence))
    if (jobs.some((row) => Number(row.sequence) < Number(result.sequence) && row.status !== 'completed')) throw new Error('PREDECESSOR_PENDING')
    if (command.action === 'start_job') {
      c.state(result, 'pending')
      if (c.one('work_centres', result.work_centre_id).active !== true) throw new Error('WORK_CENTRE_UNAVAILABLE')
      for (const assignment of activeAssignments(c).filter((row) => row.job_card_id === result.id)) {
        const reason = assetBlockReason(c, assignment.asset_id)
        if (reason) throw new Error(`EQUIPMENT_NOT_READY: ${reason}`)
      }
      const previous = jobs.filter((row) => Number(row.sequence) < Number(result.sequence)).at(-1)
      const planned = previous?.good_quantity ?? work.quantity
      c.bump('job_cards', result, { status: decimal(planned) === 0n ? 'completed' : 'in_progress', planned_quantity: planned, started_at: new Date().toISOString() })
    } else {
      c.state(result, 'in_progress'); c.reason(d.reason)
      if (!jobs.some((row) => Number(row.sequence) > Number(result.sequence))) materialsAccounted(c, work.id)
      const good = add(result.good_quantity, d.good_quantity), scrap = add(result.scrap_quantity, d.scrap_quantity), total = add(good, scrap)
      if (decimal(d.good_quantity) < 0n || decimal(d.scrap_quantity) < 0n || decimal(add(d.good_quantity, d.scrap_quantity)) <= 0n || decimal(total) > decimal(result.planned_quantity)) throw new Error('OPERATION_QUANTITY_EXCEEDED')
      if (c.rows('inspections', { job_card_id: result.id }).at(-1)?.result === 'failed') throw new Error('QUALITY_PENDING')
      c.bump('job_cards', result, { good_quantity: good, scrap_quantity: scrap, status: decimal(total) === decimal(result.planned_quantity) ? 'completed' : 'in_progress', completed_at: decimal(total) === decimal(result.planned_quantity) ? new Date().toISOString() : null })
    }
    c.bump('work_orders', work, { status: 'in_progress' })
  } else if (command.action === 'issue_material') {
    const work = c.one('work_orders', d.work_order_id); c.state(work, 'released', 'in_progress')
    const job = c.one('job_cards', d.job_card_id)
    if (job.work_order_id !== work.id || job.status === 'completed') throw new Error('JOB_CARD_NOT_FOUND')
    const lot = c.one('stock_lots', d.lot_id); c.revision(lot, d.lot_revision); const amount = c.unit(lot.item_id, d.quantity, d.uom)
    const rework = work.source_ncr_id ? c.one('ncrs', work.source_ncr_id) : null
    if (rework?.lot_id !== lot.id) c.available(lot, amount)
    const material = materialPositions(c).find((row) => row.work_order_id === work.id && row.item_id === lot.item_id)
    if (!material || decimal(add(material.wip_quantity, material.consumed_quantity, amount)) > decimal(material.required_quantity)) throw new Error('MATERIAL_REQUIREMENT_EXCEEDED')
    result = c.insert('material_issues', { ...d, item_id: lot.item_id, quantity: amount })
    c.ledger(lot, format(-decimal(amount)), 'issue', 'material_issue', result.id); c.bump('stock_lots', lot)
  } else if (command.action === 'return_material' || command.action === 'consume_material') {
    const issue = c.one('material_issues', d.issue_id); c.state(c.one('work_orders', issue.work_order_id), 'released', 'in_progress')
    const balance = issuePositions(c).find((row) => row.id === issue.id)!, amount = quantity(d.quantity, issue.uom)
    if (decimal(amount) > decimal(balance.remaining_quantity)) throw new Error('ISSUE_QUANTITY_EXCEEDED')
    result = c.insert('material_events', { issue_id: issue.id, kind: command.action === 'return_material' ? 'return' : 'consume', quantity: amount, reason: c.reason(d.reason) })
    if (command.action === 'return_material') { const lot = c.one('stock_lots', issue.lot_id); c.revision(lot, d.lot_revision); c.ledger(lot, amount, 'reversal', 'material_return', result.id, d.reason); c.bump('stock_lots', lot, { qc_status: 'hold' }) }
  } else if (command.action === 'record_output') {
    const work = c.one('work_orders', d.work_order_id); c.state(work, 'released', 'in_progress'); const amount = c.unit(work.item_id, d.quantity, d.uom)
    const jobs = c.rows('job_cards', { work_order_id: work.id }).sort((a, b) => Number(a.sequence) - Number(b.sequence))
    if (!jobs.length || jobs.some((row) => row.status !== 'completed')) throw new Error('OPERATIONS_PENDING')
    materialsAccounted(c, work.id)
    if (decimal(add(amount, ...c.rows('production_outputs', { work_order_id: work.id }).map((row) => row.quantity))) > decimal(jobs.at(-1)!.good_quantity)) throw new Error('OUTPUT_QUANTITY_EXCEEDED')
    const lot = c.newLot(work.item_id, d.location_id, d.lot_code)
    result = c.insert('production_outputs', { work_order_id: work.id, lot_id: lot.id, quantity: amount, uom: work.uom })
    c.ledger(lot, amount, 'production_receipt', 'production_output', result.id)
    for (const issue of c.rows('material_issues', { work_order_id: work.id })) if (c.rows('material_events', { issue_id: issue.id, kind: 'consume' }).length) c.insert('lot_genealogy', { parent_lot_id: issue.lot_id, child_lot_id: lot.id, work_order_id: work.id, source_issue_id: issue.id })
  } else {
    result = c.one('work_orders', d.work_order_id); c.revision(result, d.revision); c.state(result, 'released', 'in_progress')
    const jobs = c.rows('job_cards', { work_order_id: result.id })
    if (!jobs.length || jobs.some((row) => row.status !== 'completed')) throw new Error('OPERATIONS_PENDING')
    materialsAccounted(c, result.id, true)
    const outputs = c.rows('production_outputs', { work_order_id: result.id })
    if (decimal(add(...outputs.map((row) => row.quantity), ...jobs.map((row) => row.scrap_quantity))) !== decimal(result.quantity)) throw new Error('OUTPUT_UNACCOUNTED')
    if (outputs.some((row) => c.one('stock_lots', row.lot_id).qc_status !== 'released' && decimal(c.position(row.lot_id).on_hand) !== 0n)) throw new Error('QUALITY_PENDING')
    if (c.rows('stock_lots').some((lot) => lotTrace(c, lot.id).work_order_ids.includes(result.id) && decimal(c.position(lot.id).on_hand) > 0n && lot.qc_status !== 'released')) throw new Error('QUALITY_PENDING')
    c.bump('work_orders', result, { status: 'closed' })
    if (result.source_ncr_id) { const ncr = c.one('ncrs', result.source_ncr_id); c.bump('ncrs', ncr, { status: 'resolved' }) }
  }
  c.audit('production', result.id, `production.${command.action}`, d.reason ?? null); return result.id
}
