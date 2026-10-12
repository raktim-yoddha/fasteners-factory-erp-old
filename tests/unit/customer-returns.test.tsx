// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerReturnsPanel } from '@/features/dispatch/CustomerReturnsPanel'
import { customerReturnSchema } from '@/features/dispatch/useCustomerReturns'
import type { CustomerReturnWorkspace } from '@/features/dispatch/useCustomerReturns'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
afterEach(cleanup)
const data: CustomerReturnWorkspace = { shipments: [{ id: id(1), shipment_number: 'SAMPLE-SHIP', shipment_revision: 2,
  sales_order_number: 'SAMPLE-SO', customer_name: 'SAMPLE customer', item_id: id(2), sku: 'SAMPLE-ITEM',
  source_lot_id: id(3), source_lot_code: 'SAMPLE-SOURCE', shipped_quantity: '6.000000', returned_quantity: '2.000000', returnable_quantity: '4.000000', uom: 'pcs' }], receipts: [] }
const props = { companyId: id(4), data, options: { plants: [], warehouses: [], items: [], locations: [{ id: id(5), warehouse_id: id(6), code: 'SAMPLE-L', name: 'SAMPLE receiving' }] },
  permissions: ['customer_returns.receive'], online: true, busy: false, loading: false, error: false, onReceive: vi.fn().mockResolvedValue(id(7)) }
function selectAndFill() {
  fireEvent.change(screen.getByLabelText('Dispatched shipment line'), { target: { value: id(1) } })
  for (const [label, value] of [['Customer return number', 'SAMPLE-RET'], ['Returned stock lot code', 'SAMPLE-LOT'], ['Customer return quantity', '0.000001'], ['Return receiving location', id(5)], ['Customer return reference', 'SAMPLE note'], ['Customer return reason', 'SAMPLE condition']] as const)
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
describe('customer return custody', () => {
  it('shows original and return balances and blocks offline, unauthorized, exhausted and failed reads', () => {
    const { rerender } = render(<CustomerReturnsPanel {...props} />)
    selectAndFill()
    expect(screen.getByLabelText('Customer return balance')).toHaveTextContent('Returnable 4.000000 pcs')
    for (const changes of [{ online: false }, { permissions: [] }, { error: true }, { data: { ...data, shipments: [{ ...data.shipments[0]!, returnable_quantity: '0.000000' }] } }]) {
      rerender(<CustomerReturnsPanel {...props} {...changes} />)
      expect(screen.getByRole('button', { name: 'Receive customer return' })).toBeDisabled()
    }
  })
  it('waits for server confirmation and preserves exact units and shipment revision', async () => {
    let confirm!: (value: string) => void
    const onReceive = vi.fn(() => new Promise<string>((resolve) => { confirm = resolve }))
    render(<CustomerReturnsPanel {...props} onReceive={onReceive} />)
    selectAndFill()
    fireEvent.submit(screen.getByRole('button', { name: 'Receive customer return' }).closest('form')!)
    expect(onReceive).toHaveBeenCalledWith({ shipment_line_id: id(1), shipment_revision: 2, location_id: id(5), return_number: 'SAMPLE-RET', lot_code: 'SAMPLE-LOT', quantity: '0.000001', uom: 'pcs', reference: 'SAMPLE note', reason: 'SAMPLE condition' })
    expect(screen.queryByText(/Customer return received/)).not.toBeInTheDocument()
    await act(async () => confirm(id(7)))
    expect(screen.getByRole('status')).toHaveTextContent('Customer return received into QC hold.')
  })
  it('keeps received quantity and reference after a rejected return', async () => {
    render(<CustomerReturnsPanel {...props} onReceive={vi.fn().mockRejectedValue(new Error('CUSTOMER_RETURN_QUANTITY_EXCEEDED'))} />)
    selectAndFill()
    await act(async () => fireEvent.submit(screen.getByRole('button', { name: 'Receive customer return' }).closest('form')!))
    expect(screen.getByRole('alert')).toHaveTextContent('original shipped quantity')
    expect(screen.getByLabelText('Customer return quantity')).toHaveValue('0.000001')
    expect(screen.getByLabelText('Customer return reference')).toHaveValue('SAMPLE note')
  })
  it('rejects rounded, unsigned invalid or incomplete receipt input', () => {
    const valid = { shipment_line_id: id(1), shipment_revision: 2, location_id: id(5), return_number: 'sample-ret', lot_code: 'sample-lot', quantity: '0.000001', uom: 'pcs', reference: 'SAMPLE', reason: 'SAMPLE' }
    expect(customerReturnSchema.parse(valid)).toMatchObject({ return_number: 'SAMPLE-RET', quantity: '0.000001' })
    for (const change of [{ quantity: '1.1234567' }, { quantity: '-1' }, { quantity: 'NaN' }, { shipment_revision: null }, { reference: '' }])
      expect(customerReturnSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })
})
