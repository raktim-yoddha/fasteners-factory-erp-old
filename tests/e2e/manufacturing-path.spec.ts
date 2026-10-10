import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const magicLinkRequired = ['E2E_BASE_URL', 'E2E_SUPABASE_URL', 'E2E_SUPABASE_SERVICE_ROLE_KEY', 'E2E_TEST_EMAIL'] as const
const testSupabaseUrl = process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const testSupabasePublishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const hasMagicLinkConfiguration = magicLinkRequired.every((name) => Boolean(process.env[name]))
const hasPasswordSessionConfiguration = Boolean(testSupabaseUrl && testSupabasePublishableKey && process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD)

async function authenticateSampleUser(page: Page) {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'

  if (hasMagicLinkConfiguration) {
    const admin = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: process.env.E2E_TEST_EMAIL!, options: { redirectTo: baseUrl } })
    if (error || !data.properties.action_link) throw error ?? new Error('Supabase did not generate a test sign-in link.')
    await page.goto(data.properties.action_link)
    return
  }

  const client = createClient(testSupabaseUrl!, testSupabasePublishableKey!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: process.env.E2E_TEST_EMAIL!, password: process.env.E2E_TEST_PASSWORD! })
  if (error || !data.session) throw error ?? new Error('Supabase did not create a SAMPLE test session.')
  const callback = new URL(baseUrl)
  callback.hash = new URLSearchParams({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: String(data.session.expires_in),
    token_type: data.session.token_type,
  }).toString()
  await page.goto(callback.toString())
}

