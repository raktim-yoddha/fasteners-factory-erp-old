import { inspectAndReleaseSampleLot } from './support/quality'
import { selectContaining } from './support/select'
import { expect, test } from '@playwright/test'
import {
  authenticateSampleUser,
  testSupabaseUrl,
  testSupabasePublishableKey,
} from './support/auth'

test.describe('SAMPLE manufacturing path', () => {
  test('runs bootstrap, commercial, concurrent stock reservation and dispatch commands through the installed browser app', async ({
    page,
  }) => {
    const run = `${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
    const sample = {
      customerCode: `SAMPLE-CUST-${run}`,
      supplierCode: `SAMPLE-SUP-${run}`,
      sku: `SAMPLE-M8-${run}`,
      drawing: `SAMPLE-DRW-${run}`,
      requisition: `SAMPLE-PR-${run}`,
      purchaseOrder: `SAMPLE-PO-${run}`,
      goodsReceipt: `SAMPLE-GRN-${run}`,
      purchasedLot: `SAMPLE-RAW-${run}`,
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
      if (!browserApiKey && request.url().startsWith(testSupabaseUrl!))
        browserApiKey = request.headers().apikey
    })
    await authenticateSampleUser(page)
    await expect(
      page.getByRole('heading', { name: 'Fasteners Factory ERP' }),
    ).toBeVisible({ timeout: 15_000 })

    const bootstrap = page.getByRole('heading', {
      name: 'Set up the first company',
    })
    if (await bootstrap.isVisible()) {
      await page.getByLabel('Company name').fill('SAMPLE Factory')
      await page.getByLabel('First plant name').fill('SAMPLE Plant')
      await page
        .getByRole('button', { name: 'Create company and plant' })
        .click()
      await expect(bootstrap).toBeHidden()
    }

    await page.getByRole('button', { name: 'Master data' }).click()
    const customerForm = page
      .locator('form')
      .filter({ hasText: 'Customer' })
      .first()
    await customerForm.getByLabel('Customer code').fill(sample.customerCode)
    await customerForm.getByLabel('Customer name').fill('SAMPLE Customer')
    await customerForm.getByRole('button', { name: 'Create customer' }).click()
    await expect(page.getByText('Customer created.')).toBeVisible()
    await page.getByLabel('Search records').fill(sample.customerCode)
    await expect(
      page.getByRole('list', { name: 'Search results' }),
    ).toContainText(`${sample.customerCode} — SAMPLE Customer`)
    await page
      .getByRole('button', {
        name: new RegExp(`${sample.customerCode} — SAMPLE Customer`),
      })
      .click()
    await expect(page).toHaveURL(/\/records\/customer\//)
    await expect(
      page.getByRole('heading', {
        name: `${sample.customerCode} — SAMPLE Customer`,
      }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Back to operations' }).click()
    await expect(page).toHaveURL(/\/$/)
    const supplierForm = page
      .locator('form')
      .filter({ hasText: 'Supplier' })
      .first()
    await supplierForm.getByLabel('Supplier code').fill(sample.supplierCode)
    await supplierForm.getByLabel('Supplier name').fill('SAMPLE Supplier')
    await supplierForm.getByRole('button', { name: 'Create supplier' }).click()
    const itemForm = page.locator('form').filter({ hasText: 'Item' }).first()
    await itemForm.getByLabel('SKU').fill(sample.sku)
    await itemForm.getByLabel('Description').fill('SAMPLE M8 fastener')
    await itemForm.getByRole('button', { name: 'Create item' }).click()
    const drawingForm = page
      .locator('form')
      .filter({ hasText: 'Drawing' })
      .first()
    await drawingForm
      .getByLabel('Item', { exact: true })
      .selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
    await drawingForm.getByLabel('Drawing number').fill(sample.drawing)
    await drawingForm.getByRole('button', { name: 'Create drawing' }).click()
    const warehouseForm = page
      .locator('form')
      .filter({ hasText: 'Warehouse' })
      .first()
    await warehouseForm.getByLabel('Plant').selectOption({ index: 1 })
    await warehouseForm.getByLabel('Warehouse code').fill(sample.warehouseCode)
    await warehouseForm.getByLabel('Warehouse name').fill('SAMPLE Warehouse')
    await warehouseForm
      .getByRole('button', { name: 'Create warehouse' })
      .click()
    const locationForm = page
      .locator('form')
      .filter({ hasText: 'Stock location' })
      .first()
    await locationForm.getByLabel('Warehouse').selectOption({ index: 1 })
    await locationForm.getByLabel('Location code').fill(sample.locationCode)
    await locationForm.getByLabel('Location name').fill('SAMPLE Location')
    await locationForm.getByRole('button', { name: 'Create location' }).click()
    const workCentreForm = page
      .locator('form')
      .filter({ hasText: 'Work centre' })
      .first()
    await workCentreForm.getByLabel('Plant').selectOption({ index: 1 })
    await workCentreForm
      .getByLabel('Work centre code')
      .fill(sample.workCentreCode)
    await workCentreForm
      .getByLabel('Work centre name')
      .fill('SAMPLE Work Centre')
    await workCentreForm
      .getByRole('button', { name: 'Create work centre' })
      .click()

    await page.getByRole('button', { name: 'Sales orders' }).click()
    const rfqForm = page
      .getByRole('heading', { name: 'Create RFQ' })
      .locator('..')
      .locator('form')
    await rfqForm.getByLabel('RFQ number').fill(sample.rfq)
    await rfqForm
      .getByLabel('Customer')
      .selectOption({ label: `${sample.customerCode} — SAMPLE Customer` })
    await rfqForm
      .getByLabel('Requirement summary')
      .fill('SAMPLE M8 fastener enquiry')
    await rfqForm.getByLabel('Requested line').fill('SAMPLE M8 fastener')
    await rfqForm.getByLabel('Quantity').fill('10')
    const invalidFields = await rfqForm.evaluate((element) =>
      Array.from((element as HTMLFormElement).elements)
        .filter(
          (
            field,
          ): field is
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement,
        )
        .filter((field) => !field.validity.valid)
        .map((field) => ({
          label: field.labels?.[0]?.textContent?.trim(),
          validation: field.validationMessage,
          value: field.value,
        })),
    )
    expect(invalidFields).toEqual([])
    const createRfqResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/v1/rpc/create_rfq') &&
        response.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await rfqForm.getByRole('button', { name: 'Create RFQ' }).click()
    const rfqResponse = await createRfqResponse
    const rfqResult: unknown = await rfqResponse.json()
    const rfqError = typeof rfqResult === 'object' && rfqResult !== null && 'message' in rfqResult ? String(rfqResult.message) : 'RFQ command failed'
    expect(rfqResponse.ok(), rfqError).toBe(true)
    const feasibilityForm = page
      .locator('form')
      .filter({ hasText: 'Record feasibility' })
      .first()
    await feasibilityForm
      .getByLabel('RFQ')
      .selectOption({ label: `${sample.rfq} — new` })
    await feasibilityForm
      .getByRole('button', { name: 'Record feasibility' })
      .click()
    await page.getByRole('button', { name: 'Quotation', exact: true }).click()
    const quotationForm = page
      .locator('form')
      .filter({ hasText: 'Create quotation' })
      .first()
    await quotationForm
      .getByLabel('Qualified RFQ')
      .selectOption({ label: sample.rfq })
    await quotationForm.getByLabel('Quotation number').fill(sample.quotation)
    await quotationForm
      .getByLabel('Item', { exact: true })
      .selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
    await quotationForm.getByLabel('Quantity (pcs)', { exact: true }).fill('10')
    await quotationForm.getByLabel('Unit price (INR)').fill('25')
    await quotationForm
      .getByLabel('Pricing source')
      .fill('SAMPLE reviewed manual price')
    await quotationForm
      .getByRole('button', { name: 'Create quotation' })
      .click()
    await page.getByRole('button', { name: 'Approval', exact: true }).click()
    const approvalForm = page
      .locator('form')
      .filter({ hasText: 'Approve quotation' })
      .first()
    await approvalForm
      .getByLabel('Draft quotation')
      .selectOption({ label: sample.quotation })
    await approvalForm
      .getByRole('button', { name: 'Approve quotation' })
      .click()
    await page
      .getByRole('button', { name: 'Order acceptance', exact: true })
      .click()
    const acceptanceForm = page
      .locator('form')
      .filter({ hasText: 'Accept into sales order' })
      .first()
    await acceptanceForm
      .getByLabel('Approved quotation')
      .selectOption({ label: sample.quotation })
    await acceptanceForm
      .getByLabel('Sales order number')
      .fill(sample.salesOrder)
    await acceptanceForm.getByLabel('Customer PO number').fill('SAMPLE-PO-001')
    await acceptanceForm
      .getByRole('button', { name: 'Create sales order' })
      .click()

    await page.getByRole('button', { name: 'Stock' }).click()
    const receiptForm = page
      .locator('form')
      .filter({ hasText: 'Receive finished goods' })
      .first()
    await receiptForm
      .getByLabel('Item', { exact: true })
      .selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
    await receiptForm
      .getByLabel('Location')
      .selectOption({ label: `${sample.locationCode} — SAMPLE Location` })
    await receiptForm.getByLabel('Lot code').fill(sample.lot)
    await receiptForm.getByLabel('Quantity').fill('10')
    await receiptForm.getByRole('button', { name: 'Record receipt' }).click()
    await inspectAndReleaseSampleLot(page, { sku: sample.sku, lot: sample.lot, planLabel: `SAMPLE-QC-${run}` })
    const reservationForm = page
      .locator('form')
      .filter({ hasText: 'Reserve released lot' })
      .first()
    await reservationForm
      .getByLabel('Sales-order line')
      .selectOption({ label: `${sample.salesOrder} — 10.000000 pcs` })
    await reservationForm
      .getByLabel('Released lot')
      .selectOption({ label: sample.lot })
    const [companyId, salesOrderLineId, lotId] = await Promise.all([
      page.getByLabel('Active company').inputValue(),
      reservationForm.getByLabel('Sales-order line').inputValue(),
      reservationForm.getByLabel('Released lot').inputValue(),
    ])
    const concurrentReservations = await page.evaluate(
      async ({ companyId, salesOrderLineId, lotId, supabaseUrl, apiKey }) => {
        const accessToken = Object.values(localStorage)
          .map((value) => {
            try {
              return JSON.parse(value) as { access_token?: string }
            } catch {
              return null
            }
          })
          .find(
            (session) => typeof session?.access_token === 'string',
          )?.access_token
        if (!accessToken || !apiKey)
          throw new Error(
            'The browser session did not expose Supabase credentials for the stock command test.',
          )
        const headers = {
          apikey: apiKey,
          Authorization: `Bearer ${accessToken}`,
        }
        const lineResponse = await fetch(
          `${supabaseUrl}/rest/v1/sales_order_lines?id=eq.${salesOrderLineId}&select=sales_order_id`,
          { headers },
        )
        if (!lineResponse.ok)
          throw new Error(
            'The browser could not read the SAMPLE sales-order line.',
          )
        const [line] = (await lineResponse.json()) as Array<{
          sales_order_id: string
        }>
        if (!line)
          throw new Error('The SAMPLE sales-order line was not returned.')
        const orderResponse = await fetch(
          `${supabaseUrl}/rest/v1/sales_orders?id=eq.${line.sales_order_id}&select=revision`,
          { headers },
        )
        if (!orderResponse.ok)
          throw new Error('The browser could not read the SAMPLE sales order.')
        const [order] = (await orderResponse.json()) as Array<{
          revision: number
        }>
        if (!order) throw new Error('The SAMPLE sales order was not returned.')
        const reserve = async () => {
          const response = await fetch(
            `${supabaseUrl}/rest/v1/rpc/reserve_finished_goods`,
            {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                p_company_id: companyId,
                p_sales_order_line_id: salesOrderLineId,
                p_lot_id: lotId,
                p_quantity: 6,
                p_expected_sales_order_revision: order.revision,
                p_idempotency_key: crypto.randomUUID(),
              }),
            },
          )
          return { ok: response.ok, body: await response.text() }
        }
        return Promise.all([reserve(), reserve()])
      },
      {
        companyId,
        salesOrderLineId,
        lotId,
        supabaseUrl: testSupabaseUrl!,
        apiKey: browserApiKey,
      },
    )
    expect(concurrentReservations.filter((result) => result.ok)).toHaveLength(1)
    expect(concurrentReservations.find((result) => !result.ok)?.body).toMatch(
      /REVISION_CONFLICT|INSUFFICIENT_AVAILABLE_STOCK/,
    )

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Fasteners Factory ERP' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Dispatch' }).click()
    const prepareForm = page
      .locator('form')
      .filter({ hasText: 'Prepare packed shipment' })
      .first()
    await prepareForm
      .getByLabel('Sales order')
      .selectOption({ label: `${sample.salesOrder} — open` })
    await selectContaining(page, 'Active reservation', 'Reserved 6.000000 pcs')
    await prepareForm.getByLabel('Packing number').fill(sample.packing)
    await prepareForm.getByLabel('Shipment number').fill(sample.shipment)
    await prepareForm.getByLabel('Packed quantity').fill('6')
    await prepareForm.getByRole('button', { name: 'Prepare shipment' }).click()
    await test.step('cancel prepared packing and release its allocation before reserving again', async () => {
      await page.getByLabel('Shipment to cancel').selectOption({ label: sample.shipment })
      await page.getByLabel('Cancellation reason').fill('SAMPLE packing correction')
      await page.getByRole('button', { name: 'Cancel prepared shipment', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Prepared shipment cancelled.' })).toBeVisible()
      await page.getByRole('button', { name: 'Stock', exact: true }).click()
      const recovery = page.getByLabel('Reservation to release')
      const option = recovery.getByRole('option').filter({ hasText: sample.lot })
      await expect(option).toHaveCount(1)
      await recovery.selectOption((await option.getAttribute('value'))!)
      await page.getByLabel('Reservation release reason').fill('SAMPLE allocation correction')
      await page.getByRole('button', { name: 'Release reservation', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Reservation released.' })).toBeVisible()
      await reservationForm.getByLabel('Sales-order line').selectOption({label: `${sample.salesOrder} — 10.000000 pcs`})
      await reservationForm.getByLabel('Released lot').selectOption({label: sample.lot})
      await reservationForm.getByLabel('Quantity').fill('6')
      await reservationForm.getByRole('button', {name: 'Reserve stock'}).click()
      await expect(page.getByText('Released stock reserved against the sales order.')).toBeVisible()
      await page.getByRole('button', {name:'Dispatch',exact:true}).click()
      sample.packing += '-REPACK'
      sample.shipment += '-REPACK'
      await prepareForm.getByLabel('Sales order').selectOption({label: `${sample.salesOrder} — open`})
      await selectContaining(page, 'Active reservation', 'Reserved 6.000000 pcs')
      await prepareForm.getByLabel('Packing number').fill(sample.packing)
      await prepareForm.getByLabel('Shipment number').fill(sample.shipment)
      await prepareForm.getByLabel('Packed quantity').fill('6')
      await prepareForm.getByRole('button',{name:'Prepare shipment'}).click()
    })
    const dispatchForm = page
      .locator('form')
      .filter({ hasText: 'Dispatch shipment' })
      .first()
    await dispatchForm
      .getByLabel('Prepared shipment')
      .selectOption({ label: sample.shipment })
    await dispatchForm
      .getByRole('button', { name: 'Dispatch shipment' })
      .click()
    await expect(
      page.getByText('Shipment dispatched and stock ledger posted.'),
    ).toBeVisible()

    await test.step('purchase request, approval, partial receipt, QC hold and supplier return', async () => {
      await page
        .getByRole('button', { name: 'Purchasing', exact: true })
        .click()
      await page
        .getByLabel('Requisition number', { exact: true })
        .fill(sample.requisition)
      await page
        .getByLabel('Material item', { exact: true })
        .selectOption({ label: `${sample.sku} — SAMPLE M8 fastener` })
      await page
        .getByLabel('Required quantity (pcs)', { exact: true })
        .fill('10')
      await page
        .getByLabel('Demand reason', { exact: true })
        .fill('SAMPLE replenishment')
      await page.getByRole('button', { name: 'Submit requisition' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Material requested.' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Draft PO', exact: true }).click()
      await page
        .getByLabel('Requested material', { exact: true })
        .selectOption({ label: `${sample.requisition} · 10.000000 pcs` })
      await page
        .getByLabel('Purchase supplier', { exact: true })
        .selectOption({ label: `${sample.supplierCode} — SAMPLE Supplier` })
      await page
        .getByLabel('Purchase order number', { exact: true })
        .fill(sample.purchaseOrder)
      await page
        .getByLabel('Purchase unit price', { exact: true })
        .fill('15.25')
      await page.getByRole('button', { name: 'Create draft PO' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Purchase order drafted.' }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Approve PO', exact: true })
        .click()
      await page
        .getByLabel('Purchase order', { exact: true })
        .selectOption({ label: `${sample.purchaseOrder} · draft` })
      await page.getByRole('button', { name: 'Confirm PO approval' }).click()
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Purchase order approved.' }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Receive delivery', exact: true })
        .click()
      await page
        .getByLabel('Purchase order', { exact: true })
        .selectOption({ label: `${sample.purchaseOrder} · approved` })
      await page
        .getByLabel('Receipt number', { exact: true })
        .fill(sample.goodsReceipt)
      await page
        .getByLabel('Internal lot code', { exact: true })
        .fill(sample.purchasedLot)
      await page
        .getByLabel('Supplier lot / heat reference', { exact: true })
        .fill('SAMPLE-HEAT-001')
      await page
        .getByLabel('Certificate reference (if provided)', { exact: true })
        .fill('SAMPLE-CERT-001')
      await page
        .getByLabel('Receiving location', { exact: true })
        .selectOption({ label: `${sample.locationCode} — SAMPLE Location` })
      await page
        .getByLabel('Received quantity (pcs)', { exact: true })
        .fill('4')
      await page.getByRole('button', { name: 'Confirm goods receipt' }).click()
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Delivery received in QC hold.' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Stock', exact: true }).click()
      const balance = page
        .getByRole('list', { name: 'Stock balances' })
        .getByRole('button')
        .filter({ hasText: sample.purchasedLot })
      await expect(balance).toContainText('Physical 4.000000 pcs')
      await expect(balance).toContainText('Available 0 pcs')
      await balance.click()
      await expect(
        page.getByRole('heading', {
          name: `${sample.purchasedLot} — ledger movements`,
        }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Purchasing', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Supplier return', exact: true })
        .click()
      await page
        .getByLabel('Goods receipt', { exact: true })
        .selectOption({ label: `${sample.goodsReceipt} · SAMPLE-HEAT-001` })
      const returnForm = page
        .getByRole('button', { name: 'Confirm supplier return' })
        .locator('..')
      await expect(returnForm).toContainText('Physical 4.000000 pcs')
      await expect(returnForm).toContainText('QC hold 4.000000 pcs')
      await expect(returnForm).toContainText('Available 0 pcs')
      await page.getByLabel('Return quantity (pcs)', { exact: true }).fill('1')
      await page
        .getByLabel('Return reason', { exact: true })
        .fill('SAMPLE supplier rejection')
      await page
        .getByRole('button', { name: 'Confirm supplier return' })
        .click()
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Supplier return posted as a reversal.' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Stock', exact: true }).click()
      await page
        .getByLabel('Review lot', { exact: true })
        .selectOption({ label: `${sample.purchasedLot} · hold` })
      await expect(
        page.getByLabel('Counted quantity (pcs)', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('region', {
          name: 'Quality rejection and stock count review',
        }),
      ).toContainText('Physical 3.000000 pcs')
    })
  })
})
