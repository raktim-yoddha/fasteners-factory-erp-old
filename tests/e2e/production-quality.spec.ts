import { expect, test, type Page } from '@playwright/test'
import {
  authenticateSampleUser,
  testSupabasePublishableKey,
  testSupabaseUrl,
} from './support/auth'
import { inspectAndReleaseSampleLot } from './support/quality'

import { selectContaining } from './support/select'

/** Only prerequisite master/commercial/receipt fixtures use the signed-in browser API. */
async function prerequisites(page: Page, companyId: string, run: string) {
  return page.evaluate(
    async ({ companyId, run, url, apiKey }) => {
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
      if (!accessToken || !apiKey || !url)
        throw new Error('Authenticated SAMPLE fixture setup is unavailable.')
      async function request(
        path: string,
        method = 'GET',
        body?: object,
      ): Promise<unknown> {
        const response = await fetch(`${url}/rest/v1/${path}`, {
          method,
          headers: {
            apikey: apiKey!,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
        const result: unknown = await response.json()
        if (!response.ok) {
          const message =
            typeof result === 'object' && result && 'message' in result
              ? String(result.message)
              : 'database request failed'
          throw new Error(`SAMPLE setup ${path.split('?')[0]}: ${message}`)
        }
        return result
      }
      async function insert(table: string, row: object) {
        const result = (await request(
          `${table}?select=id`,
          'POST',
          row,
        )) as Array<{ id: string }>
        if (!result[0]?.id)
          throw new Error(`SAMPLE master ${table} was not confirmed.`)
        return result[0].id
      }
      async function rpc(name: string, payload: object) {
        const result = await request(`rpc/${name}`, 'POST', {
          ...payload,
          p_idempotency_key: crypto.randomUUID(),
        })
        if (typeof result !== 'string')
          throw new Error(
            `SAMPLE command ${name} did not return a confirmation.`,
          )
        return result
      }
      const companies = (await request(
        `companies?id=eq.${companyId}&select=name`,
      )) as Array<{ name: string }>
      if (!companies[0]?.name.startsWith('SAMPLE'))
        throw new Error('Refusing non-SAMPLE factory fixtures.')
      const plants = (await request(
        `plants?company_id=eq.${companyId}&select=id&limit=1`,
      )) as Array<{ id: string }>
      if (!plants[0]?.id)
        throw new Error('The SAMPLE plant must be seeded before E2E.')
      const rawSku = `SAMPLE-IN-${run}`,
        outputSku = `SAMPLE-OUT-${run}`
      const customerId = await insert('customers', {
        company_id: companyId,
        code: `SAMPLE-C-${run}`,
        name: 'SAMPLE production customer',
      })
      const rawId = await insert('items', {
        company_id: companyId,
        sku: rawSku,
        description: 'SAMPLE production input',
        base_uom: 'pcs',
      })
      const outputId = await insert('items', {
        company_id: companyId,
        sku: outputSku,
        description: 'SAMPLE production output',
        base_uom: 'pcs',
      })
      const centreId = await insert('work_centres', {
        company_id: companyId,
        plant_id: plants[0].id,
        code: `SAMPLE-WC-${run}`,
        name: 'SAMPLE workstation',
      })
      const warehouseId = await insert('warehouses', {
        company_id: companyId,
        plant_id: plants[0].id,
        code: `SAMPLE-WH-${run}`,
        name: 'SAMPLE production warehouse',
      })
      const locationId = await insert('stock_locations', {
        company_id: companyId,
        warehouse_id: warehouseId,
        code: `SAMPLE-LOC-${run}`,
        name: 'SAMPLE production location',
      })
      const due = new Date(Date.now() + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10)
      const rfqId = await rpc('create_rfq', {
        p_company_id: companyId,
        p_customer_id: customerId,
        p_rfq_number: `SAMPLE-RFQ-${run}`,
        p_requirement_summary: 'SAMPLE production demand',
        p_lines: [
          {
            item_id: outputId,
            requested_description: 'SAMPLE production output',
            quantity: '10',
            uom: 'pcs',
            required_by: due,
          },
        ],
      })
      await rpc('record_feasibility', {
        p_company_id: companyId,
        p_rfq_id: rfqId,
        p_status: 'feasible',
        p_drawing_revision_id: null,
        p_bom_revision_id: null,
        p_routing_revision_id: null,
        p_conditions: 'SAMPLE commercial precondition',
        p_expected_rfq_revision: 1,
      })
      const quotationId = await rpc('create_quotation', {
        p_company_id: companyId,
        p_rfq_id: rfqId,
        p_quotation_number: `SAMPLE-Q-${run}`,
        p_currency_code: 'INR',
        p_valid_until: due,
        p_lines: [
          {
            item_id: outputId,
            quantity: '10',
            uom: 'pcs',
            unit_price: '1.00',
            pricing_source: 'SAMPLE fixture price',
            bom_revision_id: null,
            routing_revision_id: null,
          },
        ],
      })
      await rpc('approve_quotation', {
        p_company_id: companyId,
        p_quotation_id: quotationId,
        p_expected_revision: 1,
      })
      const orderNumber = `SAMPLE-SO-${run}`
      await rpc('accept_quotation_create_sales_order', {
        p_company_id: companyId,
        p_quotation_id: quotationId,
        p_sales_order_number: orderNumber,
        p_customer_po_number: `SAMPLE-CPO-${run}`,
        p_promised_date: due,
        p_expected_quotation_revision: 2,
      })
      const rawLot = `SAMPLE-RAW-${run}`
      await rpc('receive_finished_goods', {
        p_company_id: companyId,
        p_item_id: rawId,
        p_location_id: locationId,
        p_lot_code: rawLot,
        p_quantity: '12',
        p_uom: 'pcs',
      })
      return {
        rawSku,
        outputSku,
        rawId,
        outputId,
        centreId,
        locationId,
        rawLot,
        orderNumber,
        due,
      }
    },
    {
      companyId,
      run,
      url: testSupabaseUrl,
      apiKey: testSupabasePublishableKey,
    },
  )
}

test('SAMPLE production runs approved engineering, shortages, material custody, partial jobs, held output and QC through real UI', async ({
  page,
}) => {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
  const packageLabel = `SAMPLE-ENG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  await authenticateSampleUser(page)
  await expect(
    page.getByLabel('Active company', { exact: true }),
  ).not.toHaveValue('')
  const companyId = await page
    .getByLabel('Active company', { exact: true })
    .inputValue()
  const sample = await prerequisites(page, companyId, run)
  await page.reload()
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await test.step('save and review real engineering definitions', async () => {
    await page.getByRole('button', { name: 'Engineering', exact: true }).click()
    await page
      .getByLabel('Package output item', { exact: true })
      .selectOption(sample.outputId)
    await page
      .getByLabel('Component item', { exact: true })
      .selectOption(sample.rawId)
    await page
      .getByLabel('Component quantity per output basis', { exact: true })
      .fill('10')
    await page.getByLabel('Scrap allowance percent', { exact: true }).fill('0')
    await page
      .getByRole('button', { name: 'Add component', exact: true })
      .click()
    for (const sequence of [1, 2]) {
      await page
        .getByLabel('Operation sequence', { exact: true })
        .fill(String(sequence))
      await page
        .getByLabel('Operation name', { exact: true })
        .fill(`SAMPLE step ${sequence}`)
      await page
        .getByLabel('Operation work centre', { exact: true })
        .selectOption(sample.centreId)
      await page
        .getByRole('button', { name: 'Add routing operation', exact: true })
        .click()
    }
    await page
      .getByLabel('Package revision label', { exact: true })
      .fill(packageLabel)
    await page.getByLabel('Output basis quantity', { exact: true }).fill('10')
    await page
      .getByRole('button', { name: 'Create engineering package', exact: true })
      .click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Engineering package confirmed.' }),
    ).toBeVisible()
    await selectContaining(page, 'Review engineering package', packageLabel)
    const approve = page.getByRole('button', {
      name: 'Approve engineering package',
      exact: true,
    })
    await expect(approve).toBeDisabled()
    await expect(
      page.getByRole('table', {
        name: 'Component quantities per saved output basis',
      }),
    ).toContainText('10.000000 pcs')
    await page
      .getByRole('checkbox', { name: /I reviewed the saved output basis/ })
      .check()
    await approve.click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Engineering approval confirmed.' }),
    ).toBeVisible()
  })
  const workNumber = `SAMPLE-WO-${run}`
  let workId = ''
  await test.step('plan accepted demand and explain held-material shortage', async () => {
    await page.getByRole('button', { name: 'Demand', exact: true }).click()
    await selectContaining(page, 'Demand line', sample.orderNumber)
    await selectContaining(
      page,
      'Approved production package',
      packageLabel,
    )
    await page.getByLabel('Work order number', { exact: true }).fill(workNumber)
    await page.getByLabel('Planned output quantity', { exact: true }).fill('10')
    await page
      .getByLabel('Work order due date', { exact: true })
      .fill(sample.due)
    await page
      .getByRole('button', { name: 'Create work order', exact: true })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Work order confirmed.' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Shop floor', exact: true }).click()
    workId = await selectContaining(page, 'Production work order', workNumber)
    await page
      .getByRole('button', { name: 'Release work order', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(
      'released material is below the work order requirement',
    )
  })
  await inspectAndReleaseSampleLot(page, {
    sku: sample.rawSku,
    lot: sample.rawLot,
    planLabel: `SAMPLE-INPLAN-${run}`,
  })
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await page.getByRole('button', { name: 'Shop floor', exact: true }).click()
  await page
    .getByLabel('Production work order', { exact: true })
    .selectOption(workId)
  await page
    .getByRole('button', { name: 'Release work order', exact: true })
    .click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Work order release confirmed.' }),
  ).toBeVisible()
  await test.step('issue and explicitly consume production WIP', async () => {
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await selectContaining(page, 'Material job card', '1. SAMPLE step 1')
    await selectContaining(page, 'Material stock lot', sample.rawLot)
    await page.getByLabel('Material issue quantity', { exact: true }).fill('10')
    await page
      .getByRole('button', { name: 'Issue material to job', exact: true })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Material issue confirmed.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('table', {
        name: 'Server-derived material balances by base unit',
      }),
    ).toContainText('10.000000 pcs')
    await selectContaining(page, 'Issued material reference', sample.rawLot)
    await page
      .getByLabel('Material consumed quantity', { exact: true })
      .fill('10')
    await page
      .getByLabel('Material consumption reason', { exact: true })
      .fill('SAMPLE complete material use')
    await page
      .getByRole('button', { name: 'Record material consumption', exact: true })
      .click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Material consumption confirmed.' }),
    ).toBeVisible()
    await expect(
      page.getByText(
        'Originally issued 10.000000 pcs; unaccounted WIP 0.000000 pcs.',
        { exact: false },
      ),
    ).toBeVisible()
  })
  await test.step('complete ordered operations with explicit partial good and scrap entries', async () => {
    await page.getByRole('button', { name: 'Shop floor', exact: true }).click()
    await selectContaining(page, 'Shop-floor job card', '2. SAMPLE step 2')
    await expect(
      page.getByRole('button', { name: 'Start job', exact: true }),
    ).toBeDisabled()
    await selectContaining(page, 'Shop-floor job card', '1. SAMPLE step 1')
    await page.getByRole('button', { name: 'Start job', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Job start confirmed.' }),
    ).toBeVisible()
    const record = page.getByRole('button', {
      name: 'Record job completion',
      exact: true,
    })
    await page.getByLabel('Job good quantity', { exact: true }).fill('4')
    await page.getByLabel('Job scrap quantity', { exact: true }).fill('0')
    await page
      .getByLabel('Job completion reason', { exact: true })
      .fill('SAMPLE partial progress')
    await record.click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Job quantities confirmed.' }),
    ).toBeVisible()
    await expect(record).toBeEnabled()
    await expect(
      page.getByText(
        /Job plan 10.000000 pcs; recorded good 4.000000 pcs; scrap 0.000000 pcs/,
      ),
    ).toBeVisible()
    await page.getByLabel('Job good quantity', { exact: true }).fill('5')
    await page.getByLabel('Job scrap quantity', { exact: true }).fill('1')
    await page
      .getByLabel('Job completion reason', { exact: true })
      .fill('SAMPLE explicitly reported scrap')
    await record.click()
    await expect(record).toBeDisabled()
    await selectContaining(page, 'Shop-floor job card', '2. SAMPLE step 2')
    await page.getByRole('button', { name: 'Start job', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Job start confirmed.' }),
    ).toBeVisible()
    await expect(page.getByText(/Job plan 9.000000 pcs/)).toBeVisible()
    await page.getByLabel('Job good quantity', { exact: true }).fill('9')
    await page.getByLabel('Job scrap quantity', { exact: true }).fill('0')
    await page
      .getByLabel('Job completion reason', { exact: true })
      .fill('SAMPLE finishing complete')
    await record.click()
    await expect(
      page.getByText(/Job plan 9.000000 pcs; recorded good 9.000000 pcs; scrap 0.000000 pcs/),
    ).toBeVisible()
    await expect(record).toBeDisabled()
  })
  const outputLot = `SAMPLE-FG-${run}`
  await test.step('record held output and block premature work closure', async () => {
    await page.getByRole('button', { name: 'Output', exact: true }).click()
    await page
      .getByLabel('Production output lot code', { exact: true })
      .fill(outputLot)
    await page
      .getByLabel('Production output quantity', { exact: true })
      .fill('9')
    await page
      .getByLabel('Production output location', { exact: true })
      .selectOption(sample.locationId)
    await page
      .getByRole('button', { name: 'Record production output', exact: true })
      .click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Held output lot confirmed.' }),
    ).toBeVisible()
    await expect(
      page.getByText(`${outputLot} · 9.000000 pcs · QC hold`),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Close work order', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(
      'output lots still require a quality decision',
    )
  })
  await inspectAndReleaseSampleLot(page, {
    sku: sample.outputSku,
    lot: outputLot,
    planLabel: `SAMPLE-FGPLAN-${run}`,
    context: 'final',
  })
  await test.step('close reconciled work and follow real material/output genealogy', async () => {
    await page.getByRole('button', { name: 'Production', exact: true }).click()
    await page.getByRole('button', { name: 'Output', exact: true }).click()
    await page
      .getByLabel('Production work order', { exact: true })
      .selectOption(workId)
    await page
      .getByRole('button', { name: 'Close work order', exact: true })
      .click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Work order close confirmed.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Close work order', exact: true }),
    ).toBeDisabled()
    await page.getByRole('button', { name: 'Quality', exact: true }).click()
    await page
      .getByRole('button', { name: 'Traceability', exact: true })
      .click()
    await selectContaining(page, 'Trace lot', outputLot)
    await expect(
      page.getByRole('button', {
        name: `Source ${sample.rawLot}`,
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(`Work order: ${workNumber}`, { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: `Source ${sample.rawLot}`, exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: `Output ${outputLot}`, exact: true }),
    ).toBeVisible()
    await page.getByLabel('Search records', { exact: true }).fill(outputLot)
    await expect(
      page.getByRole('list', { name: 'Search results' }),
    ).toContainText(outputLot)
  })
})
