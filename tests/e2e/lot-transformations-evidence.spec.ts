import { expect, test } from '@playwright/test'
import { authenticateSampleUser, testSupabasePublishableKey, testSupabaseUrl } from './support/auth'
import { inspectAndReleaseSampleLot } from './support/quality'
import { selectContaining } from './support/select'

test('SAMPLE lot split/merge retains private certificates and recovers lost upload responses', async ({ page, request }) => {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
  const client = await authenticateSampleUser(page)
  await expect(page.getByLabel('Active company', { exact: true })).not.toHaveValue('')
  const companyId = await page.getByLabel('Active company', { exact: true }).inputValue()
  // Only prerequisites use the authenticated API; every tested transformation and file action uses UI.
  const plant = await client.from('plants').select('id').eq('company_id', companyId).limit(1).single()
  if (plant.error) throw new Error('SAMPLE plant prerequisite is unavailable.')
  const outputSku = `SAMPLE-LOTITEM-${run}`
  const item = await client.from('items').insert({ company_id: companyId, sku: outputSku, description: 'SAMPLE lot material', base_uom: 'pcs' }).select('id').single()
  if (item.error) throw new Error(`SAMPLE item fixture: ${item.error.code} ${item.error.message}`)
  const warehouse = await client.from('warehouses').insert({ company_id: companyId, plant_id: plant.data.id, code: `SAMPLE-WH-${run}`, name: 'SAMPLE lot warehouse' }).select('id').single()
  if (warehouse.error) throw new Error(`SAMPLE warehouse fixture: ${warehouse.error.code} ${warehouse.error.message}`)
  const location = await client.from('stock_locations').insert({ company_id: companyId, warehouse_id: warehouse.data.id, code: `SAMPLE-LOC-${run}`, name: 'SAMPLE lot location' }).select('id').single()
  if (location.error) throw new Error(`SAMPLE location fixture: ${location.error.code} ${location.error.message}`)
  const outputLot = `SAMPLE-LOT-${run}`
  const received = await client.rpc('receive_finished_goods', {
    p_company_id: companyId, p_item_id: item.data.id, p_location_id: location.data.id,
    p_lot_code: outputLot, p_quantity: '9', p_uom: 'pcs', p_idempotency_key: crypto.randomUUID(),
  })
  if (received.error) throw new Error(`SAMPLE lot fixture: ${received.error.code} ${received.error.message}`)
  const sample = { outputSku, locationId: location.data.id }
  await page.reload()
  const incomingPlanId = await inspectAndReleaseSampleLot(page, { sku: outputSku, lot: outputLot, planLabel: `SAMPLE-LOTPLAN-${run}` })
  await page.getByRole('button', { name: 'Quality', exact: true }).click()
  await page.getByRole('button', { name: 'Traceability', exact: true }).click()
  await test.step('store private certificate bytes and recover a dropped upload response automatically', async () => {
    await selectContaining(page, 'Trace lot', outputLot)
    const certificate = Buffer.from('%PDF-1.7\n% SAMPLE factory certificate\n%%EOF\n')
    let uploadResponsesLost = 0
    await page.route('**/storage/v1/object/factory-evidence/**', async (route) => {
      if (route.request().method() === 'POST' && uploadResponsesLost === 0) {
        const response = await route.fetch()
        expect(response.ok()).toBe(true)
        uploadResponsesLost++
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByLabel('Evidence label', { exact: true }).fill(`SAMPLE-CERT-${run}`)
    await page.getByLabel('Certificate or inspection file', { exact: true }).setInputFiles({
      name: 'sample-certificate.pdf', mimeType: 'application/pdf', buffer: certificate,
    })
    await page.getByRole('button', { name: 'Upload lot evidence', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Evidence upload confirmed.' })).toBeVisible()
    expect(uploadResponsesLost).toBe(1)
    await page.unroute('**/storage/v1/object/factory-evidence/**')
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: `Download SAMPLE-CERT-${run}`, exact: true }).click()
    const download = await downloadEvent
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(certificate)
    expect(download.suggestedFilename()).toBe('sample-certificate.pdf')
    const objectPath = await page.evaluate(async ({ url, apiKey, companyId, label }) => {
      const session = Object.values(localStorage).map((value) => {
        try { return JSON.parse(value) as { access_token?: string } } catch { return null }
      }).find((value) => value?.access_token)
      if (!session?.access_token || !apiKey) throw new Error('SAMPLE session missing.')
      const headers = { apikey: apiKey, Authorization: `Bearer ${session.access_token}` }
      const records = await fetch(`${url}/rest/v1/lot_documents?company_id=eq.${companyId}&label=eq.${label}&select=object_path,status`, { headers })
      const documents = await records.json() as Array<{ object_path: string; status: string }>
      if (!records.ok || documents.length !== 1 || documents[0]?.status !== 'ready') throw new Error('SAMPLE evidence is not confirmed.')
      const path = documents[0].object_path
      const replaced = await fetch(`${url}/storage/v1/object/factory-evidence/${path}`, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/pdf' }, body: '%PDF-SAMPLE forged bytes',
      })
      if (replaced.ok) throw new Error('SAMPLE confirmed evidence was overwritten.')
      await fetch(`${url}/storage/v1/object/factory-evidence`, {
        method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }),
      })
      const retained = await fetch(`${url}/storage/v1/object/authenticated/factory-evidence/${path}`, { headers })
      if (!retained.ok) throw new Error('SAMPLE confirmed evidence was deleted.')
      return path
    }, { url: testSupabaseUrl, apiKey: testSupabasePublishableKey, companyId, label: `SAMPLE-CERT-${run}` })
    const publicRead = await request.get(`${testSupabaseUrl}/storage/v1/object/public/factory-evidence/${objectPath}`)
    expect(publicRead.ok()).toBe(false)
    await page.getByLabel('Evidence label', { exact: true }).fill(`SAMPLE-CORRECTION-${run}`)
    await page.getByLabel('File correction reference', { exact: true }).selectOption({ label: `SAMPLE-CERT-${run} · sample-certificate.pdf` })
    await page.getByLabel('Certificate or inspection file', { exact: true }).setInputFiles({
      name: 'sample-correction.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n% SAMPLE corrected certificate\n%%EOF\n'),
    })
    await page.getByRole('button', { name: 'Upload lot evidence', exact: true }).click()
    await expect(page.getByRole('button', { name: `Download SAMPLE-CORRECTION-${run}`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Download SAMPLE-CERT-${run}`, exact: true })).toBeVisible()
    await expect(page.getByText('Superseded by a newer recorded file. History remains available.')).toBeVisible()
  })
  const splitLot = `SAMPLE-SPLIT-${run}`
  await test.step('split only released quantities and require a new inspection', async () => {
    await page.getByRole('button', { name: 'Stock', exact: true }).click()
    await page.getByLabel('Transformation source lot', { exact: true }).selectOption({ label: outputLot })
    await page.getByLabel('Transformation source quantity', { exact: true }).fill('4')
    await page.getByRole('button', { name: 'Add source lot', exact: true }).click()
    await page.getByLabel('Transformation lot code', { exact: true }).fill(splitLot)
    await page.getByLabel('Transformation location', { exact: true }).selectOption(sample.locationId)
    await page.getByLabel('Transformation reason', { exact: true }).fill('SAMPLE separate containers')
    await page.getByRole('button', { name: 'Confirm lot split', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Lot split confirmed.' })).toBeVisible()
    await page.getByRole('button', { name: 'Quality', exact: true }).click()
    await page.getByRole('button', { name: 'Inspections', exact: true }).click()
    await page.getByLabel('Inspection stage', { exact: true }).selectOption('final')
    await expect(page.getByLabel('Inspection lot', { exact: true }).getByRole('option', { name: new RegExp(`^${splitLot} ·`) })).toHaveCount(0)
  })
  await inspectAndReleaseSampleLot(page, { sku: sample.outputSku, lot: splitLot, planLabel: `SAMPLE-SPLITPLAN-${run}`, context: 'incoming', planId: incomingPlanId })
  const mergedLot = `SAMPLE-MERGE-${run}`
  await test.step('merge compatible lots with conserved balances and both genealogy branches', async () => {
    await page.getByLabel('Lot operation', { exact: true }).selectOption('merge')
    for (const [lot, quantity] of [[outputLot, '1'], [splitLot, '4']] as const) {
      await page.getByLabel('Transformation source lot', { exact: true }).selectOption({ label: lot })
      await page.getByLabel('Transformation source quantity', { exact: true }).fill(quantity)
      await page.getByRole('button', { name: 'Add source lot', exact: true }).click()
    }
    await page.getByLabel('Transformation lot code', { exact: true }).fill(mergedLot)
    await page.getByLabel('Transformation location', { exact: true }).selectOption(sample.locationId)
    await page.getByLabel('Transformation reason', { exact: true }).fill('SAMPLE consolidate containers')
    await page.getByRole('button', { name: 'Confirm lot merge', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Lot merge confirmed.' })).toBeVisible()
    const balances = page.getByRole('list', { name: 'Stock balances' })
    await expect(balances.getByRole('button').filter({ hasText: outputLot })).toContainText('Physical 4.000000 pcs')
    await expect(balances.getByRole('button').filter({ hasText: splitLot })).toContainText('Physical 0.000000 pcs')
    await expect(balances.getByRole('button').filter({ hasText: mergedLot })).toContainText('Physical 5.000000 pcs')
    await page.getByRole('button', { name: 'Quality', exact: true }).click()
    await page.getByRole('button', { name: 'Traceability', exact: true }).click()
    await selectContaining(page, 'Trace lot', mergedLot)
    await expect(page.getByRole('button', { name: `Source ${outputLot}`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Source ${splitLot}`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Download SAMPLE-CERT-${run}`, exact: true })).toBeVisible()
  })
  await inspectAndReleaseSampleLot(page, { sku: sample.outputSku, lot: mergedLot, planLabel: `SAMPLE-MERGEPLAN-${run}`, context: 'incoming', planId: incomingPlanId })
})
