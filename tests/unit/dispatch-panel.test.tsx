// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { DispatchPanel } from '@/features/dispatch/DispatchPanel'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('DispatchPanel', () => {
  it('prepares a shipment with the current sales-order revision', () => {
    const onPrepare = vi.fn(async () => undefined)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099')
    render(<DispatchPanel companyId="00000000-0000-4000-8000-000000000001" commercial={{ rfqs: [], quotations: [], salesOrders: [{ id: '00000000-0000-4000-8000-000000000002', sales_order_number: 'SO-001', status: 'open', revision: 4 }], salesOrderLines: [{ id: '00000000-0000-4000-8000-000000000003', sales_order_id: '00000000-0000-4000-8000-000000000002', item_id: '00000000-0000-4000-8000-000000000004', ordered_quantity: 10, uom: 'pcs' }] }} dispatchRecords={{ reservations: [{ id: '00000000-0000-4000-8000-000000000005', sales_order_line_id: '00000000-0000-4000-8000-000000000003', lot_id: '00000000-0000-4000-8000-000000000006', quantity: 10, consumed_quantity: 4, remaining_quantity: '6.000000', status: 'active' }], shipments: [] }} busy={false} onPrepare={onPrepare} onDispatch={vi.fn(async () => undefined)} />)
    fireEvent.change(screen.getByLabelText('Sales order'), { target: { value: '00000000-0000-4000-8000-000000000002' } })
    fireEvent.change(screen.getByLabelText('Active reservation'), { target: { value: '00000000-0000-4000-8000-000000000005' } })
    fireEvent.change(screen.getByLabelText('Packing number'), { target: { value: 'PACK-001' } })
    fireEvent.change(screen.getByLabelText('Shipment number'), { target: { value: 'SHIP-001' } })
    fireEvent.change(screen.getByLabelText('Packed quantity'), { target: { value: '10' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Prepare shipment' }).closest('form')!)
    expect(onPrepare).toHaveBeenCalledWith(expect.objectContaining({ salesOrderId: '00000000-0000-4000-8000-000000000002', reservationId: '00000000-0000-4000-8000-000000000005', expectedSalesOrderRevision: 4, quantity: '10' }))
  })

  it('disables packing and dispatch while offline', () => {
    const view = render(<DispatchPanel companyId="00000000-0000-4000-8000-000000000001" online={false} commercial={{ rfqs: [], quotations: [], salesOrders: [], salesOrderLines: [] }} dispatchRecords={{ reservations: [], shipments: [] }} busy={false} onPrepare={vi.fn(async () => undefined)} onDispatch={vi.fn(async () => undefined)} />)

    const scoped = within(view.container)
    expect(scoped.getByRole('alert')).toHaveTextContent('Blocked because this device is offline')
    expect(scoped.getByRole('button', { name: 'Prepare shipment' })).toBeDisabled()
    expect(scoped.getByRole('button', { name: 'Dispatch shipment' })).toBeDisabled()
  })
  it('cancels only the selected prepared shipment after server confirmation with its revision and reason', async () => {
    let confirm!: () => void
    const onCancel = vi.fn(() => new Promise<void>((resolve) => { confirm = resolve }))
    render(<DispatchPanel companyId="00000000-0000-4000-8000-000000000001" permissions={['dispatch.manage']}
      commercial={{rfqs:[],quotations:[],salesOrders:[],salesOrderLines:[]}}
      dispatchRecords={{reservations:[],shipments:[{id:'00000000-0000-4000-8000-000000000010',shipment_number:'SAMPLE-SHIP',status:'draft',revision:3}]}}
      busy={false} onCancel={onCancel} onPrepare={vi.fn()} onDispatch={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Shipment to cancel'), {target:{value:'00000000-0000-4000-8000-000000000010'}})
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {target:{value:'SAMPLE NCR containment'}})
    fireEvent.submit(screen.getByRole('button',{name:'Cancel prepared shipment'}).closest('form')!)
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({shipmentId:'00000000-0000-4000-8000-000000000010',expectedShipmentRevision:3,reason:'SAMPLE NCR containment'}))
    expect(screen.queryByText(/Prepared shipment cancelled/)).not.toBeInTheDocument()
    await act(async () => {confirm()})
    expect(screen.getByRole('status')).toHaveTextContent('Prepared shipment cancelled. Its reservations remain allocated')
  })

  it('blocks cancellation without dispatch permission', () => {
    const onCancel = vi.fn()
    render(<DispatchPanel companyId="00000000-0000-4000-8000-000000000001" permissions={[]}
      commercial={{rfqs:[],quotations:[],salesOrders:[],salesOrderLines:[]}}
      dispatchRecords={{reservations:[],shipments:[{id:'00000000-0000-4000-8000-000000000010',shipment_number:'SAMPLE-SHIP',status:'draft',revision:3}]}}
      busy={false} onCancel={onCancel} onPrepare={vi.fn()} onDispatch={vi.fn()} />)
    const button=screen.getByRole('button',{name:'Cancel prepared shipment'})
    expect(button).toBeDisabled()
    fireEvent.submit(button.closest('form')!)
    expect(onCancel).not.toHaveBeenCalled()
  })

})
