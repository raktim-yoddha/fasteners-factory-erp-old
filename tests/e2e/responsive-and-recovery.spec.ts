import { test, expect } from '@playwright/test'
import { authenticateSampleUser } from './support/auth'

test.describe('workspace loading recovery', () => {
test.use({ serviceWorkers: 'block' }) // Inject the failed chunk deterministically, without a cached worker response.
test('deferred workspace load failure preserves navigation and recovers after reload', async ({ page }) => {
  await authenticateSampleUser(page)
  const chunk = /\/assets\/ProductionPanel-[^/]+\.js$/
  await page.route(chunk, (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Production could not open')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await page.unroute(chunk)
  await page.getByRole('button', { name: 'Reload application' }).click()
  await expect(page.getByRole('heading', { name: 'Fasteners Factory ERP' })).toBeVisible()
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Production planning and execution' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload application' })).toHaveCount(0)
})
})

test('keyboard discovery, company navigation and responsive layouts', async ({
  page,
}) => {
  await authenticateSampleUser(page)
  await page.keyboard.press('Control+k')
  await expect(page.getByLabel('Search records')).toBeFocused()
  await page.getByLabel('Search records').fill('SAMPLE')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Search records')).toHaveValue('')
  for (const width of [320, 375, 412, 768, 1024, 1440]) {
    await test.step(`${width}px: no page overflow, reachable navigation and touch targets`, async () => {
      await page.setViewportSize({ width, height: 900 })
      for (const name of [
        'Sales orders',
        'Stock',
        'Purchasing',
        'Master data',
        'Production',
        'Quality',
        'Dispatch',
        'Reports',
        'Administration',
        'Data transfer',
        'Equipment',
      ]) {
        await page.getByRole('button', { name, exact: true }).click()
        await expect(
          page.getByRole('heading', { name, exact: true, level: 2 }),
        ).toBeVisible()
        const geometry = await page.evaluate(() => ({
          viewport: innerWidth,
          width: document.documentElement.scrollWidth,
        }))
        expect(geometry.width).toBeLessThanOrEqual(geometry.viewport + 1)
        if (name === 'Master data') {
          await page.getByRole('button', { name: 'Customer part references', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Customer part references', exact: true })).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
          await page.getByRole('button', { name: 'Factory masters', exact: true }).click()
          await page.getByRole('button', { name: 'Specifications and units', exact: true }).click()
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
          await page.getByRole('button', { name: 'Factory masters', exact: true }).click()
        }
      }
      const target = await page
        .getByRole('button', { name: 'Sign out' })
        .boundingBox()
      expect(target?.height).toBeGreaterThanOrEqual(44)
    })
  }
})

test('offline commands disable and connection recovery restores them', async ({
  page,
  context,
}) => {
  await authenticateSampleUser(page)
  await page.getByRole('button', { name: 'Stock', exact: true }).click()
  const form = page
    .getByRole('heading', { name: 'Receive finished goods' })
    .locator('..')
  await form.getByLabel('Item', { exact: true }).selectOption({ index: 1 })
  await form.getByLabel('Location', { exact: true }).selectOption({ index: 1 })
  await expect(
    page.getByRole('button', { name: 'Record receipt' }),
  ).toBeEnabled()
  await context.setOffline(true)
  await expect(
    page.getByRole('button', { name: 'Record receipt' }),
  ).toBeDisabled()
  await expect(
    page.getByText(
      'Blocked because this device is offline. Commands are disabled until the server connection returns.',
    ),
  ).toBeVisible()
  await context.setOffline(false)
  await expect(
    page.getByRole('button', { name: 'Record receipt' }),
  ).toBeEnabled()
})

test('sign-out clears the authenticated operational surface', async ({
  page,
}) => {
  await authenticateSampleUser(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }),
  ).toHaveCount(0)
})
