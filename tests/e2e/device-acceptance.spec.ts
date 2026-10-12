import { devices, expect, test } from '@playwright/test'
import { authenticateSampleUser } from './support/auth'

// ADR 0018: software acceptance profiles. Neither profile claims an OS installation.
for (const profile of [
  { name: 'Windows desktop', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: 'Android Chrome touch', ...devices['Pixel 7'] },
]) {
  test.describe(profile.name, () => {
    const { name: _name, defaultBrowserType: _browser, ...options } = profile as typeof profile & { defaultBrowserType?: string }
    void _name; void _browser
    test.use(options)
    test('standalone shell, scanner Enter, private record route and isolated print label', async ({ page, context }) => {
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window)
        window.matchMedia = (query: string) => {
          const result = original(query)
          if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true })
          return result
        }
      })
      const client = await authenticateSampleUser(page)
      await expect(page.getByLabel('Active company')).not.toHaveValue('')
      const companyId = await page.getByLabel('Active company').inputValue()
      const code = `SAMPLE-DEVICE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
      const item = await client.from('items').select('id,sku,base_uom').eq('company_id', companyId).eq('base_uom', 'pcs').limit(1).single()
      const location = await client.from('stock_locations').select('id').eq('company_id', companyId).limit(1).single()
      if (item.error || location.error) throw new Error('SAMPLE device masters unavailable')
      const receipt = await client.rpc('receive_finished_goods', { p_company_id: companyId, p_item_id: item.data.id, p_location_id: location.data.id, p_lot_code: code, p_quantity: '1', p_uom: 'pcs', p_idempotency_key: crypto.randomUUID() })
      if (receipt.error) throw receipt.error
      await page.getByText('Scan an identifier', { exact: true }).click()
      const input = page.getByLabel('Scanned identifier')
      await input.focus()
      await page.keyboard.type(code) // Keyboard-wedge scanner emits ordinary keys plus Enter.
      await page.keyboard.press('Enter')
      await page.getByRole('list', { name: 'Scanned records' }).getByRole('button').click()
      await expect(page).toHaveURL(new RegExp(`/records/lot/${receipt.data}$`))
      await page.reload() // Durable record link remains reachable.
      await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Back to operations', exact: true }).click()
      await page.getByRole('button', { name: 'Stock', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(`^${code} ·`) }).click()
      const barcode = page.getByRole('img', { name: `Code 39 barcode ${code}`, exact: true })
      await expect(barcode).toBeVisible()
      const rect = await barcode.boundingBox()
      expect(rect?.width).toBeGreaterThan(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(profile.viewport!.width + 1)
      await page.evaluate(() => { window.print = () => { document.body.dataset.printRequested = 'yes' } })
      await page.getByRole('button', { name: 'Print lot label', exact: true }).click()
      await expect(page.locator('body')).toHaveAttribute('data-print-requested', 'yes')
      await page.emulateMedia({ media: 'print' })
      await expect(page.locator('.package-print-sheet')).toBeVisible()
      await expect(page.locator('.package-print-sheet')).toContainText(code)
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
      await page.emulateMedia({ media: 'screen' })
      await page.evaluate(async () => { await navigator.serviceWorker.ready })
      await page.reload()
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
      await context.setOffline(true)
      await page.reload()
      await expect(page.getByText('Offline — read-only shell', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Stock', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Record receipt', exact: true })).toBeDisabled()
      await context.setOffline(false)
      await page.reload()
      await expect(page.getByLabel('Active company')).not.toHaveValue('')
    })
  })
}
