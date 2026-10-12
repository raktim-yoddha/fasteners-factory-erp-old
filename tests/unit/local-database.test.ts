import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { LocalEngine } from '../../src/local/engine'
import { decimal, format, ratio } from '../../src/local/exact'
import type { Database, Row } from '../../src/local/database'

function setup() {
  const connection = new DatabaseSync(':memory:')
  const database: Database = {
    exec(sql, values = []) { if (values.length) connection.prepare(sql).run(...values); else connection.exec(sql) },
    all(sql, values = []) { return connection.prepare(sql).all(...values) as Row[] },
    register(name, handler) { connection.function(name, { deterministic: true }, handler) },
  }
  const engine = new LocalEngine(database)
  const command = (name: string, args: Row) => engine.execute({ operation: 'command', name, args })
  const companyId = command('bootstrap_initial_company', { p_company_name: 'SAMPLE Solo Factory', p_plant_name: 'SAMPLE Plant' }) as string
  const store = engine.store
  const plant = store.rows('plants')[0]!
  const item = store.insert('items', { company_id: companyId, sku: 'SAMPLE-BOLT', description: 'SAMPLE Bolt', base_uom: 'pcs' })
  const warehouse = store.insert('warehouses', { company_id: companyId, plant_id: plant.id, code: 'SAMPLE', name: 'SAMPLE Warehouse' })
  const location = store.insert('stock_locations', { company_id: companyId, warehouse_id: warehouse.id, code: 'SAMPLE', name: 'SAMPLE Bin' })
  return { engine, command, companyId, store, item, location, connection }
}
describe('SQLite solo authority', () => {
  it('stores exact decimals and rejects lossy conversions', () => {
    expect(format(decimal('999999999999.999999') + decimal('0.000001'))).toBe('1000000000000')
    expect(ratio('3', '2', '4')).toBe('1.5')
    expect(() => ratio('1', '1', '3')).toThrow('QUANTITY_PRECISION_EXCEEDED')
  })
  it('commits once, rejects changed retries and leaves no failed command residue', () => {
    const { command, companyId, store, item, location, connection } = setup()
    const args = { p_company_id: companyId, p_item_id: item.id, p_location_id: location.id, p_lot_code: 'SAMPLE-LOT', p_quantity: '100', p_uom: 'pcs', p_idempotency_key: crypto.randomUUID() }
    const lot = command('receive_finished_goods', args)
    expect(command('receive_finished_goods', args)).toBe(lot)
    expect(store.rows('stock_ledger_entries')).toHaveLength(1)
    expect(() => command('receive_finished_goods', { ...args, p_quantity: '101' })).toThrow('IDEMPOTENCY_CONFLICT')
    expect(() => command('receive_finished_goods', { ...args, p_lot_code: 'SAMPLE-FAIL', p_quantity: '0.5', p_idempotency_key: crypto.randomUUID() })).toThrow('INVALID_QUANTITY')
    expect(store.rows('stock_lots')).toHaveLength(1)
    expect(() => command('release_stock_lot', { p_company_id: companyId, p_lot_id: lot, p_expected_revision: 1, p_idempotency_key: crypto.randomUUID() })).toThrow('CURRENT_PASSED_INSPECTION_REQUIRED')
    expect(() => connection.exec('DELETE FROM stock_ledger_entries')).toThrow('APPEND_ONLY_RECORD')
    connection.close()
  })
  it('does not create cloud identities or independently approve an owner count', () => {
    const { engine, command, companyId, store, connection } = setup()
    expect(store.rows('company_memberships')).toEqual([])
    expect(store.rows('user_company_roles')).toEqual([])
    expect(() => command('review_stock_count', { p_company_id: companyId, p_idempotency_key: crypto.randomUUID() })).toThrow('TEAM_INDEPENDENT_REVIEW_REQUIRED')
    engine.db.exec("UPDATE local_identity SET state='archived'")
    expect(() => command('receive_finished_goods', { p_company_id: companyId, p_idempotency_key: crypto.randomUUID() })).toThrow('SOLO_HISTORY_READ_ONLY')
    connection.close()
  })
})
