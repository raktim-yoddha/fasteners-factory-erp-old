import { expect, type Page } from '@playwright/test'

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export async function selectContaining(page: Page, label: string, startsWith: string) {
  const select = page.getByLabel(label, { exact: true })
  const option = select.getByRole('option', {
    name: new RegExp(`^${escapeRegex(startsWith)}(?: ·| —|$)`),
  })
  await expect(option).toHaveCount(1)
  const value = await option.getAttribute('value')
  if (!value) throw new Error(`Missing SAMPLE option in ${label}.`)
  await select.selectOption(value)
  return value
}
