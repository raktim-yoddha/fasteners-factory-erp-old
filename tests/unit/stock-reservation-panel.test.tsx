// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { StockActionsPanel } from '@/features/stock/StockActionsPanel'

describe('StockActionsPanel reservation', () => {
  it('only submits a matching released lot with the current sales-order revision', () => {
    const onReserve = vi.fn(async () => undefined)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099')
    render(<StockActionsPanel companyId="00000000-0000-4000-8000-000000000001" options={{ plants: [], warehouses: [], items: [], locations: [] }} lots={[{ id: '00000000-0000-4000-8000-000000000003', item_id: '00000000-0000-4000-8000-000000000004', lot_code: 'LOT-001', qc_status: 'released', revision: 1 }]} records={{ rfqs: [], quotations: [], salesOrders: [{ id: '00000000-0000-4000-8000-000000000005', sales_order_number: 'SO-001', status: 'open', revision: 2 }], salesOrderLines: [{ id: '00000000-0000-4000-8000-000000000006', sales_order_id: '00000000-0000-4000-8000-000000000005', item_id: '00000000-0000-4000-8000-000000000004', ordered_quantity: 10, uom: 'pcs' }] }} receiving={false} releasing={false} reserving={false} onReceive={vi.fn(async () => undefined)} onRelease={vi.fn(async () => undefined)} onReserve={onReserve} />)
    fireEvent.change(screen.getByLabelText('Sales-order line'), { target: { value: '00000000-0000-4000-8000-000000000006' } })
    fireEvent.change(screen.getByLabelText('Released lot'), { target: { value: '00000000-0000-4000-8000-000000000003' } })
    fireEvent.change(screen.getAllByLabelText('Quantity')[1]!, { target: { value: '5' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Reserve stock' }).closest('form')!)
    expect(onReserve).toHaveBeenCalledWith(expect.objectContaining({ salesOrderLineId: '00000000-0000-4000-8000-000000000006', lotId: '00000000-0000-4000-8000-000000000003', expectedSalesOrderRevision: 2, quantity: '5' }))
  })

  it('disables critical stock writes while offline', () => {
    const view = render(<StockActionsPanel companyId="00000000-0000-4000-8000-000000000001" online={false} options={{ plants: [], warehouses: [], items: [], locations: [] }} lots={[]} records={{ rfqs: [], quotations: [], salesOrders: [], salesOrderLines: [] }} receiving={false} releasing={false} reserving={false} onReceive={vi.fn(async () => undefined)} onRelease={vi.fn(async () => undefined)} onReserve={vi.fn(async () => undefined)} />)

    const scoped = within(view.container)
    expect(scoped.getByRole('alert')).toHaveTextContent('Blocked because this device is offline')
    expect(scoped.getByRole('button', { name: 'Record receipt' })).toBeDisabled()
    expect(scoped.getByRole('button', { name: 'Reserve stock' })).toBeDisabled()
  })
})
