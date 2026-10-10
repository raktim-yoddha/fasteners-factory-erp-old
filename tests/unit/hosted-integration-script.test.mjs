import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync(new URL('../integration/hosted-manufacturing-path.sql', import.meta.url), 'utf8')

describe('hosted manufacturing integration script', () => {
  it('exercises every implemented protected transition and rolls back SAMPLE data', () => {
    for (const command of ['bootstrap_initial_company', 'create_rfq', 'record_feasibility', 'create_quotation', 'approve_quotation', 'accept_quotation_create_sales_order', 'receive_finished_goods', 'release_stock_lot', 'reserve_finished_goods', 'prepare_packing_shipment', 'dispatch_shipment', 'get_order_command_center']) {
      expect(script).toContain(`public.${command}`)
    }
    for (const assertion of ['SAMPLE_UNAUTHORIZED_APPROVAL_ALLOWED', 'SAMPLE_GLOBAL_SEARCH_MISSING_RESULT', 'SAMPLE_GLOBAL_SEARCH_UNAUTHORIZED_RESULT', 'SAMPLE_APPROVED_BOM_REVISION_MUTABLE', 'SAMPLE_APPROVED_ROUTING_REVISION_MUTABLE', 'SAMPLE_APPROVED_BOM_LINE_MUTABLE', 'SAMPLE_APPROVED_ROUTING_OPERATION_MUTABLE', 'SAMPLE_RESERVATION_NOT_IDEMPOTENT', 'SAMPLE_OVERSELL_ALLOWED', 'SAMPLE_DISPATCH_NOT_IDEMPOTENT', 'SAMPLE_DISPATCH_LEDGER_DUPLICATED']) {
      expect(script).toContain(assertion)
    }
    for (const table of ['customers', 'suppliers', 'items', 'drawings', 'work_centres', 'warehouses', 'stock_locations']) {
      expect(script).toContain(`insert into public.${table}`)
    }
    expect(script).toContain('SAMPLE_UNAUTHORIZED_MASTER_DATA_ALLOWED')
    expect(script.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
