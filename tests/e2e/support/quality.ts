import { expect, type Page } from '@playwright/test'

type SampleInspection = {
  sku: string
  lot: string
  planLabel: string
  context?: 'incoming' | 'final'
  planId?: string
}
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Configures fictional SAMPLE criteria through the real UI; never bypasses QC release. */
export async function inspectAndReleaseSampleLot(
  page: Page,
  { sku, lot, planLabel, context = 'incoming', planId: existingPlanId }: SampleInspection,
) {
  if (![sku, lot, planLabel].every((value) => value.startsWith('SAMPLE')))
    throw new Error('Quality fixtures must be explicitly SAMPLE.')
  await page.getByRole('button', { name: 'Quality', exact: true }).click()
  const panel = page
    .getByRole('heading', { name: 'Quality and traceability' })
    .locator('..')
  let planId = existingPlanId ?? ''
  if (!planId) {
    await panel.getByRole('button', { name: 'Plans', exact: true }).click()
    await panel
      .getByLabel('Characteristic key', { exact: true })
      .fill('sample_condition')
    await panel
      .getByLabel('Characteristic label', { exact: true })
      .fill('SAMPLE condition')
    await panel
      .getByLabel('Characteristic type', { exact: true })
      .selectOption('attribute')
    await panel
      .getByLabel('Expected attribute value', { exact: true })
      .fill('PASS')
    await panel
      .getByRole('button', { name: 'Add inspection characteristic', exact: true })
      .click()
    const itemOption = panel
      .getByLabel('Plan item', { exact: true })
      .getByRole('option', {
        name: new RegExp(`^${escapeRegex(sku)}(?: ·| —)`),
      })
    await expect(itemOption).toHaveCount(1)
    await panel
      .getByLabel('Plan item', { exact: true })
      .selectOption((await itemOption.getAttribute('value')) ?? '')
    await panel
      .getByLabel('Inspection plan label', { exact: true })
      .fill(planLabel)
    await panel
      .getByLabel('Inspection plan version', { exact: true })
      .fill('SAMPLE-A')
    await panel.getByLabel('Required sample count', { exact: true }).fill('1')
    await panel
      .getByRole('button', { name: 'Save inspection plan draft', exact: true })
      .click()
    await expect(panel.getByRole('status')).toContainText(
      'Inspection plan draft saved.',
    )
    const draftOption = panel
      .getByLabel('Draft inspection plan', { exact: true })
      .getByRole('option', {
        name: new RegExp(`^${escapeRegex(planLabel)} ·`),
      })
    await expect(draftOption).toHaveCount(1)
    planId = (await draftOption.getAttribute('value')) ?? ''
    if (!planId)
      throw new Error('The persisted SAMPLE inspection draft is missing.')
    await panel
      .getByLabel('Draft inspection plan', { exact: true })
      .selectOption(planId)
    const approve = panel.getByRole('button', {
      name: 'Approve reviewed inspection plan',
      exact: true,
    })
    await expect(approve).toBeDisabled()
    await panel
      .getByRole('checkbox', { name: /I reviewed the saved criteria/ })
      .check()
    await approve.click()
    await expect(panel.getByRole('status')).toContainText(
      'Inspection plan approved.',
    )
  }
  await panel.getByRole('button', { name: 'Inspections', exact: true }).click()
  await panel
    .getByLabel('Inspection stage', { exact: true })
    .selectOption(context)
  const lotOption = panel
    .getByLabel('Inspection lot', { exact: true })
    .getByRole('option', {
      name: new RegExp(`^${escapeRegex(lot)} ·`),
    })
  await expect(lotOption).toHaveCount(1)
  await panel
    .getByLabel('Inspection lot', { exact: true })
    .selectOption((await lotOption.getAttribute('value')) ?? '')
  await panel
    .getByLabel('Approved inspection plan', { exact: true })
    .selectOption(planId)
  await panel
    .getByLabel('SAMPLE condition sample 1', { exact: true })
    .fill('PASS')
  await panel
    .getByLabel('Inspection evidence and reason', { exact: true })
    .fill('SAMPLE configured fixture check')
  await panel
    .getByRole('button', { name: 'Record inspection readings', exact: true })
    .click()
  await expect(panel.getByRole('status')).toContainText(
    'Inspection readings recorded.',
  )
  await expect(
    panel.getByText(new RegExp(`✓ Passed · ${context}`)),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Stock', exact: true }).click()
  const releaseForm = page
    .locator('form')
    .filter({ hasText: 'Release held lot' })
    .first()
  await releaseForm
    .getByLabel('QC-held lot', { exact: true })
    .selectOption({ label: lot })
  await releaseForm
    .getByRole('button', { name: 'Release for reservation', exact: true })
    .click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Lot released for reservation.' }),
  ).toBeVisible()
  return planId
}
