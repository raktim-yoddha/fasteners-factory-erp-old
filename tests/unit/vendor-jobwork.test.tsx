// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VendorJobworkPanel } from '@/features/jobwork/VendorJobworkPanel'
import { vendorCommandSchema, type VendorWorkspace } from '@/features/jobwork/useVendorJobwork'

afterEach(cleanup)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const order = {
  id: id(1), number: 'SAMPLE-VENDOR', supplier_id: id(2), source_lot_id: id(3), item_id: id(4),
  process: 'SAMPLE finish', due_date: '2026-10-20', status: 'open' as const, revision: 2,
  quantity: '6.000000', uom: 'kg' as const, sent_quantity: '4.000000', returned_quantity: '0.000000',
  loss_quantity: '0.000000', at_vendor_quantity: '4.000000', remaining_to_send: '2.000000', cancelled_unsent_quantity: '0.000000', close_reason: null,
}
const data: VendorWorkspace = { orders: [order], events: [] }
const props = {
  companyId: id(5), data, suppliers: [{ id: id(2), code: 'SAMPLE-P', name: 'SAMPLE processor' }],
  lots: [{ id: id(3), item_id: id(4), lot_code: 'SAMPLE-LOT', qc_status: 'released' as const, revision: 3 }], positions: [],
  options: { plants: [], warehouses: [], locations: [], items: [{ id: id(4), sku: 'SAMPLE-WIRE', description: 'SAMPLE wire', base_uom: 'kg' as const }] },
  permissions: ['jobwork.read', 'jobwork.manage', 'jobwork.review', 'stock.issue', 'stock.receive'],
  online: true, busy: false, loading: false, error: false, onCommand: vi.fn(async () => id(99)),
}
function selectOrder(step: string) {
  fireEvent.click(screen.getByRole('button', { name: step }))
  fireEvent.change(screen.getByLabelText('Vendor order'), { target: { value: order.id } })
}

it('shows actual custody and blocks closure with stock still at the vendor', () => {
  render(<VendorJobworkPanel {...props} />)
  selectOrder('Close vendor order')
  expect(screen.getByLabelText('Selected vendor custody')).toHaveTextContent('At vendor 4.000000 kg')
  expect(screen.getByRole('button', { name: 'Close reconciled vendor order' })).toBeDisabled()
  expect(screen.getByText(/Blocked because quantities remain at the vendor/)).toBeInTheDocument()
})

it('requires a separate loss-review permission and retains a held-lot send blocker', () => {
  const { rerender } = render(<VendorJobworkPanel {...props} permissions={['jobwork.read', 'jobwork.manage', 'stock.issue']} />)
  selectOrder('Review vendor loss')
  expect(screen.getByRole('button', { name: 'Record confirmed vendor loss' })).toBeDisabled()
  expect(screen.getByText(/authorized quality reviewer/)).toBeInTheDocument()
  rerender(<VendorJobworkPanel {...props} lots={[{ ...props.lots[0]!, qc_status: 'hold' }]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Send to vendor' }))
  expect(screen.getByRole('button', { name: 'Confirm vendor send' })).toBeDisabled()
  expect(screen.getByText(/source lot is on QC hold/)).toBeInTheDocument()
})

it('does not grant a planner stock movement rights and blocks offline movement', () => {
  const { rerender } = render(<VendorJobworkPanel {...props} permissions={['jobwork.read', 'jobwork.manage']} />)
  selectOrder('Send to vendor')
  expect(screen.getByRole('button', { name: 'Confirm vendor send' })).toBeDisabled()
  rerender(<VendorJobworkPanel {...props} online={false} />)
  expect(screen.getByRole('button', { name: 'Confirm vendor send' })).toBeDisabled()
})

it('waits for confirmation and sends exact quantity, source revision and movement reference', async () => {
  let confirm!: (value: string) => void
  const onCommand = vi.fn(() => new Promise<string>((resolve) => { confirm = resolve }))
  render(<VendorJobworkPanel {...props} onCommand={onCommand} />)
  selectOrder('Send to vendor')
  for (const [label, value] of [['Vendor movement quantity', '0.000001'], ['Vendor movement reference', 'SAMPLE transfer'], ['Vendor action reason', 'SAMPLE custody']] as const)
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.submit(screen.getByRole('button', { name: 'Confirm vendor send' }).closest('form')!)
  expect(onCommand).toHaveBeenCalledWith({ action: 'send', data: {
    order_id: order.id, revision: 2, lot_revision: 3, quantity: '0.000001', uom: 'kg', reference: 'SAMPLE transfer', reason: 'SAMPLE custody',
  } })
  expect(screen.queryByText(/Vendor send confirmed/)).not.toBeInTheDocument()
  await act(async () => confirm(id(99)))
  expect(screen.getByRole('status')).toHaveTextContent('Vendor send confirmed.')
})

it('keeps unsent cancellation explicit and preserves failed operator input', async () => {
  const reconciled = { ...data, orders: [{ ...order, returned_quantity: '4', at_vendor_quantity: '0' }] }
  const onCommand = vi.fn().mockRejectedValue(new Error('VENDOR_UNSENT_BALANCE'))
  render(<VendorJobworkPanel {...props} data={reconciled} onCommand={onCommand} />)
  selectOrder('Close vendor order')
  const checkbox = screen.getByRole('checkbox', { name: /Explicitly cancel the unsent balance/ })
  expect(checkbox).toBeRequired()
  fireEvent.change(screen.getByLabelText('Vendor action reason'), { target: { value: 'SAMPLE finish and cancel remainder' } })
  await act(async () => fireEvent.submit(screen.getByRole('button', { name: 'Close reconciled vendor order' }).closest('form')!))
  expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancel_unsent: false }) }))
  expect(screen.getByRole('alert')).toHaveTextContent('unsent balance remains')
  expect(screen.getByLabelText('Vendor action reason')).toHaveValue('SAMPLE finish and cancel remainder')
})

it('rejects rounded or negative custody quantities and requires a revision and source revision', () => {
  const send = { action: 'send', data: { order_id: order.id, revision: 2, lot_revision: 3, quantity: '1.123456', uom: 'kg', reference: 'SAMPLE', reason: 'SAMPLE' } }
  expect(vendorCommandSchema.parse(send).data).toMatchObject({ quantity: '1.123456' })
  for (const changes of [{ quantity: '1.0000001' }, { quantity: '-1' }, { revision: null }, { lot_revision: undefined }, { uom: 'g' }])
    expect(vendorCommandSchema.safeParse({ ...send, data: { ...send.data, ...changes } }).success).toBe(false)
})
