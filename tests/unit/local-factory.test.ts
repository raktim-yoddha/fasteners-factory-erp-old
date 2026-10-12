import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { LocalEngine } from '../../src/local/engine'
import type { Database, Row } from '../../src/local/database'
import { productionWorkspaceSchema } from '../../src/features/production/productionWorkspaceContract'
import { qualityWorkspaceSchema } from '../../src/features/quality/qualityWorkspaceContract'
import { packingWorkspaceSchema } from '../../src/features/dispatch/shipmentPackagesContract'
import { vendorWorkspaceSchema } from '../../src/features/jobwork/vendorJobworkContract'
import { equipmentWorkspaceSchema } from '../../src/features/equipment/equipmentContract'
import { customerReturnWorkspaceSchema } from '../../src/features/dispatch/customerReturnsContract'
import { plantDate } from '../../src/lib/decimal'

it('runs a real SQLite factory from engineering through output, packing, dispatch, returns and vendor custody', () => {
  const connection = new DatabaseSync(':memory:')
  const database: Database = { exec(sql, values = []) { if (values.length) connection.prepare(sql).run(...values); else connection.exec(sql) }, all(sql, values = []) { return connection.prepare(sql).all(...values) as Row[] }, register(name, handler) { connection.function(name, { deterministic: true }, handler) } }
  const engine = new LocalEngine(database), store = engine.store
  const companyId = engine.execute({ operation: 'command', name: 'bootstrap_initial_company', args: { p_company_name: 'SAMPLE Factory', p_plant_name: 'SAMPLE Plant' } }) as string
  const run = (name: string, args: Row = {}) => engine.execute({ operation: 'command', name, args: { p_company_id: companyId, p_idempotency_key: crypto.randomUUID(), ...args } }) as string
  const production = (action: string, data: Row) => run('production_command', { p_action: action, p_data: data })
  const quality = (action: string, data: Row) => run('quality_command', { p_action: action, p_data: data })
  const add = (table: string, row: Row) => store.insert(table, { company_id: companyId, ...row })
  const plant = store.rows('plants')[0]!, warehouse = add('warehouses', { plant_id: plant.id, code: 'SAMPLE', name: 'SAMPLE Warehouse' })
  const location = add('stock_locations', { warehouse_id: warehouse.id, code: 'SAMPLE', name: 'SAMPLE Bin' })
  const raw = add('items', { sku: 'SAMPLE-WIRE', description: 'SAMPLE Wire', base_uom: 'kg' }), bolt = add('items', { sku: 'SAMPLE-BOLT', description: 'SAMPLE Bolt', base_uom: 'pcs' })
  const customer = add('customers', { code: 'SAMPLE-C', name: 'SAMPLE Customer' }), supplier = add('suppliers', { code: 'SAMPLE-S', name: 'SAMPLE Supplier' }), centre = add('work_centres', { plant_id: plant.id, code: 'SAMPLE-M', name: 'SAMPLE Machine' })
  const pkg = production('create_package', { item_id: bolt.id, revision_label: 'A', basis_quantity: '10', components: [{ item_id: raw.id, quantity: '2', uom: 'kg', scrap_allowance_pct: '0' }], operations: [{ sequence: 1, work_centre_id: centre.id, name: 'SAMPLE Heading' }] })
  production('approve_package', { package_id: pkg })
  const recipe = store.one('engineering_packages', pkg)
  expect(() => store.update('bom_revisions', recipe.bom_revision_id, { output_basis_quantity: '11' })).toThrow('IMMUTABLE_APPROVED_VERSION')
  const createPlan = (item: unknown, label: string) => {
    const id = quality('create_plan', { item_id: item, label, version: 'A', sample_size: 1, characteristics: [{ key: 'appearance', label: 'SAMPLE Appearance', type: 'attribute', expected: 'SAMPLE Pass' }] })
    quality('approve_plan', { plan_id: id }); return id
  }
  const rawPlan = createPlan(raw.id, 'SAMPLE Incoming'), boltPlan = createPlan(bolt.id, 'SAMPLE Final')
  const inspect = (lotId: unknown, planId: string, kind: string) => {
    quality('inspect', { plan_id: planId, lot_id: lotId, job_card_id: null, kind, revision: store.one('stock_lots', lotId).revision, readings: [{ key: 'appearance', values: ['SAMPLE Pass'] }], reason: 'SAMPLE observation', supersedes_id: null })
    run('release_stock_lot', { p_lot_id: lotId, p_expected_revision: store.one('stock_lots', lotId).revision })
  }
  const rawLot = run('receive_finished_goods', { p_item_id: raw.id, p_location_id: location.id, p_lot_code: 'SAMPLE-RAW', p_quantity: '100', p_uom: 'kg' })
  inspect(rawLot, rawPlan, 'incoming')
  const rfq = run('create_rfq', { p_rfq_number: 'SAMPLE-RFQ', p_customer_id: customer.id, p_requirement_summary: 'SAMPLE Bolt enquiry', p_lines: [{ item_id: bolt.id, requested_description: 'SAMPLE Bolt', quantity: '100', uom: 'pcs', required_by: null }] })
  run('record_feasibility', { p_rfq_id: rfq, p_status: 'feasible', p_bom_revision_id: recipe.bom_revision_id, p_routing_revision_id: recipe.routing_revision_id, p_drawing_revision_id: null, p_conditions: '', p_expected_rfq_revision: 1 })
  const quote = run('create_quotation', { p_rfq_id: rfq, p_quotation_number: 'SAMPLE-Q', p_currency_code: 'INR', p_valid_until: '2099-12-31', p_lines: [{ item_id: bolt.id, quantity: '100', uom: 'pcs', unit_price: '3.25', pricing_source: 'SAMPLE Cost sheet', bom_revision_id: recipe.bom_revision_id, routing_revision_id: recipe.routing_revision_id, customer_part_reference_id: null }] })
  run('approve_quotation', { p_quotation_id: quote, p_expected_revision: 1 })
  const order = run('accept_quotation_create_sales_order', { p_quotation_id: quote, p_expected_quotation_revision: 2, p_sales_order_number: 'SAMPLE-SO', p_customer_po_number: 'SAMPLE-PO', p_promised_date: '2099-12-31' })
  const line = store.rows('sales_order_lines')[0]!
  const work = production('create_work_order', { sales_order_line_id: line.id, package_id: pkg, number: 'SAMPLE-WO', quantity: '100', start_date: '2026-10-12', due_date: '2026-10-13' })
  production('release_work_order', { work_order_id: work, revision: 1 })
  const job = store.rows('job_cards')[0]!
  production('start_job', { job_card_id: job.id, revision: 1 })
  expect(() => production('complete_job', { job_card_id: job.id, revision: 2, good_quantity: '95', scrap_quantity: '5', reason: 'SAMPLE Yield' })).toThrow('MATERIAL_UNACCOUNTED')
  const issue = production('issue_material', { work_order_id: work, job_card_id: job.id, lot_id: rawLot, lot_revision: store.one('stock_lots', rawLot).revision, quantity: '20', uom: 'kg' })
  production('consume_material', { issue_id: issue, quantity: '20', reason: 'SAMPLE consumption' })
  production('complete_job', { job_card_id: job.id, revision: 2, good_quantity: '95', scrap_quantity: '5', reason: 'SAMPLE Yield' })
  const output = production('record_output', { work_order_id: work, location_id: location.id, lot_code: 'SAMPLE-OUTPUT', quantity: '95', uom: 'pcs' })
  const outputLot = store.one('production_outputs', output).lot_id
  expect(() => production('close_work_order', { work_order_id: work, revision: store.one('work_orders', work).revision })).toThrow('QUALITY_PENDING')
  inspect(outputLot, boltPlan, 'final')
  production('close_work_order', { work_order_id: work, revision: store.one('work_orders', work).revision })
  const reservation = run('reserve_finished_goods', { p_sales_order_line_id: line.id, p_lot_id: outputLot, p_quantity: '95', p_expected_sales_order_revision: 1 })
  const shipment = run('prepare_packing_shipment', { p_sales_order_id: order, p_expected_sales_order_revision: 2, p_packing_number: 'SAMPLE-PACK', p_shipment_number: 'SAMPLE-SHIP', p_lines: [{ reservation_id: reservation, quantity: '95' }] })
  expect(() => run('dispatch_shipment', { p_shipment_id: shipment, p_expected_shipment_revision: 1 })).toThrow('PACKAGE_QUANTITY_MISMATCH')
  const shipmentLine = store.rows('shipment_lines')[0]!
  run('add_shipment_package', { p_data: { shipment_line_id: shipmentLine.id, shipment_revision: 1, quantity: '95', uom: 'pcs', package_code: 'SAMPLE-BOX' } })
  run('dispatch_shipment', { p_shipment_id: shipment, p_expected_shipment_revision: 2 })
  const returned = run('receive_customer_return', { p_data: { shipment_line_id: shipmentLine.id, shipment_revision: 3, location_id: location.id, return_number: 'SAMPLE-RETURN', lot_code: 'SAMPLE-RETURNED', quantity: '10', uom: 'pcs', reference: 'SAMPLE Reference', reason: 'SAMPLE Return' } })
  expect(store.one('stock_lots', store.one('customer_return_receipts', returned).lot_id).qc_status).toBe('hold')
  const vendor = run('vendor_jobwork_command', { p_action: 'create', p_data: { lot_id: rawLot, supplier_id: supplier.id, number: 'SAMPLE-VENDOR', process: 'SAMPLE Annealing', quantity: '5', uom: 'kg', due_date: '2099-12-31' } })
  run('vendor_jobwork_command', { p_action: 'send', p_data: { order_id: vendor, revision: 1, lot_revision: store.one('stock_lots', rawLot).revision, quantity: '5', uom: 'kg', reference: 'SAMPLE Challan', reason: 'SAMPLE Send' } })
  expect(() => run('vendor_jobwork_command', { p_action: 'close', p_data: { order_id: vendor, revision: 2, reason: 'SAMPLE Close', cancel_unsent: false } })).toThrow('VENDOR_CUSTODY_UNACCOUNTED')
  run('vendor_jobwork_command', { p_action: 'receive', p_data: { order_id: vendor, revision: 2, quantity: '5', uom: 'kg', reference: 'SAMPLE Return', reason: 'SAMPLE Receive', location_id: location.id, lot_code: 'SAMPLE-VENDOR-RETURN', certificate_reference: '' } })
  run('vendor_jobwork_command', { p_action: 'close', p_data: { order_id: vendor, revision: 3, reason: 'SAMPLE Close', cancel_unsent: false } })
  const gauge = run('equipment_command', { p_action: 'create_asset', p_data: { code: 'SAMPLE-GAUGE', name: 'SAMPLE Gauge', kind: 'gauge', work_centre_id: centre.id, requires_maintenance: false, reason: 'SAMPLE Setup' } })
  run('equipment_command', { p_action: 'calibration', p_data: { asset_id: gauge, checked_on: plantDate(), next_due: '2099-12-31', passed: true, reference: 'SAMPLE Calibration', reason: 'SAMPLE Evidence' } })
  expect(equipmentWorkspaceSchema.parse(engine.execute({ operation: 'command', name: 'get_equipment_workspace', args: { p_company_id: companyId } })).assets[0]?.blocked_reason).toBeNull()
  for (const [name, schema] of [['get_production_workspace', productionWorkspaceSchema], ['get_quality_workspace', qualityWorkspaceSchema], ['get_packing_workspace', packingWorkspaceSchema], ['get_vendor_workspace', vendorWorkspaceSchema], ['get_customer_return_workspace', customerReturnWorkspaceSchema]] as const) expect(() => schema.parse(engine.execute({ operation: 'command', name, args: { p_company_id: companyId } }))).not.toThrow()
  expect(connection.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  connection.close()
})
