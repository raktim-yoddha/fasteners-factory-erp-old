// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ShipmentPackagesPanel } from '@/features/dispatch/ShipmentPackagesPanel'
import { shipmentPackageSchema } from '@/features/dispatch/useShipmentPackages'
import type { PackingWorkspace } from '@/features/dispatch/useShipmentPackages'

afterEach(cleanup)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const data: PackingWorkspace = { lines: [{ id: id(1), shipment_id: id(2), shipment_number: 'SAMPLE-SHIP', shipment_revision: 2, status: 'draft',
  lot_id: id(3), lot_code: 'SAMPLE-LOT', sku: 'SAMPLE-ITEM', quantity: '6.000000', uom: 'pcs', packaged_quantity: '2.000000', remaining_quantity: '4.000000' }],
  packages: [{ id: id(4), shipment_line_id: id(1), package_code: 'SAMPLE-BOX', quantity: '2.000000', uom: 'pcs', created_at: '2026-10-11T00:00:00Z' }] }
const props = { companyId: id(5), data, permissions: ['dispatch.manage'], online: true, busy: false, loading: false, error: false, onAdd: vi.fn().mockResolvedValue(id(6)), onPrint: vi.fn() }
function selectLine() { fireEvent.change(screen.getByLabelText('Package shipment line'), { target: { value: id(1) } }) }
it('preserves exact quantity and revision and waits for package confirmation', async () => {
  let confirm!: (value: string) => void
  const onAdd = vi.fn(() => new Promise<string>((resolve) => { confirm = resolve }))
  render(<ShipmentPackagesPanel {...props} onAdd={onAdd} />)
  selectLine()
  fireEvent.change(screen.getByLabelText('Package code'), { target: { value: 'SAMPLE-NEXT' } })
  fireEvent.change(screen.getByLabelText('Package quantity'), { target: { value: '0.000001' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Record package contents' }).closest('form')!)
  expect(onAdd).toHaveBeenCalledWith({ shipment_line_id: id(1), shipment_revision: 2, quantity: '0.000001', uom: 'pcs', package_code: 'SAMPLE-NEXT' })
  expect(screen.queryByText(/Package contents confirmed/)).not.toBeInTheDocument()
  await act(async () => confirm(id(6)))
  expect(screen.getByRole('status')).toHaveTextContent('Package contents confirmed.')
})
it('blocks offline or unauthorized edits, complete coverage and posted shipment changes', () => {
  const { rerender } = render(<ShipmentPackagesPanel {...props} />)
  selectLine()
  for (const change of [{ online: false }, { permissions: [] }, { error: true }, { data: { ...data, lines: [{ ...data.lines[0]!, remaining_quantity: '0.000000' }] } }, { data: { ...data, lines: [{ ...data.lines[0]!, status: 'dispatched' as const }] } }]) {
    rerender(<ShipmentPackagesPanel {...props} {...change} />)
    expect(screen.getByRole('button', { name: 'Record package contents' })).toBeDisabled()
  }
})
it('prints confirmed contents, marks cancelled labels void, and preserves rejected input', async () => {
  const onPrint = vi.fn()
  const { rerender } = render(<ShipmentPackagesPanel {...props} onPrint={onPrint} onAdd={vi.fn().mockRejectedValue(new Error('PACKAGE_QUANTITY_EXCEEDED'))} />)
  selectLine()
  expect(screen.getByLabelText('Selected package labels')).toHaveTextContent('Lot SAMPLE-LOT')
  expect(screen.getByLabelText('Selected package labels')).toHaveTextContent('Quantity 2.000000 pcs')
  fireEvent.click(screen.getByRole('button', { name: 'Print selected package labels' }))
  expect(onPrint).toHaveBeenCalledOnce()
  fireEvent.change(screen.getByLabelText('Package code'), { target: { value: 'SAMPLE-NEXT' } })
  fireEvent.change(screen.getByLabelText('Package quantity'), { target: { value: '5' } })
  await act(async () => fireEvent.submit(screen.getByRole('button', { name: 'Record package contents' }).closest('form')!))
  expect(screen.getByRole('alert')).toHaveTextContent('packed quantity still available')
  expect(screen.getByLabelText('Package quantity')).toHaveValue('5')
  rerender(<ShipmentPackagesPanel {...props} data={{ ...data, lines: [{ ...data.lines[0]!, status: 'cancelled' }] }} />)
  expect(screen.getByRole('button', { name: 'Print selected package labels' })).toBeDisabled()
  expect(screen.getByLabelText('Selected package labels')).toHaveTextContent('VOID · SAMPLE-BOX')
})
it('rejects rounded package quantities and missing shipment revisions', () => {
  const input = { shipment_line_id: id(1), shipment_revision: 2, quantity: '1.000001', uom: 'pcs', package_code: 'sample-box' }
  expect(shipmentPackageSchema.parse(input)).toMatchObject({ package_code: 'SAMPLE-BOX', quantity: '1.000001' })
  expect(shipmentPackageSchema.safeParse({ ...input, quantity: '0.0000001' }).success).toBe(false)
  expect(shipmentPackageSchema.safeParse({ ...input, shipment_revision: null }).success).toBe(false)
})
