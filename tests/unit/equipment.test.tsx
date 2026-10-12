// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EquipmentPanel } from '@/features/equipment/EquipmentPanel'
import { CapacityPanel } from '@/features/equipment/CapacityPanel'
import { emptyEquipment, equipmentCommandSchema } from '@/features/equipment/useEquipment'

afterEach(cleanup)
const id=(n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const asset={ id: id(1), code: 'SAMPLE-GAUGE', name: 'SAMPLE gauge', kind: 'gauge' as const, work_centre_id: null, requires_maintenance: false, blocked_reason: 'Calibration evidence is missing.' }
const data={ ...emptyEquipment, assets: [asset] }
const props={ data, disabled: false, permissions: ['equipment.manage','equipment.calibrate','planning.manage'], onCommand: vi.fn() }
it('requires calibration evidence, ordered dates, reasons and exact planning precision', () => {
  const input={ action: 'calibration', data: { asset_id: id(1), checked_on: '2026-10-01', next_due: '2026-10-31', passed: true, reference: 'SAMPLE certificate', reason: 'SAMPLE checked' } }
  expect(equipmentCommandSchema.safeParse(input).success).toBe(true)
  expect(equipmentCommandSchema.safeParse({ ...input,data: { ...input.data,next_due: '2026-09-01' } }).success).toBe(false)
  expect(equipmentCommandSchema.safeParse({ ...input,data: { ...input.data,reference: '' } }).success).toBe(false)
  expect(equipmentCommandSchema.safeParse({ action: 'allocate',data: { shift_id: id(2),job_card_id: id(3),minutes: '0.001',reason: 'SAMPLE' } }).success).toBe(false)
})
it('shows the real blocking reason and preserves evidence when confirmation fails', async () => {
  const onCommand=vi.fn().mockRejectedValue(new Error('SAMPLE interrupted'))
  render(<EquipmentPanel {...props} onCommand={onCommand} />)
  fireEvent.change(screen.getByLabelText('Selected equipment'),{ target: { value: id(1) } })
  expect(screen.getByRole('status')).toHaveTextContent('Blocked because Calibration evidence is missing.')
  fireEvent.change(screen.getByLabelText('Next due date'),{ target: { value: '2027-01-01' } })
  fireEvent.change(screen.getByLabelText('Evidence reference'),{ target: { value: 'SAMPLE signed certificate' } })
  fireEvent.change(screen.getByLabelText('Equipment evidence reason'),{ target: { value: 'SAMPLE verified' } })
  await act(async () => fireEvent.submit(screen.getByRole('button',{ name: 'Record equipment evidence' }).closest('form')!))
  expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ action: 'calibration',data: expect.objectContaining({ reference: 'SAMPLE signed certificate' }) }))
  expect(screen.getByLabelText('Evidence reference')).toHaveValue('SAMPLE signed certificate')
  expect(screen.getByRole('status')).not.toHaveTextContent('Ready under recorded checks')
})
it('keeps readers read-only and disables commands while offline or busy', () => {
  const { rerender }=render(<EquipmentPanel {...props} disabled />)
  expect(screen.getByRole('button',{ name: 'Register equipment' })).toBeDisabled()
  expect(screen.getByLabelText('Equipment code')).toBeDisabled()
  rerender(<EquipmentPanel {...props} permissions={['equipment.read']} />)
  expect(screen.queryByRole('button',{ name: 'Register equipment' })).not.toBeInTheDocument()
})
it('shows unconfigured capacity without guessing a shift, and blocks cancelling allocated shifts', () => {
  const { rerender }=render(<CapacityPanel {...props} />)
  expect(screen.getByText(/Capacity is unconfigured/)).toBeInTheDocument()
  rerender(<CapacityPanel {...props} data={{ ...data,shifts: [{ id: id(2),work_centre_id: id(3),label: 'SAMPLE shift', starts_at: '2026-10-12T03:30:00Z',ends_at: '2026-10-12T11:30:00Z',break_minutes: 30,status: 'active',available_minutes: '450',allocated_minutes: '12.50' }] }} />)
  expect(screen.getByText(/450 min capacity · 12.5 min allocated/)).toBeInTheDocument()
  expect(screen.getByRole('button',{ name: 'Cancel capacity shift' })).toBeDisabled()
})
