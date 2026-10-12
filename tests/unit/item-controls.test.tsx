// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemControlsPanel } from '@/features/master-data/ItemControlsPanel'
import { itemControlCommandSchema, type UnitConversion } from '@/features/master-data/useItemControls'
import { UnitConversionSelect } from '@/components/UnitConversionSelect'
afterEach(cleanup)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const props = { items: [{ id: id(1), sku: 'SAMPLE-BOLT', description: 'SAMPLE bolt', base_uom: 'pcs' as const }], specifications: [], conversions: [], permissions: ['item_controls.manage','item_controls.approve'], online: true, busy: false, loading: false, error: false, onCommand: vi.fn() }
it('preserves unknown dimensions and rejects unsupported precision or missing evidence', () => {
  const data = { item_id: id(1), product_type: 'SAMPLE bolt', diameter_mm: null, length_mm: '', thread_pitch_mm: null, thread_designation: '', material_grade: '', property_class: '', coating: '', standard_reference: '', evidence: 'SAMPLE drawing' }
  expect(itemControlCommandSchema.parse({ action: 'create_specification', data })).toMatchObject({ data: { diameter_mm: null, length_mm: '' } })
  expect(itemControlCommandSchema.safeParse({ action: 'create_specification', data: { ...data, diameter_mm: '1.0000001' } }).success).toBe(false)
  expect(itemControlCommandSchema.safeParse({ action: 'create_conversion', data: { item_id: id(1), from_uom: 'box', from_quantity: '1', to_quantity: '10', evidence: '' } }).success).toBe(false)
})
it('retains failed inputs and never announces an unconfirmed specification', async () => {
  const onCommand = vi.fn().mockRejectedValue(new Error('SAMPLE network failure'))
  render(<ItemControlsPanel {...props} onCommand={onCommand} />)
  fireEvent.change(screen.getByLabelText('Controlled item'), { target: { value: id(1) } })
  fireEvent.change(screen.getByLabelText('Product type'), { target: { value: 'SAMPLE bolt' } })
  fireEvent.change(screen.getByLabelText('Nominal diameter (mm)'), { target: { value: '8.000001' } })
  fireEvent.change(screen.getByLabelText('Specification evidence'), { target: { value: 'SAMPLE measured' } })
  await act(async () => fireEvent.submit(screen.getByRole('button', { name: 'Record specification draft' }).closest('form')!))
  expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ diameter_mm: '8.000001', length_mm: null }) }))
  expect(screen.getByLabelText('Nominal diameter (mm)')).toHaveValue('8.000001')
  expect(screen.getByRole('alert')).toHaveTextContent('could not be confirmed')
})
it('locks pending forms, blocks offline commands and keeps readers read-only', () => {
  const { rerender } = render(<ItemControlsPanel {...props} />)
  fireEvent.change(screen.getByLabelText('Controlled item'), { target: { value: id(1) } })
  rerender(<ItemControlsPanel {...props} busy />)
  expect(screen.getByLabelText('Product type')).toBeDisabled()
  rerender(<ItemControlsPanel {...props} online={false} />)
  expect(screen.getByRole('button', { name: 'Record specification draft' })).toBeDisabled()
  rerender(<ItemControlsPanel {...props} permissions={['item_controls.read']} />)
  expect(screen.queryByRole('button', { name: 'Record specification draft' })).not.toBeInTheDocument()
})
it('offers only approved bases for the exact item and explains stale selections', () => {
  const basis: UnitConversion = { id: id(2), company_id: id(3), item_id: id(1), version: 1, status: 'approved', evidence: 'SAMPLE counted box', retirement_reason: null, from_uom: 'box', to_uom: 'pcs', from_quantity: '1', to_quantity: '10' }
  render(<UnitConversionSelect label="Receipt quantity unit" itemId={id(1)} baseUnit="pcs" conversions={[basis, { ...basis, id: id(4), item_id: id(9) }, { ...basis, id: id(5), status: 'retired' }]} value={id(5)} onChange={vi.fn()} />)
  expect(screen.getByLabelText('Receipt quantity unit').children).toHaveLength(2)
  expect(screen.getByRole('alert')).toHaveTextContent('unavailable or retired')
})