test.describe('SAMPLE manufacturing path', () => {
  test.skip(!hasMagicLinkConfiguration && !hasPasswordSessionConfiguration, 'Requires either hosted magic-link secrets or local SAMPLE password-session credentials.')

  test('runs bootstrap, commercial, concurrent stock reservation and dispatch commands through the installed browser app', async ({ page }) => {
    const run = Date.now()
    const sample = {
      customerCode: `SAMPLE-CUST-${run}`,
      supplierCode: `SAMPLE-SUP-${run}`,
      sku: `SAMPLE-M8-${run}`,
      drawing: `SAMPLE-DRW-${run}`,
      warehouseCode: `SAMPLE-WH-${run}`,
      locationCode: `SAMPLE-LOC-${run}`,
      workCentreCode: `SAMPLE-WC-${run}`,
      rfq: `SAMPLE-RFQ-${run}`,
      quotation: `SAMPLE-Q-${run}`,
      salesOrder: `SAMPLE-SO-${run}`,
      packing: `SAMPLE-PACK-${run}`,
      shipment: `SAMPLE-SHIP-${run}`,
      lot: `SAMPLE-LOT-${run}`,
    }
    let browserApiKey = testSupabasePublishableKey
    page.on('request', (request) => {
      if (!browserApiKey && request.url().startsWith(testSupabaseUrl!)) browserApiKey = request.headers().apikey
    })
    await authenticateSampleUser(page)
    await expect(page.getByRole('heading', { name: 'Fasteners Factory ERP' })).toBeVisible({ timeout: 15_000 })

    const bootstrap = page.getByRole('heading', { name: 'Set up the first company' })
    if (await bootstrap.isVisible()) {
      await page.getByLabel('Company name').fill('SAMPLE Factory')
      await page.getByLabel('First plant name').fill('SAMPLE Plant')
      await page.getByRole('button', { name: 'Create company and plant' }).click()
      await expect(bootstrap).toBeHidden()
    }

    await page.getByRole('button', { name: 'Master data' }).click()
    const customerForm = page.locator('form').filter({ hasText: 'Customer' }).first()
    await customerForm.getByLabel('Customer code').fill(sample.customerCode)
    await customerForm.getByLabel('Customer name').fill('SAMPLE Customer')
    await customerForm.getByRole('button', { name: 'Create customer' }).click()
    await expect(page.getByText('Customer created.')).toBeVisible()
    await page.getByLabel('Search records').fill(sample.customerCode)
    await expect(page.getByRole('list', { name: 'Search results' })).toContainText(`${sample.customerCode} — SAMPLE Customer`)
    const supplierForm = page.locator('form').filter({ hasText: 'Supplier' }).first()
    await supplierForm.getByLabel('Supplier code').fill(sample.supplierCode)
    await supplierForm.getByLabel('Supplier name').fill('SAMPLE Supplier')
    await supplierForm.getByRole('button', { name: 'Create supplier' }).click()
    const itemForm = page.locator('form').filter({ hasText: 'Item' }).first()
    await itemForm.getByLabel('SKU').fill(sample.sku)
    await itemForm.getByLabel('Description').fill('SAMPLE M8 fastener')
    await itemForm.getByRole('button', { name: 'Create item' }).click()
    const drawingForm = page.locator('form').filter({ hasText: 'Drawing' }).first()
    await drawingForm.getByLabel('Item').selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
    await drawingForm.getByLabel('Drawing number').fill(sample.drawing)
    await drawingForm.getByRole('button', { name: 'Create drawing' }).click()
    const warehouseForm = page.locator('form').filter({ hasText: 'Warehouse' }).first()
    await warehouseForm.getByLabel('Plant').selectOption({ index: 1 })
    await warehouseForm.getByLabel('Warehouse code').fill(sample.warehouseCode)
    await warehouseForm.getByLabel('Warehouse name').fill('SAMPLE Warehouse')
    await warehouseForm.getByRole('button', { name: 'Create warehouse' }).click()
    const locationForm = page.locator('form').filter({ hasText: 'Stock location' }).first()
    await locationForm.getByLabel('Warehouse').selectOption({ index: 1 })
    await locationForm.getByLabel('Location code').fill(sample.locationCode)
    await locationForm.getByLabel('Location name').fill('SAMPLE Location')
    await locationForm.getByRole('button', { name: 'Create location' }).click()
    const workCentreForm = page.locator('form').filter({ hasText: 'Work centre' }).first()
    await workCentreForm.getByLabel('Plant').selectOption({ index: 1 })
    await workCentreForm.getByLabel('Work centre code').fill(sample.workCentreCode)
    await workCentreForm.getByLabel('Work centre name').fill('SAMPLE Work Centre')
    await workCentreForm.getByRole('button', { name: 'Create work centre' }).click()

    await page.getByRole('button', { name: 'Sales orders' }).click()
    const rfqForm = page.getByRole('heading', { name: 'Create RFQ' }).locator('..').locator('form')
    await rfqForm.getByLabel('RFQ number').fill(sample.rfq)
    await rfqForm.getByLabel('Customer').selectOption({ label: `${sample.customerCode} — SAMPLE Customer` })
    await rfqForm.getByLabel('Requirement summary').fill('SAMPLE M8 fastener enquiry')
    await rfqForm.getByLabel('Requested line').fill('SAMPLE M8 fastener')
    await rfqForm.getByLabel('Quantity').fill('10')
    const invalidFields = await rfqForm.evaluate((element) => Array.from((element as HTMLFormElement).elements)
      .filter((field): field is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)
      .filter((field) => !field.validity.valid)
      .map((field) => ({ label: field.labels?.[0]?.textContent?.trim(), validation: field.validationMessage, value: field.value })))
    expect(invalidFields).toEqual([])
    const createRfqResponse = page.waitForResponse(
      (response) => response.url().includes('/rest/v1/rpc/create_rfq') && response.request().method() === 'POST',
      { timeout: 15_000 }
    )
    await rfqForm.getByRole('button', { name: 'Create RFQ' }).click()
    expect((await createRfqResponse).ok()).toBe(true)
    const feasibilityForm = page.locator('form').filter({ hasText: 'Record feasibility' }).first()
    await feasibilityForm.getByLabel('RFQ').selectOption({ label: `${sample.rfq} — new` })
    await feasibilityForm.getByRole('button', { name: 'Record feasibility' }).click()
    const quotationForm = page.locator('form').filter({ hasText: 'Create quotation' }).first()
    await quotationForm.getByLabel('Qualified RFQ').selectOption({ label: sample.rfq })
    await quotationForm.getByLabel('Quotation number').fill(sample.quotation)
    await quotationForm.getByLabel('Item').selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
    await quotationForm.getByLabel('Quantity').fill('10')
    await quotationForm.getByLabel('Unit price (INR)').fill('25')
    await quotationForm.getByRole('button', { name: 'Create quotation' }).click()
    const approvalForm = page.locator('form').filter({ hasText: 'Approve quotation' }).first()
    await approvalForm.getByLabel('Draft quotation').selectOption({ label: sample.quotation })
    await approvalForm.getByRole('button', { name: 'Approve quotation' }).click()
    const acceptanceForm = page.locator('form').filter({ hasText: 'Accept into sales order' }).first()
    await acceptanceForm.getByLabel('Approved quotation').selectOption({ label: sample.quotation })
    await acceptanceForm.getByLabel('Sales order number').fill(sample.salesOrder)
    await acceptanceForm.getByLabel('Customer PO number').fill('SAMPLE-PO-001')
    await acceptanceForm.getByRole('button', { name: 'Create sales order' }).click()

    await page.getByRole('button', { name: 'Stock' }).click()
    const receiptForm = page.locator('form').filter({ hasText: 'Receive finished goods' }).first()
    await receiptForm.getByLabel('Item').selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
    await receiptForm.getByLabel('Location').selectOption({ label: `${sample.locationCode} — SAMPLE Location` })
    await receiptForm.getByLabel('Lot code').fill(sample.lot)
    await receiptForm.getByLabel('Quantity').fill('10')
    await receiptForm.getByRole('button', { name: 'Record receipt' }).click()
    const releaseForm = page.locator('form').filter({ hasText: 'Release held lot' }).first()
    await releaseForm.getByLabel('QC-held lot').selectOption({ label: sample.lot })
    await releaseForm.getByRole('button', { name: 'Release for reservation' }).click()
    const reservationForm = page.locator('form').filter({ hasText: 'Reserve released lot' }).first()
    await reservationForm.getByLabel('Sales-order line').selectOption({ label: `${sample.salesOrder} — 10 pcs` })
    await reservationForm.getByLabel('Released lot').selectOption({ label: sample.lot })
    const [companyId, salesOrderLineId, lotId] = await Promise.all([
      page.getByLabel('Active company').inputValue(),
      reservationForm.getByLabel('Sales-order line').inputValue(),
      reservationForm.getByLabel('Released lot').inputValue(),
    ])
    const concurrentReservations = await page.evaluate(async ({ companyId, salesOrderLineId, lotId, supabaseUrl, apiKey }) => {
      const accessToken = Object.values(localStorage)
        .map((value) => { try { return JSON.parse(value) as { access_token?: string } } catch { return null } })
        .find((session) => typeof session?.access_token === 'string')?.access_token
      if (!accessToken || !apiKey) throw new Error('The browser session did not expose Supabase credentials for the stock command test.')
      const headers = { apikey: apiKey, Authorization: `Bearer ${accessToken}` }
      const lineResponse = await fetch(`${supabaseUrl}/rest/v1/sales_order_lines?id=eq.${salesOrderLineId}&select=sales_order_id`, { headers })
      if (!lineResponse.ok) throw new Error('The browser could not read the SAMPLE sales-order line.')
      const [line] = await lineResponse.json() as Array<{ sales_order_id: string }>
      if (!line) throw new Error('The SAMPLE sales-order line was not returned.')
      const orderResponse = await fetch(`${supabaseUrl}/rest/v1/sales_orders?id=eq.${line.sales_order_id}&select=revision`, { headers })
      if (!orderResponse.ok) throw new Error('The browser could not read the SAMPLE sales order.')
      const [order] = await orderResponse.json() as Array<{ revision: number }>
      if (!order) throw new Error('The SAMPLE sales order was not returned.')
      const reserve = async () => {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_finished_goods`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_company_id: companyId, p_sales_order_line_id: salesOrderLineId, p_lot_id: lotId, p_quantity: 6, p_expected_sales_order_revision: order.revision, p_idempotency_key: crypto.randomUUID() }),
        })
        return { ok: response.ok, body: await response.text() }
      }
      return Promise.all([reserve(), reserve()])
    }, { companyId, salesOrderLineId, lotId, supabaseUrl: testSupabaseUrl!, apiKey: browserApiKey })
    expect(concurrentReservations.filter((result) => result.ok)).toHaveLength(1)
    expect(concurrentReservations.find((result) => !result.ok)?.body).toMatch(/REVISION_CONFLICT|INSUFFICIENT_AVAILABLE_STOCK/)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Fasteners Factory ERP' })).toBeVisible()
    await page.getByRole('button', { name: 'Dispatch' }).click()
    const prepareForm = page.locator('form').filter({ hasText: 'Prepare packed shipment' }).first()
    await prepareForm.getByLabel('Sales order').selectOption({ label: `${sample.salesOrder} — open` })
    await prepareForm.getByLabel('Active reservation').selectOption({ label: 'Reserved 6' })
    await prepareForm.getByLabel('Packing number').fill(sample.packing)
    await prepareForm.getByLabel('Shipment number').fill(sample.shipment)
    await prepareForm.getByLabel('Packed quantity').fill('6')
    await prepareForm.getByRole('button', { name: 'Prepare shipment' }).click()
    const dispatchForm = page.locator('form').filter({ hasText: 'Dispatch shipment' }).first()
    await dispatchForm.getByLabel('Prepared shipment').selectOption({ label: sample.shipment })
    await dispatchForm.getByRole('button', { name: 'Dispatch shipment' }).click()
    await expect(page.getByText('Shipment dispatched and stock ledger posted.')).toBeVisible()
  })
})
