import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync(new URL('../integration/hosted-manufacturing-path.sql', import.meta.url), 'utf8')

describe('hosted manufacturing integration script', () => {
  it('exercises every implemented protected transition and rolls back SAMPLE data', () => {
    for (const command of ['bootstrap_initial_company', 'create_rfq', 'record_feasibility', 'create_quotation', 'approve_quotation', 'accept_quotation_create_sales_order', 'receive_finished_goods', 'release_stock_lot', 'reserve_finished_goods', 'prepare_packing_shipment', 'dispatch_shipment', 'get_order_command_center']) {
      expect(script).toContain(`public.${command}`)
    }
    expect(script.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
