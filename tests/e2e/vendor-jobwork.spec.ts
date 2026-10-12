import { expect, test } from '@playwright/test'
import { authenticateSampleUser } from './support/auth'
import { inspectAndReleaseSampleLot } from './support/quality'
import { selectContaining } from './support/select'

test('SAMPLE vendor custody reconciles partial returns, reviewed loss, concurrent retries and QC genealogy', async ({ page }) => {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
  const client = await authenticateSampleUser(page)
  await expect(page.getByLabel('Active company')).not.toHaveValue('')
  const companyId = await page.getByLabel('Active company').inputValue()
  const plant = await client.from('plants').select('id').eq('company_id', companyId).limit(1).single()
  if (plant.error) throw new Error(`SAMPLE plant: ${plant.error.code}`)
  const sku = `SAMPLE-JW-${run}`, source = `SAMPLE-JWSOURCE-${run}`
  const item = await client.from('items').insert({ company_id: companyId, sku, description: 'SAMPLE processing lot', base_uom: 'pcs' }).select('id').single()
  if (item.error) throw new Error(`SAMPLE item: ${item.error.message}`)
  const supplier = await client.from('suppliers').insert({ company_id: companyId, code: `SAMPLE-V-${run}`, name: 'SAMPLE processor' }).select('id').single()
  if (supplier.error) throw new Error(`SAMPLE processor: ${supplier.error.message}`)
  const warehouse = await client.from('warehouses').insert({ company_id: companyId, plant_id: plant.data.id, code: `SAMPLE-W-${run}`, name: 'SAMPLE processing warehouse' }).select('id').single()
  if (warehouse.error) throw new Error(`SAMPLE warehouse: ${warehouse.error.message}`)
  const location = await client.from('stock_locations').insert({ company_id: companyId, warehouse_id: warehouse.data.id, code: `SAMPLE-L-${run}`, name: 'SAMPLE processing location' }).select('id').single()
  if (location.error) throw new Error(`SAMPLE location: ${location.error.message}`)
  const locationId = location.data.id
  const receipt = await client.rpc('receive_finished_goods', { p_company_id: companyId, p_item_id: item.data.id, p_location_id: locationId, p_lot_code: source, p_quantity: '9', p_uom: 'pcs', p_idempotency_key: crypto.randomUUID() })
  if (receipt.error) throw new Error(`SAMPLE receipt: ${receipt.error.message}`)
  await page.reload()
  const planId = await inspectAndReleaseSampleLot(page, { sku, lot: source, planLabel: `SAMPLE-JWPLAN-${run}` })
  const number = `SAMPLE-JWORDER-${run}`
  await page.getByRole('button', { name: 'Purchasing', exact: true }).click()
  await page.getByRole('button', { name: 'Vendor job-work', exact: true }).click()
  await test.step('create and send actual unreserved stock', async () => {
    await page.getByLabel('Vendor order number').fill(number)
    await page.getByLabel('Vendor processor').selectOption(supplier.data.id)
    await selectContaining(page, 'Vendor source lot', source)
    await page.getByLabel('Vendor processing instructions').fill('SAMPLE processor finish')
    await page.getByLabel('Vendor planned quantity').fill('6')
    await page.getByLabel('Vendor return due date').fill('2026-12-01')
    await page.getByRole('button', { name: 'Create vendor order', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Vendor order confirmed.' })).toBeVisible()
    await page.getByLabel('Vendor movement quantity').fill('4')
    await page.getByLabel('Vendor movement reference').fill('SAMPLE outward 1')
    await page.getByLabel('Vendor action reason').fill('SAMPLE stock handed to processor')
    await page.getByRole('button', { name: 'Confirm vendor send', exact: true }).click()
    await expect(page.getByLabel('Selected vendor custody')).toContainText('At vendor 4.000000 pcs')
  })
  await test.step('two simultaneous retries produce one additional send event', async () => {
    const order = await client.from('vendor_order_positions').select('id,revision,source_lot_id').eq('company_id', companyId).eq('number', number).single()
    if (order.error) throw new Error(`SAMPLE custody: ${order.error.message}`)
    const lot = await client.from('stock_lots').select('revision').eq('id', order.data.source_lot_id).single()
    if (lot.error) throw new Error(`SAMPLE lot revision: ${lot.error.message}`)
    const input = { p_company_id: companyId, p_action: 'send', p_idempotency_key: crypto.randomUUID(), p_data: {
      order_id: order.data.id, revision: order.data.revision, lot_revision: lot.data.revision,
      quantity: '1', uom: 'pcs', reference: 'SAMPLE concurrent retry', reason: 'SAMPLE one physical transfer',
    } }
    const results = await Promise.all([client.rpc('vendor_jobwork_command', input), client.rpc('vendor_jobwork_command', input)])
    for (const result of results) expect(result.error).toBeNull()
    expect(results[0]?.data).toBe(results[1]?.data)
    const events = await client.from('vendor_custody_events').select('id').eq('vendor_order_id', order.data.id).eq('reference', 'SAMPLE concurrent retry')
    expect(events.error).toBeNull()
    expect(events.data).toHaveLength(1)
    await page.reload()
    await page.getByRole('button', { name: 'Purchasing', exact: true }).click()
    await page.getByRole('button', { name: 'Vendor job-work', exact: true }).click()
    await page.getByRole('button', { name: 'Receive from vendor', exact: true }).click()
    await selectContaining(page, 'Vendor order', number)
    await expect(page.getByLabel('Selected vendor custody')).toContainText('At vendor 5.000000 pcs')
  })
  const returned1 = `SAMPLE-JWRETURN1-${run}`, returned2 = `SAMPLE-JWRETURN2-${run}`
  async function receive(lot: string, reference: string) {
    await page.getByRole('button', { name: 'Receive from vendor', exact: true }).click()
    await page.getByLabel('Vendor movement quantity').fill('2')
    await page.getByLabel('Vendor movement reference').fill(reference)
    await page.getByLabel('Vendor action reason').fill('SAMPLE returned actual quantity')
    await page.getByLabel('Vendor returned lot code').fill(lot)
    await page.getByLabel('Vendor receiving location').selectOption(locationId)
    await page.getByLabel('Processor certificate reference').fill(`SAMPLE-CERT-${run}`)
    await page.getByRole('button', { name: 'Confirm vendor return', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Vendor return confirmed.' })).toBeVisible()
  }
  await test.step('receive partial stock and keep unreconciled custody blocking closure', async () => {
    await receive(returned1, 'SAMPLE inward 1')
    await expect(page.getByLabel('Selected vendor custody')).toContainText('At vendor 3.000000 pcs')
    await page.getByRole('button', { name: 'Close vendor order', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close reconciled vendor order', exact: true })).toBeDisabled()
  })
  await test.step('review loss explicitly and reconcile the final physical return', async () => {
    await page.getByRole('button', { name: 'Review vendor loss', exact: true }).click()
    await page.getByLabel('Vendor movement quantity').fill('1')
    await page.getByLabel('Vendor movement reference').fill('SAMPLE verified shortage')
    await page.getByLabel('Vendor action reason').fill('SAMPLE confirmed physical shortage')
    await page.getByRole('checkbox', { name: /I reviewed the actual vendor shortage/ }).check()
    await page.getByRole('button', { name: 'Record confirmed vendor loss', exact: true }).click()
    await expect(page.getByLabel('Selected vendor custody')).toContainText('Confirmed loss 1.000000 pcs')
    await receive(returned2, 'SAMPLE inward 2')
    await expect(page.getByLabel('Selected vendor custody')).toContainText('At vendor 0.000000 pcs')
    await page.getByRole('button', { name: 'Close vendor order', exact: true }).click()
    await page.getByRole('checkbox', { name: /Explicitly cancel the unsent balance/ }).check()
    await page.getByLabel('Vendor action reason').fill('SAMPLE reconciled custody and cancelled remaining one piece')
    await page.getByRole('button', { name: 'Close reconciled vendor order', exact: true }).click()
    await expect(page.getByLabel('Selected vendor custody')).toContainText('Explicitly cancelled unsent balance: 1.000000 pcs')
    await expect(page.getByRole('list', { name: 'Vendor custody history' }).getByRole('listitem')).toHaveCount(5)
  })
  await test.step('trace processor evidence and require fresh inspection of returned lots', async () => {
    await page.getByRole('button', { name: 'Quality', exact: true }).click()
    await page.getByRole('button', { name: 'Traceability', exact: true }).click()
    await selectContaining(page, 'Trace lot', returned1)
    await expect(page.getByRole('button', { name: `Source ${source}`, exact: true })).toBeVisible()
    await expect(page.getByText('Processor: SAMPLE processor', { exact: true })).toBeVisible()
    await expect(page.getByText('Processor return reference: SAMPLE inward 1', { exact: true })).toBeVisible()
    await expect(page.getByText(`Certificate reference: SAMPLE-CERT-${run}`, { exact: true })).toBeVisible()
  })
  await inspectAndReleaseSampleLot(page, { sku, lot: returned1, planLabel: `SAMPLE-JWPLAN-${run}`, planId })
  await expect(page.getByRole('list', { name: 'Stock balances' }).getByRole('button').filter({ hasText: source })).toContainText('Physical 4.000000 pcs')
  await expect(page.getByRole('list', { name: 'Stock balances' }).getByRole('button').filter({ hasText: returned2 })).toContainText('QC hold 2.000000 pcs')
})
